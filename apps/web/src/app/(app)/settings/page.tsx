"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useCurrentCompany } from "@/hooks/use-companies";

export default function SettingsPage() {
  const { companyId } = useActiveCompany();
  const { data: company, isLoading } = useCurrentCompany(companyId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Company details for your active workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>Read-only for now — editing arrives in a later milestone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : company ? (
            <dl className="grid grid-cols-[120px_1fr] gap-y-2">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{company.name}</dd>
              <dt className="text-muted-foreground">Country</dt>
              <dd>{company.countryCode}</dd>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd>{company.timezone}</dd>
              <dt className="text-muted-foreground">Plan</dt>
              <dd>{company.planTier}</dd>
            </dl>
          ) : (
            <p className="text-muted-foreground">No company selected.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
