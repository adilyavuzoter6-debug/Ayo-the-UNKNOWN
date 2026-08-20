"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, AlertCircle, CheckCircle2, Droplets, Plus, Thermometer } from "lucide-react";
import type { ComponentType } from "react";
import { PanelCard } from "@/components/shared/panel-card";

interface Measurement {
  param: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  status: "normal" | "warning" | "critical";
  icon: ComponentType<{ className?: string }>;
}

const measurements: Measurement[] = [
  { param: "Sıcaklık", unit: "°C", value: 18.4, min: 12, max: 22, status: "normal", icon: Thermometer },
  { param: "Çözünmüş O₂", unit: "mg/L", value: 7.2, min: 6, max: 12, status: "normal", icon: Droplets },
  { param: "pH", unit: "", value: 7.4, min: 6.5, max: 8.5, status: "normal", icon: Activity },
  { param: "Amonyak", unit: "mg/L", value: 0.12, min: 0, max: 0.5, status: "normal", icon: Activity },
  { param: "Nitrit", unit: "mg/L", value: 0.08, min: 0, max: 0.1, status: "warning", icon: Activity },
  { param: "Tuzluluk", unit: "‰", value: 0, min: 0, max: 5, status: "normal", icon: Droplets },
  { param: "Bulanıklık", unit: "NTU", value: 4.2, min: 0, max: 10, status: "normal", icon: Activity },
];

const criticalMeasurements = [
  { pool: "A-12", param: "Çözünmüş O₂", value: 5.2, unit: "mg/L", threshold: 6.0, time: "14 dk önce" },
  { pool: "B-07", param: "Nitrit", value: 0.14, unit: "mg/L", threshold: 0.1, time: "42 dk önce" },
];

const tempHistory = Array.from({ length: 12 }, (_, i) => ({
  saat: `${(6 + i * 2).toString().padStart(2, "0")}:00`,
  "A-01": +(17.8 + Math.sin(i * 0.5) * 0.8).toFixed(2),
  "A-02": +(18.1 + Math.cos(i * 0.4) * 0.6).toFixed(2),
  "B-01": +(17.4 + Math.sin(i * 0.6) * 0.9).toFixed(2),
}));

const statusConfig: Record<
  Measurement["status"],
  {
    icon: ComponentType<{ className?: string }>;
    textClass: string;
    bgClass: string;
    dotClass: string;
    label: string;
  }
> = {
  normal: { icon: CheckCircle2, textClass: "text-success", bgClass: "bg-success/15", dotClass: "bg-success", label: "Normal" },
  warning: { icon: AlertCircle, textClass: "text-warning", bgClass: "bg-warning/20", dotClass: "bg-warning", label: "Uyarı" },
  critical: { icon: AlertCircle, textClass: "text-destructive", bgClass: "bg-destructive/15", dotClass: "bg-destructive", label: "Kritik" },
};

const chartTooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
};
const axisTick = { fontSize: 11, fill: "var(--color-muted-foreground)" };

export default function WaterQualityPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Su Kalitesi</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">A Çiftliği · Son ölçüm: bugün 09:41</p>
        </div>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> Ölçüm Ekle
        </button>
      </div>

      {criticalMeasurements.length > 0 && (
        <div className="flex flex-col gap-2">
          {criticalMeasurements.map((m, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3"
            >
              <AlertCircle className="size-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-destructive">
                  {m.pool} — {m.param} kritik seviyede
                </span>
                <span className="ml-2 text-xs text-destructive/80">
                  {m.value} {m.unit} (eşik: {m.threshold} {m.unit})
                </span>
              </div>
              <span className="text-[11px] text-destructive/80">{m.time}</span>
              <button
                type="button"
                className="rounded-md bg-destructive px-3 py-1 text-xs font-semibold text-white hover:bg-destructive/90"
              >
                İşlem Al
              </button>
            </div>
          ))}
        </div>
      )}

      <PanelCard title="Son Ölçümler — A-01 Havuzu">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {measurements.map((m, i) => {
            const sc = statusConfig[m.status];
            const StatusIcon = sc.icon;
            const pct = ((m.value - m.min) / (m.max - m.min)) * 100;
            return (
              <div
                key={m.param}
                className="border-border px-4.5 py-4"
                style={{
                  borderRightWidth: i % 4 !== 3 ? 1 : 0,
                  borderBottomWidth: i < measurements.length - 4 ? 1 : 0,
                }}
              >
                <div className="mb-2.5 flex items-start justify-between">
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">{m.param}</div>
                    <div className="mt-0.5 font-mono text-[22px] font-bold text-foreground">
                      {m.value}
                      <span className="ml-0.5 text-sm font-normal text-muted-foreground">{m.unit}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${sc.bgClass} ${sc.textClass}`}
                  >
                    <StatusIcon className="size-2.5" /> {sc.label}
                  </span>
                </div>
                <div className="relative mb-1.5 h-1 rounded-full bg-border">
                  <div
                    className={`absolute top-1/2 size-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-card ${sc.dotClass}`}
                    style={{ left: `${Math.max(0, Math.min(pct, 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground/80">
                  <span>
                    {m.min}
                    {m.unit}
                  </span>
                  <span>
                    Normal: {m.min}–{m.max}
                  </span>
                  <span>
                    {m.max}
                    {m.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </PanelCard>

      <PanelCard title="Sıcaklık Değişimi (°C) — Bugün">
        <div className="p-3">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={tempHistory} margin={{ left: 12, right: 20, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="saat" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[15, 22]} tickFormatter={(v) => `${v}°`} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v, name) => [`${Number(v).toFixed(1)}°C`, name]} />
              <Line type="monotone" dataKey="A-01" stroke="var(--color-teal-500)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="A-02" stroke="var(--color-navy-900)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="B-01" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>
    </div>
  );
}
