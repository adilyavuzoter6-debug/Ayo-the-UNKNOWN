import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateTreatmentDto } from "./dto/create-treatment.dto";

export interface WithdrawalBlock {
  treatmentId: string;
  productName: string;
  withdrawalEndsAt: Date;
}

@Injectable()
export class TreatmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
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

  async create(companyId: string, tankId: string, userId: string, dto: CreateTreatmentDto) {
    await this.assertTankInTenant(companyId, tankId);
    await this.assertBatchInTenant(companyId, dto.batchId);

    const treatment = await this.tenantPrisma.forTenant(companyId).treatment.create({
      data: {
        companyId,
        batchId: dto.batchId,
        tankId,
        type: dto.type,
        productName: dto.productName,
        dosage: dto.dosage,
        withdrawalPeriodDays: dto.withdrawalPeriodDays,
        startedAt: new Date(dto.startedAt),
        endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
        veterinarianId: dto.veterinarianId,
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "Treatment",
      entityId: treatment.id,
      newValue: { tankId, batchId: dto.batchId, type: dto.type, productName: dto.productName },
    });

    return treatment;
  }

  async listForTank(companyId: string, tankId: string) {
    await this.assertTankInTenant(companyId, tankId);

    return this.tenantPrisma.forTenant(companyId).treatment.findMany({
      where: { tankId, deletedAt: null },
      orderBy: { startedAt: "desc" },
    });
  }

  /**
   * Used by HarvestService before an ACTUAL harvest — the withdrawal period is counted from the
   * last dose (endedAt, falling back to startedAt for a single-dose treatment) per standard
   * veterinary practice, not from when the treatment began. Returns every treatment still
   * within its withdrawal window as of `asOf`, not just the first one, since a batch legally
   * can't be harvested while any of them are still active.
   */
  async getActiveWithdrawalBlocks(
    companyId: string,
    batchId: string,
    asOf: Date,
  ): Promise<WithdrawalBlock[]> {
    const treatments = await this.tenantPrisma.forTenant(companyId).treatment.findMany({
      where: { batchId, deletedAt: null, withdrawalPeriodDays: { not: null } },
    });

    const blocks: WithdrawalBlock[] = [];
    for (const treatment of treatments) {
      if (treatment.withdrawalPeriodDays === null) continue;
      const from = treatment.endedAt ?? treatment.startedAt;
      const withdrawalEndsAt = new Date(from);
      withdrawalEndsAt.setDate(withdrawalEndsAt.getDate() + treatment.withdrawalPeriodDays);
      if (asOf < withdrawalEndsAt) {
        blocks.push({ treatmentId: treatment.id, productName: treatment.productName, withdrawalEndsAt });
      }
    }
    return blocks;
  }
}
