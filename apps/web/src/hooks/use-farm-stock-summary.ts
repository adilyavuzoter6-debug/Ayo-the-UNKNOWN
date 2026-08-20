"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FarmStockSummary } from "@/lib/types";

export function useFarmStockSummary(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-stock-summary", companyId, farmId],
    queryFn: () => api.get<FarmStockSummary>(`/farms/${farmId}/stock-summary`),
    enabled: !!companyId && !!farmId,
  });
}

/**
 * Fetches every farm's stock-summary in parallel. Replaces the old synchronous
 * `mockFarmStats(farm.id)` loop in farms/page.tsx — the real data is N async calls, so the
 * list page fetches them all up front and looks each one up by farm id.
 */
export function useFarmsStockSummaries(farmIds: string[]) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();

  const results = useQueries({
    queries: farmIds.map((farmId) => ({
      queryKey: ["farm-stock-summary", companyId, farmId],
      queryFn: () => api.get<FarmStockSummary>(`/farms/${farmId}/stock-summary`),
      enabled: !!companyId && !!farmId,
    })),
  });

  const summaries = new Map<string, FarmStockSummary>();
  farmIds.forEach((farmId, index) => {
    const data = results[index]?.data;
    if (data) {
      summaries.set(farmId, data);
    }
  });

  return { summaries, isLoading: results.some((result) => result.isLoading) };
}
