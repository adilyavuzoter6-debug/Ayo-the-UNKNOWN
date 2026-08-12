import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

export interface SeededTenant {
  companyId: string;
  ownerAuthProviderId: string;
  ownerUserId: string;
  farmId: string;
}

/**
 * Creates one fully-isolated company (owner user + membership + farm) per call, with
 * randomized identifiers so parallel test runs never collide. Used by
 * test/tenant-isolation.integration-spec.ts to build two independent tenants (A, B) per run.
 */
export async function seedTenant(prisma: PrismaClient, label: string): Promise<SeededTenant> {
  const runId = randomUUID().slice(0, 8);

  const company = await prisma.company.create({
    data: {
      name: `Isolation Test Co ${label} ${runId}`,
      countryCode: "US",
      timezone: "UTC",
    },
  });

  const authProviderId = `test-auth|${label}|${runId}`;
  const owner = await prisma.user.create({
    data: {
      authProviderId,
      email: `${label}-${runId}@isolation-test.local`,
      fullName: `Owner ${label}`,
    },
  });

  await prisma.companyMembership.create({
    data: {
      companyId: company.id,
      userId: owner.id,
      role: "COMPANY_OWNER",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  const farm = await prisma.farm.create({
    data: {
      companyId: company.id,
      name: `Farm ${label} ${runId}`,
      code: `F-${label}-${runId}`.toUpperCase(),
      timezone: "UTC",
    },
  });

  return {
    companyId: company.id,
    ownerAuthProviderId: authProviderId,
    ownerUserId: owner.id,
    farmId: farm.id,
  };
}

export async function cleanupTenant(prisma: PrismaClient, tenant: SeededTenant): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { companyId: tenant.companyId } });
  await prisma.farm.deleteMany({ where: { companyId: tenant.companyId } });
  await prisma.invitation.deleteMany({ where: { companyId: tenant.companyId } });
  await prisma.companyMembership.deleteMany({ where: { companyId: tenant.companyId } });
  await prisma.company.delete({ where: { id: tenant.companyId } });
  await prisma.user.delete({ where: { id: tenant.ownerUserId } });
}
