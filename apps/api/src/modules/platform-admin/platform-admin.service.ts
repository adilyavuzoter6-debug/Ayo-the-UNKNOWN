import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { naturalSortByCode } from "../../common/utils/natural-sort";
import { AuditService } from "../audit/audit.service";
import type { UpdateCompanyPlanDto } from "./dto/update-company-plan.dto";

/** Length of a trial an admin starts or restarts without naming an end date. */
const TRIAL_DAYS = 30;

/**
 * Cross-tenant read models for the platform-admin console — the deliberate exception to
 * TenantPrismaService (see packages/config/src/eslint.nestjs.js for the matching lint
 * exemption). Every route that reaches this service is behind PlatformAdminGuard.
 *
 * Read-only towards customers' production records: the one write is a company's plan
 * (updatePlan), which is how a plan is granted until online payment exists.
 */
@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Lets the client decide whether to show the console at all; the console's routes are guarded independently. */
  async isPlatformAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { isPlatformAdmin: true },
    });
    return user?.isPlatformAdmin === true;
  }

  /**
   * The latest 👍/👎 members gave assistant answers, across all companies, with the share that was
   * 👍 overall: where the assistant falls short, and the examples it could later be improved with.
   */
  async listAssistantFeedback() {
    const [rows, total, helpful] = await Promise.all([
      this.prisma.assistantFeedback.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          question: true,
          answer: true,
          helpful: true,
          comment: true,
          createdAt: true,
          company: { select: { name: true, demoKind: true } },
        },
      }),
      this.prisma.assistantFeedback.count(),
      this.prisma.assistantFeedback.count({ where: { helpful: true } }),
    ]);
    return {
      total,
      helpful,
      entries: rows.map(({ company, ...row }) => ({ ...row, companyName: company.name, isDemo: company.demoKind !== null })),
    };
  }

  /** One row per tenant: the "cari" overview — who is producing what, and how much is standing in their tanks right now. */
  async listCompanies() {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        legalName: true,
        countryCode: true,
        planTier: true,
        status: true,
        trialEndsAt: true,
        createdAt: true,
        _count: { select: { memberships: true, farms: true } },
      },
    });

    // Live stock per company, from the same projection the app itself reads (BatchCurrentState),
    // restricted to batches that still exist and still hold fish.
    const liveStates = await this.prisma.batchCurrentState.findMany({
      where: { estimatedCount: { gt: 0 }, batch: { deletedAt: null } },
      select: {
        estimatedCount: true,
        estimatedBiomassKg: true,
        batch: { select: { companyId: true } },
      },
    });

    const harvests = await this.prisma.harvestRecord.groupBy({
      by: ["companyId"],
      where: { deletedAt: null, type: "ACTUAL" },
      _sum: { biomassKg: true, fishCount: true },
    });

    const liveByCompany = new Map<string, { fishCount: number; biomassKg: number; batches: number }>();
    for (const state of liveStates) {
      const key = state.batch.companyId;
      const acc = liveByCompany.get(key) ?? { fishCount: 0, biomassKg: 0, batches: 0 };
      acc.fishCount += state.estimatedCount;
      acc.biomassKg += Number(state.estimatedBiomassKg);
      acc.batches += 1;
      liveByCompany.set(key, acc);
    }

    const harvestByCompany = new Map(
      harvests.map((h) => [
        h.companyId,
        { biomassKg: Number(h._sum.biomassKg ?? 0), fishCount: h._sum.fishCount ?? 0 },
      ]),
    );

    return companies.map((company) => {
      const live = liveByCompany.get(company.id) ?? { fishCount: 0, biomassKg: 0, batches: 0 };
      const harvested = harvestByCompany.get(company.id) ?? { biomassKg: 0, fishCount: 0 };
      return {
        id: company.id,
        name: company.name,
        legalName: company.legalName,
        countryCode: company.countryCode,
        planTier: company.planTier,
        status: company.status,
        trialEndsAt: company.trialEndsAt,
        createdAt: company.createdAt,
        memberCount: company._count.memberships,
        farmCount: company._count.farms,
        activeBatchCount: live.batches,
        liveFishCount: live.fishCount,
        liveBiomassKg: live.biomassKg,
        // Average weight is derived, not stored: total live biomass over total live fish.
        avgWeightG: live.fishCount > 0 ? (live.biomassKg * 1000) / live.fishCount : null,
        harvestedBiomassKg: harvested.biomassKg,
        harvestedFishCount: harvested.fishCount,
      };
    });
  }

  /**
   * Sets a company's plan, the one write this console makes. A trial gets an end date (30 days
   * from now unless one is given); a paid plan clears it, since it doesn't run out on its own.
   * Recorded in the company's audit log under the admin's user id.
   */
  async updatePlan(companyId: string, adminUserId: string, dto: UpdateCompanyPlanDto) {
    const existing = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { planTier: true, trialEndsAt: true },
    });
    if (!existing) {
      throw new NotFoundException("Company not found.");
    }
    const trialEndsAt =
      dto.planTier === "TRIAL"
        ? dto.trialEndsAt
          ? new Date(dto.trialEndsAt)
          : new Date(Date.now() + TRIAL_DAYS * 86_400_000)
        : null;
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: { planTier: dto.planTier, trialEndsAt },
      select: { id: true, planTier: true, trialEndsAt: true },
    });
    await this.auditService.record({
      companyId,
      userId: adminUserId,
      action: "UPDATE",
      entityType: "CompanyPlan",
      entityId: companyId,
      previousValue: { planTier: existing.planTier, trialEndsAt: existing.trialEndsAt?.toISOString() ?? null },
      newValue: { planTier: company.planTier, trialEndsAt: company.trialEndsAt?.toISOString() ?? null },
    });
    return company;
  }

  /** Drill-down for one tenant: every batch it is holding, at what count and what average weight. */
  async getCompanyDetail(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        legalName: true,
        countryCode: true,
        timezone: true,
        planTier: true,
        status: true,
        trialEndsAt: true,
        createdAt: true,
      },
    });
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const [members, farms, batches, harvests] = await Promise.all([
      this.prisma.companyMembership.findMany({
        where: { companyId, status: "ACTIVE" },
        select: {
          id: true,
          role: true,
          joinedAt: true,
          user: { select: { email: true, fullName: true } },
        },
        orderBy: { joinedAt: "asc" },
      }),
      this.prisma.farm.findMany({
        where: { companyId, deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          _count: { select: { sections: true } },
        },
      }),
      this.prisma.fishBatch.findMany({
        where: { companyId, deletedAt: null },
        select: {
          id: true,
          lotCode: true,
          status: true,
          farmEntryDate: true,
          initialCount: true,
          species: { select: { name: true } },
          currentState: {
            select: { estimatedCount: true, estimatedAvgWeightG: true, estimatedBiomassKg: true },
          },
        },
        orderBy: { farmEntryDate: "desc" },
      }),
      this.prisma.harvestRecord.findMany({
        where: { companyId, deletedAt: null, type: "ACTUAL" },
        select: {
          id: true,
          harvestedAt: true,
          fishCount: true,
          biomassKg: true,
          avgWeightG: true,
          customer: true,
          batch: { select: { lotCode: true } },
        },
        orderBy: { harvestedAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      company,
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        email: m.user.email,
        fullName: m.user.fullName,
      })),
      farms: naturalSortByCode(farms).map((f) => ({
        id: f.id,
        name: f.name,
        code: f.code,
        status: f.status,
        sectionCount: f._count.sections,
      })),
      batches: batches.map((b) => ({
        id: b.id,
        lotCode: b.lotCode,
        status: b.status,
        speciesName: b.species.name,
        farmEntryDate: b.farmEntryDate,
        initialCount: b.initialCount,
        liveCount: b.currentState?.estimatedCount ?? 0,
        avgWeightG: b.currentState ? Number(b.currentState.estimatedAvgWeightG) : null,
        biomassKg: b.currentState ? Number(b.currentState.estimatedBiomassKg) : 0,
      })),
      harvests: harvests.map((h) => ({
        id: h.id,
        harvestedAt: h.harvestedAt,
        lotCode: h.batch.lotCode,
        fishCount: h.fishCount,
        biomassKg: h.biomassKg === null ? null : Number(h.biomassKg),
        avgWeightG: h.avgWeightG === null ? null : Number(h.avgWeightG),
        customer: h.customer,
      })),
    };
  }
}
