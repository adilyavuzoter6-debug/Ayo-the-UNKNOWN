import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { CreateFishSpeciesDto } from "./dto/create-fish-species.dto";
import { FishSpeciesService } from "./fish-species.service";

@ApiTags("fish-species")
@ApiBearerAuth()
@Controller({ path: "fish-species", version: "1" })
export class FishSpeciesController {
  constructor(private readonly fishSpeciesService: FishSpeciesService) {}

  @Get()
  @RequirePermission(Permission.FISH_SPECIES_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.fishSpeciesService.listForCompany(tenant.companyId);
  }

  @Post()
  @RequirePermission(Permission.FISH_SPECIES_CREATE)
  create(
    @Body() dto: CreateFishSpeciesDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fishSpeciesService.create(tenant.companyId, user.id, dto);
  }
}
