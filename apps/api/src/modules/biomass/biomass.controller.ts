import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { BiomassCalculationService } from "./biomass-calculation.service";

@ApiTags("biomass")
@ApiBearerAuth()
@Controller({ path: "fish-batches/:batchId/biomass", version: "1" })
export class BiomassController {
  constructor(private readonly biomassService: BiomassCalculationService) {}

  @Post("recalculate")
  @RequirePermission(Permission.BIOMASS_SNAPSHOT_CREATE)
  recalculate(
    @Param("batchId") batchId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.biomassService.recalculate(tenant.companyId, batchId, user.id);
  }

  @Get("history")
  @RequirePermission(Permission.BIOMASS_SNAPSHOT_READ)
  history(@Param("batchId") batchId: string, @CurrentTenant() tenant: TenantContext) {
    return this.biomassService.getHistory(tenant.companyId, batchId);
  }
}
