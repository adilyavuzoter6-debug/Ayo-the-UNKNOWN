"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { WaterQualityReading } from "@/lib/types";

export function useTankWaterQualityReadings(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["water-quality-readings", companyId, tankId],
    queryFn: () => api.get<WaterQualityReading[]>(`/tanks/${tankId}/water-quality-readings`),
    enabled: !!companyId && !!tankId,
  });
}

export interface RecordWaterQualityReadingInput {
  temperatureC?: number;
  dissolvedOxygenMgL?: number;
  ph?: number;
  salinityPpt?: number;
  ammoniaMgL?: number;
  nitriteMgL?: number;
  nitrateMgL?: number;
  flowRateM3H?: number;
  occurredAt?: string;
  notes?: string;
}

export function useRecordWaterQualityReading(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordWaterQualityReadingInput) =>
      api.post<WaterQualityReading>(`/tanks/${tankId}/water-quality-readings`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water-quality-readings", companyId, tankId] });
    },
  });
}
