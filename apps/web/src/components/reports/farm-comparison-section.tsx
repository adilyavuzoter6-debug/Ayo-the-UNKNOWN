"use client";

import * as React from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFarmComparison } from "@/hooks/use-reports";
import { useApiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import {
  downloadExcel,
  EXCEL_DATE,
  EXCEL_DATE_TIME,
  EXCEL_DECIMAL,
  EXCEL_INT,
  excelDate,
  type ExcelColumn,
  type ExcelSheet,
} from "@/lib/excel";
import { MORTALITY_REASON_LABEL } from "@/lib/tanks";
import type { FarmComparison, FarmComparisonRow, ReportRecords } from "@/lib/types";
import { cn } from "@/lib/utils";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number | null, digits = 0): string {
  return n === null ? "—" : n.toLocaleString("tr", { maximumFractionDigits: digits });
}

/** The comparison's columns, shared by the table and the Excel sheet. */
function comparisonColumns(canSeeCosts: boolean): (ExcelColumn<FarmComparisonRow> & { digits: number })[] {
  return [
    { header: "Canlı balık", value: (r) => r.fishCount, format: EXCEL_INT, digits: 0 },
    { header: "Biyokütle (kg)", value: (r) => r.biomassKg, format: EXCEL_INT, digits: 0 },
    { header: "Ort. ağırlık (g)", value: (r) => r.avgWeightG, format: EXCEL_DECIMAL, digits: 1 },
    { header: "Aktif parti", value: (r) => r.activeBatches, format: EXCEL_INT, digits: 0 },
    { header: "Verilen yem (kg)", value: (r) => r.feedKg, format: EXCEL_INT, digits: 0 },
    { header: "FCR", value: (r) => r.fcr, format: EXCEL_DECIMAL, digits: 2 },
    { header: "Ölüm (adet)", value: (r) => r.mortalityCount, format: EXCEL_INT, digits: 0 },
    { header: "Ölüm oranı (%)", value: (r) => r.mortalityPct, format: EXCEL_DECIMAL, digits: 2 },
    { header: "Hasat (adet)", value: (r) => r.harvestCount, format: EXCEL_INT, digits: 0 },
    { header: "Hasat (kg)", value: (r) => r.harvestKg, format: EXCEL_INT, digits: 0 },
    { header: "Ort. sıcaklık (°C)", value: (r) => r.avgTemperatureC, format: EXCEL_DECIMAL, digits: 1 },
    { header: "Ort. O₂ (mg/L)", value: (r) => r.avgOxygenMgL, format: EXCEL_DECIMAL, digits: 1 },
    { header: "En düşük O₂ (mg/L)", value: (r) => r.minOxygenMgL, format: EXCEL_DECIMAL, digits: 1 },
    { header: "Uyarı", value: (r) => r.alertCount, format: EXCEL_INT, digits: 0 },
    ...(canSeeCosts
      ? [
          { header: "Gider (TL)", value: (r: FarmComparisonRow) => r.costs?.expensesTry ?? null, format: EXCEL_INT, digits: 0 },
          { header: "Satış (TL)", value: (r: FarmComparisonRow) => r.costs?.revenueTry ?? null, format: EXCEL_INT, digits: 0 },
          {
            header: "Dönem sonucu (TL)",
            value: (r: FarmComparisonRow) => r.costs?.periodResultTry ?? null,
            format: EXCEL_INT,
            digits: 0,
          },
        ]
      : []),
  ];
}

/** Company-wide totals; rates and averages are left blank rather than averaged across farms. */
function totals(rows: FarmComparisonRow[]): Partial<Record<string, number>> {
  const sum = (pick: (r: FarmComparisonRow) => number | null | undefined) =>
    rows.reduce((total, r) => total + (pick(r) ?? 0), 0);
  const fishCount = sum((r) => r.fishCount);
  const deaths = sum((r) => r.mortalityCount);
  return {
    "Canlı balık": fishCount,
    "Biyokütle (kg)": sum((r) => r.biomassKg),
    "Aktif parti": sum((r) => r.activeBatches),
    "Verilen yem (kg)": sum((r) => r.feedKg),
    "Ölüm (adet)": deaths,
    "Ölüm oranı (%)": fishCount + deaths > 0 ? (deaths / (fishCount + deaths)) * 100 : undefined,
    "Hasat (adet)": sum((r) => r.harvestCount),
    "Hasat (kg)": sum((r) => r.harvestKg),
    "Uyarı": sum((r) => r.alertCount),
    "Gider (TL)": sum((r) => r.costs?.expensesTry),
    "Satış (TL)": sum((r) => r.costs?.revenueTry),
    "Dönem sonucu (TL)": sum((r) => r.costs?.periodResultTry),
  };
}

