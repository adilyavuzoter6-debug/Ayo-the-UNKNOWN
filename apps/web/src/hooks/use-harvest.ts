"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { HarvestFullness, HarvestRecord, HarvestType } from "@/lib/types";

export function useTankHarvestRecords(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["harvest-records", companyId, tankId],
    queryFn: () => api.get<HarvestRecord[]>(`/tanks/${tankId}/harvest-records`),
    enabled: !!companyId && !!tankId,
  });
}

export interface CreateHarvestRecordInput {
  batchId: string;
  type: HarvestType;
  fullness: HarvestFullness;
  plannedDate?: string;
  harvestedAt?: string;
  fishCount?: number;
  avgWeightG?: number;
  sizeGrade?: string;
  destination?: string;
  customer?: string;
  processingPlant?: string;
  notes?: string;
}

export function useCreateHarvestRecord(farmId: string, tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHarvestRecordInput) =>
      api.post<HarvestRecord>(`/tanks/${tankId}/harvest-records`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["harvest-records", companyId, tankId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches", companyId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches", "tank", companyId, tankId] });
      queryClient.invalidateQueries({ queryKey: ["farm-stock-summary", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "farm", companyId, farmId] });
    },
  });
}
