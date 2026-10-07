"use client";

import * as React from "react";
import { toast } from "sonner";
import { Package, Warehouse as WarehouseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateFeedProductDialog } from "@/components/feeding/create-feed-product-dialog";
import { EditFeedProductDialog } from "@/components/feeding/edit-feed-product-dialog";
import { EditInventoryBatchDialog } from "@/components/feeding/edit-inventory-batch-dialog";
import { ReceiveStockDialog } from "@/components/feeding/receive-stock-dialog";
import {
  useDeleteFeedProduct,
  useDeletedFeedProducts,
  useFeedProducts,
  useRestoreFeedProduct,
} from "@/hooks/use-feed-products";
import { useDeleteInventoryBatch, useInventoryBatches } from "@/hooks/use-feed-inventory";
import { ApiError } from "@/lib/api-error";
import type { FeedInventoryBatch, FeedProduct } from "@/lib/types";

export default function FeedingPage() {
  const { data: products, isLoading: productsLoading } = useFeedProducts();
  const { data: batches, isLoading: batchesLoading } = useInventoryBatches();
  const { data: deletedProducts } = useDeletedFeedProducts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
          Yem Envanteri
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Yem kataloğu, depolar ve stok bakiyeleri — şirket genelinde
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Yem ürünleri
          </h2>
          <CreateFeedProductDialog />
        </div>

        {productsLoading || products === undefined ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <FeedProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Henüz yem ürünü yok.
            </CardContent>
          </Card>
        )}

        {deletedProducts && deletedProducts.length > 0 ? (
          <div className="rounded-md border border-border bg-secondary/40 p-3">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
              Silinen ürünler — yanlışlıkla silindiyse geri getirin:
            </p>
            <div className="flex flex-wrap gap-2">
              {deletedProducts.map((product) => (
                <DeletedFeedProductChip key={product.id} product={product} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Stok lotları
          </h2>
          <ReceiveStockDialog />
        </div>

        {batchesLoading || batches === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : batches && batches.length > 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-secondary">
                    {["Ürün", "Depo", "Lot", "Bakiye", "Son Kullanma", ""].map((h) => (
                      <th
                        key={h}
                        className="border-b border-border px-4 py-2.5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <InventoryBatchRow key={batch.id} batch={batch} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <WarehouseIcon className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Henüz stok yok</p>
                <p className="text-sm text-muted-foreground">
                  Bir çiftliğe stok almaya başlamak için &quot;Stok al&quot; butonunu kullanın.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** A catalog entry, with its own correct/remove actions. Removal asks twice. */
function FeedProductCard({ product }: { product: FeedProduct }) {
  const [confirming, setConfirming] = React.useState(false);
  const remove = useDeleteFeedProduct();

  async function onRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await remove.mutateAsync(product.id);
      toast.success("Yem ürünü silindi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Yem ürünü silinemedi.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-3.5 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Package className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{product.name}</span>
        </div>
        <p className="text-muted-foreground">
          {product.manufacturer ?? "—"}
          {product.proteinPct ? ` · %${product.proteinPct} protein` : ""}
          {product.pelletSizeMm ? ` · ${product.pelletSizeMm}mm` : ""}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <EditFeedProductDialog product={product} />
          <Button size="sm" variant={confirming ? "destructive" : "ghost"} onClick={onRemove} disabled={remove.isPending}>
            {confirming ? "Emin misin?" : "Sil"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** A removed product, with a one-click way back. Lots already received show its name either way. */
function DeletedFeedProductChip({ product }: { product: FeedProduct }) {
  const restore = useRestoreFeedProduct();

  async function onRestore() {
    try {
      await restore.mutateAsync(product.id);
      toast.success(`"${product.name}" geri getirildi.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Ürün geri getirilemedi.");
    }
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
      <span className="text-muted-foreground line-through">{product.name}</span>
      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[11px]" onClick={onRestore} disabled={restore.isPending}>
        {restore.isPending ? "…" : "Geri getir"}
      </Button>
    </span>
  );
}

/** One stock lot row, with its own correct/remove actions. Removal asks twice and is refused by the
 *  server once the lot has been fed from or adjusted — correct it instead. */
function InventoryBatchRow({ batch }: { batch: FeedInventoryBatch }) {
  const [confirming, setConfirming] = React.useState(false);
  const remove = useDeleteInventoryBatch();
  const balance = Number(batch.balance?.quantityOnHandKg ?? 0);
  const isLow = balance <= 0;

  async function onRemove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await remove.mutateAsync(batch.id);
      toast.success("Lot silindi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Lot silinemedi.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 font-medium text-foreground">{batch.feedProduct.name}</td>
      <td className="px-4 py-3 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <WarehouseIcon className="size-3.5 shrink-0" />
          {batch.warehouse.name}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{batch.supplierLotCode ?? "—"}</td>
      <td className="px-4 py-3">
        {isLow ? (
          <StatusBadge status="warning" label="Tükendi" />
        ) : (
          <span className="font-mono font-semibold text-teal-500">{balance.toLocaleString("tr")} kg</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString("tr") : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <EditInventoryBatchDialog batch={batch} />
          <Button size="sm" variant={confirming ? "destructive" : "ghost"} onClick={onRemove} disabled={remove.isPending}>
            {confirming ? "Emin misin?" : "Sil"}
          </Button>
        </div>
      </td>
    </tr>
  );
}
