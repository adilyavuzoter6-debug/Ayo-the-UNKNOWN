"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { Treatment, TreatmentType } from "@/lib/types";

export function useTankTreatments(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["treatments", companyId, tankId],
    queryFn: () => api.get<Treatment[]>(`/tanks/${tankId}/treatments`),
    enabled: !!companyId && !!tankId,
  });
}

export interface CreateTreatmentInput {
  batchId: string;
  type: TreatmentType;
  productName: string;
  dosage?: string;
  withdrawalPeriodDays?: number;
  startedAt: string;
  endedAt?: string;
  veterinarianId?: string;
  notes?: string;
}

export function useCreateTreatment(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTreatmentInput) =>
      api.post<Treatment>(`/tanks/${tankId}/treatments`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments", companyId, tankId] });
    },
  });
}

/** Corrects a recorded treatment. A nullable field is cleared by sending null. */
export interface UpdateTreatmentInput {
  id: string;
  type?: TreatmentType;
  productName?: string;
  dosage?: string | null;
  withdrawalPeriodDays?: number | null;
  startedAt?: string;
  endedAt?: string | null;
  notes?: string | null;
}

export function useUpdateTreatment(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateTreatmentInput) =>
      api.patch<Treatment>(`/tanks/${tankId}/treatments/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments", companyId, tankId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches"] });
    },
  });
}

/** Removes a treatment recorded by mistake. It stops counting toward withdrawal checks at once. */
export function useDeleteTreatment(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: true }>(`/tanks/${tankId}/treatments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments", companyId, tankId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches"] });
    },
  });
}
