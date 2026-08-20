"use client";

import Link from "next/link";
import { Fish } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import { useFishBatches } from "@/hooks/use-fish-batches";
import type { BatchStatus } from "@/lib/types";

const BATCH_STATUS_KIND: Record<BatchStatus, StatusKind> = {
  ACTIVE: "active",
  PARTIALLY_HARVESTED: "warning",
  HARVESTED: "info",
  CLOSED: "inactive",
};

const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  ACTIVE: "Aktif",
  PARTIALLY_HARVESTED: "Kısmen Hasat",
  HARVESTED: "Hasat Edildi",
  CLOSED: "Kapalı",
};

export default function StocksPage() {
  const { data: batches, isLoading, isError } = useFishBatches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
          Balık Partileri (Stoklar)
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {batches?.length ?? 0} parti · şirket genelinde tüm çiftliklerdeki stoklamalar
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Partiler yüklenemedi. Sayfayı yenilemeyi deneyin.
          </CardContent>
        </Card>
      ) : batches && batches.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((batch) => (
            <Link key={batch.id} href={`/batches/${batch.id}`}>
              <Card className="h-full gap-0 overflow-hidden py-0 transition-colors hover:ring-teal-500/60">
                <div className="flex items-center justify-between border-b border-border bg-secondary px-3.5 py-2.5">
                  <span className="min-w-0 truncate font-mono text-sm font-bold text-navy-900">
                    {batch.lotCode}
                  </span>
                  <StatusBadge
                    status={BATCH_STATUS_KIND[batch.status]}
                    label={BATCH_STATUS_LABEL[batch.status]}
                  />
                </div>
                <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2.5 py-3.5 text-xs">
                  <div className="col-span-2 flex items-center gap-1.5 text-foreground">
                    <Fish className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{batch.species.name}</span>
                  </div>
                  <div>
                    <div className="mb-0.5 text-muted-foreground">Canlı Adet</div>
                    <div className="font-mono font-medium text-foreground">
                      {(batch.currentState?.estimatedCount ?? 0).toLocaleString("tr")}
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 text-muted-foreground">Biyokütle</div>
                    <div className="font-mono font-medium text-teal-500">
                      {batch.currentState
                        ? `${(Number(batch.currentState.estimatedBiomassKg) / 1000).toFixed(1)} t`
                        : "—"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Fish className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Henüz parti yok</p>
              <p className="text-sm text-muted-foreground">
                Bir çiftliğin Stoklar sekmesinden ilk balık partinizi stoklayın.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
