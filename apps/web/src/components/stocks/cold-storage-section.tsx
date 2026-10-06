"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFarms } from "@/hooks/use-farms";
import {
  useAddColdStorageEntry,
  useColdStorage,
  useDeleteColdStorageEntry,
  useUpdateColdStorageEntry,
} from "@/hooks/use-cold-storage";
import { ApiError } from "@/lib/api-error";
import type { ColdStorageEntryRow } from "@/lib/types";

const fmtKg = (n: number) => `${n.toLocaleString("tr", { maximumFractionDigits: 3 })} kg`;

/** What one record says: a fish buried in the pit, a fish held for the rendering machine, or a shipment. */
function entryLabel(e: ColdStorageEntryRow): string {
  if (e.kind === "OUT") return `Fabrikaya sevk — ${e.destination ?? ""}`;
  return e.disposal === "PIT" ? "Ölüm çukuru" : "Un makinesi için giriş";
}

const disposalName = (v: string) => (v === "PIT" ? "Ölüm çukuru" : "Un makinesi (depoda beklet)");

export function ColdStorageSection() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState("");
  const farmId = selectedFarmId || farms?.[0]?.id || "";
  const { data, isLoading, isError } = useColdStorage(farmId || undefined);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground">
            Ölü balık — çukur ve un makinesi
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ölen balık ya ölüm çukuruna gömülür ya da un makinesine gitmek üzere soğuk hava deposunda bekler. İkisi de
            burada kaydedilir; depo bakiyesi yalnızca un makinesine ayrılanları gösterir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Çiftlik seçin">
                {(v: string) => farms?.find((f) => f.id === v)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(farms ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {farmId ? <ColdStorageEntryDialog farmId={farmId} /> : null}
        </div>
      </div>

      {!farmId ? null : isLoading || data === undefined ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : isError ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Kayıtlar yüklenemedi. Sayfayı yenilemeyi deneyin.
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="space-y-3 py-3.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Un makinesi için depoda</span>
              <span className="font-mono text-base font-semibold text-foreground">{fmtKg(data.balanceKg)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Çukura gömülen (toplam)</span>
              <span className="font-mono text-foreground">{fmtKg(data.pitKg)}</span>
            </div>
            {data.entries.length === 0 ? (
              <p className="text-muted-foreground">Bu çiftlikte henüz kayıt yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.entries.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">{entryLabel(e)}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {new Date(e.occurredAt).toLocaleDateString("tr")}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-mono font-medium ${e.kind === "IN" ? "text-teal-500" : "text-muted-foreground"}`}
                    >
                      {e.kind === "IN" ? "+" : "−"}
                      {fmtKg(Number(e.weightKg))}
                    </span>
                    <ColdEntryActions entry={e} farmId={farmId} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

const entrySchema = z
  .object({
    kind: z.enum(["IN", "OUT"]),
    disposal: z.enum(["PIT", "RENDERING"]).optional(),
    weightKg: z.coerce.number().positive("Ağırlık sıfırdan büyük olmalı"),
    destination: z.string().trim().max(120).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.kind === "IN" || (v.destination ?? "").length > 0, {
    message: "Sevkte fabrika adı girin",
    path: ["destination"],
  });
type EntryValues = z.infer<typeof entrySchema>;

function ColdStorageEntryDialog({ farmId }: { farmId: string }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { kind: "IN", disposal: "RENDERING", weightKg: undefined, destination: "", note: "" },
  });
  const add = useAddColdStorageEntry(farmId);
  const kind = useWatch({ control: form.control, name: "kind" });

  async function onSubmit(values: EntryValues) {
    try {
      await add.mutateAsync({
        kind: values.kind,
        disposal: values.kind === "IN" ? values.disposal : undefined,
        weightKg: values.weightKg,
        destination: values.kind === "OUT" ? values.destination : undefined,
        note: values.note || undefined,
      });
      toast.success(values.kind === "OUT" ? "Fabrikaya sevk kaydedildi." : "Giriş kaydedildi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Kayıt yapılamadı.");
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
            Kayıt ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ölü balık kaydı</DialogTitle>
          <DialogDescription>Gömülen ya da un makinesine giden ölü balığı, ya da fabrikaya sevki kaydedin.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hareket</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="IN">Ölü balık girişi</SelectItem>
                      <SelectItem value="OUT">Fabrikaya sevk</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {kind === "IN" ? (
              <FormField
                control={form.control}
                name="disposal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nereye</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>{disposalName}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="RENDERING">Un makinesi (depoda beklet)</SelectItem>
                        <SelectItem value="PIT">Ölüm çukuru</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="weightKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ağırlık (kg)</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" inputMode="decimal" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {kind === "OUT" ? (
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fabrika</FormLabel>
                    <FormControl>
                      <Input placeholder="Un fabrikasının adı" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Not (opsiyonel)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={add.isPending}>
              Kaydet
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Correct or remove one entry. Removal asks twice; the server refuses any that would leave the room below zero. */
function ColdEntryActions({ entry, farmId }: { entry: ColdStorageEntryRow; farmId: string }) {
  const [confirming, setConfirming] = React.useState(false);
  const remove = useDeleteColdStorageEntry(farmId);

  async function onRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await remove.mutateAsync(entry.id);
      toast.success("Kayıt silindi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Kayıt silinemedi.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <EditColdEntryDialog entry={entry} farmId={farmId} />
      <Button size="sm" variant={confirming ? "destructive" : "ghost"} onClick={onRemove} disabled={remove.isPending}>
        {confirming ? "Emin misin?" : "Sil"}
      </Button>
    </span>
  );
}

const editEntrySchema = z.object({
  weightKg: z.coerce.number().positive("Ağırlık sıfırdan büyük olmalı"),
  disposal: z.enum(["PIT", "RENDERING"]).optional(),
  destination: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
type EditEntryValues = z.infer<typeof editEntrySchema>;

function EditColdEntryDialog({ entry, farmId }: { entry: ColdStorageEntryRow; farmId: string }) {
  const [open, setOpen] = React.useState(false);
  const initial = (): EditEntryValues => ({
    weightKg: Number(entry.weightKg),
    disposal: entry.disposal,
    destination: entry.destination ?? "",
    note: entry.note ?? "",
  });
  const form = useForm<EditEntryValues>({ resolver: zodResolver(editEntrySchema), defaultValues: initial() });
  const update = useUpdateColdStorageEntry(farmId);

  async function onSubmit(values: EditEntryValues) {
    try {
      await update.mutateAsync({
        entryId: entry.id,
        weightKg: values.weightKg,
        disposal: entry.kind === "IN" ? values.disposal : undefined,
        destination: entry.kind === "OUT" ? values.destination : undefined,
        note: values.note ?? "",
      });
      toast.success("Kayıt düzeltildi.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Kayıt düzeltilemedi.");
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
          <DialogTitle>Kaydı düzelt</DialogTitle>
          <DialogDescription>Ağırlığı, yeri, fabrikayı veya notu değiştirin. Depo eksiye düşemez.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {entry.kind === "IN" ? (
              <FormField
                control={form.control}
                name="disposal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nereye</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>{disposalName}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="RENDERING">Un makinesi (depoda beklet)</SelectItem>
                        <SelectItem value="PIT">Ölüm çukuru</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="weightKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ağırlık (kg)</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" inputMode="decimal" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {entry.kind === "OUT" ? (
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fabrika</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Not (opsiyonel)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={update.isPending}>
              Kaydet
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
