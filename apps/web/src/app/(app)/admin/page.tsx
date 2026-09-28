"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Fish, ShieldAlert } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminCompanies, useIsPlatformAdmin } from "@/hooks/use-admin";

function fmt(n: number, digits = 0) {
  return n.toLocaleString("tr", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export default function AdminPage() {
  const { data: me, isLoading: meLoading } = useIsPlatformAdmin();
  const { data: companies, isLoading, isError } = useAdminCompanies();
  const [query, setQuery] = React.useState("");

  if (meLoading) {
    return <Skeleton className="h-64 rounded-lg" />;
  }

  if (!me?.isPlatformAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <ShieldAlert className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Bu sayfa yalnızca platform yöneticileri içindir.
          </p>
        </CardContent>
      </Card>
    );
  }

  const filtered = (companies ?? []).filter((c) =>
    query.trim() ? c.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  const totals = filtered.reduce(
    (acc, c) => ({
      liveFishCount: acc.liveFishCount + c.liveFishCount,
      liveBiomassKg: acc.liveBiomassKg + c.liveBiomassKg,
      harvestedBiomassKg: acc.harvestedBiomassKg + c.harvestedBiomassKg,
    }),
    { liveFishCount: 0, liveBiomassKg: 0, harvestedBiomassKg: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            Platform Yönetimi
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sistemdeki tüm işletmeler ve üretim durumları.
          </p>
        </div>
        <Input
          placeholder="Firma ara…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-56 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="İşletme" value={fmt(filtered.length)} icon={Building2} />
        <Stat label="Toplam canlı balık" value={fmt(totals.liveFishCount)} icon={Fish} />
        <Stat label="Toplam biyokütle" value={`${fmt(totals.liveBiomassKg, 1)} kg`} accent />
        <Stat label="Toplam hasat" value={`${fmt(totals.harvestedBiomassKg, 1)} kg`} />
      </div>

      <PanelCard title="İşletmeler">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-48 rounded" />
          </div>
        ) : isError ? (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Liste yüklenemedi.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">
            Kayıtlı işletme yok.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Üye</TableHead>
                  <TableHead className="text-right">Çiftlik</TableHead>
                  <TableHead className="text-right">Parti</TableHead>
                  <TableHead className="text-right">Canlı balık</TableHead>
                  <TableHead className="text-right">Ort. ağırlık</TableHead>
                  <TableHead className="text-right">Biyokütle</TableHead>
                  <TableHead className="text-right">Toplam hasat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/admin/${c.id}`}
                        className="font-medium text-foreground hover:text-teal-500"
                      >
                        {c.name}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {c.countryCode} · {new Date(c.createdAt).toLocaleDateString("tr")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.planTier === "TRIAL" ? "secondary" : "default"} className="text-[10px]">
                        {c.planTier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.memberCount}</TableCell>
                    <TableCell className="text-right font-mono">{c.farmCount}</TableCell>
                    <TableCell className="text-right font-mono">{c.activeBatchCount}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(c.liveFishCount)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {c.avgWeightG !== null ? `${fmt(c.avgWeightG, 0)} g` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-teal-500">
                      {fmt(c.liveBiomassKg, 1)} kg
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(c.harvestedBiomassKg, 1)} kg
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </div>
      <div
        className={`truncate font-mono text-lg font-semibold ${accent ? "text-teal-500" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
