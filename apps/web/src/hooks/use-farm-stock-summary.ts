"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FarmOverviewRow, FarmStockSummary } from "@/lib/types";

export function useFarmStockSummary(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-stock-summary", companyId, farmId],
    queryFn: () => api.get<FarmStockSummary>(`/farms/${farmId}/stock-summary`),
    enabled: !!companyId && !!farmId,
  });
}

/** Every farm with its stock summary in one request. Shares the ["farm-stock-summary", companyId] prefix so per-farm invalidations also refresh it. */
export function useFarmsOverview() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-stock-summary", companyId, "overview"],
    queryFn: () => api.get<FarmOverviewRow[]>("/farm-overview"),
    enabled: !!companyId,
  });
}
