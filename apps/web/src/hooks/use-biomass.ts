"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { BiomassSnapshot } from "@/lib/types";

export function useBiomassHistory(batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["biomass-history", companyId, batchId],
    queryFn: () => api.get<BiomassSnapshot[]>(`/fish-batches/${batchId}/biomass/history`),
    enabled: !!companyId && !!batchId,
  });
}

export function useRecalculateBiomass(batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BiomassSnapshot[]>(`/fish-batches/${batchId}/biomass/recalculate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biomass-history", companyId, batchId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches", companyId, batchId] });
    },
  });
}
