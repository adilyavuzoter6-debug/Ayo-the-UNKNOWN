import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route as exempt from the global ClerkAuthGuard (health checks, webhooks with their
 * own signature verification, etc). Use sparingly — every other route requires authentication
 * by default. See src/modules/auth/guards/clerk-auth.guard.ts.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
