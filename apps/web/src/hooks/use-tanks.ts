"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { Tank, TankStatus, TankType } from "@/lib/types";

export function useFarmTanks(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["tanks", "farm", companyId, farmId],
    queryFn: () => api.get<Tank[]>(`/farms/${farmId}/tanks`),
    enabled: !!companyId && !!farmId,
  });
}

export function useSectionTanks(sectionId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["tanks", "section", companyId, sectionId],
    queryFn: () => api.get<Tank[]>(`/farm-sections/${sectionId}/tanks`),
    enabled: !!companyId && !!sectionId,
  });
}

export interface CreateTankInput {
  code: string;
  type: TankType;
  volumeM3?: number;
  maxBiomassKg?: number;
}

export function useCreateTank(farmId: string, sectionId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTankInput) =>
      api.post<Tank>(`/farm-sections/${sectionId}/tanks`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tanks", "section", companyId, sectionId] });
      queryClient.invalidateQueries({ queryKey: ["tanks", "farm", companyId, farmId] });
    },
  });
}

export interface UpdateTankInput {
  code?: string;
  type?: TankType;
  volumeM3?: number;
  maxBiomassKg?: number;
  status?: TankStatus;
}

export function useUpdateTank(farmId: string, sectionId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tankId, ...input }: UpdateTankInput & { tankId: string }) =>
      api.patch<Tank>(`/tanks/${tankId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tanks", "section", companyId, sectionId] });
      queryClient.invalidateQueries({ queryKey: ["tanks", "farm", companyId, farmId] });
    },
  });
}

export function useDeleteTank(farmId: string, sectionId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tankId: string) => api.del<Tank>(`/tanks/${tankId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tanks", "section", companyId, sectionId] });
      queryClient.invalidateQueries({ queryKey: ["tanks", "farm", companyId, farmId] });
    },
  });
}