/** The farm with the worst value in a column, when there's more than one farm to compare. */
function worstFarmId(rows: FarmComparisonRow[], pick: (r: FarmComparisonRow) => number | null) {
  const candidates = rows.filter((r) => pick(r) !== null && pick(r)! > 0);
  if (candidates.length < 2) return null;
  return candidates.reduce((worst, r) => (pick(r)! > pick(worst)! ? r : worst)).farmId;
}

function recordSheets(records: ReportRecords): ExcelSheet<unknown>[] {
  const place = [
    { header: "Çiftlik", value: (r: { farmName: string }) => r.farmName, width: 18 },
    { header: "Bölüm", value: (r: { sectionName: string }) => r.sectionName, width: 14 },
    { header: "Tank", value: (r: { tankCode: string }) => r.tankCode, width: 10 },
  ];
  return [
    {
      name: "Yemleme",
      rows: records.feeding.rows,
      columns: [
        { header: "Tarih", value: (r) => excelDate(r.occurredAt), format: EXCEL_DATE_TIME, width: 17 },
        ...place,
        { header: "Parti", value: (r) => r.lotCode, width: 16 },
        { header: "Yem", value: (r) => r.feedProduct, width: 20 },
        { header: "Miktar (kg)", value: (r) => r.quantityKg, format: EXCEL_DECIMAL },
      ],
    } satisfies ExcelSheet<ReportRecords["feeding"]["rows"][number]>,
    {
      name: "Ölüm",
      rows: records.mortality.rows,
      columns: [
        { header: "Tarih", value: (r) => excelDate(r.occurredAt), format: EXCEL_DATE_TIME, width: 17 },
        ...place,
        { header: "Parti", value: (r) => r.lotCode, width: 16 },
        { header: "Adet", value: (r) => r.fishCount, format: EXCEL_INT },
        { header: "Tahmini biyokütle (kg)", value: (r) => r.estimatedBiomassKg, format: EXCEL_DECIMAL },
        { header: "Neden", value: (r) => MORTALITY_REASON_LABEL[r.reason] ?? r.reason, width: 20 },
      ],
    } satisfies ExcelSheet<ReportRecords["mortality"]["rows"][number]>,
    {
      name: "Su kalitesi",
      rows: records.waterQuality.rows,
      columns: [
        { header: "Tarih", value: (r) => excelDate(r.occurredAt), format: EXCEL_DATE_TIME, width: 17 },
        ...place,
        { header: "Sıcaklık (°C)", value: (r) => r.temperatureC, format: EXCEL_DECIMAL },
        { header: "O₂ (mg/L)", value: (r) => r.dissolvedOxygenMgL, format: EXCEL_DECIMAL },
        { header: "pH", value: (r) => r.ph, format: EXCEL_DECIMAL },
        { header: "Amonyak (mg/L)", value: (r) => r.ammoniaMgL, format: "#,##0.000" },
        { header: "Nitrit (mg/L)", value: (r) => r.nitriteMgL, format: "#,##0.000" },
      ],
    } satisfies ExcelSheet<ReportRecords["waterQuality"]["rows"][number]>,
    {
      name: "Hasat",
      rows: records.harvests.rows,
      columns: [
        { header: "Tarih", value: (r) => excelDate(r.harvestedAt), format: EXCEL_DATE, width: 12 },
        ...place,
        { header: "Parti", value: (r) => r.lotCode, width: 16 },
        { header: "Adet", value: (r) => r.fishCount, format: EXCEL_INT },
        { header: "Biyokütle (kg)", value: (r) => r.biomassKg, format: EXCEL_DECIMAL },
        { header: "Ort. ağırlık (g)", value: (r) => r.avgWeightG, format: EXCEL_DECIMAL },
        { header: "Gideceği yer", value: (r) => r.destination, width: 18 },
        { header: "Satış (TL)", value: (r) => r.saleRevenueTry, format: EXCEL_DECIMAL },
      ],
    } satisfies ExcelSheet<ReportRecords["harvests"]["rows"][number]>,
  ] as ExcelSheet<unknown>[];
}

