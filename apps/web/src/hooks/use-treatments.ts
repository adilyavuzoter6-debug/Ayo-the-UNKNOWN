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
