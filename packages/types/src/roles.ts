/**
 * Fixed RBAC roles for MVP. See docs/architecture/07-roles-permissions-matrix.md.
 * Mirrors the Prisma `Role` enum in apps/api/prisma/schema.prisma — keep in sync.
 */
export const ROLES = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "GENERAL_MANAGER",
  "FARM_MANAGER",
  "VETERINARIAN",
  "FEED_MANAGER",
  "ACCOUNTANT",
  "WORKER",
  "READ_ONLY",
] as const;

export type Role = (typeof ROLES)[number];
