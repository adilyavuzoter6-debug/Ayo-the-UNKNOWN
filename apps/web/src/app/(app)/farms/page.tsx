"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Fish, MapPin, Sprout, Weight, Wheat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { ViewToggle, type ViewMode } from "@/components/shared/view-toggle";
import { CreateFarmDialog } from "@/components/farms/create-farm-dialog";
import { EditFarmDialog } from "@/components/farms/edit-farm-dialog";
import { DeleteFarmDialog } from "@/components/farms/delete-farm-dialog";
import { useFarms } from "@/hooks/use-farms";
import { useFarmsStockSummaries } from "@/hooks/use-farm-stock-summary";
import type { Farm, FarmStockSummary } from "@/lib/types";

export default function FarmsPage() {
  const { data: farms, isLoading, isError } = useFarms();
  const [view, setView] = React.useState<ViewMode>("card");

  const farmIds = React.useMemo(() => farms?.map((f) => f.id) ?? [], [farms]);
  const { summaries } = useFarmsStockSummaries(farmIds);

  const totals = React.useMemo(() => {
    if (!farms?.length) return null;
    let facilities = 0;
    let pools = 0;
    for (const f of farms) {
      const stats = summaries.get(f.id);
      if (!stats) continue;
      facilities += stats.facilities;
      pools += stats.pools;
    }
    return { facilities, pools };
  }, [farms, summaries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Çiftlikler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {farms?.length ?? 0} çiftlik
            {totals ? ` · ${totals.facilities} tesis · ${totals.pools} havuz/kafes` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <CreateFarmDialog />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Çiftlikler yüklenemedi. Sayfayı yenilemeyi deneyin.
          </CardContent>
        </Card>
      ) : farms && farms.length > 0 ? (
        view === "card" ? (
          <FarmCardGrid farms={farms} summaries={summaries} />
        ) : (
          <FarmTable farms={farms} summaries={summaries} />
        )
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Sprout className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Henüz çiftlik yok</p>
              <p className="text-sm text-muted-foreground">
                Havuz ve balık partilerini modellemeye başlamak için ilk çiftliğinizi oluşturun.
              </p>
            </div>
            <CreateFarmDialog />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FarmCardGrid({
  farms,
  summaries,
}: {
  farms: Farm[];
  summaries: Map<string, FarmStockSummary>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {farms.map((farm) => {
        const stats = summaries.get(farm.id);
        return (
          <Link key={farm.id} href={`/farms/${farm.id}`}>
            <Card className="h-full gap-0 overflow-hidden py-0 transition-colors hover:ring-teal-500/60">
              <div className="bg-linear-to-br from-navy-900 to-navy-700 px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-base font-bold text-white">{farm.name}</div>
                    {farm.timezone ? (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-white/65">
                        <MapPin className="size-3" />
                        {farm.timezone}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {stats && stats.openAlertsCount > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-warning/90 px-1.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                        <AlertTriangle className="size-2.5" /> {stats.openAlertsCount}
                      </span>
                    )}
                    <StatusBadge status={farm.status === "ACTIVE" ? "active" : "inactive"} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-medium text-muted-foreground">
                  <Sprout className="size-3 shrink-0" />
                  <span className="truncate font-mono">{farm.code}</span>
                </span>
                <div
                  className="flex shrink-0 items-center gap-0.5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <EditFarmDialog farm={farm} />
                  <DeleteFarmDialog farm={farm} />
                </div>
              </div>

              <CardContent className="grid grid-cols-2 gap-x-5 gap-y-3 py-3.5">
                {stats ? (
                  <>
                    <Stat label="Tesis / Havuz" value={`${stats.facilities} / ${stats.pools}`} />
                    <Stat icon={Fish} label="Canlı Balık" value={stats.fishCount.toLocaleString("tr")} />
                    <Stat
                      icon={Weight}
                      label="Biyokütle"
                      value={`${(stats.biomassKg / 1000).toFixed(1)} t`}
                      valueClassName="text-teal-500"
                    />
                    <Stat icon={Wheat} label="Günlük Yem" value={`${stats.todayFeedKg.toLocaleString("tr")} kg`} />
                  </>
                ) : (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground/80">
        {Icon && <Icon className="size-2.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`truncate font-mono text-sm font-semibold text-foreground ${valueClassName ?? ""}`}>{value}</div>
    </div>
  );
}

function FarmTable({
  farms,
  summaries,
}: {
  farms: Farm[];
  summaries: Map<string, FarmStockSummary>;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary">
              {[
                "Çiftlik",
                "Kod",
                "Bölge",
                "Tesis/Havuz",
                "Canlı Balık",
                "Biyokütle",
                "Günlük Yem",
                "Uyarı",
                "Durum",
                "",
              ].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-border px-4 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {farms.map((farm) => {
              const stats = summaries.get(farm.id);
              return (
                <tr key={farm.id} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/farms/${farm.id}`} className="font-medium text-foreground hover:text-teal-500">
                      {farm.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{farm.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{farm.timezone ?? "—"}</td>
                  {stats ? (
                    <>
                      <td className="px-4 py-3 font-mono">
                        {stats.facilities} / {stats.pools}
                      </td>
                      <td className="px-4 py-3 font-mono">{stats.fishCount.toLocaleString("tr")}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-teal-500">
                        {(stats.biomassKg / 1000).toFixed(1)} t
                      </td>
                      <td className="px-4 py-3 font-mono">{stats.todayFeedKg.toLocaleString("tr")} kg</td>
                      <td className="px-4 py-3">
                        {stats.openAlertsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-semibold text-warning">
                            <AlertTriangle className="size-2.5" /> {stats.openAlertsCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-3" colSpan={5}>
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <StatusBadge status={farm.status === "ACTIVE" ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex shrink-0 items-center justify-end gap-0.5">
                      <EditFarmDialog farm={farm} />
                      <DeleteFarmDialog farm={farm} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
