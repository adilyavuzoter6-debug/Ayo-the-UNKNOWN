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
import { CURRENCY_SYMBOL, CurrencyToggle } from "@/components/shared/currency-toggle";
import { cn } from "@/lib/utils";
import { useCreateFishBatch } from "@/hooks/use-fish-batches";
import { useCreateFishSpecies, useFishSpecies } from "@/hooks/use-fish-species";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { ApiError } from "@/lib/api-error";

type StockingChoice = "NONE" | "FINGERLINGS_PURCHASED" | "EGGS_PURCHASED" | "EGGS_IN_HOUSE";

const STOCKING_CHOICES: { value: StockingChoice; label: string }[] = [
  { value: "NONE", label: "Bilinmiyor" },
  { value: "FINGERLINGS_PURCHASED", label: "Yavru" },
  { value: "EGGS_PURCHASED", label: "Yumurta (alım)" },
  { value: "EGGS_IN_HOUSE", label: "Yumurta (sağım)" },
];

const toNumber = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));

// Price and egg count stay as text until submit: an emptied optional field must mean "not given",
// not 0, which z.coerce would turn it into.
const schema = z
  .object({
    speciesId: z.string().min(1, "Bir tür seçin"),
    lotCode: z.string().trim().min(1).max(40),
    fishCount: z.coerce.number().int().positive(),
    avgWeightG: z.coerce.number().positive(),
    farmEntryDate: z.string().min(1),
    stockingSource: z.enum(["NONE", "FINGERLINGS_PURCHASED", "EGGS_PURCHASED", "EGGS_IN_HOUSE"]),
    eggCount: z.string(),
    stockingUnitPrice: z.string(),
    stockingCurrency: z.enum(["TRY", "USD", "EUR"]),
    stockingExchangeRate: z.string(),
  })
  .superRefine((v, ctx) => {
    const price = toNumber(v.stockingUnitPrice);
    const eggs = toNumber(v.eggCount);
    const add = (path: keyof typeof v, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });

    if (v.stockingSource === "NONE") {
      if (price !== undefined) add("stockingUnitPrice", "Fiyat için önce yavru mu yumurta mı seçin");
      return;
    }
    if (v.stockingSource === "FINGERLINGS_PURCHASED" && (price === undefined || price <= 0)) {
      add("stockingUnitPrice", "Yavru adet fiyatını girin");
    }
    if (v.stockingSource === "EGGS_PURCHASED" && (price === undefined || price <= 0)) {
      add("stockingUnitPrice", "Yumurta adet fiyatını girin");
    }
    if (v.stockingSource !== "FINGERLINGS_PURCHASED" && (eggs === undefined || !Number.isInteger(eggs) || eggs <= 0)) {
      add("eggCount", "Yumurta adedini girin");
    }
    if (v.stockingSource === "FINGERLINGS_PURCHASED" && v.eggCount.trim() !== "") {
      add("eggCount", "Yavru alımında yumurta adedi girilmez");
    }
  });
type FormValues = z.infer<typeof schema>;

const todayIso = () => new Date().toISOString().slice(0, 10);

