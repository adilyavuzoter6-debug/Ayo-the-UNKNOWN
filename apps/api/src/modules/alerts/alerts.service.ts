import { Injectable, NotFoundException } from "@nestjs/common";
import type { AlertStatus } from "@prisma/client";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";

const BIOMASS_ALERT_THRESHOLD_RATIO = 0.9;
const LOW_FEED_STOCK_THRESHOLD_KG = 20;
const MORTALITY_SPIKE_RATIO = 0.05;

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
    await this.evaluateMissingDailyRecordsRule(companyId, farmId);

    return this.tenantPrisma.forTenant(companyId).alert.findMany({
      where: {
        status,
        OR: [{ farmId }, { tank: { farmSection: { farmId } } }],
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

  /**
   * Called after a FeedInventoryBalance recompute (FeedingService.create, FeedInventoryService.
   * createAdjustment) — same "re-derive, don't increment" pattern as evaluateBiomassRule.
   * Scoped to the farm, not the individual warehouse/lot: the Alert model (docs/architecture/
   * 04-database-schema.md §4.7) has no warehouseId/feedProductId column, so one open alert per
   * farm is the finest granularity available without a schema change beyond this milestone's
   * scope — the message names the specific lot that triggered it.
   */
  async evaluateLowFeedStockRule(companyId: string, feedInventoryBatchId: string): Promise<void> {
    const client = this.tenantPrisma.forTenant(companyId);

    const batch = await client.feedInventoryBatch.findFirst({
      where: { id: feedInventoryBatchId },
      include: { balance: true, warehouse: true, feedProduct: true },
    });
    if (!batch || !batch.balance) {
      return;
    }

    const onHandKg = Number(batch.balance.quantityOnHandKg);
    if (onHandKg >= LOW_FEED_STOCK_THRESHOLD_KG) {
      return;
    }

    const farmId = batch.warehouse.farmId;
    const existingOpen = await client.alert.findFirst({
      where: { farmId, type: "LOW_FEED_STOCK", status: "OPEN" },
    });
    if (existingOpen) {
      return;
    }

    const alert = await client.alert.create({
      data: {
        companyId,
        farmId,
        type: "LOW_FEED_STOCK",
        severity: "MEDIUM",
        message: `${batch.feedProduct.name} stock in ${batch.warehouse.name} is low (${onHandKg.toFixed(1)} kg remaining).`,
      },
    });

    await this.auditService.record({
      companyId,
      action: "CREATE",
      entityType: "Alert",
      entityId: alert.id,
      newValue: { type: alert.type, farmId, severity: alert.severity },
    });
  }

  /**
   * Called from MortalityService.create() with the tank's live count *before* the event was
   * recorded — a single mortality event removing more than MORTALITY_SPIKE_RATIO of the
   * pre-event population is unusual enough to flag immediately. The doc's fuller design
   * (§10.6: a 30-day rolling-baseline comparison) needs a scheduler to maintain that baseline,
   * which this codebase doesn't have yet (same deferred-infra note as every prior milestone) —
   * this single-event-ratio check is the synchronous approximation that ships now.
   */
  async evaluateMortalitySpikeRule(
    companyId: string,
    tankId: string,
    fishCount: number,
    liveCountBeforeEvent: number,
  ): Promise<void> {
    if (liveCountBeforeEvent <= 0) {
      return;
    }
    const rate = fishCount / liveCountBeforeEvent;
    if (rate < MORTALITY_SPIKE_RATIO) {
      return;
    }

    const client = this.tenantPrisma.forTenant(companyId);
    const existingOpen = await client.alert.findFirst({
      where: { tankId, type: "MORTALITY_SPIKE", status: "OPEN" },
    });
    if (existingOpen) {
      return;
    }

    const tank = await client.tank.findFirst({ where: { id: tankId } });
    const alert = await client.alert.create({
      data: {
        companyId,
        tankId,
        type: "MORTALITY_SPIKE",
        severity: "HIGH",
        message: `Tank ${tank?.code ?? tankId} reported ${fishCount} mortalities in one event — ${(rate * 100).toFixed(1)}% of its live population.`,
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

  /**
   * Evaluated on read (listForFarm), not on write — this rule is about the *absence* of an
   * event, which nothing "writes into". A nightly scheduled sweep is the doc's eventual design;
   * without a scheduler yet (deferred, same as every prior milestone), re-deriving it on every
   * alerts-list fetch is the synchronous equivalent — cheap, since a farm's active-tank count is
   * small. Only tanks currently holding fish are checked (an empty tank has nothing to log).
   */
  async evaluateMissingDailyRecordsRule(companyId: string, farmId: string): Promise<void> {
    const client = this.tenantPrisma.forTenant(companyId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tanks = await client.tank.findMany({
      where: { farmSection: { farmId }, deletedAt: null, status: "ACTIVE" },
      include: { batchTankStates: { where: { estimatedCount: { gt: 0 } } } },
    });

    for (const tank of tanks) {
      if (tank.batchTankStates.length === 0) {
        continue;
      }

      const [feedingToday, waterToday] = await Promise.all([
        client.feedingEvent.findFirst({ where: { tankId: tank.id, occurredAt: { gte: todayStart } } }),
        client.waterQualityReading.findFirst({
          where: { tankId: tank.id, occurredAt: { gte: todayStart } },
        }),
      ]);
      if (feedingToday || waterToday) {
        continue;
      }

      const existingOpen = await client.alert.findFirst({
        where: { tankId: tank.id, type: "MISSING_DAILY_RECORDS", status: "OPEN" },
      });
      if (existingOpen) {
        continue;
      }

      const alert = await client.alert.create({
        data: {
          companyId,
          tankId: tank.id,
          type: "MISSING_DAILY_RECORDS",
          severity: "LOW",
          message: `Tank ${tank.code} has no feeding or water quality record today.`,
        },
      });

      await this.auditService.record({
        companyId,
        action: "CREATE",
        entityType: "Alert",
        entityId: alert.id,
        newValue: { type: alert.type, tankId: tank.id, severity: alert.severity },
      });
    }
  }
}
