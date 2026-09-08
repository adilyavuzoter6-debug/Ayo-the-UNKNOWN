"use client";

import * as React from "react";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertRow } from "@/components/alerts/alert-row";
import { useCompanyAlerts, useResolveAlert } from "@/hooks/use-alerts";
import { useFarms } from "@/hooks/use-farms";
import { ApiError } from "@/lib/api-error";
import type { AlertStatus } from "@/lib/types";
import { toast } from "sonner";

type StatusFilter = AlertStatus | "ALL";

const STATUS_LABEL: Record<StatusFilter, string> = {
  OPEN: "Açık",
  RESOLVED: "Çözülmüş",
  ALL: "Tümü",
};

export default function AlertsPage() {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("OPEN");
  const status = statusFilter === "ALL" ? undefined : statusFilter;
  const { data: alerts, isLoading } = useCompanyAlerts(status);
  const { data: farms } = useFarms();
  const resolveAlert = useResolveAlert();

  const farmNameById = React.useMemo(
    () => new Map((farms ?? []).map((f) => [f.id, f.name])),
    [farms],
  );

  async function handleResolve(alertId: string) {
    try {
      await resolveAlert.mutateAsync(alertId);
      toast.success("Uyarı çözüldü olarak işaretlendi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Uyarı çözülürken bir sorun oluştu.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={statusFilter}
        onValueChange={(v) => setStatusFilter((v as StatusFilter) ?? "OPEN")}
      >
        <SelectTrigger className="w-40">
          <SelectValue>{(v: string) => STATUS_LABEL[v as StatusFilter]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="OPEN">Açık</SelectItem>
          <SelectItem value="RESOLVED">Çözülmüş</SelectItem>
          <SelectItem value="ALL">Tümü</SelectItem>
        </SelectContent>
      </Select>

      <PanelCard title="Uyarılar">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-16 rounded" />
          </div>
        ) : alerts && alerts.length > 0 ? (
          <div className="flex flex-col">
            {alerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                farmName={a.farmId ? farmNameById.get(a.farmId) : undefined}
                onResolve={a.status === "OPEN" ? () => handleResolve(a.id) : undefined}
                resolving={resolveAlert.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            {statusFilter === "OPEN" ? "Açık uyarı yok." : "Uyarı bulunamadı."}
          </p>
        )}
      </PanelCard>
    </div>
  );
}
