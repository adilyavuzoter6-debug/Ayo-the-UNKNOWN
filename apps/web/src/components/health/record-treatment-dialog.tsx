"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Syringe } from "lucide-react";
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
import { useCreateTreatment, useUpdateTreatment } from "@/hooks/use-treatments";
import { ApiError } from "@/lib/api-error";
import type { BatchTankAllocation, Treatment } from "@/lib/types";

/**
 * Pre-fills the product name only — withdrawal period is left for the user to enter from the
 * actual product label, since the real number depends on formulation, water temperature, and
 * the country's regulatory approval, and getting it wrong is a food-safety issue. `withdrawalHint`
 * is shown as reference text next to the field, never written into it.
 */
interface TreatmentPreset {
  productName: string;
  dosageHint?: string;
  withdrawalHint: string;
}

const MEDICATION_PRESETS: TreatmentPreset[] = [
  {
    productName: "Florfenicol %20 (premiks)",
    dosageHint: "örn. 10 mg/kg canlı ağırlık/gün, 10 gün",
    withdrawalHint: "Yaygın referans ~15 gün — suya ve ürün etiketine göre değişir.",
  },
  {
    productName: "Oksitetrasiklin HCl",
    dosageHint: "örn. 55-83 mg/kg canlı ağırlık/gün",
    withdrawalHint: "Yaygın referans 21-30 gün — suya ve ürün etiketine göre değişir.",
  },
  {
    productName: "Sülfadiazin-Trimetoprim",
    dosageHint: "örn. 30 mg/kg canlı ağırlık/gün",
    withdrawalHint: "Genelde derece-gün bazlı hesaplanır — ürün etiketini kontrol edin.",
  },
];

const VACCINATION_PRESETS: TreatmentPreset[] = [
  { productName: "Yersinia ruckeri (ERM) aşısı", withdrawalHint: "Genelde arınma süresi gerekmez." },
  { productName: "Vibriosis aşısı", withdrawalHint: "Genelde arınma süresi gerekmez." },
];

const schema = z.object({
  batchId: z.string(),
  type: z.enum(["MEDICATION", "VACCINATION"]),
  productName: z.string().trim().min(1, "Ürün adı gerekli").max(200),
  dosage: z.string().optional(),
  withdrawalPeriodDays: z.coerce.number().int().positive().optional(),
  startedAt: z.string().min(1),
  endedAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

const todayIso = () => new Date().toISOString().slice(0, 10);

function valuesFor(treatment: Treatment | undefined): FormValues {
  if (!treatment) {
    return { batchId: "", type: "MEDICATION", productName: "", startedAt: todayIso() };
  }
  return {
    batchId: treatment.batchId,
    type: treatment.type,
    productName: treatment.productName,
    dosage: treatment.dosage ?? "",
    withdrawalPeriodDays: treatment.withdrawalPeriodDays ?? undefined,
    startedAt: treatment.startedAt.slice(0, 10),
    endedAt: treatment.endedAt ? treatment.endedAt.slice(0, 10) : "",
    notes: treatment.notes ?? "",
  };
}

/**
 * Records a treatment or vaccination, or corrects one when `treatment` is given. Corrections don't
 * change the batch: the treatment stays with the batch it was given to.
 */
export function RecordTreatmentDialog({
  tankId,
  allocations,
  treatment,
  open: controlledOpen,
  onOpenChange,
}: {
  tankId: string;
  allocations: BatchTankAllocation[];
  treatment?: Treatment;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const createTreatment = useCreateTreatment(tankId);
  const updateTreatment = useUpdateTreatment(tankId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesFor(treatment),
  });

  const type = useWatch({ control: form.control, name: "type" });
  const presets = type === "VACCINATION" ? VACCINATION_PRESETS : MEDICATION_PRESETS;
  const [selectedPresetName, setSelectedPresetName] = React.useState("");
  const selectedPreset = presets.find((p) => p.productName === selectedPresetName);

  function applyPreset(productName: string) {
    setSelectedPresetName(productName);
    const preset = presets.find((p) => p.productName === productName);
    if (preset) {
      form.setValue("productName", preset.productName);
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      if (treatment) {
        await updateTreatment.mutateAsync({
          id: treatment.id,
          type: values.type,
          productName: values.productName,
          dosage: values.dosage ? values.dosage : null,
          withdrawalPeriodDays: values.withdrawalPeriodDays ?? null,
          startedAt: values.startedAt,
          endedAt: values.endedAt ? values.endedAt : null,
          notes: values.notes ? values.notes : null,
        });
        toast.success("Kayıt güncellendi.");
      } else {
        await createTreatment.mutateAsync(values);
        toast.success(
          values.type === "VACCINATION" ? "Aşı kaydı eklendi." : "Tedavi kaydı eklendi.",
        );
        form.reset(valuesFor(undefined));
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Kayıt kaydedilirken bir sorun oluştu.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(valuesFor(treatment));
      }}
    >
      {treatment ? null : (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <Syringe className="size-3.5" />
              Tedavi / Aşı
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{treatment ? "Tedavi / Aşı kaydını düzenle" : "Tedavi / Aşı kaydı"}</DialogTitle>
          <DialogDescription>
            Arınma süresi girilirse, süre dolmadan bu parti hasat edilemez.
            {treatment ? " Düzeltmeden sonra hasat kontrolü yeni süreye göre yapılır." : ""}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {treatment ? null : (
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
            )}

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
                            {(v: string) => (v === "VACCINATION" ? "Aşı" : "İlaç tedavisi")}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MEDICATION">İlaç tedavisi</SelectItem>
                        <SelectItem value="VACCINATION">Aşı</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="withdrawalPeriodDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arınma süresi (gün)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step={1} {...field} value={field.value ?? ""} />
                    </FormControl>
                    {selectedPreset ? (
                      <p className="text-[11px] text-muted-foreground">{selectedPreset.withdrawalHint}</p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Ön ayar (opsiyonel)</FormLabel>
              <Select value={selectedPresetName} onValueChange={(v) => applyPreset(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Yaygın bir ürün seçin veya elle girin">
                    {(v: string) => presets.find((p) => p.productName === v)?.productName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.productName} value={p.productName}>
                      {p.productName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>

            <FormField
              control={form.control}
              name="productName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{type === "VACCINATION" ? "Aşı adı" : "İlaç adı"}</FormLabel>
                  <FormControl>
                    <Input placeholder="örn. Florfenicol %20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dosage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Doz (opsiyonel)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={selectedPreset?.dosageHint ?? "örn. 10 mg/kg biyokütle"}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Başlangıç</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bitiş (opsiyonel)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Not (opsiyonel)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createTreatment.isPending || updateTreatment.isPending}>
                {createTreatment.isPending || updateTreatment.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
