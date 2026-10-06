import { Injectable } from "@nestjs/common";
import type { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { BatchTimelineInput, MovementRow } from "./biomass-timeline";

/** The caller's tenant-scoped client — this service never reaches Prisma on its own. */
type TenantClient = ReturnType<TenantPrismaService["forTenant"]>;

export interface FeedCostForBatch {
  /** TRY, priced at the lot each kg was taken from. */
  costTry: number;
  kg: number;
  /** Kg taken from lots that have no unit cost — excluded from costTry, so callers can flag it. */
  unpricedKg: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const EPOCH = new Date(0);
export const FAR_FUTURE = new Date("2100-01-01T00:00:00Z");

/**
 * Attributes money and kilograms to fish batches. Feed is costed where it is *consumed* (a feeding
 * event draws kg from one lot, and that lot has a unit cost), not where it was bought — so a batch
 * carries the feed it actually ate, and feed bought but still in a silo carries no cost yet.
 */
@Injectable()
export class CostAttributionService {
  /** Feed each batch consumed in [from, to], priced at its lot's unit cost. Batches with no feeding are absent. */
  async feedCostByBatch(
    client: TenantClient,
    batchIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, FeedCostForBatch>> {
    const result = new Map<string, FeedCostForBatch>();
    if (batchIds.length === 0) return result;

    const events = await client.feedingEvent.findMany({
      where: { batchId: { in: batchIds }, occurredAt: { gte: from, lte: to } },
      select: { batchId: true, quantityKg: true, inventoryTransactionId: true },
    });
    if (events.length === 0) return result;

    const transactions = await client.feedInventoryTransaction.findMany({
      where: { id: { in: events.map((e) => e.inventoryTransactionId) } },
      select: { id: true, feedInventoryBatchId: true },
    });
    const lotByTransaction = new Map(transactions.map((t) => [t.id, t.feedInventoryBatchId]));

    const lots = await client.feedInventoryBatch.findMany({
      where: { id: { in: [...new Set(transactions.map((t) => t.feedInventoryBatchId))] } },
      select: { id: true, unitCostPerKg: true },
    });
    const unitCostByLot = new Map(
      lots.map((lot) => [lot.id, lot.unitCostPerKg === null ? null : Number(lot.unitCostPerKg)]),
    );

    for (const event of events) {
      const kg = Number(event.quantityKg);
      const lotId = lotByTransaction.get(event.inventoryTransactionId);
      const unitCost = lotId ? (unitCostByLot.get(lotId) ?? null) : null;
      const row = result.get(event.batchId) ?? { costTry: 0, kg: 0, unpricedKg: 0 };
      row.kg += kg;
      if (unitCost === null) row.unpricedKg += kg;
      else row.costTry += kg * unitCost;
      result.set(event.batchId, row);
    }
    for (const row of result.values()) {
      row.costTry = round2(row.costTry);
    }
    return result;
  }

  /**
   * Ledger inputs for each batch's biomass timeline. A movement can touch two batches (split/merge),
   * so it's handed to every batch it references.
   */
  async timelinesByBatch(client: TenantClient, batchIds: string[]): Promise<Map<string, BatchTimelineInput>> {
    const timelines = new Map<string, BatchTimelineInput>();
    if (batchIds.length === 0) return timelines;

    const [batches, movements, mortality, samples] = await Promise.all([
      client.fishBatch.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, initialAvgWeightG: true },
      }),
      client.batchMovement.findMany({
        where: {
          OR: [
            { batchId: { in: batchIds } },
            { fromBatchId: { in: batchIds } },
            { toBatchId: { in: batchIds } },
          ],
        },
        select: {
          movementType: true,
          batchId: true,
          fromBatchId: true,
          toBatchId: true,
          fromTankId: true,
          toTankId: true,
          fishCount: true,
          occurredAt: true,
        },
      }),
      client.mortalityEvent.findMany({
        where: { batchId: { in: batchIds } },
        select: { batchId: true, fishCount: true, occurredAt: true },
      }),
      client.weightSample.findMany({
        where: { batchId: { in: batchIds } },
        select: { batchId: true, avgWeightG: true, occurredAt: true },
      }),
    ]);

    for (const batch of batches) {
      timelines.set(batch.id, {
        initialAvgWeightG: Number(batch.initialAvgWeightG),
        movements: [],
        mortality: [],
        weightSamples: [],
      });
    }
    const wanted = new Set(batchIds);
    for (const movement of movements) {
      const row: MovementRow = movement;
      for (const id of new Set([movement.batchId, movement.fromBatchId, movement.toBatchId])) {
        if (id && wanted.has(id)) timelines.get(id)?.movements.push(row);
      }
    }
    for (const event of mortality) {
      timelines.get(event.batchId)?.mortality.push(event);
    }
    for (const sample of samples) {
      timelines.get(sample.batchId)?.weightSamples.push({
        avgWeightG: Number(sample.avgWeightG),
        occurredAt: sample.occurredAt,
      });
    }
    return timelines;
  }
}
