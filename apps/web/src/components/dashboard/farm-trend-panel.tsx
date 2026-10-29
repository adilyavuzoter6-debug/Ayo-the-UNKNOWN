"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFarmDailyTrend } from "@/hooks/use-dashboard-kpis";

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
};
const axisTick = { fontSize: 11, fill: "var(--color-muted-foreground)" };
/** Axis bounds with room around the data, so a few tenths of a degree don't fill the chart's height. */
const padded = (by: number): [(min: number) => number, (max: number) => number] => [
  (min) => Math.floor(min - by),
  (max) => Math.ceil(max + by),
];
const fmt = (n: number, digits = 0) => n.toLocaleString("tr", { maximumFractionDigits: digits });
/** "2026-10-29" → "29 Eki" */
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("tr", { day: "numeric", month: "short" });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

/** The selected farm's last 30 days: feed and deaths per day, and the water it was in. */
export function FarmTrendPanel({ farmId }: { farmId: string }) {
  const { data, isLoading } = useFarmDailyTrend(farmId, 30);

  if (isLoading || !data) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  const totalFeed = data.reduce((sum, d) => sum + d.feedKg, 0);
  const totalDeaths = data.reduce((sum, d) => sum + d.deaths, 0);
  const totalHarvest = data.reduce((sum, d) => sum + d.harvestKg, 0);
  const temps = data.map((d) => d.avgTemperatureC).filter((v): v is number => v !== null);
  const chart = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  const hasWater = data.some((d) => d.avgTemperatureC !== null || d.avgOxygenMgL !== null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <PanelCard title="Son 30 gün: yem ve ölüm" className="lg:col-span-3">
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border px-4.5 py-3">
          <Stat label="Verilen yem" value={`${fmt(totalFeed / 1000, 1)} t`} />
          <Stat label="Ölüm" value={`${fmt(totalDeaths)} balık`} />
          <Stat label="Hasat" value={totalHarvest > 0 ? `${fmt(totalHarvest / 1000, 1)} t` : "—"} />
        </div>
        <div className="p-3">
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={chart} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="feed" tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${fmt(v)}`} />
              <YAxis yAxisId="deaths" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) =>
                  name === "feedKg" ? [`${fmt(Number(value), 1)} kg`, "Yem"] : [`${fmt(Number(value))} balık`, "Ölüm"]
                }
              />
              <Bar yAxisId="feed" dataKey="feedKg" fill="var(--color-teal-500)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Line yAxisId="deaths" type="monotoneX" dataKey="deaths" stroke="var(--color-warning)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-1 flex justify-center gap-5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-teal-500" /> Yem (kg)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-warning" /> Ölüm (adet)
            </span>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Su: sıcaklık ve oksijen" className="lg:col-span-2">
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border px-4.5 py-3">
          <Stat
            label="Ort. sıcaklık"
            value={temps.length > 0 ? `${fmt(temps.reduce((a, b) => a + b, 0) / temps.length, 1)} °C` : "—"}
          />
          <Stat
            label="Son oksijen"
            value={(() => {
              const last = [...data].reverse().find((d) => d.avgOxygenMgL !== null);
              return last ? `${fmt(last.avgOxygenMgL!, 1)} mg/L` : "—";
            })()}
          />
        </div>
        {hasWater ? (
          <div className="p-3">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chart} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis yAxisId="temp" tick={axisTick} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${v}°`} domain={padded(2)} allowDecimals={false} />
                <YAxis yAxisId="oxygen" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={32} domain={padded(2)} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) =>
                    name === "avgTemperatureC"
                      ? [`${fmt(Number(value), 1)} °C`, "Sıcaklık"]
                      : [`${fmt(Number(value), 1)} mg/L`, "Oksijen"]
                  }
                />
                <Line yAxisId="temp" type="monotoneX" dataKey="avgTemperatureC" stroke="var(--color-navy-700)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line yAxisId="oxygen" type="monotoneX" dataKey="avgOxygenMgL" stroke="var(--color-teal-500)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-1 flex justify-center gap-5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-navy-700" /> Sıcaklık (°C)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-teal-500" /> Oksijen (mg/L)
              </span>
            </div>
          </div>
        ) : (
          <p className="px-4.5 py-16 text-center text-sm text-muted-foreground">Son 30 günde su ölçümü yok.</p>
        )}
      </PanelCard>
    </div>
  );
}
