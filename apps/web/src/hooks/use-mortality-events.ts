"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { MortalityEvent, MortalityReason } from "@/lib/types";

export function useTankMortalityEvents(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["mortality-events", companyId, tankId],
    queryFn: () => api.get<MortalityEvent[]>(`/tanks/${tankId}/mortality-events`),
    enabled: !!companyId && !!tankId,
  });
}

export interface ReportMortalityInput {
  batchId: string;
  fishCount: number;
  reason: MortalityReason;
  occurredAt?: string;
  notes?: string;
}

export function useReportMortality(farmId: string, tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReportMortalityInput) =>
      api.post<MortalityEvent>(`/tanks/${tankId}/mortality-events`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["mortality-events", companyId, tankId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches", companyId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches", "tank", companyId, tankId] });
      queryClient.invalidateQueries({
        queryKey: ["fish-batches", companyId, variables.batchId],
      });
      queryClient.invalidateQueries({ queryKey: ["farm-stock-summary", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "farm", companyId, farmId] });
    },
  });
}
