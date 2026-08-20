"use client";

import * as React from "react";
import Link from "next/link";
import { Scissors } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordHarvestDialog } from "@/components/harvest/record-harvest-dialog";
import { useFarms } from "@/hooks/use-farms";
import { useFarmTanks } from "@/hooks/use-tanks";
import { useTankFishBatches } from "@/hooks/use-fish-batches";
import { useTankHarvestRecords } from "@/hooks/use-harvest";
import type { HarvestRecord } from "@/lib/types";

function statusFor(record: HarvestRecord) {
  if (record.type === "PLANNED") return { status: "warning" as const, label: "Planlandı" };
  return { status: "active" as const, label: record.fullness === "FULL" ? "Tam hasat" : "Kısmi hasat" };
}

export default function HarvestPage() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState<string>("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");

  const { data: tanks } = useFarmTanks(farmId);
  const [selectedTankId, setSelectedTankId] = React.useState<string>("");
  const tankId =
    selectedTankId && tanks?.some((t) => t.id === selectedTankId)
      ? selectedTankId
      : (tanks?.[0]?.id ?? "");

  const selectedTank = tanks?.find((t) => t.id === tankId);
  const { data: allocations } = useTankFishBatches(tankId);
  const { data: records, isLoading } = useTankHarvestRecords(tankId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Hasat</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {selectedTank ? `${selectedTank.code} havuzu hasat kayıtları` : "Bir havuz seçin"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
            <SelectTrigger className="w-40">
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
          <Select value={tankId} onValueChange={(v) => setSelectedTankId(v ?? "")}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Havuz seçin" />
            </SelectTrigger>
            <SelectContent>
              {(tanks ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tankId && allocations && allocations.length > 0 ? (
            <RecordHarvestDialog farmId={farmId} tankId={tankId} allocations={allocations} />
          ) : null}
        </div>
      </div>

      {!tankId ? (
        <PanelCard title="Hasat kayıtları">
          <p className="flex items-center gap-2 px-4.5 py-10 text-sm text-muted-foreground">
            <Scissors className="size-4" /> Kayıtları görmek için bir çiftlik ve havuz seçin.
          </p>
        </PanelCard>
      ) : allocations && allocations.length === 0 ? (
        <PanelCard title="Hasat kayıtları">
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Bu havuzda hasat edilecek bir parti yok.
          </p>
        </PanelCard>
      ) : isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : records && records.length > 0 ? (
        <PanelCard title={`Hasat kayıtları — ${selectedTank?.code}`}>
          <ul className="divide-y divide-border">
            {records.map((r) => {
              const sc = statusFor(r);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4.5 py-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/batches/${r.batchId}`} className="font-mono text-foreground hover:text-teal-500">
                        …{r.batchId.slice(-6)}
                      </Link>
                      <StatusBadge status={sc.status} label={sc.label} />
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      {r.type === "PLANNED"
                        ? `Planlanan: ${r.plannedDate ? new Date(r.plannedDate).toLocaleDateString("tr") : "—"}`
                        : `${r.harvestedAt ? new Date(r.harvestedAt).toLocaleString("tr") : "—"}`}
                      {r.sizeGrade ? ` · ${r.sizeGrade}` : ""}
                      {r.destination ? ` · ${r.destination}` : ""}
                    </div>
                  </div>
                  {r.fishCount !== null ? (
                    <div className="text-right font-mono">
                      <div className="text-foreground">{r.fishCount.toLocaleString("tr")} balık</div>
                      <div className="text-muted-foreground">
                        {r.biomassKg !== null ? `${(Number(r.biomassKg) / 1000).toFixed(2)} t` : ""}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </PanelCard>
      ) : (
        <PanelCard title="Hasat kayıtları">
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Bu havuz için henüz hasat kaydı yok.
          </p>
        </PanelCard>
      )}
    </div>
  );
}
