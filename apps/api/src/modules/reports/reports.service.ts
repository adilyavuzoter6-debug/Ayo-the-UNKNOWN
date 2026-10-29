import { BadRequestException, Injectable } from "@nestjs/common";
import { Permission, ROLE_PERMISSIONS } from "@aquai/types";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import type { TenantContext } from "../../common/types/request-context";
import { CostsService } from "../costs/costs.service";
import { BatchAnomalyInput, detectAnomalies, realizedFcr } from "./anomaly-rules";

const DAY_MS = 86_400_000;
/** Longest period a report or export covers, so one request can't pull years of rows. */
const MAX_PERIOD_DAYS = 366;
/** Rows per record type in one export; the response says when a type was cut off. */
const MAX_EXPORT_ROWS = 20_000;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export function assertPeriod(periodStart: Date, periodEnd: Date) {
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    throw new BadRequestException("Geçerli bir başlangıç ve bitiş tarihi girin.");
  }
  if (periodEnd < periodStart) {
    throw new BadRequestException("Bitiş tarihi başlangıçtan önce olamaz.");
  }
  if ((periodEnd.getTime() - periodStart.getTime()) / DAY_MS > MAX_PERIOD_DAYS) {
    throw new BadRequestException(`Rapor dönemi en fazla ${MAX_PERIOD_DAYS} gün olabilir.`);
  }
}

interface ActiveBatch extends BatchAnomalyInput {
  lotCode: string;
  speciesName: string;
  farmIds: Set<string>;
  /** Live fish per farm, for a batch split across farms. */
  liveByFarm: Map<string, number>;
  tankIds: Set<string>;
  tankCodes: Set<string>;
}

