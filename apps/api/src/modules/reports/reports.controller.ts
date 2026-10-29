import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission, PlanFeature } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { RequirePlanFeature } from "../../common/decorators/require-plan-feature.decorator";
import type { TenantContext } from "../../common/types/request-context";
import { parsePeriodEnd } from "../../common/utils/period-end";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@ApiBearerAuth()
@RequirePlanFeature(PlanFeature.ADVANCED_REPORTS)
@Controller({ path: "reports", version: "1" })
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("farm-comparison")
  @RequirePermission(Permission.INSPECTION_REPORT_READ)
  farmComparison(
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.reportsService.farmComparison(tenant, new Date(periodStart), parsePeriodEnd(periodEnd));
  }

  @Get("records")
  @RequirePermission(Permission.INSPECTION_REPORT_READ)
  records(
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string,
    @Query("farmIds") farmIds: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.reportsService.records(
      tenant,
      new Date(periodStart),
      parsePeriodEnd(periodEnd),
      farmIds ? farmIds.split(",").filter(Boolean) : [],
    );
  }

  @Get("anomalies")
  @RequirePermission(Permission.FISH_BATCH_READ)
  anomalies(@CurrentTenant() tenant: TenantContext) {
    return this.reportsService.anomalies(tenant);
  }
}
