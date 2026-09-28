"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import type { AdminCompanyDetail, AdminCompanyRow } from "@/lib/types";

/** Every admin route is @SkipTenantContext on the API, so no X-Company-Id is sent. */
const SKIP_TENANT = { skipCompanyContext: true } as const;

export function useIsPlatformAdmin() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => api.get<{ isPlatformAdmin: boolean }>("/admin/me", SKIP_TENANT),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminCompanies() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["admin", "companies"],
    queryFn: () => api.get<AdminCompanyRow[]>("/admin/companies", SKIP_TENANT),
  });
}

export function useAdminCompany(companyId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["admin", "companies", companyId],
    queryFn: () => api.get<AdminCompanyDetail>(`/admin/companies/${companyId}`, SKIP_TENANT),
    enabled: !!companyId,
  });
}
