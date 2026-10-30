import { Controller, Delete, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { ImportsService, MAX_FILE_BYTES, type UploadedSheetFile } from "./imports.service";

const upload = FileInterceptor("file", { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/** Excel import of a farm's history: check a file, write it, list and undo earlier imports. */
@ApiTags("imports")
@ApiBearerAuth()
@Controller({ path: "imports", version: "1" })
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  /** Reads and checks the file without writing anything. */
  @Post("preview")
  @RequirePermission(Permission.DATA_IMPORT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(upload)
  preview(@UploadedFile() file: UploadedSheetFile | undefined, @CurrentTenant() tenant: TenantContext) {
    return this.importsService.preview(tenant, file);
  }

  @Post()
  @RequirePermission(Permission.DATA_IMPORT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(upload)
  commit(
    @UploadedFile() file: UploadedSheetFile | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.importsService.commit(tenant, user.id, file);
  }

  @Get()
  @RequirePermission(Permission.DATA_IMPORT)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.importsService.list(tenant);
  }

  @Delete(":id")
  @RequirePermission(Permission.DATA_IMPORT)
  undo(@Param("id") id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser) {
    return this.importsService.undo(tenant, user.id, id);
  }
}
