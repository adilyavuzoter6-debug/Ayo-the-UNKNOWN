import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { TenantContext } from "../../common/types/request-context";
import { AuditService } from "./audit.service";

@ApiTags("audit-logs")
@ApiBearerAuth()
@Controller({ path: "audit-logs", version: "1" })
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission(Permission.AUDIT_LOG_READ)
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
  ) {
    return this.auditService.listForCompany(tenant.companyId, {
      page: Number(page),
      pageSize: Math.min(Number(pageSize), 100),
    });
  }
}
