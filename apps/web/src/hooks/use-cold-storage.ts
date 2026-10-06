"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { ColdStorageSummary } from "@/lib/types";

export function useColdStorage(farmId: string | undefined) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["cold-storage", companyId, farmId],
    queryFn: () => api.get<ColdStorageSummary>(`/farms/${farmId}/cold-storage`),
    enabled: !!companyId && !!farmId,
  });
}

export function useAddColdStorageEntry(farmId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { companyId } = useActiveCompany();
  return useMutation({
    mutationFn: (input: { kind: "IN" | "OUT"; weightKg: number; destination?: string; note?: string }) =>
      api.post(`/farms/${farmId}/cold-storage`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cold-storage", companyId, farmId] }),
  });
}
