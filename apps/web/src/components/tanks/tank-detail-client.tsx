"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Droplets,
  Fish,
  Scale,
  Settings,
  Skull,
  Wheat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import { PanelCard } from "@/components/shared/panel-card";
import { MetricTile } from "@/components/shared/metric-tile";
import { CapacityBar } from "@/components/tanks/capacity-bar";
import { TankDetailsSheet } from "@/components/tanks/tank-details-sheet";
import { useTank } from "@/hooks/use-tanks";
import { useTankFishBatches } from "@/hooks/use-fish-batches";
import { useTankWaterQualityReadings } from "@/hooks/use-water-quality";
import { useTankMortalityEvents } from "@/hooks/use-mortality-events";
import { useTankWeightSamples } from "@/hooks/use-weight-samples";
import { useTankFeedingEvents } from "@/hooks/use-feeding-events";
import {
  MORTALITY_REASON_LABEL,
  SAMPLE_METHOD_LABEL,
  TANK_STATUS_LABEL,
  TANK_TYPE_LABEL,
} from "@/lib/tanks";
import type { TankStatus } from "@/lib/types";

const TANK_STATUS_KIND: Record<TankStatus, StatusKind> = {
  ACTIVE: "active",
  MAINTENANCE: "warning",
  INACTIVE: "inactive",
};

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
      <Icon className="size-3.5" />
      {title}
    </h2>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