/**
 * Cross-farm reporting: a side-by-side comparison of every farm over a period, the raw records behind
 * it for a spreadsheet export, and the batches whose FCR or mortality looks anomalous. Read-only, over
 * the same tables the rest of the app writes, like the inspection report.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly costs: CostsService,
  ) {}

  /** The farms this member may report on: all of the company's, or only the ones they're scoped to. */
  private async visibleFarms(tenant: TenantContext, onlyIds?: string[]) {
    const ids = [
      ...(tenant.farmScopeIds.length > 0 ? [tenant.farmScopeIds] : []),
      ...(onlyIds && onlyIds.length > 0 ? [onlyIds] : []),
    ];
    return this.tenantPrisma.forTenant(tenant.companyId).farm.findMany({
      where: { deletedAt: null, AND: ids.map((list) => ({ id: { in: list } })) },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Every batch with live fish in the given farms, with what the anomaly rules and the FCR column need.
   * A batch split across farms appears once, under each farm it's in.
   */
  private async loadActiveBatches(companyId: string, farmIds: string[], now: Date): Promise<ActiveBatch[]> {
    const client = this.tenantPrisma.forTenant(companyId);
    const tankStates = await client.batchTankState.findMany({
      where: { estimatedCount: { gt: 0 }, tank: { deletedAt: null, farmSection: { farmId: { in: farmIds } } } },
      include: {
        batch: { include: { currentState: true, species: { select: { name: true } } } },
        tank: { select: { code: true, farmSection: { select: { farmId: true } } } },
      },
    });

    const byBatch = new Map<string, ActiveBatch>();
    for (const state of tankStates) {
      const farmId = state.tank.farmSection.farmId;
      const existing = byBatch.get(state.batchId);
      if (existing) {
        existing.liveCount += state.estimatedCount;
        existing.liveByFarm.set(farmId, (existing.liveByFarm.get(farmId) ?? 0) + state.estimatedCount);
        existing.farmIds.add(farmId);
        existing.tankIds.add(state.tankId);
        existing.tankCodes.add(state.tank.code);
        continue;
      }
      const b = state.batch;
      byBatch.set(state.batchId, {
        batchId: b.id,
        lotCode: b.lotCode,
        speciesId: b.speciesId,
        speciesName: b.species.name,
        daysSinceStocking: (now.getTime() - b.farmEntryDate.getTime()) / DAY_MS,
        liveCount: state.estimatedCount,
        avgWeightG: Number(b.currentState?.estimatedAvgWeightG ?? b.initialAvgWeightG),
        initialCount: b.initialCount,
        initialAvgWeightG: Number(b.initialAvgWeightG),
        targetFcr: num(b.targetFcr),
        totalFeedKg: 0,
        harvestedKg: 0,
        deadKg: 0,
        deaths7d: 0,
        deathsPrior28d: 0,
        openWaterQualityAlerts: 0,
        activeTreatments: 0,
        farmIds: new Set([farmId]),
        liveByFarm: new Map([[farmId, state.estimatedCount]]),
        tankIds: new Set([state.tankId]),
        tankCodes: new Set([state.tank.code]),
      });
    }

    const batchIds = [...byBatch.keys()];
    if (batchIds.length === 0) return [];
    const tankIds = [...new Set([...byBatch.values()].flatMap((b) => [...b.tankIds]))];
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * DAY_MS);

    const [feed, harvests, dead, deaths7d, deathsPrior, waterAlerts, treatments] = await Promise.all([
      client.feedingEvent.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds } },
        _sum: { quantityKg: true },
      }),
      client.harvestRecord.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds }, type: "ACTUAL", deletedAt: null },
        _sum: { biomassKg: true },
      }),
      // Events recorded without a weight estimate add nothing here, which errs towards a higher FCR.
      client.mortalityEvent.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds } },
        _sum: { estimatedBiomassKg: true },
      }),
      client.mortalityEvent.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds }, occurredAt: { gte: sevenDaysAgo, lte: now } },
        _sum: { fishCount: true },
      }),
      client.mortalityEvent.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds }, occurredAt: { gte: thirtyFiveDaysAgo, lt: sevenDaysAgo } },
        _sum: { fishCount: true },
      }),
      client.alert.findMany({
        where: { tankId: { in: tankIds }, type: "WATER_QUALITY_CRITICAL", status: "OPEN" },
        select: { tankId: true },
      }),
      client.treatment.findMany({
        where: {
          batchId: { in: batchIds },
          deletedAt: null,
          startedAt: { lte: now },
          OR: [{ endedAt: null }, { endedAt: { gte: now } }],
        },
        select: { batchId: true },
      }),
    ]);

    for (const row of feed) byBatch.get(row.batchId)!.totalFeedKg = Number(row._sum.quantityKg ?? 0);
    for (const row of harvests) byBatch.get(row.batchId)!.harvestedKg = Number(row._sum.biomassKg ?? 0);
    for (const row of dead) byBatch.get(row.batchId)!.deadKg = Number(row._sum.estimatedBiomassKg ?? 0);
    for (const row of deaths7d) byBatch.get(row.batchId)!.deaths7d = row._sum.fishCount ?? 0;
    for (const row of deathsPrior) byBatch.get(row.batchId)!.deathsPrior28d = row._sum.fishCount ?? 0;
    const alertTanks = new Set(waterAlerts.map((a) => a.tankId));
    for (const b of byBatch.values()) {
      b.openWaterQualityAlerts = [...b.tankIds].filter((id) => alertTanks.has(id)).length;
    }
    for (const t of treatments) byBatch.get(t.batchId)!.activeTreatments += 1;

    return [...byBatch.values()];
  }

  async farmComparison(tenant: TenantContext, periodStart: Date, periodEnd: Date) {
    assertPeriod(periodStart, periodEnd);
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const farms = await this.visibleFarms(tenant);
    const farmIds = farms.map((f) => f.id);
    const now = new Date();
    const canSeeCosts = ROLE_PERMISSIONS[tenant.role].includes(Permission.COST_ENTRY_READ);
    const inPeriod = { gte: periodStart, lte: periodEnd };
    const byFarm = <T extends { farmId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const row of rows) map.set(row.farmId, [...(map.get(row.farmId) ?? []), row]);
      return map;
    };
    const farmOfTank = { tank: { select: { farmSection: { select: { farmId: true } } } } } as const;

    const [batches, feeding, mortality, harvests, water, alerts, costSummaries] = await Promise.all([
      this.loadActiveBatches(tenant.companyId, farmIds, now),
      client.feedingEvent.findMany({
        where: { occurredAt: inPeriod, tank: { farmSection: { farmId: { in: farmIds } } } },
        select: { quantityKg: true, ...farmOfTank },
      }),
      client.mortalityEvent.findMany({
        where: { occurredAt: inPeriod, tank: { farmSection: { farmId: { in: farmIds } } } },
        select: { fishCount: true, ...farmOfTank },
      }),
      client.harvestRecord.findMany({
        where: {
          type: "ACTUAL",
          deletedAt: null,
          harvestedAt: inPeriod,
          tank: { farmSection: { farmId: { in: farmIds } } },
        },
        select: { fishCount: true, biomassKg: true, saleRevenueTry: true, ...farmOfTank },
      }),
      client.waterQualityReading.findMany({
        where: { occurredAt: inPeriod, tank: { farmSection: { farmId: { in: farmIds } } } },
        select: { temperatureC: true, dissolvedOxygenMgL: true, ...farmOfTank },
      }),
      client.alert.findMany({
        where: {
          createdAt: inPeriod,
          OR: [{ farmId: { in: farmIds } }, { tank: { farmSection: { farmId: { in: farmIds } } } }],
        },
        select: { type: true, farmId: true, tank: { select: { farmSection: { select: { farmId: true } } } } },
      }),
      canSeeCosts
        ? Promise.all(farmIds.map((id) => this.costs.getCostSummary(tenant.companyId, id, periodStart, periodEnd)))
        : Promise.resolve(null),
    ]);

    const withFarm = <T extends { tank: { farmSection: { farmId: string } } }>(rows: T[]) =>
      byFarm(rows.map((r) => ({ ...r, farmId: r.tank.farmSection.farmId })));
    const feedByFarm = withFarm(feeding);
    const mortalityByFarm = withFarm(mortality);
    const harvestByFarm = withFarm(harvests);
    const waterByFarm = withFarm(water);
    const alertsByFarm = byFarm(
      alerts.map((a) => ({ type: a.type, farmId: a.farmId ?? a.tank?.farmSection.farmId ?? "" })),
    );
    const sum = <T>(rows: T[] | undefined, value: (row: T) => number | null) =>
      (rows ?? []).reduce((total, row) => total + (value(row) ?? 0), 0);
    const avg = (values: number[]) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

    const rows = farms.map((farm, index) => {
      const farmBatches = batches.filter((b) => b.farmIds.has(farm.id));
      // A batch split across farms counts only the fish that are in this one.
      const liveHere = (b: ActiveBatch) => b.liveByFarm.get(farm.id) ?? 0;
      const fishCount = sum(farmBatches, liveHere);
      const biomassKg = sum(farmBatches, (b) => (liveHere(b) * b.avgWeightG) / 1000);

      // Weighted realized FCR across the farm's batches that have one: their feed over their gain,
      // whole-batch figures, since feed and growth aren't recorded per farm.
      const withFcr = farmBatches.filter((b) => realizedFcr(b) !== null);
      const fcrFeed = sum(withFcr, (b) => b.totalFeedKg);
      const fcrGain = sum(
        withFcr,
        (b) => (b.liveCount * b.avgWeightG) / 1000 + b.harvestedKg + b.deadKg - (b.initialCount * b.initialAvgWeightG) / 1000,
      );

      const deaths = sum(mortalityByFarm.get(farm.id), (m) => m.fishCount);
      const temps = (waterByFarm.get(farm.id) ?? []).map((w) => num(w.temperatureC)).filter((v): v is number => v !== null);
      const oxygen = (waterByFarm.get(farm.id) ?? [])
        .map((w) => num(w.dissolvedOxygenMgL))
        .filter((v): v is number => v !== null);
      const farmAlerts = alertsByFarm.get(farm.id) ?? [];
      const harvestKg = sum(harvestByFarm.get(farm.id), (h) => num(h.biomassKg));
      const cost = costSummaries?.[index];

      return {
        farmId: farm.id,
        farmName: farm.name,
        farmCode: farm.code,
        fishCount,
        biomassKg: round(biomassKg),
        avgWeightG: fishCount > 0 ? round((biomassKg * 1000) / fishCount, 1) : null,
        activeBatches: farmBatches.length,
        feedKg: round(sum(feedByFarm.get(farm.id), (f) => num(f.quantityKg))),
        fcr: withFcr.length > 0 && fcrGain > 0 ? round(fcrFeed / fcrGain) : null,
        fcrBatchCount: withFcr.length,
        mortalityCount: deaths,
        // Against the stock the period ended with plus what died in it: what the farm had to lose.
        mortalityPct: fishCount + deaths > 0 ? round((deaths / (fishCount + deaths)) * 100) : null,
        harvestCount: sum(harvestByFarm.get(farm.id), (h) => h.fishCount),
        harvestKg: round(harvestKg),
        waterReadings: (waterByFarm.get(farm.id) ?? []).length,
        avgTemperatureC: avg(temps) === null ? null : round(avg(temps)!, 1),
        avgOxygenMgL: avg(oxygen) === null ? null : round(avg(oxygen)!, 1),
        minOxygenMgL: oxygen.length > 0 ? Math.min(...oxygen) : null,
        alertCount: farmAlerts.length,
        waterAlertCount: farmAlerts.filter((a) => a.type === "WATER_QUALITY_CRITICAL").length,
        costs: cost
          ? {
              expensesTry: cost.totalAmount,
              revenueTry: cost.revenueTry,
              periodResultTry: cost.periodResultTry,
            }
          : null,
      };
    });

    return { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), canSeeCosts, farms: rows };
  }

  /** The rows behind the comparison, per record type, for a spreadsheet export. */
  async records(tenant: TenantContext, periodStart: Date, periodEnd: Date, farmIds: string[]) {
    assertPeriod(periodStart, periodEnd);
    const client = this.tenantPrisma.forTenant(tenant.companyId);
    const farms = await this.visibleFarms(tenant, farmIds);
    const ids = farms.map((f) => f.id);
    const where = { tank: { farmSection: { farmId: { in: ids } } } };
    const place = {
      tank: { select: { code: true, farmSection: { select: { name: true, farm: { select: { name: true } } } } } },
    } as const;
    const take = MAX_EXPORT_ROWS + 1;
    const inPeriod = { gte: periodStart, lte: periodEnd };

    const [feeding, mortality, water, harvests] = await Promise.all([
      client.feedingEvent.findMany({
        where: { ...where, occurredAt: inPeriod },
        include: { ...place, batch: { select: { lotCode: true } }, feedProduct: { select: { name: true } } },
        orderBy: { occurredAt: "asc" },
        take,
      }),
      client.mortalityEvent.findMany({
        where: { ...where, occurredAt: inPeriod },
        include: { ...place, batch: { select: { lotCode: true } } },
        orderBy: { occurredAt: "asc" },
        take,
      }),
      client.waterQualityReading.findMany({
        where: { ...where, occurredAt: inPeriod },
        include: place,
        orderBy: { occurredAt: "asc" },
        take,
      }),
      client.harvestRecord.findMany({
        where: { ...where, type: "ACTUAL", deletedAt: null, harvestedAt: inPeriod },
        include: { ...place, batch: { select: { lotCode: true } } },
        orderBy: { harvestedAt: "asc" },
        take,
      }),
    ]);

    const placeOf = (r: { tank: { code: string; farmSection: { name: string; farm: { name: string } } } }) => ({
      farmName: r.tank.farmSection.farm.name,
      sectionName: r.tank.farmSection.name,
      tankCode: r.tank.code,
    });
    const capped = <T>(rows: T[]) => ({ rows: rows.slice(0, MAX_EXPORT_ROWS), truncated: rows.length > MAX_EXPORT_ROWS });

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      feeding: capped(
        feeding.map((f) => ({
          occurredAt: f.occurredAt.toISOString(),
          ...placeOf(f),
          lotCode: f.batch.lotCode,
          feedProduct: f.feedProduct.name,
          quantityKg: Number(f.quantityKg),
        })),
      ),
      mortality: capped(
        mortality.map((m) => ({
          occurredAt: m.occurredAt.toISOString(),
          ...placeOf(m),
          lotCode: m.batch.lotCode,
          fishCount: m.fishCount,
          estimatedBiomassKg: num(m.estimatedBiomassKg),
          reason: m.reason,
        })),
      ),
      waterQuality: capped(
        water.map((w) => ({
          occurredAt: w.occurredAt.toISOString(),
          ...placeOf(w),
          temperatureC: num(w.temperatureC),
          dissolvedOxygenMgL: num(w.dissolvedOxygenMgL),
          ph: num(w.ph),
          ammoniaMgL: num(w.ammoniaMgL),
          nitriteMgL: num(w.nitriteMgL),
        })),
      ),
      harvests: capped(
        harvests.map((h) => ({
          harvestedAt: h.harvestedAt?.toISOString() ?? null,
          ...placeOf(h),
          lotCode: h.batch.lotCode,
          fishCount: h.fishCount,
          biomassKg: num(h.biomassKg),
          avgWeightG: num(h.avgWeightG),
          destination: h.destination,
          saleRevenueTry: num(h.saleRevenueTry),
        })),
      ),
    };
  }

  async anomalies(tenant: TenantContext) {
    const farms = await this.visibleFarms(tenant);
    const farmName = new Map(farms.map((f) => [f.id, f.name]));
    const now = new Date();
    const batches = await this.loadActiveBatches(
      tenant.companyId,
      farms.map((f) => f.id),
      now,
    );
    const batchById = new Map(batches.map((b) => [b.batchId, b]));

    return {
      generatedAt: now.toISOString(),
      batchesChecked: batches.length,
      batchesWithFcr: batches.filter((b) => realizedFcr(b) !== null).length,
      items: detectAnomalies(batches).map((a) => {
        const b = batchById.get(a.batchId)!;
        return {
          ...a,
          value: round(a.value),
          reference: a.reference === null ? null : round(a.reference),
          lotCode: b.lotCode,
          speciesName: b.speciesName,
          farms: [...b.farmIds].map((id) => ({ id, name: farmName.get(id) ?? "" })),
          tankCodes: [...b.tankCodes].sort(),
        };
      }),
    };
  }
}
