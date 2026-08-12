import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateFarmDto } from "./dto/create-farm.dto";
import { FarmsService } from "./farms.service";

@ApiTags("farms")
@ApiBearerAuth()
@Controller({ path: "farms", version: "1" })
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @RequirePermission(Permission.FARM_CREATE)
  create(
    @Body() dto: CreateFarmDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.farmsService.create(tenant.companyId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.FARM_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.farmsService.list(tenant.companyId);
  }

  @Get(":id")
  @RequirePermission(Permission.FARM_READ)
  getById(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.farmsService.findById(tenant.companyId, id);
  }
}
