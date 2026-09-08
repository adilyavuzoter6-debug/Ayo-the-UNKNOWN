"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransferBatchDialog } from "@/components/farms/transfer-batch-dialog";
import { useFarms } from "@/hooks/use-farms";
import { useFarmTanks } from "@/hooks/use-tanks";
import { useTankFishBatches } from "@/hooks/use-fish-batches";
import { useFarmTransfers } from "@/hooks/use-farm-transfers";

function NewTransferPicker({ farmId }: { farmId: string }) {
  const { data: tanks } = useFarmTanks(farmId);
  const [tankId, setTankId] = React.useState("");
  const { data: allocations } = useTankFishBatches(tankId);
  const [batchId, setBatchId] = React.useState("");

  const allocation = allocations?.find((a) => a.batchId === batchId);

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-border px-4.5 py-3.5">
      <div className="w-40">
        <Label className="mb-1 block text-[11px] text-muted-foreground">Kaynak havuz</Label>
        <Select
          value={tankId}
          onValueChange={(v) => {
            setTankId(v ?? "");
            setBatchId("");
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Havuz seçin">
              {(v: string) => tanks?.find((t) => t.id === v)?.code}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(tanks ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-56">
        <Label className="mb-1 block text-[11px] text-muted-foreground">Parti</Label>
        <Select value={batchId} onValueChange={(v) => setBatchId(v ?? "")}>
          <SelectTrigger className="w-full" disabled={!tankId}>
            <SelectValue placeholder="Parti seçin">
              {(v: string) => {
                const a = allocations?.find((x) => x.batchId === v);
                return a ? `${a.batch.lotCode} (${a.estimatedCount.toLocaleString("tr")} balık)` : undefined;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(allocations ?? []).map((a) => (
              <SelectItem key={a.batchId} value={a.batchId}>
                {a.batch.lotCode} ({a.estimatedCount.toLocaleString("tr")} balık)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {allocation ? (
        <TransferBatchDialog
          farmId={farmId}
          batchId={allocation.batchId}
          fromTankId={tankId}
          lotCode={allocation.batch.lotCode}
          liveCount={allocation.estimatedCount}
          trigger={
            <Button size="sm">
              <ArrowLeftRight className="size-3.5" />
              Transfer başlat
            </Button>
          }
        />
      ) : (
        <Button size="sm" disabled>
          <ArrowLeftRight className="size-3.5" />
          Transfer başlat
        </Button>
      )}
    </div>
  );
}

export default function TransfersPage() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState<string>("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");

  const { entries, isLoading } = useFarmTransfers(farmId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            Transferler
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Havuzlar arası balık transferlerini görüntüleyin ve yeni bir transfer başlatın.
          </p>
        </div>
        <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Çiftlik seçin">
              {(v: string) => farms?.find((f) => f.id === v)?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(farms ?? []).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!farmId ? (
        <PanelCard title="Transferler">
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Henüz bir çiftlik yok — önce Çiftlikler sayfasından bir çiftlik oluşturun.
          </p>
        </PanelCard>
      ) : (
        <PanelCard title="Yeni Transfer">
          <NewTransferPicker farmId={farmId} />
        </PanelCard>
      )}

      {farmId ? (
        <PanelCard title="Transfer Geçmişi">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-48 rounded" />
            </div>
          ) : entries.length > 0 ? (
            <ul className="divide-y divide-border">
              {entries.slice(0, 100).map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="size-3.5 shrink-0 text-teal-500" />
                    <Link href={`/batches/${e.batchId}`} className="font-mono text-foreground hover:text-teal-500">
                      {e.lotCode}
                    </Link>
                    <span className="text-muted-foreground">
                      {e.fromTankCode ?? "—"} → {e.toTankCode ?? "—"}
                    </span>
                    {e.notes ? <span className="text-muted-foreground/80">— {e.notes}</span> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-foreground">{e.fishCount.toLocaleString("tr")} adet</span>
                    <span className="font-mono text-muted-foreground">
                      {new Date(e.occurredAt).toLocaleString("tr")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
              Bu çiftlikte henüz transfer kaydı yok.
            </p>
          )}
        </PanelCard>
      ) : null}
    </div>
  );
}
