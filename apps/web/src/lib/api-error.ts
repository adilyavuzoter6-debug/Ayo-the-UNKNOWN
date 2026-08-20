import type { ApiErrorCode } from "@aquai/types";

/**
 * Thrown by apiFetch whenever the API returns the standard error envelope
 * (docs/architecture/11-api-architecture.md §11.3). Callers switch on `code`, never on
 * `message` — message may be localized later (§39).
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: Array<{ field: string; issue: string }> | undefined;

  constructor(
    status: number,
    code: ApiErrorCode | string,
    message: string,
    requestId?: string,
    details?: Array<{ field: string; issue: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}
