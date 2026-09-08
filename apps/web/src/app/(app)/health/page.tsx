"use client";

import * as React from "react";
import Link from "next/link";
import { HeartPulse, Skull, Syringe } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { RecordTreatmentDialog } from "@/components/health/record-treatment-dialog";
import { useFarms } from "@/hooks/use-farms";
import { useFarmTanks } from "@/hooks/use-tanks";
import { useTankFishBatches } from "@/hooks/use-fish-batches";
import { useTankTreatments } from "@/hooks/use-treatments";
import { useFarmMortalityLog, type MortalityLogEntry } from "@/hooks/use-farm-mortality-log";
import { MORTALITY_REASON_LABEL as REASON_LABEL } from "@/lib/tanks";
import type { MortalityReason } from "@/lib/types";

const TREND_WEEKS = 12;
const TREND_SERIES_COLORS = [
  "var(--color-destructive)",
  "var(--color-warning)",
  "#8b5cf6",
  "var(--color-muted-foreground)",
];

/** Buckets entries into ISO-week-aligned columns, keeping only the top 3 reasons as their own
 * series (everything else folds into "Diğer") so the chart stays readable with a short legend. */
function buildMortalityTrend(entries: MortalityLogEntry[]) {
  const weekStart = (d: Date) => {
    const copy = new Date(d);
    const day = copy.getDay();
    const diff = (day + 6) % 7; // Monday-start week
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const cutoff = weekStart(new Date());
  cutoff.setDate(cutoff.getDate() - (TREND_WEEKS - 1) * 7);
  const relevant = entries.filter((e) => new Date(e.occurredAt) >= cutoff);

  const totalsByReason = relevant.reduce<Record<string, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + e.fishCount;
    return acc;
  }, {});
  const topReasons = Object.entries(totalsByReason)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason]) => reason as MortalityReason);
  const seriesKeys = [...topReasons, "OTHER"] as const;

  const weeks: { start: Date; label: string }[] = [];
  for (let i = 0; i < TREND_WEEKS; i++) {
    const start = new Date(cutoff);
    start.setDate(start.getDate() + i * 7);
    weeks.push({ start, label: start.toLocaleDateString("tr", { day: "2-digit", month: "2-digit" }) });
  }

  const data = weeks.map(({ start, label }) => {
    const weekEnd = new Date(start);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const row: Record<string, number | string> = { week: label };
    for (const key of seriesKeys) row[key] = 0;

    for (const e of relevant) {
      const occurredAt = new Date(e.occurredAt);
      if (occurredAt >= start && occurredAt < weekEnd) {
        const key = topReasons.includes(e.reason) ? e.reason : "OTHER";
        row[key] = (row[key] as number) + e.fishCount;
      }
    }
    return row;
  });

  return { data, seriesKeys };
}

function withdrawalEndsAt(startedAt: string, endedAt: string | null, withdrawalPeriodDays: number | null) {
  if (withdrawalPeriodDays === null) return null;
  const from = new Date(endedAt ?? startedAt);
  from.setDate(from.getDate() + withdrawalPeriodDays);
  return from;
}

export default function HealthPage() {
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

  const { data: allocations } = useTankFishBatches(tankId);
  const { data: treatments, isLoading: treatmentsLoading } = useTankTreatments(tankId);

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

  const mortalityTrend = buildMortalityTrend(entries);

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

      <PanelCard
        title="Tedavi & Aşı Kayıtları"
        action={tanks?.find((t) => t.id === tankId)?.code}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4.5 py-2.5">
          <Select value={tankId} onValueChange={(v) => setSelectedTankId(v ?? "")}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Havuz seçin">
                {(v: string) => tanks?.find((t) => t.id === v)?.code}
              </SelectValue>
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
            <RecordTreatmentDialog tankId={tankId} allocations={allocations} />
          ) : null}
        </div>

        {!tankId ? (
          <p className="flex items-center gap-2 px-4.5 py-10 text-sm text-muted-foreground">
            <Syringe className="size-4" /> Kayıtları görmek için bir havuz seçin.
          </p>
        ) : treatmentsLoading ? (
          <div className="p-4">
            <Skeleton className="h-24 rounded" />
          </div>
        ) : treatments && treatments.length > 0 ? (
          <ul className="divide-y divide-border">
            {treatments.map((t) => {
              const endsAt = withdrawalEndsAt(t.startedAt, t.endedAt, t.withdrawalPeriodDays);
              const active = endsAt !== null && endsAt > new Date();
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Syringe className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-foreground">{t.productName}</span>
                    <span className="text-muted-foreground">
                      · {t.type === "VACCINATION" ? "Aşı" : "İlaç"}
                    </span>
                    {t.dosage ? <span className="text-muted-foreground/80">— {t.dosage}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {endsAt ? (
                      <StatusBadge
                        status={active ? "critical" : "active"}
                        label={
                          active
                            ? `Arınma: ${endsAt.toLocaleDateString("tr")}'e kadar`
                            : "Arınma süresi doldu"
                        }
                      />
                    ) : null}
                    <span className="font-mono text-muted-foreground">
                      {new Date(t.startedAt).toLocaleDateString("tr")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Bu havuzda henüz tedavi/aşı kaydı yok.
          </p>
        )}
      </PanelCard>

      {farmId && !isLoading && entries.length > 0 ? (
        <PanelCard title={`Ölüm Trendi (son ${TREND_WEEKS} hafta)`}>
          <div className="p-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mortalityTrend.data} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(value, key) => [
                    Number(value).toLocaleString("tr"),
                    key === "OTHER" ? "Diğer" : REASON_LABEL[key as MortalityReason],
                  ]}
                />
                <Legend
                  formatter={(key: string) => (key === "OTHER" ? "Diğer" : REASON_LABEL[key as MortalityReason])}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {mortalityTrend.seriesKeys.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="mortality"
                    fill={TREND_SERIES_COLORS[i % TREND_SERIES_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      ) : null}

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
