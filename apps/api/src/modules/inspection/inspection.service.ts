import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

export interface MinMaxAvg {
  min: number;
  max: number;
  avg: number;
  count: number;
}

function summarize(values: number[]): MinMaxAvg | null {
  if (values.length === 0) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    count: values.length,
  };
}

/**
 * Turkey's Su Ürünleri Yetiştiriciliği Yönetmeliği requires a farm inspection at least twice a
 * year, with the operator producing production/health/water-quality records for the inspector.
 * This assembles exactly that from data already recorded elsewhere in the app — nothing new is
 * stored, this is a pure read-side aggregation over the same tables the rest of the app writes
 * to, so the report can never drift from what's actually in the ledger.
 */
@Injectable()
export class InspectionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getReport(companyId: string, farmId: string, periodStart: Date, periodEnd: Date) {
    const client = this.tenantPrisma.forTenant(companyId);

    const farm = await client.farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }

    const tanks = await client.tank.findMany({
      where: { farmSection: { farmId }, deletedAt: null },
    });
    const tankIds = tanks.map((t) => t.id);

    const [tankStates, mortalityEvents, treatments, waterReadings, harvestRecords, feedAgg] =
      await Promise.all([
        client.batchTankState.findMany({
          where: { tankId: { in: tankIds }, estimatedCount: { gt: 0 } },
          include: { batch: { include: { species: true, currentState: true } } },
        }),
        client.mortalityEvent.findMany({
          where: { tankId: { in: tankIds }, occurredAt: { gte: periodStart, lte: periodEnd } },
        }),
        client.treatment.findMany({
          where: { tankId: { in: tankIds }, startedAt: { gte: periodStart, lte: periodEnd } },
        }),
        client.waterQualityReading.findMany({
          where: { tankId: { in: tankIds }, occurredAt: { gte: periodStart, lte: periodEnd } },
        }),
        client.harvestRecord.findMany({
          where: {
            tankId: { in: tankIds },
            type: "ACTUAL",
            harvestedAt: { gte: periodStart, lte: periodEnd },
          },
        }),
        client.feedingEvent.aggregate({
          where: { tankId: { in: tankIds }, occurredAt: { gte: periodStart, lte: periodEnd } },
          _sum: { quantityKg: true },
        }),
      ]);

    const mortalityTotal = mortalityEvents.reduce((sum, e) => sum + e.fishCount, 0);
    const mortalityByReason: Record<string, number> = {};
    for (const event of mortalityEvents) {
      mortalityByReason[event.reason] = (mortalityByReason[event.reason] ?? 0) + event.fishCount;
    }

    const activeBatches = tankStates.map((state) => ({
      tankCode: tanks.find((t) => t.id === state.tankId)?.code ?? state.tankId,
      lotCode: state.batch.lotCode,
      speciesName: state.batch.species.name,
      estimatedCount: state.estimatedCount,
      avgWeightG: Number(state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG),
    }));

    return {
      farm: { id: farm.id, name: farm.name, code: farm.code },
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      tankCount: tanks.length,
      activeBatches,
      mortality: { total: mortalityTotal, byReason: mortalityByReason },
      treatments: treatments.map((t) => ({
        productName: t.productName,
        type: t.type,
        startedAt: t.startedAt.toISOString(),
        endedAt: t.endedAt?.toISOString() ?? null,
        withdrawalPeriodDays: t.withdrawalPeriodDays,
      })),
      waterQuality: {
        temperatureC: summarize(
          waterReadings.map((r) => r.temperatureC).filter((v): v is NonNullable<typeof v> => v !== null).map(Number),
        ),
        dissolvedOxygenMgL: summarize(
          waterReadings
            .map((r) => r.dissolvedOxygenMgL)
            .filter((v): v is NonNullable<typeof v> => v !== null)
            .map(Number),
        ),
        ph: summarize(
          waterReadings.map((r) => r.ph).filter((v): v is NonNullable<typeof v> => v !== null).map(Number),
        ),
        readingCount: waterReadings.length,
      },
      harvestRecords: harvestRecords.map((h) => ({
        harvestedAt: h.harvestedAt?.toISOString() ?? null,
        fishCount: h.fishCount,
        biomassKg: h.biomassKg ? Number(h.biomassKg) : null,
        destination: h.destination,
      })),
      totalFeedKg: Number(feedAgg._sum.quantityKg ?? 0),
    };
  }
}
