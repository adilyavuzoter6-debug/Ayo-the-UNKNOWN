"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useRecordWaterQualityReading } from "@/hooks/use-water-quality";
import { ApiError } from "@/lib/api-error";

const numberField = z.coerce.number().optional();

const schema = z.object({
  temperatureC: numberField,
  dissolvedOxygenMgL: numberField,
  ph: numberField,
  salinityPpt: numberField,
  ammoniaMgL: numberField,
  nitriteMgL: numberField,
  nitrateMgL: numberField,
  flowRateM3H: numberField,
  occurredAt: z.string().min(1),
  notes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

const FIELDS: { name: keyof FormValues; label: string; step?: string }[] = [
  { name: "temperatureC", label: "Sıcaklık (°C)", step: "0.1" },
  { name: "dissolvedOxygenMgL", label: "Çözünmüş O₂ (mg/L)", step: "0.1" },
  { name: "ph", label: "pH", step: "0.1" },
  { name: "salinityPpt", label: "Tuzluluk (‰)", step: "0.1" },
  { name: "ammoniaMgL", label: "Amonyak (mg/L)", step: "0.001" },
  { name: "nitriteMgL", label: "Nitrit (mg/L)", step: "0.001" },
  { name: "nitrateMgL", label: "Nitrat (mg/L)", step: "0.001" },
  { name: "flowRateM3H", label: "Akış (m³/sa)", step: "0.1" },
];

export function RecordWaterQualityDialog({ tankId, tankCode }: { tankId: string; tankCode: string }) {
  const [open, setOpen] = React.useState(false);
  const recordReading = useRecordWaterQualityReading(tankId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { occurredAt: new Date().toISOString().slice(0, 10), notes: "" },
  });

  async function onSubmit(values: z.output<typeof schema>) {
    try {
      await recordReading.mutateAsync(values);
      toast.success("Su kalitesi ölçümü kaydedildi.");
      form.reset({ occurredAt: new Date().toISOString().slice(0, 10), notes: "" });
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Ölçüm kaydedilirken bir sorun oluştu (en az bir değer girilmeli).",
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
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" />
            Ölçüm ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Su kalitesi ölçümü — {tankCode}</DialogTitle>
          <DialogDescription>Ölçtüğün değerleri gir; boş bıraktıkların kaydedilmez.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((field) => (
                <FormField
                  key={field.name}
                  control={form.control}
                  name={field.name}
                  render={({ field: rhfField }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">{field.label}</FormLabel>
                      <FormControl>
                        <Input type="number" step={field.step ?? "0.01"} {...rhfField} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

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
              <Button type="submit" disabled={recordReading.isPending}>
                {recordReading.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
