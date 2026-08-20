"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { InspectionReport } from "@/lib/types";

export function useInspectionReport(farmId: string, periodStart: string, periodEnd: string) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["inspection-report", companyId, farmId, periodStart, periodEnd],
    queryFn: () =>
      api.get<InspectionReport>(
        `/farms/${farmId}/inspection-report?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
      ),
    enabled: !!companyId && !!farmId && !!periodStart && !!periodEnd,
  });
}
