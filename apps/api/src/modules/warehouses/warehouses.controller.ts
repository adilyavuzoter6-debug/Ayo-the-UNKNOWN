import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { WarehousesService } from "./warehouses.service";

@ApiTags("warehouses")
@ApiBearerAuth()
@Controller({ path: "warehouses", version: "1" })
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @RequirePermission(Permission.WAREHOUSE_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.warehousesService.listForCompany(tenant.companyId);
  }
}

@ApiTags("warehouses")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/warehouses", version: "1" })
export class FarmWarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermission(Permission.WAREHOUSE_CREATE)
  create(
    @Param("farmId") farmId: string,
    @Body() dto: CreateWarehouseDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.create(tenant.companyId, farmId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.WAREHOUSE_READ)
  list(@Param("farmId") farmId: string, @CurrentTenant() tenant: TenantContext) {
    return this.warehousesService.listForFarm(tenant.companyId, farmId);
  }
}
