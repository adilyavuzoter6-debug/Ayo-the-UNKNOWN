import { SetMetadata } from "@nestjs/common";
import type { PlanFeature } from "@aquai/types";

export const REQUIRE_PLAN_FEATURE_KEY = "requiredPlanFeature";

/**
 * Declares which plan feature (packages/types/src/plans.ts) a route or a whole controller needs.
 * Checked by PlanGuard against the company's plan, after PermissionsGuard has checked the role.
 */
export const RequirePlanFeature = (feature: PlanFeature): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_PLAN_FEATURE_KEY, feature);
