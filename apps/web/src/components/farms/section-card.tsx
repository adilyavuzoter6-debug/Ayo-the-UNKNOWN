"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Layers, Trash2, Waves } from "lucide-react";
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
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <Layers className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle className="truncate text-base">{section.name}</CardTitle>
          {!expanded ? <SectionSummary tanks={tanks} rows={rows} isLoading={rowsLoading} /> : null}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
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
        <CardContent className="space-y-3">
          {rowsLoading ? (
            <Skeleton className="h-4 w-48" />
          ) : (
            <SectionSummary tanks={tanks} rows={rows} isLoading={false} detailed />
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
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60"
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

/**
 * What a block shows about itself: pond count and status collapsed, plus biomass, live fish and a
 * stocked/empty split once opened. The same arithmetic the Üretim Birimleri tab uses, scoped to this
 * block's own ponds.
 */
function SectionSummary({
  tanks,
  rows,
  isLoading,
  detailed,
}: {
  tanks: Tank[];
  rows: TankProductionRow[];
  isLoading: boolean;
  detailed?: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-4 w-24" />;
  }
  if (tanks.length === 0) {
    return <span className="shrink-0 text-xs text-muted-foreground">Havuz yok</span>;
  }

  const summary = summarizeFarmProduction(rows.map(({ tank, allocations }) => tankLoad(tank, allocations)));
  const byStatus = tanks.reduce<Partial<Record<TankStatus, number>>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const allSameStatus = Object.keys(byStatus).length === 1;
  const statusBadges = allSameStatus ? (
    <Badge variant={STATUS_VARIANT[tanks[0]!.status]} className="shrink-0 text-[10px]">
      {TANK_STATUS_LABEL[tanks[0]!.status]}
    </Badge>
  ) : (
    (Object.entries(byStatus) as [TankStatus, number][]).map(([status, count]) => (
      <Badge key={status} variant={STATUS_VARIANT[status]} className="shrink-0 text-[10px]">
        {count} {TANK_STATUS_LABEL[status]}
      </Badge>
    ))
  );

  if (!detailed) {
    return (
      <span className="ml-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">{tanks.length} havuz</span>
        {summary.liveFish > 0 ? (
          <span className="shrink-0 font-mono">
            {(summary.biomassKg / 1000).toFixed(2)} t · {summary.liveFish.toLocaleString("tr")} balık
          </span>
        ) : null}
        {statusBadges}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="font-mono font-medium text-foreground">{tanks.length}</span> havuz ·{" "}
        <span className="font-mono font-medium text-foreground">{summary.stockedCount}</span> dolu ·{" "}
        <span className="font-mono font-medium text-foreground">{summary.emptyCount}</span> boş
      </span>
      <span>
        Biyokütle:{" "}
        <span className="font-mono font-medium text-teal-500">{(summary.biomassKg / 1000).toFixed(2)} t</span>
      </span>
      <span>
        Canlı balık:{" "}
        <span className="font-mono font-medium text-foreground">{summary.liveFish.toLocaleString("tr")}</span>
      </span>
      {summary.avgWeightG !== null ? (
        <span>
          Ort. ağırlık:{" "}
          <span className="font-mono font-medium text-foreground">
            {Math.round(summary.avgWeightG).toLocaleString("tr")} g
          </span>
        </span>
      ) : null}
    </div>
  );
}
