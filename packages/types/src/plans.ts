/**
 * What each subscription plan includes, as listed on the pricing page. The API enforces it
 * (PlanGuard, and the farm/tank limits in their services) and the web app uses it to show what's
 * locked, from this one map, so the two can't disagree.
 */

export const PLAN_TIERS = ["TRIAL", "STARTER", "STANDARD", "PROFESSIONAL", "ENTERPRISE"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export enum PlanFeature {
  /** Cost entries, recurring costs, cost per kg, cost scenarios. */
  COST_TRACKING = "cost_tracking",
  /** The regulatory inspection report (print and Excel). */
  INSPECTION_REPORT = "inspection_report",
  /** E-mail for critical alerts; alerts themselves are raised on every plan. */
  EMAIL_ALERTS = "email_alerts",
  /** Farm comparison, record export and anomaly detection. */
  ADVANCED_REPORTS = "advanced_reports",
  /** The AI farm assistant: questions about the company's own data, answered by Claude. */
  AI_ASSISTANT = "ai_assistant",
}

const STANDARD_FEATURES = [PlanFeature.COST_TRACKING, PlanFeature.INSPECTION_REPORT, PlanFeature.EMAIL_ALERTS];
const ALL_FEATURES = Object.values(PlanFeature);

export const PLAN_FEATURES: Record<PlanTier, readonly PlanFeature[]> = {
  // A trial shows everything, so the customer can judge the plan they'd need.
  TRIAL: ALL_FEATURES,
  STARTER: [],
  STANDARD: STANDARD_FEATURES,
  PROFESSIONAL: ALL_FEATURES,
  ENTERPRISE: ALL_FEATURES,
};

export interface PlanLimits {
  /** Null means unlimited. */
  maxFarms: number | null;
  maxTanks: number | null;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  TRIAL: { maxFarms: null, maxTanks: null },
  STARTER: { maxFarms: 1, maxTanks: 5 },
  STANDARD: { maxFarms: null, maxTanks: null },
  PROFESSIONAL: { maxFarms: null, maxTanks: null },
  ENTERPRISE: { maxFarms: null, maxTanks: null },
};

export const PLAN_LABEL: Record<PlanTier, string> = {
  TRIAL: "Deneme",
  STARTER: "Başlangıç",
  STANDARD: "Standart",
  PROFESSIONAL: "Profesyonel",
  ENTERPRISE: "Kurumsal",
};

export const PLAN_FEATURE_LABEL: Record<PlanFeature, string> = {
  [PlanFeature.COST_TRACKING]: "Üretim maliyeti takibi",
  [PlanFeature.INSPECTION_REPORT]: "Denetim raporu",
  [PlanFeature.EMAIL_ALERTS]: "Kritik uyarılar için e-posta",
  [PlanFeature.ADVANCED_REPORTS]: "Gelişmiş raporlama (çiftlik karşılaştırması, Excel, anomali tespiti)",
  [PlanFeature.AI_ASSISTANT]: "Yapay zeka çiftlik asistanı",
};

/** Paid plans in ascending order, for "available from X" messages. */
const PAID_ORDER: PlanTier[] = ["STARTER", "STANDARD", "PROFESSIONAL", "ENTERPRISE"];

export function planHasFeature(tier: PlanTier, feature: PlanFeature): boolean {
  return PLAN_FEATURES[tier].includes(feature);
}

/** The cheapest paid plan that includes the feature. */
export function minimumPlanFor(feature: PlanFeature): PlanTier {
  return PAID_ORDER.find((tier) => planHasFeature(tier, feature)) ?? "ENTERPRISE";
}

/** "Denetim raporu Standart ve üzeri planlarda kullanılabilir." */
export function planUpgradeMessage(feature: PlanFeature): string {
  return `${PLAN_FEATURE_LABEL[feature]} ${PLAN_LABEL[minimumPlanFor(feature)]} ve üzeri planlarda kullanılabilir.`;
}
