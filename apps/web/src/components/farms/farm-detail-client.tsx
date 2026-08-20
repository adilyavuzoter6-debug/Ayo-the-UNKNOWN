"use client";

import type * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Fish, MapPin, Sprout, Weight, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, type StatusKind } from "@/components/shared/status-badge";
import { PlaceholderPage } from "@/components/shared/placeholder-page";
import { CreateSectionDialog } from "@/components/farms/create-section-dialog";
import { SectionCard } from "@/components/farms/section-card";
import { StocksTab } from "@/components/farms/stocks-tab";
import { EditFarmDialog } from "@/components/farms/edit-farm-dialog";
import { DeleteFarmDialog } from "@/components/farms/delete-farm-dialog";
import { useFarm } from "@/hooks/use-farms";
import { useFarmSections } from "@/hooks/use-farm-sections";
import { useFarmTanks } from "@/hooks/use-tanks";
import { useFarmStockSummary } from "@/hooks/use-farm-stock-summary";
import { TANK_TYPE_LABEL } from "@/lib/tanks";
import type { Farm, TankStatus } from "@/lib/types";

const TANK_STATUS_KIND: Record<TankStatus, StatusKind> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  MAINTENANCE: "warning",
};

const DETAIL_TABS = [
  { value: "overview", label: "Genel Bakış" },
  { value: "facilities", label: "Tesisler" },
  { value: "production", label: "Üretim Birimleri" },
  { value: "staff", label: "Personel" },
  { value: "water", label: "Su Kalitesi" },
  { value: "stocks", label: "Stoklar" },
  { value: "reports", label: "Raporlar" },
  { value: "settings", label: "Ayarlar" },
];

export function FarmDetailClient({ farmId }: { farmId: string }) {
  const { data: farm, isLoading: farmLoading, isError: farmError } = useFarm(farmId);

  if (farmLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (farmError || !farm) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Çiftlik bulunamadı.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/farms"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Tüm çiftlikler
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight">{farm.name}</h1>
              <StatusBadge status={farm.status === "ACTIVE" ? "active" : "inactive"} />
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Sprout className="size-3.5" />
                <span className="font-mono">{farm.code}</span>
              </span>
              {farm.timezone ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {farm.timezone}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        {/* Single scrollable row instead of h-auto+flex-wrap: with 8 tabs, wrapping to a
            second row fought the base TabsList's fixed group-data-horizontal/tabs:h-8 and
            could clip/overlap the wrapped row depending on which utility won the cascade. */}
        <TabsList className="w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
          {DETAIL_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="shrink-0 rounded-md border border-transparent px-3 py-1.5 text-xs data-active:border-border data-active:bg-card data-active:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewStats farmId={farmId} />
        </TabsContent>

        <TabsContent value="facilities" className="mt-4">
          <FacilitiesTab farmId={farmId} />
        </TabsContent>

        <TabsContent value="production" className="mt-4">
          <ProductionUnitsTab farmId={farmId} />
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <PlaceholderPage title="Personel" />
        </TabsContent>
        <TabsContent value="water" className="mt-4">
          <PlaceholderPage title="Su Kalitesi" />
        </TabsContent>
        <TabsContent value="stocks" className="mt-4">
          <StocksTab farmId={farmId} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <PlaceholderPage title="Raporlar" />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <FarmSettingsTab farm={farm} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FarmSettingsTab({ farm }: { farm: Farm }) {
  const router = useRouter();

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Çiftlik bilgileri</CardTitle>
          <CardDescription>Ad, kod ve saat dilimini güncelleyin.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5 text-sm">
            <p className="truncate font-medium text-foreground">{farm.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {farm.code}
              {farm.timezone ? ` · ${farm.timezone}` : ""}
            </p>
          </div>
          <EditFarmDialog
            farm={farm}
            trigger={
              <Button variant="outline" size="sm" className="shrink-0">
                Düzenle
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Tehlikeli bölge</CardTitle>
          <CardDescription>
            Bu çiftliği silmek, tüm tesis/havuz görünürlüğünü kaldırır (yumuşak silme). Bu işlem
            arayüzden geri alınamaz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteFarmDialog
            farm={farm}
            trigger={
              <Button variant="destructive" size="sm">
                Çiftliği sil
              </Button>
            }
            onDeleted={() => router.push("/farms")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewStats({ farmId }: { farmId: string }) {
  const { data: stats, isLoading } = useFarmStockSummary(farmId);

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <OverviewStat label="Tesis / Havuz" value={`${stats.facilities} / ${stats.pools}`} />
      <OverviewStat icon={Fish} label="Canlı Balık" value={stats.fishCount.toLocaleString("tr")} />
      <OverviewStat icon={Weight} label="Biyokütle" value={`${(stats.biomassKg / 1000).toFixed(1)} t`} accent />
      <OverviewStat icon={Wheat} label="Günlük Yem" value={`${stats.todayFeedKg.toLocaleString("tr")} kg`} />
      <OverviewStat
        icon={AlertTriangle}
        label="Açık Uyarı"
        value={stats.openAlertsCount.toLocaleString("tr")}
        warn={stats.openAlertsCount > 0}
      />
    </div>
  );
}

function OverviewStat({
  icon: Icon,
  label,
  value,
  accent,
  warn,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const valueClass = warn ? "text-warning" : accent ? "text-teal-500" : "text-foreground";
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="mb-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
        {Icon && <Icon className="size-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`truncate font-mono text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function FacilitiesTab({ farmId }: { farmId: string }) {
  const { data: sections, isLoading: sectionsLoading } = useFarmSections(farmId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Tesisler ve havuzlar
        </h2>
        <CreateSectionDialog farmId={farmId} />
      </div>

      {sectionsLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : sections && sections.length > 0 ? (
        <div className="space-y-4">
          {sections.map((section) => (
            <SectionCard key={section.id} farmId={farmId} section={section} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Sprout className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Henüz tesis yok</p>
              <p className="text-sm text-muted-foreground">
                Havuz eklemeye başlamak için bu çiftliğe bir tesis ekleyin.
              </p>
            </div>
            <CreateSectionDialog farmId={farmId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProductionUnitsTab({ farmId }: { farmId: string }) {
  const { data: tanks, isLoading } = useFarmTanks(farmId);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!tanks || tanks.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          Bu çiftlikte henüz üretim birimi (havuz/kafes/tank) yok.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tanks.map((tank) => (
        <Card key={tank.id} className="gap-0 overflow-hidden py-0">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="font-mono text-sm font-bold text-navy-900">{tank.code}</span>
            <StatusBadge status={TANK_STATUS_KIND[tank.status]} />
          </div>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2.5 py-3.5 text-xs">
            <div>
              <div className="mb-0.5 text-muted-foreground">Tür</div>
              <div className="font-medium text-foreground">{TANK_TYPE_LABEL[tank.type]}</div>
            </div>
            <div>
              <div className="mb-0.5 text-muted-foreground">Hacim</div>
              <div className="font-mono font-medium text-foreground">
                {tank.volumeM3 ? `${tank.volumeM3} m³` : "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="mb-0.5 text-muted-foreground">Maks. Biyokütle</div>
              <div className="font-mono font-medium text-foreground">
                {tank.maxBiomassKg ? `${tank.maxBiomassKg} kg` : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
