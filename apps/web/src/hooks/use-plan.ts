"use client";

import { PLAN_LIMITS, planHasFeature, type PlanFeature, type PlanTier } from "@aquai/types";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useCurrentCompany } from "@/hooks/use-companies";

/**
 * The active company's plan and what it includes (packages/types/src/plans.ts). Until the company
 * has loaded every feature reads as included, so nothing flashes locked; the API enforces the plan
 * either way.
 */
export function usePlan() {
  const { companyId } = useActiveCompany();
  const { data: company } = useCurrentCompany(companyId);
  const tier = company?.planTier as PlanTier | undefined;
  return {
    tier,
    has: (feature: PlanFeature) => (tier ? planHasFeature(tier, feature) : true),
    limits: tier ? PLAN_LIMITS[tier] : null,
  };
}
