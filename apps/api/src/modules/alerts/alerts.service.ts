import { Injectable, NotFoundException } from "@nestjs/common";
import type { AlertStatus } from "@prisma/client";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";

const BIOMASS_ALERT_THRESHOLD_RATIO = 0.9;

@Injectable()
export class AlertsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertFarmInTenant(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
    return farm;
  }

  async listForFarm(companyId: string, farmId: string, status?: AlertStatus) {
    await this.assertFarmInTenant(companyId, farmId);

    return this.tenantPrisma.forTenant(companyId).alert.findMany({
      where: {
        status,
        tank: { farmSection: { farmId } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(companyId: string, alertId: string) {
    const alert = await this.tenantPrisma
      .forTenant(companyId)
      .alert.findFirst({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException("Alert not found.");
    }
    return alert;
  }

  async resolve(companyId: string, alertId: string, userId: string) {
    const existing = await this.findById(companyId, alertId);

    const resolved = await this.tenantPrisma.forTenant(companyId).alert.update({
      where: { id: alertId },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: userId },
    });

    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "Alert",
      entityId: alertId,
      previousValue: { status: existing.status },
      newValue: { status: resolved.status },
    });

    return resolved;
  }

  /**
   * Called after a batch's projection has been recomputed (BatchProjectionService.recompute) —
   * see FishBatchesService's create/addMovement/split/merge. Sums the tank's live
   * BatchTankState rows (fish count × each batch's current avg weight, from
   * BatchCurrentState) to get current biomass and, once it crosses
   * BIOMASS_ALERT_THRESHOLD_RATIO of Tank.maxBiomassKg, opens a BIOMASS_CAPACITY alert —
   * unless one is already OPEN for that tank, so repeated stockings don't spam duplicates.
   */
  async evaluateBiomassRule(companyId: string, tankId: string): Promise<void> {
    const client = this.tenantPrisma.forTenant(companyId);

    const tank = await client.tank.findFirst({ where: { id: tankId, deletedAt: null } });
    if (!tank || tank.maxBiomassKg == null) {
      return;
    }

    const tankStates = await client.batchTankState.findMany({
      where: { tankId, estimatedCount: { gt: 0 } },
      include: { batch: { include: { currentState: true } } },
    });
    const biomassKg = tankStates.reduce((sum, state) => {
      const avgWeightG = Number(
        state.batch.currentState?.estimatedAvgWeightG ?? state.batch.initialAvgWeightG,
      );
      return sum + (state.estimatedCount * avgWeightG) / 1000;
    }, 0);

    const maxBiomassKg = Number(tank.maxBiomassKg);
    const ratio = maxBiomassKg > 0 ? biomassKg / maxBiomassKg : 0;
    if (ratio < BIOMASS_ALERT_THRESHOLD_RATIO) {
      return;
    }

    const existingOpen = await client.alert.findFirst({
      where: { tankId, type: "BIOMASS_CAPACITY", status: "OPEN" },
    });
    if (existingOpen) {
      return;
    }

    const alert = await client.alert.create({
      data: {
        companyId,
        tankId,
        type: "BIOMASS_CAPACITY",
        severity: "HIGH",
        message: `Tank ${tank.code} biomass (${biomassKg.toFixed(1)} kg) has reached ${(ratio * 100).toFixed(0)}% of its ${maxBiomassKg.toFixed(1)} kg capacity.`,
      },
    });

    await this.auditService.record({
      companyId,
      action: "CREATE",
      entityType: "Alert",
      entityId: alert.id,
      newValue: { type: alert.type, tankId, severity: alert.severity },
    });
  }
}
