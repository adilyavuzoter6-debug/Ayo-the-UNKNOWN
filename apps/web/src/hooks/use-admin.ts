"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlanTier } from "@aquai/types";
import { useApiClient } from "@/lib/api-client";
import type { AdminAssistantFeedback, AdminCompanyDetail, AdminCompanyRow } from "@/lib/types";

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

export function useAdminAssistantFeedback() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["admin", "assistant-feedback"],
    queryFn: () => api.get<AdminAssistantFeedback>("/admin/assistant-feedback", SKIP_TENANT),
  });
}

/** Sets a company's plan: how a plan is granted until online payment exists. */
export function useUpdateCompanyPlan(companyId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { planTier: PlanTier; trialEndsAt?: string }) =>
      api.patch(`/admin/companies/${companyId}/plan`, input, SKIP_TENANT),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "companies"] }),
  });
}
