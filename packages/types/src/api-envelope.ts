/**
 * Standard response envelope shared by web/mobile clients and the NestJS API.
 * See docs/architecture/11-api-architecture.md §11.3.
 */
export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiListSuccess<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; issue: string }>;
    requestId: string;
  };
}

/** Stable, machine-readable error codes. Never string-match `message` — it may be localized. */
export enum ApiErrorCode {
  UNAUTHENTICATED = "UNAUTHENTICATED",
  FORBIDDEN = "FORBIDDEN",
  TENANT_MISMATCH = "TENANT_MISMATCH",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  CONFLICT = "CONFLICT",
  RATE_LIMITED = "RATE_LIMITED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}
