"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useUpdateFeedProduct } from "@/hooks/use-feed-products";
import { ApiError } from "@/lib/api-error";
import type { FeedProduct } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Ürün adı girin").max(150),
  manufacturer: z.string().trim().max(100).optional(),
  pelletSizeMm: z.coerce.number().positive().optional(),
  proteinPct: z.coerce.number().positive().optional(),
  fatPct: z.coerce.number().positive().optional(),
});
type FormValues = z.infer<typeof schema>;

export function EditFeedProductDialog({ product }: { product: FeedProduct }) {
  const [open, setOpen] = React.useState(false);
  const initial = (): FormValues => ({
    name: product.name,
    manufacturer: product.manufacturer ?? "",
    pelletSizeMm: product.pelletSizeMm ? Number(product.pelletSizeMm) : undefined,
    proteinPct: product.proteinPct ? Number(product.proteinPct) : undefined,
    fatPct: product.fatPct ? Number(product.fatPct) : undefined,
  });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial() });
  const update = useUpdateFeedProduct();

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync({
        id: product.id,
        name: values.name,
        manufacturer: values.manufacturer || undefined,
        pelletSizeMm: values.pelletSizeMm,
        proteinPct: values.proteinPct,
        fatPct: values.fatPct,
      });
      toast.success("Yem ürünü düzeltildi.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Yem ürünü düzeltilemedi.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(initial());
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="ghost">Düzelt</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Yem ürününü düzelt</DialogTitle>
          <DialogDescription>Zaten alınmış lotlar, alındıkları anki adı göstermeye devam eder.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ad</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="manufacturer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Üretici (opsiyonel)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="pelletSizeMm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] text-muted-foreground">Pellet (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="proteinPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] text-muted-foreground">Protein %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fatPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] text-muted-foreground">Yağ %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
