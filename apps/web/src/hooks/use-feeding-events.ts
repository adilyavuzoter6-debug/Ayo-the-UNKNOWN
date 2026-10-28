"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useOfflineQueue } from "@/components/providers/offline-queue-provider";
import { useApiClient } from "@/lib/api-client";
import type { FeedingEvent, FeedingMethod } from "@/lib/types";

export function useTankFeedingEvents(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["feeding-events", companyId, tankId],
    queryFn: () => api.get<FeedingEvent[]>(`/tanks/${tankId}/feeding-events`),
    enabled: !!companyId && !!tankId,
  });
}

export interface LogFeedingInput {
  batchId: string;
  feedInventoryBatchId: string;
  quantityKg: number;
  method?: FeedingMethod;
  occurredAt?: string;
  notes?: string;
}

/** Queued instead of failing when offline — see OfflineQueueProvider. */
export function useLogFeeding(farmId: string, tankId: string) {
  const { companyId } = useActiveCompany();
  const { submit } = useOfflineQueue();
  return useMutation({
    mutationFn: (input: LogFeedingInput) =>
      submit<FeedingEvent>({
        companyId: companyId!,
        path: `/tanks/${tankId}/feeding-events`,
        // Pinned now: a queued record sent later must keep the time it was actually recorded.
        body: { ...input, occurredAt: input.occurredAt ?? new Date().toISOString() },
        label: "Yemleme",
        invalidate: [
          ["feeding-events", companyId, tankId],
          ["farm-stock-summary", companyId],
          ["inventory-batches", companyId],
        ],
      }),
  });
}
