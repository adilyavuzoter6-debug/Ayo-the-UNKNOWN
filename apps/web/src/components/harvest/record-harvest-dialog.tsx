"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
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
import { useCreateHarvestRecord } from "@/hooks/use-harvest";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { CURRENCY_SYMBOL, CurrencyToggle } from "@/components/shared/currency-toggle";
import { ApiError } from "@/lib/api-error";
import type { BatchTankAllocation } from "@/lib/types";

const schema = z
  .object({
    batchId: z.string().min(1, "Bir parti seçin"),
    type: z.enum(["ACTUAL", "PLANNED"]),
    fullness: z.enum(["FULL", "PARTIAL"]),
    plannedDate: z.string().optional(),
    harvestedAt: z.string().optional(),
    fishCount: z.coerce.number().int().positive().optional(),
    avgWeightG: z.coerce.number().positive().optional(),
    sizeGrade: z.string().optional(),
    destination: z.string().optional(),
    customer: z.string().optional(),
    salePricePerKg: z.coerce.number().positive().optional(),
    saleCurrency: z.enum(["TRY", "USD", "EUR"]),
    saleExchangeRate: z.coerce.number().positive().optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.salePricePerKg !== undefined && values.saleCurrency !== "TRY" && values.saleExchangeRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dolar kuru gerekli (TCMB kuru alınamadıysa elle girin)",
        path: ["saleExchangeRate"],
      });
    }
  });
type FormValues = z.infer<typeof schema>;

