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

@Injectable()
export class FarmStatsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly fcrService: FcrCalculationService,
    private readonly sgrService: SgrCalculationService,
  ) {}

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
}
