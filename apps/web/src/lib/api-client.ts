"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { ApiError } from "@/lib/api-error";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface RequestOptions {
  /** Set to skip attaching X-Company-Id — only for endpoints marked @SkipTenantContext() in the API. */
  skipCompanyContext?: boolean;
  /** Sent as Idempotency-Key, so the API returns the original response if this request is repeated. */
  idempotencyKey?: string;
}

export const OFFLINE_ERROR_CODE = "OFFLINE";
export const NETWORK_ERROR_CODE = "NETWORK";
/** No session token yet: right after signing in, Clerk can take a moment to hand one out. */
export const SESSION_PENDING_CODE = "SESSION_PENDING";

export function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

interface SendOptions {
  token: string | null;
  companyId: string | null;
  path: string;
  init?: RequestInit;
  idempotencyKey?: string;
}

/**
 * The one place a request actually goes out. Shared by useApiClient and the offline queue,
 * which replays a request later under the company it was recorded for rather than whichever
 * company is active by then.
 */
export async function sendApiRequest<T>({ token, companyId, path, init = {}, idempotencyKey }: SendOptions): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && isOffline()) {
    throw new ApiError(0, OFFLINE_ERROR_CODE, "Bu işlem için internet bağlantısı gerekli.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token ?? ""}`);
  if (companyId) {
    headers.set("X-Company-Id", companyId);
  }
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }
  // A file upload's multipart boundary is set by the browser; everything else is JSON.
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    // fetch only rejects when the request never got an HTTP answer (no connection, DNS, CORS).
    throw new ApiError(0, NETWORK_ERROR_CODE, "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
  }
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const err = body?.error;
    throw new ApiError(
      response.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? response.statusText,
      err?.requestId,
      err?.details,
    );
  }

  // A paginated endpoint answers { data: items, meta: { page, pageSize, total } }; callers typed for
  // Paginated<T> get both back together.
  if (Array.isArray(body?.data) && typeof body?.meta?.total === "number") {
    return { items: body.data, ...body.meta } as T;
  }
  return body?.data as T;
}

/**
 * Every request goes through this client: attaches the Clerk session token as a bearer token
 * (verified server-side by ClerkAuthGuard, docs/architecture/06-multi-tenant-security.md §6.2)
 * and the active company as X-Company-Id (re-validated server-side by TenantContextGuard —
 * this header is a UX hint, never trusted as authorization on its own). Unwraps the
 * { data, meta } envelope and throws ApiError for the { error } shape (§11.3).
 */
export function useApiClient() {
  const { getToken } = useAuth();
  const { companyId } = useActiveCompany();

  const request = React.useCallback(
    async <T>(
      path: string,
      init: RequestInit = {},
      options: RequestOptions = {},
    ): Promise<T> => {
      const token = await getToken();
      // Sending without a token would only earn a 401, which is final; this one is retried.
      if (!token) throw new ApiError(0, SESSION_PENDING_CODE, "Oturum hazırlanıyor…");
      return sendApiRequest<T>({
        token,
        companyId: options.skipCompanyContext ? null : companyId,
        path,
        init,
        idempotencyKey: options.idempotencyKey,
      });
    },
    [getToken, companyId],
  );

  return React.useMemo(
    () => ({
      get: <T,>(path: string, options?: RequestOptions) =>
        request<T>(path, { method: "GET" }, options),
      post: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, options),
      patch: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, options),
      del: <T,>(path: string, options?: RequestOptions) =>
        request<T>(path, { method: "DELETE" }, options),
      /** Posts a form with files (multipart). */
      upload: <T,>(path: string, form: FormData, options?: RequestOptions) =>
        request<T>(path, { method: "POST", body: form }, options),
    }),
    [request],
  );
}
