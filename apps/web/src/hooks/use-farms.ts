"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFarmInput, UpdateFarmInput } from "@aquai/validation";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { Farm } from "@/lib/types";

export function useFarms() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farms", companyId],
    queryFn: () => api.get<Farm[]>("/farms"),
    enabled: !!companyId,
  });
}

export function useFarm(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farms", companyId, farmId],
    queryFn: () => api.get<Farm>(`/farms/${farmId}`),
    enabled: !!companyId && !!farmId,
  });
}

export function useCreateFarm() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFarmInput) => api.post<Farm>("/farms", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["farms", companyId] });
    },
  });
}

export function useUpdateFarm() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ farmId, ...input }: UpdateFarmInput & { farmId: string }) =>
      api.patch<Farm>(`/farms/${farmId}`, input),
    onSuccess: (farm) => {
      queryClient.invalidateQueries({ queryKey: ["farms", companyId] });
      queryClient.invalidateQueries({ queryKey: ["farms", companyId, farm.id] });
    },
  });
}

export function useDeleteFarm() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (farmId: string) => api.del<Farm>(`/farms/${farmId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["farms", companyId] });
    },
  });
}
