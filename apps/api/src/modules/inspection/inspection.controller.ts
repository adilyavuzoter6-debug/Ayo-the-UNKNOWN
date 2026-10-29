import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission, PlanFeature } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { RequirePlanFeature } from "../../common/decorators/require-plan-feature.decorator";
import type { TenantContext } from "../../common/types/request-context";
import { InspectionService } from "./inspection.service";

@ApiTags("inspection")
@ApiBearerAuth()
@RequirePlanFeature(PlanFeature.INSPECTION_REPORT)
@Controller({ path: "farms/:farmId/inspection-report", version: "1" })
export class InspectionController {
  constructor(private readonly inspectionService: InspectionService) {}

  @Get()
  @RequirePermission(Permission.INSPECTION_REPORT_READ)
  get(
    @Param("farmId") farmId: string,
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.inspectionService.getReport(
      tenant.companyId,
      farmId,
      new Date(periodStart),
      new Date(periodEnd),
    );
  }
}
