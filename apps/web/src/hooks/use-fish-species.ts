"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FishSpecies } from "@/lib/types";

export function useFishSpecies() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["fish-species", companyId],
    queryFn: () => api.get<FishSpecies[]>("/fish-species"),
    enabled: !!companyId,
  });
}

export interface CreateFishSpeciesInput {
  name: string;
  strain?: string;
}

export function useCreateFishSpecies() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFishSpeciesInput) => api.post<FishSpecies>("/fish-species", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fish-species", companyId] });
    },
  });
}
