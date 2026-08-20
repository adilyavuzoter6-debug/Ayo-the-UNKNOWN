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
import { useCreateTreatment } from "@/hooks/use-treatments";
import { ApiError } from "@/lib/api-error";
import type { BatchTankAllocation } from "@/lib/types";

const schema = z.object({
  batchId: z.string().min(1, "Bir parti seçin"),
  type: z.enum(["MEDICATION", "VACCINATION"]),
  productName: z.string().trim().min(1, "Ürün adı gerekli").max(200),
  dosage: z.string().optional(),
  withdrawalPeriodDays: z.coerce.number().int().positive().optional(),
  startedAt: z.string().min(1),
  endedAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

export function RecordTreatmentDialog({
  tankId,
  allocations,
}: {
  tankId: string;
  allocations: BatchTankAllocation[];
}) {
  const [open, setOpen] = React.useState(false);
  const createTreatment = useCreateTreatment(tankId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      batchId: "",
      type: "MEDICATION",
      productName: "",
      startedAt: new Date().toISOString().slice(0, 10),
    },
  });

  const type = useWatch({ control: form.control, name: "type" });

  async function onSubmit(values: FormValues) {
    try {
      await createTreatment.mutateAsync(values);
      toast.success(
        values.type === "VACCINATION" ? "Aşı kaydı eklendi." : "Tedavi kaydı eklendi.",
      );
      form.reset({
        batchId: "",
        type: "MEDICATION",
        productName: "",
        startedAt: new Date().toISOString().slice(0, 10),
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Kayıt eklenirken bir sorun oluştu.");
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
            <Syringe className="size-3.5" />
            Tedavi / Aşı
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tedavi / Aşı kaydı</DialogTitle>
          <DialogDescription>
            Arınma süresi girilirse, süre dolmadan bu parti hasat edilemez.
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
                        <SelectValue placeholder="Parti seçin" />
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
                          <SelectValue />
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
                      <Input type="number" min={1} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                    <Input placeholder="örn. 10 mg/kg biyokütle" {...field} />
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
                      <Input type="date" {...field} />
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
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createTreatment.isPending}>
                {createTreatment.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