export function CreateFishBatchDialog({ farmId, tankId }: { farmId: string; tankId: string }) {
  const [open, setOpen] = React.useState(false);
  const [newSpeciesName, setNewSpeciesName] = React.useState("");
  const { data: species } = useFishSpecies();
  const createSpecies = useCreateFishSpecies();
  const createBatch = useCreateFishBatch(farmId, tankId);

  const defaults = (): FormValues => ({
    speciesId: "",
    lotCode: "",
    fishCount: undefined as unknown as number,
    avgWeightG: undefined as unknown as number,
    farmEntryDate: todayIso(),
    stockingSource: "NONE",
    eggCount: "",
    stockingUnitPrice: "",
    stockingCurrency: "TRY",
    stockingExchangeRate: "",
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });

  const source = useWatch({ control: form.control, name: "stockingSource" });
  const currency = useWatch({ control: form.control, name: "stockingCurrency" });
  const unitPrice = useWatch({ control: form.control, name: "stockingUnitPrice" });
  const eggCount = useWatch({ control: form.control, name: "eggCount" });
  const rate = useWatch({ control: form.control, name: "stockingExchangeRate" });
  const fishCount = useWatch({ control: form.control, name: "fishCount" });
  const farmEntryDate = useWatch({ control: form.control, name: "farmEntryDate" });

  // The Central Bank rate for the entry date pre-fills the rate; a typed rate is never overwritten.
  const foreignRate = useExchangeRate(currency === "TRY" ? undefined : currency, farmEntryDate);
  React.useEffect(() => {
    if (!foreignRate.data || currency === "TRY") return;
    if (!form.getFieldState("stockingExchangeRate").isDirty) {
      form.setValue("stockingExchangeRate", String(foreignRate.data.rate));
    }
  }, [foreignRate.data, currency, open, form]);

  const isEggs = source === "EGGS_PURCHASED" || source === "EGGS_IN_HOUSE";
  const priceLabel = source === "FINGERLINGS_PURCHASED" ? "Adet fiyatı" : isEggs ? "Yumurta adet fiyatı" : "Adet fiyatı";
  const countForPrice =
    source === "FINGERLINGS_PURCHASED" ? toNumber(String(fishCount ?? "")) : isEggs ? toNumber(eggCount) : undefined;
  const priceNumber = toNumber(unitPrice);
  const rateNumber = toNumber(rate);
  const totalNative =
    countForPrice !== undefined && priceNumber !== undefined ? countForPrice * priceNumber : undefined;
  const totalTry =
    totalNative !== undefined && currency !== "TRY"
      ? rateNumber !== undefined
        ? totalNative * rateNumber
        : undefined
      : totalNative;
  const rateIsCentralBank = foreignRate.data !== undefined && rateNumber === foreignRate.data.rate;

  async function onAddSpecies() {
    if (!newSpeciesName.trim()) return;
    try {
      const created = await createSpecies.mutateAsync({ name: newSpeciesName.trim() });
      form.setValue("speciesId", created.id);
      setNewSpeciesName("");
      toast.success(`Tür "${created.name}" eklendi.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Tür eklenirken bir sorun oluştu.");
    }
  }

  async function onSubmit(values: FormValues) {
    const stockingSource = values.stockingSource === "NONE" ? undefined : values.stockingSource;
    const price = stockingSource ? toNumber(values.stockingUnitPrice) : undefined;
    const hasPrice = price !== undefined;
    try {
      await createBatch.mutateAsync({
        speciesId: values.speciesId,
        lotCode: values.lotCode,
        tankId,
        fishCount: values.fishCount,
        avgWeightG: values.avgWeightG,
        farmEntryDate: values.farmEntryDate,
        stockingSource,
        eggCount:
          stockingSource === "EGGS_PURCHASED" || stockingSource === "EGGS_IN_HOUSE"
            ? toNumber(values.eggCount)
            : undefined,
        stockingUnitPrice: hasPrice ? price : undefined,
        stockingCurrency: hasPrice ? values.stockingCurrency : undefined,
        stockingExchangeRate:
          hasPrice && values.stockingCurrency !== "TRY" ? toNumber(values.stockingExchangeRate) : undefined,
      });
      toast.success(hasPrice ? "Stoklama ve maliyeti kaydedildi." : "Stoklama kaydedildi.");
      form.reset(defaults());
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Stoklama kaydedilirken bir sorun oluştu.");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(defaults());
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" />
            Stoklama ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni stoklama</DialogTitle>
          <DialogDescription>
            Bu havuza yeni bir balık partisi (batch) stokla. Fiyat girerseniz stoklama maliyeti otomatik gider olarak
            kaydedilir.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="speciesId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tür</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Tür seçin">
                          {(v: string) => {
                            const s = species?.find((x) => x.id === v);
                            return s ? `${s.name}${s.strain ? ` (${s.strain})` : ""}` : undefined;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {species?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.strain ? ` (${s.strain})` : ""}
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
                placeholder="Yeni tür adı (opsiyonel)"
                value={newSpeciesName}
                onChange={(e) => setNewSpeciesName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newSpeciesName.trim() || createSpecies.isPending}
                onClick={onAddSpecies}
              >
                Ekle
              </Button>
            </div>

            <FormField
              control={form.control}
              name="lotCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lot kodu</FormLabel>
                  <FormControl>
                    <Input placeholder="LOT-2026-00125" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="fishCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adet</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step={1} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="avgWeightG"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ort. ağırlık (g)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="farmEntryDate"
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

            <div className="space-y-3 rounded-md border border-border p-3">
              <FormField
                control={form.control}
                name="stockingSource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Balıklar nereden geldi?</FormLabel>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {STOCKING_CHOICES.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          onClick={() => field.onChange(choice.value)}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                            field.value === choice.value
                              ? "border-teal-500 bg-teal-500/10 text-foreground"
                              : "border-border text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {source !== "NONE" ? (
                <>
                  {isEggs ? (
                    <FormField
                      control={form.control}
                      name="eggCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px] text-muted-foreground">
                            Yumurta adedi
                          </FormLabel>
                          <FormControl>
                            <Input type="number" min={1} step={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}

                  <div className="flex items-center justify-between gap-3">
                    <FormLabel className="text-[11px] text-muted-foreground">Maliyet para birimi</FormLabel>
                    <CurrencyToggle
                      value={currency}
                      onChange={(c) => form.setValue("stockingCurrency", c)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="stockingUnitPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px] text-muted-foreground">
                            {priceLabel} ({CURRENCY_SYMBOL[currency]}{source === "EGGS_IN_HOUSE" ? ", opsiyonel" : ""})
                          </FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step="0.0001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {currency !== "TRY" ? (
                      <FormField
                        control={form.control}
                        name="stockingExchangeRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[11px] text-muted-foreground">
                              Kur (1 birim = ? ₺)
                            </FormLabel>
                            <FormControl>
                              <Input type="number" min={0} step="0.0001" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                  </div>

                  {totalNative !== undefined ? (
                    <p className="text-[11px] text-muted-foreground">
                      Toplam{" "}
                      <span className="font-mono font-medium text-foreground">
                        {totalNative.toLocaleString("tr", { maximumFractionDigits: 2 })} {CURRENCY_SYMBOL[currency]}
                      </span>
                      {totalTry !== undefined && currency !== "TRY" ? (
                        <>
                          {" "}≈{" "}
                          <span className="font-mono font-medium text-foreground">
                            {totalTry.toLocaleString("tr", { maximumFractionDigits: 2 })} ₺
                          </span>
                        </>
                      ) : null}
                      {currency !== "TRY" && rateIsCentralBank
                        ? ` (TCMB ${foreignRate.data?.bulletinDate} satış kuru)`
                        : ""}
                      . Stoklama tarihinde gider olarak kaydedilir.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={createBatch.isPending}>
                {createBatch.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
