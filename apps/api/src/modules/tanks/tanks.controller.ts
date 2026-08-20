import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateTankDto } from "./dto/create-tank.dto";
import { UpdateTankDto } from "./dto/update-tank.dto";
import { TanksService } from "./tanks.service";

@ApiTags("tanks")
@ApiBearerAuth()
@Controller({ path: "tanks", version: "1" })
export class TanksController {
  constructor(private readonly tanksService: TanksService) {}

  @Get(":id")
  @RequirePermission(Permission.TANK_READ)
  getById(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.tanksService.findById(tenant.companyId, id);
  }

  @Patch(":id")
  @RequirePermission(Permission.TANK_UPDATE)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTankDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tanksService.update(tenant.companyId, id, user.id, dto);
  }

  @Delete(":id")
  @RequirePermission(Permission.TANK_DELETE)
  remove(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tanksService.remove(tenant.companyId, id, user.id);
  }
}

@ApiTags("tanks")
@ApiBearerAuth()
@Controller({ path: "farm-sections/:sectionId/tanks", version: "1" })
export class FarmSectionTanksController {
  constructor(private readonly tanksService: TanksService) {}

  @Post()
  @RequirePermission(Permission.TANK_CREATE)
  create(
    @Param("sectionId") sectionId: string,
    @Body() dto: CreateTankDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tanksService.create(tenant.companyId, sectionId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.TANK_READ)
  list(@Param("sectionId") sectionId: string, @CurrentTenant() tenant: TenantContext) {
    return this.tanksService.listForSection(tenant.companyId, sectionId);
  }
}

@ApiTags("tanks")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/tanks", version: "1" })
export class FarmTanksController {
  constructor(private readonly tanksService: TanksService) {}

  @Get()
  @RequirePermission(Permission.TANK_READ)
  list(@Param("farmId") farmId: string, @CurrentTenant() tenant: TenantContext) {
    return this.tanksService.listForFarm(tenant.companyId, farmId);
  }
}
