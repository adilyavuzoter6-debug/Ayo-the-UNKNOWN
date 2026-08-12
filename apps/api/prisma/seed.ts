import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds two companies with a farm/section/tank each, used by local dev and reused by the
 * cross-tenant isolation integration test suite (docs/architecture/13-testing-strategy.md §13.4)
 * so that suite and manual QA share one fixture instead of drifting apart.
 */
async function main(): Promise<void> {
  const companyA = await prisma.company.create({
    data: {
      name: "Fjord Trout Co. (A)",
      countryCode: "NO",
      timezone: "Europe/Oslo",
      planTier: "PROFESSIONAL",
    },
  });

  const companyB = await prisma.company.create({
    data: {
      name: "Anadolu Alabalık A.Ş. (B)",
      countryCode: "TR",
      timezone: "Europe/Istanbul",
      planTier: "STANDARD",
    },
  });

  for (const [company, suffix] of [
    [companyA, "a"],
    [companyB, "b"],
  ] as const) {
    const owner = await prisma.user.create({
      data: {
        authProviderId: `seed-owner-${suffix}`,
        email: `owner-${suffix}@example.com`,
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

    const farm = await prisma.farm.create({
      data: {
        companyId: company.id,
        name: `Main Farm ${suffix.toUpperCase()}`,
        code: `FARM-${suffix.toUpperCase()}1`,
        timezone: company.timezone,
      },
    });

    const section = await prisma.farmSection.create({
      data: {
        companyId: company.id,
        farmId: farm.id,
        name: "Section 1",
      },
    });

    await prisma.tank.create({
      data: {
        companyId: company.id,
        farmSectionId: section.id,
        code: "A1",
        type: "TANK",
      },
    });
  }

  console.log("Seed complete:", { companyA: companyA.id, companyB: companyB.id });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
