"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import type { UsdTryRate } from "@/lib/types";

/**
 * The Central Bank's USD selling rate for `date` (yyyy-mm-dd). Used to pre-fill the rate field on
 * USD-priced costs and sales — the user can still override it. The server applies the same lookup
 * when no rate is sent, so a failed lookup here only means the field starts empty.
 */
export function useUsdTryRate(date: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["exchange-rate", "usd-try", date],
    queryFn: () => api.get<UsdTryRate>(`/exchange-rates/usd-try?date=${encodeURIComponent(date!)}`),
    enabled: !!date,
    // A published day's rate doesn't change; an hour keeps the dialog snappy across re-opens.
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
