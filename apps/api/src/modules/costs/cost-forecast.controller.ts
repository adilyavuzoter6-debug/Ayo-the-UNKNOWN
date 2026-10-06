import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { TenantContext } from "../../common/types/request-context";
import { CostForecastService } from "./cost-forecast.service";
import { CostForecastQueryDto } from "./dto/cost-forecast-query.dto";

@ApiTags("costs")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/cost-forecast", version: "1" })
export class CostForecastController {
  constructor(private readonly forecast: CostForecastService) {}

  @Get()
  @RequirePermission(Permission.COST_ENTRY_READ)
  get(
    @Param("farmId") farmId: string,
    @Query() query: CostForecastQueryDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.forecast.forecastFarm(tenant.companyId, farmId, {
      targetWeightG: query.targetWeightG ?? 500,
      targetFcr: query.targetFcr ?? 1.3,
      survivalPct: query.survivalPct ?? 95,
      feedPriceTryPerKg: query.feedPriceTryPerKg,
    });
  }
}
