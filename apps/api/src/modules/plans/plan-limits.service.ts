import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  ApiErrorCode,
  PLAN_LABEL,
  PLAN_LIMITS,
  planHasFeature,
  type PlanFeature,
  type PlanTier,
} from "@aquai/types";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";

/**
 * Plan checks that aren't a whole route (those use @RequirePlanFeature): how many farms and tanks
 * a plan allows, and whether a company's plan includes a feature that's a side effect of another
 * action, like e-mailing an alert.
 */
@Injectable()
export class PlanLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async planOf(companyId: string): Promise<PlanTier> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { planTier: true },
    });
    return company.planTier;
  }

  async hasFeature(companyId: string, feature: PlanFeature): Promise<boolean> {
    return planHasFeature(await this.planOf(companyId), feature);
  }

  /** Refuses one more farm or tank when the plan's limit is already reached. */
  async assertCanAdd(companyId: string, kind: "farm" | "tank"): Promise<void> {
    const tier = await this.planOf(companyId);
    const limit = kind === "farm" ? PLAN_LIMITS[tier].maxFarms : PLAN_LIMITS[tier].maxTanks;
    if (limit === null) return;

    const client = this.tenantPrisma.forTenant(companyId);
    const count =
      kind === "farm"
        ? await client.farm.count({ where: { deletedAt: null } })
        : await client.tank.count({ where: { deletedAt: null, farmSection: { farm: { deletedAt: null } } } });
    if (count >= limit) {
      const what = kind === "farm" ? `${limit} çiftlik` : `${limit} tank`;
      throw new ForbiddenException({
        code: ApiErrorCode.PLAN_UPGRADE_REQUIRED,
        message: `${PLAN_LABEL[tier]} planı en fazla ${what} içerir. Daha fazlası için Standart veya üzeri bir plana geçin.`,
      });
    }
  }
}
