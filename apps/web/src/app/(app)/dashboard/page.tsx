"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Fish,
  Scale,
  TrendingUp,
  Wheat,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PanelCard } from "@/components/shared/panel-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFarms } from "@/hooks/use-farms";
import { useFarmDashboardKpis } from "@/hooks/use-dashboard-kpis";
import { useFarmAlerts, useResolveAlert } from "@/hooks/use-alerts";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { ApiError } from "@/lib/api-error";
import { toast } from "sonner";

function fmt(n: number, digits = 0) {
  return n.toLocaleString("tr", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

const ALERT_SEVERITY_STYLE: Record<string, { icon: typeof AlertCircle; text: string; bg: string }> = {
  HIGH: { icon: AlertCircle, text: "text-destructive", bg: "bg-destructive/5" },
  MEDIUM: { icon: AlertTriangle, text: "text-warning", bg: "bg-warning/10" },
  LOW: { icon: AlertTriangle, text: "text-muted-foreground", bg: "bg-muted/40" },
};

function AlertsPanel({ farmId }: { farmId: string }) {
  const { data: alerts, isLoading } = useFarmAlerts(farmId, "OPEN");
  const resolveAlert = useResolveAlert(farmId);

  async function handleResolve(alertId: string) {
    try {
      await resolveAlert.mutateAsync(alertId);
      toast.success("Uyarı çözüldü olarak işaretlendi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Uyarı çözülürken bir sorun oluştu.");
    }
  }

  return (
    <PanelCard title="Açık Uyarılar" action="Tümü" onAction={() => {}}>
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-16 rounded" />
        </div>
      ) : alerts && alerts.length > 0 ? (
        <div className="flex flex-col">
          {alerts.map((a) => {
            const style = ALERT_SEVERITY_STYLE[a.severity] ?? ALERT_SEVERITY_STYLE.LOW!;
            const AlertIcon = style.icon;
            return (
              <div
                key={a.id}
                className={`flex items-start gap-2.5 border-b border-border px-4.5 py-2.5 last:border-b-0 ${style.bg}`}
              >
                <AlertIcon className={`mt-0.5 size-3.5 shrink-0 ${style.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs leading-snug text-foreground">{a.message}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {new Date(a.createdAt).toLocaleString("tr")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={resolveAlert.isPending}
                  onClick={() => handleResolve(a.id)}
                  aria-label="Çözüldü"
                >
                  <CheckCircle2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-4.5 py-8 text-center text-sm text-muted-foreground">Açık uyarı yok.</p>
      )}
    </PanelCard>
  );
}

function ActivityPanel() {
  const { data, isLoading } = useAuditLogs(1, 8);

  return (
    <PanelCard title="Son Aktiviteler">
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-16 rounded" />
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="flex flex-col">
          {data.items.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 border-b border-border px-4.5 py-2.5 last:border-b-0">
              <div className="flex-1">
                <div className="text-[11.5px] leading-snug text-foreground">
                  <span className="font-medium">{entry.action}</span> · {entry.entityType}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                  {new Date(entry.occurredAt).toLocaleString("tr")}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4.5 py-8 text-center text-sm text-muted-foreground">Henüz aktivite yok.</p>
      )}
    </PanelCard>
  );
}

export default function DashboardPage() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState<string>("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");
  const selectedFarm = farms?.find((f) => f.id === farmId);

  const { data: kpis, isLoading: kpisLoading } = useFarmDashboardKpis(farmId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Çiftlik seçin">
              {(v: string) => farms?.find((f) => f.id === v)?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(farms ?? []).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {selectedFarm ? (
          <Link href={`/farms/${selectedFarm.id}`} className="text-xs font-medium text-teal-500 hover:underline">
            Çiftlik detayına git →
          </Link>
        ) : null}
      </div>

      {!farmId ? (
        <PanelCard title="Genel Bakış">
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Henüz bir çiftlik yok — önce Çiftlikler sayfasından bir çiftlik oluştur.
          </p>
        </PanelCard>
      ) : kpisLoading || !kpis ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <KpiCard icon={Fish} color="#0d2d5e" label="Toplam Canlı Balık" value={fmt(kpis.fishCount)} sub="canlı stok" />
            <KpiCard
              icon={Scale}
              color="#00b4d8"
              label="Güncel Biyokütle"
              value={fmt(kpis.biomassKg / 1000, 2)}
              unit="t"
              sub={`${kpis.activeBatchesCount} aktif parti`}
            />
            <KpiCard
              icon={TrendingUp}
              color="#10b981"
              label="FCR (30 gün)"
              value={kpis.avgFcr !== null ? fmt(kpis.avgFcr, 2) : "—"}
              sub={kpis.avgFcr !== null ? "ortalama" : "veri yok"}
            />
            <KpiCard
              icon={TrendingUp}
              color="#8b5cf6"
              label="SGR"
              value={kpis.avgSgrPctPerDay !== null ? fmt(kpis.avgSgrPctPerDay, 2) : "—"}
              unit={kpis.avgSgrPctPerDay !== null ? "%/gün" : undefined}
              sub={kpis.avgSgrPctPerDay !== null ? "büyüme oranı" : "en az 2 örnekleme gerekir"}
            />
            <KpiCard icon={Wheat} color="#f59e0b" label="Bugünkü Yem" value={fmt(kpis.todayFeedKg, 1)} unit="kg" sub="bugün verilen" />
            <KpiCard
              icon={AlertTriangle}
              color="#ef4444"
              label="7 Günlük Mortalite"
              value={fmt(kpis.mortalityRate7dPct, 2)}
              unit="%"
              sub="canlı stoğa oranla"
            />
            <KpiCard icon={AlertCircle} color="#ef4444" label="Açık Uyarılar" value={fmt(kpis.openAlertsCount)} sub="çözülmeyi bekliyor" />
            <KpiCard icon={Fish} color="#0d2d5e" label="Aktif Parti" value={fmt(kpis.activeBatchesCount)} sub="bu çiftlikte" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AlertsPanel farmId={farmId} />
            <ActivityPanel />
          </div>
        </>
      )}
    </div>
  );
}
