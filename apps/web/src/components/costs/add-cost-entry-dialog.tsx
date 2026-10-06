"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCY_SYMBOL, CurrencyToggle } from "@/components/shared/currency-toggle";
import { useCreateCostEntry } from "@/hooks/use-costs";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { ApiError } from "@/lib/api-error";
import { COST_CATEGORIES, COST_CATEGORY_LABEL } from "@/lib/costs";
import type { CostCategory, ExchangeCurrency, FishBatch } from "@/lib/types";

const schema = z
  .object({
    category: z.string().min(1, "Bir kategori seçin"),
    amount: z.coerce.number().positive("Tutar 0'dan büyük olmalı"),
    currency: z.enum(["TRY", "USD", "EUR"]),
    exchangeRate: z.coerce.number().positive("Kur 0'dan büyük olmalı").optional(),
    batchId: z.string().optional(),
    incurredAt: z.string().min(1),
    notes: z.string().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.currency !== "TRY" && values.exchangeRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kur gerekli (TCMB kuru alınamadıysa elle girin)",
        path: ["exchangeRate"],
      });
    }
  });
type FormValues = z.infer<typeof schema>;

const todayIso = () => new Date().toISOString().slice(0, 10);

export function AddCostEntryDialog({ farmId, batches }: { farmId: string; batches: FishBatch[] }) {
  const [open, setOpen] = React.useState(false);
  const createCostEntry = useCreateCostEntry(farmId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: "LABOR",
      currency: "TRY",
      incurredAt: todayIso(),
    },
  });

  const currency = useWatch({ control: form.control, name: "currency" });
  const amount = useWatch({ control: form.control, name: "amount" });
  const exchangeRate = useWatch({ control: form.control, name: "exchangeRate" });
  const incurredAt = useWatch({ control: form.control, name: "incurredAt" });

  // The Central Bank rate for the incurred date pre-fills the rate field; a rate the user typed
  // themselves is never overwritten.
  const foreignRate = useExchangeRate(currency === "TRY" ? undefined : currency, incurredAt);
  React.useEffect(() => {
    if (!foreignRate.data || currency === "TRY") return;
    if (!form.getFieldState("exchangeRate").isDirty) {
      form.setValue("exchangeRate", foreignRate.data.rate);
    }
  }, [foreignRate.data, currency, open, form]);

  const tryPreview =
    currency !== "TRY" && amount && exchangeRate ? amount * exchangeRate : currency === "TRY" ? amount : undefined;
  const rateIsCentralBank = foreignRate.data !== undefined && exchangeRate === foreignRate.data.rate;

  async function onSubmit(values: FormValues) {
    try {
      await createCostEntry.mutateAsync({
        category: values.category as CostCategory,
        amount: values.amount,
        currency: values.currency as ExchangeCurrency,
        exchangeRate: values.currency === "TRY" ? undefined : values.exchangeRate,
        batchId: values.batchId || undefined,
        incurredAt: values.incurredAt,
        notes: values.notes,
      });
      toast.success("Maliyet kaydedildi.");
      form.reset({ category: "LABOR", currency: "TRY", incurredAt: todayIso() });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Maliyet kaydedilirken bir sorun oluştu.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-3.5" />
            Maliyet ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Maliyet ekle</DialogTitle>
          <DialogDescription>Bu çiftlik için manuel bir gider kaydı.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v: CostCategory) => COST_CATEGORY_LABEL[v]}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COST_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {COST_CATEGORY_LABEL[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tutar ({CURRENCY_SYMBOL[currency]})</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <FormLabel>Para birimi</FormLabel>
              <CurrencyToggle
                value={currency}
                onChange={(c) => form.setValue("currency", c)}
              />
            </div>

            {currency !== "TRY" ? (
              <div className="space-y-1.5">
                <FormField
                  control={form.control}
                  name="exchangeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] text-muted-foreground">
                        Kur (1{CURRENCY_SYMBOL[currency]} = ? ₺)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.0001"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {tryPreview !== undefined ? (
                  <p className="text-[11px] text-muted-foreground">
                    ≈{" "}
                    <span className="font-mono font-medium text-foreground">
                      {tryPreview.toLocaleString("tr", { maximumFractionDigits: 2 })} ₺
                    </span>{" "}
                    olarak kaydedilecek
                    {rateIsCentralBank ? ` (TCMB ${foreignRate.data?.bulletinDate} satış kuru)` : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="batchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parti (opsiyonel)</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Genel çiftlik gideri">
                          {(v: string) => batches.find((b) => b.id === v)?.lotCode}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.lotCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="incurredAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tarih</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Not (opsiyonel)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createCostEntry.isPending}>
                {createCostEntry.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
