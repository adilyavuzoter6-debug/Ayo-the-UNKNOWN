"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { SupplyItemStock } from "@/lib/types";

export function useSupplyItems() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["supply-items", companyId],
    queryFn: () => api.get<SupplyItemStock[]>("/supply-items"),
    enabled: !!companyId,
  });
}

function useInvalidateSupplies() {
  const queryClient = useQueryClient();
  const { companyId } = useActiveCompany();
  return () => queryClient.invalidateQueries({ queryKey: ["supply-items", companyId] });
}

export function useCreateSupplyItem() {
  const api = useApiClient();
  const invalidate = useInvalidateSupplies();
  return useMutation({
    mutationFn: (input: { name: string; category: string; unit: string }) =>
      api.post("/supply-items", input),
    onSuccess: invalidate,
  });
}

export function useReceiveSupply() {
  const api = useApiClient();
  const invalidate = useInvalidateSupplies();
  return useMutation({
    mutationFn: (input: { itemId: string; farmId: string; quantity: number; note?: string }) =>
      api.post(`/supply-items/${input.itemId}/receive`, {
        farmId: input.farmId,
        quantity: input.quantity,
        note: input.note,
      }),
    onSuccess: invalidate,
  });
}

export function useTransferSupply() {
  const api = useApiClient();
  const invalidate = useInvalidateSupplies();
  return useMutation({
    mutationFn: (input: {
      itemId: string;
      fromFarmId: string;
      toFarmId: string;
      quantity: number;
      note?: string;
    }) =>
      api.post(`/supply-items/${input.itemId}/transfer`, {
        fromFarmId: input.fromFarmId,
        toFarmId: input.toFarmId,
        quantity: input.quantity,
        note: input.note,
      }),
    onSuccess: invalidate,
  });
}
