"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { ApiError } from "@/lib/api-error";
import { InspectionReportSection } from "@/components/reports/inspection-report-section";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "Oluşturuldu",
  UPDATE: "Güncellendi",
  DELETE: "Silindi",
};

export default function ReportsPage() {
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const { data, isLoading, error } = useAuditLogs(page, pageSize);

  if (error instanceof ApiError && error.status === 403) {
    return (
      <PanelCard title="Denetim Kaydı">
        <div className="flex flex-col items-center gap-2 px-4.5 py-14 text-center">
          <ShieldAlert className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Bu sayfayı görüntüleme yetkin yok.</p>
        </div>
      </PanelCard>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Raporlar</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Denetim raporu ve şirketinizdeki tüm değişikliklerin kaydı.
        </p>
      </div>

      <InspectionReportSection />

      <PanelCard
        title={`Denetim Kaydı${data?.total != null ? ` (${data.total.toLocaleString("tr")})` : ""}`}
        className="print:hidden"
      >
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-64 rounded" />
          </div>
        ) : data?.items && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>İşlem</TableHead>
                    <TableHead>Varlık türü</TableHead>
                    <TableHead>Varlık</TableHead>
                    <TableHead>Kullanıcı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(entry.occurredAt).toLocaleString("tr")}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </TableCell>
                      <TableCell className="text-xs">{entry.entityType}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        …{entry.entityId.slice(-8)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {entry.userId ? `…${entry.userId.slice(-8)}` : "sistem"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4.5 py-3">
              <span className="text-xs text-muted-foreground">
                Sayfa {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">Henüz denetim kaydı yok.</p>
        )}
      </PanelCard>
    </div>
  );
}
