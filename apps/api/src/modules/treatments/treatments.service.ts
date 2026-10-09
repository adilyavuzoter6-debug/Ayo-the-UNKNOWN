import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { SuppliesService } from "../supplies/supplies.service";
import type { CreateTreatmentDto } from "./dto/create-treatment.dto";
import type { UpdateTreatmentDto } from "./dto/update-treatment.dto";

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
    private readonly suppliesService: SuppliesService,
  ) {}

  /** Also used to resolve which farm's medicine stock a dose is drawn from. */
  private async assertTankInTenant(companyId: string, tankId: string) {
    const tank = await this.tenantPrisma
      .forTenant(companyId)
      .tank.findFirst({
        where: { id: tankId, deletedAt: null },
        include: { farmSection: true },
      });
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
    const tank = await this.assertTankInTenant(companyId, tankId);
    await this.assertBatchInTenant(companyId, dto.batchId);
    if ((dto.medicineItemId == null) !== (dto.doseLiters == null)) {
      throw new BadRequestException("İlaç stoğundan düşmek için hem ürün hem de litre miktarı girilmeli.");
    }

    const startedAt = new Date(dto.startedAt);
    const stockMovement = dto.medicineItemId
      ? await this.suppliesService.consume(companyId, userId, dto.medicineItemId, {
          farmId: tank.farmSection.farmId,
          quantity: dto.doseLiters!,
          occurredAt: startedAt,
          note: `Tedavi: ${dto.productName}`,
        })
      : null;

    const treatment = await this.tenantPrisma.forTenant(companyId).treatment.create({
      data: {
        companyId,
        batchId: dto.batchId,
        tankId,
        type: dto.type,
        productName: dto.productName,
        dosage: dto.dosage,
        withdrawalPeriodDays: dto.withdrawalPeriodDays,
        startedAt,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
        veterinarianId: dto.veterinarianId,
        createdById: userId,
        notes: dto.notes,
        medicineItemId: dto.medicineItemId,
        doseLiters: dto.doseLiters,
        stockMovementId: stockMovement?.id,
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

  /**
   * Corrects a recorded treatment. Harvest eligibility reads the treatment on every check, so a corrected
   * withdrawal period takes effect immediately — the same record is the source of truth either way.
   */
  async update(companyId: string, tankId: string, userId: string, treatmentId: string, dto: UpdateTreatmentDto) {
    const tank = await this.assertTankInTenant(companyId, tankId);
    const client = this.tenantPrisma.forTenant(companyId);
    const existing = await client.treatment.findFirst({
      where: { id: treatmentId, tankId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Treatment not found.");
    }

    const startedAt = dto.startedAt !== undefined ? new Date(dto.startedAt) : existing.startedAt;
    const endedAt =
      dto.endedAt === undefined ? existing.endedAt : dto.endedAt === null ? null : new Date(dto.endedAt);
    if (endedAt && endedAt.getTime() < startedAt.getTime()) {
      throw new BadRequestException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
    }

    // The stock link is only touched when the caller actually sends one of these two fields —
    // otherwise the existing dose (and the movement it already drew) is left exactly as it was.
    let stockFields: { medicineItemId: string | null; doseLiters: number | null; stockMovementId: string | null } | null = null;
    if (dto.medicineItemId !== undefined || dto.doseLiters !== undefined) {
      const nextItemId = dto.medicineItemId !== undefined ? dto.medicineItemId : existing.medicineItemId;
      const nextLiters =
        dto.doseLiters !== undefined ? dto.doseLiters : existing.doseLiters ? Number(existing.doseLiters) : null;
      if ((nextItemId == null) !== (nextLiters == null)) {
        throw new BadRequestException("İlaç stoğundan düşmek için hem ürün hem de litre miktarı girilmeli.");
      }
      const changed = nextItemId !== existing.medicineItemId || nextLiters !== (existing.doseLiters ? Number(existing.doseLiters) : null);
      if (changed) {
        if (existing.stockMovementId) {
          await this.suppliesService.removeMovement(companyId, userId, existing.stockMovementId);
        }
        const movement = nextItemId
          ? await this.suppliesService.consume(companyId, userId, nextItemId, {
              farmId: tank.farmSection.farmId,
              quantity: nextLiters!,
              occurredAt: startedAt,
              note: `Tedavi: ${dto.productName ?? existing.productName}`,
            })
          : null;
        stockFields = { medicineItemId: nextItemId, doseLiters: nextLiters, stockMovementId: movement?.id ?? null };
      }
    }

    await client.treatment.updateMany({
      where: { id: treatmentId, tankId, deletedAt: null },
      data: {
        type: dto.type ?? existing.type,
        productName: dto.productName ?? existing.productName,
        dosage: dto.dosage === undefined ? existing.dosage : dto.dosage,
        withdrawalPeriodDays:
          dto.withdrawalPeriodDays === undefined ? existing.withdrawalPeriodDays : dto.withdrawalPeriodDays,
        startedAt,
        endedAt,
        notes: dto.notes === undefined ? existing.notes : dto.notes,
        ...(stockFields ?? {}),
      },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "Treatment",
      entityId: treatmentId,
      newValue: { tankId, productName: dto.productName ?? existing.productName, withdrawalPeriodDays: dto.withdrawalPeriodDays ?? existing.withdrawalPeriodDays },
    });

    return client.treatment.findFirst({ where: { id: treatmentId } });
  }

  /**
   * Removes a treatment recorded by mistake. Soft-deleted: a treatment that was a real dose stays in the
   * record for inspection, but stops counting toward withdrawal checks and disappears from the list.
   */
  async remove(companyId: string, tankId: string, userId: string, treatmentId: string) {
    await this.assertTankInTenant(companyId, tankId);
    const client = this.tenantPrisma.forTenant(companyId);
    const existing = await client.treatment.findFirst({
      where: { id: treatmentId, tankId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("Treatment not found.");
    }

    if (existing.stockMovementId) {
      await this.suppliesService.removeMovement(companyId, userId, existing.stockMovementId);
    }

    const result = await client.treatment.updateMany({
      where: { id: treatmentId, tankId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("Treatment not found.");
    }

    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "Treatment",
      entityId: treatmentId,
      newValue: { tankId },
    });
    return { deleted: true };
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
