"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FarmDashboardKpis } from "@/lib/types";

export function useFarmDashboardKpis(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-dashboard-kpis", companyId, farmId],
    queryFn: () => api.get<FarmDashboardKpis>(`/farms/${farmId}/dashboard-kpis`),
    enabled: !!companyId && !!farmId,
  });
}
