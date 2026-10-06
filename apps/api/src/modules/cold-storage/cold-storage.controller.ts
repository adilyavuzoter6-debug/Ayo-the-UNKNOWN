import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateColdStorageEntryDto, UpdateColdStorageEntryDto } from "./dto/cold-storage.dto";
import { ColdStorageService } from "./cold-storage.service";

@ApiTags("cold-storage")
@ApiBearerAuth()
@Controller({ path: "farms/:farmId/cold-storage", version: "1" })
export class ColdStorageController {
  constructor(private readonly coldStorage: ColdStorageService) {}

  @Get()
  @RequirePermission(Permission.COLD_STORAGE_READ)
  list(@Param("farmId") farmId: string, @CurrentTenant() tenant: TenantContext) {
    return this.coldStorage.list(tenant.companyId, farmId);
  }

  @Patch(":entryId")
  @RequirePermission(Permission.COLD_STORAGE_CREATE)
  update(
    @Param("farmId") farmId: string,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateColdStorageEntryDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coldStorage.update(tenant.companyId, user.id, farmId, entryId, dto);
  }

  @Delete(":entryId")
  @RequirePermission(Permission.COLD_STORAGE_CREATE)
  remove(
    @Param("farmId") farmId: string,
    @Param("entryId") entryId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coldStorage.remove(tenant.companyId, user.id, farmId, entryId);
  }

  @Post()
  @RequirePermission(Permission.COLD_STORAGE_CREATE)
  add(
    @Param("farmId") farmId: string,
    @Body() dto: CreateColdStorageEntryDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.coldStorage.add(tenant.companyId, user.id, farmId, dto);
  }
}
