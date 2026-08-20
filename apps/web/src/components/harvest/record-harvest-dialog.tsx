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
import { ApiError } from "@/lib/api-error";
import type { BatchTankAllocation } from "@/lib/types";

const schema = z.object({
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
  notes: z.string().max(500).optional(),
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
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const fullness = useWatch({ control: form.control, name: "fullness" });
  const selectedBatchId = useWatch({ control: form.control, name: "batchId" });
  const liveCount = allocations.find((a) => a.batchId === selectedBatchId)?.estimatedCount;

  async function onSubmit(values: FormValues) {
    try {
      await createHarvest.mutateAsync(values);
      toast.success(values.type === "PLANNED" ? "Planlı hasat eklendi." : "Hasat kaydedildi.");
      form.reset({
        batchId: "",
        type: "ACTUAL",
        fullness: "FULL",
        harvestedAt: new Date().toISOString().slice(0, 10),
        plannedDate: new Date().toISOString().slice(0, 10),
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
                          <SelectValue />
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
