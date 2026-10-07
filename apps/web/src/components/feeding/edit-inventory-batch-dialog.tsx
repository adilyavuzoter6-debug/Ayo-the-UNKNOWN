"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CURRENCY_SYMBOL, CurrencyToggle } from "@/components/shared/currency-toggle";
import { useCreateAdjustment, useUpdateInventoryBatch } from "@/hooks/use-feed-inventory";
import { ApiError } from "@/lib/api-error";
import type { FeedInventoryBatch } from "@/lib/types";

const schema = z.object({
  adjustmentKg: z.coerce.number().optional(),
  adjustmentNote: z.string().trim().max(500).optional(),
  supplierLotCode: z.string().trim().max(60).optional(),
  expiryDate: z.string().optional(),
  unitCostCurrency: z.enum(["TRY", "USD", "EUR"]),
  unitCostAmount: z.coerce.number().positive().optional(),
  exchangeRate: z.coerce.number().positive().optional(),
});
type FormValues = z.infer<typeof schema>;

/**
 * One dialog for both ways a lot is corrected: a signed kg adjustment (its own transaction, kept in the
 * lot's history) and a correction to the lot's own details (code, dates, price — overwritten in place,
 * no history of its own). Either half can be left untouched.
 */
export function EditInventoryBatchDialog({ batch }: { batch: FeedInventoryBatch }) {
  const [open, setOpen] = React.useState(false);
  const balance = Number(batch.balance?.quantityOnHandKg ?? 0);
  const initial = (): FormValues => ({
    adjustmentKg: undefined,
    adjustmentNote: "",
    supplierLotCode: batch.supplierLotCode ?? "",
    expiryDate: batch.expiryDate ? batch.expiryDate.slice(0, 10) : "",
    unitCostCurrency: "TRY",
    unitCostAmount: batch.unitCostPerKg ? Number(batch.unitCostPerKg) : undefined,
    exchangeRate: undefined,
  });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial() });
  const unitCostCurrency = useWatch({ control: form.control, name: "unitCostCurrency" });
  const adjust = useCreateAdjustment(batch.id);
  const update = useUpdateInventoryBatch(batch.id);

  async function onSubmit(values: FormValues) {
    try {
      if (values.adjustmentKg) {
        await adjust.mutateAsync({ quantityKg: values.adjustmentKg, notes: values.adjustmentNote || undefined });
      }
      await update.mutateAsync({
        supplierLotCode: values.supplierLotCode || undefined,
        expiryDate: values.expiryDate || undefined,
        unitCostAmount: values.unitCostAmount,
        unitCostCurrency: values.unitCostAmount !== undefined ? values.unitCostCurrency : undefined,
        exchangeRate: values.unitCostAmount !== undefined ? values.exchangeRate : undefined,
      });
      toast.success("Lot düzeltildi.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Lot düzeltilemedi.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(initial());
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="ghost">Düzelt</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Lotu düzelt — {batch.feedProduct.name}</DialogTitle>
          <DialogDescription>Şu an {balance.toLocaleString("tr")} kg bakiyesi var.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2.5 rounded-md border border-border p-3">
              <FormLabel className="text-[11px] text-muted-foreground">
                Miktar düzeltmesi (kg, + ya da −)
              </FormLabel>
              <FormField
                control={form.control}
                name="adjustmentKg"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="Örn. -5 ya da 10" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="adjustmentNote"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder="Not (opsiyonel, örn. fiziksel sayım)" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="supplierLotCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lot kodu</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Son kullanma</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2.5 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <FormLabel className="text-[11px] text-muted-foreground">Birim fiyat (opsiyonel)</FormLabel>
                <CurrencyToggle value={unitCostCurrency} onChange={(c) => form.setValue("unitCostCurrency", c)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="unitCostAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] text-muted-foreground">
                        Tutar ({CURRENCY_SYMBOL[unitCostCurrency]}/kg)
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {unitCostCurrency !== "TRY" ? (
                  <FormField
                    control={form.control}
                    name="exchangeRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] text-muted-foreground">Kur (1 birim = ? ₺)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="boşsa TCMB kuru" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Girilirse lotun alım fiyatı ve otomatik yem gideri birlikte düzeltilir.
              </p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={adjust.isPending || update.isPending}>
                {adjust.isPending || update.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
