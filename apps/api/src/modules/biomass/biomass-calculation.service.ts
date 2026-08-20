import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { BatchProjectionService } from "../fish-batches/batch-projection.service";

/**
 * Versioned methodology identifier stored alongside every snapshot (docs/architecture/
 * 10-biological-calculations.md §10.1) so a future formula change never silently rewrites the
 * meaning of a historical report. MVP ships exactly one methodology; the strategy-pattern
 * indirection the doc describes for multiple methodologies is deliberately not built until a
 * second one is actually needed (YAGNI) — this string is the only thing later code needs to
 * branch on.
 */
const METHODOLOGY = "biomass.count_x_latest_weight.v1";

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Biomass Engine (§10.3): biomass kg = fish count × average fish weight kg. Both inputs are
 * already the ledger-derived, mortality/weight-sample-aware numbers BatchProjectionService
 * maintains — this service's only job is to materialize today's numbers into a BiomassSnapshot
 * row per tank the batch currently occupies (see plan note: a single nullable-tankId "whole
 * batch" row is deliberately NOT written — Postgres treats NULL as distinct across rows even
 * under a unique constraint, so re-running this same day would insert duplicates instead of
 * updating; per-tank rows avoid that and a batch total is just their sum on read).
 */
@Injectable()
export class BiomassCalculationService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly projection: BatchProjectionService,
  ) {}

  async recalculate(companyId: string, batchId: string, userId: string) {
    const client = this.tenantPrisma.forTenant(companyId);

    const batch = await client.fishBatch.findFirst({ where: { id: batchId, deletedAt: null } });
    if (!batch) {
      throw new NotFoundException("Fish batch not found.");
    }

    await this.projection.recompute(companyId, batchId);

    const [tankStates, currentState] = await Promise.all([
      client.batchTankState.findMany({ where: { batchId, estimatedCount: { gt: 0 } } }),
      client.batchCurrentState.findUnique({ where: { batchId } }),
    ]);
    if (!currentState) return [];

    const avgWeightG = Number(currentState.estimatedAvgWeightG);
    const snapshotDate = startOfToday();

    return Promise.all(
      tankStates.map((state) => {
        const biomassKg = (state.estimatedCount * avgWeightG) / 1000;
        return client.biomassSnapshot.upsert({
          where: { batchId_tankId_snapshotDate: { batchId, tankId: state.tankId, snapshotDate } },
          create: {
            companyId,
            batchId,
            tankId: state.tankId,
            snapshotDate,
            estimatedCount: state.estimatedCount,
            avgWeightG,
            biomassKg,
            methodology: METHODOLOGY,
            createdById: userId,
          },
          update: {
            estimatedCount: state.estimatedCount,
            avgWeightG,
            biomassKg,
            methodology: METHODOLOGY,
            createdById: userId,
          },
        });
      }),
    );
  }

  async getHistory(companyId: string, batchId: string) {
    const client = this.tenantPrisma.forTenant(companyId);
    const batch = await client.fishBatch.findFirst({ where: { id: batchId, deletedAt: null } });
    if (!batch) {
      throw new NotFoundException("Fish batch not found.");
    }

    return client.biomassSnapshot.findMany({
      where: { batchId },
      orderBy: { snapshotDate: "asc" },
    });
  }
}
