"use client";

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
import { useFarmProductionOverview } from "@/hooks/use-production-overview";
import type { TankStatus } from "@/lib/types";

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

  const activeCount = rows.filter((r) => r.allocations.length > 0).length;
  const emptyCount = rows.filter((r) => r.allocations.length === 0).length;

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ tank, allocations }) => {
            const totalCount = allocations.reduce((sum, a) => sum + a.estimatedCount, 0);
            const totalBiomassKg = allocations.reduce((sum, a) => {
              const avgWeightG = Number(
                a.batch.currentState?.estimatedAvgWeightG ?? a.batch.initialAvgWeightG,
              );
              return sum + (a.estimatedCount * avgWeightG) / 1000;
            }, 0);

            const maxBiomassKg = tank.maxBiomassKg ? Number(tank.maxBiomassKg) : null;
            const volumeM3 = tank.volumeM3 ? Number(tank.volumeM3) : null;
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
                          <span className="flex min-w-0 items-center gap-1">
                            <Fish className="size-3 shrink-0 text-muted-foreground" />
                            <span className="truncate font-mono">{a.batch.lotCode}</span>
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
