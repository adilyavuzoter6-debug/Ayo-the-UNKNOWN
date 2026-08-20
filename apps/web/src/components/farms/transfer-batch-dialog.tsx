"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
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
import { useCreateMovement } from "@/hooks/use-fish-batches";
import { useFarmTanks } from "@/hooks/use-tanks";
import { ApiError } from "@/lib/api-error";

function buildSchema(maxCount: number) {
  return z.object({
    toTankId: z.string().min(1, "Bir havuz seçin"),
    fishCount: z.coerce.number().int().positive().max(maxCount, `En fazla ${maxCount} balık`),
  });
}

export function TransferBatchDialog({
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
  const createMovement = useCreateMovement(farmId, batchId);

  const schema = buildSchema(liveCount);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { toTankId: "", fishCount: undefined },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createMovement.mutateAsync({ fromTankId, ...values });
      toast.success("Transfer kaydedildi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Transfer sırasında bir sorun oluştu.");
    }
  }

  const destinationTanks = (tanks ?? []).filter((t) => t.id !== fromTankId);

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
          <Button variant="ghost" size="icon-sm" aria-label="Transfer et">
            <ArrowRightLeft className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer — {lotCode}</DialogTitle>
          <DialogDescription>
            Bu havuzda {liveCount.toLocaleString("tr")} canlı balık var. Bir kısmını başka bir
            havuza taşıyın.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      {destinationTanks.map((t) => (
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
              name="fishCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adet</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={liveCount} step={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createMovement.isPending}>
                {createMovement.isPending ? "Kaydediliyor…" : "Transfer et"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
