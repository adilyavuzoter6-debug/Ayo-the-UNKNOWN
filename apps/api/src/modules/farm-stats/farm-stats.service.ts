import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { FcrCalculationService } from "../batch-performance/fcr-calculation.service";
import { SgrCalculationService } from "../batch-performance/sgr-calculation.service";

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfTomorrow(): Date {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

const FORECAST_MONTHS_AHEAD = 12;
const FORECAST_LOOKBACK_DAYS = 30;
const DEFAULT_BUCKET_WIDTH_G = 50;

interface WeightForecastBucket {
  startG: number;
  endG: number;
  fishCount: number;
  biomassKg: number;
  batchCount: number;
}

export interface WeightForecastMonth {
  monthsAhead: number;
  totalCount: number;
  totalBiomassKg: number;
  buckets: WeightForecastBucket[];
}

export interface WeightForecastResult {
  bucketWidthG: number;
  dailyMortalityRatePct: number;
  totalActiveBatches: number;
  batchesWithGrowthData: number;
  months: WeightForecastMonth[];
}

@Injectable()
export class FarmStatsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly fcrService: FcrCalculationService,
    private readonly sgrService: SgrCalculationService,
  ) {}

  /**
   * Every farm in the company paired with its stock summary, in one response — replaces the
   * farms page's list request followed by one stock-summary request per farm.
   */
  async getFarmsOverview(companyId: string) {
    const farms = await this.tenantPrisma.forTenant(companyId).farm.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const summaries = await Promise.all(
      farms.map((farm) => this.getStockSummary(companyId, farm.id)),
    );
    return farms.map((farm, index) => ({ farm, summary: summaries[index] }));
  }

  /**
   * Replaces the frontend's old `mockFarmStats()` placeholder with real aggregates:
   * facility/pool counts come straight from FarmSection/Tank rows, fish/biomass are derived
   * from the fish-batch movement ledger's BatchTankState/BatchCurrentState projections (see
   * AlertsService.evaluateBiomassRule for the same derivation used to trigger capacity
   * alerts), feed is today's FeedingEvent total (the feeding side of the feed-inventory
   * ledger, not the inventory-balance side — see 09-feed-inventory-ledger.md).
   */
  async getStockSummary(companyId: string, farmId: string) {
    const client = this.tenantPrisma.forTenant(companyId);

    const farm = await client.farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }

    const [facilities, pools, tankStates, todayFeed, openAlertsCount] = await Promise.all([
      client.farmSection.count({ where: { farmId, deletedAt: null } }),
      client.tank.count({ where: { deletedAt: null, farmSection: { farmId } } }),
      client.batchTankState.findMany({
        where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } },
        include: { batch: { include: { currentState: true } } },
      }),
      client.feedingEvent.aggregate({
        where: {
          tank: { farmSection: { farmId } },
          occurredAt: { gte: startOfToday(), lt: startOfTomorrow() },
        },
        _sum: { quantityKg: true },
      }),
      client.alert.count({
        where: { status: "OPEN", OR: [{ farmId }, { tank: { farmSection: { farmId } } }] },
      }),
    ]);

    const fishCount = tankStates.reduce((sum, state) => sum + state.estimatedCount, 0);
    const biomassKg = tankStates.reduce((sum, state) => {
      const avgWeightG = Number(
        state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG,
      );
      return sum + (state.estimatedCount * avgWeightG) / 1000;
    }, 0);

    return {
      facilities,
      pools,
      fishCount,
      biomassKg,
      todayFeedKg: Number(todayFeed._sum.quantityKg ?? 0),
      openAlertsCount,
    };
  }

  /**
   * The 4 MVP-scope KPIs from the task brief's §44 core-five (biomass, FCR, mortality, growth —
   * harvest forecast is explicitly Phase 2, docs/architecture/12-mvp-roadmap.md §12.3), rolled
   * up across every batch currently active in this farm. FCR/SGR reuse the exact engines built
   * in Milestone 5 per-batch (§10.4/§10.5) rather than a separate farm-level formula — "average
   * of each batch's own correctly-computed number", not a new aggregate methodology. A batch
   * with no biomass snapshot yet (recalculate never called) or fewer than two weight samples
   * simply contributes no FCR/SGR value rather than a fabricated one.
   */
  async getDashboardKpis(companyId: string, farmId: string) {
    const client = this.tenantPrisma.forTenant(companyId);

    const farm = await client.farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [tankStates, activeBatches, mortalityAgg, openAlertsCount, todayFeed] = await Promise.all([
      client.batchTankState.findMany({
        where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } },
        include: { batch: { include: { currentState: true } } },
      }),
      client.fishBatch.findMany({
        where: {
          status: "ACTIVE",
          tankStates: { some: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } } },
        },
        select: { id: true },
      }),
      client.mortalityEvent.aggregate({
        where: { tank: { farmSection: { farmId } }, occurredAt: { gte: sevenDaysAgo } },
        _sum: { fishCount: true },
      }),
      client.alert.count({
        where: { status: "OPEN", OR: [{ farmId }, { tank: { farmSection: { farmId } } }] },
      }),
      client.feedingEvent.aggregate({
        where: {
          tank: { farmSection: { farmId } },
          occurredAt: { gte: startOfToday(), lt: startOfTomorrow() },
        },
        _sum: { quantityKg: true },
      }),
    ]);

    const fishCount = tankStates.reduce((sum, state) => sum + state.estimatedCount, 0);
    const biomassKg = tankStates.reduce((sum, state) => {
      const avgWeightG = Number(
        state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG,
      );
      return sum + (state.estimatedCount * avgWeightG) / 1000;
    }, 0);
    const mortalityRate7dPct =
      fishCount > 0 ? (Number(mortalityAgg._sum.fishCount ?? 0) / fishCount) * 100 : 0;

    const fcrResults = await Promise.all(
      activeBatches.map((b) =>
        this.fcrService.calculate(companyId, b.id, thirtyDaysAgo, now).catch(() => null),
      ),
    );
    const fcrValues = fcrResults
      .map((r) => r?.fcr)
      .filter((v): v is number => v !== undefined && v !== null);
    const avgFcr = fcrValues.length > 0 ? fcrValues.reduce((a, b) => a + b, 0) / fcrValues.length : null;

    const sgrSeries = await Promise.all(
      activeBatches.map((b) => this.sgrService.calculateSeries(companyId, b.id)),
    );
    const latestSgrValues = sgrSeries
      .map((series) => series.at(-1)?.sgrPctPerDay)
      .filter((v): v is number => v !== undefined);
    const avgSgrPctPerDay =
      latestSgrValues.length > 0
        ? latestSgrValues.reduce((a, b) => a + b, 0) / latestSgrValues.length
        : null;

    return {
      biomassKg,
      fishCount,
      activeBatchesCount: activeBatches.length,
      avgFcr,
      avgSgrPctPerDay,
      mortalityRate7dPct,
      todayFeedKg: Number(todayFeed._sum.quantityKg ?? 0),
      openAlertsCount,
    };
  }

  /**
   * Projects the farm's live stock forward month by month, bucketed into gram ranges — the same
   * idea as the Tahmin tab's count-only projection (extrapolate the last 30 days forward), extended
   * with a per-batch weight trajectory. A batch's growth isn't driven by a manually-set target FCR
   * (as of this writing essentially no batch has one — see Treatment/FCR feature) nor by
   * FcrCalculationService's BiomassSnapshot-based methodology (equally sparse here — only 2 of 200+
   * active batches have ever had one recorded). Instead each batch's OWN realized FCR is derived
   * straight from data every stocked batch already has: all feed it's ever been fed, divided by how
   * much biomass it has gained since stocking (current biomass − initial biomass). That realized FCR
   * then converts the batch's own historical average daily feed rate into a daily per-fish weight
   * gain, held constant going forward — "if this batch keeps growing the way it has so far". A batch
   * with no feed logged, or no net biomass gain yet, contributes zero growth (flat weight) rather
   * than a guessed rate; it's still counted (and still loses fish to the mortality curve), just
   * doesn't move gram ranges on its own.
   */
  async getWeightForecast(companyId: string, farmId: string, bucketWidthG: number) {
    const client = this.tenantPrisma.forTenant(companyId);
    const farm = await client.farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    const width = bucketWidthG > 0 ? bucketWidthG : DEFAULT_BUCKET_WIDTH_G;

    const now = new Date();
    const lookbackCutoff = new Date(now);
    lookbackCutoff.setDate(lookbackCutoff.getDate() - FORECAST_LOOKBACK_DAYS);

    const tankStates = await client.batchTankState.findMany({
      where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } },
      include: { batch: { include: { currentState: true } } },
    });

    // One batch can be split across tanks; roll each batch up to its farm-wide totals before
    // projecting — the projection operates per batch, not per tank allocation.
    const perBatch = new Map<
      string,
      { count: number; avgWeightG: number; initialCount: number; initialAvgWeightG: number; farmEntryDate: Date }
    >();
    for (const state of tankStates) {
      const existing = perBatch.get(state.batchId);
      if (existing) {
        existing.count += state.estimatedCount;
        continue;
      }
      perBatch.set(state.batchId, {
        count: state.estimatedCount,
        avgWeightG: Number(state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG),
        initialCount: state.batch.initialCount,
        initialAvgWeightG: Number(state.batch.initialAvgWeightG),
        farmEntryDate: state.batch.farmEntryDate,
      });
    }

    const batchIds = [...perBatch.keys()];
    const [feedAgg, mortalityAgg] = await Promise.all([
      client.feedingEvent.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds } },
        _sum: { quantityKg: true },
      }),
      client.mortalityEvent.aggregate({
        where: { tank: { farmSection: { farmId } }, occurredAt: { gte: lookbackCutoff } },
        _sum: { fishCount: true },
      }),
    ]);
    const feedByBatch = new Map(feedAgg.map((f) => [f.batchId, Number(f._sum.quantityKg ?? 0)]));

    const totalCount = [...perBatch.values()].reduce((sum, b) => sum + b.count, 0);
    const recentMortality = Number(mortalityAgg._sum.fishCount ?? 0);
    const dailyMortalityRate = totalCount > 0 ? recentMortality / (totalCount * FORECAST_LOOKBACK_DAYS) : 0;

    let batchesWithGrowthData = 0;
    const projected = batchIds.map((batchId) => {
      const b = perBatch.get(batchId)!;
      const totalFeedKg = feedByBatch.get(batchId) ?? 0;
      const currentBiomassKg = (b.count * b.avgWeightG) / 1000;
      const initialBiomassKg = (b.initialCount * b.initialAvgWeightG) / 1000;
      const biomassGainKg = currentBiomassKg - initialBiomassKg;
      const daysSinceStocking = Math.max(1, (now.getTime() - b.farmEntryDate.getTime()) / 86_400_000);

      let dailyGrowthGPerFish = 0;
      if (totalFeedKg > 0 && biomassGainKg > 0 && b.count > 0) {
        dailyGrowthGPerFish = ((biomassGainKg * 1000) / daysSinceStocking) / b.count;
        batchesWithGrowthData += 1;
      }

      return { avgWeightG: b.avgWeightG, count: b.count, dailyGrowthGPerFish };
    });

    const months: WeightForecastMonth[] = [];
    for (let monthsAhead = 1; monthsAhead <= FORECAST_MONTHS_AHEAD; monthsAhead++) {
      const daysAhead = monthsAhead * 30;
      const buckets = new Map<number, WeightForecastBucket>();
      let monthTotalCount = 0;
      let monthTotalBiomassKg = 0;

      for (const p of projected) {
        const projectedCount = Math.max(0, Math.round(p.count * (1 - dailyMortalityRate) ** daysAhead));
        if (projectedCount === 0) continue;
        const projectedAvgWeightG = p.avgWeightG + p.dailyGrowthGPerFish * daysAhead;
        const biomassKg = (projectedCount * projectedAvgWeightG) / 1000;

        monthTotalCount += projectedCount;
        monthTotalBiomassKg += biomassKg;

        const startG = Math.floor(projectedAvgWeightG / width) * width;
        const bucket = buckets.get(startG) ?? { startG, endG: startG + width, fishCount: 0, biomassKg: 0, batchCount: 0 };
        bucket.fishCount += projectedCount;
        bucket.biomassKg += biomassKg;
        bucket.batchCount += 1;
        buckets.set(startG, bucket);
      }

      months.push({
        monthsAhead,
        totalCount: monthTotalCount,
        totalBiomassKg: monthTotalBiomassKg,
        buckets: [...buckets.values()].sort((a, b) => a.startG - b.startG),
      });
    }

    return {
      bucketWidthG: width,
      dailyMortalityRatePct: dailyMortalityRate * 100,
      totalActiveBatches: batchIds.length,
      batchesWithGrowthData,
      months,
    } satisfies WeightForecastResult;
  }
}
