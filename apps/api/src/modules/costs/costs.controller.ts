import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { parsePeriodEnd } from "../../common/utils/period-end";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateCostEntryDto } from "./dto/create-cost-entry.dto";
import { UpdateCostEntryDto } from "./dto/update-cost-entry.dto";
import { CostsService } from "./costs.service";

@ApiTags("costs")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/cost-entries", version: "1" })
export class CostsController {
  constructor(private readonly costsService: CostsService) {}

  @Post()
  @RequirePermission(Permission.COST_ENTRY_CREATE)
  create(
    @Param("farmId") farmId: string,
    @Body() dto: CreateCostEntryDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.costsService.create(tenant.companyId, farmId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermission(Permission.COST_ENTRY_CREATE)
  update(
    @Param("farmId") farmId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCostEntryDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.costsService.update(tenant.companyId, farmId, user.id, id, dto);
  }

  @Delete(":id")
  @RequirePermission(Permission.COST_ENTRY_CREATE)
  remove(
    @Param("farmId") farmId: string,
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.costsService.remove(tenant.companyId, farmId, user.id, id);
  }

  @Get()
  @RequirePermission(Permission.COST_ENTRY_READ)
  list(
    @Param("farmId") farmId: string,
    @CurrentTenant() tenant: TenantContext,
    @Query("batchId") batchId?: string,
  ) {
    return this.costsService.listForFarm(tenant.companyId, farmId, batchId);
  }
}

@ApiTags("costs")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/cost-summary", version: "1" })
export class CostSummaryController {
  constructor(private readonly costsService: CostsService) {}

  @Get()
  @RequirePermission(Permission.COST_ENTRY_READ)
  get(
    @Param("farmId") farmId: string,
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.costsService.getCostSummary(
      tenant.companyId,
      farmId,
      new Date(periodStart),
      parsePeriodEnd(periodEnd),
    );
  }
}
