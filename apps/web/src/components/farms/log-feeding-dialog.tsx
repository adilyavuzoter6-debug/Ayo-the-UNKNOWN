"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Wheat } from "lucide-react";
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
import { useLogFeeding } from "@/hooks/use-feeding-events";
import { useInventoryBatches } from "@/hooks/use-feed-inventory";
import { useTankWaterQualityReadings } from "@/hooks/use-water-quality";
import { ApiError } from "@/lib/api-error";
import { estimateFeedingRate } from "@/lib/feeding-calculator";
import type { BatchTankAllocation } from "@/lib/types";

const schema = z.object({
  batchId: z.string().min(1, "Bir parti seçin"),
  feedInventoryBatchId: z.string().min(1, "Bir yem lotu seçin"),
  quantityKg: z.coerce.number().positive(),
  occurredAt: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function LogFeedingDialog({
  farmId,
  tankId,
  allocations,
}: {
  farmId: string;
  tankId: string;
  allocations: BatchTankAllocation[];
}) {
  const [open, setOpen] = React.useState(false);
  const { data: inventoryBatches } = useInventoryBatches();
  const { data: readings } = useTankWaterQualityReadings(tankId);
  const logFeeding = useLogFeeding(farmId, tankId);

  const availableLots = (inventoryBatches ?? []).filter(
    (b) => b.warehouse.farmId === farmId && Number(b.balance?.quantityOnHandKg ?? 0) > 0,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      batchId: "",
      feedInventoryBatchId: "",
      quantityKg: undefined,
      occurredAt: new Date().toISOString().slice(0, 10),
    },
  });

  const selectedBatchId = useWatch({ control: form.control, name: "batchId" });
  const selectedAllocation = allocations.find((a) => a.batchId === selectedBatchId);
  const latestTempC = readings?.[0]?.temperatureC !== undefined && readings?.[0]?.temperatureC !== null
    ? Number(readings[0].temperatureC)
    : null;
  const feedingEstimate = selectedAllocation
    ? estimateFeedingRate(
        Number(
          selectedAllocation.batch.currentState?.estimatedAvgWeightG ??
            selectedAllocation.batch.initialAvgWeightG,
        ),
        (selectedAllocation.estimatedCount *
          Number(
            selectedAllocation.batch.currentState?.estimatedAvgWeightG ??
              selectedAllocation.batch.initialAvgWeightG,
          )) /
          1000,
        latestTempC,
      )
    : null;

  async function onSubmit(values: FormValues) {
    try {
      await logFeeding.mutateAsync(values);
      toast.success("Yemleme kaydedildi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Yemleme kaydedilirken bir sorun oluştu.");
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
            <Wheat className="size-3.5" />
            Yem ver
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Yem ver</DialogTitle>
          <DialogDescription>Bu havuzdaki bir partiye yem envanterinden yemleme kaydedin.</DialogDescription>
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

            <FormField
              control={form.control}
              name="feedInventoryBatchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Yem lotu</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Yem lotu seçin">
                          {(v: string) => {
                            const b = availableLots.find((x) => x.id === v);
                            return b
                              ? `${b.feedProduct.name} — ${Number(b.balance?.quantityOnHandKg ?? 0).toLocaleString("tr")} kg`
                              : undefined;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableLots.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.feedProduct.name} — {Number(b.balance?.quantityOnHandKg ?? 0).toLocaleString("tr")} kg
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableLots.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Bu çiftlikte stokta yem yok — önce Yem Envanteri sayfasından stok alın.
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
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
              <FormField
                control={form.control}
                name="occurredAt"
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

            {feedingEstimate ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                <span>
                  Kaba tahmini öneri: <span className="font-mono font-medium text-foreground">
                    {feedingEstimate.suggestedKgPerDay.toFixed(2)} kg/gün
                  </span>{" "}
                  ({latestTempC?.toFixed(0)}°C su, biyokütlenin %
                  {feedingEstimate.bodyWeightPct.toFixed(1)}&apos;i) — kesin oran için yem
                  üreticisinin tablosuna bakın.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    form.setValue("quantityKg", Number(feedingEstimate.suggestedKgPerDay.toFixed(2)))
                  }
                >
                  Kullan
                </Button>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={logFeeding.isPending}>
                {logFeeding.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
