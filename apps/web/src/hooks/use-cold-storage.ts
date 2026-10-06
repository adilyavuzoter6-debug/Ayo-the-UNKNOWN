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
    mutationFn: (input: {
      kind: "IN" | "OUT";
      disposal?: "PIT" | "RENDERING";
      weightKg: number;
      destination?: string;
      note?: string;
    }) =>
      api.post(`/farms/${farmId}/cold-storage`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cold-storage", companyId, farmId] }),
  });
}

export function useUpdateColdStorageEntry(farmId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { companyId } = useActiveCompany();
  return useMutation({
    mutationFn: (input: {
      entryId: string;
      weightKg?: number;
      disposal?: "PIT" | "RENDERING";
      destination?: string;
      note?: string;
      occurredAt?: string;
    }) =>
      api.patch(`/farms/${farmId}/cold-storage/${input.entryId}`, {
        weightKg: input.weightKg,
        disposal: input.disposal,
        destination: input.destination,
        note: input.note,
        occurredAt: input.occurredAt,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cold-storage", companyId, farmId] }),
  });
}

export function useDeleteColdStorageEntry(farmId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { companyId } = useActiveCompany();
  return useMutation({
    mutationFn: (entryId: string) => api.del(`/farms/${farmId}/cold-storage/${entryId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cold-storage", companyId, farmId] }),
  });
}
