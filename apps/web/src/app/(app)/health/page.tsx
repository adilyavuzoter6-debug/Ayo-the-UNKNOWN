"use client";

import * as React from "react";
import Link from "next/link";
import { HeartPulse, Skull } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFarms } from "@/hooks/use-farms";
import { useFarmMortalityLog } from "@/hooks/use-farm-mortality-log";
import type { MortalityReason } from "@/lib/types";

const REASON_LABEL: Record<MortalityReason, string> = {
  UNKNOWN: "Bilinmiyor",
  DISEASE: "Hastalık",
  OXYGEN: "Oksijen yetersizliği",
  TEMPERATURE: "Sıcaklık",
  TRANSFER_STRESS: "Transfer stresi",
  PHYSICAL_DAMAGE: "Fiziksel hasar",
  PREDATOR: "Yırtıcı",
  FEED_RELATED: "Yemle ilişkili",
  OTHER: "Diğer",
};

export default function HealthPage() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState<string>("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");

  const { entries, isLoading } = useFarmMortalityLog(farmId);

  const thirtyDaysAgo = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);
  const last30 = entries.filter((e) => new Date(e.occurredAt) >= thirtyDaysAgo);
  const total30 = last30.reduce((sum, e) => sum + e.fishCount, 0);

  const reasonCounts = last30.reduce<Record<string, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + e.fishCount;
    return acc;
  }, {});
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Sağlık & Ölüm</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Son 30 günde {total30.toLocaleString("tr")} adet ölüm
            {topReason ? ` · en sık neden: ${REASON_LABEL[topReason[0] as MortalityReason]}` : ""}
          </p>
        </div>
        <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Çiftlik seçin" />
          </SelectTrigger>
          <SelectContent>
            {(farms ?? []).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PanelCard title="Ölüm kayıtları">
        {!farmId ? (
          <p className="flex items-center gap-2 px-4.5 py-10 text-sm text-muted-foreground">
            <HeartPulse className="size-4" /> Kayıtları görmek için bir çiftlik seçin.
          </p>
        ) : isLoading ? (
          <div className="p-4">
            <Skeleton className="h-48 rounded" />
          </div>
        ) : entries.length > 0 ? (
          <ul className="divide-y divide-border">
            {entries.slice(0, 100).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <Skull className="size-3.5 shrink-0 text-destructive" />
                  <span className="font-mono text-foreground">{e.tank.code}</span>
                  <span className="text-muted-foreground">· {REASON_LABEL[e.reason]}</span>
                  {e.notes ? <span className="text-muted-foreground/80">— {e.notes}</span> : null}
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/batches/${e.batchId}`} className="font-mono text-destructive hover:underline">
                    {e.fishCount.toLocaleString("tr")} adet
                  </Link>
                  <span className="font-mono text-muted-foreground">
                    {new Date(e.occurredAt).toLocaleString("tr")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Bu çiftlikte henüz ölüm kaydı yok.
          </p>
        )}
      </PanelCard>
    </div>
  );
}
