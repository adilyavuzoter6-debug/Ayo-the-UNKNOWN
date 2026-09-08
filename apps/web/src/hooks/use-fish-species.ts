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

export interface FishSpeciesThresholdInput {
  criticalDoMgL?: number;
  criticalPhLow?: number;
  criticalPhHigh?: number;
  criticalTempHighC?: number;
}

export interface CreateFishSpeciesInput extends FishSpeciesThresholdInput {
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

export interface UpdateFishSpeciesInput extends FishSpeciesThresholdInput {
  name?: string;
  strain?: string;
}

/**
 * Only ever succeeds for a species this company created itself — the backend's tenant-scoped
 * lookup treats global reference species (companyId: null) as not found, same as another
 * tenant's species, so editing shared reference data is impossible from here (see
 * FishSpeciesService.findById).
 */
export function useUpdateFishSpecies() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ speciesId, ...input }: UpdateFishSpeciesInput & { speciesId: string }) =>
      api.patch<FishSpecies>(`/fish-species/${speciesId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fish-species", companyId] });
    },
  });
}
