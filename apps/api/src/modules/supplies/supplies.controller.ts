import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import {
  CreateSupplyItemDto,
  ReceiveSupplyDto,
  TransferSupplyDto,
  UpdateSupplyMovementDto,
} from "./dto/supply.dto";
import { SuppliesService } from "./supplies.service";

@ApiTags("supplies")
@ApiBearerAuth()
@Controller({ path: "supply-items", version: "1" })
export class SuppliesController {
  constructor(private readonly supplies: SuppliesService) {}

  @Get()
  @RequirePermission(Permission.SUPPLY_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.supplies.list(tenant.companyId);
  }

  @Post()
  @RequirePermission(Permission.SUPPLY_CREATE)
  create(
    @Body() dto: CreateSupplyItemDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplies.createItem(tenant.companyId, user.id, dto);
  }

  @Get(":id/movements")
  @RequirePermission(Permission.SUPPLY_READ)
  listMovements(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.supplies.listMovements(tenant.companyId, id);
  }

  @Patch("movements/:movementId")
  @RequirePermission(Permission.SUPPLY_CREATE)
  updateMovement(
    @Param("movementId") movementId: string,
    @Body() dto: UpdateSupplyMovementDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplies.updateMovement(tenant.companyId, user.id, movementId, dto);
  }

  @Delete("movements/:movementId")
  @RequirePermission(Permission.SUPPLY_CREATE)
  removeMovement(
    @Param("movementId") movementId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplies.removeMovement(tenant.companyId, user.id, movementId);
  }

  @Post(":id/receive")
  @RequirePermission(Permission.SUPPLY_CREATE)
  receive(
    @Param("id") id: string,
    @Body() dto: ReceiveSupplyDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplies.receive(tenant.companyId, user.id, id, dto);
  }

  @Post(":id/transfer")
  @RequirePermission(Permission.SUPPLY_CREATE)
  transfer(
    @Param("id") id: string,
    @Body() dto: TransferSupplyDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supplies.transfer(tenant.companyId, user.id, id, dto);
  }
}
