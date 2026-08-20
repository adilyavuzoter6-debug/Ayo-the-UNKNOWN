import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateFeedProductDto } from "./dto/create-feed-product.dto";
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

  @Post()
  @RequirePermission(Permission.FEED_PRODUCT_CREATE)
  create(
    @Body() dto: CreateFeedProductDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedProductsService.create(tenant.companyId, user.id, dto);
  }
}
