import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateRecurringCostDto } from "./dto/create-recurring-cost.dto";
import { RecurringCostsService } from "./recurring-costs.service";

@ApiTags("costs")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/recurring-costs", version: "1" })
export class RecurringCostsController {
  constructor(private readonly recurringCosts: RecurringCostsService) {}

  @Get()
  @RequirePermission(Permission.COST_ENTRY_READ)
  list(@Param("farmId") farmId: string, @CurrentTenant() tenant: TenantContext) {
    return this.recurringCosts.listForFarm(tenant.companyId, farmId);
  }

  @Post()
  @RequirePermission(Permission.COST_ENTRY_CREATE)
  create(
    @Param("farmId") farmId: string,
    @Body() dto: CreateRecurringCostDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recurringCosts.create(tenant.companyId, farmId, user.id, dto);
  }

  @Delete(":id")
  @RequirePermission(Permission.COST_ENTRY_CREATE)
  async stop(
    @Param("farmId") farmId: string,
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.recurringCosts.stop(tenant.companyId, farmId, user.id, id);
    return { stopped: true };
  }
}
