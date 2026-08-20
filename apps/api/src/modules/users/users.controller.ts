import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Permission } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { SkipTenantContext } from "../../common/decorators/skip-tenant-context.decorator";
import type { AuthenticatedUser, TenantContext } from "../../common/types/request-context";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { InviteUserDto } from "./dto/invite-user.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
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

  @Get("invitations")
  @RequirePermission(Permission.USER_INVITE)
  listInvitations(@CurrentTenant() tenant: TenantContext) {
    return this.membersService.listInvitations(tenant.companyId);
  }

  @Patch(":membershipId/role")
  @RequirePermission(Permission.USER_UPDATE_ROLE)
  updateRole(
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.updateRole(tenant.companyId, membershipId, dto.role, user.id);
  }

  @Delete(":membershipId")
  @RequirePermission(Permission.USER_REVOKE)
  revoke(
    @Param("membershipId") membershipId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.revoke(tenant.companyId, membershipId, user.id);
  }

  @Delete("invitations/:invitationId")
  @RequirePermission(Permission.USER_INVITE)
  revokeInvitation(
    @Param("invitationId") invitationId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.revokeInvitation(tenant.companyId, invitationId, user.id);
  }

  @Post("accept-invitation")
  @SkipTenantContext()
  acceptInvitation(@Body() dto: AcceptInvitationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.membersService.acceptInvitation(dto.token, user.id, user.email);
  }
}
