"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useMyCompanies } from "@/hooks/use-companies";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The real app silhouette (sidebar is data-free, so it paints immediately) instead of one line
 * of centered text — and after a few seconds, an honest note, because the API runs on a plan
 * that sleeps when idle and can take up to a minute to answer the first request. A minute of
 * blank screen reads as "broken"; a minute of skeletons plus an explanation reads as "slow".
 */
function WorkspaceLoading() {
  const [takingLong, setTakingLong] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setTakingLong(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <div className="h-14 shrink-0 border-b border-border bg-card" />
        <main className="flex-1 space-y-4 bg-muted/20 p-4 md:p-6">
          <Skeleton className="h-7 w-52 rounded" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-lg" />
          {takingLong ? (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              Sunucu uykudan uyanıyor — ilk açılış bir dakikayı bulabilir.
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}

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

  // Only truly block when there's nothing to render against. A returning user already has their
  // company id in localStorage, so the shell and navigation can paint immediately while
  // /companies is still in flight — each page brings its own skeletons, and the API re-validates
  // membership on every single request anyway (TenantContextGuard), so rendering ahead of that
  // response can't expose anything: a stale company id just yields 403/404s the effect above
  // then corrects.
  if (!isReady || !companyId) {
    return <WorkspaceLoading />;
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
