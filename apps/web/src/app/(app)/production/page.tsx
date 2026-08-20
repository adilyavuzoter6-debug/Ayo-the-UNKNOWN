"use client";

import * as React from "react";
import type { ComponentType } from "react";
import { AlertCircle, Droplets, Fish, Filter, Plus, Weight, Wheat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import { ViewToggle, type ViewMode } from "@/components/shared/view-toggle";

interface Pool {
  id: string;
  status: StatusKind;
  batch: string;
  species: string;
  count: number;
  avgWeight: number;
  biomass: number;
  density: number;
  dailyFeed: number;
  dailyDeath: number;
  oxygen: number;
  alerts: number;
}

const pools: Pool[] = [
  { id: "A-01", status: "active", batch: "PTI-2024-08", species: "Alabalık", count: 58200, avgWeight: 312, biomass: 18147, density: 24.2, dailyFeed: 386, dailyDeath: 12, oxygen: 7.8, alerts: 0 },
  { id: "A-02", status: "active", batch: "PTI-2024-08", species: "Alabalık", count: 64900, avgWeight: 328, biomass: 21287, density: 26.1, dailyFeed: 450, dailyDeath: 8, oxygen: 7.5, alerts: 0 },
  { id: "A-03", status: "warning", batch: "PTI-2024-06", species: "Alabalık", count: 67100, avgWeight: 295, biomass: 19795, density: 27.8, dailyFeed: 420, dailyDeath: 34, oxygen: 6.9, alerts: 1 },
  { id: "A-04", status: "active", batch: "PTI-2024-09", species: "Çipura", count: 82400, avgWeight: 268, biomass: 22083, density: 22.4, dailyFeed: 465, dailyDeath: 15, oxygen: 7.6, alerts: 0 },
  { id: "A-05", status: "active", batch: "PTI-2024-09", species: "Çipura", count: 78600, avgWeight: 224, biomass: 17607, density: 19.8, dailyFeed: 370, dailyDeath: 11, oxygen: 7.9, alerts: 0 },
  { id: "A-06", status: "empty", batch: "—", species: "—", count: 0, avgWeight: 0, biomass: 0, density: 0, dailyFeed: 0, dailyDeath: 0, oxygen: 8.1, alerts: 0 },
  { id: "B-01", status: "active", batch: "PTI-2024-07", species: "Levrek", count: 45300, avgWeight: 373, biomass: 16897, density: 21.3, dailyFeed: 355, dailyDeath: 9, oxygen: 7.4, alerts: 0 },
  { id: "B-02", status: "critical", batch: "PTI-2024-07", species: "Levrek", count: 41200, avgWeight: 389, biomass: 16027, density: 22.9, dailyFeed: 336, dailyDeath: 89, oxygen: 5.2, alerts: 2 },
];

export default function ProductionPage() {
  const [view, setView] = React.useState<ViewMode>("card");
  const active = pools.filter((p) => p.status === "active").length;
  const critical = pools.filter((p) => p.status === "critical").length;
  const empty = pools.filter((p) => p.status === "empty").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Üretim Birimleri</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pools.length} havuz/kafes · {active} aktif · {critical} kritik · {empty} boş
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-muted/60"
          >
            <Filter className="size-3.5" /> Filtrele
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Havuz Ekle
          </button>
        </div>
      </div>

      {view === "card" ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} />
          ))}
        </div>
      ) : (
        <PoolTable />
      )}
    </div>
  );
}

