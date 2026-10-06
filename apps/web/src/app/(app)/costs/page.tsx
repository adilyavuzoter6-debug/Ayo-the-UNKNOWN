"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, Wallet } from "lucide-react";
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
import { AddCostEntryDialog } from "@/components/costs/add-cost-entry-dialog";
import { AddRecurringCostDialog } from "@/components/costs/add-recurring-cost-dialog";
import { EditStockingDialog } from "@/components/farms/edit-stocking-dialog";
import { TargetWeightScenariosPanel } from "@/components/costs/target-weight-scenarios-panel";
import { useFarms } from "@/hooks/use-farms";
import { useFishBatches } from "@/hooks/use-fish-batches";
import {
  useCostForecast,
  useDeleteCostEntry,
  useFarmCostEntries,
  useFarmCostSummary,
  useRecurringCosts,
  useStopRecurringCost,
} from "@/hooks/use-costs";
import { ApiError } from "@/lib/api-error";
import { COST_CATEGORY_LABEL } from "@/lib/costs";
import { cn } from "@/lib/utils";
import type { CostCategory, CostEntry, FishBatch } from "@/lib/types";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtTry(n: number): string {
  return n.toLocaleString("tr", { maximumFractionDigits: 2 }) + " ₺";
}

function fmtPerKg(n: number | null): string {
  return n !== null ? `${n.toLocaleString("tr", { maximumFractionDigits: 2 })} ₺/kg` : "—";
}

function fmtOptionalTry(n: number | null): string {
  return n !== null ? fmtTry(n) : "—";
}

const SYMBOL: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };

/** A non-TRY entry keeps its original amount visible next to the TRY it was booked at. */
function fmtForeign(n: number, currency: string): string {
  return `${n.toLocaleString("tr", { maximumFractionDigits: 2 })} ${SYMBOL[currency] ?? currency}`;
}

function toneClass(n: number | null) {
  if (n === null) return "";
  return n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-base font-semibold", tone ?? "text-foreground")}>{value}</div>
    </div>
  );
}

