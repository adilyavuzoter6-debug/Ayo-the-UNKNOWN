"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { WeightForecastResult } from "@/lib/types";

/** `additionalFarmIds` folds other farms' live stock into the same projection — for a grow-out
 *  pipeline (juveniles at one farm, transferred to another as they size up), combining them is
 *  what makes those transfers a non-issue for the forecast instead of something it mis-tracks. */
export function useWeightForecast(
  farmId: string,
  bucketWidthG: number,
  avgFcr: number | null,
  additionalFarmIds: string[] = [],
) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["weight-forecast", companyId, farmId, bucketWidthG, avgFcr, additionalFarmIds],
    queryFn: () => {
      const params = new URLSearchParams({ bucketWidthG: String(bucketWidthG) });
      if (avgFcr) params.set("avgFcr", String(avgFcr));
      if (additionalFarmIds.length > 0) params.set("additionalFarmIds", additionalFarmIds.join(","));
      return api.get<WeightForecastResult>(`/farms/${farmId}/weight-forecast?${params.toString()}`);
    },
    enabled: !!companyId && !!farmId && bucketWidthG > 0,
  });
}
