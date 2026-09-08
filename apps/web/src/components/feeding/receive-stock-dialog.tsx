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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFarms } from "@/hooks/use-farms";
import { useCreateWarehouse, useFarmWarehouses } from "@/hooks/use-warehouses";
import { useFeedProducts } from "@/hooks/use-feed-products";
import { useReceiveStock } from "@/hooks/use-feed-inventory";
import { ApiError } from "@/lib/api-error";

/** Remembered client-side only — a UX convenience so the rate doesn't need retyping every
 * purchase, not a source of truth for anything (no backend concept of an exchange rate exists;
 * every cost entry this app tracks is stored in TRY, so a dollar-priced purchase is converted
 * to TRY at entry time using whatever rate the user provides here). */
const USD_TRY_RATE_STORAGE_KEY = "aquai.usdTryRate";

const schema = z
  .object({
    farmId: z.string().min(1, "Bir çiftlik seçin"),
    warehouseId: z.string().min(1, "Bir depo seçin"),
    feedProductId: z.string().min(1, "Bir ürün seçin"),
    quantityKg: z.coerce.number().positive(),
    supplierLotCode: z.string().trim().max(60).optional(),
    expiryDate: z.string().optional(),
    unitCostCurrency: z.enum(["TRY", "USD"]),
    unitCostAmount: z.coerce.number().positive().optional(),
    exchangeRate: z.coerce.number().positive().optional(),
  })
  .superRefine((values, ctx) => {
    if (
      values.unitCostCurrency === "USD" &&
      values.unitCostAmount !== undefined &&
      !values.exchangeRate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dolar kuru gerekli",
        path: ["exchangeRate"],
      });
    }
  });
type FormValues = z.infer<typeof schema>;

export function ReceiveStockDialog() {
  const [open, setOpen] = React.useState(false);
  const [newWarehouseName, setNewWarehouseName] = React.useState("");
  const { data: farms } = useFarms();
  const { data: feedProducts } = useFeedProducts();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      farmId: "",
      warehouseId: "",
      feedProductId: "",
      quantityKg: undefined,
      supplierLotCode: "",
      expiryDate: "",
      unitCostCurrency: "TRY",
      unitCostAmount: undefined,
      exchangeRate: undefined,
    },
  });

  React.useEffect(() => {
    const stored = window.localStorage.getItem(USD_TRY_RATE_STORAGE_KEY);
    if (stored) {
      form.setValue("exchangeRate", Number(stored));
    }
    // Only on mount — a user-edited rate this session shouldn't be clobbered by a later re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const farmId = useWatch({ control: form.control, name: "farmId" });
  const warehouseId = useWatch({ control: form.control, name: "warehouseId" });
  const unitCostCurrency = useWatch({ control: form.control, name: "unitCostCurrency" });
  const unitCostAmount = useWatch({ control: form.control, name: "unitCostAmount" });
  const exchangeRate = useWatch({ control: form.control, name: "exchangeRate" });
  const { data: warehouses } = useFarmWarehouses(farmId);
  const createWarehouse = useCreateWarehouse(farmId);
  // useReceiveStock is bound to whichever warehouse is currently selected — re-renders (and
  // therefore rebinds) whenever `warehouseId` changes because it's watched above.
  const receiveStock = useReceiveStock(warehouseId || "");

  const convertedTryPerKg =
    unitCostCurrency === "USD" && unitCostAmount && exchangeRate
      ? unitCostAmount * exchangeRate
      : unitCostCurrency === "TRY"
        ? unitCostAmount
        : undefined;

  async function onAddWarehouse() {
    if (!newWarehouseName.trim() || !farmId) return;
    try {
      const warehouse = await createWarehouse.mutateAsync({ name: newWarehouseName.trim() });
      form.setValue("warehouseId", warehouse.id);
      setNewWarehouseName("");
      toast.success(`Depo "${warehouse.name}" eklendi.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Depo eklenirken bir sorun oluştu.");
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      const unitCostPerKg =
        values.unitCostAmount === undefined
          ? undefined
          : values.unitCostCurrency === "USD"
            ? values.unitCostAmount * values.exchangeRate!
            : values.unitCostAmount;

      await receiveStock.mutateAsync({
        feedProductId: values.feedProductId,
        quantityKg: values.quantityKg,
        supplierLotCode: values.supplierLotCode || undefined,
        expiryDate: values.expiryDate || undefined,
        unitCostPerKg,
      });

      if (values.unitCostCurrency === "USD" && values.exchangeRate) {
        window.localStorage.setItem(USD_TRY_RATE_STORAGE_KEY, String(values.exchangeRate));
      }

      toast.success("Stok alımı kaydedildi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Stok alımı sırasında bir sorun oluştu.");
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
            Stok al
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Stok al</DialogTitle>
          <DialogDescription>Bir depoya yeni bir yem teslimatı/lotu kaydedin.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="farmId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Çiftlik</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue("warehouseId", "");
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Çiftlik seçin">
                          {(v: string) => farms?.find((f) => f.id === v)?.name}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(farms ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {farmId ? (
              <>
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depo</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Depo seçin">
                              {(v: string) => warehouses?.find((w) => w.id === v)?.name}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(warehouses ?? []).map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Yeni depo adı (opsiyonel)"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!newWarehouseName.trim() || createWarehouse.isPending}
                    onClick={onAddWarehouse}
                  >
                    Ekle
                  </Button>
                </div>
              </>
            ) : null}

            <FormField
              control={form.control}
              name="feedProductId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Yem ürünü</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Ürün seçin">
                          {(v: string) => feedProducts?.find((p) => p.id === v)?.name}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(feedProducts ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
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
              name="quantityKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miktar (kg)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2.5 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <FormLabel>Birim maliyet (opsiyonel)</FormLabel>
                <div className="flex overflow-hidden rounded-md border border-border text-xs">
                  {(["TRY", "USD"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => form.setValue("unitCostCurrency", c)}
                      className={cn(
                        "px-2.5 py-1 font-medium transition-colors",
                        unitCostCurrency === c
                          ? "bg-teal-500 text-white"
                          : "bg-transparent text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {c === "TRY" ? "₺" : "$"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="unitCostAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] text-muted-foreground">
                        Tutar ({unitCostCurrency === "USD" ? "$" : "₺"}/kg)
                      </FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {unitCostCurrency === "USD" ? (
                  <FormField
                    control={form.control}
                    name="exchangeRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] text-muted-foreground">
                          Kur (1$ = ? ₺)
                        </FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>

              {unitCostCurrency === "USD" && convertedTryPerKg !== undefined ? (
                <p className="text-[11px] text-muted-foreground">
                  ≈ <span className="font-mono font-medium text-foreground">
                    {convertedTryPerKg.toLocaleString("tr", { maximumFractionDigits: 2 })} ₺/kg
                  </span>{" "}
                  olarak maliyete yansıyacak.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="supplierLotCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tedarikçi lot kodu</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>Son kullanma (opsiyonel)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={receiveStock.isPending}>
                {receiveStock.isPending ? "Kaydediliyor…" : "Stok al"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
