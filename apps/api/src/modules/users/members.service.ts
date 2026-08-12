import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
