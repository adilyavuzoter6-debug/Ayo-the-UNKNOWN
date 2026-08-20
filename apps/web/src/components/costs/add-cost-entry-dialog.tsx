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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCostEntry } from "@/hooks/use-costs";
import { ApiError } from "@/lib/api-error";
import { COST_CATEGORIES, COST_CATEGORY_LABEL } from "@/lib/costs";
import type { CostCategory, FishBatch } from "@/lib/types";

const schema = z.object({
  category: z.string().min(1, "Bir kategori seçin"),
  amount: z.coerce.number().positive("Tutar 0'dan büyük olmalı"),
  batchId: z.string().optional(),
  incurredAt: z.string().min(1),
  notes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

export function AddCostEntryDialog({ farmId, batches }: { farmId: string; batches: FishBatch[] }) {
  const [open, setOpen] = React.useState(false);
  const createCostEntry = useCreateCostEntry(farmId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: "LABOR",
      incurredAt: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createCostEntry.mutateAsync({
        category: values.category as CostCategory,
        amount: values.amount,
        batchId: values.batchId || undefined,
        incurredAt: values.incurredAt,
        notes: values.notes,
      });
      toast.success("Maliyet kaydedildi.");
      form.reset({ category: "LABOR", incurredAt: new Date().toISOString().slice(0, 10) });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Maliyet kaydedilirken bir sorun oluştu.");
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
          <Button size="sm">
            <Plus className="size-3.5" />
            Maliyet ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Maliyet ekle</DialogTitle>
          <DialogDescription>Bu çiftlik için manuel bir gider kaydı.</DialogDescription>
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
                          <SelectValue />
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
                    <FormLabel>Tutar (₺)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="batchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parti (opsiyonel)</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Genel çiftlik gideri" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.lotCode}
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
              name="incurredAt"
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
              <Button type="submit" disabled={createCostEntry.isPending}>
                {createCostEntry.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
