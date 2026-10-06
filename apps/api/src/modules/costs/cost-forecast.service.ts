import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { CostAttributionService, EPOCH, FAR_FUTURE } from "./cost-attribution.service";

export interface CostForecastOptions {
  targetWeightG: number;
  targetFcr: number;
  survivalPct: number;
  feedPriceTryPerKg?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "What will the live stock cost to harvest, and what will it sell for?" — a deliberately simple
 * projection: feed still to be eaten is (weight still to gain) × target FCR, priced at the farm's
 * recent feed cost; sunk cost is what's already been spent on each batch. Overheads, future
 * mortality beyond the survival input, and growth-curve timing are not modelled — the response says
 * so, so nobody reads a harvest-date promise into it.
 */
@Injectable()
export class CostForecastService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attribution: CostAttributionService,
  ) {}

  async forecastFarm(companyId: string, farmId: string, opts: CostForecastOptions, today = new Date()) {
    const client = this.tenantPrisma.forTenant(companyId);
    const farm = await client.farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }

    const liveRows = await client.batchTankState.findMany({
      where: { estimatedCount: { gt: 0 }, tank: { farmSection: { farmId } } },
      select: { batchId: true },
    });
    const liveIds = [...new Set(liveRows.map((r) => r.batchId))];

    const ninetyDaysAgo = new Date(today.getTime() - 90 * DAY_MS);
    const sixMonthsAgo = new Date(today.getTime() - 180 * DAY_MS);

    const [batches, recentFeed, lifetimeFeed, lifetimeManual, latestLot, recentSales] = await Promise.all([
      client.fishBatch.findMany({
        where: { id: { in: liveIds }, deletedAt: null },
        include: { currentState: true },
      }),
      this.attribution.feedCostByBatch(client, liveIds, ninetyDaysAgo, today),
      this.attribution.feedCostByBatch(client, liveIds, EPOCH, FAR_FUTURE),
      client.costEntry.findMany({
        where: { batchId: { in: liveIds } },
        select: { batchId: true, amountTry: true },
      }),
      client.feedInventoryBatch.findFirst({
        where: { warehouse: { farmId }, unitCostPerKg: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { unitCostPerKg: true },
      }),
      client.harvestRecord.findMany({
        where: {
          type: "ACTUAL",
          deletedAt: null,
          saleRevenueTry: { not: null },
          harvestedAt: { gte: sixMonthsAgo, lte: today },
          tank: { farmSection: { farmId } },
        },
        select: { biomassKg: true, saleRevenueTry: true },
      }),
    ]);

    // Feed price: explicit input, else what the farm has actually been paying per kg eaten lately,
    // else the newest priced lot in its warehouses.
    let feedPrice: number | null = null;
    let feedPriceSource: "input" | "recent_consumption" | "latest_lot" | null = null;
    if (opts.feedPriceTryPerKg !== undefined) {
      feedPrice = opts.feedPriceTryPerKg;
      feedPriceSource = "input";
    } else {
      let pricedKg = 0;
      let pricedCost = 0;
      for (const row of recentFeed.values()) {
        pricedKg += row.kg - row.unpricedKg;
        pricedCost += row.costTry;
      }
      if (pricedKg > 0) {
        feedPrice = pricedCost / pricedKg;
        feedPriceSource = "recent_consumption";
      } else if (latestLot?.unitCostPerKg !== null && latestLot?.unitCostPerKg !== undefined) {
        feedPrice = Number(latestLot.unitCostPerKg);
        feedPriceSource = "latest_lot";
      }
    }

    // Expected selling price: what this farm's harvests have actually realised per kg lately.
    let saleKg = 0;
    let saleRevenue = 0;
    for (const sale of recentSales) {
      saleKg += Number(sale.biomassKg ?? 0);
      saleRevenue += Number(sale.saleRevenueTry ?? 0);
    }
    const expectedSaleTryPerKg = saleKg > 0 ? saleRevenue / saleKg : null;

    const manualByBatch = new Map<string, number>();
    for (const entry of lifetimeManual) {
      if (!entry.batchId) continue;
      manualByBatch.set(entry.batchId, (manualByBatch.get(entry.batchId) ?? 0) + Number(entry.amountTry));
    }

    const rows = batches.flatMap((batch) => {
      const state = batch.currentState;
      const liveCount = state?.estimatedCount ?? 0;
      if (liveCount <= 0) return [];

      const liveKg = Number(state?.estimatedBiomassKg ?? 0);
      const targetCount = liveCount * (opts.survivalPct / 100);
      const targetKg = (targetCount * opts.targetWeightG) / 1000;
      const gainKg = Math.max(targetKg - liveKg, 0);
      const feedKg = gainKg * opts.targetFcr;

      const sunkCostTry = (manualByBatch.get(batch.id) ?? 0) + (lifetimeFeed.get(batch.id)?.costTry ?? 0);
      const feedCostTry = feedPrice !== null ? round2(feedKg * feedPrice) : null;
      const totalCostTry = feedCostTry !== null ? round2(sunkCostTry + feedCostTry) : null;
      const revenueTry = expectedSaleTryPerKg !== null ? round2(targetKg * expectedSaleTryPerKg) : null;

      return [
        {
          batchId: batch.id,
          lotCode: batch.lotCode,
          liveCount,
          liveBiomassKg: round2(liveKg),
          avgWeightG: Number(state?.estimatedAvgWeightG ?? 0),
          targetBiomassKg: round2(targetKg),
          biomassGainKg: round2(gainKg),
          feedKgNeeded: round2(feedKg),
          sunkCostTry: round2(sunkCostTry),
          feedCostTry,
          totalCostTry,
          costPerKgTry: totalCostTry !== null && targetKg > 0 ? round2(totalCostTry / targetKg) : null,
          revenueTry,
          resultTry: revenueTry !== null && totalCostTry !== null ? round2(revenueTry - totalCostTry) : null,
        },
      ];
    });

    const sum = (pick: (row: (typeof rows)[number]) => number | null) =>
      round2(rows.reduce((total, row) => total + (pick(row) ?? 0), 0));

    return {
      assumptions: {
        targetWeightG: opts.targetWeightG,
        targetFcr: opts.targetFcr,
        survivalPct: opts.survivalPct,
        feedPriceTryPerKg: feedPrice !== null ? round2(feedPrice) : null,
        feedPriceSource,
        expectedSaleTryPerKg: expectedSaleTryPerKg !== null ? round2(expectedSaleTryPerKg) : null,
        note: "Genel giderler, hedef ağırlığa ulaşma süresi ve sağkalım dışındaki ölümler hesaba katılmaz.",
      },
      batches: rows,
      totals: {
        feedKgNeeded: sum((r) => r.feedKgNeeded),
        feedCostTry: rows.some((r) => r.feedCostTry === null) ? null : sum((r) => r.feedCostTry),
        totalCostTry: rows.some((r) => r.totalCostTry === null) ? null : sum((r) => r.totalCostTry),
        revenueTry: rows.some((r) => r.revenueTry === null) ? null : sum((r) => r.revenueTry),
        resultTry: rows.some((r) => r.resultTry === null) ? null : sum((r) => r.resultTry),
      },
    };
  }
}
