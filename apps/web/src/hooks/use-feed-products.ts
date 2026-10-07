"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { FeedProduct } from "@/lib/types";

export function useFeedProducts() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["feed-products", companyId],
    queryFn: () => api.get<FeedProduct[]>("/feed-products"),
    enabled: !!companyId,
  });
}

export interface CreateFeedProductInput {
  name: string;
  manufacturer?: string;
  pelletSizeMm?: number;
  proteinPct?: number;
  fatPct?: number;
}

export function useCreateFeedProduct() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeedProductInput) =>
      api.post<FeedProduct>("/feed-products", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-products", companyId] });
    },
  });
}

export interface UpdateFeedProductInput {
  name?: string;
  manufacturer?: string;
  pelletSizeMm?: number;
  proteinPct?: number;
  fatPct?: number;
}

export function useUpdateFeedProduct() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & UpdateFeedProductInput) =>
      api.patch<FeedProduct>(`/feed-products/${input.id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed-products", companyId] }),
  });
}

export function useDeleteFeedProduct() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: true }>(`/feed-products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed-products", companyId] }),
  });
}
