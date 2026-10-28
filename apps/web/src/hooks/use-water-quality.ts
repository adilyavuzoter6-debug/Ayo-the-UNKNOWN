"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useOfflineQueue } from "@/components/providers/offline-queue-provider";
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

/** Queued instead of failing when offline — see OfflineQueueProvider. */
export function useRecordWaterQualityReading(tankId: string) {
  const { companyId } = useActiveCompany();
  const { submit } = useOfflineQueue();
  return useMutation({
    mutationFn: (input: RecordWaterQualityReadingInput) =>
      submit<WaterQualityReading>({
        companyId: companyId!,
        path: `/tanks/${tankId}/water-quality-readings`,
        // Pinned now: a queued record sent later must keep the time it was actually recorded.
        body: { ...input, occurredAt: input.occurredAt ?? new Date().toISOString() },
        label: "Su kalitesi ölçümü",
        invalidate: [["water-quality-readings", companyId, tankId]],
      }),
  });
}
