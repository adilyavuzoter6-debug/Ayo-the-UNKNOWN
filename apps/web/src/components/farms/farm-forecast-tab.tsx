"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFarms } from "@/hooks/use-farms";
import { useFarmStockSummary } from "@/hooks/use-farm-stock-summary";
import { useFarmMortalityLog } from "@/hooks/use-farm-mortality-log";
import { useWeightForecast } from "@/hooks/use-weight-forecast";
import { projectPopulation } from "@/lib/population-projection";

const NONE_FARM = "__none__";

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("tr", { maximumFractionDigits: digits });
}

/** "monthsAhead" counts months from today, not calendar months (1 ≠ January) — the label spells
 *  that out with "sonra" (from now) plus the approximate target date, so it can't be misread as
 *  a specific calendar month. Matches the backend's monthsAhead*30-days-ahead projection. */
function monthAheadLabel(monthsAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + monthsAhead * 30);
  const dateLabel = date.toLocaleDateString("tr", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${monthsAhead} ay sonra (~${dateLabel})`;
}

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
  const { data: farms } = useFarms();
  const [secondaryFarmId, setSecondaryFarmId] = React.useState("");
  const otherFarms = (farms ?? []).filter((f) => f.id !== farmId);

  const { data: summary, isLoading: summaryLoading } = useFarmStockSummary(farmId);
  const { entries, isLoading: mortalityLoading } = useFarmMortalityLog(farmId);
  const { data: secondarySummary, isLoading: secondarySummaryLoading } = useFarmStockSummary(secondaryFarmId);
  const { entries: secondaryEntries, isLoading: secondaryMortalityLoading } = useFarmMortalityLog(secondaryFarmId);

  const [bucketWidthText, setBucketWidthText] = React.useState("50");
  const bucketWidthG = Number(bucketWidthText) || 0;
  const [selectedMonth, setSelectedMonth] = React.useState("1");
  const [avgFcrText, setAvgFcrText] = React.useState("");
  const avgFcr = avgFcrText.trim() === "" ? null : Number(avgFcrText) || null;
  const { data: weightForecast, isLoading: weightForecastLoading } = useWeightForecast(
    farmId,
    bucketWidthG,
    avgFcr,
    secondaryFarmId ? [secondaryFarmId] : [],
  );

  const combining = !!secondaryFarmId;
  const pending =
    summaryLoading || mortalityLoading || (combining && (secondarySummaryLoading || secondaryMortalityLoading));

  if (pending || !summary) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // Transfers between the combined farms (e.g. juveniles moving to a grow-out farm as they size
  // up) don't change the combined total — they just relocate it — so summing is exactly right,
  // not an approximation.
  const combinedFishCount = summary.fishCount + (combining ? (secondarySummary?.fishCount ?? 0) : 0);
  const combinedEntries = combining ? [...entries, ...secondaryEntries] : entries;

  if (combinedFishCount === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tahmin için önce bu çiftlikte canlı stok olması gerekiyor.
        </CardContent>
      </Card>
    );
  }

  const projection = projectPopulation(combinedFishCount, combinedEntries);
  const in12Weeks = projection.points.at(-1)!;
  const chartData = projection.points.map((p) => ({
    label: p.weeksAhead === 0 ? "Bugün" : `${p.weeksAhead}. hafta`,
    count: p.projectedCount,
  }));
  const secondaryFarmName = farms?.find((f) => f.id === secondaryFarmId)?.name;
  const primaryFarmName = farms?.find((f) => f.id === farmId)?.name;
  const titleSuffix = combining && primaryFarmName && secondaryFarmName
    ? ` — ${primaryFarmName} + ${secondaryFarmName}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-muted-foreground">Başka çiftlikle birleştir</Label>
        <Select
          value={secondaryFarmId || NONE_FARM}
          onValueChange={(v) => setSecondaryFarmId(v === NONE_FARM ? "" : (v ?? ""))}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Birleştirme yok">
              {(v: string) => (v === NONE_FARM ? "Birleştirme yok" : farms?.find((f) => f.id === v)?.name)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_FARM}>Birleştirme yok</SelectItem>
            {otherFarms.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {combining ? (
          <p className="text-[11px] text-muted-foreground">
            Bu çiftliğin tahmini, {secondaryFarmName} ile birleştirilmiş toplam üzerinden
            hesaplanıyor — aradaki transferler toplamı değiştirmediği için sorun oluşturmaz.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Şu anki canlı balık" value={combinedFishCount.toLocaleString("tr")} />
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

      <PanelCard title={`Balık Sayısı Tahmini (12 hafta)${titleSuffix}`}>
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

      <PanelCard title={`Gramaj Dağılımı Tahmini (ay ay)${titleSuffix}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4.5 py-2.5">
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Kaç ay sonra</Label>
            <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v ?? "1")}>
              <SelectTrigger className="w-56">
                <SelectValue>{(v: string) => monthAheadLabel(Number(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {monthAheadLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Aralık genişliği (g)</Label>
            <Input
              type="number"
              min={1}
              step={1}
              className="h-8 w-24"
              value={bucketWidthText}
              onChange={(e) => setBucketWidthText(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Ortalama FCR (opsiyonel)</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              placeholder="örn. 1.3"
              className="h-8 w-24"
              value={avgFcrText}
              onChange={(e) => setAvgFcrText(e.target.value)}
            />
          </div>
        </div>

        {weightForecastLoading || !weightForecast ? (
          <div className="p-4">
            <Skeleton className="h-48 rounded" />
          </div>
        ) : (
          (() => {
            const month = weightForecast.months.find((m) => m.monthsAhead === Number(selectedMonth));
            if (!month || month.buckets.length === 0) {
              return (
                <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
                  Bu ay için tahmin edilecek canlı stok yok.
                </p>
              );
            }
            return (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4.5 py-4 text-xs sm:grid-cols-3">
                  <div>
                    <div className="mb-0.5 text-muted-foreground">Tahmini toplam adet</div>
                    <div className="font-mono font-medium text-foreground">
                      {month.totalCount.toLocaleString("tr")}
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 text-muted-foreground">Tahmini toplam biyokütle</div>
                    <div className="font-mono font-medium text-foreground">{fmt(month.totalBiomassKg)} kg</div>
                  </div>
                  <div>
                    <div className="mb-0.5 text-muted-foreground">Kendi FCR&apos;ı ölçülen parti</div>
                    <div className="font-mono font-medium text-foreground">
                      {weightForecast.batchesWithOwnFcr}/{weightForecast.totalActiveBatches}
                    </div>
                  </div>
                  {avgFcr ? (
                    <div>
                      <div className="mb-0.5 text-muted-foreground">Ortalama FCR ile tahmin edilen</div>
                      <div className="font-mono font-medium text-foreground">
                        {weightForecast.batchesWithAssumedFcr}/{weightForecast.totalActiveBatches}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div className="mb-0.5 text-muted-foreground">Sabit kalan (veri yok)</div>
                    <div className="font-mono font-medium text-foreground">
                      {weightForecast.batchesFlat}/{weightForecast.totalActiveBatches}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gramaj aralığı</TableHead>
                        <TableHead>Parti sayısı</TableHead>
                        <TableHead>Tahmini adet</TableHead>
                        <TableHead>Tahmini biyokütle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {month.buckets.map((bucket) => (
                        <TableRow key={bucket.startG}>
                          <TableCell className="font-mono">
                            {fmt(bucket.startG, 0)}–{fmt(bucket.endG, 0)} g
                          </TableCell>
                          <TableCell className="font-mono">{bucket.batchCount}</TableCell>
                          <TableCell className="font-mono">{bucket.fishCount.toLocaleString("tr")}</TableCell>
                          <TableCell className="font-mono">{fmt(bucket.biomassKg)} kg</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()
        )}

        <div className="flex items-start gap-2 border-t border-border px-4.5 py-3 text-[11px] text-muted-foreground">
          <TrendingDown className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Önce her partinin, stoklamadan bu yana yediği toplam yem ile kazandığı biyokütleden
            hesaplanan kendi gerçekleşen FCR&apos;ı kullanılır. Bunu ölçecek kadar veri (yem +
            ikinci bir tartım) olmayan ama yemleme geçmişi olan partilerde, girilmişse{" "}
            <strong>ortalama FCR</strong> o partinin kendi yem hızıyla birlikte kullanılır. Hiç
            yemleme kaydı olmayan partiler sabit ağırlıkta kalır. Ölüm oranı, yukarıdaki trend
            mortalite oranıyla aynı şekilde uygulanır. Planlı hasat, transfer veya yeni stoklamayı
            hesaba katmaz.
          </p>
        </div>
      </PanelCard>
    </div>
  );
}
