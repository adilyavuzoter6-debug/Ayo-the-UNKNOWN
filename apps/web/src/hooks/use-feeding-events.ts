"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
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

export function useLogFeeding(farmId: string, tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogFeedingInput) =>
      api.post<FeedingEvent>(`/tanks/${tankId}/feeding-events`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeding-events", companyId, tankId] });
      queryClient.invalidateQueries({ queryKey: ["farm-stock-summary", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", companyId] });
    },
  });
}
