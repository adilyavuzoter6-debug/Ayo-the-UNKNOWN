// @ts-check
const base = require("./eslint.base");

/**
 * ESLint config for apps/api (NestJS).
 *
 * Enforces the tenant-scoping convention from docs/architecture/06-multi-tenant-security.md
 * §6.2: services must go through the tenant-scoped Prisma helper (TenantPrismaService),
 * never call `this.prisma.<model>.<method>()` directly, so a forgotten companyId filter
 * can't compile. The helper itself (and its own tests) are exempted below.
 */
module.exports = [
  ...base,
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.type='ThisExpression'][property.name='prisma']",
          message:
            "Do not access this.prisma directly in a module service. Use the tenant-scoped repository helper (TenantPrismaService.forTenant(companyId)) so every query is structurally forced to filter by tenant. See docs/architecture/06-multi-tenant-security.md §6.2.",
        },
      ],
    },
  },
  {
    // Exempted: tenant-prisma.service.ts itself, tests, prisma/ tooling, and the two modules
    // whose primary models are NOT tenant-scoped (Company is the tenant; User is a global
    // identity keyed by authProviderId, scoped to a company only via CompanyMembership, which
    // IS tenant-scoped and must go through TenantPrismaService inside those same modules).
    files: [
      "**/tenant-prisma.service.ts",
      "**/tenant-context.guard.ts",
      "**/*.spec.ts",
      "**/*.e2e-spec.ts",
      "**/prisma/**",
      "**/modules/users/users.service.ts",
      "**/modules/companies/companies.service.ts",
      "**/modules/webhooks/clerk-webhooks.service.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];
