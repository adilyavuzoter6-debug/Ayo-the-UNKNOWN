import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission } from "@aquai/types";
import { PermissionsGuard } from "./permissions.guard";
import type { TenantContext } from "../types/request-context";

function makeContext(tenant: TenantContext | undefined): ExecutionContext {
  const request = { tenant };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  it("allows a route with no @RequirePermission() metadata", () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it("allows a role that has the required permission", () => {
    const reflector = {
      getAllAndOverride: () => Permission.FARM_READ,
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const tenant: TenantContext = {
      companyId: "c1",
      membershipId: "m1",
      role: "FARM_MANAGER",
      farmScopeIds: [],
    };
    expect(guard.canActivate(makeContext(tenant))).toBe(true);
  });

  it("denies a role that lacks the required permission (WORKER cannot create farms)", () => {
    const reflector = {
      getAllAndOverride: () => Permission.FARM_CREATE,
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const tenant: TenantContext = {
      companyId: "c1",
      membershipId: "m1",
      role: "WORKER",
      farmScopeIds: [],
    };
    expect(() => guard.canActivate(makeContext(tenant))).toThrow(ForbiddenException);
  });

  it("denies when no tenant context has been resolved", () => {
    const reflector = {
      getAllAndOverride: () => Permission.FARM_READ,
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
