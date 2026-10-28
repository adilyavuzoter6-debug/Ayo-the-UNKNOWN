"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useOfflineQueue } from "@/components/providers/offline-queue-provider";
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
  fishCount?: number;
  totalWeightG?: number;
  reason: MortalityReason;
  occurredAt?: string;
  notes?: string;
}

/** Queued instead of failing when offline — see OfflineQueueProvider. */
export function useReportMortality(farmId: string, tankId: string) {
  const { companyId } = useActiveCompany();
  const { submit } = useOfflineQueue();
  return useMutation({
    mutationFn: (input: ReportMortalityInput) =>
      submit<MortalityEvent>({
        companyId: companyId!,
        path: `/tanks/${tankId}/mortality-events`,
        // Pinned now: a queued record sent later must keep the time it was actually recorded.
        body: { ...input, occurredAt: input.occurredAt ?? new Date().toISOString() },
        label: "Ölüm kaydı",
        invalidate: [
          ["mortality-events", companyId, tankId],
          ["fish-batches", companyId],
          ["fish-batches", "tank", companyId, tankId],
          ["fish-batches", companyId, input.batchId],
          ["farm-stock-summary", companyId],
          ["alerts", "farm", companyId, farmId],
        ],
      }),
  });
}
