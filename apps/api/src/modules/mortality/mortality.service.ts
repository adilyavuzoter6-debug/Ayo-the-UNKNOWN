import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "../alerts/alerts.service";
import { BatchProjectionService } from "../fish-batches/batch-projection.service";
import type { CreateMortalityEventDto } from "./dto/create-mortality-event.dto";

@Injectable()
export class MortalityService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
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
    dto: CreateMortalityEventDto,
  ) {
    await this.assertTankInTenant(companyId, tankId);
    await this.assertBatchInTenant(companyId, dto.batchId);

    const liveCount = await this.projection.getLiveTankCount(companyId, dto.batchId, tankId);
    if (dto.fishCount > liveCount) {
      throw new BadRequestException(
        `Cannot report ${dto.fishCount} mortalities — only ${liveCount} live in this tank.`,
      );
    }

    // Captured at record time (before recompute() moves the projection forward) so the FCR
    // engine's mortality-biomass term (§10.4) reflects the fish's weight at time of death, not
    // whatever the batch's average weight happens to be by the time someone reads this back.
    const batch = await this.tenantPrisma
      .forTenant(companyId)
      .fishBatch.findUnique({ where: { id: dto.batchId }, include: { currentState: true } });
    const avgWeightG = Number(batch?.currentState?.estimatedAvgWeightG ?? batch?.initialAvgWeightG ?? 0);

    const event = await this.tenantPrisma.forTenant(companyId).mortalityEvent.create({
      data: {
        companyId,
        tankId,
        batchId: dto.batchId,
        fishCount: dto.fishCount,
        estimatedAvgWeightG: avgWeightG,
        estimatedBiomassKg: (dto.fishCount * avgWeightG) / 1000,
        reason: dto.reason,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.projection.recompute(companyId, dto.batchId);
    await this.alertsService.evaluateMortalitySpikeRule(companyId, tankId, dto.fishCount, liveCount);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "MortalityEvent",
      entityId: event.id,
      newValue: { tankId, batchId: dto.batchId, fishCount: dto.fishCount, reason: dto.reason },
    });

    return event;
  }

  async listForTank(companyId: string, tankId: string) {
    await this.assertTankInTenant(companyId, tankId);

    return this.tenantPrisma.forTenant(companyId).mortalityEvent.findMany({
      where: { tankId },
      orderBy: { occurredAt: "desc" },
    });
  }
}