export function RecordHarvestDialog({
  farmId,
  tankId,
  allocations,
}: {
  farmId: string;
  tankId: string;
  allocations: BatchTankAllocation[];
}) {
  const [open, setOpen] = React.useState(false);
  const createHarvest = useCreateHarvestRecord(farmId, tankId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      batchId: "",
      type: "ACTUAL",
      fullness: "FULL",
      harvestedAt: new Date().toISOString().slice(0, 10),
      plannedDate: new Date().toISOString().slice(0, 10),
      saleCurrency: "TRY",
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const fullness = useWatch({ control: form.control, name: "fullness" });
  const selectedBatchId = useWatch({ control: form.control, name: "batchId" });
  const harvestedAt = useWatch({ control: form.control, name: "harvestedAt" });
  const salePricePerKg = useWatch({ control: form.control, name: "salePricePerKg" });
  const saleCurrency = useWatch({ control: form.control, name: "saleCurrency" });
  const saleExchangeRate = useWatch({ control: form.control, name: "saleExchangeRate" });
  const liveCount = allocations.find((a) => a.batchId === selectedBatchId)?.estimatedCount;

  // The Central Bank rate for the harvest date pre-fills the sale rate; a typed rate is kept.
  const foreignRate = useExchangeRate(saleCurrency === "TRY" ? undefined : saleCurrency, harvestedAt);
  React.useEffect(() => {
    if (!foreignRate.data || saleCurrency === "TRY") return;
    if (!form.getFieldState("saleExchangeRate").isDirty) {
      form.setValue("saleExchangeRate", foreignRate.data.rate);
    }
  }, [foreignRate.data, saleCurrency, open, form]);
  const salePreviewTry =
    salePricePerKg !== undefined && saleCurrency === "TRY"
      ? salePricePerKg
      : salePricePerKg !== undefined && saleExchangeRate !== undefined
        ? salePricePerKg * saleExchangeRate
        : undefined;
  const rateIsCentralBank = foreignRate.data !== undefined && saleExchangeRate === foreignRate.data.rate;

  async function onSubmit(values: FormValues) {
    try {
      // Sale fields only mean something on an actual harvest with a price.
      const hasSale = values.type === "ACTUAL" && values.salePricePerKg !== undefined;
      await createHarvest.mutateAsync({
        ...values,
        salePricePerKg: hasSale ? values.salePricePerKg : undefined,
        saleCurrency: hasSale ? values.saleCurrency : undefined,
        saleExchangeRate: hasSale && values.saleCurrency !== "TRY" ? values.saleExchangeRate : undefined,
      });
      toast.success(values.type === "PLANNED" ? "Planlı hasat eklendi." : "Hasat kaydedildi.");
      form.reset({
        batchId: "",
        type: "ACTUAL",
        fullness: "FULL",
        harvestedAt: new Date().toISOString().slice(0, 10),
        plannedDate: new Date().toISOString().slice(0, 10),
        saleCurrency: "TRY",
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Hasat kaydedilirken bir sorun oluştu.");
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
          <Button variant="outline" size="sm">
            <Scissors className="size-3.5" />
            Hasat
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hasat kaydı</DialogTitle>
          <DialogDescription>
            Gerçekleşmiş bir hasadı kaydet (canlı stoktan düşülür) veya ileri bir tarih için planla.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="batchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parti</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Parti seçin">
                          {(v: string) => {
                            const a = allocations.find((x) => x.batchId === v);
                            return a
                              ? `${a.batch.lotCode} (${a.estimatedCount.toLocaleString("tr")} balık)`
                              : undefined;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allocations.map((a) => (
                        <SelectItem key={a.batchId} value={a.batchId}>
                          {a.batch.lotCode} ({a.estimatedCount.toLocaleString("tr")} balık)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tür</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v: string) => (v === "PLANNED" ? "Planlanan" : "Gerçekleşti")}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTUAL">Gerçekleşti</SelectItem>
                        <SelectItem value="PLANNED">Planlanan</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fullness"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kapsam</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v: string) => (v === "PARTIAL" ? "Kısmi" : "Tam")}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FULL">Tam</SelectItem>
                        <SelectItem value="PARTIAL">Kısmi</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {type === "PLANNED" ? (
              <FormField
                control={form.control}
                name="plannedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Planlanan tarih</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="fishCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Adet {fullness === "FULL" ? "(boş = tüm canlı stok)" : ""}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={liveCount}
                            step={1}
                            placeholder={
                              fullness === "FULL" && liveCount !== undefined
                                ? liveCount.toLocaleString("tr")
                                : undefined
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="harvestedAt"
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="sizeGrade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Boy sınıfı</FormLabel>
                        <FormControl>
                          <Input placeholder="örn. 2-3 kg" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sevkiyat yeri</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {type === "ACTUAL" ? (
              <div className="space-y-2.5 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Satış (opsiyonel)</FormLabel>
                  <div className="flex overflow-hidden rounded-md border border-border text-xs">
                    <CurrencyToggle value={saleCurrency} onChange={(c) => form.setValue("saleCurrency", c)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="salePricePerKg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] text-muted-foreground">
                          Fiyat ({CURRENCY_SYMBOL[saleCurrency]}/kg)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={field.value ?? ""}
                            // An emptied input means "no sale price", not 0 — keep it undefined.
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {saleCurrency !== "TRY" ? (
                    <FormField
                      control={form.control}
                      name="saleExchangeRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px] text-muted-foreground">Kur (1 birim = ? ₺)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              step="0.0001"
                              name={field.name}
                              ref={field.ref}
                              onBlur={field.onBlur}
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                </div>

                {salePreviewTry !== undefined ? (
                  <p className="text-[11px] text-muted-foreground">
                    ≈{" "}
                    <span className="font-mono font-medium text-foreground">
                      {salePreviewTry.toLocaleString("tr", { maximumFractionDigits: 2 })} ₺/kg
                    </span>{" "}
                    gelir olarak kaydedilecek
                    {saleCurrency !== "TRY" && rateIsCentralBank
                      ? ` (TCMB ${foreignRate.data?.bulletinDate} satış kuru)`
                      : ""}
                    .
                  </p>
                ) : null}
              </div>
            ) : null}

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
              <Button type="submit" disabled={createHarvest.isPending}>
                {createHarvest.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
