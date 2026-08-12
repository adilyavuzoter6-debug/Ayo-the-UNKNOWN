import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { TenantContext } from "../types/request-context";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<Request & { tenant: TenantContext }>();
    return request.tenant;
  },
);
