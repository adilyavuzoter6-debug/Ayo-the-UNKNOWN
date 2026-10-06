"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type {
  GrowthProfile,
  SavedCostScenario,
  ScenarioInput,
  ScenarioOutcome,
  ScenarioPrefill,
} from "@/lib/types";

export function useScenarioPrefill(farmId: string, batchId: string | undefined) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["cost-scenario-prefill", companyId, farmId, batchId],
    queryFn: () =>
      api.get<ScenarioPrefill>(`/farms/${farmId}/cost-scenarios/prefill?batchId=${encodeURIComponent(batchId!)}`),
    enabled: !!companyId && !!farmId && !!batchId,
    retry: false,
  });
}

/** Calculates one or more scenarios side by side. Stores nothing. */
export function useCalculateScenarios(farmId: string) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (scenarios: ScenarioInput[]) =>
      api.post<{ results: ScenarioOutcome[] }>(`/farms/${farmId}/cost-scenarios/calculate`, { scenarios }),
  });
}

/** The farm's own growth rate for each weight range, from its weighings. Stores nothing. */
export function useGrowthProfile(farmId: string) {
  const api = useApiClient();
  return useMutation({
    mutationFn: (ranges: { minG: number; maxG: number }[]) =>
      api.post<GrowthProfile>(`/farms/${farmId}/cost-scenarios/growth-profile`, { ranges }),
  });
}

export function useSavedScenarios(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["cost-scenarios", companyId, farmId],
    queryFn: () => api.get<SavedCostScenario[]>(`/farms/${farmId}/cost-scenarios`),
    enabled: !!companyId && !!farmId,
  });
}

export function useSaveScenario(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; batchId?: string; tankId?: string; scenario: ScenarioInput }) =>
      api.post<SavedCostScenario>(`/farms/${farmId}/cost-scenarios`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-scenarios", companyId, farmId] });
    },
  });
}

export function useDeleteScenario(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: true }>(`/farms/${farmId}/cost-scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-scenarios", companyId, farmId] });
    },
  });
}
