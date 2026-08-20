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

export function useResolveAlert(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => api.patch<Alert>(`/alerts/${alertId}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts", "farm", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["farm-stock-summary", companyId, farmId] });
    },
  });
}
