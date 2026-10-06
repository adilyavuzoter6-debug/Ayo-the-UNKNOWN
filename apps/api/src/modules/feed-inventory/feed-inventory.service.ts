import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertsService } from "../alerts/alerts.service";
import { ExchangeRatesService, roundRate } from "../exchange-rates/exchange-rates.service";
import { FeedInventoryProjectionService } from "./feed-inventory-projection.service";
import type { ReceiveStockDto } from "./dto/receive-stock.dto";
import type { CreateAdjustmentDto } from "./dto/create-adjustment.dto";

const INCLUDE_DETAIL = { warehouse: true, feedProduct: true, balance: true } as const;

@Injectable()
export class FeedInventoryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly alertsService: AlertsService,
    private readonly projection: FeedInventoryProjectionService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  private async assertWarehouseInTenant(companyId: string, warehouseId: string) {
    const warehouse = await this.tenantPrisma
      .forTenant(companyId)
      .warehouse.findFirst({ where: { id: warehouseId, deletedAt: null } });
    if (!warehouse) {
      throw new NotFoundException("Warehouse not found.");
    }
    return warehouse;
  }

  async findById(companyId: string, feedInventoryBatchId: string) {
    const batch = await this.tenantPrisma.forTenant(companyId).feedInventoryBatch.findFirst({
      where: { id: feedInventoryBatchId },
      include: INCLUDE_DETAIL,
    });
    if (!batch) {
      throw new NotFoundException("Feed inventory batch not found.");
    }
    return batch;
  }

  async listForCompany(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).feedInventoryBatch.findMany({
      include: INCLUDE_DETAIL,
      orderBy: { createdAt: "desc" },
    });
  }

  async listForWarehouse(companyId: string, warehouseId: string) {
    await this.assertWarehouseInTenant(companyId, warehouseId);

    return this.tenantPrisma.forTenant(companyId).feedInventoryBatch.findMany({
      where: { warehouseId },
      include: INCLUDE_DETAIL,
      orderBy: { createdAt: "desc" },
    });
  }

  async receiveStock(
    companyId: string,
    warehouseId: string,
    userId: string,
    dto: ReceiveStockDto,
  ) {
    const warehouse = await this.assertWarehouseInTenant(companyId, warehouseId);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    // The unit cost is stored in TRY on the lot (FeedInventoryBatch.unitCostPerKg) and the cost entry
    // keeps the original currency + rate. Resolved before any write, so a failed rate lookup leaves
    // no lot behind without its cost.
    const currency = dto.unitCostCurrency ?? "TRY";
    const unitCostRate =
      dto.unitCostAmount === undefined
        ? undefined
        : await this.exchangeRates.resolveTryRate(currency, occurredAt, dto.exchangeRate);
    const unitCostPerKgTry =
      dto.unitCostAmount === undefined || unitCostRate === undefined
        ? undefined
        : roundRate(dto.unitCostAmount * unitCostRate);

    const batch = await this.tenantPrisma.forTenant(companyId).feedInventoryBatch.create({
      data: {
        companyId,
        warehouseId,
        feedProductId: dto.feedProductId,
        supplierLotCode: dto.supplierLotCode,
        manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        unitCostPerKg: unitCostPerKgTry,
        createdById: userId,
      },
    });

    await this.tenantPrisma.forTenant(companyId).feedInventoryTransaction.create({
      data: {
        companyId,
        warehouseId,
        feedInventoryBatchId: batch.id,
        type: "PURCHASE",
        quantityKg: dto.quantityKg,
        occurredAt,
        createdById: userId,
        notes: dto.notes,
      },
    });

    // Auto-derived FEED cost entry (§4.7's CostEntry.sourceType convention) — only when the
    // purchase actually records a unit cost; a lot received without pricing simply isn't costed.
    if (dto.unitCostAmount !== undefined && unitCostRate !== undefined) {
      const amount = Math.round(dto.unitCostAmount * dto.quantityKg * 100) / 100;
      await this.tenantPrisma.forTenant(companyId).costEntry.create({
        data: {
          companyId,
          farmId: warehouse.farmId,
          category: "FEED",
          amount,
          currency,
          exchangeRate: unitCostRate,
          amountTry: Math.round(amount * unitCostRate * 100) / 100,
          incurredAt: occurredAt,
          sourceType: "FeedInventoryTransaction",
          sourceId: batch.id,
          createdById: userId,
          notes: `${dto.quantityKg} kg × ${dto.unitCostAmount} ${currency}/kg (auto)`,
        },
      });
    }

    await this.projection.recompute(companyId, batch.id);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "FeedInventoryBatch",
      entityId: batch.id,
      newValue: { warehouseId, feedProductId: dto.feedProductId, quantityKg: dto.quantityKg },
    });

    return this.findById(companyId, batch.id);
  }

  async listTransactions(companyId: string, feedInventoryBatchId: string) {
    await this.findById(companyId, feedInventoryBatchId);

    return this.tenantPrisma.forTenant(companyId).feedInventoryTransaction.findMany({
      where: { feedInventoryBatchId },
      orderBy: { occurredAt: "desc" },
    });
  }

  async createAdjustment(
    companyId: string,
    feedInventoryBatchId: string,
    userId: string,
    dto: CreateAdjustmentDto,
  ) {
    const batch = await this.findById(companyId, feedInventoryBatchId);
    const currentBalance = Number(batch.balance?.quantityOnHandKg ?? 0);
    if (currentBalance + dto.quantityKg < 0) {
      throw new BadRequestException(
        `This adjustment would take the balance below zero (currently ${currentBalance} kg).`,
      );
    }

    await this.tenantPrisma.forTenant(companyId).feedInventoryTransaction.create({
      data: {
        companyId,
        warehouseId: batch.warehouseId,
        feedInventoryBatchId,
        type: "ADJUSTMENT",
        quantityKg: dto.quantityKg,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdById: userId,
        notes: dto.notes,
      },
    });

    await this.projection.recompute(companyId, feedInventoryBatchId);
    await this.alertsService.evaluateLowFeedStockRule(companyId, feedInventoryBatchId);

    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "FeedInventoryTransaction",
      entityId: feedInventoryBatchId,
      newValue: { type: "ADJUSTMENT", quantityKg: dto.quantityKg },
    });

    return this.findById(companyId, feedInventoryBatchId);
  }
}
