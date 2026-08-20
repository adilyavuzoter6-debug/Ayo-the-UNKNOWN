"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FarmSection } from "@/lib/types";

export function useFarmSections(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["farm-sections", companyId, farmId],
    queryFn: () => api.get<FarmSection[]>(`/farms/${farmId}/sections`),
    enabled: !!companyId && !!farmId,
  });
}

export function useCreateFarmSection(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      api.post<FarmSection>(`/farms/${farmId}/sections`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["farm-sections", companyId, farmId] });
    },
  });
}

export function useUpdateFarmSection(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, name }: { sectionId: string; name: string }) =>
      api.patch<FarmSection>(`/farm-sections/${sectionId}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["farm-sections", companyId, farmId] });
    },
  });
}

export function useDeleteFarmSection(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => api.del<FarmSection>(`/farm-sections/${sectionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["farm-sections", companyId, farmId] });
    },
  });
}
