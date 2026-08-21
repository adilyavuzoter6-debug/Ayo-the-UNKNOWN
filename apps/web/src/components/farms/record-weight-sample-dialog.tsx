"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Scale } from "lucide-react";
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
import { useRecordWeightSample } from "@/hooks/use-weight-samples";
import { ApiError } from "@/lib/api-error";

const schema = z
  .object({
    sampleMethod: z.enum(["INDIVIDUAL", "AGGREGATE"]),
    individualWeightsText: z.string().optional(),
    avgWeightG: z.coerce.number().positive().optional(),
    sampleSize: z.coerce.number().int().positive().optional(),
    occurredAt: z.string().min(1),
    notes: z.string().max(500).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.sampleMethod === "INDIVIDUAL") {
      const weights = parseWeights(values.individualWeightsText ?? "");
      if (weights.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["individualWeightsText"],
          message: "En az bir ağırlık girin (virgülle ayırın)",
        });
      }
    } else {
      if (!values.avgWeightG) {
        ctx.addIssue({ code: "custom", path: ["avgWeightG"], message: "Ortalama ağırlık girin" });
      }
      if (!values.sampleSize) {
        ctx.addIssue({ code: "custom", path: ["sampleSize"], message: "Örnek sayısı girin" });
      }
    }
  });
type FormValues = z.infer<typeof schema>;

function parseWeights(text: string): number[] {
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function RecordWeightSampleDialog({
  farmId,
  batchId,
  tankId,
  lotCode,
}: {
  farmId: string;
  batchId: string;
  tankId: string;
  lotCode: string;
}) {
  const [open, setOpen] = React.useState(false);
  const recordWeightSample = useRecordWeightSample(farmId, tankId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sampleMethod: "INDIVIDUAL",
      individualWeightsText: "",
      avgWeightG: undefined,
      sampleSize: undefined,
      occurredAt: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const sampleMethod = useWatch({ control: form.control, name: "sampleMethod" });

  async function onSubmit(values: FormValues) {
    try {
      await recordWeightSample.mutateAsync({
        batchId,
        sampleMethod: values.sampleMethod,
        individualWeightsG:
          values.sampleMethod === "INDIVIDUAL"
            ? parseWeights(values.individualWeightsText ?? "")
            : undefined,
        avgWeightG: values.sampleMethod === "AGGREGATE" ? values.avgWeightG : undefined,
        sampleSize: values.sampleMethod === "AGGREGATE" ? values.sampleSize : undefined,
        occurredAt: values.occurredAt,
        notes: values.notes,
      });
      toast.success("Ağırlık örneklemesi kaydedildi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Örnekleme kaydedilirken bir sorun oluştu.",
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
          <Button variant="ghost" size="icon-sm" aria-label="Ağırlık örneklemesi kaydet">
            <Scale className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ağırlık örneklemesi — {lotCode}</DialogTitle>
          <DialogDescription>
            Ortalama ağırlık, bu partinin biyokütle hesaplamasında kullanılacak.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="sampleMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Yöntem</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v: string) => (v === "AGGREGATE" ? "Toplu (ortalama)" : "Tekil ölçüm")}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="INDIVIDUAL">Tekil ölçüm</SelectItem>
                      <SelectItem value="AGGREGATE">Toplu (ortalama)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {sampleMethod === "INDIVIDUAL" ? (
              <FormField
                control={form.control}
                name="individualWeightsText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ağırlıklar (g, virgülle ayrılmış)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="120, 135, 128, 141" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="avgWeightG"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ortalama ağırlık (g)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sampleSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Örnek sayısı</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} step={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

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
              <Button type="submit" disabled={recordWeightSample.isPending}>
                {recordWeightSample.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
