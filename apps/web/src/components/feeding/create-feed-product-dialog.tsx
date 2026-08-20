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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateFeedProduct } from "@/hooks/use-feed-products";
import { ApiError } from "@/lib/api-error";

const schema = z.object({
  name: z.string().trim().min(1).max(150),
  manufacturer: z.string().trim().max(100).optional(),
  pelletSizeMm: z.coerce.number().positive().optional(),
  proteinPct: z.coerce.number().positive().optional(),
});
type FormValues = z.infer<typeof schema>;

export function CreateFeedProductDialog() {
  const [open, setOpen] = React.useState(false);
  const createProduct = useCreateFeedProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", manufacturer: "", pelletSizeMm: undefined, proteinPct: undefined },
  });

  async function onSubmit(values: FormValues) {
    try {
      const product = await createProduct.mutateAsync({
        ...values,
        manufacturer: values.manufacturer || undefined,
      });
      toast.success(`Yem ürünü "${product.name}" eklendi.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Yem ürünü eklenirken bir sorun oluştu.");
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
            Yem ürünü ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Yem ürünü ekle</DialogTitle>
          <DialogDescription>Şirket genelindeki yem kataloğuna yeni bir ürün ekleyin.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ürün adı</FormLabel>
                  <FormControl>
                    <Input placeholder="Skretting Nutra Olympic 6mm" {...field} />
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
                    <Input placeholder="Skretting" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="pelletSizeMm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pelet (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.1" {...field} />
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
                    <FormLabel>Protein %</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createProduct.isPending}>
                {createProduct.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
