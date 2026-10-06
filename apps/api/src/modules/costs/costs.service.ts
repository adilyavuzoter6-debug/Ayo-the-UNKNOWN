import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { ExchangeCurrency, ExchangeRatesService } from "../exchange-rates/exchange-rates.service";
import { biomassKgAt, biomassKgDays, BatchTimelineInput } from "./biomass-timeline";
import { CostAttributionService, EPOCH } from "./cost-attribution.service";
import type { CreateCostEntryDto } from "./dto/create-cost-entry.dto";
import type { UpdateCostEntryDto } from "./dto/update-cost-entry.dto";
import { RecurringCostsService } from "./recurring-costs.service";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Farm-level costs that get spread over batches. Feed bought for the farm is excluded: it's charged
 * to the batch that eats it, through consumption, so counting the purchase too would double it. */
const FEED_PURCHASE_SOURCE = "FeedInventoryTransaction";

const monthKeyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

interface FarmCost {
  amountTry: number;
  incurredAt: Date;
}

/**
 * Spreads farm-level costs over the batches that carried biomass in each entry's calendar month, in
 * proportion to their kilogram-days that month. A cost in a month with no fish anywhere is returned as
 * unallocated — it's an expense of that month, not of any batch.
 */
function allocateFarmPool(
  entries: FarmCost[],
  timelines: Map<string, BatchTimelineInput>,
  batchIds: string[],
): { perBatch: Map<string, number>; unallocatedTry: number } {
  const totalByMonth = new Map<string, number>();
  for (const e of entries) {
    const key = monthKeyOf(e.incurredAt);
    totalByMonth.set(key, (totalByMonth.get(key) ?? 0) + e.amountTry);
  }

  const perBatch = new Map<string, number>();
  let unallocatedTry = 0;
  for (const [key, total] of totalByMonth) {
    const [year, month] = key.split("-").map(Number) as [number, number];
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const kgDays = new Map<string, number>();
    let sum = 0;
    for (const id of batchIds) {
      const timeline = timelines.get(id);
      if (!timeline) continue;
      const value = biomassKgDays(timeline, id, from, to);
      if (value > 0) {
        kgDays.set(id, value);
        sum += value;
      }
    }

    if (sum <= 0) {
      unallocatedTry += total;
      continue;
    }
    for (const [id, value] of kgDays) {
      perBatch.set(id, (perBatch.get(id) ?? 0) + (total * value) / sum);
    }
  }
  return { perBatch, unallocatedTry };
}

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

  /**
   * Corrects a manual entry. Automatic entries (stocking, feed purchase, recurring) are changed at their
   * source — otherwise the batch or the stock would disagree with its cost.
   */
  async update(companyId: string, farmId: string, userId: string, id: string, dto: UpdateCostEntryDto) {
    await this.assertFarmInTenant(companyId, farmId);
    const client = this.tenantPrisma.forTenant(companyId);
    const existing = await client.costEntry.findFirst({ where: { id, farmId } });
    if (!existing) {
      throw new NotFoundException("Cost entry not found.");
    }
    if (existing.sourceType) {
      throw new BadRequestException(
        "Bu kayıt otomatik oluştu. Stoklama maliyeti partiden, yem maliyeti yem alımından, tekrarlayan gider tekrarlayan giderden düzenlenir.",
      );
    }

    const currency = (dto.currency ?? existing.currency) as ExchangeCurrency;
    const incurredAt = dto.incurredAt ? new Date(dto.incurredAt) : existing.incurredAt;
    const amount = dto.amount ?? Number(existing.amount);
    // A new currency or date re-prices the entry at that day's rate, unless a rate is typed in.
    const repriced = dto.currency !== undefined || dto.incurredAt !== undefined;
    const exchangeRate =
      dto.exchangeRate !== undefined || repriced
        ? await this.exchangeRates.resolveTryRate(currency, incurredAt, dto.exchangeRate)
        : Number(existing.exchangeRate ?? 1);

    const result = await client.costEntry.updateMany({
      where: { id, farmId, sourceType: null },
      data: {
        category: dto.category ?? existing.category,
        amount,
        currency,
        exchangeRate,
        amountTry: round2(amount * exchangeRate),
        incurredAt,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
      },
    });
    if (result.count === 0) {
      throw new NotFoundException("Cost entry not found.");
    }

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "CostEntry",
      entityId: id,
      newValue: { amount, currency, exchangeRate, incurredAt: incurredAt.toISOString() },
    });
    return client.costEntry.findFirst({ where: { id } });
  }

  async remove(companyId: string, farmId: string, userId: string, id: string) {
    await this.assertFarmInTenant(companyId, farmId);
    const client = this.tenantPrisma.forTenant(companyId);
    const existing = await client.costEntry.findFirst({ where: { id, farmId } });
    if (!existing) {
      throw new NotFoundException("Cost entry not found.");
    }
    if (existing.sourceType) {
      throw new BadRequestException(
        "Bu kayıt otomatik oluştu ve kaynağından silinmelidir (stoklama için partiyi, yem için yem alımını düzenleyin).",
      );
    }
    await client.costEntry.deleteMany({ where: { id, farmId, sourceType: null } });

    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "CostEntry",
      entityId: id,
      newValue: { farmId, category: existing.category, amountTry: Number(existing.amountTry) },
    });
    return { deleted: true };
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
   * Period cost, sales and result for a farm, with the cost of the fish that were sold matched against
   * the sales. Every money figure is TRY, so currencies are never added together.
   *
   * Cost of sold fish. Each batch has a unit cost: everything it has cost up to the period end (its own
   * direct costs, the feed it ate, and its share of farm-level costs) divided by everything it has
   * produced up to then (harvested kg + dead kg + live kg). A priced harvest's kg leave the batch at that
   * unit cost — that's the cost of the fish sold. Dead fish's cost is carried by the fish that survive
   * to be sold, and fish still in the water keep their cost on the books until they are sold.
   *
   * Farm-level costs (electricity, labor, overhead, recurring) are spread monthly over the batches that
   * carried biomass that month, by kilogram-days. A month with no fish anywhere leaves its cost
   * unallocated, and that cost is an expense of the period.
   *
   * Period result = sales − cost of fish sold − unallocated farm-level cost. Purchased feed that is still
   * in the silo is not an expense yet; it becomes one when the batch eats it and the fish are sold.
   *
   * Unpriced harvests are neither revenue nor cost of sales: no price means we don't know they were sold.
   *
   * `totalAmount` is the plain total of invoices in the window, for comparison with what was paid.
   */
  async getCostSummary(companyId: string, farmId: string, periodStart: Date, periodEnd: Date) {
    await this.assertFarmInTenant(companyId, farmId);
    await this.bookRecurringCosts(companyId, farmId);
    const client = this.tenantPrisma.forTenant(companyId);
    const start = periodStart.getTime();
    const end = periodEnd.getTime();
    const inPeriod = (d: Date) => d.getTime() >= start && d.getTime() <= end;
    // A harvest row without a date (PLANNED) never reaches here, but the column is nullable, so say so.
    const harvestedInPeriod = (h: { harvestedAt: Date | null }) => h.harvestedAt !== null && inPeriod(h.harvestedAt);

    const [farmEntriesUpTo, harvestsUpTo, mortalityUpTo, feedingUpTo, tankRows] = await Promise.all([
      client.costEntry.findMany({
        where: { farmId, incurredAt: { lte: periodEnd } },
        select: { batchId: true, sourceType: true, category: true, amountTry: true, incurredAt: true },
      }),
      client.harvestRecord.findMany({
        where: {
          type: "ACTUAL",
          deletedAt: null,
          harvestedAt: { lte: periodEnd },
          tank: { farmSection: { farmId } },
        },
        select: { batchId: true, biomassKg: true, saleRevenueTry: true, harvestedAt: true },
      }),
      client.mortalityEvent.findMany({
        where: { occurredAt: { lte: periodEnd }, tank: { farmSection: { farmId } } },
        select: { batchId: true, estimatedBiomassKg: true, occurredAt: true },
      }),
      client.feedingEvent.findMany({
        where: { occurredAt: { lte: periodEnd }, tank: { farmSection: { farmId } } },
        select: { batchId: true },
      }),
      // Every batch that has ever sat in this farm's tanks: a batch with no activity this period still
      // carries biomass, and so takes its share of farm-level costs.
      client.batchTankState.findMany({
        where: { tank: { farmSection: { farmId } } },
        select: { batchId: true },
      }),
    ]);

    const universe = [
      ...new Set(
        [
          ...farmEntriesUpTo.map((e) => e.batchId),
          ...harvestsUpTo.map((h) => h.batchId),
          ...mortalityUpTo.map((m) => m.batchId),
          ...feedingUpTo.map((f) => f.batchId),
          ...tankRows.map((r) => r.batchId),
        ].filter((id): id is string => id !== null),
      ),
    ];

    const [batchEntriesUpTo, batches, timelines, feedUpTo, feedPeriod] = await Promise.all([
      client.costEntry.findMany({
        where: { batchId: { in: universe }, incurredAt: { lte: periodEnd } },
        select: { batchId: true, amountTry: true, incurredAt: true },
      }),
      client.fishBatch.findMany({ where: { id: { in: universe } }, select: { id: true, lotCode: true } }),
      this.attribution.timelinesByBatch(client, universe),
      this.attribution.feedCostByBatch(client, universe, EPOCH, periodEnd),
      this.attribution.feedCostByBatch(client, universe, periodStart, periodEnd),
    ]);
    const lotCodeById = new Map(batches.map((b) => [b.id, b.lotCode]));

    // Farm-level costs, allocated for the period and for everything up to its end.
    const farmLevel = farmEntriesUpTo.filter(
      (e) => e.batchId === null && e.sourceType !== FEED_PURCHASE_SOURCE,
    );
    const farmLevelPeriod = farmLevel.filter((e) => inPeriod(e.incurredAt));
    const toFarmCost = (e: { amountTry: unknown; incurredAt: Date }): FarmCost => ({
      amountTry: Number(e.amountTry),
      incurredAt: e.incurredAt,
    });
    const allocPeriod = allocateFarmPool(farmLevelPeriod.map(toFarmCost), timelines, universe);
    const allocUpTo = allocateFarmPool(farmLevel.map(toFarmCost), timelines, universe);

    // Per-batch sums, lifetime (up to the period end) and for the period.
    const sumBy = <T>(rows: T[], key: (row: T) => string | null, value: (row: T) => number) => {
      const totals = new Map<string, number>();
      for (const row of rows) {
        const k = key(row);
        if (k !== null) totals.set(k, (totals.get(k) ?? 0) + value(row));
      }
      return totals;
    };
    const directUpTo = sumBy(batchEntriesUpTo, (e) => e.batchId, (e) => Number(e.amountTry));
    const directPeriod = sumBy(
      batchEntriesUpTo.filter((e) => inPeriod(e.incurredAt)),
      (e) => e.batchId,
      (e) => Number(e.amountTry),
    );
    const harvestedUpTo = sumBy(harvestsUpTo, (h) => h.batchId, (h) => Number(h.biomassKg ?? 0));
    const harvestedPeriod = sumBy(
      harvestsUpTo.filter((h) => harvestedInPeriod(h)),
      (h) => h.batchId,
      (h) => Number(h.biomassKg ?? 0),
    );
    const pricedPeriodKg = sumBy(
      harvestsUpTo.filter((h) => harvestedInPeriod(h) && h.saleRevenueTry !== null),
      (h) => h.batchId,
      (h) => Number(h.biomassKg ?? 0),
    );
    const revenuePeriod = sumBy(
      harvestsUpTo.filter((h) => harvestedInPeriod(h)),
      (h) => h.batchId,
      (h) => Number(h.saleRevenueTry ?? 0),
    );
    const deadUpTo = sumBy(mortalityUpTo, (m) => m.batchId, (m) => Number(m.estimatedBiomassKg ?? 0));
    const deadPeriod = sumBy(
      mortalityUpTo.filter((m) => inPeriod(m.occurredAt)),
      (m) => m.batchId,
      (m) => Number(m.estimatedBiomassKg ?? 0),
    );

    const unitCostById = new Map<string, number | null>();
    const liveAtEndById = new Map<string, number>();
    for (const id of universe) {
      const timeline = timelines.get(id);
      const live = timeline ? biomassKgAt(timeline, id, periodEnd) : 0;
      liveAtEndById.set(id, live);
      const produced = (harvestedUpTo.get(id) ?? 0) + (deadUpTo.get(id) ?? 0) + live;
      const cumulative =
        (directUpTo.get(id) ?? 0) + (feedUpTo.get(id)?.costTry ?? 0) + (allocUpTo.perBatch.get(id) ?? 0);
      unitCostById.set(id, produced > 0 ? cumulative / produced : null);
    }

    const batchBreakdown = universe.flatMap((batchId) => {
      const feed = feedPeriod.get(batchId);
      const feedCostTry = feed?.costTry ?? 0;
      const directCostTotal = (directPeriod.get(batchId) ?? 0) + feedCostTry;
      const allocated = allocPeriod.perBatch.get(batchId) ?? 0;
      const fullCostTry = directCostTotal + allocated;
      const harvestedKg = harvestedPeriod.get(batchId) ?? 0;
      const pricedKg = pricedPeriodKg.get(batchId) ?? 0;
      const revenueTry = revenuePeriod.get(batchId) ?? 0;
      const deadKg = deadPeriod.get(batchId) ?? 0;
      const unit = unitCostById.get(batchId) ?? null;
      const cogsTry = unit !== null ? pricedKg * unit : 0;
      const kgDays = (() => {
        const timeline = timelines.get(batchId);
        return timeline ? biomassKgDays(timeline, batchId, periodStart, periodEnd) : 0;
      })();

      const hasActivity =
        directCostTotal > 0 || allocated > 0 || harvestedKg > 0 || deadKg > 0 || kgDays > 0 || cogsTry > 0;
      if (!hasActivity) return [];

      const produced =
        (harvestedUpTo.get(batchId) ?? 0) + (deadUpTo.get(batchId) ?? 0) + (liveAtEndById.get(batchId) ?? 0);

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
          unitCostPerKg: unit !== null ? round2(unit) : null,
          producedKg: round2(produced),
          revenueTry: round2(revenueTry),
          avgSaleTryPerKg: pricedKg > 0 ? revenueTry / pricedKg : null,
          cogsTry: round2(cogsTry),
          // Revenue less the direct cost of this period's sales.
          grossProfitTry: pricedKg > 0 ? round2(revenueTry - directCostTotal) : null,
          // Revenue less the cost of the fish actually sold: the result the farm owner can rely on.
          netProfitTry: pricedKg > 0 ? round2(revenueTry - cogsTry) : null,
          mortalityKg: deadKg,
          mortalityLossTry: unit !== null ? round2(deadKg * unit) : null,
        },
      ];
    });

    const periodFarmEntries = farmEntriesUpTo.filter((e) => inPeriod(e.incurredAt));
    const totalAmount = periodFarmEntries.reduce((sum, e) => sum + Number(e.amountTry), 0);
    const byCategory: Record<string, number> = {};
    for (const e of periodFarmEntries) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amountTry);
    }
    const farmLevelCostTry = farmLevelPeriod.reduce((sum, e) => sum + Number(e.amountTry), 0);
    const allocatedFarmCostTry = [...allocPeriod.perBatch.values()].reduce((sum, v) => sum + v, 0);
    const revenueTry = harvestsUpTo
      .filter((h) => harvestedInPeriod(h))
      .reduce((sum, h) => sum + Number(h.saleRevenueTry ?? 0), 0);
    const cogsTry = batchBreakdown.reduce((sum, row) => sum + row.cogsTry, 0);
    const mortalityLossTry = batchBreakdown.reduce((sum, row) => sum + (row.mortalityLossTry ?? 0), 0);

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalAmount: round2(totalAmount),
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round2(v)])),
      farmLevelCostTry: round2(farmLevelCostTry),
      allocatedFarmCostTry: round2(allocatedFarmCostTry),
      /** Farm-level cost with no live biomass that month to carry it (e.g. an empty farm). */
      unallocatedFarmCostTry: round2(allocPeriod.unallocatedTry),
      revenueTry: round2(revenueTry),
      cogsTry: round2(cogsTry),
      /** Sales − cost of fish sold − unallocated farm-level cost. */
      periodResultTry: round2(revenueTry - cogsTry - allocPeriod.unallocatedTry),
      mortalityLossTry: round2(mortalityLossTry),
      batchBreakdown,
    };
  }
}
