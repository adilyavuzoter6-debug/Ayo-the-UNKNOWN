"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { SampleMethod, WeightSample } from "@/lib/types";

export function useTankWeightSamples(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["weight-samples", companyId, tankId],
    queryFn: () => api.get<WeightSample[]>(`/tanks/${tankId}/weight-samples`),
    enabled: !!companyId && !!tankId,
  });
}

export interface RecordWeightSampleInput {
  batchId: string;
  sampleMethod: SampleMethod;
  individualWeightsG?: number[];
  avgWeightG?: number;
  sampleSize?: number;
  occurredAt?: string;
  notes?: string;
}

export function useRecordWeightSample(farmId: string, tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordWeightSampleInput) =>
      api.post<WeightSample>(`/tanks/${tankId}/weight-samples`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["weight-samples", companyId, tankId] });
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
