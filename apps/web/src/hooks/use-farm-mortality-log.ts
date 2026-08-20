"use client";

import { useQueries } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import { useFarmTanks } from "@/hooks/use-tanks";
import type { MortalityEvent, Tank } from "@/lib/types";

export interface MortalityLogEntry extends MortalityEvent {
  tank: Tank;
}

/** Every farm's mortality events, newest first — fetched per-tank in parallel (existing
 * per-tank endpoint, no new backend aggregate). */
export function useFarmMortalityLog(farmId: string): {
  entries: MortalityLogEntry[];
  isLoading: boolean;
} {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const { data: tanks, isLoading: tanksLoading } = useFarmTanks(farmId);

  const eventQueries = useQueries({
    queries: (tanks ?? []).map((tank) => ({
      queryKey: ["mortality-events", companyId, tank.id],
      queryFn: () => api.get<MortalityEvent[]>(`/tanks/${tank.id}/mortality-events`),
      enabled: !!companyId && !!tank.id,
    })),
  });

  const entries: MortalityLogEntry[] = (tanks ?? [])
    .flatMap((tank, i) => (eventQueries[i]?.data ?? []).map((event) => ({ ...event, tank })))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return {
    entries,
    isLoading: tanksLoading || eventQueries.some((q) => q.isLoading),
  };
}
