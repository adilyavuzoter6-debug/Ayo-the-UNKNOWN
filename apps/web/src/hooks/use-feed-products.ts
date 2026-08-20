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
