import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateFishBatchDto } from "./dto/create-fish-batch.dto";
import { CreateMovementDto } from "./dto/create-movement.dto";
import { SplitBatchDto } from "./dto/split-batch.dto";
import { MergeBatchesDto } from "./dto/merge-batches.dto";
import { FishBatchesService } from "./fish-batches.service";

@ApiTags("fish-batches")
@ApiBearerAuth()
@Controller({ path: "fish-batches/merge", version: "1" })
export class MergeBatchesController {
  constructor(private readonly fishBatchesService: FishBatchesService) {}

  @Post()
  @RequirePermission(Permission.BATCH_MOVEMENT_CREATE)
  merge(
    @Body() dto: MergeBatchesDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fishBatchesService.merge(tenant.companyId, user.id, dto);
  }
}

@ApiTags("fish-batches")
@ApiBearerAuth()
@Controller({ path: "fish-batches", version: "1" })
export class FishBatchesController {
  constructor(private readonly fishBatchesService: FishBatchesService) {}

  @Post()
  @RequirePermission(Permission.FISH_BATCH_CREATE)
  create(
    @Body() dto: CreateFishBatchDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fishBatchesService.create(tenant.companyId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.FISH_BATCH_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.fishBatchesService.listForCompany(tenant.companyId);
  }

  @Get(":id")
  @RequirePermission(Permission.FISH_BATCH_READ)
  getById(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.fishBatchesService.findById(tenant.companyId, id);
  }

  @Get(":id/history")
  @RequirePermission(Permission.FISH_BATCH_READ)
  getHistory(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.fishBatchesService.getHistory(tenant.companyId, id);
  }

  @Get(":id/movements")
  @RequirePermission(Permission.BATCH_MOVEMENT_READ)
  listMovements(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.fishBatchesService.listMovements(tenant.companyId, id);
  }

  @Post(":id/movements")
  @RequirePermission(Permission.BATCH_MOVEMENT_CREATE)
  addMovement(
    @Param("id") id: string,
    @Body() dto: CreateMovementDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fishBatchesService.addMovement(tenant.companyId, id, user.id, dto);
  }

  @Post(":id/split")
  @RequirePermission(Permission.BATCH_MOVEMENT_CREATE)
  split(
    @Param("id") id: string,
    @Body() dto: SplitBatchDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fishBatchesService.split(tenant.companyId, id, user.id, dto);
  }
}

@ApiTags("fish-batches")
@ApiBearerAuth()
@Controller({ path: "tanks/:tankId/fish-batches", version: "1" })
export class TankFishBatchesController {
  constructor(private readonly fishBatchesService: FishBatchesService) {}

  @Get()
  @RequirePermission(Permission.FISH_BATCH_READ)
  list(@Param("tankId") tankId: string, @CurrentTenant() tenant: TenantContext) {
    return this.fishBatchesService.listForTank(tenant.companyId, tankId);
  }
}
