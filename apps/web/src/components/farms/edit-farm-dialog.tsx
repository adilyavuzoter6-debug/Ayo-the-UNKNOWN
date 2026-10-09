"use client";

import * as React from "react";
import { TimezoneSelect } from "@/components/farms/timezone-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateFarmSchema, type UpdateFarmInput } from "@aquai/validation";
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
import { useFarms, useUpdateFarm } from "@/hooks/use-farms";
import { ApiError } from "@/lib/api-error";
import type { Farm } from "@/lib/types";

/** Sentinel for "no depot partner" in the Select below — translated to null right before submit. */
const NONE = "__none__";

export function EditFarmDialog({
  farm,
  trigger,
}: {
  farm: Farm;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const updateFarm = useUpdateFarm();
  const { data: farms } = useFarms();
  const otherFarms = (farms ?? []).filter((f) => f.id !== farm.id);

  const form = useForm<UpdateFarmInput>({
    resolver: zodResolver(updateFarmSchema),
    values: {
      name: farm.name,
      code: farm.code,
      timezone: farm.timezone ?? "",
      sharesDepotWithFarmId: farm.sharesDepotWithFarmId ?? NONE,
    },
  });

  async function onSubmit(values: UpdateFarmInput) {
    try {
      await updateFarm.mutateAsync({
        farmId: farm.id,
        ...values,
        timezone: values.timezone || undefined,
        sharesDepotWithFarmId:
          !values.sharesDepotWithFarmId || values.sharesDepotWithFarmId === NONE
            ? null
            : values.sharesDepotWithFarmId,
      });
      toast.success(`Çiftlik "${values.name}" güncellendi.`);
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Çiftlik güncellenirken bir sorun oluştu.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon-sm" aria-label="Çiftliği düzenle">
              <Pencil className="size-3.5" />
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Çiftliği düzenle</DialogTitle>
          <DialogDescription>Çiftlik bilgilerini güncelleyin.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Çiftlik adı</FormLabel>
                  <FormControl>
                    <Input placeholder="Ana Çiftlik" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kod</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="FARM-1"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saat dilimi (opsiyonel)</FormLabel>
                    <FormControl>
                      <TimezoneSelect value={field.value ?? ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sharesDepotWithFarmId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Depo ortağı (opsiyonel)</FormLabel>
                  <Select value={field.value ?? NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Yok">
                          {(v: string) => (v === NONE ? "Yok" : otherFarms.find((f) => f.id === v)?.name)}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Yok</SelectItem>
                      {otherFarms.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Bu çiftlik başka bir çiftlikle aynı fiziksel depoyu kullanıyorsa seçin — Stoklar
                    sayfasında ikisinin stoğu tek satırda, birlikte gösterilir ve ilaç/malzeme
                    tüketimi ikisi arasında paylaşılır.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={updateFarm.isPending}>
                {updateFarm.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
