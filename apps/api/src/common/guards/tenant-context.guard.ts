import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SKIP_TENANT_CONTEXT_KEY } from "../decorators/skip-tenant-context.decorator";
import type { AuthenticatedUser, TenantContext } from "../types/request-context";

/**
 * Resolves the request's tenant context AFTER ClerkAuthGuard has attached `authUser`, and
 * BEFORE PermissionsGuard runs. See docs/architecture/06-multi-tenant-security.md §6.2 Layer 1,
 * point 1, which names this "TenantContextInterceptor" — implemented here as a Guard (not a
 * NestInterceptor) because Nest runs ALL guards before ANY interceptor; PermissionsGuard depends
 * on `request.tenant` being set, so tenant resolution must also be a guard to run first, in
 * registration order (this guard is registered before PermissionsGuard in AppModule).
 *
 * The active company is never taken from the request body or an unvalidated query param. The
 * client sends the company it wants to act as via the `X-Company-Id` header (set after the user
 * picks a company in the UI); this guard re-validates that the authenticated user has an ACTIVE
 * membership in that exact company on every request — never cached beyond the request, never
 * trusted from a prior response. If the header is omitted and the user has exactly one ACTIVE
 * membership, that membership is used as a convenience default.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() routes never get a request.authUser (ClerkAuthGuard short-circuits before
    // setting it), so they must also skip tenant resolution — not just SKIP_TENANT_CONTEXT_KEY,
    // which is for routes that DO require auth but not a company context (e.g. POST /companies).
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_CONTEXT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || skip) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { authUser?: AuthenticatedUser; tenant?: TenantContext }>();

    const authUser = request.authUser;
    if (!authUser) {
      // ClerkAuthGuard runs first and would already have rejected the request; this is a
      // defensive guard against misconfiguration (e.g. registration order changed later).
      throw new ForbiddenException("No authenticated user resolved.");
    }

    const requestedCompanyId = request.headers["x-company-id"] as string | undefined;

    const membership = requestedCompanyId
      ? await this.prisma.companyMembership.findFirst({
          where: { userId: authUser.id, companyId: requestedCompanyId, status: "ACTIVE" },
          include: { company: { select: { planTier: true, trialEndsAt: true } } },
        })
      : await this.uniqueActiveMembership(authUser.id);

    if (!membership) {
      throw new ForbiddenException(
        "No active membership found for the requested company context.",
      );
    }

    // No paid tier exists to convert into yet (iyzico integration pending), so this only ever
    // fires for TRIAL companies past their 30-day window — a paid planTier bypasses this check
    // by construction once billing lands.
    if (
      membership.company.planTier === "TRIAL" &&
      membership.company.trialEndsAt &&
      membership.company.trialEndsAt < new Date()
    ) {
      throw new ForbiddenException(
        "Deneme süreniz sona erdi. Hesabınızı etkinleştirmek için bizimle iletişime geçin.",
      );
    }

    const farmScopes = await this.prisma.membershipFarmScope.findMany({
      where: { membershipId: membership.id },
      select: { farmId: true },
    });

    request.tenant = {
      companyId: membership.companyId,
      membershipId: membership.id,
      role: membership.role,
      farmScopeIds: farmScopes.map((s) => s.farmId),
    };

    return true;
  }

  private async uniqueActiveMembership(userId: string) {
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { company: { select: { planTier: true, trialEndsAt: true } } },
      take: 2,
    });
    return memberships.length === 1 ? memberships[0] : undefined;
  }
}
