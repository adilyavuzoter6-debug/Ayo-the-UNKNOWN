"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { BatchHistory, BatchMovement, BatchTankAllocation, BatchTankState, FishBatch } from "@/lib/types";

export function useFishBatches() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["fish-batches", companyId],
    queryFn: () => api.get<FishBatch[]>("/fish-batches"),
    enabled: !!companyId,
  });
}

export function useFishBatch(batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["fish-batches", companyId, batchId],
    queryFn: () => api.get<FishBatch>(`/fish-batches/${batchId}`),
    enabled: !!companyId && !!batchId,
  });
}

export function useTankFishBatches(tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["fish-batches", "tank", companyId, tankId],
    queryFn: () => api.get<BatchTankAllocation[]>(`/tanks/${tankId}/fish-batches`),
    enabled: !!companyId && !!tankId,
  });
}

export function useBatchHistory(batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["fish-batches", "history", companyId, batchId],
    queryFn: () => api.get<BatchHistory>(`/fish-batches/${batchId}/history`),
    enabled: !!companyId && !!batchId,
  });
}

export function useBatchMovements(batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["fish-batches", "movements", companyId, batchId],
    queryFn: () => api.get<BatchMovement[]>(`/fish-batches/${batchId}/movements`),
    enabled: !!companyId && !!batchId,
  });
}

export interface CreateFishBatchInput {
  speciesId: string;
  lotCode: string;
  tankId: string;
  fishCount: number;
  avgWeightG: number;
  farmEntryDate: string;
  hatchDate?: string;
  hatcherySupplier?: string;
  eggSource?: string;
  notes?: string;
  stockingSource?: "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";
  eggCount?: number;
  stockingUnitPrice?: number;
  stockingCurrency?: "TRY" | "USD" | "EUR";
  stockingExchangeRate?: number;
}

function invalidateAfterMovement(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null | undefined,
  farmId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["fish-batches", companyId] });
  queryClient.invalidateQueries({ queryKey: ["fish-batches", "tank", companyId] });
  queryClient.invalidateQueries({ queryKey: ["farm-stock-summary", companyId] });
  queryClient.invalidateQueries({ queryKey: ["alerts", "farm", companyId, farmId] });
}

export function useCreateFishBatch(farmId: string, tankId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFishBatchInput) => api.post<FishBatch>("/fish-batches", input),
    onSuccess: () => {
      invalidateAfterMovement(queryClient, companyId, farmId);
      queryClient.invalidateQueries({ queryKey: ["fish-batches", "tank", companyId, tankId] });
    },
  });
}

export interface CreateMovementInput {
  fromTankId: string;
  toTankId: string;
  fishCount: number;
  occurredAt?: string;
  notes?: string;
}

export function useCreateMovement(farmId: string, batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMovementInput) =>
      api.post<FishBatch>(`/fish-batches/${batchId}/movements`, input),
    onSuccess: () => {
      invalidateAfterMovement(queryClient, companyId, farmId);
      queryClient.invalidateQueries({ queryKey: ["fish-batches", companyId, batchId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches", "movements", companyId, batchId] });
      queryClient.invalidateQueries({ queryKey: ["fish-batches", "history", companyId, batchId] });
    },
  });
}

export interface SplitBatchInput {
  fromTankId: string;
  splits: { toTankId: string; fishCount: number; lotCode: string }[];
}

export function useSplitBatch(farmId: string, batchId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SplitBatchInput) =>
      api.post<{ parentId: string; childIds: string[] }>(
        `/fish-batches/${batchId}/split`,
        input,
      ),
    onSuccess: () => {
      invalidateAfterMovement(queryClient, companyId, farmId);
      queryClient.invalidateQueries({ queryKey: ["fish-batches", companyId, batchId] });
    },
  });
}

export interface MergeBatchesInput {
  sources: { batchId: string; fromTankId: string; fishCount: number }[];
  toTankId: string;
  lotCode: string;
}

export function useMergeBatches(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MergeBatchesInput) =>
      api.post<FishBatch>("/fish-batches/merge", input),
    onSuccess: () => {
      invalidateAfterMovement(queryClient, companyId, farmId);
    },
  });
}

/** The ponds a batch is in right now. Read-only; loads when a batch is opened. */
export function useBatchTankStates(batchId: string | undefined) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["batch-tank-states", companyId, batchId],
    queryFn: () => api.get<BatchTankState[]>(`/fish-batches/${batchId}/tank-states`),
    enabled: !!companyId && !!batchId,
  });
}
