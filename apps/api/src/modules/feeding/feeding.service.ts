import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "../alerts/alerts.service";
import { FeedInventoryService } from "../feed-inventory/feed-inventory.service";
import { FeedInventoryProjectionService } from "../feed-inventory/feed-inventory-projection.service";
import type { CreateFeedingEventDto } from "./dto/create-feeding-event.dto";

@Injectable()
export class FeedingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
    private readonly feedInventoryService: FeedInventoryService,
    private readonly projection: FeedInventoryProjectionService,
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

  async create(companyId: string, tankId: string, userId: string, dto: CreateFeedingEventDto) {
    await this.assertTankInTenant(companyId, tankId);
    await this.assertBatchInTenant(companyId, dto.batchId);
    const inventoryBatch = await this.feedInventoryService.findById(
      companyId,
      dto.feedInventoryBatchId,
    );

    const liveBalance = await this.projection.getBalance(companyId, inventoryBatch.id);
    if (dto.quantityKg > liveBalance) {
      throw new BadRequestException(
        `Cannot feed ${dto.quantityKg} kg — only ${liveBalance} kg on hand for this lot.`,
      );
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const transaction = await this.tenantPrisma.forTenant(companyId).feedInventoryTransaction.create({
      data: {
        companyId,
        warehouseId: inventoryBatch.warehouseId,
        feedInventoryBatchId: inventoryBatch.id,
        type: "FEED_CONSUMPTION",
        quantityKg: dto.quantityKg,
        occurredAt,
        createdById: userId,
      },
    });

    const event = await this.tenantPrisma.forTenant(companyId).feedingEvent.create({
      data: {
        companyId,
        tankId,
        batchId: dto.batchId,
        feedProductId: inventoryBatch.feedProductId,
        quantityKg: dto.quantityKg,
        method: dto.method,
        occurredAt,
        createdById: userId,
        notes: dto.notes,
        inventoryTransactionId: transaction.id,
      },
    });

    await this.projection.recompute(companyId, inventoryBatch.id);
    await this.alertsService.evaluateLowFeedStockRule(companyId, inventoryBatch.id);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "FeedingEvent",
      entityId: event.id,
      newValue: { tankId, batchId: dto.batchId, quantityKg: dto.quantityKg },
    });

    return event;
  }

  async listForTank(companyId: string, tankId: string) {
    await this.assertTankInTenant(companyId, tankId);

    return this.tenantPrisma.forTenant(companyId).feedingEvent.findMany({
      where: { tankId },
      include: { feedProduct: true },
      orderBy: { occurredAt: "desc" },
    });
  }
}
