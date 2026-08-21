"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useMyCompanies } from "@/hooks/use-companies";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { companyId, setCompanyId, isReady } = useActiveCompany();
  const { data: companies, isLoading: companiesLoading } = useMyCompanies();

  React.useEffect(() => {
    if (!isReady || companiesLoading) return;

    if (!companies || companies.length === 0) {
      router.replace("/onboarding");
      return;
    }

    const stillMember = companyId && companies.some((c) => c.id === companyId);
    if (!stillMember) {
      // No company selected yet, or the previously-selected one is no longer valid — default to
      // the first company rather than blocking the user with an empty screen.
      setCompanyId(companies[0]!.id);
    }
  }, [isReady, companiesLoading, companies, companyId, setCompanyId, router]);

  if (!isReady || companiesLoading || !companyId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      </div>
    );
  }

  const activeCompany = companies?.find((c) => c.id === companyId);
  const trialExpired =
    activeCompany?.planTier === "TRIAL" &&
    !!activeCompany.trialEndsAt &&
    new Date(activeCompany.trialEndsAt) < new Date();

  if (trialExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="font-display text-lg font-semibold text-foreground">
            Deneme süreniz sona erdi
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {activeCompany.name} için 30 günlük ücretsiz deneme süreniz doldu. Hesabınızı
            etkinleştirmek için bizimle iletişime geçin.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <a
              href="mailto:destek@piscatiotechnologies.com"
              className={cn(buttonVariants({ variant: "default" }), "w-full")}
            >
              Bizimle iletişime geçin
            </a>
            <SignOutButton>
              <button className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Çıkış Yap
              </button>
            </SignOutButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppTopbar />
        <main className="flex-1 bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
