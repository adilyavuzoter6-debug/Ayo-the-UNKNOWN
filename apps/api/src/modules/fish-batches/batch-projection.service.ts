import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

/**
 * Rebuilds BatchCurrentState/BatchTankState (docs/architecture/04-database-schema.md §4.4.1) for
 * one batch by re-summing its full BatchMovement history — never incrementally. Called
 * synchronously, in the same request, after every ledger write that could affect the batch(es)
 * involved (mirrors AlertsService.evaluateBiomassRule's existing "re-derive, don't increment"
 * pattern). The nightly from-scratch reconciliation job described in §4.4.1 is deferred until a
 * scheduler exists (tracked for Milestone 3, which needs the same infrastructure for
 * FeedInventoryBalance) — this synchronous path is the primary mechanism either way.
 */
@Injectable()
export class BatchProjectionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async recompute(companyId: string, batchId: string): Promise<void> {
    const client = this.tenantPrisma.forTenant(companyId);

    const [batch, movements, mortalityEvents, latestWeightSample] = await Promise.all([
      client.fishBatch.findFirst({ where: { id: batchId } }),
      client.batchMovement.findMany({
        where: { OR: [{ batchId }, { fromBatchId: batchId }, { toBatchId: batchId }] },
      }),
      client.mortalityEvent.findMany({ where: { batchId } }),
      client.weightSample.findFirst({ where: { batchId }, orderBy: { occurredAt: "desc" } }),
    ]);
    if (!batch) return;

    const tankDeltas = new Map<string, number>();
    const bump = (tankId: string | null, delta: number) => {
      if (!tankId) return;
      tankDeltas.set(tankId, (tankDeltas.get(tankId) ?? 0) + delta);
    };

    for (const movement of movements) {
      if (movement.toBatchId === batchId && movement.toBatchId !== movement.fromBatchId) {
        // This batch is the SPLIT/MERGE recipient of this row.
        bump(movement.toTankId, movement.fishCount);
      } else if (
        movement.fromBatchId === batchId &&
        movement.toBatchId &&
        movement.toBatchId !== batchId
      ) {
        // This batch is the SPLIT/MERGE source of this row.
        bump(movement.fromTankId, -movement.fishCount);
      } else if (movement.batchId === batchId) {
        switch (movement.movementType) {
          case "STOCKING":
            bump(movement.toTankId, movement.fishCount);
            break;
          case "TRANSFER":
            bump(movement.fromTankId, -movement.fishCount);
            bump(movement.toTankId, movement.fishCount);
            break;
          case "HARVEST_REMOVAL":
            bump(movement.fromTankId, -movement.fishCount);
            break;
          default:
            break;
        }
      }
    }

    // Mortality reduces a tank's live count exactly like a TRANSFER/HARVEST_REMOVAL outflow —
    // §10.3 defines BatchTankState.estimatedCount as derived from "the movement ledger AND
    // mortality", not the movement ledger alone.
    for (const event of mortalityEvents) {
      bump(event.tankId, -event.fishCount);
    }

    const now = new Date();
    const estimatedCount = [...tankDeltas.values()].reduce((sum, n) => sum + Math.max(n, 0), 0);
    // The most recent WeightSample supersedes the batch's initial stocking weight once one
    // exists — this is what keeps biomass accurate as fish grow (§10.3).
    const avgWeightG = latestWeightSample
      ? Number(latestWeightSample.avgWeightG)
      : Number(batch.initialAvgWeightG);
    const estimatedBiomassKg = (estimatedCount * avgWeightG) / 1000;
    const tanksWithFish = [...tankDeltas.entries()].filter(([, count]) => count > 0);
    const currentTankId = tanksWithFish.length === 1 ? (tanksWithFish[0]?.[0] ?? null) : null;

    await Promise.all(
      [...tankDeltas.entries()].map(([tankId, estimatedTankCount]) =>
        client.batchTankState.upsert({
          where: { batchId_tankId: { batchId, tankId } },
          create: { batchId, tankId, estimatedCount: Math.max(estimatedTankCount, 0), lastRecalculatedAt: now },
          update: { estimatedCount: Math.max(estimatedTankCount, 0), lastRecalculatedAt: now },
        }),
      ),
    );

    await client.batchCurrentState.upsert({
      where: { batchId },
      create: {
        batchId,
        currentTankId,
        estimatedCount,
        estimatedAvgWeightG: avgWeightG,
        estimatedBiomassKg,
        lastRecalculatedAt: now,
      },
      update: {
        currentTankId,
        estimatedCount,
        estimatedAvgWeightG: avgWeightG,
        estimatedBiomassKg,
        lastRecalculatedAt: now,
      },
    });

    if (estimatedCount === 0 && batch.status !== "CLOSED") {
      await client.fishBatch.update({ where: { id: batchId }, data: { status: "CLOSED" } });
    } else if (estimatedCount > 0 && batch.status === "CLOSED") {
      await client.fishBatch.update({ where: { id: batchId }, data: { status: "ACTIVE" } });
    }
  }

  /** Live fish count for one batch in one specific tank — used for the ledger's write-time
   * invariant check (a transfer/split/merge can never move more fish than are actually there). */
  async getLiveTankCount(companyId: string, batchId: string, tankId: string): Promise<number> {
    const state = await this.tenantPrisma
      .forTenant(companyId)
      .batchTankState.findUnique({ where: { batchId_tankId: { batchId, tankId } } });
    return state?.estimatedCount ?? 0;
  }
}
