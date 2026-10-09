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

export interface ReceiveSupplyInput {
  itemId: string;
  farmId: string;
  quantity: number;
  note?: string;
  unitPriceAmount?: number;
  unitPriceCurrency?: "TRY" | "USD" | "EUR";
  exchangeRate?: number;
}

export function useReceiveSupply() {
  const api = useApiClient();
  const invalidate = useInvalidateSupplies();
  return useMutation({
    mutationFn: (input: ReceiveSupplyInput) =>
      api.post(`/supply-items/${input.itemId}/receive`, {
        farmId: input.farmId,
        quantity: input.quantity,
        note: input.note,
        unitPriceAmount: input.unitPriceAmount,
        unitPriceCurrency: input.unitPriceCurrency,
        exchangeRate: input.exchangeRate,
      }),
    onSuccess: invalidate,
  });
}

export interface TransferSupplyInput {
  itemId: string;
  fromFarmId: string;
  toFarmId: string;
  quantity: number;
  note?: string;
}

export function useTransferSupply() {
  const api = useApiClient();
  const invalidate = useInvalidateSupplies();
  return useMutation({
    mutationFn: (input: TransferSupplyInput) =>
      api.post(`/supply-items/${input.itemId}/transfer`, {
        fromFarmId: input.fromFarmId,
        toFarmId: input.toFarmId,
        quantity: input.quantity,
        note: input.note,
      }),
    onSuccess: invalidate,
  });
}

export interface SupplyMovementRow {
  id: string;
  kind: "RECEIVED" | "TRANSFER" | "CONSUMED";
  quantity: number;
  fromFarmName: string | null;
  toFarmName: string | null;
  /** Unit price in TRY, set only on a priced RECEIVED movement. */
  unitPriceTry: number | null;
  occurredAt: string;
  note: string | null;
}

/** An item's movements, newest first. Loads when the item's movement list is opened. */
export function useSupplyMovements(itemId: string, enabled: boolean) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["supply-movements", companyId, itemId],
    queryFn: () => api.get<SupplyMovementRow[]>(`/supply-items/${itemId}/movements`),
    enabled: !!companyId && enabled,
  });
}

export interface UpdateSupplyMovementInput {
  movementId: string;
  itemId: string;
  quantity?: number;
  note?: string;
  unitPriceAmount?: number;
  unitPriceCurrency?: "TRY" | "USD" | "EUR";
  exchangeRate?: number;
}

export function useUpdateSupplyMovement() {
  const api = useApiClient();
  const invalidate = useInvalidateSupplies();
  const queryClient = useQueryClient();
  const { companyId } = useActiveCompany();
  return useMutation({
    mutationFn: (input: UpdateSupplyMovementInput) =>
      api.patch(`/supply-items/movements/${input.movementId}`, {
        quantity: input.quantity,
        note: input.note,
        unitPriceAmount: input.unitPriceAmount,
        unitPriceCurrency: input.unitPriceCurrency,
        exchangeRate: input.exchangeRate,
      }),
    onSuccess: (_data, input) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["supply-movements", companyId, input.itemId] });
    },
  });
}

export function useDeleteSupplyMovement() {
  const api = useApiClient();
  const invalidate = useInvalidateSupplies();
  const queryClient = useQueryClient();
  const { companyId } = useActiveCompany();
  return useMutation({
    mutationFn: (input: { movementId: string; itemId: string }) =>
      api.del(`/supply-items/movements/${input.movementId}`),
    onSuccess: (_data, input) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["supply-movements", companyId, input.itemId] });
    },
  });
}
