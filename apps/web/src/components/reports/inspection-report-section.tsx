"use client";

import * as React from "react";
import { ClipboardList, Printer } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { useInspectionReport } from "@/hooks/use-inspection-report";
import type { MortalityReason, TreatmentType } from "@/lib/types";

const REASON_LABEL: Record<MortalityReason, string> = {
  UNKNOWN: "Bilinmiyor",
  DISEASE: "Hastalık",
  OXYGEN: "Oksijen yetersizliği",
  TEMPERATURE: "Sıcaklık",
  TRANSFER_STRESS: "Transfer stresi",
  PHYSICAL_DAMAGE: "Fiziksel hasar",
  PREDATOR: "Yırtıcı",
  FEED_RELATED: "Yemle ilişkili",
  OTHER: "Diğer",
};

const TREATMENT_TYPE_LABEL: Record<TreatmentType, string> = {
  MEDICATION: "İlaç tedavisi",
  VACCINATION: "Aşı",
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("tr", { maximumFractionDigits: digits });
}

export function InspectionReportSection() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");

  const [periodStart, setPeriodStart] = React.useState(isoDaysAgo(180));
  const [periodEnd, setPeriodEnd] = React.useState(isoDaysAgo(0));

  const { data: report, isLoading } = useInspectionReport(farmId, periodStart, periodEnd);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Çiftlik</Label>
            <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Çiftlik seçin" />
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
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Başlangıç</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Bitiş</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={!report} onClick={() => window.print()}>
          <Printer className="size-4" /> Yazdır / PDF
        </Button>
      </div>

      {!farmId ? (
        <PanelCard title="Denetim Raporu">
          <p className="flex items-center gap-2 px-4.5 py-10 text-sm text-muted-foreground">
            <ClipboardList className="size-4" /> Bir çiftlik seçin.
          </p>
        </PanelCard>
      ) : isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : report ? (
        <div className="space-y-4">
          <PanelCard
            title={`Denetim Raporu — ${report.farm.name} (${report.farm.code})`}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4.5 py-4 text-xs sm:grid-cols-4">
              <div>
                <div className="mb-0.5 text-muted-foreground">Dönem</div>
                <div className="font-mono font-medium text-foreground">
                  {new Date(report.periodStart).toLocaleDateString("tr")} –{" "}
                  {new Date(report.periodEnd).toLocaleDateString("tr")}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-muted-foreground">Tank sayısı</div>
                <div className="font-mono font-medium text-foreground">{report.tankCount}</div>
              </div>
              <div>
                <div className="mb-0.5 text-muted-foreground">Toplam ölüm</div>
                <div className="font-mono font-medium text-foreground">{report.mortality.total}</div>
              </div>
              <div>
                <div className="mb-0.5 text-muted-foreground">Toplam yem</div>
                <div className="font-mono font-medium text-foreground">
                  {fmt(report.totalFeedKg)} kg
                </div>
              </div>
            </div>
          </PanelCard>

          <PanelCard title="Aktif Partiler">
            {report.activeBatches.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tank</TableHead>
                      <TableHead>Parti</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Adet</TableHead>
                      <TableHead>Ort. ağırlık</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.activeBatches.map((b) => (
                      <TableRow key={`${b.tankCode}-${b.lotCode}`}>
                        <TableCell className="font-mono">{b.tankCode}</TableCell>
                        <TableCell className="font-mono">{b.lotCode}</TableCell>
                        <TableCell>{b.speciesName}</TableCell>
                        <TableCell className="font-mono">{b.estimatedCount.toLocaleString("tr")}</TableCell>
                        <TableCell className="font-mono">{fmt(b.avgWeightG)} g</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="px-4.5 py-6 text-center text-sm text-muted-foreground">
                Bu dönemde aktif parti yok.
              </p>
            )}
          </PanelCard>

          <PanelCard title="Ölüm Dağılımı">
            {Object.keys(report.mortality.byReason).length > 0 ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4.5 py-4 text-xs sm:grid-cols-4">
                {Object.entries(report.mortality.byReason).map(([reason, count]) => (
                  <div key={reason}>
                    <div className="mb-0.5 text-muted-foreground">
                      {REASON_LABEL[reason as MortalityReason] ?? reason}
                    </div>
                    <div className="font-mono font-medium text-foreground">{count}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4.5 py-6 text-center text-sm text-muted-foreground">
                Bu dönemde ölüm kaydı yok.
              </p>
            )}
          </PanelCard>

          <PanelCard title="Veteriner Tedavileri">
            {report.treatments.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Başlangıç</TableHead>
                      <TableHead>Bitiş</TableHead>
                      <TableHead>Arınma süresi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.treatments.map((t, i) => (
                      <TableRow key={`${t.productName}-${t.startedAt}-${i}`}>
                        <TableCell>{t.productName}</TableCell>
                        <TableCell>{TREATMENT_TYPE_LABEL[t.type]}</TableCell>
                        <TableCell className="font-mono">
                          {new Date(t.startedAt).toLocaleDateString("tr")}
                        </TableCell>
                        <TableCell className="font-mono">
                          {t.endedAt ? new Date(t.endedAt).toLocaleDateString("tr") : "—"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {t.withdrawalPeriodDays !== null ? `${t.withdrawalPeriodDays} gün` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="px-4.5 py-6 text-center text-sm text-muted-foreground">
                Bu dönemde tedavi kaydı yok.
              </p>
            )}
          </PanelCard>

          <PanelCard title="Su Kalitesi Özeti">
            {report.waterQuality.readingCount > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parametre</TableHead>
                      <TableHead>Min</TableHead>
                      <TableHead>Maks</TableHead>
                      <TableHead>Ortalama</TableHead>
                      <TableHead>Ölçüm sayısı</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { label: "Sıcaklık (°C)", stats: report.waterQuality.temperatureC },
                      { label: "Çözünmüş oksijen (mg/L)", stats: report.waterQuality.dissolvedOxygenMgL },
                      { label: "pH", stats: report.waterQuality.ph },
                    ].map(({ label, stats }) => (
                      <TableRow key={label}>
                        <TableCell>{label}</TableCell>
                        <TableCell className="font-mono">{stats ? fmt(stats.min, 2) : "—"}</TableCell>
                        <TableCell className="font-mono">{stats ? fmt(stats.max, 2) : "—"}</TableCell>
                        <TableCell className="font-mono">{stats ? fmt(stats.avg, 2) : "—"}</TableCell>
                        <TableCell className="font-mono">{stats ? stats.count : 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="px-4.5 py-6 text-center text-sm text-muted-foreground">
                Bu dönemde su kalitesi ölçümü yok.
              </p>
            )}
          </PanelCard>

          <PanelCard title="Hasat Kayıtları">
            {report.harvestRecords.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Adet</TableHead>
                      <TableHead>Biyokütle</TableHead>
                      <TableHead>Hedef</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.harvestRecords.map((h, i) => (
                      <TableRow key={`${h.harvestedAt}-${i}`}>
                        <TableCell className="font-mono">
                          {h.harvestedAt ? new Date(h.harvestedAt).toLocaleDateString("tr") : "—"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {h.fishCount !== null ? h.fishCount.toLocaleString("tr") : "—"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {h.biomassKg !== null ? `${fmt(h.biomassKg)} kg` : "—"}
                        </TableCell>
                        <TableCell>{h.destination ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="px-4.5 py-6 text-center text-sm text-muted-foreground">
                Bu dönemde hasat kaydı yok.
              </p>
            )}
          </PanelCard>
        </div>
      ) : null}
    </div>
  );
}
