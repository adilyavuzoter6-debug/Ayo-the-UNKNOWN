import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@aquai/types";

export const REQUIRE_PERMISSION_KEY = "requiredPermission";

/**
 * Declares which fine-grained Permission (packages/types/src/permissions.ts) a route requires.
 * Checked by PermissionsGuard against the resolved TenantContext.role, never against the raw
 * Role enum directly in a controller — see docs/architecture/07-roles-permissions-matrix.md §7.1.
 */
export const RequirePermission = (permission: Permission): MethodDecorator =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
