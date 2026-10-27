import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Company } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateCompanyDto } from "./dto/create-company.dto";

/**
 * Company is the tenant root, not a tenant-OWNED table (it has no companyId column of its
 * own), so this service legitimately queries `prisma.company` directly rather than through
 * TenantPrismaService — see packages/config/src/eslint.nestjs.js for the matching lint
 * exemption and its rationale.
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Creates a company and makes the creating user its COMPANY_OWNER, atomically. This is the
   * one place in the codebase where a CompanyMembership is created without an already-resolved
   * TenantContext, because the company doesn't exist yet — see @SkipTenantContext() on the
   * calling controller route.
   */
  async createWithOwner(input: CreateCompanyDto, ownerUserId: string): Promise<Company> {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const company = await this.prisma.$transaction(async (tx) => {
      // One company per account: a user may own at most one live company. The advisory lock
      // serializes concurrent create requests from the same user (double-click, two tabs) so
      // both can't pass the check before either commits.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerUserId}))`;
      const alreadyOwns = await tx.companyMembership.findFirst({
        where: {
          userId: ownerUserId,
          role: "COMPANY_OWNER",
          status: "ACTIVE",
          company: { deletedAt: null },
        },
      });
      if (alreadyOwns) {
        throw new ConflictException("Bu hesapla zaten bir firma açılmış. Her hesap yalnızca bir firma açabilir.");
      }

      const created = await tx.company.create({
        data: {
          name: input.name,
          legalName: input.legalName,
          countryCode: input.countryCode.toUpperCase(),
          timezone: input.timezone,
          trialEndsAt,
        },
      });

      await tx.companyMembership.create({
        data: {
          companyId: created.id,
          userId: ownerUserId,
          role: "COMPANY_OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      return created;
    });

    await this.auditService.record({
      companyId: company.id,
      userId: ownerUserId,
      action: "CREATE",
      entityType: "Company",
      entityId: company.id,
      newValue: { name: company.name, countryCode: company.countryCode },
    });

    return company;
  }

  async findByIdForUser(companyId: string, userId: string): Promise<Company> {
    const membership = await this.prisma.companyMembership.findFirst({
      where: { companyId, userId, status: "ACTIVE" },
    });
    // Same NotFoundException-not-ForbiddenException rule as
    // TenantPrismaService.assertOwnedByTenant — see docs/architecture/06-multi-tenant-security.md
    // §6.2 point 3: a mismatch and a nonexistent record must look identical to the caller.
    if (!membership) {
      throw new NotFoundException("Company not found.");
    }
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException("Company not found.");
    }
    return company;
  }

  async listForUser(userId: string): Promise<Company[]> {
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { company: true },
    });
    return memberships.map((m) => m.company);
  }
}
