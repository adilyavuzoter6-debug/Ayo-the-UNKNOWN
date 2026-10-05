"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { BatchMovement } from "@/lib/types";

export interface TransferLogEntry extends BatchMovement {
  lotCode: string;
  fromTankCode: string | null;
  toTankCode: string | null;
}

/**
 * Every TRANSFER movement across a farm's currently-stocked batches, newest first. Backed by a
 * single GET /farms/:farmId/transfers call — the lot/tank-code joins happen server-side now
 * (see FishBatchesService.listTransfersForFarm) instead of a 3-level client-side waterfall
 * (tanks -> per-tank allocations -> per-batch movements) that used to take up to dozens of
 * sequential round trips on a farm with many tanks/batches.
 */
export function useFarmTransfers(farmId: string): {
  entries: TransferLogEntry[];
  isLoading: boolean;
} {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const { data, isLoading } = useQuery({
    queryKey: ["farm-transfers", companyId, farmId],
    queryFn: () => api.get<TransferLogEntry[]>(`/farms/${farmId}/transfers`),
    enabled: !!companyId && !!farmId,
  });

  return { entries: data ?? [], isLoading: isLoading || data === undefined };
}
