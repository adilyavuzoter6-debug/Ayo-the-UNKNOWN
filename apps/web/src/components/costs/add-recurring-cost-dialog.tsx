"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Repeat } from "lucide-react";
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
import { useCreateRecurringCost } from "@/hooks/use-costs";
import { ApiError } from "@/lib/api-error";
import { COST_CATEGORIES, COST_CATEGORY_LABEL } from "@/lib/costs";
import type { CostCategory } from "@/lib/types";

const schema = z.object({
  category: z.string().min(1, "Bir kategori seçin"),
  amount: z.coerce.number().positive("Tutar 0'dan büyük olmalı"),
  currency: z.enum(["TRY", "USD"]),
  dayOfMonth: z.coerce
    .number()
    .int()
    .min(1, "1–28 arasında bir gün seçin")
    .max(28, "1–28 arasında bir gün seçin"),
  startDate: z.string().min(1, "Başlangıç tarihi gerekli"),
  notes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

const todayIso = () => new Date().toISOString().slice(0, 10);

export function AddRecurringCostDialog({ farmId }: { farmId: string }) {
  const [open, setOpen] = React.useState(false);
  const createRecurringCost = useCreateRecurringCost(farmId);

  const defaults = (): FormValues => ({
    category: "ELECTRICITY",
    amount: undefined as unknown as number,
    currency: "TRY",
    dayOfMonth: Math.min(new Date().getDate(), 28),
    startDate: todayIso(),
    notes: "",
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() });

  async function onSubmit(values: FormValues) {
    try {
      await createRecurringCost.mutateAsync({
        category: values.category as CostCategory,
        amount: values.amount,
        currency: values.currency,
        dayOfMonth: values.dayOfMonth,
        startDate: values.startDate,
        notes: values.notes || undefined,
      });
      toast.success("Tekrarlayan gider eklendi.");
      form.reset(defaults());
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Tekrarlayan gider eklenirken bir sorun oluştu.");
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
            <Repeat className="size-3.5" />
            Tekrarlayan gider
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tekrarlayan gider</DialogTitle>
          <DialogDescription>
            Her ay otomatik kaydedilir (kira, elektrik sözleşmesi, sabit çalışan). Geçmiş ayların kayıtları
            değişmez; durdurduğunuzda yalnızca ileriki aylar oluşmaz.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>{(v: CostCategory) => COST_CATEGORY_LABEL[v]}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COST_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {COST_CATEGORY_LABEL[c]}
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
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aylık tutar (₺)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="dayOfMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Her ayın günü</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={28} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İlk ay</FormLabel>
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
              <Button type="submit" disabled={createRecurringCost.isPending}>
                {createRecurringCost.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
