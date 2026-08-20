import { Controller, Get, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { TenantContext } from "../../common/types/request-context";
import { FarmStatsService } from "./farm-stats.service";

@ApiTags("farm-stats")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/stock-summary", version: "1" })
export class FarmStatsController {
  constructor(private readonly farmStatsService: FarmStatsService) {}

  @Get()
  @RequirePermission(Permission.FISH_BATCH_READ)
  get(@Param("farmId") farmId: string, @CurrentTenant() tenant: TenantContext) {
    return this.farmStatsService.getStockSummary(tenant.companyId, farmId);
  }
}
