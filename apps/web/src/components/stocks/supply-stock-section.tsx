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
  useCreateSupplyItem,
  useDeleteSupplyMovement,
  useReceiveSupply,
  useSupplyItems,
  useSupplyMovements,
  useTransferSupply,
  useUpdateSupplyMovement,
  type SupplyMovementRow,
} from "@/hooks/use-supplies";
import { ApiError } from "@/lib/api-error";
import type { SupplyItemStock } from "@/lib/types";

type FarmOption = { id: string; name: string };

const fmt = (n: number) => n.toLocaleString("tr", { maximumFractionDigits: 3 });

export function SupplyStockSection() {
  const { data: items, isLoading, isError } = useSupplyItems();
  const { data: farms } = useFarms();
  const farmOptions: FarmOption[] = (farms ?? []).map((f) => ({ id: f.id, name: f.name }));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground">Malzeme stoku</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Yem dışı malzemeler (boru, panel, filtre, çuval). Geldiğinde kaydedilir; çiftlikler arasında
            transfer edilebilir.
          </p>
        </div>
        <NewSupplyItemDialog />
      </div>

      {isLoading || items === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Malzeme stoku yüklenemedi. Sayfayı yenilemeyi deneyin.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Henüz malzeme yok. &quot;Yeni malzeme&quot; ile tanımlayın.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <SupplyItemCard key={item.id} item={item} farms={farmOptions} />
          ))}
        </div>
      )}
    </section>
  );
}

