"use client";

import { Package, Warehouse as WarehouseIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateFeedProductDialog } from "@/components/feeding/create-feed-product-dialog";
import { ReceiveStockDialog } from "@/components/feeding/receive-stock-dialog";
import { useFeedProducts } from "@/hooks/use-feed-products";
import { useInventoryBatches } from "@/hooks/use-feed-inventory";

export default function FeedingPage() {
  const { data: products, isLoading: productsLoading } = useFeedProducts();
  const { data: batches, isLoading: batchesLoading } = useInventoryBatches();

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

        {productsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id}>
                <CardContent className="py-3.5 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Package className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{product.name}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {product.manufacturer ?? "—"}
                    {product.proteinPct ? ` · %${product.proteinPct} protein` : ""}
                    {product.pelletSizeMm ? ` · ${product.pelletSizeMm}mm` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Henüz yem ürünü yok.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Stok lotları
          </h2>
          <ReceiveStockDialog />
        </div>

        {batchesLoading ? (
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
                    {["Ürün", "Depo", "Lot", "Bakiye", "Son Kullanma"].map((h) => (
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
                  {batches.map((batch) => {
                    const balance = Number(batch.balance?.quantityOnHandKg ?? 0);
                    const isLow = balance <= 0;
                    return (
                      <tr key={batch.id} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {batch.feedProduct.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <WarehouseIcon className="size-3.5 shrink-0" />
                            {batch.warehouse.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {batch.supplierLotCode ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {isLow ? (
                            <StatusBadge status="warning" label="Tükendi" />
                          ) : (
                            <span className="font-mono font-semibold text-teal-500">
                              {balance.toLocaleString("tr")} kg
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {batch.expiryDate
                            ? new Date(batch.expiryDate).toLocaleDateString("tr")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
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
