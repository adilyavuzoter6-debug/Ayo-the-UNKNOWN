import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "idempotent";

/**
 * Marks a create route as honoring an optional client-generated `Idempotency-Key` header
 * (docs/architecture/11-api-architecture.md §11.7) — see IdempotencyInterceptor. Only put this
 * on routes the offline queue replays; a request without the header behaves exactly as before.
 */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT_KEY, true);
