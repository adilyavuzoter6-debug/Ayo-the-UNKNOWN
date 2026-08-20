import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { BatchProjectionService } from "../fish-batches/batch-projection.service";
import { TreatmentsService } from "../treatments/treatments.service";
import type { CreateHarvestRecordDto } from "./dto/create-harvest-record.dto";

@Injectable()
export class HarvestService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly projection: BatchProjectionService,
    private readonly treatmentsService: TreatmentsService,
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

  async create(companyId: string, tankId: string, userId: string, dto: CreateHarvestRecordDto) {
    await this.assertTankInTenant(companyId, tankId);
    await this.assertBatchInTenant(companyId, dto.batchId);
    const client = this.tenantPrisma.forTenant(companyId);

    if (dto.type === "PLANNED") {
      if (!dto.plannedDate) {
        throw new BadRequestException("plannedDate is required for a PLANNED harvest record.");
      }
      const record = await client.harvestRecord.create({
        data: {
          companyId,
          batchId: dto.batchId,
          tankId,
          type: "PLANNED",
          fullness: dto.fullness,
          plannedDate: new Date(dto.plannedDate),
          sizeGrade: dto.sizeGrade,
          destination: dto.destination,
          customer: dto.customer,
          processingPlant: dto.processingPlant,
          createdById: userId,
          notes: dto.notes,
        },
      });
      await this.auditService.record({
        companyId,
        userId,
        action: "CREATE",
        entityType: "HarvestRecord",
        entityId: record.id,
        newValue: { tankId, batchId: dto.batchId, type: "PLANNED" },
      });
      return record;
    }

    // ACTUAL — writes a paired HARVEST_REMOVAL BatchMovement and recomputes the projection,
    // same atomic-pairing pattern as FeedingEvent + its FEED_CONSUMPTION transaction.
    const liveCount = await this.projection.getLiveTankCount(companyId, dto.batchId, tankId);
    const fishCount = dto.fullness === "FULL" ? (dto.fishCount ?? liveCount) : dto.fishCount;
    if (fishCount === undefined) {
      throw new BadRequestException("fishCount is required for a PARTIAL harvest.");
    }
    if (fishCount <= 0) {
      throw new BadRequestException("fishCount must be positive.");
    }
    if (fishCount > liveCount) {
      throw new BadRequestException(
        `Cannot harvest ${fishCount} fish — only ${liveCount} live in this tank.`,
      );
    }

    const batch = await client.fishBatch.findUnique({
      where: { id: dto.batchId },
      include: { currentState: true },
    });
    const avgWeightG =
      dto.avgWeightG ?? Number(batch?.currentState?.estimatedAvgWeightG ?? batch?.initialAvgWeightG ?? 0);
    const biomassKg = (fishCount * avgWeightG) / 1000;
    const harvestedAt = dto.harvestedAt ? new Date(dto.harvestedAt) : new Date();

    const withdrawalBlocks = await this.treatmentsService.getActiveWithdrawalBlocks(
      companyId,
      dto.batchId,
      harvestedAt,
    );
    if (withdrawalBlocks.length > 0) {
      const details = withdrawalBlocks
        .map((b) => `${b.productName} (${b.withdrawalEndsAt.toISOString().slice(0, 10)}'e kadar)`)
        .join(", ");
      throw new BadRequestException(
        `Bu parti arınma süresi (withdrawal period) dolmadığı için hasat edilemez: ${details}`,
      );
    }

    const record = await client.harvestRecord.create({
      data: {
        companyId,
        batchId: dto.batchId,
        tankId,
        type: "ACTUAL",
        fullness: dto.fullness,
        harvestedAt,
        fishCount,
        biomassKg,
        avgWeightG,
        sizeGrade: dto.sizeGrade,
        destination: dto.destination,
        customer: dto.customer,
        processingPlant: dto.processingPlant,
        createdById: userId,
        notes: dto.notes,
      },
    });

    await client.batchMovement.create({
      data: {
        companyId,
        movementType: "HARVEST_REMOVAL",
        batchId: dto.batchId,
        fromTankId: tankId,
        fishCount,
        estimatedAvgWeightG: avgWeightG,
        estimatedBiomassKg: biomassKg,
        occurredAt: harvestedAt,
        createdById: userId,
        notes: `Harvest ${record.id}`,
      },
    });

    await this.projection.recompute(companyId, dto.batchId);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "HarvestRecord",
      entityId: record.id,
      newValue: { tankId, batchId: dto.batchId, type: "ACTUAL", fullness: dto.fullness, fishCount },
    });

    return record;
  }

  async listForTank(companyId: string, tankId: string) {
    await this.assertTankInTenant(companyId, tankId);

    return this.tenantPrisma.forTenant(companyId).harvestRecord.findMany({
      where: { tankId, deletedAt: null },
      orderBy: [{ harvestedAt: "desc" }, { plannedDate: "desc" }],
    });
  }
}
