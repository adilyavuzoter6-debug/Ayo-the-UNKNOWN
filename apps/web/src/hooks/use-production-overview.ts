"use client";

import { useQueries } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import { useFarmTanks } from "@/hooks/use-tanks";
import type { BatchTankAllocation, Tank } from "@/lib/types";

export interface TankProductionRow {
  tank: Tank;
  allocations: BatchTankAllocation[];
  isLoading: boolean;
}

/** Cross-tank production overview for one farm — each tank's batch allocations, fetched in
 * parallel. Built entirely from existing per-tank endpoints (no new backend aggregate). */
export function useFarmProductionOverview(farmId: string): {
  rows: TankProductionRow[];
  isLoading: boolean;
} {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const { data: tanks, isLoading: tanksLoading } = useFarmTanks(farmId);

  const allocationQueries = useQueries({
    queries: (tanks ?? []).map((tank) => ({
      queryKey: ["fish-batches", "tank", companyId, tank.id],
      queryFn: () => api.get<BatchTankAllocation[]>(`/tanks/${tank.id}/fish-batches`),
      enabled: !!companyId && !!tank.id,
    })),
  });

  const rows: TankProductionRow[] = (tanks ?? []).map((tank, i) => ({
    tank,
    allocations: allocationQueries[i]?.data ?? [],
    isLoading: allocationQueries[i]?.isLoading ?? true,
  }));

  return {
    rows,
    isLoading: tanksLoading || allocationQueries.some((q) => q.isLoading),
  };
}
