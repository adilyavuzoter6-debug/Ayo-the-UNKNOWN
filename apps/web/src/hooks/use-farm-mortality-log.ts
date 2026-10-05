"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { MortalityEvent, Tank } from "@/lib/types";

export interface MortalityLogEntry extends MortalityEvent {
  tank: Tank;
}

/**
 * Every farm's mortality events, newest first. Backed by a single GET
 * /farms/:farmId/mortality-events call (tank pre-joined server-side) instead of fanning out one
 * request per tank through useQueries.
 */
export function useFarmMortalityLog(farmId: string): {
  entries: MortalityLogEntry[];
  isLoading: boolean;
} {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const { data, isLoading } = useQuery({
    queryKey: ["farm-mortality-events", companyId, farmId],
    queryFn: () => api.get<MortalityLogEntry[]>(`/farms/${farmId}/mortality-events`),
    enabled: !!companyId && !!farmId,
  });

  return { entries: data ?? [], isLoading: isLoading || data === undefined };
}
