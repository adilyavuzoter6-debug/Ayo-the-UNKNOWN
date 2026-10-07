import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateFeedProductDto, UpdateFeedProductDto } from "./dto/create-feed-product.dto";
import { FeedProductsService } from "./feed-products.service";

@ApiTags("feed-products")
@ApiBearerAuth()
@Controller({ path: "feed-products", version: "1" })
export class FeedProductsController {
  constructor(private readonly feedProductsService: FeedProductsService) {}

  @Get()
  @RequirePermission(Permission.FEED_PRODUCT_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.feedProductsService.listForCompany(tenant.companyId);
  }

  @Get("deleted")
  @RequirePermission(Permission.FEED_PRODUCT_CREATE)
  listDeleted(@CurrentTenant() tenant: TenantContext) {
    return this.feedProductsService.listDeleted(tenant.companyId);
  }

  @Post()
  @RequirePermission(Permission.FEED_PRODUCT_CREATE)
  create(
    @Body() dto: CreateFeedProductDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedProductsService.create(tenant.companyId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermission(Permission.FEED_PRODUCT_CREATE)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateFeedProductDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedProductsService.update(tenant.companyId, user.id, id, dto);
  }

  @Delete(":id")
  @RequirePermission(Permission.FEED_PRODUCT_CREATE)
  remove(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedProductsService.remove(tenant.companyId, user.id, id);
  }

  @Post(":id/restore")
  @RequirePermission(Permission.FEED_PRODUCT_CREATE)
  restore(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedProductsService.restore(tenant.companyId, user.id, id);
  }
}
