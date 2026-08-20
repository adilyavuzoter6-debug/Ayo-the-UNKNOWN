import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateFarmSectionDto } from "./dto/create-farm-section.dto";
import { UpdateFarmSectionDto } from "./dto/update-farm-section.dto";
import { FarmSectionsService } from "./farm-sections.service";

@ApiTags("farm-sections")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/sections", version: "1" })
export class FarmSectionsController {
  constructor(private readonly farmSectionsService: FarmSectionsService) {}

  @Post()
  @RequirePermission(Permission.FARM_CREATE)
  create(
    @Param("farmId") farmId: string,
    @Body() dto: CreateFarmSectionDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.farmSectionsService.create(tenant.companyId, farmId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.FARM_READ)
  list(@Param("farmId") farmId: string, @CurrentTenant() tenant: TenantContext) {
    return this.farmSectionsService.listForFarm(tenant.companyId, farmId);
  }
}

@ApiTags("farm-sections")
@ApiBearerAuth()
@Controller({ path: "farm-sections/:sectionId", version: "1" })
export class FarmSectionController {
  constructor(private readonly farmSectionsService: FarmSectionsService) {}

  @Patch()
  @RequirePermission(Permission.FARM_UPDATE)
  update(
    @Param("sectionId") sectionId: string,
    @Body() dto: UpdateFarmSectionDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.farmSectionsService.update(tenant.companyId, sectionId, user.id, dto);
  }

  @Delete()
  @RequirePermission(Permission.FARM_DELETE)
  remove(
    @Param("sectionId") sectionId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.farmSectionsService.remove(tenant.companyId, sectionId, user.id);
  }
}
