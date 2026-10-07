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
import { useSectionTanks } from "@/hooks/use-tanks";
import { ApiError } from "@/lib/api-error";
import { TANK_STATUS_LABEL, TANK_TYPE_LABEL } from "@/lib/tanks";
import type { FarmSection, Tank, TankStatus } from "@/lib/types";

const STATUS_VARIANT: Record<TankStatus, "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  MAINTENANCE: "outline",
};

export function SectionCard({ farmId, section }: { farmId: string; section: FarmSection }) {
  const { data: tanks, isLoading } = useSectionTanks(section.id);
  const deleteSection = useDeleteFarmSection(farmId);
  const [selectedTank, setSelectedTank] = React.useState<Tank | null>(null);
  // Collapsed by default — a farm with several blocks/facilities shouldn't dump every one of
  // their ponds on screen at once. Each card opens on its own.
  const [expanded, setExpanded] = React.useState(false);

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
          {!expanded ? <SectionSummary tanks={tanks} isLoading={isLoading} /> : null}
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
        <CardContent>
          {isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          ) : tanks && tanks.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tanks.map((tank) => (
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
                      <p className="text-xs text-muted-foreground">{TANK_TYPE_LABEL[tank.type]}</p>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[tank.status]} className="text-[10px]">
                    {TANK_STATUS_LABEL[tank.status]}
                  </Badge>
                </button>
              ))}
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

/** What a collapsed block shows without opening it: how many ponds, and their status if mixed. */
function SectionSummary({ tanks, isLoading }: { tanks: Tank[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-4 w-24" />;
  }
  if (!tanks || tanks.length === 0) {
    return <span className="shrink-0 text-xs text-muted-foreground">Havuz yok</span>;
  }
  const byStatus = tanks.reduce<Partial<Record<TankStatus, number>>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const allSameStatus = Object.keys(byStatus).length === 1;

  return (
    <span className="ml-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">{tanks.length} havuz</span>
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
    </span>
  );
}
