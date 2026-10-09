"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Fish, Layers, Trash2, Waves, Weight } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateTankDialog } from "@/components/tanks/create-tank-dialog";
import { TankDetailsSheet } from "@/components/tanks/tank-details-sheet";
import { EditSectionDialog } from "@/components/farms/edit-section-dialog";
import { OverviewStat } from "@/components/farms/overview-stat";
import { BlockDailyEntryDialog } from "@/components/farms/block-daily-entry-dialog";
import { BlockTreatmentDialog } from "@/components/farms/block-treatment-dialog";
import { useDeleteFarmSection } from "@/hooks/use-farm-sections";
import type { TankProductionRow } from "@/hooks/use-production-overview";
import { ApiError } from "@/lib/api-error";
import { summarizeFarmProduction, tankLoad } from "@/lib/farm-production-summary";
import { TANK_STATUS_LABEL, TANK_TYPE_LABEL } from "@/lib/tanks";
import type { FarmSection, Tank, TankStatus } from "@/lib/types";

const STATUS_VARIANT: Record<TankStatus, "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  MAINTENANCE: "outline",
};

/** One accent color per block, so a farm with several blocks reads as distinct cards, not one grey
 *  list. Picked deterministically from the section id — the same block keeps its color across visits. */
const BLOCK_COLORS = ["#14b8a6", "#8b5cf6", "#f59e0b", "#3b82f6", "#ec4899", "#10b981", "#ef4444", "#06b6d4"];
function blockColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BLOCK_COLORS[hash % BLOCK_COLORS.length]!;
}

export function SectionCard({
  farmId,
  section,
  rows,
  rowsLoading,
}: {
  farmId: string;
  section: FarmSection;
  /** This block's tanks, each with its live stock — already filtered to this section by the caller. */
  rows: TankProductionRow[];
  rowsLoading: boolean;
}) {
  const deleteSection = useDeleteFarmSection(farmId);
  const [selectedTank, setSelectedTank] = React.useState<Tank | null>(null);
  // Collapsed by default — a farm with several blocks/facilities shouldn't dump every one of
  // their ponds on screen at once. Each card opens on its own.
  const [expanded, setExpanded] = React.useState(false);
  const tanks = rows.map((r) => r.tank);
  const accent = blockColor(section.id);

  async function onDeleteSection() {
    try {
      await deleteSection.mutateAsync(section.id);
      toast.success(`"${section.name}" bölümü silindi.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Bölüm silinirken bir sorun oluştu.",
      );
    }
  }

  return (
    <Card className="overflow-hidden py-0">
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}55)` }}
        aria-hidden
      />
      <CardHeader className="flex items-center justify-between gap-3 px-4.5 py-4 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1f` }}
          >
            <Layers className="size-5" style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{section.name}</CardTitle>
            <div className="mt-1">
              <SectionChips tanks={tanks} rows={rows} isLoading={rowsLoading} accent={accent} />
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <EditSectionDialog farmId={farmId} section={section} />
          <CreateTankDialog farmId={farmId} sectionId={section.id} />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Bölümü sil">
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>&quot;{section.name}&quot; bölümü silinsin mi?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bu işlem bölümü yumuşak siler. Bu çiftliğin yerleşiminde artık görünmez.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDeleteSection}>
                  Sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      {expanded ? (
        <CardContent className="space-y-4 border-t border-border bg-muted/20 px-4.5 py-4">
          {rowsLoading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <BlockDetailStats tanks={tanks} rows={rows} />
              {rows.some((r) => r.allocations.length > 0) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <BlockDailyEntryDialog farmId={farmId} rows={rows} />
                  <BlockTreatmentDialog farmId={farmId} rows={rows} />
                </div>
              ) : null}
            </>
          )}
          {rowsLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          ) : tanks.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(({ tank, allocations }) => {
                const load = tankLoad(tank, allocations);
                return (
                  <button
                    key={tank.id}
                    type="button"
                    onClick={() => setSelectedTank(tank)}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-teal-500/40 hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <Waves className="size-4 text-muted-foreground" />
                      <div>
                        <p className="font-mono text-sm font-medium">{tank.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {load.count > 0
                            ? `${load.count.toLocaleString("tr")} balık · ${(load.biomassKg / 1000).toFixed(2)} t`
                            : TANK_TYPE_LABEL[tank.type]}
                        </p>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[tank.status]} className="text-[10px]">
                      {TANK_STATUS_LABEL[tank.status]}
                    </Badge>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Bu bölümde henüz havuz yok.</p>
          )}
        </CardContent>
      ) : null}

      <TankDetailsSheet
        farmId={farmId}
        sectionId={section.id}
        tank={selectedTank}
        open={selectedTank !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTank(null);
        }}
      />
    </Card>
  );
}

