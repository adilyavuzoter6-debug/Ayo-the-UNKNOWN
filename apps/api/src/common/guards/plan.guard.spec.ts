import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiErrorCode, PlanFeature, type PlanTier } from "@aquai/types";
import { PlanGuard } from "./plan.guard";
import type { TenantContext } from "../types/request-context";

function makeContext(planTier: PlanTier | undefined): ExecutionContext {
  const tenant: TenantContext | undefined = planTier
    ? { companyId: "c1", membershipId: "m1", role: "COMPANY_OWNER", farmScopeIds: [], planTier }
    : undefined;
  const request = { tenant };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const guardFor = (feature: PlanFeature | undefined) =>
  new PlanGuard({ getAllAndOverride: () => feature } as unknown as Reflector);

describe("PlanGuard", () => {
  it("allows a route that names no plan feature, even without a tenant", () => {
    expect(guardFor(undefined).canActivate(makeContext(undefined))).toBe(true);
  });

  it("allows plans that include the feature, trials included", () => {
    expect(guardFor(PlanFeature.COST_TRACKING).canActivate(makeContext("STANDARD"))).toBe(true);
    expect(guardFor(PlanFeature.ADVANCED_REPORTS).canActivate(makeContext("TRIAL"))).toBe(true);
    expect(guardFor(PlanFeature.ADVANCED_REPORTS).canActivate(makeContext("PROFESSIONAL"))).toBe(true);
  });

  it("refuses a plan without the feature with PLAN_UPGRADE_REQUIRED and the plan to move to", () => {
    let error: unknown;
    try {
      guardFor(PlanFeature.INSPECTION_REPORT).canActivate(makeContext("STARTER"));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      code: ApiErrorCode.PLAN_UPGRADE_REQUIRED,
      message: "Denetim raporu Standart ve üzeri planlarda kullanılabilir.",
    });
    expect(() => guardFor(PlanFeature.ADVANCED_REPORTS).canActivate(makeContext("STANDARD"))).toThrow(
      ForbiddenException,
    );
  });

  it("denies when no tenant context has been resolved", () => {
    expect(() => guardFor(PlanFeature.COST_TRACKING).canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
