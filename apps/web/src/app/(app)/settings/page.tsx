"use client";

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
        <p className="mt-0.5 text-sm text-muted-foreground">Şirketiniz, planınız ve balık türleriniz.</p>
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

      <SpeciesSection />
    </div>
  );
}
