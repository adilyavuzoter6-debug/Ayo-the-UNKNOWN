import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { SkipTenantContext } from "../../common/decorators/skip-tenant-context.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

@ApiTags("companies")
@ApiBearerAuth()
@Controller({ path: "companies", version: "1" })
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @SkipTenantContext()
  create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.createWithOwner(dto, user.id);
  }

  /** Companies the caller belongs to — used by the client to populate the company switcher. */
  @Get()
  @SkipTenantContext()
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.listForUser(user.id);
  }

  @Get("current")
  @RequirePermission(Permission.COMPANY_READ)
  getCurrent(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.findByIdForUser(tenant.companyId, user.id);
  }
}
