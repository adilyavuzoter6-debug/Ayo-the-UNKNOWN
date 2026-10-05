"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import { useFarmTanks } from "@/hooks/use-tanks";
import type { BatchTankAllocation, Tank } from "@/lib/types";

export interface TankProductionRow {
  tank: Tank;
  allocations: BatchTankAllocation[];
  isLoading: boolean;
}

/**
 * Cross-tank production overview for one farm. The tank list and the farm-wide allocation list
 * are two independent, parallel requests (both only need farmId) grouped together client-side —
 * replaces the old N+1 shape (wait for tanks, then fan out one allocations request per tank).
 */
export function useFarmProductionOverview(farmId: string): {
  rows: TankProductionRow[];
  isLoading: boolean;
} {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const { data: tanks, isLoading: tanksLoading } = useFarmTanks(farmId);
  const { data: allocations, isLoading: allocationsLoading } = useQuery({
    queryKey: ["farm-fish-batches", companyId, farmId],
    queryFn: () => api.get<BatchTankAllocation[]>(`/farms/${farmId}/fish-batches`),
    enabled: !!companyId && !!farmId,
  });

  const allocationsByTankId = new Map<string, BatchTankAllocation[]>();
  (allocations ?? []).forEach((allocation) => {
    const list = allocationsByTankId.get(allocation.tankId) ?? [];
    list.push(allocation);
    allocationsByTankId.set(allocation.tankId, list);
  });

  const stillLoadingAllocations = allocationsLoading || allocations === undefined;
  const rows: TankProductionRow[] = (tanks ?? []).map((tank) => ({
    tank,
    allocations: allocationsByTankId.get(tank.id) ?? [],
    isLoading: stillLoadingAllocations,
  }));

  return {
    rows,
    isLoading: tanksLoading || stillLoadingAllocations,
  };
}
