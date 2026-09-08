"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { Alert, AlertStatus } from "@/lib/types";

export function useFarmAlerts(farmId: string, status?: AlertStatus) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["alerts", "farm", companyId, farmId, status ?? "all"],
    queryFn: () =>
      api.get<Alert[]>(`/farms/${farmId}/alerts${status ? `?status=${status}` : ""}`),
    enabled: !!companyId && !!farmId,
  });
}

/** All alerts across every farm in the active company. */
export function useCompanyAlerts(status?: AlertStatus) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["alerts", "company", companyId, status ?? "all"],
    queryFn: () => api.get<Alert[]>(`/alerts${status ? `?status=${status}` : ""}`),
    enabled: !!companyId,
  });
}

/**
 * Not farm-scoped: a resolved alert's farm isn't known upfront (the company-wide /alerts page
 * mixes alerts from every farm), so this invalidates every "alerts"/summary-with-alert-counts
 * query by key prefix rather than one specific farmId.
 */
export function useResolveAlert() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => api.patch<Alert>(`/alerts/${alertId}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["farm-stock-summary"] });
      queryClient.invalidateQueries({ queryKey: ["farm-dashboard-kpis"] });
    },
  });
}
