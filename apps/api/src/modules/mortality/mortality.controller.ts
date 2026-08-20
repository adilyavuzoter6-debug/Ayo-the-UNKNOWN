import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateMortalityEventDto } from "./dto/create-mortality-event.dto";
import { MortalityService } from "./mortality.service";

@ApiTags("mortality")
@ApiBearerAuth()
@Controller({ path: "tanks/:tankId/mortality-events", version: "1" })
export class MortalityEventsController {
  constructor(private readonly mortalityService: MortalityService) {}

  @Post()
  @RequirePermission(Permission.MORTALITY_EVENT_CREATE)
  create(
    @Param("tankId") tankId: string,
    @Body() dto: CreateMortalityEventDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mortalityService.create(tenant.companyId, tankId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.MORTALITY_EVENT_READ)
  list(@Param("tankId") tankId: string, @CurrentTenant() tenant: TenantContext) {
    return this.mortalityService.listForTank(tenant.companyId, tankId);
  }
}
