import type { Role } from "./roles";

/**
 * Fine-grained permissions, deliberately decoupled from Role (see
 * docs/architecture/07-roles-permissions-matrix.md §7.4) so a future configurable-role
 * system can remap role -> permission without touching call sites like
 * `guard.check(Permission.FARM_CREATE)`.
 *
 * Only the permissions needed for MVP Milestone 0 (companies/users/farms) are defined here;
 * grow this list module by module as each module ships.
 */
export enum Permission {
  COMPANY_READ = "company:read",
  COMPANY_UPDATE = "company:update",

  USER_INVITE = "user:invite",
  USER_READ = "user:read",
  USER_UPDATE_ROLE = "user:update_role",
  USER_REVOKE = "user:revoke",

  FARM_CREATE = "farm:create",
  FARM_READ = "farm:read",
  FARM_UPDATE = "farm:update",
  FARM_DELETE = "farm:delete",

  TANK_CREATE = "tank:create",
  TANK_READ = "tank:read",
  TANK_UPDATE = "tank:update",
  TANK_DELETE = "tank:delete",

  AUDIT_LOG_READ = "audit_log:read",

  PLATFORM_ADMIN_CROSS_TENANT_ACCESS = "platform_admin:cross_tenant_access",
}

/**
 * Static role -> permission map. See docs/architecture/07-roles-permissions-matrix.md §7.3
 * for the full target matrix (grows as modules beyond Milestone 0 ship). Phase 2+ replaces
 * this static map with a DB-backed RolePermission table behind the same PermissionsGuard
 * call signature (§7.4) — call sites never need to change.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  PLATFORM_ADMIN: Object.values(Permission),
  COMPANY_OWNER: [
    Permission.COMPANY_READ,
    Permission.COMPANY_UPDATE,
    Permission.USER_INVITE,
    Permission.USER_READ,
    Permission.USER_UPDATE_ROLE,
    Permission.USER_REVOKE,
    Permission.FARM_CREATE,
    Permission.FARM_READ,
    Permission.FARM_UPDATE,
    Permission.FARM_DELETE,
    Permission.TANK_CREATE,
    Permission.TANK_READ,
    Permission.TANK_UPDATE,
    Permission.TANK_DELETE,
    Permission.AUDIT_LOG_READ,
  ],
  GENERAL_MANAGER: [
    Permission.COMPANY_READ,
    Permission.USER_INVITE,
    Permission.USER_READ,
    Permission.USER_UPDATE_ROLE,
    Permission.FARM_CREATE,
    Permission.FARM_READ,
    Permission.FARM_UPDATE,
    Permission.FARM_DELETE,
    Permission.TANK_CREATE,
    Permission.TANK_READ,
    Permission.TANK_UPDATE,
    Permission.TANK_DELETE,
    Permission.AUDIT_LOG_READ,
  ],
  FARM_MANAGER: [
    Permission.COMPANY_READ,
    Permission.USER_READ,
    Permission.FARM_READ,
    Permission.FARM_UPDATE,
    Permission.TANK_CREATE,
    Permission.TANK_READ,
    Permission.TANK_UPDATE,
    Permission.AUDIT_LOG_READ,
  ],
  VETERINARIAN: [Permission.COMPANY_READ, Permission.FARM_READ, Permission.TANK_READ],
  FEED_MANAGER: [Permission.COMPANY_READ, Permission.FARM_READ, Permission.TANK_READ],
  ACCOUNTANT: [
    Permission.COMPANY_READ,
    Permission.FARM_READ,
    Permission.TANK_READ,
    Permission.AUDIT_LOG_READ,
  ],
  WORKER: [Permission.FARM_READ, Permission.TANK_READ],
  READ_ONLY: [Permission.COMPANY_READ, Permission.FARM_READ, Permission.TANK_READ],
};
