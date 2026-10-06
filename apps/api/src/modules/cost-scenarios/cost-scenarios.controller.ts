import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CalculateScenariosDto, SaveScenarioDto } from "./dto/scenario-input.dto";
import { CostScenariosService } from "./cost-scenarios.service";

@ApiTags("cost-scenarios")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/cost-scenarios", version: "1" })
export class CostScenariosController {
  constructor(private readonly scenarios: CostScenariosService) {}

  @Get("prefill")
  @RequirePermission(Permission.COST_ENTRY_READ)
  prefill(
    @Param("farmId") farmId: string,
    @Query("batchId") batchId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.scenarios.prefill(tenant.companyId, farmId, batchId);
  }

  /** Calculation only. Nothing is stored and no stock, feed or cost record is touched. */
  @Post("calculate")
  @RequirePermission(Permission.COST_ENTRY_READ)
  calculate(
    @Param("farmId") farmId: string,
    @Body() dto: CalculateScenariosDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.scenarios.calculate(tenant.companyId, farmId, dto);
  }

  @Get()
  @RequirePermission(Permission.COST_ENTRY_READ)
  list(@Param("farmId") farmId: string, @CurrentTenant() tenant: TenantContext) {
    return this.scenarios.list(tenant.companyId, farmId);
  }

  @Post()
  @RequirePermission(Permission.COST_ENTRY_CREATE)
  save(
    @Param("farmId") farmId: string,
    @Body() dto: SaveScenarioDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scenarios.save(tenant.companyId, farmId, user.id, dto);
  }

  @Delete(":id")
  @RequirePermission(Permission.COST_ENTRY_CREATE)
  remove(
    @Param("farmId") farmId: string,
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scenarios.remove(tenant.companyId, farmId, user.id, id);
  }
}
