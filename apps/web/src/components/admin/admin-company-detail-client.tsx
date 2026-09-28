"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Fish, Scissors, Users } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminCompany } from "@/hooks/use-admin";
import { ROLE_LABEL } from "@/lib/roles";

function fmt(n: number, digits = 0) {
  return n.toLocaleString("tr", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

const BATCH_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktif",
  PARTIALLY_HARVESTED: "Kısmen hasat",
  HARVESTED: "Hasat edildi",
  CLOSED: "Kapalı",
};

export function AdminCompanyDetailClient({ companyId }: { companyId: string }) {
  const { data, isLoading, isError } = useAdminCompany(companyId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          İşletme bulunamadı ya da bu sayfaya erişim yetkiniz yok.
        </CardContent>
      </Card>
    );
  }

  const { company, members, farms, batches, harvests } = data;
  const liveFish = batches.reduce((sum, b) => sum + b.liveCount, 0);
  const liveBiomass = batches.reduce((sum, b) => sum + b.biomassKg, 0);
  const harvestedKg = harvests.reduce((sum, h) => sum + (h.biomassKg ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Tüm işletmeler
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-2xl font-bold tracking-tight">{company.name}</h1>
          <Badge variant={company.planTier === "TRIAL" ? "secondary" : "default"}>
            {company.planTier}
          </Badge>
          <Badge variant="outline">{company.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {company.legalName ? `${company.legalName} · ` : ""}
          {company.countryCode} · {company.timezone} · Kayıt:{" "}
          {new Date(company.createdAt).toLocaleDateString("tr")}
          {company.trialEndsAt
            ? ` · Deneme bitişi: ${new Date(company.trialEndsAt).toLocaleDateString("tr")}`
            : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Canlı balık" value={fmt(liveFish)} icon={Fish} />
        <Stat label="Canlı biyokütle" value={`${fmt(liveBiomass, 1)} kg`} accent />
        <Stat label="Toplam hasat" value={`${fmt(harvestedKg, 1)} kg`} icon={Scissors} />
        <Stat label="Çiftlik / Üye" value={`${farms.length} / ${members.length}`} icon={Building2} />
      </div>

      <PanelCard title="Partiler — elde ne kadar, kaç gramda">
        {batches.length === 0 ? (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">Parti kaydı yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Giriş adedi</TableHead>
                  <TableHead className="text-right">Canlı adet</TableHead>
                  <TableHead className="text-right">Ort. ağırlık</TableHead>
                  <TableHead className="text-right">Biyokütle</TableHead>
                  <TableHead className="text-right">Giriş tarihi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono">{b.lotCode}</TableCell>
                    <TableCell>{b.speciesName}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {BATCH_STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {fmt(b.initialCount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(b.liveCount)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {b.avgWeightG !== null ? `${fmt(b.avgWeightG, 0)} g` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-teal-500">
                      {fmt(b.biomassKg, 1)} kg
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {new Date(b.farmEntryDate).toLocaleDateString("tr")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelCard title="Hasat geçmişi">
          {harvests.length === 0 ? (
            <p className="px-4.5 py-8 text-center text-sm text-muted-foreground">
              Gerçekleşmiş hasat yok.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {harvests.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4.5 py-2.5 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    {h.harvestedAt ? new Date(h.harvestedAt).toLocaleDateString("tr") : "—"}
                  </span>
                  <span className="font-mono text-foreground">{h.lotCode}</span>
                  <span className="text-muted-foreground">
                    {h.fishCount !== null ? `${fmt(h.fishCount)} adet` : "—"}
                    {h.avgWeightG !== null ? ` · ${fmt(h.avgWeightG, 0)} g` : ""}
                    {h.customer ? ` · ${h.customer}` : ""}
                  </span>
                  <span className="font-mono font-medium text-teal-500">
                    {h.biomassKg !== null ? `${fmt(h.biomassKg, 1)} kg` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard title="Kullanıcılar & çiftlikler">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4.5 py-2.5 text-xs"
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  <Users className="size-3 text-muted-foreground" />
                  {m.fullName}
                </span>
                <span className="text-muted-foreground">{m.email}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {ROLE_LABEL[m.role] ?? m.role}
                </Badge>
              </li>
            ))}
            {farms.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-muted/20 px-4.5 py-2.5 text-xs"
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  <Building2 className="size-3 text-muted-foreground" />
                  {f.name}
                </span>
                <span className="font-mono text-muted-foreground">{f.code}</span>
                <span className="text-muted-foreground">{f.sectionCount} tesis</span>
              </li>
            ))}
          </ul>
        </PanelCard>
      </div>
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
