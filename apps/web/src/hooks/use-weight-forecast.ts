"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { WeightForecastResult } from "@/lib/types";

export function useWeightForecast(farmId: string, bucketWidthG: number) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["weight-forecast", companyId, farmId, bucketWidthG],
    queryFn: () =>
      api.get<WeightForecastResult>(
        `/farms/${farmId}/weight-forecast?bucketWidthG=${bucketWidthG}`,
      ),
    enabled: !!companyId && !!farmId && bucketWidthG > 0,
  });
}
