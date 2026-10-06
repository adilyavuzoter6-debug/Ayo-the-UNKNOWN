"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCY_SYMBOL, CurrencyToggle } from "@/components/shared/currency-toggle";
import { cn } from "@/lib/utils";
import { useUpdateStocking, type UpdateStockingInput } from "@/hooks/use-costs";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { ApiError } from "@/lib/api-error";
import type { ExchangeCurrency, FishBatch } from "@/lib/types";

type Choice = "NONE" | "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "NONE", label: "Bilinmiyor" },
  { value: "FINGERLINGS_PURCHASED", label: "Yavru" },
  { value: "EGGS_PURCHASED", label: "Yumurta (alım)" },
  { value: "EGGS_IN_HOUSE", label: "Yumurta (sağım)" },
];

/**
 * Corrects a batch's stocking source and price. Saving replaces the stocking cost entry; choosing
 * "Bilinmiyor" removes it. Refused by the server once the batch has been split or merged.
 */
export function EditStockingDialog({
  farmId,
  batch,
  open,
  onOpenChange,
}: {
  farmId: string;
  batch: FishBatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stoklama maliyeti — {batch.lotCode}</DialogTitle>
          <DialogDescription>
            Balıkların nereden geldiğini ve fiyatını düzeltin. Fiyatı kaldırırsanız stoklama gideri de silinir.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so its fields start from the batch's current values each time. */}
        <StockingEditor farmId={farmId} batch={batch} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function StockingEditor({ farmId, batch, onDone }: { farmId: string; batch: FishBatch; onDone: () => void }) {
  const updateStocking = useUpdateStocking(farmId);

  const [choice, setChoice] = React.useState<Choice>((batch.stockingSource ?? "NONE") as Choice);
  const [eggCount, setEggCount] = React.useState(batch.eggCount !== null ? String(batch.eggCount) : "");
  const [price, setPrice] = React.useState(
    batch.stockingUnitPrice !== null ? String(Number(batch.stockingUnitPrice)) : "",
  );
  const [currency, setCurrency] = React.useState<ExchangeCurrency>((batch.stockingCurrency ?? "TRY") as ExchangeCurrency);
  const [typedRate, setTypedRate] = React.useState<string | null>(
    batch.stockingExchangeRate !== null ? String(Number(batch.stockingExchangeRate)) : null,
  );

  // The Central Bank rate for the stocking day fills the rate until the user types one.
  const lookup = useExchangeRate(currency === "TRY" ? undefined : currency, batch.farmEntryDate.slice(0, 10));
  const rate = typedRate ?? (lookup.data ? String(lookup.data.rate) : "");

  const isEggs = choice === "EGGS_PURCHASED" || choice === "EGGS_IN_HOUSE";
  const unitWord = isEggs ? "yumurta" : "adet";

  async function onSave() {
    const input: UpdateStockingInput = {};
    if (choice !== "NONE") {
      input.stockingSource = choice;
      if (isEggs && eggCount.trim() !== "") input.eggCount = Number(eggCount);
      if (price.trim() !== "") {
        input.stockingUnitPrice = Number(price.replace(",", "."));
        input.stockingCurrency = currency;
        if (currency !== "TRY" && rate.trim() !== "") {
          input.stockingExchangeRate = Number(rate.replace(",", "."));
        }
      }
    }
    try {
      await updateStocking.mutateAsync({ batchId: batch.id, ...input });
      toast.success(choice === "NONE" ? "Stoklama maliyeti kaldırıldı." : "Stoklama maliyeti güncellendi.");
      onDone();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Stoklama maliyeti güncellenirken bir sorun oluştu.");
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Balıklar nereden geldi?</Label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setChoice(c.value)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  choice === c.value
                    ? "border-teal-500 bg-teal-500/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {isEggs ? (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Yumurta adedi</Label>
            <Input type="number" min={1} step={1} value={eggCount} onChange={(e) => setEggCount(e.target.value)} />
          </div>
        ) : null}

        {choice !== "NONE" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-[11px] text-muted-foreground">Maliyet para birimi</Label>
              <CurrencyToggle value={currency} onChange={setCurrency} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Birim fiyatı ({CURRENCY_SYMBOL[currency]}/{unitWord}
                  {choice === "EGGS_IN_HOUSE" ? ", opsiyonel" : ""})
                </Label>
                <Input type="number" min={0} step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              {currency !== "TRY" ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Kur (1 birim = ? ₺)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    value={rate}
                    onChange={(e) => setTypedRate(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <DialogFooter>
        <Button onClick={onSave} disabled={updateStocking.isPending}>
          {updateStocking.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </DialogFooter>
    </>
  );
}