/** A small colored pill: an icon and a value, tinted with the block's own accent or a status color. */
function Chip({
  icon: Icon,
  text,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <Icon className="size-3" />
      {text}
    </span>
  );
}

/** The collapsed line: pond count, biomass and live fish as colored chips, plus status. */
function SectionChips({
  tanks,
  rows,
  isLoading,
  accent,
}: {
  tanks: Tank[];
  rows: TankProductionRow[];
  isLoading: boolean;
  accent: string;
}) {
  if (isLoading) {
    return <Skeleton className="h-4 w-40" />;
  }
  if (tanks.length === 0) {
    return <span className="text-xs text-muted-foreground">Havuz yok</span>;
  }

  const summary = summarizeFarmProduction(rows.map(({ tank, allocations }) => tankLoad(tank, allocations)));
  const byStatus = tanks.reduce<Partial<Record<TankStatus, number>>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const allSameStatus = Object.keys(byStatus).length === 1;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip icon={Waves} color={accent} text={`${tanks.length} havuz`} />
      {summary.liveFish > 0 ? (
        <>
          <Chip icon={Weight} color="#14b8a6" text={`${(summary.biomassKg / 1000).toFixed(2)} t`} />
          <Chip icon={Fish} color="#8b5cf6" text={summary.liveFish.toLocaleString("tr")} />
        </>
      ) : null}
      {allSameStatus ? (
        <Badge variant={STATUS_VARIANT[tanks[0]!.status]} className="shrink-0 text-[10px]">
          {TANK_STATUS_LABEL[tanks[0]!.status]}
        </Badge>
      ) : (
        (Object.entries(byStatus) as [TankStatus, number][]).map(([status, count]) => (
          <Badge key={status} variant={STATUS_VARIANT[status]} className="shrink-0 text-[10px]">
            {count} {TANK_STATUS_LABEL[status]}
          </Badge>
        ))
      )}
    </div>
  );
}

/** The opened block's own overview row — the same tiles the farm's Genel Bakış tab uses, scoped to
 *  just this block's ponds. */
function BlockDetailStats({ tanks, rows }: { tanks: Tank[]; rows: TankProductionRow[] }) {
  const summary = summarizeFarmProduction(rows.map(({ tank, allocations }) => tankLoad(tank, allocations)));
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      <OverviewStat icon={Waves} label="Havuz" value={`${summary.stockedCount}/${tanks.length} dolu`} />
      <OverviewStat icon={Fish} label="Canlı Balık" value={summary.liveFish.toLocaleString("tr")} />
      <OverviewStat icon={Weight} label="Biyokütle" value={`${(summary.biomassKg / 1000).toFixed(2)} t`} accent />
      <OverviewStat
        label="Ort. Ağırlık"
        value={summary.avgWeightG !== null ? `${Math.round(summary.avgWeightG).toLocaleString("tr")} g` : "—"}
      />
      <OverviewStat
        label="Kapasite"
        value={summary.capacityUsedPct !== null ? `%${Math.round(summary.capacityUsedPct)}` : "—"}
        warn={summary.capacityUsedPct !== null && summary.capacityUsedPct >= 80}
      />
    </div>
  );
}

