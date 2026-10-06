import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { ExchangeRatesService } from "../exchange-rates/exchange-rates.service";
import { biomassKgDays } from "./biomass-timeline";
import { CostAttributionService, EPOCH, FAR_FUTURE } from "./cost-attribution.service";
import type { CreateCostEntryDto } from "./dto/create-cost-entry.dto";
import { RecurringCostsService } from "./recurring-costs.service";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Farm-level costs that get spread over batches. Feed bought for the farm is excluded: it's charged
 * to the batch that eats it, through consumption, so counting the purchase too would double it. */
const FEED_PURCHASE_SOURCE = "FeedInventoryTransaction";

@Injectable()
export class CostsService {
  private readonly logger = new Logger(CostsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly recurringCosts: RecurringCostsService,
    private readonly attribution: CostAttributionService,
  ) {}

  private async assertFarmInTenant(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    return farm;
  }

  /** Books due recurring costs. A failure here must not stop the cost page from loading. */
  private async bookRecurringCosts(companyId: string, farmId: string) {
    try {
      await this.recurringCosts.materialize(companyId, farmId);
    } catch (error) {
      this.logger.error(`Recurring cost materialization failed for farm ${farmId}: ${String(error)}`);
    }
  }

  async create(companyId: string, farmId: string, userId: string, dto: CreateCostEntryDto) {
    await this.assertFarmInTenant(companyId, farmId);

    const currency = dto.currency ?? "TRY";
    const incurredAt = new Date(dto.incurredAt);
    // Resolved before the write: if the rate lookup fails, nothing is recorded half-way.
    const exchangeRate = await this.exchangeRates.resolveTryRate(currency, incurredAt, dto.exchangeRate);

    const entry = await this.tenantPrisma.forTenant(companyId).costEntry.create({
      data: {
        companyId,
        farmId,
        category: dto.category,
        amount: dto.amount,
        currency,
        exchangeRate,
        amountTry: round2(dto.amount * exchangeRate),
        tankId: dto.tankId,
        batchId: dto.batchId,
        incurredAt,
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "CostEntry",
      entityId: entry.id,
      newValue: { farmId, category: dto.category, amount: dto.amount, currency, exchangeRate },
    });

    return entry;
  }

  async listForFarm(companyId: string, farmId: string, batchId?: string) {
    await this.assertFarmInTenant(companyId, farmId);
    await this.bookRecurringCosts(companyId, farmId);

    return this.tenantPrisma.forTenant(companyId).costEntry.findMany({
      where: { farmId, ...(batchId ? { batchId } : {}) },
      orderBy: { incurredAt: "desc" },
    });
  }

  /**
   * Period cost and result for a farm. Every money figure is TRY (costs sum `amountTry`, sales sum
   * `saleRevenueTry`), so currencies are never added together.
   *
   * Per batch, for the window:
   * - directCostTotal: batch-tagged costs (medicine, transport…) plus the feed the batch consumed,
   *   priced at each lot's unit cost (CostAttributionService).
   * - allocatedFarmCostTry: the farm-level costs (electricity, labor, overhead, recurring) split by the
   *   batch's share of kilogram-days in the window — how much live biomass it carried, for how long.
   *   Biomass is rebuilt from the movement ledger and weight samples, so the split tracks the fish, not
   *   the number of tanks or a snapshot someone remembered to take.
   * - fullCostTry = direct + allocated. Parti sonucu (netProfitTry) = revenue − fullCost.
   *
   * Everything is a period figure: costs and harvests are matched by date window, not by batch
   * lifetime, so a batch that spends a month being fed and is harvested the next will look
   * expensive in the first window and profitable in the second.
   *
   * Mortality loss is an estimate: dead kg in the window × the batch's lifetime direct cost per kg
   * (all direct cost ÷ all kg it has ever produced). It values dead fish at what they cost to grow.
   */
  async getCostSummary(companyId: string, farmId: string, periodStart: Date, periodEnd: Date) {
    await this.assertFarmInTenant(companyId, farmId);
    await this.bookRecurringCosts(companyId, farmId);
    const client = this.tenantPrisma.forTenant(companyId);
    const inPeriod = { gte: periodStart, lte: periodEnd };

    const [entries, harvests, mortalityEvents, feedingEvents, liveBatchRows] = await Promise.all([
      client.costEntry.findMany({ where: { farmId, incurredAt: inPeriod } }),
      client.harvestRecord.findMany({
        where: {
          type: "ACTUAL",
          deletedAt: null,
          harvestedAt: inPeriod,
          tank: { farmSection: { farmId } },
        },
      }),
      client.mortalityEvent.findMany({
        where: { occurredAt: inPeriod, tank: { farmSection: { farmId } } },
      }),
      client.feedingEvent.findMany({
        where: { occurredAt: inPeriod, tank: { farmSection: { farmId } } },
        select: { batchId: true },
      }),
      // Every batch that has ever sat in this farm's tanks — a batch with no activity this period
      // still carries biomass, and so should still take its share of farm-level costs.
      client.batchTankState.findMany({
        where: { tank: { farmSection: { farmId } } },
        select: { batchId: true },
      }),
    ]);

    const byCategory: Record<string, number> = {};
    let totalAmount = 0;
    for (const entry of entries) {
      const amountTry = Number(entry.amountTry);
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + amountTry;
      totalAmount += amountTry;
    }

    const farmBatchIds = [
      ...new Set(
        [
          ...entries.map((e) => e.batchId),
          ...harvests.map((h) => h.batchId),
          ...mortalityEvents.map((m) => m.batchId),
          ...feedingEvents.map((f) => f.batchId),
          ...liveBatchRows.map((r) => r.batchId),
        ].filter((id): id is string => id !== null),
      ),
    ];

    const [batches, timelines, periodFeed, lifetimeFeed, lifetimeManual, lifetimeHarvests, lifetimeMortality] =
      await Promise.all([
        client.fishBatch.findMany({
          where: { id: { in: farmBatchIds } },
          include: { currentState: true },
        }),
        this.attribution.timelinesByBatch(client, farmBatchIds),
        this.attribution.feedCostByBatch(client, farmBatchIds, periodStart, periodEnd),
        this.attribution.feedCostByBatch(client, farmBatchIds, EPOCH, FAR_FUTURE),
        client.costEntry.findMany({
          where: { batchId: { in: farmBatchIds } },
          select: { batchId: true, amountTry: true },
        }),
        client.harvestRecord.findMany({
          where: { batchId: { in: farmBatchIds }, type: "ACTUAL", deletedAt: null },
          select: { batchId: true, biomassKg: true },
        }),
        client.mortalityEvent.findMany({
          where: { batchId: { in: farmBatchIds } },
          select: { batchId: true, estimatedBiomassKg: true },
        }),
      ]);

    const sumBy = <T>(rows: T[], key: (row: T) => string | null, value: (row: T) => number) => {
      const totals = new Map<string, number>();
      for (const row of rows) {
        const k = key(row);
        if (k !== null) totals.set(k, (totals.get(k) ?? 0) + value(row));
      }
      return totals;
    };

    const periodManual = sumBy(entries, (e) => e.batchId, (e) => Number(e.amountTry));
    const periodHarvestKg = sumBy(harvests, (h) => h.batchId, (h) => Number(h.biomassKg ?? 0));
    const periodRevenue = sumBy(harvests, (h) => h.batchId, (h) => Number(h.saleRevenueTry ?? 0));
    const pricedHarvestKg = sumBy(
      harvests.filter((h) => h.saleRevenueTry !== null),
      (h) => h.batchId,
      (h) => Number(h.biomassKg ?? 0),
    );
    const periodDeadKg = sumBy(mortalityEvents, (m) => m.batchId, (m) => Number(m.estimatedBiomassKg ?? 0));
    const lifetimeManualTry = sumBy(lifetimeManual, (c) => c.batchId, (c) => Number(c.amountTry));
    const lifetimeHarvestKg = sumBy(lifetimeHarvests, (h) => h.batchId, (h) => Number(h.biomassKg ?? 0));
    const lifetimeDeadKg = sumBy(lifetimeMortality, (m) => m.batchId, (m) => Number(m.estimatedBiomassKg ?? 0));
    const liveKg = new Map(batches.map((b) => [b.id, Number(b.currentState?.estimatedBiomassKg ?? 0)]));
    const lotCodeById = new Map(batches.map((b) => [b.id, b.lotCode]));

    // Farm-level costs to spread: everything not tagged to a batch, minus the feed purchases.
    const farmLevelEntries = entries.filter(
      (e) => e.batchId === null && e.sourceType !== FEED_PURCHASE_SOURCE,
    );
    const farmLevelCostTry = farmLevelEntries.reduce((sum, e) => sum + Number(e.amountTry), 0);

    const kgDaysByBatch = new Map<string, number>();
    for (const batchId of farmBatchIds) {
      const timeline = timelines.get(batchId);
      kgDaysByBatch.set(
        batchId,
        timeline ? biomassKgDays(timeline, batchId, periodStart, periodEnd) : 0,
      );
    }
    const totalKgDays = [...kgDaysByBatch.values()].reduce((sum, v) => sum + v, 0);
    const allocatedByBatch = new Map<string, number>();
    for (const [batchId, kgDays] of kgDaysByBatch) {
      allocatedByBatch.set(batchId, totalKgDays > 0 ? (farmLevelCostTry * kgDays) / totalKgDays : 0);
    }
    const allocatedFarmCostTry = [...allocatedByBatch.values()].reduce((sum, v) => sum + v, 0);

    const batchBreakdown = farmBatchIds.flatMap((batchId) => {
      const feed = periodFeed.get(batchId);
      const feedCostTry = feed?.costTry ?? 0;
      const directCostTotal = (periodManual.get(batchId) ?? 0) + feedCostTry;
      const allocated = allocatedByBatch.get(batchId) ?? 0;
      const fullCostTry = directCostTotal + allocated;
      const harvestedKg = periodHarvestKg.get(batchId) ?? 0;
      const revenueTry = periodRevenue.get(batchId) ?? 0;
      const pricedKg = pricedHarvestKg.get(batchId) ?? 0;
      const mortalityKg = periodDeadKg.get(batchId) ?? 0;
      const kgDays = kgDaysByBatch.get(batchId) ?? 0;

      const hasActivity =
        directCostTotal > 0 || allocated > 0 || harvestedKg > 0 || mortalityKg > 0 || kgDays > 0;
      if (!hasActivity) return [];

      const lifetimeDirectTry =
        (lifetimeManualTry.get(batchId) ?? 0) + (lifetimeFeed.get(batchId)?.costTry ?? 0);
      const lifetimeKg =
        (liveKg.get(batchId) ?? 0) + (lifetimeHarvestKg.get(batchId) ?? 0) + (lifetimeDeadKg.get(batchId) ?? 0);
      const lifetimeCostPerKg = lifetimeKg > 0 ? lifetimeDirectTry / lifetimeKg : null;

      return [
        {
          batchId,
          lotCode: lotCodeById.get(batchId) ?? batchId,
          directCostTotal: round2(directCostTotal),
          feedCostTry: round2(feedCostTry),
          feedUnpricedKg: round2(feed?.unpricedKg ?? 0),
          allocatedFarmCostTry: round2(allocated),
          fullCostTry: round2(fullCostTry),
          harvestedKg,
          directCostPerKg: harvestedKg > 0 ? directCostTotal / harvestedKg : null,
          fullCostPerKg: harvestedKg > 0 ? fullCostTry / harvestedKg : null,
          revenueTry: round2(revenueTry),
          avgSaleTryPerKg: pricedKg > 0 ? revenueTry / pricedKg : null,
          // Null until something from this batch is sold — costs without a sale aren't a loss yet.
          grossProfitTry: pricedKg > 0 ? round2(revenueTry - directCostTotal) : null,
          netProfitTry: pricedKg > 0 ? round2(revenueTry - fullCostTry) : null,
          mortalityKg,
          mortalityLossTry: lifetimeCostPerKg !== null ? round2(mortalityKg * lifetimeCostPerKg) : null,
        },
      ];
    });

    const revenueTry = harvests.reduce((sum, h) => sum + Number(h.saleRevenueTry ?? 0), 0);
    const mortalityLossTry = batchBreakdown.reduce((sum, row) => sum + (row.mortalityLossTry ?? 0), 0);

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalAmount: round2(totalAmount),
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round2(v)])),
      farmLevelCostTry: round2(farmLevelCostTry),
      allocatedFarmCostTry: round2(allocatedFarmCostTry),
      /** Farm-level cost with no live biomass in the window to carry it (e.g. an empty farm). */
      unallocatedFarmCostTry: round2(farmLevelCostTry - allocatedFarmCostTry),
      revenueTry: round2(revenueTry),
      /** Sales minus every cost in the window, farm-level costs included. */
      periodResultTry: round2(revenueTry - totalAmount),
      mortalityLossTry: round2(mortalityLossTry),
      batchBreakdown,
    };
  }
}
