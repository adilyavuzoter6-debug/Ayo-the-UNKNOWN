import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

/**
 * The one place in this codebase that deliberately reads across tenant boundaries, so the gate
 * is its own guard rather than a @RequirePermission on the normal chain: those permissions are
 * resolved from the caller's membership in ONE company (TenantContextGuard), which is meaningless
 * for a route that spans every company.
 *
 * "Platform admin" is the global User.isPlatformAdmin flag, not a company role: no API route
 * writes that column, so it can only ever be granted by a direct database write — a company
 * owner cannot mint one through the API and escalate into everyone else's data.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authUser?: AuthenticatedUser }>();

    const authUser = request.authUser;
    if (!authUser) {
      throw new ForbiddenException("No authenticated user resolved.");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: authUser.id, deletedAt: null },
      select: { isPlatformAdmin: true },
    });
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException("Platform administrator access required.");
    }

    return true;
  }
}
