"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_NAV_ITEMS, SETTINGS_NAV_ITEM } from "@/lib/nav-items";

function isActive(pathname: string | null, href: string) {
  return pathname === href || pathname?.startsWith(`${href}/`);
}

export function AppSidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border overflow-hidden",
          collapsed ? "justify-center px-0" : "px-5",
        )}
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-teal-500">
          <Waves className="size-4 text-white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap text-white">
            Piscatio
          </span>
        )}
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-2">
        {ALL_NAV_ITEMS.filter((item) => item.id !== "settings").map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 border-l-[3px] py-2.5 text-sm transition-colors",
                collapsed ? "justify-center px-0" : "px-5",
                active
                  ? "border-l-teal-400 bg-teal-500/15 font-semibold text-white"
                  : "border-l-transparent text-white/55 hover:text-white/85",
              )}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2 : 1.5} />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-sidebar-border py-2", collapsed ? "px-0" : "px-2")}>
        {(() => {
          const active = isActive(pathname, SETTINGS_NAV_ITEM.href);
          const Icon = SETTINGS_NAV_ITEM.icon;
          return (
            <Link
              href={SETTINGS_NAV_ITEM.href}
              onClick={onNavigate}
              title={collapsed ? SETTINGS_NAV_ITEM.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md py-2.5 text-sm transition-colors",
                collapsed ? "justify-center px-0" : "px-3",
                active
                  ? "bg-teal-500/15 font-semibold text-white"
                  : "text-white/55 hover:text-white/85",
              )}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2 : 1.5} />
              {!collapsed && <span className="whitespace-nowrap">{SETTINGS_NAV_ITEM.label}</span>}
            </Link>
          );
        })()}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        "hidden shrink-0 transition-[width] duration-200 ease-in-out md:flex md:flex-col",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <AppSidebarContent collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex shrink-0 items-center justify-center gap-2 border-t border-sidebar-border bg-sidebar py-2.5 text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
    </aside>
  );
}