function SupplyItemCard({ item, farms }: { item: SupplyItemStock; farms: FarmOption[] }) {
  const [showMovements, setShowMovements] = React.useState(false);
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary px-3.5 py-2.5">
        <span className="min-w-0 truncate text-sm font-semibold text-navy-900">{item.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{item.category}</span>
      </div>
      <CardContent className="space-y-3 py-3.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Toplam</span>
          <span className="font-mono font-medium text-foreground">
            {fmt(item.totalQuantity)} {item.unit}
          </span>
        </div>
        {item.balances.length === 0 ? (
          <p className="text-muted-foreground">Hiçbir çiftlikte stok yok.</p>
        ) : (
          <ul className="space-y-1">
            {item.balances.map((b) => (
              <li key={b.farmId} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{b.farmName ?? "Silinmiş çiftlik"}</span>
                <span className="shrink-0 font-mono">
                  {fmt(b.quantity)} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ReceiveSupplyDialog item={item} farms={farms} />
          <TransferSupplyDialog item={item} farms={farms} />
          <Button size="sm" variant="ghost" onClick={() => setShowMovements((v) => !v)}>
            {showMovements ? "Hareketleri gizle" : "Hareketler"}
          </Button>
        </div>
        {showMovements ? <SupplyMovementsList item={item} /> : null}
      </CardContent>
    </Card>
  );
}

const newItemSchema = z.object({
  name: z.string().trim().min(1, "Malzeme adı girin").max(120),
  category: z.string().trim().min(1, "Kategori girin").max(60),
  unit: z.string().trim().min(1, "Birim girin").max(20),
});
type NewItemValues = z.infer<typeof newItemSchema>;

function NewSupplyItemDialog() {
  const [open, setOpen] = React.useState(false);
  const form = useForm<NewItemValues>({
    resolver: zodResolver(newItemSchema),
    defaultValues: { name: "", category: "", unit: "adet" },
  });
  const create = useCreateSupplyItem();

  async function onSubmit(values: NewItemValues) {
    try {
      await create.mutateAsync(values);
      toast.success(`"${values.name}" eklendi.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Malzeme eklenemedi.");
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
          <Button size="sm" variant="outline">
            <Plus className="size-3.5" />
            Yeni malzeme
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Yeni malzeme</DialogTitle>
          <DialogDescription>
            Ne zaman geleceği belli olmayan bir malzemeyi tanımlayın. Geldiğinde &quot;Gelen&quot; ile stoka alın.
          </DialogDescription>
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
                    <Input placeholder="Örn. Metal panel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kategori</FormLabel>
                  <FormControl>
                    <Input placeholder="Örn. Boru, Filtre, Çuval" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Birim</FormLabel>
                  <FormControl>
                    <Input placeholder="adet, m, kg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={create.isPending}>
              Kaydet
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const receiveSchema = z.object({
  farmId: z.string().min(1, "Çiftlik seçin"),
  quantity: z.coerce.number().positive("Miktar sıfırdan büyük olmalı"),
  note: z.string().trim().max(500).optional(),
});
type ReceiveValues = z.infer<typeof receiveSchema>;

function ReceiveSupplyDialog({ item, farms }: { item: SupplyItemStock; farms: FarmOption[] }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<ReceiveValues>({
    resolver: zodResolver(receiveSchema),
    defaultValues: { farmId: "", quantity: undefined, note: "" },
  });
  const receive = useReceiveSupply();

  async function onSubmit(values: ReceiveValues) {
    try {
      await receive.mutateAsync({
        itemId: item.id,
        farmId: values.farmId,
        quantity: values.quantity,
        note: values.note || undefined,
      });
      toast.success(`${item.name}: ${fmt(values.quantity)} ${item.unit} kaydedildi.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Gelen malzeme kaydedilemedi.");
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
      <DialogTrigger render={<Button size="sm">Gelen</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Gelen malzeme — {item.name}</DialogTitle>
          <DialogDescription>Geldiği çiftliği ve miktarı girin.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="farmId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Çiftlik</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Çiftlik seçin">
                          {(v: string) => farms.find((f) => f.id === v)?.name}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {farms.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miktar ({item.unit})</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" inputMode="decimal" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Not (opsiyonel)</FormLabel>
                  <FormControl>
                    <Input placeholder="Örn. tedarikçi irsaliyesi" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={receive.isPending}>
              Kaydet
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TransferSupplyDialog({ item, farms }: { item: SupplyItemStock; farms: FarmOption[] }) {
  const [open, setOpen] = React.useState(false);

  // The source must hold the quantity; checked here so the user sees it before the request.
  const schema = React.useMemo(
    () =>
      z
        .object({
          fromFarmId: z.string().min(1, "Kaynak çiftlik seçin"),
          toFarmId: z.string().min(1, "Hedef çiftlik seçin"),
          quantity: z.coerce.number().positive("Miktar sıfırdan büyük olmalı"),
          note: z.string().trim().max(500).optional(),
        })
        .refine((v) => v.fromFarmId !== v.toFarmId, {
          message: "Kaynak ve hedef çiftlik farklı olmalı",
          path: ["toFarmId"],
        })
        .superRefine((v, ctx) => {
          const available = item.balances.find((b) => b.farmId === v.fromFarmId)?.quantity ?? 0;
          if (v.quantity > available) {
            ctx.addIssue({
              code: "custom",
              path: ["quantity"],
              message: `Kaynakta yalnızca ${fmt(available)} ${item.unit} var`,
            });
          }
        }),
    [item],
  );
  type TransferValues = z.infer<typeof schema>;

  const form = useForm<TransferValues>({
    resolver: zodResolver(schema),
    defaultValues: { fromFarmId: "", toFarmId: "", quantity: undefined, note: "" },
  });
  const transfer = useTransferSupply();
  const fromFarmId = useWatch({ control: form.control, name: "fromFarmId" });
  const availableAtSource = item.balances.find((b) => b.farmId === fromFarmId)?.quantity;

  async function onSubmit(values: TransferValues) {
    try {
      await transfer.mutateAsync({
        itemId: item.id,
        fromFarmId: values.fromFarmId,
        toFarmId: values.toFarmId,
        quantity: values.quantity,
        note: values.note || undefined,
      });
      toast.success(`${item.name}: ${fmt(values.quantity)} ${item.unit} transfer edildi.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Transfer yapılamadı.");
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
      <DialogTrigger render={<Button size="sm" variant="outline">Transfer</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer — {item.name}</DialogTitle>
          <DialogDescription>Bir çiftlikten diğerine taşınan miktar kaynaktan düşer, hedefe eklenir.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fromFarmId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kaynak çiftlik</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Çiftlik seçin">
                          {(v: string) => farms.find((f) => f.id === v)?.name}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {farms.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fromFarmId ? (
                    <p className="text-[11px] text-muted-foreground">
                      Burada: {availableAtSource !== undefined ? `${fmt(availableAtSource)} ${item.unit}` : `0 ${item.unit}`}
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="toFarmId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hedef çiftlik</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Çiftlik seçin">
                          {(v: string) => farms.find((f) => f.id === v)?.name}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {farms.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miktar ({item.unit})</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" inputMode="decimal" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <Button type="submit" className="w-full" disabled={transfer.isPending}>
              Transfer et
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** The item's movements, each one correctable or removable. Removal asks twice; the server refuses any that
 *  would leave a farm with negative stock. */
function SupplyMovementsList({ item }: { item: SupplyItemStock }) {
  const { data: movements, isLoading, isError } = useSupplyMovements(item.id, true);
  if (isLoading || movements === undefined) return <Skeleton className="h-16 rounded-md" />;
  if (isError) return <p className="text-muted-foreground">Hareketler yüklenemedi.</p>;
  if (movements.length === 0) return <p className="text-muted-foreground">Henüz hareket yok.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {movements.map((m) => (
        <SupplyMovementRowItem key={m.id} movement={m} item={item} />
      ))}
    </ul>
  );
}

function SupplyMovementRowItem({ movement, item }: { movement: SupplyMovementRow; item: SupplyItemStock }) {
  const [confirming, setConfirming] = React.useState(false);
  const remove = useDeleteSupplyMovement();
  const label =
    movement.kind === "RECEIVED"
      ? `Gelen → ${movement.toFarmName ?? "—"}`
      : `Transfer: ${movement.fromFarmName ?? "—"} → ${movement.toFarmName ?? "—"}`;

  async function onRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await remove.mutateAsync({ movementId: movement.id, itemId: item.id });
      toast.success("Hareket silindi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Hareket silinemedi.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-2 px-2.5 py-2">
      <span className="min-w-0">
        <span className="block truncate text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground">
          {new Date(movement.occurredAt).toLocaleDateString("tr")}
          {movement.note ? ` · ${movement.note}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="font-mono">{fmt(movement.quantity)} {item.unit}</span>
        <EditMovementDialog movement={movement} item={item} />
        <Button size="sm" variant={confirming ? "destructive" : "ghost"} onClick={onRemove} disabled={remove.isPending}>
          {confirming ? "Emin misin?" : "Sil"}
        </Button>
      </span>
    </li>
  );
}

const editMovementSchema = z.object({
  quantity: z.coerce.number().positive("Miktar sıfırdan büyük olmalı"),
  note: z.string().trim().max(500).optional(),
});
type EditMovementValues = z.infer<typeof editMovementSchema>;

function EditMovementDialog({ movement, item }: { movement: SupplyMovementRow; item: SupplyItemStock }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<EditMovementValues>({
    resolver: zodResolver(editMovementSchema),
    defaultValues: { quantity: movement.quantity, note: movement.note ?? "" },
  });
  const update = useUpdateSupplyMovement();

  async function onSubmit(values: EditMovementValues) {
    try {
      await update.mutateAsync({
        movementId: movement.id,
        itemId: item.id,
        quantity: values.quantity,
        note: values.note ?? "",
      });
      toast.success("Hareket düzeltildi.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Hareket düzeltilemedi.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset({ quantity: movement.quantity, note: movement.note ?? "" });
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="ghost">Düzelt</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Hareketi düzelt — {item.name}</DialogTitle>
          <DialogDescription>Miktarı veya notu değiştirin. Kaynak çiftlikte yeterli stok kalmalı.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miktar ({item.unit})</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" inputMode="decimal" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
