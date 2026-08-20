import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

/**
 * Versioned per §10.1 — MVP ships the simple period-biomass-gain methodology (§10.4's (a)); a
 * mortality-normalized or economic FCR would be a new methodology string, not a rewrite of this
 * one, so historical results never silently change meaning.
 */
const METHODOLOGY = "fcr.period_biomass_gain.v1";

export interface FcrResult {
  methodology: string;
  periodStart: string;
  periodEnd: string;
  startBiomassKg: number;
  endBiomassKg: number;
  mortalityBiomassKg: number;
  harvestBiomassKg: number;
  feedConsumedKg: number;
  biomassGainKg: number;
  fcr: number | null;
}

type TenantClient = ReturnType<TenantPrismaService["forTenant"]>;

/**
 * FCR Engine (§10.4): a deliberately period-based, not lifetime, calculation —
 * `FCR = Feed Consumed / Biomass Gain`, where Biomass Gain accounts for every way biomass leaves
 * or enters the batch during the window (harvest, mortality — transfers net to zero at the batch
 * level since moving fish between two tanks of the *same* batch never changes the batch's total).
 * The naive `feed / (endWeight - startWeight)` formula silently produces absurd numbers the
 * moment a batch has a mid-period transfer or partial harvest — exactly the failure mode the
 * task brief calls out — so every term below is explicit rather than assumed away.
 */
@Injectable()
export class FcrCalculationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async calculate(
    companyId: string,
    batchId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<FcrResult> {
    const client = this.tenantPrisma.forTenant(companyId);
    const batch = await client.fishBatch.findFirst({ where: { id: batchId, deletedAt: null } });
    if (!batch) {
      throw new NotFoundException("Fish batch not found.");
    }
    if (periodStart > periodEnd) {
      throw new BadRequestException("periodStart must be on or before periodEnd.");
    }

    const [startBiomassKg, endBiomassKg, mortalityAgg, harvestAgg, feedAgg] = await Promise.all([
      this.biomassOnOrBefore(client, batchId, periodStart),
      this.biomassOnOrBefore(client, batchId, periodEnd),
      client.mortalityEvent.aggregate({
        where: { batchId, occurredAt: { gt: periodStart, lte: periodEnd } },
        _sum: { estimatedBiomassKg: true },
      }),
      client.batchMovement.aggregate({
        where: {
          batchId,
          movementType: "HARVEST_REMOVAL",
          occurredAt: { gt: periodStart, lte: periodEnd },
        },
        _sum: { estimatedBiomassKg: true },
      }),
      client.feedingEvent.aggregate({
        where: { batchId, occurredAt: { gt: periodStart, lte: periodEnd } },
        _sum: { quantityKg: true },
      }),
    ]);

    if (startBiomassKg === null) {
      throw new BadRequestException(
        "No biomass snapshot exists on or before periodStart — call POST /fish-batches/:id/biomass/recalculate first.",
      );
    }
    if (endBiomassKg === null) {
      throw new BadRequestException(
        "No biomass snapshot exists on or before periodEnd — call POST /fish-batches/:id/biomass/recalculate first.",
      );
    }

    const mortalityBiomassKg = Number(mortalityAgg._sum.estimatedBiomassKg ?? 0);
    const harvestBiomassKg = Number(harvestAgg._sum.estimatedBiomassKg ?? 0);
    const feedConsumedKg = Number(feedAgg._sum.quantityKg ?? 0);
    const biomassGainKg = endBiomassKg + harvestBiomassKg + mortalityBiomassKg - startBiomassKg;
    // A non-positive gain (batch net-shrank with no offsetting harvest/mortality recorded) makes
    // FCR undefined rather than a nonsense negative/near-zero ratio — surfaced as null, not 0.
    const fcr = biomassGainKg > 0 ? feedConsumedKg / biomassGainKg : null;

    return {
      methodology: METHODOLOGY,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      startBiomassKg,
      endBiomassKg,
      mortalityBiomassKg,
      harvestBiomassKg,
      feedConsumedKg,
      biomassGainKg,
      fcr,
    };
  }

  /** Batch-level biomass "as of" `date`: each tank's most recent BiomassSnapshot on/before that
   * date, summed. Returns null when no snapshot exists at all before `date` (nothing to sum). */
  private async biomassOnOrBefore(
    client: TenantClient,
    batchId: string,
    date: Date,
  ): Promise<number | null> {
    const snapshots = await client.biomassSnapshot.findMany({
      where: { batchId, snapshotDate: { lte: date } },
      orderBy: { snapshotDate: "desc" },
    });
    if (snapshots.length === 0) return null;

    const latestPerTank = new Map<string, { snapshotDate: Date; biomassKg: number }>();
    for (const snap of snapshots) {
      const key = snap.tankId ?? "__batch_level__";
      const existing = latestPerTank.get(key);
      if (!existing || snap.snapshotDate > existing.snapshotDate) {
        latestPerTank.set(key, {
          snapshotDate: snap.snapshotDate,
          biomassKg: Number(snap.biomassKg),
        });
      }
    }
    return [...latestPerTank.values()].reduce((sum, v) => sum + v.biomassKg, 0);
  }
}
