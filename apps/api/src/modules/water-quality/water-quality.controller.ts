import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateWaterQualityReadingDto } from "./dto/create-water-quality-reading.dto";
import { WaterQualityService } from "./water-quality.service";

@ApiTags("water-quality")
@ApiBearerAuth()
@Controller({ path: "tanks/:tankId/water-quality-readings", version: "1" })
export class WaterQualityController {
  constructor(private readonly waterQualityService: WaterQualityService) {}

  @Post()
  @RequirePermission(Permission.WATER_QUALITY_READING_CREATE)
  create(
    @Param("tankId") tankId: string,
    @Body() dto: CreateWaterQualityReadingDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waterQualityService.create(tenant.companyId, tankId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.WATER_QUALITY_READING_READ)
  list(@Param("tankId") tankId: string, @CurrentTenant() tenant: TenantContext) {
    return this.waterQualityService.listForTank(tenant.companyId, tankId);
  }
}
