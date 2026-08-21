"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Droplets } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordWaterQualityDialog } from "@/components/water-quality/record-water-quality-dialog";
import { useFarmTanks } from "@/hooks/use-tanks";
import { useTankWaterQualityReadings } from "@/hooks/use-water-quality";

const chartTooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
};
const axisTick = { fontSize: 11, fill: "var(--color-muted-foreground)" };

function Metric({ label, value, unit }: { label: string; value: string | null; unit: string }) {
  return (
    <div className="border-r border-b border-border px-4.5 py-4 last:border-r-0">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[22px] font-bold text-foreground">
        {value !== null ? Number(value).toString() : "—"}
        {value !== null ? <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

/** Tank picker + readings/chart, scoped to one farm — used standalone on /water-quality (with
 * its own farm picker wrapped around it) and embedded in a farm's own "Su Kalitesi" tab. */
export function WaterQualityPanel({ farmId }: { farmId: string }) {
  const { data: tanks } = useFarmTanks(farmId);
  const [selectedTankId, setSelectedTankId] = React.useState<string>("");
  const tankId =
    selectedTankId && tanks?.some((t) => t.id === selectedTankId)
      ? selectedTankId
      : (tanks?.[0]?.id ?? "");

  const { data: readings, isLoading } = useTankWaterQualityReadings(tankId);
  const latest = readings?.[0];

  const selectedTank = tanks?.find((t) => t.id === tankId);

  const chartData = [...(readings ?? [])]
    .filter((r) => r.temperatureC !== null)
    .reverse()
    .map((r) => ({
      tarih: new Date(r.occurredAt).toLocaleDateString("tr"),
      sıcaklık: Number(r.temperatureC),
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {selectedTank
            ? `${selectedTank.code} · ${latest ? `Son ölçüm: ${new Date(latest.occurredAt).toLocaleString("tr")}` : "Henüz ölçüm yok"}`
            : "Bir havuz seçin"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
          {tankId ? (
            <RecordWaterQualityDialog tankId={tankId} tankCode={selectedTank?.code ?? ""} />
          ) : null}
        </div>
      </div>

      {!tankId ? (
        <PanelCard title="Son Ölçümler">
          <p className="flex items-center gap-2 px-4.5 py-10 text-sm text-muted-foreground">
            <Droplets className="size-4" /> Ölçümleri görmek için bir havuz seçin.
          </p>
        </PanelCard>
      ) : isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : latest ? (
        <PanelCard title={`Son Ölçüm — ${selectedTank?.code}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Sıcaklık" value={latest.temperatureC} unit="°C" />
            <Metric label="Çözünmüş O₂" value={latest.dissolvedOxygenMgL} unit="mg/L" />
            <Metric label="pH" value={latest.ph} unit="" />
            <Metric label="Tuzluluk" value={latest.salinityPpt} unit="‰" />
            <Metric label="Amonyak" value={latest.ammoniaMgL} unit="mg/L" />
            <Metric label="Nitrit" value={latest.nitriteMgL} unit="mg/L" />
            <Metric label="Nitrat" value={latest.nitrateMgL} unit="mg/L" />
            <Metric label="Akış" value={latest.flowRateM3H} unit="m³/sa" />
          </div>
        </PanelCard>
      ) : (
        <PanelCard title="Son Ölçümler">
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Bu havuz için henüz kayıtlı ölçüm yok.
          </p>
        </PanelCard>
      )}

      {chartData.length > 1 ? (
        <PanelCard title="Sıcaklık Değişimi (°C)">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ left: 12, right: 20, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="tarih" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}°`} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(v) => [`${Number(v).toFixed(1)}°C`, "Sıcaklık"]}
                />
                <Line type="monotone" dataKey="sıcaklık" stroke="var(--color-teal-500)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      ) : null}

      {readings && readings.length > 0 ? (
        <PanelCard title="Ölçüm geçmişi">
          <ul className="divide-y divide-border">
            {readings.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-xs">
                <span className="font-mono text-muted-foreground">
                  {new Date(r.occurredAt).toLocaleString("tr")}
                </span>
                <span className="flex flex-wrap gap-x-3 text-foreground">
                  {r.temperatureC !== null ? <span>{Number(r.temperatureC)}°C</span> : null}
                  {r.dissolvedOxygenMgL !== null ? <span>O₂ {Number(r.dissolvedOxygenMgL)} mg/L</span> : null}
                  {r.ph !== null ? <span>pH {Number(r.ph)}</span> : null}
                  {r.ammoniaMgL !== null ? <span>NH₃ {Number(r.ammoniaMgL)} mg/L</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}
    </div>
  );
}
