import type { Role } from "@aquai/types";

/** Attached to the request by ClerkAuthGuard after JWT verification. */
export interface AuthenticatedUser {
  id: string;
  authProviderId: string;
  email: string;
  fullName: string;
}

/**
 * Attached to the request by TenantContextInterceptor after resolving the user's active
 * company membership from the database. See
 * docs/architecture/06-multi-tenant-security.md §6.2 Layer 1.
 */
export interface TenantContext {
  companyId: string;
  membershipId: string;
  role: Role;
  /** Farm ids this membership is scoped to. Empty array = company-wide role (no restriction). */
  farmScopeIds: string[];
}
