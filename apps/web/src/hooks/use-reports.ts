"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { AnomalyReport, FarmComparison } from "@/lib/types";

export function useFarmComparison(periodStart: string, periodEnd: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-comparison", companyId, periodStart, periodEnd],
    queryFn: () =>
      api.get<FarmComparison>(
        `/reports/farm-comparison?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
      ),
    enabled: !!companyId && !!periodStart && !!periodEnd,
  });
}

export function useAnomalies() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["anomalies", companyId],
    queryFn: () => api.get<AnomalyReport>("/reports/anomalies"),
    enabled: !!companyId,
  });
}
