"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { Warehouse } from "@/lib/types";

export function useWarehouses() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["warehouses", companyId],
    queryFn: () => api.get<Warehouse[]>("/warehouses"),
    enabled: !!companyId,
  });
}

export function useFarmWarehouses(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["warehouses", "farm", companyId, farmId],
    queryFn: () => api.get<Warehouse[]>(`/farms/${farmId}/warehouses`),
    enabled: !!companyId && !!farmId,
  });
}

export function useCreateWarehouse(farmId: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      api.post<Warehouse>(`/farms/${farmId}/warehouses`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses", companyId] });
      queryClient.invalidateQueries({ queryKey: ["warehouses", "farm", companyId, farmId] });
    },
  });
}
