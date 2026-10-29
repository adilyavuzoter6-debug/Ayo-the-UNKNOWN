"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, HeartPulse, Wheat } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnomalies } from "@/hooks/use-reports";
import type { Anomaly, AnomalyKind, AnomalySeverity } from "@/lib/types";

const KIND: Record<AnomalyKind, { label: string; icon: typeof Activity }> = {
  FCR_HIGH: { label: "Yüksek FCR", icon: Wheat },
  FCR_LOW: { label: "Şüpheli düşük FCR", icon: Wheat },
  MORTALITY_RISK: { label: "Ölüm riski", icon: HeartPulse },
};

const SEVERITY: Record<AnomalySeverity, { label: string; variant: "destructive" | "warning" | "secondary" }> = {
  HIGH: { label: "Yüksek", variant: "destructive" },
  MEDIUM: { label: "Orta", variant: "warning" },
  LOW: { label: "Düşük", variant: "secondary" },
};

function fmt(n: number, digits = 2) {
  return n.toLocaleString("tr", { maximumFractionDigits: digits });
}

function headline(a: Anomaly): string {
  if (a.kind === "MORTALITY_RISK") {
    return `Haftalık ölüm %${fmt(a.value)}` + (a.reference ? ` (önceki ortalama %${fmt(a.reference)})` : "");
  }
  return `FCR ${fmt(a.value)}` + (a.reference ? ` (karşılaştırma ${fmt(a.reference)})` : "");
}

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const kind = KIND[anomaly.kind];
  const severity = SEVERITY[anomaly.severity];
  return (
    <div className="flex items-start gap-3 border-b border-border px-4.5 py-3 last:border-b-0">
      <kind.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{kind.label}</span>
          <Badge variant={severity.variant}>{severity.label}</Badge>
          <Link href={`/batches/${anomaly.batchId}`} className="font-mono text-xs text-teal-500 hover:underline">
            {anomaly.lotCode}
          </Link>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {anomaly.farms.map((f) => f.name).join(", ")} · {anomaly.tankCodes.join(", ")} · {anomaly.speciesName}
        </div>
        <div className="mt-1 text-xs font-medium text-foreground">{headline(anomaly)}</div>
        <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
          {anomaly.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Batches whose FCR or recent mortality looks out of line, as flagged by the API's anomaly rules.
 * `limit` shows only the most severe few, with a link to the full list on the reports page.
 */
export function AnomaliesPanel({ limit }: { limit?: number }) {
  const router = useRouter();
  const { data, isLoading } = useAnomalies();
  const items = data ? (limit ? data.items.slice(0, limit) : data.items) : [];
  const more = data && limit && data.items.length > limit;

  return (
    <PanelCard
      title={`Anomaliler${data && data.items.length > 0 ? ` (${data.items.length})` : ""}`}
      action={limit ? "Tümü" : undefined}
      onAction={limit ? () => router.push("/reports") : undefined}
    >
      {isLoading || !data ? (
        <div className="p-4">
          <Skeleton className="h-16 rounded" />
        </div>
      ) : items.length > 0 ? (
        <div className="flex flex-col">
          {items.map((a) => (
            <AnomalyRow key={`${a.batchId}-${a.kind}`} anomaly={a} />
          ))}
          {more ? (
            <p className="px-4.5 py-2 text-xs text-muted-foreground">
              {data.items.length - limit!} anomali daha Raporlar sayfasında.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="flex items-center justify-center gap-2 px-4.5 py-8 text-center text-sm text-muted-foreground">
          <Activity className="size-4" /> {data.batchesChecked} aktif parti incelendi, anormal bir durum yok.
        </p>
      )}
      {!limit && data ? (
        <p className="border-t border-border px-4.5 py-2.5 text-[11px] leading-snug text-muted-foreground">
          FCR, partinin hedef FCR&apos;sı varsa onunla, yoksa aynı türdeki en az 5 partinin ortancasıyla karşılaştırılır
          ({data.batchesWithFcr}/{data.batchesChecked} partinin FCR&apos;ı hesaplanabildi; bunun için en az 30 günlük
          olması ve tartımla ölçülmüş büyümesi olması gerekir). Ölüm riski, son 7 günü partinin önceki 4 haftasıyla
          karşılaştırır.
        </p>
      ) : null}
    </PanelCard>
  );
}
