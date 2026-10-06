"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import type { ForeignCurrency, ForeignRate } from "@/lib/types";

/**
 * The Central Bank's selling rate for a foreign currency on `date` (yyyy-mm-dd). Used to pre-fill the
 * rate field on costs, sales and stock purchases — the user can still override it. The server applies
 * the same lookup when no rate is sent, so a failed lookup here only means the field starts empty.
 */
export function useExchangeRate(currency: ForeignCurrency | undefined, date: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["exchange-rate", currency, date],
    queryFn: () =>
      api.get<ForeignRate>(
        `/exchange-rates?currency=${currency}&date=${encodeURIComponent(date!)}`,
      ),
    enabled: !!currency && !!date,
    // A published day's rate doesn't change; an hour keeps the dialog snappy across re-opens.
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
