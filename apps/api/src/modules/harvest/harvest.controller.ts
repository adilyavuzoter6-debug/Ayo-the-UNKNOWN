import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateHarvestRecordDto } from "./dto/create-harvest-record.dto";
import { HarvestService } from "./harvest.service";

@ApiTags("harvest")
@ApiBearerAuth()
@Controller({ path: "tanks/:tankId/harvest-records", version: "1" })
export class HarvestController {
  constructor(private readonly harvestService: HarvestService) {}

  @Post()
  @RequirePermission(Permission.HARVEST_RECORD_CREATE)
  create(
    @Param("tankId") tankId: string,
    @Body() dto: CreateHarvestRecordDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.harvestService.create(tenant.companyId, tankId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.HARVEST_RECORD_READ)
  list(@Param("tankId") tankId: string, @CurrentTenant() tenant: TenantContext) {
    return this.harvestService.listForTank(tenant.companyId, tankId);
  }
}
