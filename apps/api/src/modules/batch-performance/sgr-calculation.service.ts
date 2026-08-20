import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

export interface SgrPoint {
  initialSampleId: string;
  finalSampleId: string;
  initialOccurredAt: string;
  finalOccurredAt: string;
  initialAvgWeightG: number;
  finalAvgWeightG: number;
  periodDays: number;
  sgrPctPerDay: number;
}

/**
 * SGR Engine (§10.5): `SGR %/day = ((ln(end) - ln(start)) / days) × 100`, computed strictly from
 * real WeightSample pairs — never from derived/interpolated biomass — so every SGR value in a
 * report traces back to exactly the two sampling events that produced it (initialSampleId/
 * finalSampleId are part of the result, not just the number). Returns the full chronological
 * series of consecutive sample pairs rather than a single value: that series is exactly what a
 * growth-curve chart needs, and a caller wanting one period's SGR just reads the last point.
 */
@Injectable()
export class SgrCalculationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async calculateSeries(
    companyId: string,
    batchId: string,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<SgrPoint[]> {
    const client = this.tenantPrisma.forTenant(companyId);
    const batch = await client.fishBatch.findFirst({ where: { id: batchId, deletedAt: null } });
    if (!batch) {
      throw new NotFoundException("Fish batch not found.");
    }

    const occurredAtFilter: { gte?: Date; lte?: Date } = {};
    if (periodStart) occurredAtFilter.gte = periodStart;
    if (periodEnd) occurredAtFilter.lte = periodEnd;

    const samples = await client.weightSample.findMany({
      where: {
        batchId,
        ...(periodStart || periodEnd ? { occurredAt: occurredAtFilter } : {}),
      },
      orderBy: { occurredAt: "asc" },
    });

    const series: SgrPoint[] = [];
    for (let i = 1; i < samples.length; i++) {
      const initial = samples[i - 1]!;
      const final = samples[i]!;

      const periodDays =
        (final.occurredAt.getTime() - initial.occurredAt.getTime()) / (1000 * 60 * 60 * 24);
      if (periodDays <= 0) continue; // same-instant or out-of-order samples can't yield a rate

      const initialWeight = Number(initial.avgWeightG);
      const finalWeight = Number(final.avgWeightG);
      if (initialWeight <= 0 || finalWeight <= 0) continue; // ln() undefined at/below zero

      series.push({
        initialSampleId: initial.id,
        finalSampleId: final.id,
        initialOccurredAt: initial.occurredAt.toISOString(),
        finalOccurredAt: final.occurredAt.toISOString(),
        initialAvgWeightG: initialWeight,
        finalAvgWeightG: finalWeight,
        periodDays,
        sgrPctPerDay: ((Math.log(finalWeight) - Math.log(initialWeight)) / periodDays) * 100,
      });
    }
    return series;
  }
}
