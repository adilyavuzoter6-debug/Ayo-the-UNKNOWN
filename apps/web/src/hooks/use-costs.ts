"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type {
  CostCategory,
  CostEntry,
  CostForecast,
  CostSummary,
  ExchangeCurrency,
  RecurringCost,
} from "@/lib/types";

export function useFarmCostEntries(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["cost-entries", companyId, farmId],
    queryFn: () => api.get<CostEntry[]>(`/farms/${farmId}/cost-entries`),
    enabled: !!companyId && !!farmId,
  });
}

export function useFarmCostSummary(farmId: string, periodStart: string, periodEnd: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["cost-summary", companyId, farmId, periodStart, periodEnd],
    queryFn: () =>
      api.get<CostSummary>(
        `/farms/${farmId}/cost-summary?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
      ),
    enabled: !!companyId && !!farmId && !!periodStart && !!periodEnd,
  });
}

export interface CreateCostEntryInput {
  category: CostCategory;
  amount: number;
  currency?: ExchangeCurrency;
  exchangeRate?: number;
  tankId?: string;
  batchId?: string;
  incurredAt: string;
  notes?: string;
}

export function useCreateCostEntry(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCostEntryInput) =>
      api.post<CostEntry>(`/farms/${farmId}/cost-entries`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-entries", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["cost-summary", companyId, farmId] });
    },
  });
}

export function useRecurringCosts(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["recurring-costs", companyId, farmId],
    queryFn: () => api.get<RecurringCost[]>(`/farms/${farmId}/recurring-costs`),
    enabled: !!companyId && !!farmId,
  });
}

export interface CreateRecurringCostInput {
  category: CostCategory;
  amount: number;
  currency?: ExchangeCurrency;
  dayOfMonth: number;
  startDate: string;
  notes?: string;
}

export function useCreateRecurringCost(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecurringCostInput) =>
      api.post<RecurringCost>(`/farms/${farmId}/recurring-costs`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-costs", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["cost-entries", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["cost-summary", companyId, farmId] });
      queryClient.invalidateQueries({ queryKey: ["cost-forecast", companyId, farmId] });
    },
  });
}

export function useStopRecurringCost(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ stopped: true }>(`/farms/${farmId}/recurring-costs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-costs", companyId, farmId] });
    },
  });
}

export interface CostForecastInput {
  targetWeightG: number;
  targetFcr: number;
  survivalPct: number;
  feedPriceTryPerKg?: number;
}

export function useCostForecast(farmId: string, input: CostForecastInput) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const params = new URLSearchParams({
    targetWeightG: String(input.targetWeightG),
    targetFcr: String(input.targetFcr),
    survivalPct: String(input.survivalPct),
  });
  if (input.feedPriceTryPerKg !== undefined) {
    params.set("feedPriceTryPerKg", String(input.feedPriceTryPerKg));
  }
  return useQuery({
    queryKey: ["cost-forecast", companyId, farmId, input],
    queryFn: () => api.get<CostForecast>(`/farms/${farmId}/cost-forecast?${params.toString()}`),
    enabled: !!companyId && !!farmId,
    placeholderData: (previous) => previous,
  });
}

export interface UpdateCostEntryInput {
  category?: CostCategory;
  amount?: number;
  currency?: ExchangeCurrency;
  exchangeRate?: number;
  incurredAt?: string;
  notes?: string;
}

function invalidateCosts(queryClient: ReturnType<typeof useQueryClient>, companyId: string | null, farmId: string) {
  queryClient.invalidateQueries({ queryKey: ["cost-entries", companyId, farmId] });
  queryClient.invalidateQueries({ queryKey: ["cost-summary", companyId, farmId] });
  queryClient.invalidateQueries({ queryKey: ["cost-forecast", companyId, farmId] });
}

export function useUpdateCostEntry(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCostEntryInput & { id: string }) =>
      api.patch<CostEntry>(`/farms/${farmId}/cost-entries/${id}`, input),
    onSuccess: () => invalidateCosts(queryClient, companyId, farmId),
  });
}

export function useDeleteCostEntry(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: true }>(`/farms/${farmId}/cost-entries/${id}`),
    onSuccess: () => invalidateCosts(queryClient, companyId, farmId),
  });
}

/** Corrects how a batch was stocked. An empty input clears the stocking cost. */
export interface UpdateStockingInput {
  stockingSource?: "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";
  eggCount?: number;
  stockingUnitPrice?: number;
  stockingCurrency?: ExchangeCurrency;
  stockingExchangeRate?: number;
}

export function useUpdateStocking(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, ...input }: UpdateStockingInput & { batchId: string }) =>
      api.patch(`/fish-batches/${batchId}/stocking`, input),
    onSuccess: () => {
      invalidateCosts(queryClient, companyId, farmId);
      queryClient.invalidateQueries({ queryKey: ["fish-batches"] });
    },
  });
}
