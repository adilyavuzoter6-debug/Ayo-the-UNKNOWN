"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Lock, Mail } from "lucide-react";
import { PLAN_FEATURE_LABEL, PLAN_LABEL, PlanFeature, planHasFeature, PLAN_LIMITS } from "@aquai/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";
import { useFarms } from "@/hooks/use-farms";
import { CONTACT_EMAIL } from "@/lib/contact";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The company's plan: what it includes, its limits, and how to move up. */
export function PlanCard({ company }: { company: Company }) {
  const { data: farms } = useFarms();
  const [now] = React.useState(() => Date.now());
  const tier = company.planTier;
  const limits = PLAN_LIMITS[tier];
  const trialDaysLeft =
    tier === "TRIAL" && company.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(company.trialEndsAt).getTime() - now) / 86_400_000))
      : null;
  const topPlan = tier === "PROFESSIONAL" || tier === "ENTERPRISE";
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${company.name} — plan değişikliği`)}`;

  return (
    <div id="plan" className="scroll-mt-20">
      <PanelCard title="Plan">
        <div className="space-y-4 px-4.5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-semibold">{PLAN_LABEL[tier]}</span>
            {trialDaysLeft !== null ? (
              <Badge variant={trialDaysLeft <= 7 ? "warning" : "info"}>{trialDaysLeft} gün kaldı</Badge>
            ) : null}
          </div>
          {tier === "TRIAL" ? (
            <p className="text-sm text-muted-foreground">
              Deneme süresince tüm özellikler açık. Süre bitmeden bir plana geçerek kayıtlarınızla devam edin.
            </p>
          ) : null}

          <ul className="space-y-1.5">
            {Object.values(PlanFeature).map((feature) => {
              const included = planHasFeature(tier, feature);
              return (
                <li
                  key={feature}
                  className={cn("flex items-start gap-2 text-sm", included ? "text-foreground" : "text-muted-foreground")}
                >
                  {included ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-teal-500" />
                  ) : (
                    <Lock className="mt-0.5 size-4 shrink-0" />
                  )}
                  {PLAN_FEATURE_LABEL[feature]}
                </li>
              );
            })}
            <li className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-teal-500" />
              {limits.maxFarms === null
                ? "Sınırsız çiftlik ve tank"
                : `${limits.maxFarms} çiftlik, ${limits.maxTanks} tanka kadar` +
                  (farms ? ` (şu an ${farms.length} çiftlik)` : "")}
            </li>
          </ul>

          <div className="flex flex-wrap gap-2 pt-1">
            {!topPlan ? (
              <a href={mailto} className={cn(buttonVariants({ size: "sm" }))}>
                <Mail className="size-4" /> {tier === "TRIAL" ? "Plana geçin" : "Planınızı yükseltin"}
              </a>
            ) : null}
            <Link href="/pricing" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Planları karşılaştırın
            </Link>
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
