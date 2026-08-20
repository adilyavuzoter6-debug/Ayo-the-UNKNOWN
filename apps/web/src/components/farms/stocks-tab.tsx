"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Fish, Wheat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import { useFarmTanks } from "@/hooks/use-tanks";
import { useTankFishBatches } from "@/hooks/use-fish-batches";
import { useTankFeedingEvents } from "@/hooks/use-feeding-events";
import { useFarmAlerts, useResolveAlert } from "@/hooks/use-alerts";
import { CreateFishBatchDialog } from "@/components/farms/create-fish-batch-dialog";
import { TransferBatchDialog } from "@/components/farms/transfer-batch-dialog";
import { SplitBatchDialog } from "@/components/farms/split-batch-dialog";
import { MergeBatchesDialog } from "@/components/farms/merge-batches-dialog";
import { LogFeedingDialog } from "@/components/farms/log-feeding-dialog";
import { ReportMortalityDialog } from "@/components/farms/report-mortality-dialog";
import { RecordWeightSampleDialog } from "@/components/farms/record-weight-sample-dialog";
import { ApiError } from "@/lib/api-error";
import type { Tank, TankStatus } from "@/lib/types";

const TANK_STATUS_KIND: Record<TankStatus, StatusKind> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  MAINTENANCE: "warning",
};

export function StocksTab({ farmId }: { farmId: string }) {
  const { data: tanks, isLoading: tanksLoading } = useFarmTanks(farmId);

  return (
    <div className="space-y-6">
      <OpenAlertsSection farmId={farmId} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Havuz bazında stok
        </h2>

        {tanksLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : !tanks || tanks.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-sm text-muted-foreground">
              Bu çiftlikte henüz üretim birimi (havuz/kafes/tank) yok.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {tanks.map((tank) => (
              <TankStockCard key={tank.id} farmId={farmId} tank={tank} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OpenAlertsSection({ farmId }: { farmId: string }) {
  const { data: alerts, isLoading } = useFarmAlerts(farmId, "OPEN");
  const resolveAlert = useResolveAlert(farmId);

  if (isLoading || !alerts || alerts.length === 0) {
    return null;
  }

  async function handleResolve(alertId: string) {
    try {
      await resolveAlert.mutateAsync(alertId);
      toast.success("Uyarı çözüldü olarak işaretlendi.");
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Uyarı çözülürken bir sorun oluştu.");
      }
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Açık uyarılar
      </h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <Card key={alert.id} className="border-warning/40 bg-warning/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <p className="min-w-0 text-sm text-foreground">{alert.message}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={resolveAlert.isPending}
                onClick={() => handleResolve(alert.id)}
              >
                <CheckCircle2 className="size-3.5" />
                Çözüldü
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TankStockCard({ farmId, tank }: { farmId: string; tank: Tank }) {
  const { data: allocations, isLoading: batchesLoading } = useTankFishBatches(tank.id);
  const { data: feedingEvents, isLoading: feedLoading } = useTankFeedingEvents(tank.id);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <span className="font-mono text-sm font-bold text-navy-900">{tank.code}</span>
        <StatusBadge status={TANK_STATUS_KIND[tank.status]} />
      </div>

      <CardContent className="space-y-3 py-3.5 text-xs">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <span className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground">
              <Fish className="size-3" /> Balık partileri
            </span>
            <CreateFishBatchDialog farmId={farmId} tankId={tank.id} />
          </div>
          {batchesLoading ? (
            <Skeleton className="h-6 rounded" />
          ) : allocations && allocations.length > 0 ? (
            <ul className="space-y-1.5">
              {allocations.map((allocation) => (
                <li
                  key={allocation.batchId}
                  className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-foreground"
                >
                  <Link
                    href={`/batches/${allocation.batchId}`}
                    className="min-w-0 truncate hover:text-teal-500"
                  >
                    <span className="font-mono">{allocation.batch.lotCode}</span>
                    <span className="text-muted-foreground"> · {allocation.batch.species.name}</span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-mono">{allocation.estimatedCount.toLocaleString("tr")}</span>
                    <TransferBatchDialog
                      farmId={farmId}
                      batchId={allocation.batchId}
                      fromTankId={tank.id}
                      lotCode={allocation.batch.lotCode}
                      liveCount={allocation.estimatedCount}
                    />
                    <SplitBatchDialog
                      farmId={farmId}
                      batchId={allocation.batchId}
                      fromTankId={tank.id}
                      lotCode={allocation.batch.lotCode}
                      liveCount={allocation.estimatedCount}
                    />
                    <MergeBatchesDialog
                      farmId={farmId}
                      primaryBatchId={allocation.batchId}
                      primaryFromTankId={tank.id}
                      primaryLotCode={allocation.batch.lotCode}
                      primaryLiveCount={allocation.estimatedCount}
                      speciesId={allocation.batch.speciesId}
                    />
                    <RecordWeightSampleDialog
                      farmId={farmId}
                      batchId={allocation.batchId}
                      tankId={tank.id}
                      lotCode={allocation.batch.lotCode}
                    />
                    <ReportMortalityDialog
                      farmId={farmId}
                      batchId={allocation.batchId}
                      tankId={tank.id}
                      lotCode={allocation.batch.lotCode}
                      liveCount={allocation.estimatedCount}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground/60">Henüz stoklama kaydı yok.</p>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <span className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground">
              <Wheat className="size-3" /> Son yemlemeler
            </span>
            <LogFeedingDialog farmId={farmId} tankId={tank.id} allocations={allocations ?? []} />
          </div>
          {feedLoading ? (
            <Skeleton className="h-6 rounded" />
          ) : feedingEvents && feedingEvents.length > 0 ? (
            <ul className="space-y-1">
              {feedingEvents.slice(0, 3).map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-x-2 text-foreground">
                  <span className="min-w-0 truncate">{event.feedProduct.name}</span>
                  <span className="shrink-0 font-mono">
                    {event.quantityKg} kg · {new Date(event.occurredAt).toLocaleDateString("tr")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground/60">Henüz yem kaydı yok.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