function PoolCard({ pool }: { pool: Pool }) {
  const isEmpty = pool.status === "empty";
  return (
    <Card className="gap-0 overflow-hidden py-0 opacity-100" style={isEmpty ? { opacity: 0.7 } : undefined}>
      <div className="flex items-center justify-between bg-secondary px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-extrabold text-navy-900">{pool.id}</span>
          {pool.alerts > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-bold text-destructive">
              <AlertCircle className="size-3" /> {pool.alerts}
            </span>
          )}
        </div>
        <StatusBadge status={pool.status} />
      </div>

      {!isEmpty ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-3.5 py-3">
          <PoolStat label="Parti" value={pool.batch} mono small />
          <PoolStat label="Tür" value={pool.species} />
          <PoolStat icon={Fish} label="Adet" value={pool.count.toLocaleString("tr")} />
          <PoolStat icon={Weight} label="Biyokütle" value={`${(pool.biomass / 1000).toFixed(1)} t`} accent />
          <PoolStat label="Ort. Ağırlık" value={`${pool.avgWeight} g`} />
          <PoolStat label="Yoğunluk" value={`${pool.density} kg/m³`} />
          <PoolStat icon={Wheat} label="Günlük Yem" value={`${pool.dailyFeed} kg`} />
          <PoolStat
            icon={Droplets}
            label="O₂"
            value={`${pool.oxygen} mg/L`}
            valueClass={pool.oxygen < 6 ? "text-destructive" : pool.oxygen < 7 ? "text-warning" : "text-success"}
          />
        </div>
      ) : (
        <div className="px-6 py-6 text-center text-sm text-muted-foreground">Havuz boş — balık partisi yok</div>
      )}

      {pool.dailyDeath > 0 && (
        <div
          className={`flex items-center justify-between border-t border-border px-3.5 py-1.5 ${pool.dailyDeath > 30 ? "bg-destructive/5" : "bg-warning/10"}`}
        >
          <span className={`text-[11px] font-semibold ${pool.dailyDeath > 30 ? "text-destructive" : "text-warning"}`}>
            Günlük Ölüm
          </span>
          <span className={`font-mono text-sm font-bold ${pool.dailyDeath > 30 ? "text-destructive" : "text-warning"}`}>
            {pool.dailyDeath} adet
          </span>
        </div>
      )}
    </Card>
  );
}

function PoolStat({
  icon: Icon,
  label,
  value,
  mono,
  small,
  accent,
  valueClass,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  accent?: boolean;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
        {Icon && <Icon className="size-2.5" />}
        {label}
      </div>
      <div
        className={`${mono ? "font-mono" : ""} ${small ? "text-[11px]" : "text-[13px]"} font-bold ${
          valueClass ?? (accent ? "text-teal-500" : "text-foreground")
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PoolTable() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary">
              {["Havuz", "Durum", "Parti", "Tür", "Adet", "Ort. Ağırlık", "Biyokütle", "Yoğunluk", "Günlük Yem", "Günlük Ölüm", "O₂"].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-border px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {pools.map((pool) => (
              <tr key={pool.id} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                <td className="px-3.5 py-2.5 font-mono text-sm font-extrabold text-navy-900">{pool.id}</td>
                <td className="px-3.5 py-2.5">
                  <StatusBadge status={pool.status} />
                </td>
                <td className="px-3.5 py-2.5 font-mono text-xs text-muted-foreground">{pool.batch}</td>
                <td className="px-3.5 py-2.5">{pool.species}</td>
                <td className="px-3.5 py-2.5 font-mono">{pool.count > 0 ? pool.count.toLocaleString("tr") : "—"}</td>
                <td className="px-3.5 py-2.5 font-mono">{pool.avgWeight > 0 ? `${pool.avgWeight} g` : "—"}</td>
                <td className="px-3.5 py-2.5 font-mono font-semibold text-teal-500">
                  {pool.biomass > 0 ? `${(pool.biomass / 1000).toFixed(1)} t` : "—"}
                </td>
                <td className="px-3.5 py-2.5 font-mono">{pool.density > 0 ? pool.density : "—"}</td>
                <td className="px-3.5 py-2.5 font-mono">{pool.dailyFeed > 0 ? `${pool.dailyFeed} kg` : "—"}</td>
                <td
                  className={`px-3.5 py-2.5 font-mono ${
                    pool.dailyDeath > 30 ? "font-bold text-destructive" : pool.dailyDeath > 0 ? "text-warning" : "text-muted-foreground/60"
                  }`}
                >
                  {pool.dailyDeath > 0 ? pool.dailyDeath : "—"}
                </td>
                <td
                  className={`px-3.5 py-2.5 font-mono font-semibold ${
                    pool.oxygen < 6 ? "text-destructive" : pool.oxygen < 7 ? "text-warning" : "text-success"
                  }`}
                >
                  {pool.oxygen}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