export function TankDetailClient({ farmId, tankId }: { farmId: string; tankId: string }) {
  const { data: tank, isLoading: tankLoading, isError: tankError } = useTank(tankId);
  const { data: allocations, isLoading: batchesLoading } = useTankFishBatches(tankId);
  const { data: readings, isLoading: readingsLoading } = useTankWaterQualityReadings(tankId);
  const { data: mortalityEvents, isLoading: mortalityLoading } = useTankMortalityEvents(tankId);
  const { data: weightSamples, isLoading: weightLoading } = useTankWeightSamples(tankId);
  const { data: feedingEvents, isLoading: feedingLoading } = useTankFeedingEvents(tankId);
  const [editOpen, setEditOpen] = React.useState(false);

  if (tankLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (tankError || !tank) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptySection text="Havuz bulunamadı." />
      </div>
    );
  }

  const totalFishCount = (allocations ?? []).reduce((sum, a) => sum + a.estimatedCount, 0);
  const totalBiomassKg = (allocations ?? []).reduce((sum, a) => {
    const avgWeightG = Number(
      a.batch.currentState?.estimatedAvgWeightG ?? a.batch.initialAvgWeightG,
    );
    return sum + (a.estimatedCount * avgWeightG) / 1000;
  }, 0);
  const maxBiomassKg = tank.maxBiomassKg ? Number(tank.maxBiomassKg) : null;
  const latestReading = readings?.[0];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/farms/${farmId}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Çiftliğe dön
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
                {tank.code}
              </h1>
              <StatusBadge
                status={TANK_STATUS_KIND[tank.status]}
                label={TANK_STATUS_LABEL[tank.status]}
              />
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Droplets className="size-3.5" />
              {TANK_TYPE_LABEL[tank.type]}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Settings className="size-3.5" />
            Düzenle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Canlı Balık" value={totalFishCount.toLocaleString("tr")} />
        <Stat label="Biyokütle" value={`${totalBiomassKg.toFixed(1)} kg`} accent />
        <Stat
          label="Hacim"
          value={tank.volumeM3 ? `${Number(tank.volumeM3).toLocaleString("tr")} m³` : "—"}
        />
        <Stat label="Aktif Parti" value={String(allocations?.length ?? 0)} />
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Kapasite kullanımı</span>
            <span className="text-muted-foreground">
              {totalBiomassKg.toFixed(0)} kg
              {maxBiomassKg ? ` / ${maxBiomassKg.toLocaleString("tr")} kg` : ""}
            </span>
          </div>
          <CapacityBar biomassKg={totalBiomassKg} maxBiomassKg={maxBiomassKg} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <SectionHeader icon={Fish} title="Balık partileri" />
        {batchesLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : allocations && allocations.length > 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-border">
              {allocations.map((a) => {
                const avgWeightG = Number(
                  a.batch.currentState?.estimatedAvgWeightG ?? a.batch.initialAvgWeightG,
                );
                const biomassKg = (a.estimatedCount * avgWeightG) / 1000;
                return (
                  <li
                    key={a.batchId}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-xs"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/batches/${a.batchId}`}
                        className="font-mono font-medium text-teal-500 hover:underline"
                      >
                        {a.batch.lotCode}
                      </Link>
                      <p className="mt-0.5 text-muted-foreground">{a.batch.species.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 font-mono text-foreground">
                      <span>{a.estimatedCount.toLocaleString("tr")} balık</span>
                      <span>{avgWeightG.toFixed(0)} g</span>
                      <span className="font-medium text-teal-500">{biomassKg.toFixed(1)} kg</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <EmptySection text="Bu havuzda şu anda balık yok." />
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeader icon={Droplets} title="Su kalitesi" />
          <Link href="/water-quality" className="text-xs font-medium text-teal-500 hover:underline">
            Tüm ölçümler →
          </Link>
        </div>
        {readingsLoading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : latestReading ? (
          <PanelCard title={`Son ölçüm — ${new Date(latestReading.occurredAt).toLocaleString("tr")}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <MetricTile label="Sıcaklık" value={latestReading.temperatureC} unit="°C" />
              <MetricTile label="Çözünmüş O₂" value={latestReading.dissolvedOxygenMgL} unit="mg/L" />
              <MetricTile label="pH" value={latestReading.ph} />
              <MetricTile label="Tuzluluk" value={latestReading.salinityPpt} unit="‰" />
            </div>
          </PanelCard>
        ) : (
          <EmptySection text="Henüz su kalitesi ölçümü yok." />
        )}
      </div>

      <div className="space-y-3">
        <SectionHeader icon={Scale} title="Büyüme örneklemeleri" />
        {weightLoading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : weightSamples && weightSamples.length > 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-border">
              {weightSamples.slice(0, 8).map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    {new Date(s.occurredAt).toLocaleDateString("tr")}
                  </span>
                  <span className="text-foreground">
                    {SAMPLE_METHOD_LABEL[s.sampleMethod]} · {s.sampleSize} örnek
                  </span>
                  <span className="font-mono font-medium text-teal-500">
                    {Number(s.avgWeightG).toFixed(1)} g
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptySection text="Henüz ağırlık örneklemesi yok." />
        )}
      </div>

      <div className="space-y-3">
        <SectionHeader icon={Skull} title="Ölüm kayıtları" />
        {mortalityLoading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : mortalityEvents && mortalityEvents.length > 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-border">
              {mortalityEvents.slice(0, 8).map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    {new Date(m.occurredAt).toLocaleDateString("tr")}
                  </span>
                  <span className="text-foreground">
                    {MORTALITY_REASON_LABEL[m.reason]}
                    {m.notes ? ` — ${m.notes}` : ""}
                  </span>
                  <span className="font-mono font-medium text-destructive">
                    {m.fishCount.toLocaleString("tr")} balık
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptySection text="Bu havuzda ölüm kaydı yok." />
        )}
      </div>

      <div className="space-y-3">
        <SectionHeader icon={Wheat} title="Son yemlemeler" />
        {feedingLoading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : feedingEvents && feedingEvents.length > 0 ? (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-border">
              {feedingEvents.slice(0, 8).map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    {new Date(f.occurredAt).toLocaleString("tr")}
                  </span>
                  <span className="text-foreground">{f.feedProduct.name}</span>
                  <span className="font-mono font-medium text-foreground">
                    {Number(f.quantityKg).toFixed(1)} kg
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptySection text="Henüz yemleme kaydı yok." />
        )}
      </div>

      <TankDetailsSheet
        farmId={farmId}
        sectionId={tank.farmSectionId}
        tank={tank}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-1 truncate text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`truncate font-mono text-lg font-semibold ${accent ? "text-teal-500" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
