"use client";

import * as React from "react";
import { ClipboardList, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
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
import {
  downloadExcel,
  EXCEL_DATE,
  EXCEL_DECIMAL,
  EXCEL_INT,
  excelDate,
  type ExcelSheet,
} from "@/lib/excel";
import type { InspectionReport, MinMaxAvg, MortalityReason, TreatmentType } from "@/lib/types";
import { PlanFeature } from "@aquai/types";
import { PlanLocked } from "@/components/shared/plan-locked";
import { usePlan } from "@/hooks/use-plan";

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

interface WeightBucket {
  startG: number;
  endG: number;
  batchCount: number;
  fishCount: number;
  biomassKg: number;
}

/** Groups active batches into fixed-width gram ranges (e.g. 150–200 g), summing live count and
 *  biomass per range — a batch's whole count lands in the bucket its average weight falls into,
 *  same granularity the rest of this report already works at (no individual-fish weights here). */
function buildWeightDistribution(
  batches: { estimatedCount: number; avgWeightG: number }[],
  bucketWidthG: number,
): WeightBucket[] {
  if (!Number.isFinite(bucketWidthG) || bucketWidthG <= 0) return [];
  const buckets = new Map<number, WeightBucket>();
  for (const b of batches) {
    const startG = Math.floor(b.avgWeightG / bucketWidthG) * bucketWidthG;
    const bucket = buckets.get(startG) ?? { startG, endG: startG + bucketWidthG, batchCount: 0, fishCount: 0, biomassKg: 0 };
    bucket.batchCount += 1;
    bucket.fishCount += b.estimatedCount;
    bucket.biomassKg += (b.estimatedCount * b.avgWeightG) / 1000;
    buckets.set(startG, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.startG - b.startG);
}

/** The report as a workbook: a summary tab plus one tab per table on the page. */
function inspectionSheets(report: InspectionReport): ExcelSheet<unknown>[] {
  const period = `${new Date(report.periodStart).toLocaleDateString("tr")} – ${new Date(report.periodEnd).toLocaleDateString("tr")}`;
  const water: [string, MinMaxAvg | null][] = [
    ["Sıcaklık (°C)", report.waterQuality.temperatureC],
    ["Çözünmüş O₂ (mg/L)", report.waterQuality.dissolvedOxygenMgL],
    ["pH", report.waterQuality.ph],
  ];
  return [
    {
      name: "Özet",
      rows: [
        ["Çiftlik", `${report.farm.name} (${report.farm.code})`],
        ["Dönem", period],
        ["Tank sayısı", report.tankCount],
        ["Toplam ölüm (adet)", report.mortality.total],
        ["Toplam yem (kg)", report.totalFeedKg],
        ["Su kalitesi ölçümü", report.waterQuality.readingCount],
      ] as [string, string | number][],
      columns: [
        { header: "Bilgi", value: (r) => r[0], width: 22 },
        { header: "Değer", value: (r) => r[1], width: 30 },
      ],
    } satisfies ExcelSheet<[string, string | number]>,
    {
      name: "Aktif partiler",
      rows: report.activeBatches,
      columns: [
        { header: "Tank", value: (b) => b.tankCode },
        { header: "Parti", value: (b) => b.lotCode, width: 16 },
        { header: "Tür", value: (b) => b.speciesName, width: 16 },
        { header: "Adet", value: (b) => b.estimatedCount, format: EXCEL_INT },
        { header: "Ort. ağırlık (g)", value: (b) => b.avgWeightG, format: EXCEL_DECIMAL },
      ],
    } satisfies ExcelSheet<InspectionReport["activeBatches"][number]>,
    {
      name: "Ölüm nedenleri",
      rows: Object.entries(report.mortality.byReason),
      columns: [
        { header: "Neden", value: ([reason]) => REASON_LABEL[reason as MortalityReason] ?? reason, width: 22 },
        { header: "Adet", value: ([, count]) => count, format: EXCEL_INT },
      ],
    } satisfies ExcelSheet<[string, number]>,
    {
      name: "Tedaviler",
      rows: report.treatments,
      columns: [
        { header: "Ürün", value: (t) => t.productName, width: 22 },
        { header: "Tür", value: (t) => TREATMENT_TYPE_LABEL[t.type] ?? t.type, width: 14 },
        { header: "Başlangıç", value: (t) => excelDate(t.startedAt), format: EXCEL_DATE },
        { header: "Bitiş", value: (t) => excelDate(t.endedAt), format: EXCEL_DATE },
        { header: "Arınma süresi (gün)", value: (t) => t.withdrawalPeriodDays, format: EXCEL_INT },
      ],
    } satisfies ExcelSheet<InspectionReport["treatments"][number]>,
    {
      name: "Su kalitesi",
      rows: water,
      columns: [
        { header: "Ölçüm", value: ([label]) => label, width: 20 },
        { header: "En düşük", value: ([, s]) => s?.min ?? null, format: EXCEL_DECIMAL },
        { header: "Ortalama", value: ([, s]) => s?.avg ?? null, format: EXCEL_DECIMAL },
        { header: "En yüksek", value: ([, s]) => s?.max ?? null, format: EXCEL_DECIMAL },
        { header: "Ölçüm sayısı", value: ([, s]) => s?.count ?? 0, format: EXCEL_INT },
      ],
    } satisfies ExcelSheet<[string, MinMaxAvg | null]>,
    {
      name: "Hasat",
      rows: report.harvestRecords,
      columns: [
        { header: "Tarih", value: (h) => excelDate(h.harvestedAt), format: EXCEL_DATE },
        { header: "Adet", value: (h) => h.fishCount, format: EXCEL_INT },
        { header: "Biyokütle (kg)", value: (h) => h.biomassKg, format: EXCEL_DECIMAL },
        { header: "Gideceği yer", value: (h) => h.destination, width: 20 },
      ],
    } satisfies ExcelSheet<InspectionReport["harvestRecords"][number]>,
  ] as ExcelSheet<unknown>[];
}

function InspectionReportContent({ farmId: lockedFarmId }: { farmId?: string }) {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState("");
  const farmId =
    lockedFarmId ??
    (selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? ""));

  const [periodStart, setPeriodStart] = React.useState(isoDaysAgo(180));
  const [periodEnd, setPeriodEnd] = React.useState(isoDaysAgo(0));
  const [bucketWidthText, setBucketWidthText] = React.useState("50");
  const bucketWidthG = Number(bucketWidthText) || 0;

  const { data: report, isLoading } = useInspectionReport(farmId, periodStart, periodEnd);
  const weightDistribution = report ? buildWeightDistribution(report.activeBatches, bucketWidthG) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          {lockedFarmId ? null : (
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">Çiftlik</Label>
              <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
                <SelectTrigger className="w-44">
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
          )}
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Başlangıç</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Bitiş</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!report}
            onClick={() =>
              report &&
              downloadExcel(
                `denetim-raporu-${report.farm.code}-${periodStart}-${periodEnd}`,
                inspectionSheets(report),
              ).catch(() => toast.error("Excel dosyası hazırlanırken bir sorun oluştu."))
            }
          >
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" disabled={!report} onClick={() => window.print()}>
            <Printer className="size-4" /> Yazdır / PDF
          </Button>
        </div>
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

          <PanelCard title="Gramaj Dağılımı">
            <div className="flex items-center gap-2 border-b border-border px-4.5 py-2.5 print:hidden">
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
            {weightDistribution.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gramaj aralığı</TableHead>
                      <TableHead>Parti sayısı</TableHead>
                      <TableHead>Toplam adet</TableHead>
                      <TableHead>Toplam biyokütle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weightDistribution.map((bucket) => (
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

export function InspectionReportSection({ farmId }: { farmId?: string } = {}) {
  const { has } = usePlan();
  if (!has(PlanFeature.INSPECTION_REPORT)) return <PlanLocked feature={PlanFeature.INSPECTION_REPORT} />;
  return <InspectionReportContent farmId={farmId} />;
}
