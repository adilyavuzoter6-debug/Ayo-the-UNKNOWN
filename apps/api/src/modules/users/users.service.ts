import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

/**
 * User identity is global, not tenant-scoped (a user may belong to several companies via
 * CompanyMembership — docs/architecture/04-database-schema.md §4.2), so this service queries
 * `prisma.user` directly rather than through TenantPrismaService. It is explicitly exempted
 * from the "no direct this.prisma access" lint rule for exactly this reason — see
 * packages/config/src/eslint.nestjs.js.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * JIT-provisions a User row on first verified sign-in. `claims` come from optional custom
   * JWT claims (email/name) if the Clerk JWT template includes them; otherwise placeholders are
   * stored and should be reconciled later via a Clerk webhook or a `/users/me/sync` endpoint
   * (not built in Milestone 0).
   */
  async findOrProvisionByAuthProviderId(
    authProviderId: string,
    claims: { email?: string; fullName?: string },
  ): Promise<AuthenticatedUser> {
    const existing = await this.prisma.user.findUnique({ where: { authProviderId } });
    if (existing) {
      return {
        id: existing.id,
        authProviderId: existing.authProviderId,
        email: existing.email,
        fullName: existing.fullName,
      };
    }

    const created = await this.prisma.user.create({
      data: {
        authProviderId,
        email: claims.email ?? `${authProviderId}@pending.aquai.local`,
        fullName: claims.fullName ?? "Pending Profile",
      },
    });

    return {
      id: created.id,
      authProviderId: created.authProviderId,
      email: created.email,
      fullName: created.fullName,
    };
  }

  async findById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user
      ? { id: user.id, authProviderId: user.authProviderId, email: user.email, fullName: user.fullName }
      : null;
  }

  /**
   * Used by MembersService when accepting an invitation (matching the invited email to an
   * existing account) — kept here, not duplicated elsewhere, so User stays the only place that
   * touches `prisma.user` directly.
   */
  async findByEmail(email: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user
      ? { id: user.id, authProviderId: user.authProviderId, email: user.email, fullName: user.fullName }
      : null;
  }
}
