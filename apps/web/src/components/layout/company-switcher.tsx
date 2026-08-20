"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useMyCompanies } from "@/hooks/use-companies";

export function CompanySwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { companyId, setCompanyId } = useActiveCompany();
  const { data: companies, isLoading } = useMyCompanies();

  const active = companies?.find((c) => c.id === companyId);

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-border bg-muted/40 text-muted-foreground",
          compact ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm",
        )}
      >
        Şirketler yükleniyor…
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-md border border-border bg-card font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              compact ? "h-8 px-2.5 text-xs" : "h-10 w-full px-3 text-sm",
            )}
          >
            {compact ? (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-navy-900 text-[9px] font-bold text-white">
                {active?.name?.[0]?.toUpperCase() ?? "?"}
              </span>
            ) : (
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn("truncate text-left", !compact && "flex-1")}>
              {active ? active.name : "Şirket seçin"}
            </span>
            <ChevronsUpDown className={cn("shrink-0 text-muted-foreground", compact ? "size-3" : "size-4")} />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Şirketler</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {companies?.length ? (
          companies.map((company) => (
            <DropdownMenuItem key={company.id} onSelect={() => setCompanyId(company.id)}>
              <span className="flex-1 truncate">{company.name}</span>
              {company.id === companyId ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">Henüz şirket yok</div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/onboarding")}>
          <Plus className="size-4" />
          Yeni şirket
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
