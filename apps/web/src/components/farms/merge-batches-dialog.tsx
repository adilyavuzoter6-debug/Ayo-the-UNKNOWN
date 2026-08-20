"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Merge } from "lucide-react";
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
import { useFishBatches, useMergeBatches } from "@/hooks/use-fish-batches";
import { useFarmTanks } from "@/hooks/use-tanks";
import { ApiError } from "@/lib/api-error";

const schema = z.object({
  otherBatchId: z.string().min(1, "Bir parti seçin"),
  fishCountFromPrimary: z.coerce.number().int().positive(),
  fishCountFromOther: z.coerce.number().int().positive(),
  toTankId: z.string().min(1, "Havuz seçin"),
  lotCode: z.string().trim().min(1).max(40),
});
type FormValues = z.infer<typeof schema>;

/**
 * Merges the current batch/tank allocation with one other single-tank batch of the same
 * species. The backend supports N sources, but a batch can live in more than one tank at
 * once (BatchTankState) — picking a source tank per candidate would need its own UI, so this
 * dialog only offers batches currently allocated to exactly one tank
 * (`currentState.currentTankId` set) to keep source-tank selection unambiguous.
 */
export function MergeBatchesDialog({
  farmId,
  primaryBatchId,
  primaryFromTankId,
  primaryLotCode,
  primaryLiveCount,
  speciesId,
}: {
  farmId: string;
  primaryBatchId: string;
  primaryFromTankId: string;
  primaryLotCode: string;
  primaryLiveCount: number;
  speciesId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: allBatches } = useFishBatches();
  const { data: tanks } = useFarmTanks(farmId);
  const mergeBatches = useMergeBatches(farmId);

  const candidates = (allBatches ?? []).filter(
    (b) =>
      b.id !== primaryBatchId &&
      b.speciesId === speciesId &&
      b.status === "ACTIVE" &&
      b.currentState?.currentTankId,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      otherBatchId: "",
      fishCountFromPrimary: undefined,
      fishCountFromOther: undefined,
      toTankId: "",
      lotCode: "",
    },
  });

  const otherBatchId = useWatch({ control: form.control, name: "otherBatchId" });
  const otherBatch = candidates.find((b) => b.id === otherBatchId);

  async function onSubmit(values: FormValues) {
    const other = candidates.find((b) => b.id === values.otherBatchId);
    if (!other?.currentState?.currentTankId) return;

    try {
      await mergeBatches.mutateAsync({
        sources: [
          { batchId: primaryBatchId, fromTankId: primaryFromTankId, fishCount: values.fishCountFromPrimary },
          {
            batchId: other.id,
            fromTankId: other.currentState.currentTankId,
            fishCount: values.fishCountFromOther,
          },
        ],
        toTankId: values.toTankId,
        lotCode: values.lotCode,
      });
      toast.success("Partiler birleştirildi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Birleştirme sırasında bir sorun oluştu.",
      );
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
          <Button variant="ghost" size="icon-sm" aria-label="Birleştir" disabled={candidates.length === 0}>
            <Merge className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Birleştir — {primaryLotCode}</DialogTitle>
          <DialogDescription>
            Bu partiyi aynı türden başka bir aktif partiyle birleştirip yeni bir lot oluşturun.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="otherBatchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diğer parti</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Parti seçin" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {candidates.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.lotCode} ({b.currentState?.estimatedCount.toLocaleString("tr")} balık)
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
                name="fishCountFromPrimary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {primaryLotCode}&apos;dan (maks {primaryLiveCount.toLocaleString("tr")})
                    </FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={primaryLiveCount} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fishCountFromOther"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {otherBatch ? `${otherBatch.lotCode}'dan` : "Diğerinden"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={otherBatch?.currentState?.estimatedCount}
                        step={1}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="toTankId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hedef havuz</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Havuz seçin" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(tanks ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.code}
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
              name="lotCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Yeni lot kodu</FormLabel>
                  <FormControl>
                    <Input placeholder="LOT-2026-00200" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={mergeBatches.isPending}>
                {mergeBatches.isPending ? "Birleştiriliyor…" : "Birleştir"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
