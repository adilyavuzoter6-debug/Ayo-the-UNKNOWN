"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFarmStockSummary } from "@/hooks/use-farm-stock-summary";
import { useFarmMortalityLog } from "@/hooks/use-farm-mortality-log";
import { projectPopulation } from "@/lib/population-projection";

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-1 truncate text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`truncate font-mono text-lg font-semibold ${accent ? "text-teal-500" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

export function FarmForecastTab({ farmId }: { farmId: string }) {
  const { data: summary, isLoading: summaryLoading } = useFarmStockSummary(farmId);
  const { entries, isLoading: mortalityLoading } = useFarmMortalityLog(farmId);

  if (summaryLoading || mortalityLoading || !summary) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (summary.fishCount === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tahmin için önce bu çiftlikte canlı stok olması gerekiyor.
        </CardContent>
      </Card>
    );
  }

  const projection = projectPopulation(summary.fishCount, entries);
  const in12Weeks = projection.points.at(-1)!;
  const chartData = projection.points.map((p) => ({
    label: p.weeksAhead === 0 ? "Bugün" : `${p.weeksAhead}. hafta`,
    count: p.projectedCount,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Şu anki canlı balık" value={summary.fishCount.toLocaleString("tr")} />
        <Stat
          label="Trend mortalite oranı"
          value={`%${projection.dailyMortalityRatePct.toFixed(3)}/gün`}
        />
        <Stat
          label="12 hafta sonra tahmini"
          value={in12Weeks.projectedCount.toLocaleString("tr")}
          accent
        />
      </div>

      <PanelCard title="Balık Sayısı Tahmini (12 hafta)">
        <div className="p-3">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ left: 12, right: 20, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(value) => [Number(value).toLocaleString("tr"), "Tahmini balık"]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--color-teal-500)"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-start gap-2 border-t border-border px-4.5 py-3 text-[11px] text-muted-foreground">
          <TrendingDown className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Son 30 günün mortalite oranına dayalı kaba bir tahmindir — planlı hasat, transfer veya
            yeni stoklama gibi olayları hesaba katmaz, sadece &quot;mevcut ölüm hızı sürerse&quot;
            sorusuna cevap verir.
          </p>
        </div>
      </PanelCard>
    </div>
  );
}
