import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { BatchProjectionService } from "../fish-batches/batch-projection.service";
import type { CreateWeightSampleDto } from "./dto/create-weight-sample.dto";

function computeIndividualStats(weights: number[]) {
  const sampleSize = weights.length;
  const totalWeightG = weights.reduce((sum, w) => sum + w, 0);
  const avgWeightG = totalWeightG / sampleSize;
  const minWeightG = Math.min(...weights);
  const maxWeightG = Math.max(...weights);
  const variance =
    weights.reduce((sum, w) => sum + (w - avgWeightG) ** 2, 0) / sampleSize;
  const stdDevG = Math.sqrt(variance);
  const cv = avgWeightG > 0 ? (stdDevG / avgWeightG) * 100 : 0;
  return { sampleSize, totalWeightG, avgWeightG, minWeightG, maxWeightG, stdDevG, cv };
}

@Injectable()
export class WeightSamplingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly projection: BatchProjectionService,
  ) {}

  private async assertTankInTenant(companyId: string, tankId: string) {
    const tank = await this.tenantPrisma
      .forTenant(companyId)
      .tank.findFirst({ where: { id: tankId, deletedAt: null } });
    if (!tank) {
      throw new NotFoundException("Tank not found.");
    }
    return tank;
  }

  private async assertBatchInTenant(companyId: string, batchId: string) {
    const batch = await this.tenantPrisma
      .forTenant(companyId)
      .fishBatch.findFirst({ where: { id: batchId, deletedAt: null } });
    if (!batch) {
      throw new NotFoundException("Fish batch not found.");
    }
    return batch;
  }

  async create(
    companyId: string,
    tankId: string,
    userId: string,
    dto: CreateWeightSampleDto,
  ) {
    await this.assertTankInTenant(companyId, tankId);
    await this.assertBatchInTenant(companyId, dto.batchId);

    let stats: {
      sampleSize: number;
      totalWeightG: number;
      avgWeightG: number;
      minWeightG: number | null;
      maxWeightG: number | null;
      stdDevG: number | null;
      cv: number | null;
    };
    let individualWeightsG: number[] = [];

    if (dto.sampleMethod === "INDIVIDUAL") {
      if (!dto.individualWeightsG || dto.individualWeightsG.length === 0) {
        throw new BadRequestException(
          "individualWeightsG is required for sampleMethod: INDIVIDUAL.",
        );
      }
      individualWeightsG = dto.individualWeightsG;
      stats = computeIndividualStats(dto.individualWeightsG);
    } else {
      if (!dto.avgWeightG || !dto.sampleSize) {
        throw new BadRequestException(
          "avgWeightG and sampleSize are required for sampleMethod: AGGREGATE.",
        );
      }
      stats = {
        sampleSize: dto.sampleSize,
        totalWeightG: dto.avgWeightG * dto.sampleSize,
        avgWeightG: dto.avgWeightG,
        minWeightG: null,
        maxWeightG: null,
        stdDevG: null,
        cv: null,
      };
    }

    const sample = await this.tenantPrisma.forTenant(companyId).weightSample.create({
      data: {
        companyId,
        tankId,
        batchId: dto.batchId,
        sampleMethod: dto.sampleMethod,
        sampleSize: stats.sampleSize,
        individualWeightsG,
        totalWeightG: stats.totalWeightG,
        avgWeightG: stats.avgWeightG,
        minWeightG: stats.minWeightG ?? undefined,
        maxWeightG: stats.maxWeightG ?? undefined,
        stdDevG: stats.stdDevG ?? undefined,
        cv: stats.cv ?? undefined,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.projection.recompute(companyId, dto.batchId);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "WeightSample",
      entityId: sample.id,
      newValue: { tankId, batchId: dto.batchId, avgWeightG: stats.avgWeightG },
    });

    return sample;
  }

  async listForTank(companyId: string, tankId: string) {
    await this.assertTankInTenant(companyId, tankId);

    return this.tenantPrisma.forTenant(companyId).weightSample.findMany({
      where: { tankId },
      orderBy: { occurredAt: "desc" },
    });
  }
}
