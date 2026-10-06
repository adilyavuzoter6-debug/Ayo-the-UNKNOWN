import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateTreatmentDto } from "./dto/create-treatment.dto";
import { UpdateTreatmentDto } from "./dto/update-treatment.dto";
import { TreatmentsService } from "./treatments.service";

@ApiTags("treatments")
@ApiBearerAuth()
@Controller({ path: "tanks/:tankId/treatments", version: "1" })
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Post()
  @RequirePermission(Permission.TREATMENT_CREATE)
  create(
    @Param("tankId") tankId: string,
    @Body() dto: CreateTreatmentDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.treatmentsService.create(tenant.companyId, tankId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermission(Permission.TREATMENT_CREATE)
  update(
    @Param("tankId") tankId: string,
    @Param("id") id: string,
    @Body() dto: UpdateTreatmentDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.treatmentsService.update(tenant.companyId, tankId, user.id, id, dto);
  }

  @Delete(":id")
  @RequirePermission(Permission.TREATMENT_CREATE)
  remove(
    @Param("tankId") tankId: string,
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.treatmentsService.remove(tenant.companyId, tankId, user.id, id);
  }

  @Get()
  @RequirePermission(Permission.TREATMENT_READ)
  list(@Param("tankId") tankId: string, @CurrentTenant() tenant: TenantContext) {
    return this.treatmentsService.listForTank(tenant.companyId, tankId);
  }
}
