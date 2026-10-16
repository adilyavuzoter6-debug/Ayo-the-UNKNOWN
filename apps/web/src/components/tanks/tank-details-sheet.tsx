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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  useCreateFishBatchAdjustment,
  useTankFishBatches,
  useUpdateTargetFcr,
} from "@/hooks/use-fish-batches";
import { useRecordWeightSample } from "@/hooks/use-weight-samples";
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

            <StockQuickEditSection farmId={farmId} tank={tank} />

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

/**
 * Lets the pond's live count and average weight be corrected directly from this sheet, instead of
 * needing the Sağlık & Ölüm page (mortality) or a separate weighing dialog for a plain recount. A
 * count change books a signed ADJUSTMENT (not a death); a weight change books an AGGREGATE weight
 * sample at the new value — the same two mechanisms those other flows use, just inline here.
 */
function StockQuickEditSection({ farmId, tank }: { farmId: string; tank: Tank }) {
  const { data: allocations, isLoading } = useTankFishBatches(tank.id);
  const allocation = allocations?.[0];
  const adjustCount = useCreateFishBatchAdjustment(farmId, allocation?.batchId ?? "");
  const recordWeight = useRecordWeightSample(farmId, tank.id);
  const updateFcr = useUpdateTargetFcr(farmId, allocation?.batchId ?? "");

  const currentCount = allocation?.estimatedCount ?? 0;
  const currentWeightG = allocation
    ? Number(allocation.batch.currentState?.estimatedAvgWeightG ?? allocation.batch.initialAvgWeightG)
    : 0;
  const currentFcr = allocation?.batch.targetFcr ? Number(allocation.batch.targetFcr) : null;

  // Mirrors the server value into the inputs whenever it changes — a different tank opened, or a
  // save just landed — so a stale edit never lingers once it's been applied. Adjusted during
  // render (React's documented pattern for this) rather than an effect, which would cascade an
  // extra render for what's otherwise plain derived state.
  const resetKey = `${tank.id}:${allocation?.batchId ?? ""}:${currentCount}:${currentWeightG}:${currentFcr}`;
  const [lastResetKey, setLastResetKey] = React.useState(resetKey);
  const [countText, setCountText] = React.useState(allocation ? String(currentCount) : "");
  const [weightText, setWeightText] = React.useState(allocation ? String(currentWeightG) : "");
  const [fcrText, setFcrText] = React.useState(currentFcr !== null ? String(currentFcr) : "");
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setCountText(allocation ? String(currentCount) : "");
    setWeightText(allocation ? String(currentWeightG) : "");
    setFcrText(currentFcr !== null ? String(currentFcr) : "");
  }

  if (isLoading) {
    return (
      <div className="px-4">
        <Skeleton className="h-24 rounded-md" />
      </div>
    );
  }
  if (!allocation) {
    return null;
  }

  const countNum = countText === "" ? currentCount : Math.round(Number(countText));
  const weightNum = weightText === "" ? currentWeightG : Number(weightText);
  const fcrNum = fcrText.trim() === "" ? null : Number(fcrText);
  const countChanged = countText !== "" && countNum !== currentCount;
  const weightChanged = weightText !== "" && weightNum !== currentWeightG;
  const fcrChanged = fcrNum !== currentFcr && !(fcrNum === null && currentFcr === null);
  const pending = adjustCount.isPending || recordWeight.isPending || updateFcr.isPending;

  async function onSave() {
    try {
      if (countChanged) {
        await adjustCount.mutateAsync({ tankId: tank.id, fishCount: countNum - currentCount });
      }
      if (weightChanged && weightNum > 0) {
        await recordWeight.mutateAsync({
          batchId: allocation!.batchId,
          sampleMethod: "AGGREGATE",
          avgWeightG: weightNum,
          sampleSize: countNum > 0 ? countNum : currentCount,
        });
      }
      if (fcrChanged && (fcrNum === null || fcrNum > 0)) {
        await updateFcr.mutateAsync(fcrNum);
      }
      toast.success("Balık bilgileri güncellendi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Güncellenirken bir sorun oluştu.");
    }
  }

  return (
    <div className="space-y-3 border-t border-border px-4 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">Balık bilgisi</p>
        <p className="text-xs text-muted-foreground">
          {allocation.batch.lotCode} · {allocation.batch.species.name}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Canlı adet</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={countText}
            onChange={(e) => setCountText(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ortalama ağırlık (g)</Label>
          <Input
            type="number"
            min={0}
            step="0.1"
            value={weightText}
            onChange={(e) => setWeightText(e.target.value)}
          />
          {currentFcr !== null ? (
            <p className="text-[11px] text-muted-foreground">
              FCR {currentFcr}'a göre tahmini büyüyor
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Hedef FCR (opsiyonel)</Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          placeholder="örn. 1.2"
          value={fcrText}
          onChange={(e) => setFcrText(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Girilirse, son tartımdan bu yana yapılan yemlemeye göre ortalama ağırlık her yemleme
          sonrası bu FCR ile tahmini artırılır. Boş bırakılırsa ağırlık yalnızca yeni bir tartım
          girilince değişir.
        </p>
      </div>
      <Button
        size="sm"
        disabled={pending || (!countChanged && !weightChanged && !fcrChanged)}
        onClick={onSave}
      >
        {pending ? "Kaydediliyor…" : "Balık bilgilerini kaydet"}
      </Button>
    </div>
  );
}
