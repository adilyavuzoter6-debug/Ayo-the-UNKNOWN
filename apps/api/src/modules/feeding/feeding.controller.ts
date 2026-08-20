import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateFeedingEventDto } from "./dto/create-feeding-event.dto";
import { FeedingService } from "./feeding.service";

@ApiTags("feeding")
@ApiBearerAuth()
@Controller({ path: "tanks/:tankId/feeding-events", version: "1" })
export class FeedingEventsController {
  constructor(private readonly feedingService: FeedingService) {}

  @Post()
  @RequirePermission(Permission.FEEDING_EVENT_CREATE)
  create(
    @Param("tankId") tankId: string,
    @Body() dto: CreateFeedingEventDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedingService.create(tenant.companyId, tankId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.FEEDING_EVENT_READ)
  list(@Param("tankId") tankId: string, @CurrentTenant() tenant: TenantContext) {
    return this.feedingService.listForTank(tenant.companyId, tankId);
  }
}
