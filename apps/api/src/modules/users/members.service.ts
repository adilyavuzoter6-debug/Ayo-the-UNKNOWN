import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Role } from "@aquai/types";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "./users.service";

const INVITATION_TTL_DAYS = 7;

/**
 * Owns CompanyMembership + Invitation — both tenant-scoped tables — so, unlike UsersService,
 * this goes through TenantPrismaService rather than PrismaService directly (no lint exemption
 * for this file; see packages/config/src/eslint.nestjs.js).
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async invite(
    companyId: string,
    invitedByUserId: string,
    input: { email: string; role: Role },
  ) {
    const client = this.tenantPrisma.forTenant(companyId);

    const existingUser = await this.usersService.findByEmail(input.email);
    if (existingUser) {
      const existingMembership = await client.companyMembership.findFirst({
        where: { userId: existingUser.id, status: { in: ["ACTIVE", "INVITED"] } },
      });
      if (existingMembership) {
        throw new ConflictException("This user is already a member of the company.");
      }
    }

    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitation = await client.invitation.create({
      data: {
        companyId,
        email: input.email,
        role: input.role,
        invitedById: invitedByUserId,
        expiresAt,
      },
    });

    await this.auditService.record({
      companyId,
      userId: invitedByUserId,
      action: "INVITE",
      entityType: "Invitation",
      entityId: invitation.id,
      newValue: { email: input.email, role: input.role },
    });

    // TODO(Phase 2, docs/architecture/03-backend-modules.md notifications module): deliver the
    // invitation by email. Milestone 0 returns the token directly so it can be exercised
    // end-to-end without a mail provider wired up yet.
    return invitation;
  }

  async listMembers(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).companyMembership.findMany({
      where: { status: "ACTIVE" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async listInvitations(companyId: string) {
    return this.tenantPrisma.forTenant(companyId).invitation.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  }

  /** True if revoking/demoting this membership would leave the company with zero active owners. */
  private async wouldRemoveLastOwner(
    membershipId: string,
    client: ReturnType<TenantPrismaService["forTenant"]>,
  ): Promise<boolean> {
    const membership = await client.companyMembership.findFirst({
      where: { id: membershipId, status: "ACTIVE" },
    });
    if (!membership || membership.role !== "COMPANY_OWNER") {
      return false;
    }
    const otherActiveOwners = await client.companyMembership.count({
      where: { role: "COMPANY_OWNER", status: "ACTIVE", id: { not: membershipId } },
    });
    return otherActiveOwners === 0;
  }

  async updateRole(companyId: string, membershipId: string, role: Role, updatedByUserId: string) {
    const client = this.tenantPrisma.forTenant(companyId);

    const existing = await client.companyMembership.findFirst({
      where: { id: membershipId, status: "ACTIVE" },
    });
    if (!existing) {
      throw new NotFoundException("Membership not found.");
    }
    if (role !== "COMPANY_OWNER" && (await this.wouldRemoveLastOwner(membershipId, client))) {
      throw new BadRequestException("Cannot change the role of the company's last owner.");
    }

    const updated = await client.companyMembership.update({
      where: { id: membershipId },
      data: { role },
      include: { user: true },
    });

    await this.auditService.record({
      companyId,
      userId: updatedByUserId,
      action: "UPDATE",
      entityType: "CompanyMembership",
      entityId: membershipId,
      previousValue: { role: existing.role },
      newValue: { role },
    });

    return updated;
  }

  async revoke(companyId: string, membershipId: string, revokedByUserId: string) {
    const client = this.tenantPrisma.forTenant(companyId);

    const existing = await client.companyMembership.findFirst({
      where: { id: membershipId, status: "ACTIVE" },
    });
    if (!existing) {
      throw new NotFoundException("Membership not found.");
    }
    if (await this.wouldRemoveLastOwner(membershipId, client)) {
      throw new BadRequestException("Cannot revoke the company's last owner.");
    }

    const revoked = await client.companyMembership.update({
      where: { id: membershipId },
      data: { status: "REVOKED" },
    });

    await this.auditService.record({
      companyId,
      userId: revokedByUserId,
      action: "REVOKE",
      entityType: "CompanyMembership",
      entityId: membershipId,
      previousValue: { status: "ACTIVE" },
      newValue: { status: "REVOKED" },
    });

    return revoked;
  }

  async revokeInvitation(companyId: string, invitationId: string, revokedByUserId: string) {
    const client = this.tenantPrisma.forTenant(companyId);

    const existing = await client.invitation.findFirst({
      where: { id: invitationId, status: "PENDING" },
    });
    if (!existing) {
      throw new NotFoundException("Invitation not found.");
    }

    const revoked = await client.invitation.update({
      where: { id: invitationId },
      data: { status: "REVOKED" },
    });

    await this.auditService.record({
      companyId,
      userId: revokedByUserId,
      action: "REVOKE",
      entityType: "Invitation",
      entityId: invitationId,
      newValue: { status: "REVOKED" },
    });

    return revoked;
  }

  async acceptInvitation(token: string, acceptingUserId: string, acceptingUserEmail: string) {
    const invitation = await this.tenantPrisma.findInvitationByToken(token);
    if (!invitation || invitation.status !== "PENDING") {
      throw new NotFoundException("Invitation not found or already used.");
    }
    if (invitation.expiresAt < new Date()) {
      throw new NotFoundException("Invitation has expired.");
    }
    if (invitation.email.toLowerCase() !== acceptingUserEmail.toLowerCase()) {
      throw new NotFoundException("Invitation does not match the signed-in account's email.");
    }

    const client = this.tenantPrisma.forTenant(invitation.companyId);

    const membership = await client.companyMembership.create({
      data: {
        companyId: invitation.companyId,
        userId: acceptingUserId,
        role: invitation.role,
        status: "ACTIVE",
        invitedAt: invitation.createdAt,
        joinedAt: new Date(),
      },
    });

    await client.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: acceptingUserId },
    });

    await this.auditService.record({
      companyId: invitation.companyId,
      userId: acceptingUserId,
      action: "ACCEPT_INVITATION",
      entityType: "CompanyMembership",
      entityId: membership.id,
      newValue: { role: membership.role },
    });

    return membership;
  }
}
