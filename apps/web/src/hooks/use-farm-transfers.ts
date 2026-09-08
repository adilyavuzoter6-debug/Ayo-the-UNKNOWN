"use client";

import { useQueries } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import { useFarmTanks } from "@/hooks/use-tanks";
import type { BatchMovement, BatchTankAllocation } from "@/lib/types";

export interface TransferLogEntry extends BatchMovement {
  lotCode: string;
  fromTankCode: string | null;
  toTankCode: string | null;
}

/**
 * Every TRANSFER movement across a farm's currently-stocked batches, newest first. No
 * farm-wide movements endpoint exists (movements are only listable per-batchId), so this fans
 * out tank -> batches-in-tank -> per-batch movements client-side, same shape as
 * useFarmMortalityLog.
 */
export function useFarmTransfers(farmId: string): {
  entries: TransferLogEntry[];
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

  const tankCodeById = new Map((tanks ?? []).map((t) => [t.id, t.code]));
  const allocations = allocationQueries.flatMap((q) => q.data ?? []);
  const lotCodeByBatchId = new Map(allocations.map((a) => [a.batchId, a.batch.lotCode]));
  const batchIds = Array.from(new Set(allocations.map((a) => a.batchId)));

  const movementQueries = useQueries({
    queries: batchIds.map((batchId) => ({
      queryKey: ["fish-batches", "movements", companyId, batchId],
      queryFn: () => api.get<BatchMovement[]>(`/fish-batches/${batchId}/movements`),
      enabled: !!companyId && !!batchId,
    })),
  });

  const entries: TransferLogEntry[] = movementQueries
    .flatMap((q) => q.data ?? [])
    .filter((m) => m.movementType === "TRANSFER")
    .map((m) => ({
      ...m,
      lotCode: lotCodeByBatchId.get(m.batchId) ?? "—",
      fromTankCode: m.fromTankId ? (tankCodeById.get(m.fromTankId) ?? null) : null,
      toTankCode: m.toTankId ? (tankCodeById.get(m.toTankId) ?? null) : null,
    }))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return {
    entries,
    isLoading:
      tanksLoading ||
      allocationQueries.some((q) => q.isLoading) ||
      movementQueries.some((q) => q.isLoading),
  };
}
