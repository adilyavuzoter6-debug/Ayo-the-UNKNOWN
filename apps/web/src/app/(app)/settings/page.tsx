"use client";

import Link from "next/link";
import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpeciesSection } from "@/components/settings/species-section";
import { PlanCard } from "@/components/settings/plan-card";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useCurrentCompany } from "@/hooks/use-companies";

export default function SettingsPage() {
  const { companyId } = useActiveCompany();
  const { data: company, isLoading } = useCurrentCompany(companyId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Ayarlar</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Şirketiniz, planınız, balık türleriniz ve veri aktarma.</p>
      </div>

      <PanelCard title="Şirket">
        <div className="px-4.5 py-4 text-sm">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : company ? (
            <dl className="grid grid-cols-[120px_1fr] gap-y-2">
              <dt className="text-muted-foreground">Ad</dt>
              <dd className="font-medium">{company.name}</dd>
              {company.legalName ? (
                <>
                  <dt className="text-muted-foreground">Ünvan</dt>
                  <dd>{company.legalName}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Ülke</dt>
              <dd>{company.countryCode}</dd>
              <dt className="text-muted-foreground">Saat dilimi</dt>
              <dd>{company.timezone}</dd>
            </dl>
          ) : (
            <p className="text-muted-foreground">Şirket seçilmedi.</p>
          )}
        </div>
      </PanelCard>

      {company ? <PlanCard company={company} /> : null}

      <Link
        href="/settings/import"
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4.5 py-4 transition hover:border-teal-500/60 hover:bg-teal-500/5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10">
          <FileSpreadsheet className="size-4.5 text-teal-500" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Excel&apos;den veri aktarma</span>
          <span className="block text-xs text-muted-foreground">
            Çiftlik, tank ve partilerinizi ve geçmiş kayıtlarınızı tek dosyayla aktarın.
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

      <SpeciesSection />
    </div>
  );
}
