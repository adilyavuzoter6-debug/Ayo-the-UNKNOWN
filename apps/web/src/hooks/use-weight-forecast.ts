"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { WeightForecastResult } from "@/lib/types";

export function useWeightForecast(farmId: string, bucketWidthG: number, avgFcr: number | null) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["weight-forecast", companyId, farmId, bucketWidthG, avgFcr],
    queryFn: () =>
      api.get<WeightForecastResult>(
        `/farms/${farmId}/weight-forecast?bucketWidthG=${bucketWidthG}${avgFcr ? `&avgFcr=${avgFcr}` : ""}`,
      ),
    enabled: !!companyId && !!farmId && bucketWidthG > 0,
  });
}
