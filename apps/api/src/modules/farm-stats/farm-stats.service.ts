import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { usableTimeZone } from "../../common/utils/time-zone";
import { FcrCalculationService } from "../batch-performance/fcr-calculation.service";
import { SgrCalculationService } from "../batch-performance/sgr-calculation.service";
import { dailyMeans, degreeDays, fitTgc, growWeight, median, temperatureProfile, type TemperatureProfile } from "./thermal-growth";

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
  /** Expected average water temperature over the month, weighted by fish per farm; null without readings. */
  avgTemperatureC: number | null;
  buckets: WeightForecastBucket[];
}

export interface WeightForecastResult {
  bucketWidthG: number;
  avgFcr: number | null;
  dailyMortalityRatePct: number;
  totalActiveBatches: number;
  /** Grown by temperature (TGC) fitted from the batch's own weighings. */
  batchesWithOwnTgc: number;
  /** Grown by temperature at the median TGC of comparable batches (same species, else all), lacking their own. */
  batchesWithSharedTgc: number;
  batchesWithOwnFcr: number;
  batchesWithAssumedFcr: number;
  batchesFlat: number;
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
   * The farm's last `days` days, one row per local calendar day: feed given, fish lost, fish
   * harvested and the day's average water temperature and oxygen — the dashboard's trend chart.
   * Days with nothing recorded come back as zeros (and null water values), so the chart keeps its
   * gaps visible instead of joining across them.
   */
  async getDailyTrend(companyId: string, farmId: string, days: number) {
    const client = this.tenantPrisma.forTenant(companyId);
    const farm = await client.farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    const span = Math.min(Math.max(Math.round(days) || 30, 7), 90);
    const timeZone = usableTimeZone(farm.timezone);
    const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    const since = new Date(Date.now() - (span + 1) * 86_400_000);
    const inFarm = { tank: { farmSection: { farmId } } };

    const [feeding, mortality, water, harvests] = await Promise.all([
      client.feedingEvent.findMany({
        where: { ...inFarm, occurredAt: { gte: since } },
        select: { occurredAt: true, quantityKg: true },
      }),
      client.mortalityEvent.findMany({
        where: { ...inFarm, occurredAt: { gte: since } },
        select: { occurredAt: true, fishCount: true },
      }),
      client.waterQualityReading.findMany({
        where: { ...inFarm, occurredAt: { gte: since } },
        select: { occurredAt: true, temperatureC: true, dissolvedOxygenMgL: true },
      }),
      client.harvestRecord.findMany({
        where: { ...inFarm, type: "ACTUAL", deletedAt: null, harvestedAt: { gte: since } },
        select: { harvestedAt: true, biomassKg: true },
      }),
    ]);

    const rows = new Map<
      string,
      { date: string; feedKg: number; deaths: number; harvestKg: number; temps: number[]; oxygen: number[] }
    >();
    for (let i = span - 1; i >= 0; i--) {
      const date = dayOf.format(new Date(Date.now() - i * 86_400_000));
      rows.set(date, { date, feedKg: 0, deaths: 0, harvestKg: 0, temps: [], oxygen: [] });
    }
    const row = (at: Date) => rows.get(dayOf.format(at));
    for (const f of feeding) {
      const r = row(f.occurredAt);
      if (r) r.feedKg += Number(f.quantityKg);
    }
    for (const m of mortality) {
      const r = row(m.occurredAt);
      if (r) r.deaths += m.fishCount;
    }
    for (const h of harvests) {
      const r = h.harvestedAt ? row(h.harvestedAt) : undefined;
      if (r) r.harvestKg += Number(h.biomassKg ?? 0);
    }
    for (const w of water) {
      const r = row(w.occurredAt);
      if (!r) continue;
      if (w.temperatureC !== null) r.temps.push(Number(w.temperatureC));
      if (w.dissolvedOxygenMgL !== null) r.oxygen.push(Number(w.dissolvedOxygenMgL));
    }
    const avg = (values: number[]) =>
      values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

    return [...rows.values()].map((r) => ({
      date: r.date,
      feedKg: Math.round(r.feedKg * 10) / 10,
      deaths: r.deaths,
      harvestKg: Math.round(r.harvestKg),
      avgTemperatureC: avg(r.temps),
      avgOxygenMgL: avg(r.oxygen),
    }));
  }

