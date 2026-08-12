import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { SkipTenantContext } from "../../common/decorators/skip-tenant-context.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { InviteUserDto } from "./dto/invite-user.dto";
import { MembersService } from "./members.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller({ path: "users", version: "1" })
export class UsersController {
  constructor(private readonly membersService: MembersService) {}

  @Post("invite")
  @RequirePermission(Permission.USER_INVITE)
  invite(
    @Body() dto: InviteUserDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.invite(tenant.companyId, user.id, dto);
  }

  @Get()
  @RequirePermission(Permission.USER_READ)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.membersService.listMembers(tenant.companyId);
  }

  @Post("accept-invitation")
  @SkipTenantContext()
  acceptInvitation(@Body() dto: AcceptInvitationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.membersService.acceptInvitation(dto.token, user.id, user.email);
  }
}
