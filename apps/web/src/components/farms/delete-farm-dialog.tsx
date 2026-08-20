"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useDeleteFarm } from "@/hooks/use-farms";
import { ApiError } from "@/lib/api-error";
import type { Farm } from "@/lib/types";

export function DeleteFarmDialog({
  farm,
  trigger,
  onDeleted,
}: {
  farm: Farm;
  trigger?: React.ReactElement;
  onDeleted?: () => void;
}) {
  const deleteFarm = useDeleteFarm();

  async function onDelete() {
    try {
      await deleteFarm.mutateAsync(farm.id);
      toast.success(`Çiftlik "${farm.name}" silindi.`);
      onDeleted?.();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Çiftlik silinirken bir sorun oluştu.",
      );
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon-sm" aria-label="Çiftliği sil">
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          )
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>&quot;{farm.name}&quot; silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>
            Bu çiftlik yumuşak silinir (soft delete) ve artık çiftlik listenizde görünmez. Bu
            işlem arayüzden geri alınamaz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            Sil
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
