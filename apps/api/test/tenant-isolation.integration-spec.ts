import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { TOKEN_VERIFIER, type TokenVerifier } from "../src/modules/auth/token-verifier";
import { cleanupTenant, seedTenant, type SeededTenant } from "./utils/seed-tenants";

/**
 * The release-gate suite described in docs/architecture/13-testing-strategy.md §13.4 and
 * docs/architecture/06-multi-tenant-security.md §6.6: proves a Company A user can never reach
 * Company B's data, including by manually substituting a Company B id into an
 * otherwise-valid Company A-authenticated request.
 *
 * Requires a real PostgreSQL reachable via DATABASE_URL (see apps/api/.env.example) with
 * migrations applied — run via `pnpm test:integration`. CI provisions this with a Postgres
 * service container (see .github/workflows/ci.yml).
 *
 * Auth is faked by overriding the TOKEN_VERIFIER provider (modules/auth/token-verifier.ts) with
 * one that trusts the bearer token's raw string as the Clerk subject id — real JWT verification
 * requires a live JWKS endpoint that doesn't exist in test runs. ClerkAuthGuard itself,
 * TenantContextGuard, and PermissionsGuard all run unmodified: only "is this signature valid" is
 * faked, everything downstream (tenant resolution, permission checks) is exercised for real.
 */
describe("Cross-tenant isolation", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  const fakeTokenVerifier: TokenVerifier = {
    async verify(token: string) {
      return { sub: token };
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue(fakeTokenVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tenantA = await seedTenant(prisma, "A");
    tenantB = await seedTenant(prisma, "B");
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenantA);
    await cleanupTenant(prisma, tenantB);
    await app.close();
  });

  function authedAs(companyId: string, authProviderId: string) {
    return {
      get: (path: string) =>
        request(app.getHttpServer())
          .get(path)
          .set("Authorization", `Bearer ${authProviderId}`)
          .set("x-company-id", companyId),
      post: (path: string) =>
        request(app.getHttpServer())
          .post(path)
          .set("Authorization", `Bearer ${authProviderId}`)
          .set("x-company-id", companyId),
    };
  }

  it("returns 404, not the record, when Company A requests Company B's farm by id", async () => {
    const res = await authedAs(tenantA.companyId, tenantA.ownerAuthProviderId).get(
      `/api/v1/farms/${tenantB.farmId}`,
    );
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(tenantB.farmId);
  });

  it("returns the record when Company B requests its own farm by the same id", async () => {
    const res = await authedAs(tenantB.companyId, tenantB.ownerAuthProviderId).get(
      `/api/v1/farms/${tenantB.farmId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(tenantB.farmId);
  });

  it("never includes Company B's farms in Company A's farm list, regardless of query params", async () => {
    const res = await authedAs(tenantA.companyId, tenantA.ownerAuthProviderId).get(
      "/api/v1/farms?pageSize=100",
    );
    expect(res.status).toBe(200);
    const ids: string[] = res.body.data.map((f: { id: string }) => f.id);
    expect(ids).not.toContain(tenantB.farmId);
  });

  it("rejects a request where the authenticated user asserts a company they are not a member of", async () => {
    // Company A's owner tries to act as Company B by sending Company B's id in X-Company-Id —
    // TenantContextGuard must re-validate membership from the database, not trust the header.
    const res = await authedAs(tenantB.companyId, tenantA.ownerAuthProviderId).get(
      "/api/v1/farms",
    );
    expect(res.status).toBe(403);
  });

  it("never leaks Company B's audit log entries into Company A's audit log view", async () => {
    // Generate an audit-logged action for B (creating a farm already did, via FarmsService).
    const resA = await authedAs(tenantA.companyId, tenantA.ownerAuthProviderId).get(
      "/api/v1/audit-logs?pageSize=100",
    );
    expect(resA.status).toBe(200);
    const entityIds: string[] = resA.body.data.map((entry: { entityId: string }) => entry.entityId);
    expect(entityIds).not.toContain(tenantB.farmId);
  });

  it("creating a farm under Company A's context never stamps Company B's id, even if attempted", async () => {
    const res = await authedAs(tenantA.companyId, tenantA.ownerAuthProviderId)
      .post("/api/v1/farms")
      .send({ name: "Spoof Attempt Farm", code: "SPOOF1" });
    // Body has no companyId field to spoof in the first place (DTO whitelists only
    // name/code/timezone/lat/lng — forbidNonWhitelisted rejects anything else), but assert the
    // persisted row is stamped with the resolved tenant regardless.
    expect(res.status).toBe(201);
    const created = await prisma.farm.findUnique({ where: { id: res.body.data.id } });
    expect(created?.companyId).toBe(tenantA.companyId);
    expect(created?.companyId).not.toBe(tenantB.companyId);
  });
});
