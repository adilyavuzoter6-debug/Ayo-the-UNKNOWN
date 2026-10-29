import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ApiErrorCode, planHasFeature, planUpgradeMessage, type PlanFeature } from "@aquai/types";
import { REQUIRE_PLAN_FEATURE_KEY } from "../decorators/require-plan-feature.decorator";
import type { TenantContext } from "../types/request-context";

/**
 * Refuses a route whose @RequirePlanFeature the company's plan doesn't include, with a
 * PLAN_UPGRADE_REQUIRED error the web app turns into an upgrade prompt. Runs after
 * TenantContextGuard (which resolves the plan) and PermissionsGuard (a role without access gets
 * the plain 403 first, not an upsell).
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(REQUIRE_PLAN_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const tenant = context.switchToHttp().getRequest<Request & { tenant?: TenantContext }>().tenant;
    if (!tenant) {
      throw new ForbiddenException("No tenant context resolved for this request.");
    }
    if (!planHasFeature(tenant.planTier, feature)) {
      throw new ForbiddenException({
        code: ApiErrorCode.PLAN_UPGRADE_REQUIRED,
        message: planUpgradeMessage(feature),
      });
    }
    return true;
  }
}
