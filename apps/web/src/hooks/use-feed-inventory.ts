"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FeedInventoryBatch, FeedInventoryTransaction } from "@/lib/types";

export function useInventoryBatches() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["inventory-batches", companyId],
    queryFn: () => api.get<FeedInventoryBatch[]>("/inventory-batches"),
    enabled: !!companyId,
  });
}

export function useWarehouseInventoryBatches(warehouseId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["inventory-batches", "warehouse", companyId, warehouseId],
    queryFn: () =>
      api.get<FeedInventoryBatch[]>(`/warehouses/${warehouseId}/inventory-batches`),
    enabled: !!companyId && !!warehouseId,
  });
}

export function useInventoryBatchTransactions(feedInventoryBatchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["inventory-batches", "transactions", companyId, feedInventoryBatchId],
    queryFn: () =>
      api.get<FeedInventoryTransaction[]>(
        `/inventory-batches/${feedInventoryBatchId}/transactions`,
      ),
    enabled: !!companyId && !!feedInventoryBatchId,
  });
}

export interface ReceiveStockInput {
  feedProductId: string;
  quantityKg: number;
  supplierLotCode?: string;
  manufactureDate?: string;
  expiryDate?: string;
  unitCostPerKg?: number;
  occurredAt?: string;
  notes?: string;
}

export function useReceiveStock(warehouseId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiveStockInput) =>
      api.post<FeedInventoryBatch>(`/warehouses/${warehouseId}/inventory-batches`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", companyId] });
      queryClient.invalidateQueries({
        queryKey: ["inventory-batches", "warehouse", companyId, warehouseId],
      });
    },
  });
}

export interface CreateAdjustmentInput {
  quantityKg: number;
  occurredAt?: string;
  notes?: string;
}

export function useCreateAdjustment(feedInventoryBatchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdjustmentInput) =>
      api.post<FeedInventoryBatch>(
        `/inventory-batches/${feedInventoryBatchId}/adjustments`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", companyId] });
      queryClient.invalidateQueries({
        queryKey: ["inventory-batches", "transactions", companyId, feedInventoryBatchId],
      });
    },
  });
}