  /**
   * Growth is driven by water temperature where the records allow it (see thermal-growth.ts): each
   * batch's thermal growth coefficient is fitted from its own weighings and the farm's temperature
   * readings, and the coming months' temperatures come from the farm's own monthly averages (a
   * fitted seasonal curve for months it has no readings for). So a batch slows down into winter and
   * speeds up into summer at its own measured pace. A batch without usable weighings borrows the
   * median coefficient of its species in the forecast, else of all its batches. Only when the farm
   * has no temperature readings, or no batch can be fitted, does the feed-based method below apply.
   *
   * Projects the farm's live stock forward month by month, bucketed into gram ranges — the same
   * idea as the Tahmin tab's count-only projection (extrapolate the last 30 days forward), extended
   * with a per-batch weight trajectory. A batch's growth isn't driven by a manually-set target FCR
   * (as of this writing essentially no batch has one — see Treatment/FCR feature) nor by
   * FcrCalculationService's BiomassSnapshot-based methodology (equally sparse here — only 2 of 200+
   * active batches have ever had one recorded). Instead each batch's OWN realized FCR is derived
   * straight from data every stocked batch already has: all feed it's ever been fed, divided by how
   * much biomass it has gained since stocking (current biomass − initial biomass). That realized FCR
   * then converts the batch's own historical average daily feed rate into a daily per-fish weight
   * gain, held constant going forward — "if this batch keeps growing the way it has so far".
   *
   * A batch that has been fed but has no net biomass gain yet (the common case — a real feeding
   * history but no second weighing to measure growth against) can't derive its own FCR, but an
   * optional `avgFcr` fills that gap: its own logged feed rate still drives growth, just divided by
   * the assumed ratio instead of a measured one. Only a batch with literally no feed logged stays
   * flat — there's no rate to apply an FCR to.
   *
   * `farmIds` takes more than one farm so a grow-out pipeline (juveniles stocked at one farm,
   * transferred to another as they size up) can be forecast as a single pool — the primary farm
   * (farmIds[0]) is the one checked for existence/tenancy; a transfer between the given farms
   * doesn't change the combined count or biomass, so combining them is exactly what makes transfer
   * timing a non-issue for the projection instead of something it would otherwise need to model.
   */
  async getWeightForecast(companyId: string, farmIds: string[], bucketWidthG: number, avgFcr: number | null) {
    const client = this.tenantPrisma.forTenant(companyId);
    const farm = await client.farm.findFirst({ where: { id: farmIds[0], deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    const width = bucketWidthG > 0 ? bucketWidthG : DEFAULT_BUCKET_WIDTH_G;

    const now = new Date();
    const lookbackCutoff = new Date(now);
    lookbackCutoff.setDate(lookbackCutoff.getDate() - FORECAST_LOOKBACK_DAYS);

    const tankStates = await client.batchTankState.findMany({
      where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId: { in: farmIds } } } },
      include: {
        batch: { include: { currentState: true } },
        tank: { select: { farmSection: { select: { farmId: true } } } },
      },
    });

    // One batch can be split across tanks; roll each batch up to its farm-wide totals before
    // projecting — the projection operates per batch, not per tank allocation.
    const perBatch = new Map<
      string,
      {
        count: number;
        avgWeightG: number;
        initialCount: number;
        initialAvgWeightG: number;
        farmEntryDate: Date;
        speciesId: string;
        /** Fish per farm, so a batch split across farms takes the temperatures of where most of it is. */
        countByFarm: Map<string, number>;
      }
    >();
    for (const state of tankStates) {
      const farmId = state.tank.farmSection.farmId;
      const existing = perBatch.get(state.batchId);
      if (existing) {
        existing.count += state.estimatedCount;
        existing.countByFarm.set(farmId, (existing.countByFarm.get(farmId) ?? 0) + state.estimatedCount);
        continue;
      }
      perBatch.set(state.batchId, {
        count: state.estimatedCount,
        avgWeightG: Number(state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG),
        initialCount: state.batch.initialCount,
        initialAvgWeightG: Number(state.batch.initialAvgWeightG),
        farmEntryDate: state.batch.farmEntryDate,
        speciesId: state.batch.speciesId,
        countByFarm: new Map([[farmId, state.estimatedCount]]),
      });
    }

    const batchIds = [...perBatch.keys()];
    // Temperatures back to the oldest stocking (for fitting), and at least a year (for the seasons).
    const oldestEntry = Math.min(now.getTime(), ...[...perBatch.values()].map((b) => b.farmEntryDate.getTime()));
    const readingsFrom = new Date(Math.min(oldestEntry, now.getTime() - 365 * 86_400_000));
    const [feedAgg, mortalityAgg, samples, readings] = await Promise.all([
      client.feedingEvent.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds } },
        _sum: { quantityKg: true },
      }),
      client.mortalityEvent.aggregate({
        where: { tank: { farmSection: { farmId: { in: farmIds } } }, occurredAt: { gte: lookbackCutoff } },
        _sum: { fishCount: true },
      }),
      client.weightSample.findMany({
        where: { batchId: { in: batchIds } },
        select: { batchId: true, avgWeightG: true, occurredAt: true },
        orderBy: { occurredAt: "asc" },
      }),
      client.waterQualityReading.findMany({
        where: {
          temperatureC: { not: null },
          occurredAt: { gte: readingsFrom, lte: now },
          tank: { farmSection: { farmId: { in: farmIds } } },
        },
        select: { occurredAt: true, temperatureC: true, tank: { select: { farmSection: { select: { farmId: true } } } } },
      }),
    ]);
    const feedByBatch = new Map(feedAgg.map((f) => [f.batchId, Number(f._sum.quantityKg ?? 0)]));

    const totalCount = [...perBatch.values()].reduce((sum, b) => sum + b.count, 0);
    const recentMortality = Number(mortalityAgg._sum.fishCount ?? 0);
    const dailyMortalityRate = totalCount > 0 ? recentMortality / (totalCount * FORECAST_LOOKBACK_DAYS) : 0;

    const readingsByFarm = new Map<string, { at: Date; temperatureC: number }[]>();
    for (const r of readings) {
      const farmId = r.tank.farmSection.farmId;
      const list = readingsByFarm.get(farmId) ?? [];
      list.push({ at: r.occurredAt, temperatureC: Number(r.temperatureC) });
      readingsByFarm.set(farmId, list);
    }
    const climate = new Map<string, { daily: Map<number, number>; profile: TemperatureProfile }>();
    for (const [farmId, list] of readingsByFarm) {
      const daily = dailyMeans(list);
      const profile = temperatureProfile(daily, now);
      if (profile) climate.set(farmId, { daily, profile });
    }
    const samplesByBatch = new Map<string, { weightG: number; at: Date }[]>();
    for (const sample of samples) {
      const list = samplesByBatch.get(sample.batchId) ?? [];
      list.push({ weightG: Number(sample.avgWeightG), at: sample.occurredAt });
      samplesByBatch.set(sample.batchId, list);
    }
    const mainFarm = (b: { countByFarm: Map<string, number> }) =>
      [...b.countByFarm].sort((x, y) => y[1] - x[1])[0]![0];

    // Each batch's own coefficient, then the medians that stand in for batches without one.
    const ownTgc = new Map<string, number>();
    for (const batchId of batchIds) {
      const b = perBatch.get(batchId)!;
      const farmClimate = climate.get(mainFarm(b));
      if (!farmClimate) continue;
      const tgc = fitTgc(
        b.initialAvgWeightG,
        (samplesByBatch.get(batchId) ?? [])
          .filter((s) => s.at > b.farmEntryDate)
          .map((s) => ({ weightG: s.weightG, degreeDays: degreeDays(b.farmEntryDate, s.at, farmClimate.daily, farmClimate.profile) })),
      );
      if (tgc !== null) ownTgc.set(batchId, tgc);
    }
    const overallTgc = median([...ownTgc.values()]);
    const speciesTgc = (speciesId: string) =>
      median([...ownTgc].filter(([id]) => perBatch.get(id)!.speciesId === speciesId).map(([, tgc]) => tgc)) ?? overallTgc;

    const monthDays = Array.from({ length: FORECAST_MONTHS_AHEAD }, (_, i) => (i + 1) * 30);
    const atDay = (days: number) => new Date(now.getTime() + days * 86_400_000);

    let batchesWithOwnTgc = 0;
    let batchesWithSharedTgc = 0;
    let batchesWithOwnFcr = 0;
    let batchesWithAssumedFcr = 0;
    let batchesFlat = 0;
    const projected = batchIds.map((batchId) => {
      const b = perBatch.get(batchId)!;
      const farmClimate = climate.get(mainFarm(b));
      const tgc = ownTgc.get(batchId) ?? speciesTgc(b.speciesId);
      if (farmClimate && tgc !== null) {
        if (ownTgc.has(batchId)) batchesWithOwnTgc += 1;
        else batchesWithSharedTgc += 1;
        // Grown from the last weighing (or stocking) through the temperatures since, then the coming months'.
        const last = samplesByBatch.get(batchId)?.at(-1);
        const start = last && last.at > b.farmEntryDate ? last : { weightG: b.initialAvgWeightG, at: b.farmEntryDate };
        const toNow = degreeDays(start.at, now, farmClimate.daily, farmClimate.profile);
        const weights = monthDays.map((days) =>
          growWeight(start.weightG, tgc, toNow + degreeDays(now, atDay(days), farmClimate.daily, farmClimate.profile)),
        );
        return { count: b.count, weightAt: (monthIndex: number) => weights[monthIndex]! };
      }

      const totalFeedKg = feedByBatch.get(batchId) ?? 0;
      const currentBiomassKg = (b.count * b.avgWeightG) / 1000;
      const initialBiomassKg = (b.initialCount * b.initialAvgWeightG) / 1000;
      const biomassGainKg = currentBiomassKg - initialBiomassKg;
      const daysSinceStocking = Math.max(1, (now.getTime() - b.farmEntryDate.getTime()) / 86_400_000);
      const dailyFeedRateKg = totalFeedKg / daysSinceStocking;

      let dailyGrowthGPerFish = 0;
      if (b.count > 0 && totalFeedKg > 0 && biomassGainKg > 0) {
        dailyGrowthGPerFish = ((biomassGainKg * 1000) / daysSinceStocking) / b.count;
        batchesWithOwnFcr += 1;
      } else if (b.count > 0 && totalFeedKg > 0 && avgFcr && avgFcr > 0) {
        dailyGrowthGPerFish = ((dailyFeedRateKg * 1000) / avgFcr) / b.count;
        batchesWithAssumedFcr += 1;
      } else {
        batchesFlat += 1;
      }

      return {
        count: b.count,
        weightAt: (monthIndex: number) => b.avgWeightG + dailyGrowthGPerFish * monthDays[monthIndex]!,
      };
    });

    // Each farm's fish, to weight its temperatures in the month's average.
    const fishByFarm = new Map<string, number>();
    for (const b of perBatch.values()) {
      for (const [farmId, count] of b.countByFarm) fishByFarm.set(farmId, (fishByFarm.get(farmId) ?? 0) + count);
    }
    const monthTemperature = (monthIndex: number) => {
      let weighted = 0;
      let fish = 0;
      for (const [farmId, farmClimate] of climate) {
        const count = fishByFarm.get(farmId) ?? 0;
        if (count === 0) continue;
        const from = atDay(monthIndex * 30);
        weighted += (degreeDays(from, atDay((monthIndex + 1) * 30), farmClimate.daily, farmClimate.profile) / 30) * count;
        fish += count;
      }
      return fish > 0 ? Math.round((weighted / fish) * 10) / 10 : null;
    };

    const months: WeightForecastMonth[] = [];
    for (let monthsAhead = 1; monthsAhead <= FORECAST_MONTHS_AHEAD; monthsAhead++) {
      const daysAhead = monthsAhead * 30;
      const buckets = new Map<number, WeightForecastBucket>();
      let monthTotalCount = 0;
      let monthTotalBiomassKg = 0;

      for (const p of projected) {
        const projectedCount = Math.max(0, Math.round(p.count * (1 - dailyMortalityRate) ** daysAhead));
        if (projectedCount === 0) continue;
        const projectedAvgWeightG = p.weightAt(monthsAhead - 1);
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
        avgTemperatureC: monthTemperature(monthsAhead - 1),
        buckets: [...buckets.values()].sort((a, b) => a.startG - b.startG),
      });
    }

    return {
      bucketWidthG: width,
      avgFcr: avgFcr && avgFcr > 0 ? avgFcr : null,
      dailyMortalityRatePct: dailyMortalityRate * 100,
      totalActiveBatches: batchIds.length,
      batchesWithOwnTgc,
      batchesWithSharedTgc,
      batchesWithOwnFcr,
      batchesWithAssumedFcr,
      batchesFlat,
      months,
    } satisfies WeightForecastResult;
  }
}
