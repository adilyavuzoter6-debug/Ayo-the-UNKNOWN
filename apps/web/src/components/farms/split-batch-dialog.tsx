"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Split, Trash2 } from "lucide-react";
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
import { useSplitBatch } from "@/hooks/use-fish-batches";
import { useFarmTanks } from "@/hooks/use-tanks";
import { ApiError } from "@/lib/api-error";

const schema = z.object({
  splits: z
    .array(
      z.object({
        toTankId: z.string().min(1, "Havuz seçin"),
        fishCount: z.coerce.number().int().positive(),
        lotCode: z.string().trim().min(1).max(40),
      }),
    )
    .min(2, "En az 2 hedef gerekli"),
});
type FormValues = z.infer<typeof schema>;

export function SplitBatchDialog({
  farmId,
  batchId,
  fromTankId,
  lotCode,
  liveCount,
}: {
  farmId: string;
  batchId: string;
  fromTankId: string;
  lotCode: string;
  liveCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: tanks } = useFarmTanks(farmId);
  const splitBatch = useSplitBatch(farmId, batchId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      splits: [
        { toTankId: "", fishCount: undefined as unknown as number, lotCode: `${lotCode}-A` },
        { toTankId: "", fishCount: undefined as unknown as number, lotCode: `${lotCode}-B` },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "splits" });

  async function onSubmit(values: FormValues) {
    const total = values.splits.reduce((sum, s) => sum + s.fishCount, 0);
    if (total > liveCount) {
      toast.error(`Toplam ${total} balık, havuzdaki ${liveCount} canlı balığı aşıyor.`);
      return;
    }
    try {
      await splitBatch.mutateAsync({ fromTankId, splits: values.splits });
      toast.success("Parti bölündü.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Bölme sırasında bir sorun oluştu.");
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
          <Button variant="ghost" size="icon-sm" aria-label="Böl">
            <Split className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Böl — {lotCode}</DialogTitle>
          <DialogDescription>
            Bu havuzdaki {liveCount.toLocaleString("tr")} balığı, her biri kendi lot koduna sahip
            yeni partilere bölün.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-2 rounded-md border border-border p-2.5">
                <FormField
                  control={form.control}
                  name={`splits.${index}.lotCode`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">Lot kodu</FormLabel>
                      <FormControl>
                        <Input className="h-8 text-xs" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`splits.${index}.toTankId`}
                  render={({ field: f }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">Havuz</FormLabel>
                      <Select value={f.value} onValueChange={f.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue placeholder="Seçin" />
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
                  name={`splits.${index}.fishCount`}
                  render={({ field: f }) => (
                    <FormItem className="w-20">
                      <FormLabel className="text-xs">Adet</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} step={1} className="h-8 text-xs" {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={fields.length <= 2}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ toTankId: "", fishCount: undefined as unknown as number, lotCode: "" })
              }
            >
              Hedef ekle
            </Button>

            <DialogFooter>
              <Button type="submit" disabled={splitBatch.isPending}>
                {splitBatch.isPending ? "Bölünüyor…" : "Böl"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
