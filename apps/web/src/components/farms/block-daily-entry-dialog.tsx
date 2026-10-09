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
import { MORTALITY_REASON_LABEL } from "@/lib/tanks";
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
}

/**
 * Lets a block's daily mortality and feeding be entered for every pond at once instead of opening
 * each pond's own dialog in turn — mirrors how farms actually report this (one table per block,
 * one row per pond, read off a paper log at the end of the day).
 */
export function BlockDailyEntryDialog({ farmId, rows }: { farmId: string; rows: TankProductionRow[] }) {
  const [open, setOpen] = React.useState(false);
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const { data: inventoryBatches } = useInventoryBatches();

  const [occurredAt, setOccurredAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = React.useState<MortalityReason>("UNKNOWN");
  const [feedInventoryBatchId, setFeedInventoryBatchId] = React.useState("");
  const [values, setValues] = React.useState<Record<string, { mortality: string; feedKg: string }>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const stockedRows: StockedRow[] = rows
    .filter((r) => r.allocations.length > 0)
    .map((r) => ({
      tankId: r.tank.id,
      tankCode: r.tank.code,
      batchId: r.allocations[0]!.batchId,
      lotCode: r.allocations[0]!.batch.lotCode,
      multiBatch: r.allocations.length > 1,
    }));

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
    setOpen(false);
  }

  async function onSubmit() {
    const jobs: Promise<unknown>[] = [];
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

    if (jobs.length === 0) {
      toast.error(
        feedInventoryBatchId || stockedRows.every((r) => !values[r.tankId]?.feedKg)
          ? "En az bir havuz için ölüm veya yem miktarı girin."
          : "Yem girdiyseniz önce bir yem lotu seçin.",
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
            Bu bloktaki havuzlar için günlük ölüm ve yemlemeyi tek seferde girin. Boş bırakılan hücreler
            kaydedilmez.
          </DialogDescription>
        </DialogHeader>

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
              {stockedRows.map((row) => (
                <tr key={row.tankId}>
                  <td className="px-3 py-1.5">
                    <span className="font-mono font-medium">{row.tankCode}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {row.lotCode}
                      {row.multiBatch ? " (+diğer partiler)" : ""}
                    </span>
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
          {stockedRows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Bu blokta stoklu havuz yok.</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={onSubmit} disabled={submitting || stockedRows.length === 0}>
            {submitting ? "Kaydediliyor…" : "Hepsini kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