export function FarmComparisonSection() {
  const api = useApiClient();
  const [periodStart, setPeriodStart] = React.useState(isoDaysAgo(30));
  const [periodEnd, setPeriodEnd] = React.useState(isoDaysAgo(0));
  const [exporting, setExporting] = React.useState(false);
  const { data, isLoading, error } = useFarmComparison(periodStart, periodEnd);

  const columns = comparisonColumns(data?.canSeeCosts ?? false);
  const worstFcr = data ? worstFarmId(data.farms, (r) => r.fcr) : null;
  const worstMortality = data ? worstFarmId(data.farms, (r) => r.mortalityPct) : null;
  const total = data ? totals(data.farms) : {};

  async function handleExport(report: FarmComparison) {
    setExporting(true);
    try {
      const records = await api.get<ReportRecords>(
        `/reports/records?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
      );
      await downloadExcel(`piscatio-rapor-${periodStart}-${periodEnd}`, [
        {
          name: "Karşılaştırma",
          rows: report.farms,
          columns: [
            { header: "Çiftlik", value: (r: FarmComparisonRow) => r.farmName, width: 20 },
            { header: "Kod", value: (r: FarmComparisonRow) => r.farmCode, width: 10 },
            ...columns.map((c) => ({ ...c, width: Math.max(12, c.header.length + 2) })),
          ],
        },
        ...recordSheets(records),
      ]);
      const cut = [records.feeding, records.mortality, records.waterQuality, records.harvests].some((r) => r.truncated);
      if (cut) toast.warning("Kayıt sayısı çok fazla olduğu için bazı sayfalar kısaltıldı. Daha kısa bir dönem seçin.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Excel dosyası hazırlanırken bir sorun oluştu.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Başlangıç</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Bitiş</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={!data || exporting} onClick={() => data && handleExport(data)}>
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
          Excel&apos;e aktar
        </Button>
      </div>

      <PanelCard title="Çiftlik Karşılaştırması">
        {error ? (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            {error instanceof ApiError ? error.message : "Karşılaştırma yüklenemedi."}
          </p>
        ) : isLoading || !data ? (
          <div className="p-4">
            <Skeleton className="h-40 rounded" />
          </div>
        ) : data.farms.length === 0 ? (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">Karşılaştırılacak çiftlik yok.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card">Çiftlik</TableHead>
                    {columns.map((c) => (
                      <TableHead key={c.header} className="text-right whitespace-nowrap">
                        {c.header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.farms.map((row) => (
                    <TableRow key={row.farmId}>
                      <TableCell className="sticky left-0 bg-card font-medium whitespace-nowrap">{row.farmName}</TableCell>
                      {columns.map((c) => {
                        const flagged =
                          (c.header === "FCR" && row.farmId === worstFcr) ||
                          (c.header === "Ölüm oranı (%)" && row.farmId === worstMortality);
                        return (
                          <TableCell
                            key={c.header}
                            className={cn("text-right font-mono", flagged && "font-semibold text-warning")}
                          >
                            {fmt(c.value(row) as number | null, c.digits)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
                {data.farms.length > 1 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="sticky left-0 bg-muted font-medium">Toplam</TableCell>
                      {columns.map((c) => (
                        <TableCell key={c.header} className="text-right font-mono">
                          {fmt(total[c.header] ?? null, c.digits)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </div>
            <p className="border-t border-border px-4.5 py-2.5 text-[11px] leading-snug text-muted-foreground">
              Canlı balık, biyokütle ve FCR bugünkü duruma göre; diğer sütunlar seçilen dönem içindir. FCR, stoklamadan
              bu yana verilen yemin üretilen biyokütleye (hasat ve ölüm dahil) oranıdır ve yalnızca en az bir tartımla
              büyümesi ölçülmüş partileri kapsar. Ölüm oranı, dönemde ölenlerin dönem sonu stoku ile ölenlerin toplamına
              oranıdır. En yüksek FCR ve ölüm oranı turuncu gösterilir.
            </p>
          </>
        )}
      </PanelCard>
    </div>
  );
}
