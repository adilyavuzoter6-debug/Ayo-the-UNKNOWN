import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { TenantContext } from "../../common/types/request-context";
import { FcrQueryDto } from "./dto/fcr-query.dto";
import { SgrQueryDto } from "./dto/sgr-query.dto";
import { FcrCalculationService } from "./fcr-calculation.service";
import { SgrCalculationService } from "./sgr-calculation.service";

@ApiTags("fish-batches")
@ApiBearerAuth()
@Controller({ path: "fish-batches/:id", version: "1" })
export class BatchPerformanceController {
  constructor(
    private readonly fcrService: FcrCalculationService,
    private readonly sgrService: SgrCalculationService,
  ) {}

  @Get("fcr")
  @RequirePermission(Permission.FISH_BATCH_READ)
  fcr(
    @Param("id") id: string,
    @Query() query: FcrQueryDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.fcrService.calculate(
      tenant.companyId,
      id,
      new Date(query.periodStart),
      new Date(query.periodEnd),
    );
  }

  @Get("sgr")
  @RequirePermission(Permission.FISH_BATCH_READ)
  sgr(
    @Param("id") id: string,
    @Query() query: SgrQueryDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.sgrService.calculateSeries(
      tenant.companyId,
      id,
      query.periodStart ? new Date(query.periodStart) : undefined,
      query.periodEnd ? new Date(query.periodEnd) : undefined,
    );
  }
}
