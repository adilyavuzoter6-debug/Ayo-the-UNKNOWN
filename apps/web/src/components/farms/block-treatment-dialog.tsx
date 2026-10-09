"use client";

import * as React from "react";
import { Syringe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordTreatmentDialog } from "@/components/health/record-treatment-dialog";
import type { TankProductionRow } from "@/hooks/use-production-overview";

/**
 * Block-level shortcut for "İlaç gir": pick which pond in this block first, then the real
 * RecordTreatmentDialog opens for it — so a treatment can be logged without leaving the block
 * card and navigating to the Sağlık & Ölüm page.
 */
export function BlockTreatmentDialog({ farmId, rows }: { farmId: string; rows: TankProductionRow[] }) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [tankId, setTankId] = React.useState("");

  const stocked = rows.filter((r) => r.allocations.length > 0);
  const selected = stocked.find((r) => r.tank.id === tankId);

  return (
    <>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <Syringe className="size-3.5" />
              Tedavi / İlaç gir
            </Button>
          }
        />
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Hangi havuz?</DialogTitle>
            <DialogDescription>Tedavi veya ilaç kaydı eklenecek havuzu seçin.</DialogDescription>
          </DialogHeader>
          {stocked.length > 0 ? (
            <Select
              value={tankId}
              onValueChange={(v) => {
                setTankId(v ?? "");
                setPickerOpen(false);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Havuz seçin">
                  {(v: string) => stocked.find((r) => r.tank.id === v)?.tank.code}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {stocked.map((r) => (
                  <SelectItem key={r.tank.id} value={r.tank.id}>
                    {r.tank.code} — {r.allocations[0]!.batch.lotCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">Bu blokta stoklu havuz yok.</p>
          )}
        </DialogContent>
      </Dialog>

      {selected ? (
        <RecordTreatmentDialog
          farmId={farmId}
          tankId={selected.tank.id}
          allocations={selected.allocations}
          open
          onOpenChange={(open) => {
            if (!open) setTankId("");
          }}
        />
      ) : null}
    </>
  );
}
