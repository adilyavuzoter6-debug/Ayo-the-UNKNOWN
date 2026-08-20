"use client";

import * as React from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddCostEntryDialog } from "@/components/costs/add-cost-entry-dialog";
import { useFarms } from "@/hooks/use-farms";
import { useFishBatches } from "@/hooks/use-fish-batches";
import { useFarmCostEntries, useFarmCostSummary } from "@/hooks/use-costs";
import { COST_CATEGORY_LABEL } from "@/lib/costs";
import type { CostCategory } from "@/lib/types";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtTry(n: number): string {
  return n.toLocaleString("tr", { maximumFractionDigits: 2 }) + " ₺";
}

export default function CostsPage() {
  const { data: farms } = useFarms();
  const [selectedFarmId, setSelectedFarmId] = React.useState<string>("");
  const farmId =
    selectedFarmId && farms?.some((f) => f.id === selectedFarmId)
      ? selectedFarmId
      : (farms?.[0]?.id ?? "");

  const { data: batches } = useFishBatches();
  const [periodStart, setPeriodStart] = React.useState(isoDaysAgo(30));
  const [periodEnd, setPeriodEnd] = React.useState(isoDaysAgo(0));

  const { data: summary, isLoading: summaryLoading } = useFarmCostSummary(
    farmId,
    periodStart,
    periodEnd,
  );
  const { data: entries, isLoading: entriesLoading } = useFarmCostEntries(farmId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Maliyetler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Üretim maliyeti takibi — yem, işçilik, ilaç ve diğer giderler.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={farmId} onValueChange={(v) => setSelectedFarmId(v ?? "")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Çiftlik seçin" />
            </SelectTrigger>
            <SelectContent>
              {(farms ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {farmId ? <AddCostEntryDialog farmId={farmId} batches={batches ?? []} /> : null}
        </div>
      </div>

      {!farmId ? (
        <PanelCard title="Maliyet Özeti">
          <p className="flex items-center gap-2 px-4.5 py-10 text-sm text-muted-foreground">
            <Wallet className="size-4" /> Bir çiftlik seçin.
          </p>
        </PanelCard>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">Başlangıç</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">Bitiş</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          {summaryLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : summary ? (
            <>
              <PanelCard title={`Toplam Gider — ${fmtTry(summary.totalAmount)}`}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4.5 py-4 text-xs sm:grid-cols-4">
                  {Object.entries(summary.byCategory).length > 0 ? (
                    Object.entries(summary.byCategory).map(([category, amount]) => (
                      <div key={category}>
                        <div className="mb-0.5 text-muted-foreground">
                          {COST_CATEGORY_LABEL[category as CostCategory]}
                        </div>
                        <div className="font-mono font-medium text-foreground">
                          {fmtTry(amount ?? 0)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="col-span-full text-center text-muted-foreground">
                      Bu dönemde gider kaydı yok.
                    </p>
                  )}
                </div>
              </PanelCard>

              {summary.batchBreakdown.length > 0 ? (
                <PanelCard title="Parti Bazlı Doğrudan Maliyet / kg">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parti</TableHead>
                          <TableHead>Doğrudan maliyet</TableHead>
                          <TableHead>Hasat edilen</TableHead>
                          <TableHead>Maliyet / kg</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.batchBreakdown.map((row) => (
                          <TableRow key={row.batchId}>
                            <TableCell>
                              <Link href={`/batches/${row.batchId}`} className="font-mono text-teal-500 hover:underline">
                                {row.lotCode}
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono">{fmtTry(row.directCostTotal)}</TableCell>
                            <TableCell className="font-mono">{row.harvestedKg.toFixed(1)} kg</TableCell>
                            <TableCell className="font-mono font-medium">
                              {row.directCostPerKg !== null ? `${row.directCostPerKg.toFixed(2)} ₺/kg` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="border-t border-border px-4.5 py-2.5 text-[11px] text-muted-foreground">
                    Yalnızca partiye doğrudan etiketlenmiş maliyetleri içerir (yem, ilaç vb.) — elektrik/genel gider gibi çiftlik geneli maliyetler dahil değildir.
                  </p>
                </PanelCard>
              ) : null}
            </>
          ) : null}

          <PanelCard title="Gider Kayıtları">
            {entriesLoading ? (
              <div className="p-4">
                <Skeleton className="h-32 rounded" />
              </div>
            ) : entries && entries.length > 0 ? (
              <ul className="divide-y divide-border">
                {entries.slice(0, 100).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {COST_CATEGORY_LABEL[e.category]}
                      </span>
                      {e.sourceType ? (
                        <span className="text-muted-foreground/80">(otomatik)</span>
                      ) : null}
                      {e.notes ? <span className="text-muted-foreground">— {e.notes}</span> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium text-foreground">
                        {fmtTry(Number(e.amount))}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {new Date(e.incurredAt).toLocaleDateString("tr")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
                Bu çiftlikte henüz gider kaydı yok.
              </p>
            )}
          </PanelCard>
        </>
      )}
    </div>
  );
}
