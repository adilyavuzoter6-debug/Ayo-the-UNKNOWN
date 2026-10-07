"use client";

import { batchWeightLabel } from "@/lib/fish-batch-weight";
import * as React from "react";
import Link from "next/link";
import { Fish } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CapacityBar } from "@/components/tanks/capacity-bar";
import { useFarms } from "@/hooks/use-farms";
import { useFarmDashboardKpis } from "@/hooks/use-dashboard-kpis";
import { useFarmProductionOverview } from "@/hooks/use-production-overview";
import {
  CROWDED_CAPACITY_RATIO,
  estimateDaysToTarget,
  summarizeFarmProduction,
  tankLoad,
  type FarmProductionSummary,
  type TankLoad,
} from "@/lib/farm-production-summary";
import type { FarmDashboardKpis, TankStatus } from "@/lib/types";

const TANK_STATUS_KIND: Record<TankStatus, StatusKind> = {
  ACTIVE: "active",
  MAINTENANCE: "warning",
  INACTIVE: "inactive",
};

export default function ProductionPage() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState<string>("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");

  const { rows, isLoading } = useFarmProductionOverview(farmId);
  const { data: kpis } = useFarmDashboardKpis(farmId);

  const activeCount = rows.filter((r) => r.allocations.length > 0).length;
  const emptyCount = rows.filter((r) => r.allocations.length === 0).length;
  const loads = rows.map(({ tank, allocations }) => tankLoad(tank, allocations));
  const summary = summarizeFarmProduction(loads);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Üretim Birimleri</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.length} havuz · {activeCount} stoklu · {emptyCount} boş
          </p>
        </div>
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
      </div>

      {farms === undefined ? (
        // See dashboard/page.tsx — undefined (not loaded yet, for any reason) is distinct from
        // a confirmed-empty farms list, and must not show the "go create a farm" message.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : !farmId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Henüz bir çiftlik yok.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : rows.length > 0 ? (
        <>
          <FarmSummaryCards summary={summary} kpis={kpis} loads={loads} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ tank, allocations }) => {
            const { count: totalCount, biomassKg: totalBiomassKg, maxBiomassKg, volumeM3 } = tankLoad(
              tank,
              allocations,
            );
            const densityKgPerM3 = volumeM3 && volumeM3 > 0 ? totalBiomassKg / volumeM3 : null;

            return (
              <Card key={tank.id} className="gap-0 overflow-hidden py-0">
                <div className="border-b border-border px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/farms/${farmId}/tanks/${tank.id}`}
                      className="font-mono text-sm font-bold text-navy-900 hover:text-teal-500"
                    >
                      {tank.code}
                    </Link>
                    <StatusBadge status={TANK_STATUS_KIND[tank.status]} />
                  </div>
                  {allocations.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <CapacityBar biomassKg={totalBiomassKg} maxBiomassKg={maxBiomassKg} />
                      <p className="text-[11px] text-muted-foreground">
                        Yoğunluk:{" "}
                        <span className="font-mono">
                          {densityKgPerM3 !== null ? `${densityKgPerM3.toFixed(1)} kg/m³` : "—"}
                        </span>
                      </p>
                    </div>
                  ) : null}
                </div>
                <CardContent className="space-y-2 py-3.5 text-xs">
                  {allocations.length === 0 ? (
                    <p className="py-4 text-center text-muted-foreground/60">Bu havuz boş.</p>
                  ) : (
                    <>
                      {allocations.map((a) => (
                        <Link
                          key={a.batchId}
                          href={`/batches/${a.batchId}`}
                          className="flex items-center justify-between gap-2 text-foreground hover:text-teal-500"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="flex min-w-0 items-center gap-1">
                              <Fish className="size-3 shrink-0 text-muted-foreground" />
                              <span className="truncate font-mono">{a.batch.lotCode}</span>
                            </span>
                            <span className="truncate pl-4 text-[11px] text-muted-foreground">
                              {batchWeightLabel(a.batch)}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-muted-foreground">
                            {a.estimatedCount.toLocaleString("tr")}
                          </span>
                        </Link>
                      ))}
                      <div className="flex items-center justify-between border-t border-border pt-2 font-medium">
                        <span className="text-muted-foreground">Toplam</span>
                        <span className="font-mono text-foreground">
                          {totalCount.toLocaleString("tr")} balık · {(totalBiomassKg / 1000).toFixed(2)} t
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Bu çiftlikte havuz yok.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const tons = (kg: number) => `${(kg / 1000).toLocaleString("tr", { maximumFractionDigits: 2 })} t`;

/** The farm at a glance: biomass, how full the ponds are, and where the room is. Computed from the pond rows. */
function FarmSummaryCards({
  summary,
  kpis,
  loads,
}: {
  summary: FarmProductionSummary;
  kpis: FarmDashboardKpis | undefined;
  loads: TankLoad[];
}) {
  const [targetWeightText, setTargetWeightText] = React.useState("");
  const targetWeightG = Number(targetWeightText);
  const hasTarget = targetWeightText.trim() !== "" && targetWeightG > 0;
  const eta = hasTarget ? estimateDaysToTarget(loads, targetWeightG, kpis?.avgSgrPctPerDay ?? null) : null;

  const cards = [
    {
      label: "Toplam biyokütle",
      value: tons(summary.biomassKg),
      note: `${summary.liveFish.toLocaleString("tr")} canlı balık`,
    },
    {
      label: "Kapasite kullanımı",
      value: summary.capacityUsedPct === null ? "—" : `%${Math.round(summary.capacityUsedPct)}`,
      note:
        summary.capacityUsedPct === null
          ? "Kapasitesi tanımlı havuz yok"
          : `Boş kapasite ${tons(summary.freeCapacityKg)}`,
    },
    {
      label: "Ortalama ağırlık",
      value: summary.avgWeightG === null ? "—" : `${Math.round(summary.avgWeightG).toLocaleString("tr")} g`,
      note: "Canlı balığa göre ağırlıklı",
    },
    {
      label: "Yoğunluk",
      value: summary.densityKgPerM3 === null ? "—" : `${summary.densityKgPerM3.toFixed(1)} kg/m³`,
      note: `Toplam hacim ${summary.volumeM3.toLocaleString("tr", { maximumFractionDigits: 1 })} m³`,
    },
    {
      label: "Sıkışık havuz",
      value: summary.crowdedCount.toString(),
      note: `Kapasitenin %${Math.round(CROWDED_CAPACITY_RATIO * 100)} ve üzeri`,
    },
    {
      label: "Boş havuz hacmi",
      value: `${summary.emptyVolumeM3.toLocaleString("tr", { maximumFractionDigits: 1 })} m³`,
      note: `${summary.emptyCount} boş havuz`,
    },
    {
      label: "Bugünkü yem",
      value: kpis ? `${kpis.todayFeedKg.toLocaleString("tr", { maximumFractionDigits: 1 })} kg` : "—",
      note: "bugün verilen",
    },
    {
      label: "7 günlük ölüm",
      value: kpis ? `%${kpis.mortalityRate7dPct.toLocaleString("tr", { maximumFractionDigits: 2 })}` : "—",
      note: "canlı stoğa oranla",
    },
    {
      label: "FCR (30 gün)",
      value: kpis?.avgFcr != null ? kpis.avgFcr.toFixed(2) : "—",
      note: kpis?.avgFcr != null ? "partilerin ortalaması" : "veri yok",
    },
    {
      label: "SGR",
      value: kpis?.avgSgrPctPerDay != null ? `${kpis.avgSgrPctPerDay.toFixed(2)} %/gün` : "—",
      note: kpis?.avgSgrPctPerDay != null ? "partilerin ortalaması" : "en az 2 tartım gerekir",
    },
    {
      label: "Hasada kalan gün (ort.)",
      value: !hasTarget
        ? "—"
        : eta?.avgDays != null
          ? `${Math.round(eta.avgDays)} gün`
          : "—",
      note: !hasTarget
        ? "Hedef gramaj girin"
        : eta?.avgDays != null
          ? `${eta.pondsTracked - eta.pondsAtTarget} havuz için, çiftlik SGR ortalamasına göre`
          : kpis?.avgSgrPctPerDay == null
            ? "SGR verisi yok"
            : `${eta?.pondsAtTarget ?? 0} havuz zaten hedefte`,
    },
  ];

  const gaps: string[] = [];
  if (summary.pondsWithoutCapacity > 0) gaps.push(`${summary.pondsWithoutCapacity} havuzda kapasite`);
  if (summary.pondsWithoutVolume > 0) gaps.push(`${summary.pondsWithoutVolume} havuzda hacim`);

  return (
    <section aria-label="Çiftlik özeti" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="harvest-target-weight" className="text-[11px] text-muted-foreground">
          Hasada kalan gün için hedef gramaj (g):
        </label>
        <input
          id="harvest-target-weight"
          type="number"
          min={0}
          step="1"
          value={targetWeightText}
          onChange={(e) => setTargetWeightText(e.target.value)}
          placeholder="örn. 300"
          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
        <span className="text-[11px] text-muted-foreground">Kaydedilmez, yalnızca bu ekranda kullanılır.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="gap-0 py-3">
            <CardContent className="space-y-1 px-3.5">
              <p className="text-[11px] text-muted-foreground">{c.label}</p>
              <p className="font-mono text-lg font-semibold text-foreground">{c.value}</p>
              <p className="text-[11px] text-muted-foreground">{c.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {gaps.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Özet hesabına girmeyen: {gaps.join(", ")} tanımlı değil. Bu havuzlar kapasite ve hacim değerlerinin dışında
          kalır.
        </p>
      ) : null}
    </section>
  );
}
