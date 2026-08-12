import { SetMetadata } from "@nestjs/common";

export const SKIP_TENANT_CONTEXT_KEY = "skipTenantContext";

/**
 * Marks a route as not requiring a resolved company context — e.g. POST /companies (creating
 * the first company, before any membership exists) or GET /users/me/companies (listing which
 * companies the caller belongs to, used by the client to pick one). Every other route requires
 * a resolved TenantContext by default.
 */
export const SkipTenantContext = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_TENANT_CONTEXT_KEY, true);
