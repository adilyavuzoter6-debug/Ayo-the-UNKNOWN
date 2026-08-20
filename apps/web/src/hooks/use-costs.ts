"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { CostCategory, CostEntry, CostSummary } from "@/lib/types";

export function useFarmCostEntries(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["cost-entries", companyId, farmId],
    queryFn: () => api.get<CostEntry[]>(`/farms/${farmId}/cost-entries`),
    enabled: !!companyId && !!farmId,
  });
}

export function useFarmCostSummary(farmId: string, periodStart: string, periodEnd: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["cost-summary", companyId, farmId, periodStart, periodEnd],
    queryFn: () =>
      api.get<CostSummary>(
        `/farms/${farmId}/cost-summary?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
      ),
    enabled: !!companyId && !!farmId && !!periodStart && !!periodEnd,
  });
}

export interface CreateCostEntryInput {
  category: CostCategory;
  amount: number;
  currency?: string;
  tankId?: string;
  batchId?: string;
  incurredAt: string;
  notes?: string;
}

export function useCreateCostEntry(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCostEntryInput) =>
      api.post<CostEntry>(`/farms/${farmId}/cost-entries`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-entries", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["cost-summary", companyId, farmId] });
    },
  });
}
