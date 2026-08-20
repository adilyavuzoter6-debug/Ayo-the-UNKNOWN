import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateWeightSampleDto } from "./dto/create-weight-sample.dto";
import { WeightSamplingService } from "./weight-sampling.service";

@ApiTags("weight-sampling")
@ApiBearerAuth()
@Controller({ path: "tanks/:tankId/weight-samples", version: "1" })
export class WeightSamplesController {
  constructor(private readonly weightSamplingService: WeightSamplingService) {}

  @Post()
  @RequirePermission(Permission.WEIGHT_SAMPLE_CREATE)
  create(
    @Param("tankId") tankId: string,
    @Body() dto: CreateWeightSampleDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.weightSamplingService.create(tenant.companyId, tankId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.WEIGHT_SAMPLE_READ)
  list(@Param("tankId") tankId: string, @CurrentTenant() tenant: TenantContext) {
    return this.weightSamplingService.listForTank(tenant.companyId, tankId);
  }
}
