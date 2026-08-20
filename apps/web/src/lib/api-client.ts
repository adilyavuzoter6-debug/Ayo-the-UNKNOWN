"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { ApiError } from "@/lib/api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface RequestOptions {
  /** Set to skip attaching X-Company-Id — only for endpoints marked @SkipTenantContext() in the API. */
  skipCompanyContext?: boolean;
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
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token ?? ""}`);
      if (!options.skipCompanyContext && companyId) {
        headers.set("X-Company-Id", companyId);
      }
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${API_URL}${path}`, { ...init, headers });
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

      return body?.data as T;
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
    }),
    [request],
  );
}
