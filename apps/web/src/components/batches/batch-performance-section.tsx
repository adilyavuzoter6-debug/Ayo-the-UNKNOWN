"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useBatchFcr, useBatchSgr } from "@/hooks/use-batch-performance";
import { ApiError } from "@/lib/api-error";

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function BatchPerformanceSection({ batchId }: { batchId: string }) {
  const [periodStart, setPeriodStart] = React.useState(isoDaysAgo(30));
  const [periodEnd, setPeriodEnd] = React.useState(isoDaysAgo(0));

  const { data: sgrSeries, isLoading: sgrLoading } = useBatchSgr(batchId);
  const {
    data: fcr,
    isLoading: fcrLoading,
    error: fcrError,
  } = useBatchFcr(batchId, periodStart, periodEnd);

  const chartData = (sgrSeries ?? []).map((point) => ({
    date: new Date(point.finalOccurredAt).toLocaleDateString("tr"),
    sgr: Number(point.sgrPctPerDay.toFixed(3)),
  }));

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Büyüme performansı
      </h2>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="size-3.5" /> SGR (%/gün) — ölçüm çiftleri arasında
          </div>
          {sgrLoading ? (
            <Skeleton className="h-48 rounded" />
          ) : chartData.length > 0 ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(3)} %/gün`, "SGR"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sgr"
                    stroke="#00b4d8"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              SGR hesaplamak için en az iki ağırlık örneklemesi gerekiyor.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="text-xs font-medium text-muted-foreground">FCR (Yem Dönüşüm Oranı)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">Başlangıç</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">Bitiş</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {fcrLoading ? (
            <Skeleton className="h-24 rounded" />
          ) : fcrError ? (
            <p className="text-xs text-muted-foreground">
              {fcrError instanceof ApiError
                ? fcrError.message
                : "FCR hesaplanamadı — dönem başlangıcından önce bir biyokütle anlık görüntüsü gerekiyor."}
            </p>
          ) : fcr ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <Stat label="Başlangıç biyokütle" value={`${fcr.startBiomassKg.toFixed(1)} kg`} />
              <Stat label="Bitiş biyokütle" value={`${fcr.endBiomassKg.toFixed(1)} kg`} />
              <Stat label="Tüketilen yem" value={`${fcr.feedConsumedKg.toFixed(1)} kg`} />
              <Stat label="Mortalite biyokütlesi" value={`${fcr.mortalityBiomassKg.toFixed(1)} kg`} />
              <Stat label="Hasat biyokütlesi" value={`${fcr.harvestBiomassKg.toFixed(1)} kg`} />
              <Stat label="Biyokütle kazancı" value={`${fcr.biomassGainKg.toFixed(1)} kg`} />
              <div className="col-span-2 rounded-lg border border-border bg-muted/40 px-3 py-2 sm:col-span-3">
                <div className="mb-0.5 text-[11px] text-muted-foreground">FCR</div>
                <div className="font-mono text-lg font-semibold text-teal-500">
                  {fcr.fcr !== null ? fcr.fcr.toFixed(3) : "—"}
                </div>
                {fcr.fcr === null ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Bu dönemde biyokütle kazancı sıfır veya negatif, FCR tanımsız.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-muted-foreground">{label}</div>
      <div className="font-mono font-medium text-foreground">{value}</div>
    </div>
  );
}
