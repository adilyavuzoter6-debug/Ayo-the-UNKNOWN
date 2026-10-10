"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import { useInventoryBatches } from "@/hooks/use-feed-inventory";
import { tankLoad } from "@/lib/farm-production-summary";
import { MORTALITY_REASON_LABEL } from "@/lib/tanks";
import { cn } from "@/lib/utils";
import type { TankProductionRow } from "@/hooks/use-production-overview";
import type { MortalityReason } from "@/lib/types";

/** One stocked pond's row in the grid — the tank plus the batch any entered numbers apply to.
 *  A tank with more than one batch is flagged but still targets its first (oldest) allocation;
 *  a tank split across several batches is rare enough that the per-pond dialogs cover it fine. */
interface StockedRow {
  tankId: string;
  tankCode: string;
  batchId: string;
  lotCode: string;
  multiBatch: boolean;
  /** Distribution weights for "blok toplamı" mode — current live count and biomass. */
  liveCount: number;
  biomassKg: number;
}

/** Splits `total` across `weights`' shares as whole numbers that sum back to exactly `total`
 *  (largest-remainder method) — plain proportional rounding can land one fish short or over. */
function distributeInt(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i]! }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) {
    result[order[k]!.i]! += 1;
  }
  return result;
}

/** Splits `total` across `weights`' shares proportionally, rounded to 2 decimals — fine for a
 *  kg amount, unlike a fish count there's no need for the sum to land exactly on `total`. */
function distributeFloat(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  return weights.map((w) => Math.round(((w / sum) * total) * 100) / 100);
}

/**
 * Lets a block's daily mortality and feeding be entered for every pond at once instead of opening
 * each pond's own dialog in turn — mirrors how farms actually report this (one table per block,
 * one row per pond, read off a paper log at the end of the day). Two modes: fill each pond's own
 * number, or type one total for the whole block and let it split automatically across the ponds
 * (mortality by live count share, feeding by biomass share).
 */
