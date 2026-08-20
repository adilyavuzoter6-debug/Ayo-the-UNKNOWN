import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import type { AlertStatus } from "@prisma/client";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { AlertsService } from "./alerts.service";

@ApiTags("alerts")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/alerts", version: "1" })
export class FarmAlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @RequirePermission(Permission.ALERT_READ)
  list(
    @Param("farmId") farmId: string,
    @Query("status") status: AlertStatus | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.alertsService.listForFarm(tenant.companyId, farmId, status);
  }
}

@ApiTags("alerts")
@ApiBearerAuth()
@Controller({ path: "alerts", version: "1" })
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Patch(":id/resolve")
  @RequirePermission(Permission.ALERT_RESOLVE)
  resolve(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alertsService.resolve(tenant.companyId, id, user.id);
  }
}
