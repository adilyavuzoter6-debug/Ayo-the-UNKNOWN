"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { AlertTriangle, Bell, ChevronDown, HelpCircle, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AppSidebarContent } from "@/components/layout/app-sidebar";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { resolveNavTitle } from "@/lib/nav-items";

export function AppTopbar() {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const pathname = usePathname();
  const title = resolveNavTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-5" />
            </Button>
          }
        />
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Navigasyon</SheetTitle>
          <AppSidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="hidden items-center gap-2 md:flex">
        <CompanySwitcher compact />
        {/* Farm selector — cosmetic only for now, not wired to any global filter yet. */}
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/60"
        >
          Tüm Çiftlikler
          <ChevronDown className="size-3" />
        </button>
      </div>

      <h1 className="flex-1 truncate font-display text-sm font-semibold text-foreground md:text-base">
        {title}
      </h1>

      <div className="relative hidden lg:block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Ara..."
          className="h-8 w-48 rounded-md border border-border bg-muted/40 pr-3 pl-8 text-xs text-foreground outline-none transition-colors focus:border-teal-500"
        />
      </div>

      <button
        type="button"
        aria-label="Bildirimler"
        className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/60"
      >
        <Bell className="size-4" />
        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full border border-card bg-destructive" />
      </button>

      <button
        type="button"
        className="hidden items-center gap-1.5 rounded-md border border-warning/40 bg-warning/15 px-2.5 py-1.5 text-xs font-semibold text-warning sm:flex"
      >
        <AlertTriangle className="size-3.5" />
        3 Kritik Uyarı
      </button>

      <button
        type="button"
        aria-label="Yardım"
        className="hidden size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/60 sm:flex"
      >
        <HelpCircle className="size-4" />
      </button>

      <UserButton />
    </header>
  );
}
