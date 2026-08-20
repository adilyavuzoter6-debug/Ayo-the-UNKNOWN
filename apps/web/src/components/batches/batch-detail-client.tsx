"use client";

import type * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Fish, Merge, RotateCw, Split, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import { useBatchHistory, useFishBatch } from "@/hooks/use-fish-batches";
import { useBiomassHistory, useRecalculateBiomass } from "@/hooks/use-biomass";
import { BatchPerformanceSection } from "@/components/batches/batch-performance-section";
import { ApiError } from "@/lib/api-error";
import type { BatchStatus, MovementType } from "@/lib/types";

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

const MOVEMENT_LABEL: Record<MovementType, string> = {
  STOCKING: "Stoklama",
  TRANSFER: "Transfer",
  SPLIT: "Bölme",
  MERGE: "Birleştirme",
  HARVEST_REMOVAL: "Hasat Çıkışı",
  ADJUSTMENT: "Düzeltme",
};

const MOVEMENT_ICON: Record<MovementType, React.ComponentType<{ className?: string }>> = {
  STOCKING: Fish,
  TRANSFER: ArrowRightLeft,
  SPLIT: Split,
  MERGE: Merge,
  HARVEST_REMOVAL: Waves,
  ADJUSTMENT: Waves,
};

function shortId(id: string) {
  return id.slice(-6);
}

export function BatchDetailClient({ batchId }: { batchId: string }) {
  const { data: batch, isLoading: batchLoading, isError: batchError } = useFishBatch(batchId);
  const { data: history, isLoading: historyLoading } = useBatchHistory(batchId);
  const { data: biomassHistory, isLoading: biomassLoading } = useBiomassHistory(batchId);
  const recalculateBiomass = useRecalculateBiomass(batchId);

  async function handleRecalculateBiomass() {
    try {
      await recalculateBiomass.mutateAsync();
      toast.success("Biyokütle yeniden hesaplandı.");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Biyokütle hesaplanırken bir sorun oluştu.",
      );
    }
  }

  if (batchLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (batchError || !batch) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Parti bulunamadı.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/stocks"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Tüm partiler
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight">{batch.lotCode}</h1>
              <StatusBadge
                status={BATCH_STATUS_KIND[batch.status]}
                label={BATCH_STATUS_LABEL[batch.status]}
              />
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Fish className="size-3.5" />
              {batch.species.name}
              {batch.species.strain ? ` (${batch.species.strain})` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Canlı Adet" value={(batch.currentState?.estimatedCount ?? 0).toLocaleString("tr")} />
        <Stat
          label="Ort. Ağırlık"
          value={`${Number(batch.currentState?.estimatedAvgWeightG ?? batch.initialAvgWeightG).toFixed(1)} g`}
        />
        <Stat
          label="Biyokütle"
          value={`${(Number(batch.currentState?.estimatedBiomassKg ?? 0) / 1000).toFixed(2)} t`}
          accent
        />
        <Stat
          label="Havuz"
          value={
            batch.currentState?.currentTankId
              ? shortId(batch.currentState.currentTankId)
              : (batch.currentState?.estimatedCount ?? 0) > 0
                ? "Birden fazla"
                : "—"
          }
        />
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 py-4 text-xs sm:grid-cols-3">
          <div>
            <div className="mb-0.5 text-muted-foreground">Başlangıç adedi</div>
            <div className="font-mono font-medium text-foreground">
              {batch.initialCount.toLocaleString("tr")}
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-muted-foreground">Çiftliğe giriş</div>
            <div className="font-mono font-medium text-foreground">
              {new Date(batch.farmEntryDate).toLocaleDateString("tr")}
            </div>
          </div>
          {batch.hatcherySupplier ? (
            <div>
              <div className="mb-0.5 text-muted-foreground">Kuluçkahane</div>
              <div className="font-medium text-foreground">{batch.hatcherySupplier}</div>
            </div>
          ) : null}
          {batch.parentBatchIds.length > 0 ? (
            <div className="col-span-2 sm:col-span-3">
              <div className="mb-0.5 text-muted-foreground">Köken parti(ler)</div>
              <div className="flex flex-wrap gap-1.5">
                {batch.parentBatchIds.map((id) => (
                  <Link
                    key={id}
                    href={`/batches/${id}`}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground hover:text-teal-500"
                  >
                    …{shortId(id)}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Soy ağacı / hareket geçmişi
        </h2>
        {historyLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : history && history.movements.length > 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-border">
              {history.movements.map((movement) => {
                const Icon = MOVEMENT_ICON[movement.movementType];
                return (
                  <li key={movement.id} className="flex items-start gap-3 px-4 py-3 text-xs">
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2">
                        <span className="font-medium text-foreground">
                          {MOVEMENT_LABEL[movement.movementType]}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {new Date(movement.occurredAt).toLocaleString("tr")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">
                        {movement.fishCount.toLocaleString("tr")} balık
                        {movement.fromTankId ? ` · …${shortId(movement.fromTankId)}'dan` : ""}
                        {movement.toTankId ? ` · …${shortId(movement.toTankId)}'a` : ""}
                        {movement.notes ? ` — ${movement.notes}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Henüz hareket kaydı yok.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Biyokütle geçmişi
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculateBiomass}
            disabled={recalculateBiomass.isPending}
          >
            <RotateCw className="size-3.5" />
            {recalculateBiomass.isPending ? "Hesaplanıyor…" : "Şimdi yeniden hesapla"}
          </Button>
        </div>
        {biomassLoading ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : biomassHistory && biomassHistory.length > 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-border">
              {[...biomassHistory]
                .reverse()
                .map((snapshot) => (
                  <li
                    key={snapshot.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">
                      {new Date(snapshot.snapshotDate).toLocaleDateString("tr")}
                      {snapshot.tankId ? ` · …${shortId(snapshot.tankId)}` : ""}
                    </span>
                    <span className="text-foreground">
                      {snapshot.estimatedCount.toLocaleString("tr")} balık ·{" "}
                      {Number(snapshot.avgWeightG).toFixed(1)} g
                    </span>
                    <span className="font-mono font-medium text-teal-500">
                      {(Number(snapshot.biomassKg) / 1000).toFixed(2)} t
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Henüz biyokütle anlık görüntüsü yok. Yeniden hesapla ile ilk kaydı oluşturun.
            </CardContent>
          </Card>
        )}
      </div>

      <BatchPerformanceSection batchId={batchId} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-1 truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={`truncate font-mono text-lg font-semibold ${accent ? "text-teal-500" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
