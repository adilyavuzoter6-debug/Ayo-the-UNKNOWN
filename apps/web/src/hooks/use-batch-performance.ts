"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FcrResult, SgrPoint } from "@/lib/types";

export function useBatchFcr(batchId: string, periodStart: string, periodEnd: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["batch-fcr", companyId, batchId, periodStart, periodEnd],
    queryFn: () =>
      api.get<FcrResult>(
        `/fish-batches/${batchId}/fcr?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
      ),
    enabled: !!companyId && !!batchId && !!periodStart && !!periodEnd,
    retry: false,
  });
}

export function useBatchSgr(batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["batch-sgr", companyId, batchId],
    queryFn: () => api.get<SgrPoint[]>(`/fish-batches/${batchId}/sgr`),
    enabled: !!companyId && !!batchId,
  });
}
