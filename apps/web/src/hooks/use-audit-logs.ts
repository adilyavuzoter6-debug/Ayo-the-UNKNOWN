"use client";

import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import type { Paginated } from "@/lib/api-client";
import { useApiClient } from "@/lib/api-client";
import type { AuditLogEntry } from "@/lib/types";

export function useAuditLogs(page: number, pageSize = 20) {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["audit-logs", companyId, page, pageSize],
    queryFn: () => api.get<Paginated<AuditLogEntry>>(`/audit-logs?page=${page}&pageSize=${pageSize}`),
    enabled: !!companyId,
  });
}
