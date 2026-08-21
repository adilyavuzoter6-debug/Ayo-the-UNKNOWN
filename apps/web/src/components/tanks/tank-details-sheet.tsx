"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDeleteTank, useUpdateTank } from "@/hooks/use-tanks";
import { ApiError } from "@/lib/api-error";
import { TANK_STATUS_LABEL, TANK_TYPE_LABEL } from "@/lib/tanks";
import type { Tank, TankStatus, TankType } from "@/lib/types";

const TANK_TYPES: TankType[] = ["POND", "CAGE", "TANK", "RACEWAY"];
const TANK_STATUSES: TankStatus[] = ["ACTIVE", "MAINTENANCE", "INACTIVE"];

const schema = z.object({
  code: z.string().trim().min(1).max(20),
  type: z.enum(["TANK", "POND", "CAGE", "RACEWAY"]),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]),
  volumeM3: z.string().optional(),
  maxBiomassKg: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function TankDetailsSheet({
  farmId,
  sectionId,
  tank,
  open,
  onOpenChange,
}: {
  farmId: string;
  sectionId: string;
  tank: Tank | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateTank = useUpdateTank(farmId, sectionId);
  const deleteTank = useDeleteTank(farmId, sectionId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: tank
      ? {
          code: tank.code,
          type: tank.type,
          status: tank.status,
          volumeM3: tank.volumeM3 ?? "",
          maxBiomassKg: tank.maxBiomassKg ?? "",
        }
      : undefined,
  });

  async function onSubmit(values: FormValues) {
    if (!tank) return;
    try {
      await updateTank.mutateAsync({
        tankId: tank.id,
        code: values.code,
        type: values.type,
        status: values.status,
        volumeM3: values.volumeM3 ? Number(values.volumeM3) : undefined,
        maxBiomassKg: values.maxBiomassKg ? Number(values.maxBiomassKg) : undefined,
      });
      toast.success(`"${values.code}" havuzu güncellendi.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Havuz güncellenirken bir sorun oluştu.");
    }
  }

  async function onDelete() {
    if (!tank) return;
    try {
      await deleteTank.mutateAsync(tank.id);
      toast.success(`"${tank.code}" havuzu silindi.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Havuz silinirken bir sorun oluştu.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {tank ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{tank.code}</SheetTitle>
              <SheetDescription>Havuz bilgileri, QR kod ve ayarlar.</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col items-center gap-2 px-4">
              <div className="rounded-lg border border-border bg-white p-3">
                <QRCodeSVG value={tank.qrToken} size={144} />
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                {tank.qrToken}
              </Badge>
              <p className="text-center text-xs text-muted-foreground">
                Mobil uygulamada bu havuzu açmak için okutun (saha iş akışları eklendiğinde).
              </p>
            </div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kod</FormLabel>
                        <FormControl>
                          <Input
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
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tür</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {(v: TankType) => TANK_TYPE_LABEL[v]}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TANK_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {TANK_TYPE_LABEL[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durum</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {(v: TankStatus) => TANK_STATUS_LABEL[v]}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TANK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TANK_STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="volumeM3"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hacim (m³)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxBiomassKg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maks. biyokütle (kg)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>

            <SheetFooter className="flex-row justify-between border-t">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="destructive" size="sm">
                      <Trash2 className="size-3.5" />
                      Sil
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{tank.code} havuzu silinsin mi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Bu işlem havuzu yumuşak siler. Listelerde görünmez ama geçmişi korunur.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onDelete}>
                      Sil
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                type="submit"
                size="sm"
                disabled={updateTank.isPending}
                onClick={form.handleSubmit(onSubmit)}
              >
                {updateTank.isPending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
