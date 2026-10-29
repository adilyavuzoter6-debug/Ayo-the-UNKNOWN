"use client";

import * as React from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Droplets, HeartPulse, Wheat } from "lucide-react";
import type { FarmDashboardKpis } from "@/lib/types";

function greeting(hour: number) {
  if (hour < 5) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

const ACTIONS = [
  { href: "/feeding", label: "Yemleme kaydı", icon: Wheat },
  { href: "/health", label: "Ölüm kaydı", icon: HeartPulse },
  { href: "/water-quality", label: "Su ölçümü", icon: Droplets },
];

/** The dashboard's opening band: who and where, the farm at a glance, and the day's three records. */
export function DashboardHero({ farmName, kpis }: { farmName?: string; kpis?: FarmDashboardKpis }) {
  const { user } = useUser();
  // Read once on mount: the clock isn't render input.
  const [now] = React.useState(() => new Date());
  const fmt = (n: number, digits = 0) => n.toLocaleString("tr", { maximumFractionDigits: digits });

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 px-5 py-5 text-white sm:px-6">
      {/* Soft water-light accents in the brand teal. */}
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-teal-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-white/60">
            {now.toLocaleDateString("tr", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <h1 className="mt-1 font-display text-xl font-bold tracking-tight sm:text-2xl">
            {greeting(now.getHours())}
            {user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          {farmName ? (
            <p className="mt-1 text-sm text-white/70">
              <span className="font-medium text-white">{farmName}</span>
              {kpis ? (
                <>
                  {" "}· {fmt(kpis.fishCount)} canlı balık · {fmt(kpis.biomassKg / 1000, 1)} t biyokütle ·{" "}
                  {kpis.activeBatchesCount} aktif parti
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white ring-1 ring-white/15 transition-colors hover:bg-white/20"
            >
              <a.icon className="size-3.5 text-teal-400" />
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