export function BlockDailyEntryDialog({ farmId, rows }: { farmId: string; rows: TankProductionRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"perPond" | "total">("perPond");
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const { data: inventoryBatches } = useInventoryBatches();

  const [occurredAt, setOccurredAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = React.useState<MortalityReason>("UNKNOWN");
  const [feedInventoryBatchId, setFeedInventoryBatchId] = React.useState("");
  const [values, setValues] = React.useState<Record<string, { mortality: string; feedKg: string }>>({});
  const [totalMortality, setTotalMortality] = React.useState("");
  const [totalFeedKg, setTotalFeedKg] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const stockedRows: StockedRow[] = rows
    .filter((r) => r.allocations.length > 0)
    .map((r) => {
      const load = tankLoad(r.tank, r.allocations);
      return {
        tankId: r.tank.id,
        tankCode: r.tank.code,
        batchId: r.allocations[0]!.batchId,
        lotCode: r.allocations[0]!.batch.lotCode,
        multiBatch: r.allocations.length > 1,
        liveCount: load.count,
        biomassKg: load.biomassKg,
      };
    });

  const availableLots = (inventoryBatches ?? []).filter(
    (b) => b.warehouse.farmId === farmId && Number(b.balance?.quantityOnHandKg ?? 0) > 0,
  );

  function setRowValue(tankId: string, field: "mortality" | "feedKg", value: string) {
    setValues((prev) => ({
      ...prev,
      [tankId]: { mortality: prev[tankId]?.mortality ?? "", feedKg: prev[tankId]?.feedKg ?? "", [field]: value },
    }));
  }

  function resetAndClose() {
    setValues({});
    setFeedInventoryBatchId("");
    setTotalMortality("");
    setTotalFeedKg("");
    setMode("perPond");
    setOpen(false);
  }

  // "Blok toplamı" mode's computed split — mortality by each pond's live-count share, feeding by
  // its biomass share. Shown as a read-only preview so a skewed block (one pond much bigger than
  // the rest) is visible before it's saved, not discovered after.
  const totalMortalityNum = totalMortality ? Number(totalMortality) : 0;
  const totalFeedKgNum = totalFeedKg ? Number(totalFeedKg) : 0;
  const mortalitySplit = distributeInt(
    totalMortalityNum,
    stockedRows.map((r) => r.liveCount),
  );
  const feedSplit = distributeFloat(
    totalFeedKgNum,
    stockedRows.map((r) => r.biomassKg),
  );

  async function onSubmit() {
    const jobs: Promise<unknown>[] = [];

    if (mode === "perPond") {
      for (const row of stockedRows) {
        const rowValues = values[row.tankId];
        const mortality = rowValues?.mortality ? Number(rowValues.mortality) : 0;
        const feedKg = rowValues?.feedKg ? Number(rowValues.feedKg) : 0;
        if (mortality > 0) {
          jobs.push(
            api.post(`/tanks/${row.tankId}/mortality-events`, {
              batchId: row.batchId,
              fishCount: mortality,
              reason,
              occurredAt,
            }),
          );
        }
        if (feedKg > 0 && feedInventoryBatchId) {
          jobs.push(
            api.post(`/tanks/${row.tankId}/feeding-events`, {
              batchId: row.batchId,
              feedInventoryBatchId,
              quantityKg: feedKg,
              occurredAt,
            }),
          );
        }
      }
    } else {
      stockedRows.forEach((row, i) => {
        const mortality = mortalitySplit[i] ?? 0;
        const feedKg = feedSplit[i] ?? 0;
        if (mortality > 0) {
          jobs.push(
            api.post(`/tanks/${row.tankId}/mortality-events`, {
              batchId: row.batchId,
              fishCount: mortality,
              reason,
              occurredAt,
              notes: `Blok toplamı: ${totalMortalityNum} adet, havuza oranlı dağıtıldı`,
            }),
          );
        }
        if (feedKg > 0 && feedInventoryBatchId) {
          jobs.push(
            api.post(`/tanks/${row.tankId}/feeding-events`, {
              batchId: row.batchId,
              feedInventoryBatchId,
              quantityKg: feedKg,
              occurredAt,
              notes: `Blok toplamı: ${totalFeedKgNum} kg, havuza oranlı dağıtıldı`,
            }),
          );
        }
      });
    }

    if (jobs.length === 0) {
      toast.error(
        mode === "perPond"
          ? "En az bir havuz için ölüm veya yem miktarı girin."
          : "Toplam ölüm adedi veya toplam yem miktarı girin.",
      );
      return;
    }

    setSubmitting(true);
    const results = await Promise.allSettled(jobs);
    setSubmitting(false);

    for (const row of stockedRows) {
      queryClient.invalidateQueries({ queryKey: ["mortality-events", companyId, row.tankId] });
      queryClient.invalidateQueries({ queryKey: ["feeding-events", companyId, row.tankId] });
    }
    queryClient.invalidateQueries({ queryKey: ["fish-batches", companyId] });
    queryClient.invalidateQueries({ queryKey: ["farm-fish-batches", companyId, farmId] });
    queryClient.invalidateQueries({ queryKey: ["farm-stock-summary", companyId] });
    queryClient.invalidateQueries({ queryKey: ["inventory-batches", companyId] });
    queryClient.invalidateQueries({ queryKey: ["alerts", "farm", companyId, farmId] });

    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    if (failed === 0) {
      toast.success(`${succeeded} kayıt eklendi.`);
      resetAndClose();
    } else {
      toast.error(`${succeeded} kayıt eklendi, ${failed} kayıt başarısız oldu.`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <ClipboardList className="size-3.5" />
            Toplu ölüm / yem girişi
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Toplu ölüm / yem girişi</DialogTitle>
          <DialogDescription>
            {mode === "perPond"
              ? "Bu bloktaki havuzlar için günlük ölüm ve yemlemeyi tek seferde girin. Boş bırakılan hücreler kaydedilmez."
              : "Bloğun toplam ölü adedini ve toplam yem miktarını girin; havuzlara oranlı olarak otomatik dağıtılır."}
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex w-fit overflow-hidden rounded-md border border-border text-xs">
          <button
            type="button"
            onClick={() => setMode("perPond")}
            className={cn(
              "px-3 py-1.5 font-medium transition-colors",
              mode === "perPond" ? "bg-teal-500 text-white" : "bg-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            Havuz havuz
          </button>
          <button
            type="button"
            onClick={() => setMode("total")}
            className={cn(
              "px-3 py-1.5 font-medium transition-colors",
              mode === "total" ? "bg-teal-500 text-white" : "bg-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            Blok toplamı
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Tarih</Label>
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ölüm nedeni</Label>
            <Select value={reason} onValueChange={(v) => setReason((v ?? "UNKNOWN") as MortalityReason)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: MortalityReason) => MORTALITY_REASON_LABEL[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MORTALITY_REASON_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Yem lotu</Label>
            <Select value={feedInventoryBatchId} onValueChange={(v) => setFeedInventoryBatchId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Yem lotu seçin">
                  {(v: string) => availableLots.find((b) => b.id === v)?.feedProduct.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableLots.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.feedProduct.name} — {Number(b.balance?.quantityOnHandKg ?? 0).toLocaleString("tr")} kg
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableLots.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Bu çiftlikte stokta yem yok.</p>
            ) : null}
          </div>
        </div>

        {mode === "total" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Toplam ölü (adet)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={totalMortality}
                onChange={(e) => setTotalMortality(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Toplam yem (kg)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={totalFeedKg}
                onChange={(e) => setTotalFeedKg(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Havuz</th>
                <th className="px-3 py-2 text-right font-medium">Ölü (adet)</th>
                <th className="px-3 py-2 text-right font-medium">Yem (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stockedRows.map((row, i) => (
                <tr key={row.tankId}>
                  <td className="px-3 py-1.5">
                    <span className="font-mono font-medium">{row.tankCode}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {row.lotCode}
                      {row.multiBatch ? " (+diğer partiler)" : ""}
                    </span>
                  </td>
                  {mode === "perPond" ? (
                    <>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="h-8 text-right"
                          value={values[row.tankId]?.mortality ?? ""}
                          onChange={(e) => setRowValue(row.tankId, "mortality", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-8 text-right"
                          value={values[row.tankId]?.feedKg ?? ""}
                          onChange={(e) => setRowValue(row.tankId, "feedKg", e.target.value)}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                        {(mortalitySplit[i] ?? 0) > 0 ? mortalitySplit[i] : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                        {(feedSplit[i] ?? 0) > 0 ? feedSplit[i]!.toLocaleString("tr") : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {stockedRows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Bu blokta stoklu havuz yok.</p>
          ) : null}
        </div>
        {mode === "total" ? (
          <p className="text-[11px] text-muted-foreground">
            Ölüm, havuzların canlı adedine; yem, havuzların biyokütlesine oranlı dağıtılır. Yukarıdaki sütunlar
            kaydedilecek değerlerin önizlemesidir.
          </p>
        ) : null}

        <DialogFooter>
          <Button onClick={onSubmit} disabled={submitting || stockedRows.length === 0}>
            {submitting ? "Kaydediliyor…" : "Hepsini kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
