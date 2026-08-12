import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ROLE_PERMISSIONS, type Permission } from "@aquai/types";
import { REQUIRE_PERMISSION_KEY } from "../decorators/require-permission.decorator";
import type { TenantContext } from "../types/request-context";

/**
 * Consolidates what docs/architecture/01-system-architecture.md §1.3 describes as separate
 * "RolesGuard" + "PermissionsGuard" checks into a single guard: role and tenant are resolved
 * independently (TenantContextInterceptor resolves `request.tenant.role` from the database,
 * never from client input), and this guard checks the route's required Permission against that
 * role via the static ROLE_PERMISSIONS map (docs/architecture/07-roles-permissions-matrix.md).
 *
 * Phase 2+ swaps ROLE_PERMISSIONS for a DB-backed lookup behind the same check() call — see
 * docs/architecture/07-roles-permissions-matrix.md §7.4. Call sites (`@RequirePermission(...)`)
 * never need to change.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true; // route declared no permission requirement

    const request = context.switchToHttp().getRequest<Request & { tenant?: TenantContext }>();
    const tenant = request.tenant;
    if (!tenant) {
      throw new ForbiddenException("No tenant context resolved for this request.");
    }

    const allowed = ROLE_PERMISSIONS[tenant.role]?.includes(required) ?? false;
    if (!allowed) {
      throw new ForbiddenException(`Role ${tenant.role} lacks permission ${required}.`);
    }
    return true;
  }
}
