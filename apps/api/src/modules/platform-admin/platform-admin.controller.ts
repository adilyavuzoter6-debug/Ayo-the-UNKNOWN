import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SkipTenantContext } from "../../common/decorators/skip-tenant-context.decorator";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformAdminService } from "./platform-admin.service";

/**
 * @SkipTenantContext on every route: these span all tenants, so there is no single company to
 * resolve. PlatformAdminGuard replaces the tenant-scoped permission check — see its doc comment.
 */
@ApiTags("platform-admin")
@ApiBearerAuth()
@Controller({ path: "admin", version: "1" })
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  /** Unguarded by PlatformAdminGuard on purpose: any signed-in user may ask whether they are one. */
  @Get("me")
  @SkipTenantContext()
  async me(@CurrentUser() user: AuthenticatedUser) {
    return { isPlatformAdmin: await this.platformAdminService.isPlatformAdmin(user.id) };
  }

  @Get("companies")
  @SkipTenantContext()
  @UseGuards(PlatformAdminGuard)
  listCompanies() {
    return this.platformAdminService.listCompanies();
  }

  @Get("companies/:id")
  @SkipTenantContext()
  @UseGuards(PlatformAdminGuard)
  getCompany(@Param("id") id: string) {
    return this.platformAdminService.getCompanyDetail(id);
  }
}