/** Forecast knobs as text while typing, parsed only when they make sense. */
function parseOr(value: string, fallback: number): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function ForecastPanel({ farmId }: { farmId: string }) {
  const [weight, setWeight] = React.useState("500");
  const [fcr, setFcr] = React.useState("1.3");
  const [survival, setSurvival] = React.useState("95");
  const [feedPrice, setFeedPrice] = React.useState("");

  const feedPriceTryPerKg = feedPrice.trim() === "" ? undefined : parseOr(feedPrice, 0) || undefined;
  const { data, isLoading, isFetching } = useCostForecast(farmId, {
    targetWeightG: parseOr(weight, 500),
    targetFcr: parseOr(fcr, 1.3),
    survivalPct: Math.min(parseOr(survival, 95), 100),
    feedPriceTryPerKg,
  });

  const sourceLabel: Record<"input" | "recent_consumption" | "latest_lot", string> = {
    input: "girdiğiniz fiyat",
    recent_consumption: "son 90 günde tüketilen yemin ortalama fiyatı",
    latest_lot: "en son alınan partinin fiyatı",
  };

  return (
    <PanelCard title="Hasat Öncesi Tahmin">
      <div className="space-y-4 px-4.5 py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Hedef ağırlık (g)</Label>
            <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Hedef FCR (kg yem / kg büyüme)</Label>
            <Input value={fcr} onChange={(e) => setFcr(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Sağkalım (%)</Label>
            <Input value={survival} onChange={(e) => setSurvival(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Yem fiyatı (₺/kg, boş = otomatik)</Label>
            <Input
              value={feedPrice}
              placeholder="otomatik"
              onChange={(e) => setFeedPrice(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 rounded" />
        ) : data ? (
          <>
            {data.batches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Bu çiftlikte canlı balık yok.</p>
            ) : (
              <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parti</TableHead>
                      <TableHead>Canlı biyokütle</TableHead>
                      <TableHead>Hedef biyokütle</TableHead>
                      <TableHead>Kalan yem</TableHead>
                      <TableHead>Harcanmış</TableHead>
                      <TableHead>Tahmini toplam maliyet</TableHead>
                      <TableHead>Hasatta ₺/kg</TableHead>
                      <TableHead>Tahmini gelir</TableHead>
                      <TableHead>Tahmini sonuç</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.batches.map((row) => (
                      <TableRow key={row.batchId}>
                        <TableCell>
                          <Link href={`/batches/${row.batchId}`} className="font-mono text-teal-500 hover:underline">
                            {row.lotCode}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono">
                          {row.liveBiomassKg.toFixed(1)} kg
                          <span className="block text-[11px] text-muted-foreground">
                            {row.liveCount.toLocaleString("tr")} balık
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">{row.targetBiomassKg.toFixed(1)} kg</TableCell>
                        <TableCell className="font-mono">{row.feedKgNeeded.toFixed(1)} kg</TableCell>
                        <TableCell className="font-mono">{fmtTry(row.sunkCostTry)}</TableCell>
                        <TableCell className="font-mono">{fmtOptionalTry(row.totalCostTry)}</TableCell>
                        <TableCell className="font-mono font-medium">
                          {row.costPerKgTry !== null ? fmtPerKg(row.costPerKgTry) : "—"}
                        </TableCell>
                        <TableCell className="font-mono">{fmtOptionalTry(row.revenueTry)}</TableCell>
                        <TableCell className={cn("font-mono font-medium", toneClass(row.resultTry))}>
                          {fmtOptionalTry(row.resultTry)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.batches.length > 1 ? (
                      <TableRow className="font-medium">
                        <TableCell>Toplam</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell className="font-mono">{data.totals.feedKgNeeded.toFixed(1)} kg</TableCell>
                        <TableCell />
                        <TableCell className="font-mono">{fmtOptionalTry(data.totals.totalCostTry)}</TableCell>
                        <TableCell />
                        <TableCell className="font-mono">{fmtOptionalTry(data.totals.revenueTry)}</TableCell>
                        <TableCell className={cn("font-mono", toneClass(data.totals.resultTry))}>
                          {fmtOptionalTry(data.totals.resultTry)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Yem fiyatı:{" "}
              {data.assumptions.feedPriceTryPerKg !== null && data.assumptions.feedPriceSource
                ? `${fmtTry(data.assumptions.feedPriceTryPerKg)}/kg (${sourceLabel[data.assumptions.feedPriceSource]})`
                : "bilinmiyor — stok alımında birim maliyet girin"}
              .{" "}
              {data.assumptions.expectedSaleTryPerKg !== null
                ? `Satış fiyatı son 6 ayın hasatlarından: ${fmtPerKg(data.assumptions.expectedSaleTryPerKg)}. `
                : "Satış geliri için henüz satış fiyatı girilmiş hasat yok. "}
              {data.assumptions.note}
            </p>
          </>
        ) : null}
      </div>
    </PanelCard>
  );
}

function RecurringCostsPanel({ farmId }: { farmId: string }) {
  const { data: recurring, isLoading } = useRecurringCosts(farmId);
  const stop = useStopRecurringCost(farmId);

  return (
    <PanelCard title="Tekrarlayan Giderler">
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-16 rounded" />
        </div>
      ) : recurring && recurring.length > 0 ? (
        <ul className="divide-y divide-border">
          {recurring.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-xs">
              <div>
                <span className="font-medium text-foreground">{COST_CATEGORY_LABEL[r.category]}</span>
                <span className="ml-2 text-muted-foreground">
                  her ayın {r.dayOfMonth}. günü
                  {r.notes ? ` — ${r.notes}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-medium text-foreground">
                  {fmtForeign(Number(r.amount), r.currency)} / ay
                </span>
                <span className="font-mono text-muted-foreground">
                  son kayıt: {r.generatedThrough ?? "henüz yok"}
                </span>
                <Button variant="outline" size="sm" disabled={stop.isPending} onClick={() => stop.mutate(r.id)}>
                  Durdur
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4.5 py-8 text-center text-sm text-muted-foreground">
          Kira, elektrik sözleşmesi veya sabit çalışan gibi her ay tekrarlanan giderleri buraya ekleyin.
        </p>
      )}
    </PanelCard>
  );
}

export default function CostsPage() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState<string>("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");

  const { data: batches } = useFishBatches();
  const [periodStart, setPeriodStart] = React.useState(isoDaysAgo(30));
  const [periodEnd, setPeriodEnd] = React.useState(isoDaysAgo(0));

  const { data: summary, isLoading: summaryLoading } = useFarmCostSummary(
    farmId,
    periodStart,
    periodEnd,
  );
  const { data: entries, isLoading: entriesLoading } = useFarmCostEntries(farmId);
  const deleteCostEntry = useDeleteCostEntry(farmId);
  const [editingEntry, setEditingEntry] = React.useState<CostEntry | null>(null);
  const [editingStockingBatch, setEditingStockingBatch] = React.useState<FishBatch | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState<string | null>(null);

  // Two clicks: the first arms the delete, the second one deletes. No browser dialog involved.
  async function onDelete(entry: CostEntry) {
    if (confirmingDeleteId !== entry.id) {
      setConfirmingDeleteId(entry.id);
      return;
    }
    try {
      await deleteCostEntry.mutateAsync(entry.id);
      toast.success("Gider silindi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Gider silinirken bir sorun oluştu.");
    } finally {
      setConfirmingDeleteId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Maliyetler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Üretim maliyeti, satış geliri ve dönem sonucu — yem, işçilik, ilaç ve diğer giderler.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
            <SelectTrigger className="w-40">
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
          {farmId ? <AddRecurringCostDialog farmId={farmId} /> : null}
          {farmId ? <AddCostEntryDialog farmId={farmId} batches={batches ?? []} /> : null}
        </div>
      </div>

      {farms === undefined ? (
        // See dashboard/page.tsx — undefined (not loaded yet) must not be read as "no farms".
        <PanelCard title="Maliyet Özeti">
          <div className="p-4">
            <Skeleton className="h-16 rounded" />
          </div>
        </PanelCard>
      ) : !farmId ? (
        <PanelCard title="Maliyet Özeti">
          <p className="flex items-center gap-2 px-4.5 py-10 text-sm text-muted-foreground">
            <Wallet className="size-4" /> Bir çiftlik seçin.
          </p>
        </PanelCard>
      ) : (
        <>
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

          {summaryLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : summary ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric label="Toplam gider (faturalanan)" value={fmtTry(summary.totalAmount)} />
                <Metric label="Satış geliri" value={fmtTry(summary.revenueTry)} />
                <Metric
                  label="Dönem sonucu (satılan malın maliyeti dahil)"
                  value={fmtTry(summary.periodResultTry)}
                  tone={toneClass(summary.periodResultTry)}
                />
                <Metric label="Ölüm kaybı (tahmini)" value={fmtTry(summary.mortalityLossTry)} />
              </div>

              <PanelCard title="Gider Dağılımı">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4.5 py-4 text-xs sm:grid-cols-4">
                  {Object.entries(summary.byCategory).length > 0 ? (
                    Object.entries(summary.byCategory).map(([category, amount]) => (
                      <div key={category}>
                        <div className="mb-0.5 text-muted-foreground">
                          {COST_CATEGORY_LABEL[category as CostCategory]}
                        </div>
                        <div className="font-mono font-medium text-foreground">
                          {fmtTry(amount ?? 0)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="col-span-full text-center text-muted-foreground">
                      Bu dönemde gider kaydı yok.
                    </p>
                  )}
                </div>
                <p className="border-t border-border px-4.5 py-2.5 text-[11px] text-muted-foreground">
                  Çiftlik geneli giderler (elektrik, işçilik, genel gider…): {fmtTry(summary.farmLevelCostTry)} —{" "}
                  {fmtTry(summary.allocatedFarmCostTry)} partilere dağıtıldı
                  {summary.unallocatedFarmCostTry > 0
                    ? `, ${fmtTry(summary.unallocatedFarmCostTry)} ise bu dönemde canlı balık olmadığı için dağıtılamadı (dönem gideri)`
                    : ""}
                  . Dağıtım, partinin o aydaki kg·gün payına göre yapılır. Alınıp henüz yenmemiş yem hiçbir partiye
                  yazılmaz. Satılan malın maliyeti: {fmtTry(summary.cogsTry)}.
                </p>
              </PanelCard>

              {summary.batchBreakdown.length > 0 ? (
                <PanelCard title="Parti Bazlı Sonuç">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parti</TableHead>
                          <TableHead>Doğrudan</TableHead>
                          <TableHead>Genel gider payı</TableHead>
                          <TableHead>Hasat</TableHead>
                          <TableHead>Birim maliyet</TableHead>
                          <TableHead>Satış / kg</TableHead>
                          <TableHead>Satılan malın maliyeti</TableHead>
                          <TableHead>Parti sonucu</TableHead>
                          <TableHead>Ölüm kaybı</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.batchBreakdown.map((row) => (
                          <TableRow key={row.batchId}>
                            <TableCell>
                              <Link href={`/batches/${row.batchId}`} className="font-mono text-teal-500 hover:underline">
                                {row.lotCode}
                              </Link>
                              {row.feedUnpricedKg > 0 ? (
                                <span className="block text-[11px] text-muted-foreground">
                                  {row.feedUnpricedKg.toFixed(1)} kg yem fiyatsız
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono">
                              {fmtTry(row.directCostTotal)}
                              {row.feedCostTry > 0 ? (
                                <span className="block text-[11px] text-muted-foreground">
                                  yem {fmtTry(row.feedCostTry)}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono">{fmtTry(row.allocatedFarmCostTry)}</TableCell>
                            <TableCell className="font-mono">
                              {row.harvestedKg.toFixed(1)} kg
                              <span className="block text-[11px] text-muted-foreground">
                                {row.producedKg.toFixed(1)} kg üretildi
                              </span>
                            </TableCell>
                            <TableCell className="font-mono font-medium">{fmtPerKg(row.unitCostPerKg)}</TableCell>
                            <TableCell className="font-mono font-medium">{fmtPerKg(row.avgSaleTryPerKg)}</TableCell>
                            <TableCell className="font-mono">{fmtTry(row.cogsTry)}</TableCell>
                            <TableCell className={cn("font-mono font-medium", toneClass(row.netProfitTry))}>
                              {fmtOptionalTry(row.netProfitTry)}
                            </TableCell>
                            <TableCell className="font-mono">
                              {fmtOptionalTry(row.mortalityLossTry)}
                              {row.mortalityKg > 0 ? (
                                <span className="block text-[11px] text-muted-foreground">
                                  {row.mortalityKg.toFixed(1)} kg ölü
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="border-t border-border px-4.5 py-2.5 text-[11px] text-muted-foreground">
                    Birim maliyet, partinin o ana kadarki toplam maliyetinin (doğrudan giderler, yediği yem, genel gider
                    payı, stoklama) ürettiği toplam kg&apos;a bölünmesiyle bulunur. Satılan malın maliyeti = satılan kg ×
                    birim maliyet. Parti sonucu = satış geliri − satılan malın maliyeti. Ölüm kaybı tahminidir: ölen kg
                    × birim maliyet.
                  </p>
                </PanelCard>
              ) : null}
            </>
          ) : null}

          <ForecastPanel farmId={farmId} />

          <RecurringCostsPanel farmId={farmId} />

          <TargetWeightScenariosPanel farmId={farmId} batches={batches ?? []} />

          <PanelCard title="Gider Kayıtları">
            {entriesLoading ? (
              <div className="p-4">
                <Skeleton className="h-32 rounded" />
              </div>
            ) : entries && entries.length > 0 ? (
              <ul className="divide-y divide-border">
                {entries.slice(0, 100).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{COST_CATEGORY_LABEL[e.category]}</span>
                      {e.sourceType === "RecurringCost" ? (
                        <span className="text-muted-foreground/80">(tekrarlayan)</span>
                      ) : e.sourceType === "BatchTransfer" ? (
                        <span className="text-muted-foreground/80">(partiler arası aktarım)</span>
                      ) : e.sourceType ? (
                        <span className="text-muted-foreground/80">(otomatik)</span>
                      ) : null}
                      {e.notes ? <span className="text-muted-foreground">— {e.notes}</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {e.currency !== "TRY" ? (
                        <span className="font-mono text-muted-foreground">
                          {fmtForeign(Number(e.amount), e.currency)}
                        </span>
                      ) : null}
                      <span className="font-mono font-medium text-foreground">
                        {fmtTry(Number(e.amountTry))}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {new Date(e.incurredAt).toLocaleDateString("tr")}
                      </span>
                      {e.sourceType === "FishBatchStocking" && e.batchId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingStockingBatch(batches?.find((b) => b.id === e.batchId) ?? null)}
                        >
                          <Pencil className="size-3.5" /> Düzenle
                        </Button>
                      ) : null}
                      {!e.sourceType ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEditingEntry(e)}>
                            <Pencil className="size-3.5" /> Düzenle
                          </Button>
                          <Button
                            variant={confirmingDeleteId === e.id ? "destructive" : "ghost"}
                            size="sm"
                            disabled={deleteCostEntry.isPending}
                            onClick={() => onDelete(e)}
                          >
                            <Trash2 className="size-3.5" />
                            {confirmingDeleteId === e.id ? "Emin misiniz?" : "Sil"}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
                Bu çiftlikte henüz gider kaydı yok.
              </p>
            )}
          </PanelCard>

          {editingEntry ? (
            <AddCostEntryDialog
              farmId={farmId}
              batches={batches ?? []}
              entry={editingEntry}
              open
              onOpenChange={(open) => {
                if (!open) setEditingEntry(null);
              }}
            />
          ) : null}
          {editingStockingBatch ? (
            <EditStockingDialog
              farmId={farmId}
              batch={editingStockingBatch}
              open
              onOpenChange={(open) => {
                if (!open) setEditingStockingBatch(null);
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
