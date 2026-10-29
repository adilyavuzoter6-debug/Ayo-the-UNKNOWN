"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FarmDailyTrendRow, FarmDashboardKpis } from "@/lib/types";

export function useFarmDashboardKpis(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-dashboard-kpis", companyId, farmId],
    queryFn: () => api.get<FarmDashboardKpis>(`/farms/${farmId}/dashboard-kpis`),
    enabled: !!companyId && !!farmId,
  });
}

export function useFarmDailyTrend(farmId: string, days = 30) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-daily-trend", companyId, farmId, days],
    queryFn: () => api.get<FarmDailyTrendRow[]>(`/farms/${farmId}/daily-trend?days=${days}`),
    enabled: !!companyId && !!farmId,
  });
}
