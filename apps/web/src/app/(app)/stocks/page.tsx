"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronsUpDown, Fish, Waves } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import { ReceiveStockDialog } from "@/components/feeding/receive-stock-dialog";
import { ColdStorageSection } from "@/components/stocks/cold-storage-section";
import { SupplyStockSection } from "@/components/stocks/supply-stock-section";
import { useBatchTankStates, useFishBatches } from "@/hooks/use-fish-batches";
import { useCompanyTanks } from "@/hooks/use-tanks";
import { useFarmProductionOverview } from "@/hooks/use-production-overview";
import { tankLoad } from "@/lib/farm-production-summary";
import { TANK_STATUS_LABEL } from "@/lib/tanks";
import type { BatchStatus, FishBatch, TankStatus } from "@/lib/types";

const TANK_STATUS_VARIANT: Record<TankStatus, "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  MAINTENANCE: "outline",
};

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
  const [view, setView] = React.useState<"batch" | "pond">("batch");
  const { data: batches, isLoading, isError } = useFishBatches();
  const [selected, setSelected] = React.useState<FishBatch | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <button
          type="button"
          onClick={() => setView((v) => (v === "batch" ? "pond" : "batch"))}
          className="group flex items-center gap-1.5 text-left"
        >
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground group-hover:text-teal-500">
              {view === "batch" ? "Balık Partileri (Stoklar)" : "Havuz Partileri (Stoklar)"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {view === "batch"
                ? `${batches?.length ?? 0} parti · şirket genelinde tüm çiftliklerdeki stoklamalar`
                : "şirket genelindeki tüm havuzlar — dolu veya boş"}
            </p>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-teal-500" />
        </button>
        <ReceiveStockDialog />
      </div>

      {view === "batch" ? (
        <BatchCardsGrid batches={batches} isLoading={isLoading} isError={isError} onSelect={setSelected} />
      ) : (
        <PondCardsGrid />
      )}

      <SupplyStockSection />
      <ColdStorageSection />

      <BatchPondsDialog batch={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function BatchCardsGrid({
  batches,
  isLoading,
  isError,
  onSelect,
}: {
  batches: FishBatch[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onSelect: (batch: FishBatch) => void;
}) {
  if (isLoading || batches === undefined) {
    // See dashboard/page.tsx — undefined (not loaded yet, e.g. while companyId itself is still
    // resolving) must not be read as "zero batches exist".
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Partiler yüklenemedi. Sayfayı yenilemeyi deneyin.
        </CardContent>
      </Card>
    );
  }
  if (batches.length === 0) {
    return (
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
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {batches.map((batch) => (
        <button key={batch.id} type="button" onClick={() => onSelect(batch)} className="block w-full text-left">
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
        </button>
      ))}
    </div>
  );
}

/** Every pond company-wide, stocked or empty, as its own card — the alternate view toggled from
 *  the page title. Each pond shows which farm it's in since, unlike the batch view, codes repeat
 *  across farms (every farm has its own "A1"). */
function PondCardsGrid() {
  const { data: tanks, isLoading, isError } = useCompanyTanks();

  if (isLoading || tanks === undefined) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Havuzlar yüklenemedi. Sayfayı yenilemeyi deneyin.
        </CardContent>
      </Card>
    );
  }
  if (tanks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Waves className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Henüz havuz yok</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tanks.map((tank) => (
        <Link key={tank.id} href={`/farms/${tank.farmId}/tanks/${tank.id}`} className="block w-full">
          <Card className="h-full gap-0 overflow-hidden py-0 transition-colors hover:ring-teal-500/60">
            <div className="flex items-center justify-between border-b border-border bg-secondary px-3.5 py-2.5">
              <span className="min-w-0 truncate font-mono text-sm font-bold text-navy-900">{tank.code}</span>
              <Badge variant={TANK_STATUS_VARIANT[tank.status]} className="shrink-0 text-[10px]">
                {TANK_STATUS_LABEL[tank.status]}
              </Badge>
            </div>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2.5 py-3.5 text-xs">
              <div className="col-span-2 flex items-center gap-1.5 text-foreground">
                <Waves className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{tank.farmName}</span>
              </div>
              <div>
                <div className="mb-0.5 text-muted-foreground">Canlı Adet</div>
                <div className="font-mono font-medium text-foreground">
                  {tank.liveCount.toLocaleString("tr")}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-muted-foreground">Biyokütle</div>
                <div className="font-mono font-medium text-teal-500">
                  {tank.liveCount > 0 ? `${(tank.biomassKg / 1000).toFixed(1)} t` : "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/**
 * Every pond in the same block as the clicked batch's pond — stocked or empty — not just that one
 * pond, so the whole block is one click away. Plain cards, same style for every pond.
 */
function BatchPondsDialog({ batch, onClose }: { batch: FishBatch | null; onClose: () => void }) {
  const { data: tankStates, isLoading: statesLoading, isError: statesError } = useBatchTankStates(batch?.id);
  const primary = tankStates?.[0];
  const farmId = primary?.tank.farmSection.farm.id;
  const sectionId = primary?.tank.farmSectionId;

  const { rows, isLoading: overviewLoading } = useFarmProductionOverview(farmId ?? "");
  const isLoading = statesLoading || (!!farmId && overviewLoading);

  const blockRows = rows
    .filter((r) => r.tank.farmSectionId === sectionId)
    .map((r) => ({ tank: r.tank, load: tankLoad(r.tank, r.allocations) }))
    .sort((a, b) => a.tank.code.localeCompare(b.tank.code, "tr", { numeric: true }));

  return (
    <Dialog open={batch !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono">{batch?.lotCode}</DialogTitle>
          <DialogDescription>Partinin bulunduğu bloktaki havuzlar.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : statesError ? (
          <p className="text-sm text-muted-foreground">Havuzlar yüklenemedi. Tekrar deneyin.</p>
        ) : !primary || blockRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu partinin canlı balığı olan bir havuzu yok.</p>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {blockRows.map(({ tank, load }) => (
              <Link
                key={tank.id}
                href={`/farms/${farmId}/tanks/${tank.id}`}
                className="rounded-lg border border-border bg-card p-3 text-xs transition-colors hover:ring-teal-500/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-navy-900">{tank.code}</span>
                  <Badge variant={TANK_STATUS_VARIANT[tank.status]} className="shrink-0 text-[10px]">
                    {TANK_STATUS_LABEL[tank.status]}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-muted-foreground">Canlı adet</div>
                    <div className="font-mono font-medium text-foreground">
                      {load.count.toLocaleString("tr")}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Biyokütle</div>
                    <div className="font-mono font-medium text-teal-500">
                      {load.count > 0 ? `${(load.biomassKg / 1000).toFixed(2)} t` : "—"}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {batch ? (
          <Link href={`/batches/${batch.id}`} className="text-sm font-medium text-teal-500 hover:underline">
            Parti detayına git
          </Link>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
