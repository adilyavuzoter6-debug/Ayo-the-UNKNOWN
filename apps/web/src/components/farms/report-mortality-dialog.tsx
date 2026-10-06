"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Skull } from "lucide-react";
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
import { useReportMortality } from "@/hooks/use-mortality-events";
import { ApiError } from "@/lib/api-error";
import { MORTALITY_REASON_LABEL as REASON_LABELS } from "@/lib/tanks";
import type { MortalityReason } from "@/lib/types";

function buildSchema(maxCount: number) {
  return z
    .object({
    unit: z.enum(["COUNT", "GRAMS"]),
    amount: z.coerce.number().positive("Pozitif bir değer girin"),
    reason: z.enum([
      "UNKNOWN",
      "DISEASE",
      "OXYGEN",
      "TEMPERATURE",
      "TRANSFER_STRESS",
      "PHYSICAL_DAMAGE",
      "PREDATOR",
      "FEED_RELATED",
      "OTHER",
    ]),
    occurredAt: z.string().min(1),
    notes: z.string().max(500).optional(),
    })
    .superRefine((values, ctx) => {
      if (values.unit !== "COUNT") return;
      if (!Number.isInteger(values.amount)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "Adet tam sayı olmalı" });
      } else if (values.amount > maxCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: `En fazla ${maxCount} balık`,
        });
      }
    });
}

export function ReportMortalityDialog({
  farmId,
  batchId,
  tankId,
  lotCode,
  liveCount,
}: {
  farmId: string;
  batchId: string;
  tankId: string;
  lotCode: string;
  liveCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const reportMortality = useReportMortality(farmId, tankId);

  const schema = buildSchema(liveCount);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      unit: "COUNT",
      amount: undefined,
      reason: "UNKNOWN",
      occurredAt: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const unit = useWatch({ control: form.control, name: "unit" });

  async function onSubmit(values: FormValues) {
    try {
      const { unit, amount, ...rest } = values;
      await reportMortality.mutateAsync({
        batchId,
        ...rest,
        ...(unit === "COUNT" ? { fishCount: amount } : { totalWeightG: amount }),
      });
      toast.success("Ölüm kaydı eklendi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Ölüm kaydedilirken bir sorun oluştu.");
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
          <Button variant="ghost" size="icon-sm" aria-label="Ölüm bildir">
            <Skull className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ölüm bildir — {lotCode}</DialogTitle>
          <DialogDescription>
            Bu havuzda {liveCount.toLocaleString("tr")} canlı balık var. Ölüm sayısı bu partinin
            canlı sayısından düşülecek.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birim</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v: "COUNT" | "GRAMS") => (v === "COUNT" ? "Adet" : "Gram (toplam)")}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="COUNT">Adet</SelectItem>
                        <SelectItem value="GRAMS">Gram (toplam)</SelectItem>
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
                    <FormLabel>{unit === "COUNT" ? "Ölen balık (adet)" : "Ölen balık (g)"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={unit === "COUNT" ? 1 : "any"}
                        {...field}
                      />
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

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Neden</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Neden seçin">
                          {(v: MortalityReason) => REASON_LABELS[v]}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(REASON_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
              <Button type="submit" variant="destructive" disabled={reportMortality.isPending}>
                {reportMortality.isPending ? "Kaydediliyor…" : "Ölüm bildir"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
