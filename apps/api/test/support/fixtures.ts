import { PrismaClient } from "@prisma/client";
import { ROLES, type Role } from "@aquai/types";

/** Deletes all rows the isolation suite could have written, in FK-safe order. Idempotent. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.feedingEvent.deleteMany();
  await prisma.waterQualityReading.deleteMany();
  await prisma.harvestRecord.deleteMany();
  await prisma.biomassSnapshot.deleteMany();
  await prisma.weightSample.deleteMany();
  await prisma.mortalityEvent.deleteMany();
  await prisma.feedInventoryBalance.deleteMany();
  await prisma.feedInventoryTransaction.deleteMany();
  await prisma.feedInventoryBatch.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.feedProduct.deleteMany();
  await prisma.batchMovement.deleteMany();
  await prisma.batchTankState.deleteMany();
  await prisma.batchCurrentState.deleteMany();
  await prisma.fishBatch.deleteMany();
  await prisma.fishSpecies.deleteMany();
  await prisma.tank.deleteMany();
  await prisma.farmSection.deleteMany();
  await prisma.membershipFarmScope.deleteMany();
  await prisma.farm.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.companyMembership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
}

/** A global (companyId: null) reference species every tenant can stock against. */
export async function seedFishSpecies(prisma: PrismaClient): Promise<string> {
  const species = await prisma.fishSpecies.create({
    data: { name: "Test Salmon", companyId: null },
  });
  return species.id;
}

/** A feed product + one warehouse (in the given farm) every tenant can receive stock into. */
export async function seedFeedCatalog(
  prisma: PrismaClient,
  companyId: string,
  farmId: string,
): Promise<{ feedProductId: string; warehouseId: string }> {
  const product = await prisma.feedProduct.create({
    data: { companyId, name: "Test Feed 6mm" },
  });
  const warehouse = await prisma.warehouse.create({
    data: { companyId, farmId, name: "Test Warehouse" },
  });
  return { feedProductId: product.id, warehouseId: warehouse.id };
}

export interface TenantFixture {
  companyId: string;
  farmId: string;
  farmCode: string;
  sectionId: string;
  tankId: string;
  tankCode: string;
  /** Bearer token (== authProviderId) for this company's COMPANY_OWNER. */
  ownerToken: string;
}

/** Seeds one company with an owner + one farm + one section + one tank, mirroring prisma/seed.ts. */
export async function seedTenant(prisma: PrismaClient, suffix: string): Promise<TenantFixture> {
  const company = await prisma.company.create({
    data: { name: `Test Co ${suffix.toUpperCase()}`, countryCode: "NO", timezone: "Europe/Oslo" },
  });

  const ownerToken = `owner-${suffix}`;
  const owner = await prisma.user.create({
    data: {
      authProviderId: ownerToken,
      email: `owner-${suffix}@test.aquai.local`,
      fullName: `Owner ${suffix.toUpperCase()}`,
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

  const farmCode = `FARM-${suffix.toUpperCase()}1`;
  const farm = await prisma.farm.create({
    data: { companyId: company.id, name: `Main Farm ${suffix.toUpperCase()}`, code: farmCode },
  });

  const section = await prisma.farmSection.create({
    data: { companyId: company.id, farmId: farm.id, name: "Section 1" },
  });

  const tankCode = "A1";
  const tank = await prisma.tank.create({
    data: { companyId: company.id, farmSectionId: section.id, code: tankCode, type: "TANK" },
  });

  return {
    companyId: company.id,
    farmId: farm.id,
    farmCode,
    sectionId: section.id,
    tankId: tank.id,
    tankCode,
    ownerToken,
  };
}

/** A user with a verifiable identity but no CompanyMembership anywhere — for the 403 "no active membership" case. */
export async function seedUnaffiliatedUser(prisma: PrismaClient): Promise<string> {
  const token = "unaffiliated-user";
  await prisma.user.create({
    data: { authProviderId: token, email: "unaffiliated@test.aquai.local", fullName: "Nobody" },
  });
  return token;
}

/**
 * One membership per Role (docs/architecture/07-roles-permissions-matrix.md) inside `companyId`,
 * each its own user — CompanyMembership is unique on (companyId, userId), so the permission
 * matrix needs a distinct user per role under test, not one user switching roles.
 */
export async function seedRoleMemberships(
  prisma: PrismaClient,
  companyId: string,
): Promise<Record<Role, string>> {
  const tokens = {} as Record<Role, string>;

  for (const role of ROLES) {
    const token = `role-${role.toLowerCase()}`;
    const user = await prisma.user.create({
      data: {
        authProviderId: token,
        email: `${token}@test.aquai.local`,
        fullName: `Role ${role}`,
      },
    });
    await prisma.companyMembership.create({
      data: { companyId, userId: user.id, role, status: "ACTIVE", joinedAt: new Date() },
    });
    tokens[role] = token;
  }

  return tokens;
}
