"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCompanyInput } from "@aquai/validation";
import { useApiClient } from "@/lib/api-client";
import type { Company } from "@/lib/types";

export function useMyCompanies() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["companies", "mine"],
    queryFn: () => api.get<Company[]>("/companies", { skipCompanyContext: true }),
  });
}

export function useCurrentCompany(companyId: string | null) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["companies", "current", companyId],
    queryFn: () => api.get<Company>("/companies/current"),
    enabled: !!companyId,
  });
}

export function useCreateCompany() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCompanyInput) =>
      api.post<Company>("/companies", input, { skipCompanyContext: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies", "mine"] });
    },
  });
}
