"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Syringe } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordTreatmentDialog } from "@/components/health/record-treatment-dialog";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import { useSupplyItems } from "@/hooks/use-supplies";
import { isMedicineCategory } from "@/components/stocks/supply-stock-section";
import { distributeFloat } from "@/lib/distribute";
import { tankLoad } from "@/lib/farm-production-summary";
import { cn } from "@/lib/utils";
import type { TankProductionRow } from "@/hooks/use-production-overview";
import type { TreatmentType } from "@/lib/types";

const NONE_ITEM = "__none__";

interface StockedRow {
  tankId: string;
  tankCode: string;
  batchId: string;
  lotCode: string;
  multiBatch: boolean;
  biomassKg: number;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Block-level "İlaç gir": two modes, mirroring BlockDailyEntryDialog. "Havuz havuz" keeps the
 * original pick-a-pond-then-open-RecordTreatmentDialog shortcut. "Blok toplamı" applies the same
 * treatment to every stocked pond in the block at once — one Treatment row per pond, with a total
 * dose (when drawn from stock) split across ponds by biomass share, same as block feeding.
 */
export function BlockTreatmentDialog({ farmId, rows }: { farmId: string; rows: TankProductionRow[] }) {
  const [mode, setMode] = React.useState<"perPond" | "total">("perPond");
  const [open, setOpen] = React.useState(false);
  const [tankId, setTankId] = React.useState("");

  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const { data: supplyItems } = useSupplyItems();
  const medicineItems = (supplyItems ?? []).filter((i) => isMedicineCategory(i.category));

  const stockedForPicker = rows.filter((r) => r.allocations.length > 0);
  const selected = stockedForPicker.find((r) => r.tank.id === tankId);

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
        biomassKg: load.biomassKg,
      };
    });

  const [type, setType] = React.useState<TreatmentType>("MEDICATION");
  const [productName, setProductName] = React.useState("");
  const [dosage, setDosage] = React.useState("");
  const [withdrawalDays, setWithdrawalDays] = React.useState("");
  const [medicineItemId, setMedicineItemId] = React.useState("");
  const [totalDoseLiters, setTotalDoseLiters] = React.useState("");
  const [startedAt, setStartedAt] = React.useState(todayIso());
  const [endedAt, setEndedAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const selectedItem = medicineItems.find((i) => i.id === medicineItemId);
  const selectedItemFarmBalance = selectedItem?.balances.find((b) => b.farmIds.includes(farmId))?.quantity ?? 0;

  const totalDoseLitersNum = totalDoseLiters ? Number(totalDoseLiters) : 0;
  const doseSplit = distributeFloat(
    totalDoseLitersNum,
    stockedRows.map((r) => r.biomassKg),
  );

  function resetAndClose() {
    setType("MEDICATION");
    setProductName("");
    setDosage("");
    setWithdrawalDays("");
    setMedicineItemId("");
    setTotalDoseLiters("");
    setStartedAt(todayIso());
    setEndedAt("");
    setNotes("");
    setMode("perPond");
    setOpen(false);
  }

  async function onSubmitTotal() {
    if (!productName.trim()) {
      toast.error("İlaç/aşı adını girin.");
      return;
    }
    if (stockedRows.length === 0) {
      toast.error("Bu blokta stoklu havuz yok.");
      return;
    }

    setSubmitting(true);
    // Sequential, not Promise.all — every row here can draw from the same medicine stock, and
    // the API checks that balance by reading then writing, not inside a locked transaction.
    // Firing the whole block concurrently would let several requests see the same
    // pre-deduction balance and collectively overdraw it.
    const results: PromiseSettledResult<unknown>[] = [];
    for (let i = 0; i < stockedRows.length; i++) {
      const row = stockedRows[i]!;
      const liters = doseSplit[i] ?? 0;
      const useStock = medicineItemId && liters > 0;
      try {
        const value = await api.post(`/tanks/${row.tankId}/treatments`, {
          batchId: row.batchId,
          type,
          productName: productName.trim(),
          dosage: dosage.trim() || undefined,
          withdrawalPeriodDays: withdrawalDays ? Number(withdrawalDays) : undefined,
          startedAt,
          endedAt: endedAt || undefined,
          notes: notes.trim() || undefined,
          medicineItemId: useStock ? medicineItemId : undefined,
          doseLiters: useStock ? liters : undefined,
        });
        results.push({ status: "fulfilled", value });
      } catch (error) {
        results.push({ status: "rejected", reason: error });
      }
    }
    setSubmitting(false);

    for (const row of stockedRows) {
      queryClient.invalidateQueries({ queryKey: ["treatments", companyId, row.tankId] });
    }
    queryClient.invalidateQueries({ queryKey: ["supply-items", companyId] });
    queryClient.invalidateQueries({ queryKey: ["fish-batches"] });

    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    if (failed === 0) {
      toast.success(`${succeeded} havuza kayıt eklendi.`);
      resetAndClose();
    } else {
      toast.error(`${succeeded} havuza eklendi, ${failed} havuzda başarısız oldu.`);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <Syringe className="size-3.5" />
              Tedavi / İlaç gir
            </Button>
          }
        />
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tedavi / İlaç gir</DialogTitle>
            <DialogDescription>
              {mode === "perPond"
                ? "Tedavi veya ilaç kaydı eklenecek havuzu seçin."
                : "Bu bloktaki tüm stoklu havuzlara aynı tedaviyi tek seferde kaydedin."}
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

          {mode === "perPond" ? (
            stockedForPicker.length > 0 ? (
              <Select
                value={tankId}
                onValueChange={(v) => {
                  setTankId(v ?? "");
                  setOpen(false);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Havuz seçin">
                    {(v: string) => stockedForPicker.find((r) => r.tank.id === v)?.tank.code}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stockedForPicker.map((r) => (
                    <SelectItem key={r.tank.id} value={r.tank.id}>
                      {r.tank.code} — {r.allocations[0]!.batch.lotCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">Bu blokta stoklu havuz yok.</p>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tür</Label>
                  <Select value={type} onValueChange={(v) => setType((v ?? "MEDICATION") as TreatmentType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: TreatmentType) => (v === "VACCINATION" ? "Aşı" : "İlaç tedavisi")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEDICATION">İlaç tedavisi</SelectItem>
                      <SelectItem value="VACCINATION">Aşı</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Arınma süresi (gün, opsiyonel)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={withdrawalDays}
                    onChange={(e) => setWithdrawalDays(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{type === "VACCINATION" ? "Aşı adı" : "İlaç adı"}</Label>
                <Input
                  placeholder="örn. Florfenicol %20"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Doz (opsiyonel)</Label>
                <Input
                  placeholder="örn. 10 mg/kg canlı ağırlık/gün"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                />
              </div>

              {type === "MEDICATION" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Stoktan düş (opsiyonel)</Label>
                    <Select
                      value={medicineItemId || NONE_ITEM}
                      onValueChange={(v) => setMedicineItemId(v === NONE_ITEM ? "" : (v ?? ""))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Stok takibi yapma">
                          {(v: string) => (v === NONE_ITEM ? "Stok takibi yapma" : medicineItems.find((i) => i.id === v)?.name)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_ITEM}>Stok takibi yapma</SelectItem>
                        {medicineItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {medicineItems.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        Henüz bir ilaç ürünü yok — Stoklar sayfasından ekleyebilirsiniz.
                      </p>
                    ) : null}
                  </div>
                  {medicineItemId ? (
                    <div className="space-y-1.5">
                      <Label>Toplam miktar ({selectedItem?.unit ?? "litre"})</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={totalDoseLiters}
                        onChange={(e) => setTotalDoseLiters(e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Stokta: {selectedItemFarmBalance.toLocaleString("tr")} {selectedItem?.unit}. Havuzlara
                        biyokütleye oranlı dağıtılır.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Başlangıç</Label>
                  <Input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bitiş (opsiyonel)</Label>
                  <Input type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Not (opsiyonel)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Havuz</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Miktar ({selectedItem?.unit ?? "litre"})
                      </th>
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
                        <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                          {medicineItemId && (doseSplit[i] ?? 0) > 0 ? doseSplit[i]!.toLocaleString("tr") : "—"}
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
                <Button onClick={onSubmitTotal} disabled={submitting || stockedRows.length === 0}>
                  {submitting ? "Kaydediliyor…" : "Hepsine kaydet"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {selected ? (
        <RecordTreatmentDialog
          farmId={farmId}
          tankId={selected.tank.id}
          allocations={selected.allocations}
          open
          onOpenChange={(open) => {
            if (!open) setTankId("");
          }}
        />
      ) : null}
    </>
  );
}
