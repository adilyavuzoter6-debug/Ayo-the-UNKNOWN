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
import { useAddColdStorageEntry, useColdStorage } from "@/hooks/use-cold-storage";
import { ApiError } from "@/lib/api-error";

const fmtKg = (n: number) => `${n.toLocaleString("tr", { maximumFractionDigits: 3 })} kg`;

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
            Soğuk hava — ölü balık
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ölen balıklar soğuk hava deposunda, un fabrikası gelene kadar bekler. Giriş ve fabrikaya sevk burada
            kaydedilir.
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
            Soğuk hava kayıtları yüklenemedi. Sayfayı yenilemeyi deneyin.
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="space-y-3 py-3.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Depoda şu an</span>
              <span className="font-mono text-base font-semibold text-foreground">{fmtKg(data.balanceKg)}</span>
            </div>
            {data.entries.length === 0 ? (
              <p className="text-muted-foreground">Bu çiftlikte henüz kayıt yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.entries.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">
                        {e.kind === "IN" ? "Ölü balık girişi" : `Fabrikaya sevk — ${e.destination ?? ""}`}
                      </span>
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
    defaultValues: { kind: "IN", weightKg: undefined, destination: "", note: "" },
  });
  const add = useAddColdStorageEntry(farmId);
  const kind = useWatch({ control: form.control, name: "kind" });

  async function onSubmit(values: EntryValues) {
    try {
      await add.mutateAsync({
        kind: values.kind,
        weightKg: values.weightKg,
        destination: values.kind === "OUT" ? values.destination : undefined,
        note: values.note || undefined,
      });
      toast.success(values.kind === "IN" ? "Giriş kaydedildi." : "Fabrikaya sevk kaydedildi.");
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
          <DialogTitle>Soğuk hava kaydı</DialogTitle>
          <DialogDescription>Depoya giren ölü balığı ya da fabrikaya giden sevkiyatı kaydedin.</DialogDescription>
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
