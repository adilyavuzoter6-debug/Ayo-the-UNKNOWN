import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { ReceiveStockDto } from "./dto/receive-stock.dto";
import { CreateAdjustmentDto } from "./dto/create-adjustment.dto";
import { FeedInventoryService } from "./feed-inventory.service";

@ApiTags("feed-inventory")
@ApiBearerAuth()
@Controller({ path: "inventory-batches", version: "1" })
export class InventoryBatchesController {
  constructor(private readonly feedInventoryService: FeedInventoryService) {}

  @Get()
  @RequirePermission(Permission.FEED_INVENTORY_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.feedInventoryService.listForCompany(tenant.companyId);
  }

  @Get(":id")
  @RequirePermission(Permission.FEED_INVENTORY_READ)
  getById(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.feedInventoryService.findById(tenant.companyId, id);
  }

  @Get(":id/transactions")
  @RequirePermission(Permission.FEED_INVENTORY_READ)
  listTransactions(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.feedInventoryService.listTransactions(tenant.companyId, id);
  }

  @Post(":id/adjustments")
  @RequirePermission(Permission.FEED_INVENTORY_CREATE)
  createAdjustment(
    @Param("id") id: string,
    @Body() dto: CreateAdjustmentDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedInventoryService.createAdjustment(tenant.companyId, id, user.id, dto);
  }
}

@ApiTags("feed-inventory")
@ApiBearerAuth()
@Controller({ path: "warehouses/:warehouseId/inventory-batches", version: "1" })
export class WarehouseInventoryBatchesController {
  constructor(private readonly feedInventoryService: FeedInventoryService) {}

  @Post()
  @RequirePermission(Permission.FEED_INVENTORY_CREATE)
  receiveStock(
    @Param("warehouseId") warehouseId: string,
    @Body() dto: ReceiveStockDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedInventoryService.receiveStock(tenant.companyId, warehouseId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.FEED_INVENTORY_READ)
  list(@Param("warehouseId") warehouseId: string, @CurrentTenant() tenant: TenantContext) {
    return this.feedInventoryService.listForWarehouse(tenant.companyId, warehouseId);
  }
}
