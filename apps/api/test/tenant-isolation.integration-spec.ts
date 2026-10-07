import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { Webhook } from "svix";
import { Permission, ROLE_PERMISSIONS, type Role } from "@aquai/types";
import { createTestApp } from "./support/test-app";
import { INVALID_TOKEN } from "./support/fake-token-verifier";
import {
  resetDatabase,
  seedFeedCatalog,
  seedFishSpecies,
  seedRoleMemberships,
  seedTenant,
  seedUnaffiliatedUser,
  type TenantFixture,
} from "./support/fixtures";

/**
 * Cross-tenant isolation release gate (docs/architecture/13-testing-strategy.md §13.4,
 * docs/architecture/06-multi-tenant-security.md §6.6): proves a Company A caller can never read,
 * list, or mutate Company B's farms/sections/tanks, and that RBAC (§13.3's authorization-matrix
 * requirement) is enforced off the same ROLE_PERMISSIONS map the app itself uses. Covers every
 * resource type that exists as of Milestone 1 — grows as fish-batches/feeding/etc. ship.
 */
describe("Tenant isolation & authorization (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let companyA: TenantFixture;
  let companyB: TenantFixture;
  let unaffiliatedToken: string;
  let roleTokens: Record<Role, string>;
  let speciesId: string;
  let matrixBatchId: string;
  let matrixSpeciesId: string;
  let feedProductId: string;
  let warehouseId: string;
  let companyBWarehouseId: string;
  let lotSeq = 0;
  const nextLotCode = () => `LOT-TEST-${Date.now()}-${lotSeq++}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();

    await resetDatabase(prisma);

    companyA = await seedTenant(prisma, "a");
    companyB = await seedTenant(prisma, "b");
    unaffiliatedToken = await seedUnaffiliatedUser(prisma);
    roleTokens = await seedRoleMemberships(prisma, companyA.companyId);
    speciesId = await seedFishSpecies(prisma);

    const catalogA = await seedFeedCatalog(prisma, companyA.companyId, companyA.farmId);
    feedProductId = catalogA.feedProductId;
    warehouseId = catalogA.warehouseId;
    const catalogB = await seedFeedCatalog(prisma, companyB.companyId, companyB.farmId);
    companyBWarehouseId = catalogB.warehouseId;

    // A read-only fixture batch for the authorization matrix's BATCH_MOVEMENT_READ check —
    // seeded directly via Prisma (not through the API) so it exists regardless of which role
    // the matrix happens to test first.
    const matrixBatch = await prisma.fishBatch.create({
      data: {
        companyId: companyA.companyId,
        lotCode: "LOT-MATRIX-FIXTURE",
        speciesId,
        farmEntryDate: new Date("2026-01-01"),
        initialCount: 100,
        initialAvgWeightG: 50,
        createdById: "system",
      },
    });
    matrixBatchId = matrixBatch.id;

    // Same rationale as matrixBatch above, for the authorization matrix's FISH_SPECIES_UPDATE check.
    const matrixSpecies = await prisma.fishSpecies.create({
      data: { companyId: companyA.companyId, name: "Matrix Species Fixture" },
    });
    matrixSpeciesId = matrixSpecies.id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  const auth = (token: string) => `Bearer ${token}`;

  describe("authentication", () => {
    it("rejects a request with no bearer token (401)", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/farms");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects an invalid/expired token (401)", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/farms")
        .set("Authorization", auth(INVALID_TOKEN));
      expect(res.status).toBe(401);
    });

    it("rejects a verified user with no active company membership (403)", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/farms")
        .set("Authorization", auth(unaffiliatedToken));
      expect(res.status).toBe(403);
    });
  });

  describe("single-resource lookups never leak across tenants", () => {
    it("GET /farms/:id — Company B's farm id, authed as A → 404 (not a data-confirming 403)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/sections — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/sections`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:id — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farm-sections/:sectionId/tanks — Company B's section id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farm-sections/${companyB.sectionId}/tanks`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:tankId/fish-batches — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}/fish-batches`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:tankId/feeding-events — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /warehouses/:warehouseId/inventory-batches — Company B's warehouse id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/warehouses/${companyBWarehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/alerts — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/alerts`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/stock-summary — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/stock-summary`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:tankId/mortality-events — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:tankId/weight-samples — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}/weight-samples`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /fish-batches/:id/biomass/history — Company A's batch id, authed as B → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${matrixBatchId}/biomass/history`)
        .set("Authorization", auth(companyB.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:tankId/water-quality-readings — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:tankId/harvest-records — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /tanks/:tankId/treatments — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyB.tankId}/treatments`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/cost-entries — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/inspection-report — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/inspection-report`)
        .query({ periodStart: "2026-01-01", periodEnd: "2026-12-31" })
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("sanity check: the same lookups succeed for the owning tenant", async () => {
      const [farm, sections, tank] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/farms/${companyA.farmId}`)
          .set("Authorization", auth(companyA.ownerToken)),
        request(app.getHttpServer())
          .get(`/api/v1/farms/${companyA.farmId}/sections`)
          .set("Authorization", auth(companyA.ownerToken)),
        request(app.getHttpServer())
          .get(`/api/v1/tanks/${companyA.tankId}`)
          .set("Authorization", auth(companyA.ownerToken)),
      ]);
      expect(farm.status).toBe(200);
      expect(sections.status).toBe(200);
      expect(tank.status).toBe(200);
    });
  });

  describe("mutations against a cross-tenant parent are rejected, not misfiled", () => {
    it("POST /farms/:farmId/sections — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyB.farmId}/sections`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "Sneaky Section" });
      expect(res.status).toBe(404);
    });

    it("POST /farm-sections/:sectionId/tanks — Company B's section id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/farm-sections/${companyB.sectionId}/tanks`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ code: "SNEAKY", type: "TANK" });
      expect(res.status).toBe(404);
    });

    it("PATCH /tanks/:id — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tanks/${companyB.tankId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ status: "MAINTENANCE" });
      expect(res.status).toBe(404);
    });

    it("PATCH /farms/:id — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/farms/${companyB.farmId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "Sneaky Rename" });
      expect(res.status).toBe(404);
    });

    it("DELETE /farms/:id — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/farms/${companyB.farmId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("DELETE /farm-sections/:sectionId — Company B's section id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/farm-sections/${companyB.sectionId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("POST /fish-batches — Company B's tank id in the body, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: companyB.tankId,
          fishCount: 100,
          avgWeightG: 50,
          farmEntryDate: "2026-01-01",
        });
      expect(res.status).toBe(404);
    });

    it("POST /tanks/:tankId/feeding-events — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyB.tankId}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: "placeholder", feedInventoryBatchId: "placeholder", quantityKg: 10 });
      expect(res.status).toBe(404);
    });

    it("POST /warehouses/:warehouseId/inventory-batches — Company B's warehouse id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${companyBWarehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ feedProductId, quantityKg: 100 });
      expect(res.status).toBe(404);
    });

    it("POST /tanks/:tankId/mortality-events — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyB.tankId}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: "placeholder", fishCount: 1, reason: "UNKNOWN" });
      expect(res.status).toBe(404);
    });

    it("POST /tanks/:tankId/weight-samples — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyB.tankId}/weight-samples`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: "placeholder", sampleMethod: "AGGREGATE", avgWeightG: 100, sampleSize: 10 });
      expect(res.status).toBe(404);
    });

    it("POST /fish-batches/:id/biomass/recalculate — Company A's batch id, authed as B → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${matrixBatchId}/biomass/recalculate`)
        .set("Authorization", auth(companyB.ownerToken));
      expect(res.status).toBe(404);
    });

    it("POST /tanks/:tankId/water-quality-readings — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyB.tankId}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ temperatureC: 18.5 });
      expect(res.status).toBe(404);
    });

    it("POST /tanks/:tankId/harvest-records — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyB.tankId}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: "placeholder", type: "ACTUAL", fullness: "FULL" });
      expect(res.status).toBe(404);
    });

    it("POST /tanks/:tankId/treatments — Company B's tank id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyB.tankId}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: "placeholder", type: "MEDICATION", productName: "X", startedAt: "2026-01-01" });
      expect(res.status).toBe(404);
    });

    it("POST /farms/:farmId/cost-entries — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyB.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "LABOR", amount: 100, incurredAt: "2026-01-01" });
      expect(res.status).toBe(404);
    });
  });

  describe("list & aggregate endpoints never include cross-tenant records", () => {
    it("GET /farms — Company A's list never contains Company B's farm code", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/farms")
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(200);
      const codes = res.body.data.map((f: { code: string }) => f.code);
      expect(codes).toContain(companyA.farmCode);
      expect(codes).not.toContain(companyB.farmCode);
    });

    it("GET /alerts — company-wide feed aggregates every farm in the tenant but never another tenant's alert", async () => {
      const companyBAlert = await prisma.alert.create({
        data: {
          companyId: companyB.companyId,
          farmId: companyB.farmId,
          type: "MANUAL",
          severity: "HIGH",
          message: "Company B alert — must never leak into A's feed",
        },
      });
      const companyAAlert = await prisma.alert.create({
        data: {
          companyId: companyA.companyId,
          farmId: companyA.farmId,
          type: "MANUAL",
          severity: "HIGH",
          message: "Company A alert",
        },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/alerts")
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((a: { id: string }) => a.id);
      expect(ids).toContain(companyAAlert.id);
      expect(ids).not.toContain(companyBAlert.id);
    });

    it("GET /farms/:farmId/tanks — Company B's farm id, authed as A → empty, not another tenant's tanks", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/tanks`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it("GET /audit-logs — Company A's audit trail never contains a Company B entityId", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(200);
      const entityIds = res.body.data.map((entry: { entityId: string }) => entry.entityId);
      expect(entityIds).not.toContain(companyB.farmId);
      expect(entityIds).not.toContain(companyB.tankId);
    });

    it("GET /farms/:farmId/stock-summary — stocking Company A's tank never moves Company B's own summary", async () => {
      const before = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/stock-summary`)
        .set("Authorization", auth(companyB.ownerToken));
      expect(before.status).toBe(200);

      await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: companyA.tankId,
          fishCount: 500,
          avgWeightG: 200,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/stock-summary`)
        .set("Authorization", auth(companyB.ownerToken));
      expect(after.status).toBe(200);
      expect(after.body.data.fishCount).toBe(before.body.data.fishCount);
      expect(after.body.data.biomassKg).toBe(before.body.data.biomassKg);
    });
  });

  describe("validation failures return the standard error envelope, not a partial write", () => {
    it("POST /farms with a missing required field → 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/farms")
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "No Code Farm" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.error.requestId).toBeTruthy();
    });

    it("a duplicate tank code in the same section → 409 with a Turkish message, not a raw Prisma error", async () => {
      const dupeCode = `DUPE${Date.now()}`;
      await request(app.getHttpServer())
        .post(`/api/v1/farm-sections/${companyA.sectionId}/tanks`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ code: dupeCode, type: "TANK" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/farm-sections/${companyA.sectionId}/tanks`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ code: dupeCode, type: "TANK" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.message).not.toMatch(/prisma/i);
      expect(res.body.error.message).toContain("zaten kullanılıyor");
      expect(res.body.error.requestId).toBeTruthy();
    });
  });

  describe("authorization matrix — parametrized off the app's own ROLE_PERMISSIONS map", () => {
    const checks: Array<{ permission: Permission; request: (t: string) => request.Test }> = [
      {
        permission: Permission.FARM_READ,
        request: (t) =>
          request(app.getHttpServer()).get("/api/v1/farms").set("Authorization", auth(t)),
      },
      {
        permission: Permission.FARM_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post("/api/v1/farms")
            .set("Authorization", auth(t))
            .send({ name: "Matrix Farm", code: `MTX-${Math.random().toString(36).slice(2, 8)}` }),
      },
      {
        permission: Permission.TANK_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.FARM_UPDATE,
        request: (t) =>
          request(app.getHttpServer())
            .patch(`/api/v1/farms/${companyA.farmId}`)
            .set("Authorization", auth(t))
            .send({ timezone: "Europe/Oslo" }),
      },
      {
        permission: Permission.AUDIT_LOG_READ,
        request: (t) =>
          request(app.getHttpServer()).get("/api/v1/audit-logs").set("Authorization", auth(t)),
      },
      {
        permission: Permission.INSPECTION_REPORT_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/farms/${companyA.farmId}/inspection-report`)
            .query({ periodStart: "2026-01-01", periodEnd: "2026-12-31" })
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.FISH_SPECIES_UPDATE,
        request: (t) =>
          request(app.getHttpServer())
            .patch(`/api/v1/fish-species/${matrixSpeciesId}`)
            .set("Authorization", auth(t))
            .send({ criticalTempHighC: 20 }),
      },
      {
        permission: Permission.FISH_BATCH_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}/fish-batches`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.FISH_BATCH_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post("/api/v1/fish-batches")
            .set("Authorization", auth(t))
            .send({
              speciesId,
              lotCode: nextLotCode(),
              tankId: companyA.tankId,
              fishCount: 10,
              avgWeightG: 50,
              farmEntryDate: "2026-01-01",
            }),
      },
      {
        permission: Permission.BATCH_MOVEMENT_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/fish-batches/${matrixBatchId}/movements`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.FEED_PRODUCT_READ,
        request: (t) =>
          request(app.getHttpServer()).get("/api/v1/feed-products").set("Authorization", auth(t)),
      },
      {
        permission: Permission.FEED_PRODUCT_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post("/api/v1/feed-products")
            .set("Authorization", auth(t))
            .send({ name: `Matrix Feed ${Math.random().toString(36).slice(2, 8)}` }),
      },
      {
        permission: Permission.WAREHOUSE_READ,
        request: (t) =>
          request(app.getHttpServer()).get("/api/v1/warehouses").set("Authorization", auth(t)),
      },
      {
        permission: Permission.FEED_INVENTORY_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.FEED_INVENTORY_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
            .set("Authorization", auth(t))
            .send({ feedProductId, quantityKg: 10 }),
      },
      {
        permission: Permission.FEEDING_EVENT_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}/feeding-events`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.ALERT_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/farms/${companyA.farmId}/alerts`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.MORTALITY_EVENT_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}/mortality-events`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.WEIGHT_SAMPLE_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}/weight-samples`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.BIOMASS_SNAPSHOT_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/fish-batches/${matrixBatchId}/biomass/history`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.WATER_QUALITY_READING_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}/water-quality-readings`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.WATER_QUALITY_READING_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post(`/api/v1/tanks/${companyA.tankId}/water-quality-readings`)
            .set("Authorization", auth(t))
            .send({ temperatureC: 19.2 }),
      },
      {
        permission: Permission.HARVEST_RECORD_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}/harvest-records`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.TREATMENT_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/tanks/${companyA.tankId}/treatments`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.TREATMENT_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post(`/api/v1/tanks/${companyA.tankId}/treatments`)
            .set("Authorization", auth(t))
            .send({ batchId: matrixBatchId, type: "VACCINATION", productName: "Matrix Vax", startedAt: "2026-01-01" }),
      },
      {
        permission: Permission.COST_ENTRY_READ,
        request: (t) =>
          request(app.getHttpServer())
            .get(`/api/v1/farms/${companyA.farmId}/cost-entries`)
            .set("Authorization", auth(t)),
      },
      {
        permission: Permission.COST_ENTRY_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post(`/api/v1/farms/${companyA.farmId}/cost-entries`)
            .set("Authorization", auth(t))
            .send({ category: "OTHER", amount: 1, incurredAt: "2026-01-01" }),
      },
      {
        // matrixBatchId has no BatchMovement history, so this recalculates to an empty
        // BatchTankState set (no per-tank rows to upsert) — a 2xx with an empty array, which is
        // all the matrix checks (status only, not content).
        permission: Permission.BIOMASS_SNAPSHOT_CREATE,
        request: (t) =>
          request(app.getHttpServer())
            .post(`/api/v1/fish-batches/${matrixBatchId}/biomass/recalculate`)
            .set("Authorization", auth(t)),
      },
    ];

    for (const { permission, request: makeRequest } of checks) {
      for (const role of Object.keys(ROLE_PERMISSIONS) as Role[]) {
        const shouldAllow = ROLE_PERMISSIONS[role].includes(permission);

        it(`${role} ${shouldAllow ? "is allowed" : "is denied"} ${permission}`, async () => {
          const res = await makeRequest(roleTokens[role]);
          if (shouldAllow) {
            expect(res.status).toBeLessThan(400);
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    }
  });

  describe("update/delete — CRU-not-D roles per the permissions matrix", () => {
    // Own scratch section/tank per test (not the shared companyA fixtures other describe blocks
    // depend on staying unmodified/undeleted).
    async function seedScratchTank(prisma: PrismaClient, companyId: string, sectionId: string) {
      return prisma.tank.create({
        data: { companyId, farmSectionId: sectionId, code: `SCR${Date.now()}`, type: "TANK" },
      });
    }

    it("owner can update and then soft-delete a tank in their own company", async () => {
      const scratch = await seedScratchTank(prisma, companyA.companyId, companyA.sectionId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tanks/${scratch.id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ status: "MAINTENANCE" });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe("MAINTENANCE");

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${scratch.id}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(deleteRes.status).toBe(200);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${scratch.id}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(getRes.status).toBe(404); // soft-deleted tanks are excluded from lookups too
    });

    it("FARM_MANAGER can update a tank but is denied deleting it (CRU, not CRUD)", async () => {
      const scratch = await seedScratchTank(prisma, companyA.companyId, companyA.sectionId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tanks/${scratch.id}`)
        .set("Authorization", auth(roleTokens.FARM_MANAGER))
        .send({ status: "INACTIVE" });
      expect(updateRes.status).toBe(200);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${scratch.id}`)
        .set("Authorization", auth(roleTokens.FARM_MANAGER));
      expect(deleteRes.status).toBe(403);
    });

    it("WORKER can read tanks but is denied updating or deleting them", async () => {
      const scratch = await seedScratchTank(prisma, companyA.companyId, companyA.sectionId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tanks/${scratch.id}`)
        .set("Authorization", auth(roleTokens.WORKER))
        .send({ status: "INACTIVE" });
      expect(updateRes.status).toBe(403);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${scratch.id}`)
        .set("Authorization", auth(roleTokens.WORKER));
      expect(deleteRes.status).toBe(403);
    });

    async function seedScratchFarm(prisma: PrismaClient, companyId: string) {
      return prisma.farm.create({
        data: { companyId, name: "Scratch Farm", code: `SCR${Date.now()}` },
      });
    }

    it("owner can update and then soft-delete a farm in their own company", async () => {
      const scratch = await seedScratchFarm(prisma, companyA.companyId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/farms/${scratch.id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "Renamed Scratch Farm" });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe("Renamed Scratch Farm");

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/farms/${scratch.id}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(deleteRes.status).toBe(200);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${scratch.id}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(getRes.status).toBe(404); // soft-deleted farms are excluded from lookups too

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/farms")
        .set("Authorization", auth(companyA.ownerToken));
      expect(listRes.body.data.map((f: { id: string }) => f.id)).not.toContain(scratch.id);
    });

    it("FARM_MANAGER can update a farm but is denied deleting it (CRU, not CRUD)", async () => {
      const scratch = await seedScratchFarm(prisma, companyA.companyId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/farms/${scratch.id}`)
        .set("Authorization", auth(roleTokens.FARM_MANAGER))
        .send({ timezone: "Europe/Oslo" });
      expect(updateRes.status).toBe(200);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/farms/${scratch.id}`)
        .set("Authorization", auth(roleTokens.FARM_MANAGER));
      expect(deleteRes.status).toBe(403);
    });

    it("WORKER can read farms but is denied updating or deleting them", async () => {
      const scratch = await seedScratchFarm(prisma, companyA.companyId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/farms/${scratch.id}`)
        .set("Authorization", auth(roleTokens.WORKER))
        .send({ timezone: "Europe/Oslo" });
      expect(updateRes.status).toBe(403);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/farms/${scratch.id}`)
        .set("Authorization", auth(roleTokens.WORKER));
      expect(deleteRes.status).toBe(403);
    });
  });

  describe("biomass-capacity alert rule", () => {
    it("stocking a tank past 90% of maxBiomassKg opens exactly one alert, and resolving it respects ALERT_RESOLVE", async () => {
      const scratchTank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `BIOMASS${Date.now()}`,
          type: "TANK",
          maxBiomassKg: 100,
        },
      });

      // 1000 fish x 100g = 100kg = 100% of the 100kg cap → crosses the 90% threshold.
      await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: scratchTank.id,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const openAfterFirst = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      const alertsForTank = openAfterFirst.body.data.filter(
        (a: { tankId: string; type: string }) => a.tankId === scratchTank.id && a.type === "BIOMASS_CAPACITY",
      );
      expect(alertsForTank).toHaveLength(1);

      // Stocking again while already over threshold must not spam a second open alert.
      await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: scratchTank.id,
          fishCount: 10,
          avgWeightG: 100,
          farmEntryDate: "2026-01-02",
        })
        .expect(201);

      const openAfterSecond = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      const stillOneAlert = openAfterSecond.body.data.filter(
        (a: { tankId: string; type: string }) => a.tankId === scratchTank.id && a.type === "BIOMASS_CAPACITY",
      );
      expect(stillOneAlert).toHaveLength(1);
      const alertId = stillOneAlert[0].id;

      // WORKER has ALERT_READ but not ALERT_RESOLVE.
      const deniedResolve = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${alertId}/resolve`)
        .set("Authorization", auth(roleTokens.WORKER));
      expect(deniedResolve.status).toBe(403);

      const resolveRes = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${alertId}/resolve`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe("RESOLVED");

      const openAfterResolve = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        openAfterResolve.body.data.some((a: { id: string }) => a.id === alertId),
      ).toBe(false);
    });
  });

  describe("fish-batch ledger correctness", () => {
    async function createTank(codePrefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}`,
          type: "TANK",
        },
      });
    }

    it("stocking a batch is reflected in BatchCurrentState/BatchTankState", async () => {
      const tank = await createTank("LEDGER-A");
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 5000,
          avgWeightG: 120,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      expect(res.body.data.currentState.estimatedCount).toBe(5000);
      expect(res.body.data.currentState.currentTankId).toBe(tank.id);
    });

    it("transferring more than the tank's live count is rejected with 400, not a silent negative", async () => {
      const tankA = await createTank("LEDGER-B1");
      const tankB = await createTank("LEDGER-B2");
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tankA.id,
          fishCount: 100,
          avgWeightG: 50,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${create.body.data.id}/movements`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromTankId: tankA.id, toTankId: tankB.id, fishCount: 101 });
      expect(res.status).toBe(400);
    });

    it("transferring within the live count moves fish between tanks, total conserved", async () => {
      const tankA = await createTank("LEDGER-C1");
      const tankB = await createTank("LEDGER-C2");
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tankA.id,
          fishCount: 1000,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const batchId = create.body.data.id;

      const transferRes = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/movements`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromTankId: tankA.id, toTankId: tankB.id, fishCount: 400 })
        .expect(201);
      expect(transferRes.body.data.currentState.estimatedCount).toBe(1000);

      const [tankAAllocations, tankBAllocations] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/tanks/${tankA.id}/fish-batches`)
          .set("Authorization", auth(companyA.ownerToken)),
        request(app.getHttpServer())
          .get(`/api/v1/tanks/${tankB.id}/fish-batches`)
          .set("Authorization", auth(companyA.ownerToken)),
      ]);
      const aAlloc = tankAAllocations.body.data.find(
        (a: { batchId: string }) => a.batchId === batchId,
      );
      const bAlloc = tankBAllocations.body.data.find(
        (a: { batchId: string }) => a.batchId === batchId,
      );
      expect(aAlloc.estimatedCount).toBe(600);
      expect(bAlloc.estimatedCount).toBe(400);
    });

    it("splitting a batch into two tanks creates two new batches and closes the fully-split source", async () => {
      const source = await createTank("LEDGER-D0");
      const childTankA = await createTank("LEDGER-D1");
      const childTankB = await createTank("LEDGER-D2");
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: source.id,
          fishCount: 1000,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const parentId = create.body.data.id;

      const splitRes = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${parentId}/split`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          fromTankId: source.id,
          splits: [
            { toTankId: childTankA.id, fishCount: 600, lotCode: nextLotCode() },
            { toTankId: childTankB.id, fishCount: 400, lotCode: nextLotCode() },
          ],
        })
        .expect(201);
      expect(splitRes.body.data.childIds).toHaveLength(2);

      const parentAfter = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${parentId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(parentAfter.body.data.status).toBe("CLOSED");
      expect(parentAfter.body.data.currentState.estimatedCount).toBe(0);

      for (const childId of splitRes.body.data.childIds as string[]) {
        const child = await request(app.getHttpServer())
          .get(`/api/v1/fish-batches/${childId}`)
          .set("Authorization", auth(companyA.ownerToken));
        expect(child.body.data.parentBatchIds).toEqual([parentId]);
      }
    });

    it("merging two batches into a new one closes both sources and carries parentBatchIds", async () => {
      const tankA = await createTank("LEDGER-E1");
      const tankB = await createTank("LEDGER-E2");
      const targetTank = await createTank("LEDGER-E3");

      const [batchARes, batchBRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/fish-batches")
          .set("Authorization", auth(companyA.ownerToken))
          .send({
            speciesId,
            lotCode: nextLotCode(),
            tankId: tankA.id,
            fishCount: 300,
            avgWeightG: 100,
            farmEntryDate: "2026-01-01",
          })
          .expect(201),
        request(app.getHttpServer())
          .post("/api/v1/fish-batches")
          .set("Authorization", auth(companyA.ownerToken))
          .send({
            speciesId,
            lotCode: nextLotCode(),
            tankId: tankB.id,
            fishCount: 200,
            avgWeightG: 120,
            farmEntryDate: "2026-01-01",
          })
          .expect(201),
      ]);
      const batchAId = batchARes.body.data.id;
      const batchBId = batchBRes.body.data.id;

      const mergeRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches/merge")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          sources: [
            { batchId: batchAId, fromTankId: tankA.id, fishCount: 300 },
            { batchId: batchBId, fromTankId: tankB.id, fishCount: 200 },
          ],
          toTankId: targetTank.id,
          lotCode: nextLotCode(),
        })
        .expect(201);

      expect([...mergeRes.body.data.parentBatchIds].sort()).toEqual(
        [batchAId, batchBId].sort(),
      );
      expect(mergeRes.body.data.currentState.estimatedCount).toBe(500);

      const [aAfter, bAfter] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/fish-batches/${batchAId}`)
          .set("Authorization", auth(companyA.ownerToken)),
        request(app.getHttpServer())
          .get(`/api/v1/fish-batches/${batchBId}`)
          .set("Authorization", auth(companyA.ownerToken)),
      ]);
      expect(aAfter.body.data.status).toBe("CLOSED");
      expect(bAfter.body.data.status).toBe("CLOSED");
    });

    it("GET /fish-batches/:id/history returns every movement for the batch, in chronological order", async () => {
      const tankA = await createTank("LEDGER-F1");
      const tankB = await createTank("LEDGER-F2");
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tankA.id,
          fishCount: 500,
          avgWeightG: 90,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const batchId = create.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/movements`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromTankId: tankA.id, toTankId: tankB.id, fishCount: 200 })
        .expect(201);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/history`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const types = historyRes.body.data.movements.map(
        (m: { movementType: string }) => m.movementType,
      );
      expect(types).toEqual(["STOCKING", "TRANSFER"]);
    });
  });

  describe("feed inventory ledger correctness", () => {
    async function createTank(codePrefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}`,
          type: "TANK",
        },
      });
    }

    async function receiveStock(quantityKg: number) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ feedProductId, quantityKg })
        .expect(201);
      return res.body.data.id as string;
    }

    it("receiving stock (PURCHASE) is reflected in FeedInventoryBalance", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ feedProductId, quantityKg: 250 })
        .expect(201);

      expect(Number(res.body.data.balance.quantityOnHandKg)).toBe(250);
    });

    it("logging a FeedingEvent decrements the balance and is rejected (400) if it would go negative", async () => {
      const tank = await createTank("FEED-A");
      const inventoryBatchId = await receiveStock(100);

      const batchRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 500,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const fishBatchId = batchRes.body.data.id;

      const feedRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: fishBatchId, feedInventoryBatchId: inventoryBatchId, quantityKg: 40 })
        .expect(201);
      expect(feedRes.body.data.quantityKg).toBeDefined();

      const balanceRes = await request(app.getHttpServer())
        .get(`/api/v1/inventory-batches/${inventoryBatchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(Number(balanceRes.body.data.balance.quantityOnHandKg)).toBe(60);

      const overfeedRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: fishBatchId, feedInventoryBatchId: inventoryBatchId, quantityKg: 61 });
      expect(overfeedRes.status).toBe(400);
    });

    it("an ADJUSTMENT transaction moves the balance by its signed amount", async () => {
      const inventoryBatchId = await receiveStock(100);

      await request(app.getHttpServer())
        .post(`/api/v1/inventory-batches/${inventoryBatchId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ quantityKg: -15, notes: "Physical recount shortfall" })
        .expect(201);

      const afterShortfall = await request(app.getHttpServer())
        .get(`/api/v1/inventory-batches/${inventoryBatchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(Number(afterShortfall.body.data.balance.quantityOnHandKg)).toBe(85);

      await request(app.getHttpServer())
        .post(`/api/v1/inventory-batches/${inventoryBatchId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ quantityKg: 5, notes: "Found an extra sack" })
        .expect(201);

      const afterTopUp = await request(app.getHttpServer())
        .get(`/api/v1/inventory-batches/${inventoryBatchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(Number(afterTopUp.body.data.balance.quantityOnHandKg)).toBe(90);

      const negativeRes = await request(app.getHttpServer())
        .post(`/api/v1/inventory-batches/${inventoryBatchId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ quantityKg: -999 });
      expect(negativeRes.status).toBe(400);
    });

    it("a lot's price, lot code and expiry can be corrected; the correction re-prices its FEED cost entry", async () => {
      const inventoryBatchId = await receiveStock(100);
      await request(app.getHttpServer())
        .patch(`/api/v1/inventory-batches/${inventoryBatchId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ supplierLotCode: "LOT-FIXED", expiryDate: "2027-01-01", unitCostAmount: 30 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/inventory-batches/${inventoryBatchId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(res.body.data.supplierLotCode).toBe("LOT-FIXED");
      expect(Number(res.body.data.unitCostPerKg)).toBe(30);

      await request(app.getHttpServer())
        .patch(`/api/v1/inventory-batches/${inventoryBatchId}`)
        .set("Authorization", auth(companyB.ownerToken))
        .send({ supplierLotCode: "NOPE" })
        .expect(404);
    });

    it("an untouched lot can be removed entirely; one that has been fed from or adjusted is refused", async () => {
      const untouchedId = await receiveStock(50);
      await request(app.getHttpServer())
        .delete(`/api/v1/inventory-batches/${untouchedId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/inventory-batches/${untouchedId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);

      const adjustedId = await receiveStock(50);
      await request(app.getHttpServer())
        .post(`/api/v1/inventory-batches/${adjustedId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ quantityKg: -5 })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/inventory-batches/${adjustedId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(400);

      await request(app.getHttpServer())
        .delete(`/api/v1/inventory-batches/${untouchedId}`)
        .set("Authorization", auth(companyB.ownerToken))
        .expect(404);
    });

    it("a feed product can be corrected and removed from the catalog; another company gets 404", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/feed-products")
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: `Throwaway ${Date.now()}`, proteinPct: 40 })
        .expect(201);
      const productId = created.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/feed-products/${productId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ proteinPct: 42 })
        .expect(200);
      const list = await request(app.getHttpServer())
        .get("/api/v1/feed-products")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(Number(list.body.data.find((p: { id: string }) => p.id === productId).proteinPct)).toBe(42);

      await request(app.getHttpServer())
        .delete(`/api/v1/feed-products/${productId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const afterDelete = await request(app.getHttpServer())
        .get("/api/v1/feed-products")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(afterDelete.body.data.find((p: { id: string }) => p.id === productId)).toBeUndefined();

      await request(app.getHttpServer())
        .patch(`/api/v1/feed-products/${productId}`)
        .set("Authorization", auth(companyB.ownerToken))
        .send({ proteinPct: 1 })
        .expect(404);
    });

    it("farm stock-summary's todayFeedKg reflects same-day FeedingEvents", async () => {
      const tank = await createTank("FEED-B");
      const inventoryBatchId = await receiveStock(200);

      const batchRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 500,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const before = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/stock-summary`)
        .set("Authorization", auth(companyA.ownerToken));

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: batchRes.body.data.id, feedInventoryBatchId: inventoryBatchId, quantityKg: 12.5 })
        .expect(201);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/stock-summary`)
        .set("Authorization", auth(companyA.ownerToken));

      expect(after.body.data.todayFeedKg).toBe(before.body.data.todayFeedKg + 12.5);
    });

    it("WORKER can log a feeding event but READ_ONLY is denied", async () => {
      const tank = await createTank("FEED-C");
      const inventoryBatchId = await receiveStock(100);
      const batchRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 200,
          avgWeightG: 60,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const workerRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(roleTokens.WORKER))
        .send({ batchId: batchRes.body.data.id, feedInventoryBatchId: inventoryBatchId, quantityKg: 5 });
      expect(workerRes.status).toBe(201);

      const readOnlyRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(roleTokens.READ_ONLY))
        .send({ batchId: batchRes.body.data.id, feedInventoryBatchId: inventoryBatchId, quantityKg: 5 });
      expect(readOnlyRes.status).toBe(403);
    });
  });

  describe("mortality, weight sampling & biomass correctness", () => {
    async function createTank(codePrefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}`,
          type: "TANK",
        },
      });
    }

    async function stockBatch(tankId: string, fishCount: number, avgWeightG: number) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId,
          fishCount,
          avgWeightG,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      return res.body.data.id as string;
    }

    it("reporting mortality reduces the tank's live count and rejects fishCount exceeding it", async () => {
      const tank = await createTank("MORT-A");
      const batchId = await stockBatch(tank.id, 1000, 100);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 200, reason: "DISEASE" })
        .expect(201);

      const afterMortality = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(afterMortality.body.data.currentState.estimatedCount).toBe(800);

      const excessRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 801, reason: "DISEASE" });
      expect(excessRes.status).toBe(400);
    });

    it("an INDIVIDUAL weight sample server-computes avgWeightG/stdDevG/cv from submitted weights", async () => {
      const tank = await createTank("WS-A");
      const batchId = await stockBatch(tank.id, 300, 50);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/weight-samples`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, sampleMethod: "INDIVIDUAL", individualWeightsG: [100, 110, 90, 100] })
        .expect(201);

      expect(res.body.data.sampleSize).toBe(4);
      expect(Number(res.body.data.totalWeightG)).toBe(400);
      expect(Number(res.body.data.avgWeightG)).toBe(100);
      expect(Number(res.body.data.minWeightG)).toBe(90);
      expect(Number(res.body.data.maxWeightG)).toBe(110);
      // weights [100,110,90,100] -> mean 100, population variance 50, stddev sqrt(50) ~ 7.0711
      expect(Number(res.body.data.stdDevG)).toBeCloseTo(7.0711, 3);
      expect(Number(res.body.data.cv)).toBeCloseTo(7.0711, 3);
    });

    it("a weight sample updates BatchCurrentState's avgWeightG and biomassKg using the mortality-adjusted count", async () => {
      const tank = await createTank("WS-B");
      const batchId = await stockBatch(tank.id, 1000, 100);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 200, reason: "OXYGEN" })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/weight-samples`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, sampleMethod: "AGGREGATE", avgWeightG: 120, sampleSize: 50 })
        .expect(201);

      const afterRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(afterRes.body.data.currentState.estimatedCount).toBe(800);
      expect(Number(afterRes.body.data.currentState.estimatedAvgWeightG)).toBe(120);
      expect(Number(afterRes.body.data.currentState.estimatedBiomassKg)).toBe(96);
    });

    it("POST .../biomass/recalculate creates a snapshot matching BatchCurrentState, and calling it twice same-day updates rather than duplicates", async () => {
      const tank = await createTank("BIO-A");
      const batchId = await stockBatch(tank.id, 1000, 100);

      const first = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/biomass/recalculate`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(201);
      expect(first.body.data).toHaveLength(1);
      expect(first.body.data[0].estimatedCount).toBe(1000);
      expect(Number(first.body.data[0].avgWeightG)).toBe(100);
      expect(Number(first.body.data[0].biomassKg)).toBe(100);
      const firstSnapshotId = first.body.data[0].id;

      const second = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/biomass/recalculate`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(201);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.data[0].id).toBe(firstSnapshotId);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/biomass/history`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(historyRes.body.data).toHaveLength(1);
    });
  });

  describe("batch performance — FCR & SGR", () => {
    async function createTank(codePrefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}`,
          type: "TANK",
        },
      });
    }

    it("computes a harvest/transfer-aware FCR that a naive weight-delta formula would get badly wrong", async () => {
      const tankA = await createTank("FCR-A1");
      const tankB = await createTank("FCR-A2");

      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tankA.id,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const batchId = create.body.data.id;

      // periodStart boundary: seeded directly (a real nightly snapshot job is deferred, per
      // every prior milestone's "no scheduler yet" note) — as of 2026-01-01, the batch's entire
      // 1000 fish @ 100g sat in tankA, biomass 100kg.
      const periodStart = new Date("2026-01-01T00:00:00.000Z");
      await prisma.biomassSnapshot.create({
        data: {
          companyId: companyA.companyId,
          batchId,
          tankId: tankA.id,
          snapshotDate: periodStart,
          estimatedCount: 1000,
          avgWeightG: 100,
          biomassKg: 100,
          methodology: "test-fixture",
          createdById: "system",
        },
      });

      // Mid-period: move 300 fish to tankB (same batch — must net to zero for batch-level FCR).
      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/movements`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromTankId: tankA.id, toTankId: tankB.id, fishCount: 300 })
        .expect(201);

      // Mid-period: the fish grew from 100g to 130g.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankA.id}/weight-samples`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, sampleMethod: "AGGREGATE", avgWeightG: 130, sampleSize: 50 })
        .expect(201);

      // Mid-period: 30kg of feed consumed.
      const inventoryBatchId = (
        await request(app.getHttpServer())
          .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
          .set("Authorization", auth(companyA.ownerToken))
          .send({ feedProductId, quantityKg: 100 })
          .expect(201)
      ).body.data.id;
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankA.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, feedInventoryBatchId: inventoryBatchId, quantityKg: 18 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankB.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, feedInventoryBatchId: inventoryBatchId, quantityKg: 12 })
        .expect(201);

      // Mid-period: a partial harvest removes 200 fish from tankA at the now-current 130g
      // weight (200 * 130 / 1000 = 26kg) — seeded directly via Prisma since the dedicated
      // harvest module is a later milestone; BatchProjectionService already understands
      // HARVEST_REMOVAL (§4.4.1), so recompute() (triggered by the recalculate call below)
      // correctly folds it into the live count.
      await prisma.batchMovement.create({
        data: {
          companyId: companyA.companyId,
          movementType: "HARVEST_REMOVAL",
          batchId,
          fromTankId: tankA.id,
          fishCount: 200,
          estimatedAvgWeightG: 130,
          estimatedBiomassKg: 26,
          occurredAt: new Date(),
          createdById: "system",
        },
      });

      // periodEnd boundary: recalculate "today". tankA: 1000-300-200=500 @130g=65kg; tankB:
      // 300 @130g=39kg. endBiomass = 104kg.
      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/biomass/recalculate`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(201);
      const periodEnd = new Date();

      const fcrRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/fcr`)
        .query({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      // Hand-calculated (§10.4): gain = (end 104 + harvest 26 + mortality 0) - start 100 = 30kg;
      // FCR = feed 30kg / gain 30kg = 1.0. A naive `feed / (end - start)` formula would instead
      // see gain = 104 - 100 = 4kg and report FCR = 7.5 — wrong by 7.5x because it ignores the
      // 26kg that left via harvest.
      expect(fcrRes.body.data.startBiomassKg).toBe(100);
      expect(fcrRes.body.data.endBiomassKg).toBe(104);
      expect(fcrRes.body.data.harvestBiomassKg).toBe(26);
      expect(fcrRes.body.data.mortalityBiomassKg).toBe(0);
      expect(fcrRes.body.data.feedConsumedKg).toBe(30);
      expect(fcrRes.body.data.biomassGainKg).toBe(30);
      expect(fcrRes.body.data.fcr).toBeCloseTo(1, 6);
    });

    it("GET .../fcr without a prior biomass snapshot before periodStart is rejected with 400, not a bogus number", async () => {
      const tank = await createTank("FCR-B");
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 100,
          avgWeightG: 50,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${create.body.data.id}/fcr`)
        .query({ periodStart: "2026-01-01T00:00:00.000Z", periodEnd: new Date().toISOString() })
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(400);
    });

    it("SGR is computed from consecutive real WeightSample pairs, traceable by sample id", async () => {
      const tank = await createTank("SGR-A");
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 500,
          avgWeightG: 100,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const batchId = create.body.data.id;

      const sample1 = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/weight-samples`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          sampleMethod: "AGGREGATE",
          avgWeightG: 100,
          sampleSize: 40,
          occurredAt: "2026-01-01T00:00:00.000Z",
        })
        .expect(201);

      const sample2 = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/weight-samples`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          sampleMethod: "AGGREGATE",
          avgWeightG: 130,
          sampleSize: 40,
          occurredAt: "2026-01-11T00:00:00.000Z",
        })
        .expect(201);

      const sgrRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/sgr`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      expect(sgrRes.body.data).toHaveLength(1);
      const point = sgrRes.body.data[0];
      expect(point.initialSampleId).toBe(sample1.body.data.id);
      expect(point.finalSampleId).toBe(sample2.body.data.id);
      expect(point.periodDays).toBeCloseTo(10, 6);
      // Hand-calculated (§10.5): ((ln(130) - ln(100)) / 10) * 100.
      const expectedSgr = ((Math.log(130) - Math.log(100)) / 10) * 100;
      expect(point.sgrPctPerDay).toBeCloseTo(expectedSgr, 6);
    });
  });

  describe("water quality readings", () => {
    it("records a manual reading and rejects an empty one (no metrics provided)", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyA.tankId}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          temperatureC: 17.4,
          dissolvedOxygenMgL: 8.1,
          ph: 7.2,
          notes: "Morning check",
        })
        .expect(201);
      expect(res.body.data.source).toBe("MANUAL");
      expect(Number(res.body.data.temperatureC)).toBe(17.4);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${companyA.tankId}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(
        listRes.body.data.some((r: { id: string }) => r.id === res.body.data.id),
      ).toBe(true);

      const emptyRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${companyA.tankId}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ notes: "No numbers at all" });
      expect(emptyRes.status).toBe(400);
    });
  });

  describe("harvest records", () => {
    async function createTank(codePrefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}`,
          type: "TANK",
        },
      });
    }

    async function stockBatch(tankId: string, fishCount: number, avgWeightG: number) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId,
          fishCount,
          avgWeightG,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      return res.body.data.id as string;
    }

    it("a FULL harvest (fishCount omitted) zeros the live count and closes the batch, and shows up in the batch's movement history", async () => {
      const tank = await createTank("HRV-A");
      const batchId = await stockBatch(tank.id, 1000, 100);

      const harvestRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" })
        .expect(201);
      expect(harvestRes.body.data.fishCount).toBe(1000);
      expect(Number(harvestRes.body.data.biomassKg)).toBe(100);

      const batchRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(batchRes.body.data.status).toBe("CLOSED");
      expect(batchRes.body.data.currentState.estimatedCount).toBe(0);

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/history`)
        .set("Authorization", auth(companyA.ownerToken));
      const types = historyRes.body.data.movements.map((m: { movementType: string }) => m.movementType);
      expect(types).toEqual(["STOCKING", "HARVEST_REMOVAL"]);
    });

    it("a PARTIAL harvest respects the live count and rejects an over-harvest", async () => {
      const tank = await createTank("HRV-B");
      const batchId = await stockBatch(tank.id, 500, 100);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "PARTIAL", fishCount: 200 })
        .expect(201);

      const afterRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(afterRes.body.data.currentState.estimatedCount).toBe(300);
      expect(afterRes.body.data.status).toBe("ACTIVE");

      const overRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "PARTIAL", fishCount: 301 });
      expect(overRes.status).toBe(400);
    });

    it("a PLANNED harvest record never touches the ledger", async () => {
      const tank = await createTank("HRV-C");
      const batchId = await stockBatch(tank.id, 300, 100);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          type: "PLANNED",
          fullness: "FULL",
          plannedDate: "2026-03-01",
        })
        .expect(201);

      const afterRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(afterRes.body.data.currentState.estimatedCount).toBe(300);
      expect(afterRes.body.data.status).toBe("ACTIVE");

      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/history`)
        .set("Authorization", auth(companyA.ownerToken));
      const types = historyRes.body.data.movements.map((m: { movementType: string }) => m.movementType);
      expect(types).toEqual(["STOCKING"]);
    });
  });

  describe("farm dashboard KPIs", () => {
    it("GET /farms/:farmId/dashboard-kpis reflects live fish count, biomass, and 7-day mortality rate", async () => {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `KPI-A${Date.now()}`,
          type: "TANK",
        },
      });
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: create.body.data.id, fishCount: 50, reason: "OXYGEN" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/dashboard-kpis`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      expect(res.body.data.fishCount).toBeGreaterThanOrEqual(950);
      expect(res.body.data.biomassKg).toBeGreaterThan(0);
      expect(res.body.data.activeBatchesCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.mortalityRate7dPct).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty("avgFcr");
      expect(res.body.data).toHaveProperty("avgSgrPctPerDay");
      expect(res.body.data).toHaveProperty("openAlertsCount");
    });
  });

  describe("Milestone 8 alert rules — low feed stock, mortality spike, missing daily records", () => {
    async function createTank(codePrefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}`,
          type: "TANK",
        },
      });
    }

    it("consuming feed below the low-stock threshold opens exactly one farm-scoped LOW_FEED_STOCK alert", async () => {
      const tank = await createTank("ALRT-A");
      const stockRes = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ feedProductId, quantityKg: 25 })
        .expect(201);
      const inventoryBatchId = stockRes.body.data.id;

      const batchRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 200,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      // 25kg on hand, feed 10kg -> 15kg remaining, below the 20kg threshold.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: batchRes.body.data.id, feedInventoryBatchId: inventoryBatchId, quantityKg: 10 })
        .expect(201);

      const alertsRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      const lowStockAlerts = alertsRes.body.data.filter(
        (a: { type: string; farmId: string | null }) =>
          a.type === "LOW_FEED_STOCK" && a.farmId === companyA.farmId,
      );
      expect(lowStockAlerts).toHaveLength(1);

      // A second small feeding shouldn't spam a duplicate open alert.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: batchRes.body.data.id, feedInventoryBatchId: inventoryBatchId, quantityKg: 1 })
        .expect(201);
      const alertsAfterRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        alertsAfterRes.body.data.filter(
          (a: { type: string; farmId: string | null }) =>
            a.type === "LOW_FEED_STOCK" && a.farmId === companyA.farmId,
        ),
      ).toHaveLength(1);
    });

    it("a single mortality event over 5% of the tank's live population opens a MORTALITY_SPIKE alert; a smaller one doesn't", async () => {
      const tankSmall = await createTank("ALRT-B1");
      const smallBatch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tankSmall.id,
          fishCount: 100,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      // 2% mortality — below the 5% threshold, no alert.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankSmall.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: smallBatch.body.data.id, fishCount: 2, reason: "UNKNOWN" })
        .expect(201);

      const noSpikeRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        noSpikeRes.body.data.some(
          (a: { type: string; tankId: string | null }) =>
            a.type === "MORTALITY_SPIKE" && a.tankId === tankSmall.id,
        ),
      ).toBe(false);

      const tankBig = await createTank("ALRT-B2");
      const bigBatch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tankBig.id,
          fishCount: 100,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      // 10% mortality — over the 5% threshold, opens an alert.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankBig.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: bigBatch.body.data.id, fishCount: 10, reason: "DISEASE" })
        .expect(201);

      const spikeRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        spikeRes.body.data.some(
          (a: { type: string; tankId: string | null }) =>
            a.type === "MORTALITY_SPIKE" && a.tankId === tankBig.id,
        ),
      ).toBe(true);
    });

    it("concurrent alert fetches raise one MISSING_DAILY_RECORDS alert per tank, and a resolved one is not re-raised the same day", async () => {
      const tank = await createTank("ALRT-DUP");
      await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 50,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .get("/api/v1/alerts")
            .set("Authorization", auth(companyA.ownerToken))
            .expect(200),
        ),
      );

      const raised = await prisma.alert.findMany({
        where: { tankId: tank.id, type: "MISSING_DAILY_RECORDS" },
      });
      expect(raised).toHaveLength(1);

      await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${raised[0].id}/resolve`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      await request(app.getHttpServer())
        .get("/api/v1/alerts")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const afterResolve = await prisma.alert.findMany({
        where: { tankId: tank.id, type: "MISSING_DAILY_RECORDS" },
      });
      expect(afterResolve).toHaveLength(1);
    });

    it("a stocked tank with no feeding/water-quality record today gets a MISSING_DAILY_RECORDS alert on the next alerts fetch", async () => {
      const tank = await createTank("ALRT-C");
      await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 50,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const alertsRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        alertsRes.body.data.some(
          (a: { type: string; tankId: string | null }) =>
            a.type === "MISSING_DAILY_RECORDS" && a.tankId === tank.id,
        ),
      ).toBe(true);
    });

    it("a critically low dissolved-oxygen reading opens a WATER_QUALITY_CRITICAL alert; a normal reading doesn't", async () => {
      const tank = await createTank("ALRT-D");

      // Within safe ranges (DO 6-9mg/L, pH 6-9, temp <=22C) — no alert.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ temperatureC: 15, dissolvedOxygenMgL: 8, ph: 7.2 })
        .expect(201);

      const noAlertRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        noAlertRes.body.data.some(
          (a: { type: string; tankId: string | null }) =>
            a.type === "WATER_QUALITY_CRITICAL" && a.tankId === tank.id,
        ),
      ).toBe(false);

      // Dissolved oxygen below the 6mg/L critical threshold -> opens an alert.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ dissolvedOxygenMgL: 3.5 })
        .expect(201);

      const alertRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      const critical = alertRes.body.data.filter(
        (a: { type: string; tankId: string | null }) =>
          a.type === "WATER_QUALITY_CRITICAL" && a.tankId === tank.id,
      );
      expect(critical).toHaveLength(1);
      expect(critical[0].severity).toBe("HIGH");
      expect(critical[0].message).toContain("çözünmüş oksijen");

      // A second breaching reading shouldn't spam a duplicate open alert.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ dissolvedOxygenMgL: 2.0 })
        .expect(201);

      const afterRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        afterRes.body.data.filter(
          (a: { type: string; tankId: string | null }) =>
            a.type === "WATER_QUALITY_CRITICAL" && a.tankId === tank.id,
        ),
      ).toHaveLength(1);
    });
  });

  describe("fish species — thresholds & tenant isolation", () => {
    async function createOwnSpecies(token: string, name: string, extra: Record<string, unknown> = {}) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-species")
        .set("Authorization", auth(token))
        .send({ name, ...extra })
        .expect(201);
      return res.body.data as { id: string; companyId: string | null };
    }

    it("PATCH updates a company's own species, including its water-quality thresholds", async () => {
      const species = await createOwnSpecies(companyA.ownerToken, `Somon-${Date.now()}`);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/fish-species/${species.id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ criticalTempHighC: 18, criticalDoMgL: 7 })
        .expect(200);

      expect(Number(res.body.data.criticalTempHighC)).toBe(18);
      expect(Number(res.body.data.criticalDoMgL)).toBe(7);
    });

    it("PATCH on a global reference species (companyId: null) -> 404, not a silent shared-data edit", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/fish-species/${speciesId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ criticalTempHighC: 10 })
        .expect(404);
    });

    it("PATCH on Company B's own species, authed as A -> 404", async () => {
      const speciesB = await createOwnSpecies(companyB.ownerToken, `B-Species-${Date.now()}`);

      await request(app.getHttpServer())
        .patch(`/api/v1/fish-species/${speciesB.id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ criticalTempHighC: 10 })
        .expect(404);
    });

    it("a species-specific critical temperature overrides the module default for a tank stocked with it", async () => {
      const sensitiveSpecies = await createOwnSpecies(companyA.ownerToken, `Sensitive-${Date.now()}`, {
        criticalTempHighC: 18,
      });
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `ALRT-SPECIES-${Date.now()}`,
          type: "TANK",
        },
      });
      await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId: sensitiveSpecies.id,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 100,
          avgWeightG: 50,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      // 19°C is under the module default (22°C) but over this species' own override (18°C).
      const readingRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ temperatureC: 19, dissolvedOxygenMgL: 8 })
        .expect(201);

      expect(readingRes.body.data).toHaveProperty("dissolvedOxygenSaturationPct");
      expect(readingRes.body.data.dissolvedOxygenSaturationPct).toBeGreaterThan(0);

      const alertsRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/alerts?status=OPEN`)
        .set("Authorization", auth(companyA.ownerToken));
      const critical = alertsRes.body.data.filter(
        (a: { type: string; tankId: string | null }) =>
          a.type === "WATER_QUALITY_CRITICAL" && a.tankId === tank.id,
      );
      expect(critical).toHaveLength(1);
      expect(critical[0].message).toContain("sıcaklık");
    });
  });

  describe("platform-admin console — the one deliberate cross-tenant surface", () => {
    it("GET /admin/companies is denied to a normal company owner (403), however senior they are in their own tenant", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/admin/companies")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(403);
    });

    it("GET /admin/companies is denied to every non-PLATFORM_ADMIN role", async () => {
      for (const role of ["FARM_MANAGER", "VETERINARIAN", "ACCOUNTANT", "WORKER", "READ_ONLY"] as const) {
        const res = await request(app.getHttpServer())
          .get("/api/v1/admin/companies")
          .set("Authorization", auth(roleTokens[role]));
        expect([role, res.status]).toEqual([role, 403]);
      }
    });

    it("GET /admin/me reports the caller's platform-admin status without granting anything", async () => {
      const normal = await request(app.getHttpServer())
        .get("/api/v1/admin/me")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(normal.body.data.isPlatformAdmin).toBe(false);

      const admin = await request(app.getHttpServer())
        .get("/api/v1/admin/me")
        .set("Authorization", auth(roleTokens.PLATFORM_ADMIN))
        .expect(200);
      expect(admin.body.data.isPlatformAdmin).toBe(true);
    });

    it("a PLATFORM_ADMIN sees every tenant, with live stock rolled up per company", async () => {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyB.companyId,
          farmSectionId: companyB.sectionId,
          code: `ADMIN-B-${Date.now()}`,
          type: "TANK",
        },
      });
      await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyB.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 400,
          avgWeightG: 250,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get("/api/v1/admin/companies")
        .set("Authorization", auth(roleTokens.PLATFORM_ADMIN))
        .expect(200);

      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(companyA.companyId);
      expect(ids).toContain(companyB.companyId);

      const rowB = res.body.data.find((c: { id: string }) => c.id === companyB.companyId);
      expect(rowB.liveFishCount).toBeGreaterThanOrEqual(400);
      expect(rowB.liveBiomassKg).toBeGreaterThan(0);
      // 400 fish at 250g -> 100kg -> the derived average weight must come back as grams again.
      expect(rowB.avgWeightG).toBeGreaterThan(0);
      expect(rowB.memberCount).toBeGreaterThanOrEqual(1);
    });

    it("GET /admin/companies/:id returns another tenant's batches with count and average weight", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/companies/${companyB.companyId}`)
        .set("Authorization", auth(roleTokens.PLATFORM_ADMIN))
        .expect(200);

      expect(res.body.data.company.id).toBe(companyB.companyId);
      expect(Array.isArray(res.body.data.batches)).toBe(true);
      const stocked = res.body.data.batches.find((b: { liveCount: number }) => b.liveCount > 0);
      expect(stocked).toBeDefined();
      expect(stocked.avgWeightG).toBeGreaterThan(0);
      expect(stocked.speciesName).toBeTruthy();
    });

    it("GET /admin/companies/:id is still denied to a non-admin, even for their own company", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/admin/companies/${companyA.companyId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(403);
    });
  });

  describe("company member management", () => {
    it("inviting a user creates a pending invitation that can be listed and revoked", async () => {
      const inviteRes = await request(app.getHttpServer())
        .post("/api/v1/users/invite")
        .set("Authorization", auth(companyA.ownerToken))
        .send({ email: `invitee-${Date.now()}@test.aquai.local`, role: "WORKER" })
        .expect(201);
      expect(inviteRes.body.data.status).toBe("PENDING");

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/users/invitations")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(
        listRes.body.data.some((i: { id: string }) => i.id === inviteRes.body.data.id),
      ).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/v1/users/invitations/${inviteRes.body.data.id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const afterRes = await request(app.getHttpServer())
        .get("/api/v1/users/invitations")
        .set("Authorization", auth(companyA.ownerToken));
      expect(
        afterRes.body.data.some((i: { id: string }) => i.id === inviteRes.body.data.id),
      ).toBe(false);
    });

    it("updates a member's role, revokes a member, and refuses to revoke the company's last owner", async () => {
      // Scratch company, fully isolated from the shared companyA fixtures used everywhere else.
      const company = await prisma.company.create({
        data: { name: `Scratch MM ${Date.now()}`, countryCode: "NO", timezone: "Europe/Oslo" },
      });
      const ownerUser = await prisma.user.create({
        data: {
          authProviderId: `mm-owner-${Date.now()}`,
          email: `mm-owner-${Date.now()}@test.aquai.local`,
          fullName: "MM Owner",
        },
      });
      const ownerMembership = await prisma.companyMembership.create({
        data: { companyId: company.id, userId: ownerUser.id, role: "COMPANY_OWNER", status: "ACTIVE", joinedAt: new Date() },
      });
      const ownerToken = ownerUser.authProviderId;

      const workerUser = await prisma.user.create({
        data: {
          authProviderId: `mm-worker-${Date.now()}`,
          email: `mm-worker-${Date.now()}@test.aquai.local`,
          fullName: "MM Worker",
        },
      });
      const workerMembership = await prisma.companyMembership.create({
        data: { companyId: company.id, userId: workerUser.id, role: "WORKER", status: "ACTIVE", joinedAt: new Date() },
      });

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/users/${workerMembership.id}/role`)
        .set("Authorization", auth(ownerToken))
        .send({ role: "FARM_MANAGER" })
        .expect(200);
      expect(updateRes.body.data.role).toBe("FARM_MANAGER");

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${workerMembership.id}`)
        .set("Authorization", auth(ownerToken))
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Authorization", auth(ownerToken));
      expect(
        listRes.body.data.some((m: { id: string }) => m.id === workerMembership.id),
      ).toBe(false);

      // Only the owner remains active now — revoking them must be rejected, not silently allowed.
      const guardRes = await request(app.getHttpServer())
        .delete(`/api/v1/users/${ownerMembership.id}`)
        .set("Authorization", auth(ownerToken));
      expect(guardRes.status).toBe(400);
    });
  });

  describe("veterinary treatments & harvest withdrawal-period compliance", () => {
    async function createTank(codePrefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}`,
          type: "TANK",
        },
      });
    }

    async function stockBatch(tankId: string, fishCount: number, avgWeightG: number) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId,
          fishCount,
          avgWeightG,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      return res.body.data.id as string;
    }

    it("blocks an ACTUAL harvest while a treatment's withdrawal period is still active", async () => {
      const tank = await createTank("TRX-A");
      const batchId = await stockBatch(tank.id, 200, 100);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          type: "MEDICATION",
          productName: "Florfenicol 20%",
          startedAt: new Date().toISOString(),
          withdrawalPeriodDays: 9999,
        })
        .expect(201);

      const harvestRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" });
      expect(harvestRes.status).toBe(400);
      expect(harvestRes.body.error.message).toContain("Florfenicol");
    });

    it("allows an ACTUAL harvest once the withdrawal period has elapsed", async () => {
      const tank = await createTank("TRX-B");
      const batchId = await stockBatch(tank.id, 200, 100);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          type: "MEDICATION",
          productName: "Old Treatment",
          startedAt: "2020-01-01",
          endedAt: "2020-01-02",
          withdrawalPeriodDays: 5,
        })
        .expect(201);

      const harvestRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" });
      expect(harvestRes.status).toBe(201);
    });

    it("correcting a treatment's withdrawal period changes whether the batch can be harvested", async () => {
      const tank = await createTank("TRX-EDIT");
      const batchId = await stockBatch(tank.id, 200, 100);
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

      // Withdrawal of 10 days from a dose two days ago: still blocked.
      const created = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          type: "MEDICATION",
          productName: "Oksitetrasiklin (yanlış girilmiş)",
          startedAt: twoDaysAgo,
          endedAt: twoDaysAgo,
          withdrawalPeriodDays: 10,
        })
        .expect(201);
      const treatmentId = created.body.data.id as string;

      const blocked = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" });
      expect(blocked.status).toBe(400);

      // The label said 10 days; the product actually has 1. Correcting it releases the harvest.
      const fixed = await request(app.getHttpServer())
        .patch(`/api/v1/tanks/${tank.id}/treatments/${treatmentId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ productName: "Oksitetrasiklin HCl", withdrawalPeriodDays: 1 })
        .expect(200);
      expect(fixed.body.data.productName).toBe("Oksitetrasiklin HCl");
      expect(fixed.body.data.withdrawalPeriodDays).toBe(1);
      expect(fixed.body.data.startedAt).toBe(new Date(twoDaysAgo).toISOString());

      const allowed = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" });
      expect(allowed.status).toBe(201);
    });

    it("refuses a correction whose end date falls before its start, and one aimed at another tank", async () => {
      const tank = await createTank("TRX-BAD");
      const other = await createTank("TRX-OTHER");
      const batchId = await stockBatch(tank.id, 100, 100);
      const created = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "VACCINATION", productName: "ERM", startedAt: "2026-03-10" })
        .expect(201);
      const treatmentId = created.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/tanks/${tank.id}/treatments/${treatmentId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ endedAt: "2026-03-01" })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/v1/tanks/${other.id}/treatments/${treatmentId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ productName: "Başka havuz" })
        .expect(404);
    });

    it("a treatment recorded by mistake can be removed; removing it lifts its withdrawal block", async () => {
      const tank = await createTank("TRX-DEL");
      const other = await createTank("TRX-DEL-OTHER");
      const batchId = await stockBatch(tank.id, 150, 100);
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

      const created = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          type: "MEDICATION",
          productName: "Kayıt hatası",
          startedAt: twoDaysAgo,
          endedAt: twoDaysAgo,
          withdrawalPeriodDays: 10,
        })
        .expect(201);
      const treatmentId = created.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" })
        .expect(400);

      // Another farm's tank cannot delete it.
      await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${other.id}/treatments/${treatmentId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${tank.id}/treatments/${treatmentId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${tank.id}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(list.body.data.some((t: { id: string }) => t.id === treatmentId)).toBe(false);

      await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${tank.id}/treatments/${treatmentId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" })
        .expect(201);
    });
  });

  describe("production cost tracking", () => {
    it("logs a manual cost entry, auto-derives a FEED cost entry from a priced stock receipt, and summarizes by category and per-batch cost/kg", async () => {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `COST-A${Date.now()}`,
          type: "TANK",
        },
      });
      const batchId = await (async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/fish-batches")
          .set("Authorization", auth(companyA.ownerToken))
          .send({
            speciesId,
            lotCode: nextLotCode(),
            tankId: tank.id,
            fishCount: 100,
            avgWeightG: 100,
            farmEntryDate: "2026-01-01",
          })
          .expect(201);
        return res.body.data.id as string;
      })();

      const todayIso = new Date().toISOString();

      // Manual, batch-tagged cost entry (e.g. transport for this specific lot).
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "TRANSPORTATION", amount: 250, batchId, incurredAt: todayIso })
        .expect(201);

      // A priced stock receipt should auto-derive a FEED cost entry (25kg * 40/kg = 1000).
      await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ feedProductId, quantityKg: 25, unitCostAmount: 40 })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(
        listRes.body.data.some(
          (e: { category: string; sourceType: string | null }) =>
            e.category === "FEED" && e.sourceType === "FeedInventoryTransaction",
        ),
      ).toBe(true);

      // Full harvest so the batch has a directCostPerKg denominator.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" })
        .expect(201);

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 1);
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 1);

      const summaryRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/cost-summary`)
        .query({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      expect(summaryRes.body.data.byCategory.TRANSPORTATION).toBeGreaterThanOrEqual(250);
      expect(summaryRes.body.data.byCategory.FEED).toBeGreaterThanOrEqual(1000);

      const batchRow = summaryRes.body.data.batchBreakdown.find(
        (b: { batchId: string }) => b.batchId === batchId,
      );
      expect(batchRow).toBeDefined();
      expect(batchRow.directCostTotal).toBe(250);
      expect(batchRow.harvestedKg).toBe(10); // 100 fish * 100g / 1000
      expect(batchRow.directCostPerKg).toBe(25); // 250 / 10
    });

    async function stockCostBatch(codePrefix: string, fishCount: number, avgWeightG: number) {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${codePrefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          type: "TANK",
        },
      });
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount,
          avgWeightG,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      return { tankId: tank.id, batchId: res.body.data.id as string };
    }

    /** Today ±1 day — wide enough to catch everything this test just wrote, narrow enough to skip old data. */
    function todayPeriod() {
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 1);
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 1);
      return { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
    }

    async function fetchCostSummary() {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/cost-summary`)
        .query(todayPeriod())
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      return res.body.data;
    }

    it("converts a USD cost entry to TRY at the entered rate and sums the TRY amount, not the USD one", async () => {
      const { batchId } = await stockCostBatch("CUSD", 100, 100);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          category: "MEDICINE",
          amount: 100,
          currency: "USD",
          exchangeRate: 40,
          batchId,
          incurredAt: new Date().toISOString(),
        })
        .expect(201);
      expect(res.body.data.currency).toBe("USD");
      expect(Number(res.body.data.amount)).toBe(100);
      expect(Number(res.body.data.exchangeRate)).toBe(40);
      expect(Number(res.body.data.amountTry)).toBe(4000);

      const summary = await fetchCostSummary();
      const batchRow = summary.batchBreakdown.find((b: { batchId: string }) => b.batchId === batchId);
      expect(batchRow.directCostTotal).toBe(4000);
    });

    it("a cost in an unsupported currency is rejected before anything is written", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "LABOR", amount: 10, currency: "GBP", incurredAt: new Date().toISOString() })
        .expect(400);
    });

    it("a priced harvest records TRY revenue, the batch result and an estimated mortality loss", async () => {
      const { tankId, batchId } = await stockCostBatch("SALE", 100, 100);

      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "TRANSPORTATION", amount: 500, batchId, incurredAt: new Date().toISOString() })
        .expect(201);

      // 10 fish die at 100g → 1 kg dead. Lifetime cost/kg = 500 / (0 live + 9 harvested + 1 dead) = 50.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankId}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 10, reason: "DISEASE" })
        .expect(201);

      // The remaining 90 fish → 9 kg at 200 TRY/kg = 1800 TRY.
      const harvestRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankId}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL", salePricePerKg: 200 })
        .expect(201);
      expect(Number(harvestRes.body.data.biomassKg)).toBe(9);
      expect(Number(harvestRes.body.data.saleRevenueTry)).toBe(1800);
      expect(harvestRes.body.data.saleCurrency).toBe("TRY");

      const summary = await fetchCostSummary();
      const batchRow = summary.batchBreakdown.find((b: { batchId: string }) => b.batchId === batchId);
      expect(batchRow.revenueTry).toBe(1800);
      expect(batchRow.avgSaleTryPerKg).toBe(200);
      expect(batchRow.directCostTotal).toBe(500);
      expect(batchRow.grossProfitTry).toBe(1300); // 1800 revenue − 500 direct cost
      expect(batchRow.mortalityKg).toBe(1);
      expect(batchRow.mortalityLossTry).toBe(50);

      // Farm totals are shared with other tests in this run, so assert they include this batch.
      expect(summary.revenueTry).toBeGreaterThanOrEqual(1800);
      expect(summary.mortalityLossTry).toBeGreaterThanOrEqual(50);
    });

    it("a USD sale price is converted at the rate stored on the harvest, and sale fields are validated", async () => {
      const { tankId, batchId } = await stockCostBatch("SALEUSD", 100, 100);

      const harvestRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankId}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          type: "ACTUAL",
          fullness: "FULL",
          salePricePerKg: 5,
          saleCurrency: "USD",
          saleExchangeRate: 40,
        })
        .expect(201);
      expect(harvestRes.body.data.saleCurrency).toBe("USD");
      expect(Number(harvestRes.body.data.saleExchangeRate)).toBe(40);
      expect(Number(harvestRes.body.data.saleRevenueTry)).toBe(2000); // 10 kg × $5 × 40

      // A sale currency with no price is a mistake, not a silent no-op.
      const second = await stockCostBatch("SALEBAD", 50, 100);
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${second.tankId}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: second.batchId, type: "ACTUAL", fullness: "FULL", saleCurrency: "USD" })
        .expect(400);

      // Only an actual harvest can carry a price; a planned one cannot.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${second.tankId}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId: second.batchId,
          type: "PLANNED",
          fullness: "FULL",
          plannedDate: "2026-06-01",
          salePricePerKg: 100,
        })
        .expect(400);
    });

    it("a USD feed purchase records the TRY unit cost on the lot and a USD-denominated FEED cost entry", async () => {
      const purchase = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          feedProductId,
          quantityKg: 10,
          unitCostCurrency: "USD",
          unitCostAmount: 2,
          exchangeRate: 40,
        })
        .expect(201);
      expect(Number(purchase.body.data.unitCostPerKg)).toBe(80); // $2 × 40

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const feedEntry = listRes.body.data.find(
        (e: { sourceId: string | null; sourceType: string | null }) =>
          e.sourceType === "FeedInventoryTransaction" && e.sourceId === purchase.body.data.id,
      );
      expect(feedEntry).toBeDefined();
      expect(feedEntry.currency).toBe("USD");
      expect(Number(feedEntry.amount)).toBe(20); // 10 kg × $2
      expect(Number(feedEntry.amountTry)).toBe(800); // 20 × 40
    });
    it("a recurring cost books each due month exactly once, however many times the cost page is read", async () => {
      const startUtc = new Date();
      startUtc.setUTCDate(1);
      startUtc.setUTCMonth(startUtc.getUTCMonth() - 2);
      const startDate = startUtc.toISOString().slice(0, 10);

      const created = await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/recurring-costs`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "ELECTRICITY", amount: 1200, dayOfMonth: 1, startDate, notes: "Test kira" })
        .expect(201);
      const recurringId = created.body.data.id as string;

      // Two months back plus this month (day 1 is never after today) → three occurrences.
      const countRecurring = async () => {
        const list = await request(app.getHttpServer())
          .get(`/api/v1/farms/${companyA.farmId}/cost-entries`)
          .set("Authorization", auth(companyA.ownerToken))
          .expect(200);
        return list.body.data.filter(
          (e: { sourceType: string | null; sourceId: string | null }) =>
            e.sourceType === "RecurringCost" && e.sourceId?.startsWith(recurringId),
        ).length;
      };
      expect(await countRecurring()).toBe(3);
      expect(await countRecurring()).toBe(3);

      await request(app.getHttpServer())
        .delete(`/api/v1/farms/${companyA.farmId}/recurring-costs/${recurringId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(await countRecurring()).toBe(3); // stopping keeps the costs that already happened
    });

    it("recurring costs and the cost forecast never read or write another company's farm", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/recurring-costs`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/cost-forecast`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyB.farmId}/recurring-costs`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "LABOR", amount: 100, dayOfMonth: 1, startDate: "2026-01-01" })
        .expect(404);
    });

    it("rejects a recurring day past the 28th, so every month has that day", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/recurring-costs`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "LABOR", amount: 100, dayOfMonth: 29, startDate: "2026-01-01" })
        .expect(400);
    });

    it("a farm-level cost is spread over the batches that carried biomass in the window", async () => {
      const { batchId } = await stockCostBatch("ALLOC", 100, 100);
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "ELECTRICITY", amount: 900, incurredAt: new Date().toISOString() })
        .expect(201);

      const summary = await fetchCostSummary();
      const row = summary.batchBreakdown.find((b: { batchId: string }) => b.batchId === batchId);
      expect(row).toBeDefined();
      expect(row.allocatedFarmCostTry).toBeGreaterThan(0);
      expect(row.fullCostTry).toBeCloseTo(row.directCostTotal + row.allocatedFarmCostTry, 1);
      expect(summary.allocatedFarmCostTry + summary.unallocatedFarmCostTry).toBeCloseTo(
        summary.farmLevelCostTry,
        1,
      );
    });

    it("feed a batch ate is costed at its lot's price, and shows in the economic FCR", async () => {
      const { tankId, batchId } = await stockCostBatch("FEEDC", 100, 100);
      const lot = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ feedProductId, quantityKg: 50, unitCostAmount: 40 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tankId}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, feedInventoryBatchId: lot.body.data.id, quantityKg: 5 })
        .expect(201);

      const summary = await fetchCostSummary();
      const row = summary.batchBreakdown.find((b: { batchId: string }) => b.batchId === batchId);
      expect(row.feedCostTry).toBe(200); // 5 kg × 40 TRY/kg
      expect(row.directCostTotal).toBe(200);

      // Economic FCR needs a biomass snapshot to define the window; recalculate, then read it back.
      const recalc = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/biomass/recalculate`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(201);
      const snapshotDate = recalc.body.data[0].snapshotDate as string;
      // A date-only end (what the date inputs send) must include today's feeding.
      const today = new Date().toISOString().slice(0, 10);

      const fcr = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/fcr`)
        .query({ periodStart: new Date(snapshotDate).toISOString(), periodEnd: today })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(fcr.body.data.economic.methodology).toBe("fcr.economic.v1");
      expect(fcr.body.data.economic.feedCostTry).toBe(200);
      expect(fcr.body.data.economic.feedUnpricedKg).toBe(0);
      expect(fcr.body.data.economic.feedCostPerKgGainTry).toBeNull(); // no weight gain yet
    });

    it("forecasts the feed still to be eaten and its cost to harvest, from the farm's recent feed price", async () => {
      const { batchId } = await stockCostBatch("FCAST", 100, 100); // 10 kg live, no costs yet

      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/cost-forecast`)
        .query({ targetWeightG: 200, targetFcr: 1, survivalPct: 100, feedPriceTryPerKg: 10 })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      expect(res.body.data.assumptions.feedPriceSource).toBe("input");
      const row = res.body.data.batches.find((b: { batchId: string }) => b.batchId === batchId);
      expect(row).toBeDefined();
      // Target 100 fish × 200g = 20 kg; 10 kg to gain at FCR 1 = 10 kg feed × 10 TRY = 100 TRY.
      expect(row.targetBiomassKg).toBe(20);
      expect(row.feedKgNeeded).toBe(10);
      expect(row.feedCostTry).toBe(100);
      expect(row.sunkCostTry).toBe(0);
      expect(row.totalCostTry).toBe(100);
      expect(row.costPerKgTry).toBe(5); // 100 TRY / 20 kg at harvest
    });
    async function newTankForStocking(prefix: string) {
      return prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          type: "TANK",
        },
      });
    }

    function stockingCostSum(batchId: string) {
      return prisma.costEntry
        .aggregate({
          where: { batchId, sourceType: { in: ["FishBatchStocking", "BatchTransfer"] } },
          _sum: { amountTry: true },
        })
        .then((r) => Number(r._sum.amountTry ?? 0));
    }

    it("stocking with a fingerling price books a FINGERLINGS cost, converted from EUR at the given rate", async () => {
      const tank = await newTankForStocking("STK-EUR");
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 1000,
          avgWeightG: 5,
          farmEntryDate: today,
          stockingSource: "FINGERLINGS_PURCHASED",
          stockingUnitPrice: 2.5,
          stockingCurrency: "EUR",
          stockingExchangeRate: 50,
        })
        .expect(201);
      const batchId = res.body.data.id as string;
      expect(res.body.data.stockingCurrency).toBe("EUR");

      const entry = await prisma.costEntry.findFirst({ where: { batchId, sourceType: "FishBatchStocking" } });
      expect(entry).not.toBeNull();
      expect(entry!.category).toBe("FINGERLINGS");
      expect(Number(entry!.amount)).toBe(2500); // 1000 fish × €2.5
      expect(Number(entry!.exchangeRate)).toBe(50);
      expect(Number(entry!.amountTry)).toBe(125000);
    });

    it("bought eggs are costed per egg in USD; our own eggs with no internal price book no cost", async () => {
      const bought = await newTankForStocking("EGG-BUY");
      const boughtRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: bought.id,
          fishCount: 9000,
          avgWeightG: 2,
          farmEntryDate: new Date().toISOString().slice(0, 10),
          stockingSource: "EGGS_PURCHASED",
          eggCount: 10000,
          stockingUnitPrice: 0.5,
          stockingCurrency: "USD",
          stockingExchangeRate: 40,
        })
        .expect(201);
      const boughtEntry = await prisma.costEntry.findFirst({
        where: { batchId: boughtRes.body.data.id, sourceType: "FishBatchStocking" },
      });
      expect(boughtEntry!.category).toBe("EGGS");
      expect(Number(boughtEntry!.amount)).toBe(5000); // 10 000 eggs × $0.5
      expect(Number(boughtEntry!.amountTry)).toBe(200000);

      const own = await newTankForStocking("EGG-OWN");
      const ownRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: own.id,
          fishCount: 7000,
          avgWeightG: 2,
          farmEntryDate: new Date().toISOString().slice(0, 10),
          stockingSource: "EGGS_IN_HOUSE",
          eggCount: 8000,
        })
        .expect(201);
      expect(ownRes.body.data.stockingSource).toBe("EGGS_IN_HOUSE");
      expect(ownRes.body.data.eggCount).toBe(8000);
      expect(await stockingCostSum(ownRes.body.data.id)).toBe(0);
    });

    it("an incomplete stocking price is rejected before anything is written", async () => {
      const tank = await newTankForStocking("STK-BAD");
      const base = {
        speciesId,
        tankId: tank.id,
        fishCount: 500,
        avgWeightG: 5,
        farmEntryDate: new Date().toISOString().slice(0, 10),
      };
      const cases = [
        { lotCode: nextLotCode(), stockingSource: "FINGERLINGS_PURCHASED" }, // no unit price
        { lotCode: nextLotCode(), stockingSource: "EGGS_PURCHASED", stockingUnitPrice: 0.5 }, // no egg count
        { lotCode: nextLotCode(), stockingUnitPrice: 2 }, // price without a source
        { lotCode: nextLotCode(), stockingSource: "FINGERLINGS_PURCHASED", stockingUnitPrice: 2, eggCount: 900 },
      ];
      for (const extra of cases) {
        await request(app.getHttpServer())
          .post("/api/v1/fish-batches")
          .set("Authorization", auth(companyA.ownerToken))
          .send({ ...base, ...extra })
          .expect(400);
      }
    });

    it("splitting fish off a batch moves its stocking cost with them, and merging moves it back in", async () => {
      const source = await newTankForStocking("SPL-A");
      const splitTank = await newTankForStocking("SPL-B");
      const batchRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: source.id,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: new Date().toISOString().slice(0, 10),
          stockingSource: "FINGERLINGS_PURCHASED",
          stockingUnitPrice: 2,
          stockingCurrency: "TRY",
        })
        .expect(201);
      const parentId = batchRes.body.data.id as string;
      expect(await stockingCostSum(parentId)).toBe(2000);

      // A split needs at least two targets. 300 fish → child 1 (30% of the cost), 100 → child 2 (10%),
      // so the parent keeps the other 600 fish (60%).
      const splitTank2 = await newTankForStocking("SPL-D");
      const splitRes = await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${parentId}/split`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          fromTankId: source.id,
          splits: [
            { toTankId: splitTank.id, lotCode: nextLotCode(), fishCount: 300 },
            { toTankId: splitTank2.id, lotCode: nextLotCode(), fishCount: 100 },
          ],
        })
        .expect(201);
      const [childId, childTwoId] = splitRes.body.data.childIds as string[];
      expect(await stockingCostSum(parentId)).toBe(1200);
      expect(await stockingCostSum(childId!)).toBe(600);
      expect(await stockingCostSum(childTwoId!)).toBe(200);

      // A second batch with its own cost (1000 fish × 3 TRY), merged with child 1's 300 fish.
      const otherTank = await newTankForStocking("SPL-C");
      const otherRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: otherTank.id,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: new Date().toISOString().slice(0, 10),
          stockingSource: "FINGERLINGS_PURCHASED",
          stockingUnitPrice: 3,
          stockingCurrency: "TRY",
        })
        .expect(201);
      const otherId = otherRes.body.data.id as string;
      const mergeTank = await newTankForStocking("SPL-M");
      const mergeRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches/merge")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          lotCode: nextLotCode(),
          toTankId: mergeTank.id,
          sources: [
            { batchId: childId!, fromTankId: splitTank.id, fishCount: 300 },
            { batchId: otherId, fromTankId: otherTank.id, fishCount: 1000 },
          ],
        })
        .expect(201);
      const mergedId = mergeRes.body.data.id as string;

      expect(await stockingCostSum(mergedId)).toBe(3600); // 600 moved from child 1 + 3000 own
      expect(await stockingCostSum(childId!)).toBe(0);
      expect(await stockingCostSum(otherId)).toBe(0);
      // Nothing was created or destroyed: the parent keeps 1200 and child 2 keeps its 200.
      expect(await stockingCostSum(parentId)).toBe(1200);
      expect(await stockingCostSum(childTwoId!)).toBe(200);
    });
    async function isolatedFarm(code: string) {
      const farm = await prisma.farm.create({
        data: { companyId: companyA.companyId, name: `Izole ${code}`, code: `ISO-${code}-${Date.now()}` },
      });
      const section = await prisma.farmSection.create({
        data: { companyId: companyA.companyId, farmId: farm.id, name: "S" },
      });
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: section.id,
          code: `ISO${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          type: "TANK",
        },
      });
      return { farmId: farm.id, tankId: tank.id };
    }

    it("the cost of fish sold is matched to the sale: unit cost = cost to date ÷ kg produced", async () => {
      const iso = await isolatedFarm("MATCH");
      const today = new Date().toISOString().slice(0, 10);
      const batch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: iso.tankId,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: today,
          stockingSource: "FINGERLINGS_PURCHASED",
          stockingUnitPrice: 2,
          stockingCurrency: "TRY",
        })
        .expect(201);
      const batchId = batch.body.data.id as string;

      // 100 fish die (10 kg produced and lost); the 900 left are harvested and sold at 200 TRY/kg.
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${iso.tankId}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 100, reason: "DISEASE" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${iso.tankId}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL", salePricePerKg: 200, saleCurrency: "TRY" })
        .expect(201);

      const from = new Date(Date.now() - 86400000).toISOString();
      const to = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${iso.farmId}/cost-summary`)
        .query({ periodStart: from, periodEnd: to })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const row = res.body.data.batchBreakdown.find((b: { batchId: string }) => b.batchId === batchId);

      // Cost to date 2000 TRY over 100 kg produced (90 harvested + 10 dead + 0 live) = 20 TRY/kg.
      expect(row.unitCostPerKg).toBe(20);
      expect(row.producedKg).toBe(100);
      expect(row.revenueTry).toBe(18000); // 90 kg × 200
      expect(row.cogsTry).toBe(1800); // 90 kg sold × 20
      expect(row.netProfitTry).toBe(16200);
      expect(row.mortalityLossTry).toBe(200); // 10 kg dead × 20
      expect(res.body.data.periodResultTry).toBe(16200);
      expect(res.body.data.unallocatedFarmCostTry).toBe(0);

      // A sourced stocking entry is changed at its batch, not deleted from the cost list.
      const stocking = await prisma.costEntry.findFirst({ where: { batchId, sourceType: "FishBatchStocking" } });
      await request(app.getHttpServer())
        .delete(`/api/v1/farms/${iso.farmId}/cost-entries/${stocking!.id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(400);
    });

    it("a manual cost can be corrected and removed", async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-entries`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ category: "OTHER", amount: 1000, incurredAt: new Date().toISOString(), notes: "yanlış" })
        .expect(201);
      const id = created.body.data.id as string;

      const fixed = await request(app.getHttpServer())
        .patch(`/api/v1/farms/${companyA.farmId}/cost-entries/${id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ amount: 1500, notes: "düzeltildi" })
        .expect(200);
      expect(Number(fixed.body.data.amount)).toBe(1500);
      expect(Number(fixed.body.data.amountTry)).toBe(1500);
      expect(fixed.body.data.notes).toBe("düzeltildi");

      await request(app.getHttpServer())
        .delete(`/api/v1/farms/${companyA.farmId}/cost-entries/${id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const gone = await prisma.costEntry.findFirst({ where: { id } });
      expect(gone).toBeNull();
    });

    it("the stocking price can be corrected, cleared and re-entered while the batch is whole; refused once split", async () => {
      const tank = await newTankForStocking("STK-FIX");
      const batch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: new Date().toISOString().slice(0, 10),
          stockingSource: "FINGERLINGS_PURCHASED",
          stockingUnitPrice: 2,
          stockingCurrency: "TRY",
        })
        .expect(201);
      const batchId = batch.body.data.id as string;
      expect(await stockingCostSum(batchId)).toBe(2000);

      await request(app.getHttpServer())
        .patch(`/api/v1/fish-batches/${batchId}/stocking`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ stockingSource: "FINGERLINGS_PURCHASED", stockingUnitPrice: 3, stockingCurrency: "TRY" })
        .expect(200);
      expect(await stockingCostSum(batchId)).toBe(3000);

      // Cleared: the cost disappears with the price.
      await request(app.getHttpServer())
        .patch(`/api/v1/fish-batches/${batchId}/stocking`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({})
        .expect(200);
      expect(await stockingCostSum(batchId)).toBe(0);

      // Re-entered on a batch that had no cost: booked again, same as creation.
      await request(app.getHttpServer())
        .patch(`/api/v1/fish-batches/${batchId}/stocking`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ stockingSource: "FINGERLINGS_PURCHASED", stockingUnitPrice: 2, stockingCurrency: "TRY" })
        .expect(200);
      expect(await stockingCostSum(batchId)).toBe(2000);

      const splitA = await newTankForStocking("STK-FIX-A");
      const splitB = await newTankForStocking("STK-FIX-B");
      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/split`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          fromTankId: tank.id,
          splits: [
            { toTankId: splitA.id, lotCode: nextLotCode(), fishCount: 300 },
            { toTankId: splitB.id, lotCode: nextLotCode(), fishCount: 100 },
          ],
        })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/v1/fish-batches/${batchId}/stocking`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ stockingSource: "FINGERLINGS_PURCHASED", stockingUnitPrice: 5, stockingCurrency: "TRY" })
        .expect(409);
    });

    it("calculates the hand-checked example over HTTP; a bad scenario fails alone; nothing is stored", async () => {
      const example = {
        startCount: 1000,
        startAvgWeightG: 5,
        startAccumulatedCostTry: 2000,
        targetWeightG: 100,
        mode: "SIMPLE",
        feedPriceTryPerKg: 50,
        fcr: 1,
        durationDays: 120,
        mortalityPct: 0,
        expenses: [{ label: "Dönem ek giderleri", amountTry: 1000, mode: "TOTAL" }],
      };
      const res = await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-scenarios/calculate`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ scenarios: [example, { ...example, targetWeightG: 4 }] })
        .expect(201);
      const [ok, bad] = res.body.data.results;
      expect(ok.ok).toBe(true);
      expect(ok.result.targetBiomassKg).toBeCloseTo(100, 6);
      expect(ok.result.feedKg).toBeCloseTo(95, 6);
      expect(ok.result.totalCostTry).toBeCloseTo(7750, 6);
      expect(ok.result.costPerFishTry).toBeCloseTo(7.75, 6);
      expect(ok.result.costPerKgTry).toBeCloseTo(77.5, 6);
      expect(bad.ok).toBe(false);
      expect(bad.error).toContain("büyük olmalı");
      expect(await prisma.costScenario.count({ where: { farmId: companyA.farmId } })).toBe(0);
    });

    it("saves a scenario, lists it, removes it; an unusable scenario is refused and not kept", async () => {
      const scenario = {
        startCount: 1000,
        startAvgWeightG: 5,
        startAccumulatedCostTry: 2000,
        targetWeightG: 100,
        mode: "SIMPLE",
        feedPriceTryPerKg: 50,
        fcr: 1,
        durationDays: 120,
        mortalityPct: 10,
        expenses: [],
      };
      const saved = await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-scenarios`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "Hedef 100 g, %10 ölüm", scenario })
        .expect(201);
      const id = saved.body.data.id as string;

      const list = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/cost-scenarios`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(list.body.data.some((s: { id: string }) => s.id === id)).toBe(true);

      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyA.farmId}/cost-scenarios`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "Geçersiz", scenario: { ...scenario, targetWeightG: 4 } })
        .expect(400);

      await request(app.getHttpServer())
        .delete(`/api/v1/farms/${companyA.farmId}/cost-scenarios/${id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/api/v1/farms/${companyA.farmId}/cost-scenarios/${id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);
      expect(await prisma.costScenario.count({ where: { farmId: companyA.farmId, deletedAt: null } })).toBe(0);
    });

    it("derives the duration from a growth rate when none is typed; an unweighed batch has no rate to offer", async () => {
      const iso = await isolatedFarm("SGR");
      const batch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: iso.tankId,
          fishCount: 1000,
          avgWeightG: 5,
          farmEntryDate: new Date().toISOString().slice(0, 10),
        })
        .expect(201);

      const prefill = await request(app.getHttpServer())
        .get(`/api/v1/farms/${iso.farmId}/cost-scenarios/prefill`)
        .query({ batchId: batch.body.data.id })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(prefill.body.data.sgrPctPerDay).toBeNull();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/farms/${iso.farmId}/cost-scenarios/calculate`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          scenarios: [
            {
              mode: "SIMPLE",
              startCount: 1000,
              startAvgWeightG: 5,
              startAccumulatedCostTry: 0,
              targetWeightG: 100,
              feedPriceTryPerKg: 50,
              fcr: 1,
              sgrPctPerDay: 2,
              mortalityPct: 0,
              expenses: [],
            },
          ],
        })
        .expect(201);
      const [only] = res.body.data.results;
      expect(only.ok).toBe(true);
      expect(only.result.durationSource).toBe("SGR");
      expect(only.result.days).toBeCloseTo(Math.log(20) / 0.02, 6);
    });

    it("another company's farm cannot be planned, listed or prefilled", async () => {
      const auth_ = auth(companyA.ownerToken);
      await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/cost-scenarios`)
        .set("Authorization", auth_)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyB.farmId}/cost-scenarios/calculate`)
        .set("Authorization", auth_)
        .send({ scenarios: [{ mode: "SIMPLE" }] })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/cost-scenarios/prefill`)
        .query({ batchId: "nonexistent" })
        .set("Authorization", auth_)
        .expect(404);
    });

    it("prefills a batch's live count, weight and realized cost; a batch from another farm is refused", async () => {
      const iso = await isolatedFarm("PREFILL");
      const other = await isolatedFarm("PREFILL-OTHER");
      const batch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: iso.tankId,
          fishCount: 1000,
          avgWeightG: 100,
          farmEntryDate: new Date().toISOString().slice(0, 10),
          stockingSource: "FINGERLINGS_PURCHASED",
          stockingUnitPrice: 2,
          stockingCurrency: "TRY",
        })
        .expect(201);
      const batchId = batch.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${iso.farmId}/cost-scenarios/prefill`)
        .query({ batchId })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(res.body.data.startCount).toBe(1000);
      expect(res.body.data.startAvgWeightG).toBe(100);
      expect(res.body.data.startAccumulatedCostTry).toBe(2000);
      expect(res.body.data.tankId).toBe(iso.tankId);
      expect(res.body.data.feedPriceTryPerKg).toBeNull();

      await request(app.getHttpServer())
        .get(`/api/v1/farms/${other.farmId}/cost-scenarios/prefill`)
        .query({ batchId })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);
    });

    it("reads the farm's own growth rate per weight range from its weighings; another company's farm is refused", async () => {
      const iso = await isolatedFarm("GROWTH");
      const batch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: iso.tankId,
          fishCount: 1000,
          avgWeightG: 5,
          farmEntryDate: new Date().toISOString().slice(0, 10),
        })
        .expect(201);
      const batchId = batch.body.data.id as string;

      // 5 g → 20 g over 30 days: one measured period, ln(4) / 30 per day.
      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();
      for (const [avgWeightG, daysAgo] of [
        [5, 30],
        [20, 0],
      ] as const) {
        await request(app.getHttpServer())
          .post(`/api/v1/tanks/${iso.tankId}/weight-samples`)
          .set("Authorization", auth(companyA.ownerToken))
          .send({
            batchId,
            sampleMethod: "AGGREGATE",
            sampleSize: 50,
            avgWeightG,
            occurredAt: new Date(now - daysAgo * day).toISOString(),
          })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .post(`/api/v1/farms/${iso.farmId}/cost-scenarios/growth-profile`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          ranges: [
            { minG: 5, maxG: 20 },
            { minG: 100, maxG: 350 },
          ],
        })
        .expect(201);
      expect(res.body.data.periodCount).toBe(1);
      const [inside, outside] = res.body.data.ranges;
      expect(inside.sgrPctPerDay).toBeCloseTo((Math.log(4) / 30) * 100, 6);
      expect(inside.days).toBeCloseTo(30, 6);
      expect(outside.sgrPctPerDay).toBeNull();

      await request(app.getHttpServer())
        .post(`/api/v1/farms/${companyB.farmId}/cost-scenarios/growth-profile`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ ranges: [{ minG: 5, maxG: 20 }] })
        .expect(404);
    });

    it("lists the ponds a batch is in, each with its farm; another company's batch is refused", async () => {
      const iso = await isolatedFarm("TANKSTATES");
      const batch = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: iso.tankId,
          fishCount: 1000,
          avgWeightG: 50,
          farmEntryDate: new Date().toISOString().slice(0, 10),
        })
        .expect(201);
      const batchId = batch.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/tank-states`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ tankId: iso.tankId, estimatedCount: 1000 });
      expect(res.body.data[0].tank.farmSection.farm.id).toBe(iso.farmId);

      await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}/tank-states`)
        .set("Authorization", auth(companyB.ownerToken))
        .expect(404);
    });

    it("supply stock: receive at one farm, transfer to another; balances follow; overdraw and same-farm transfers refused; another company sees and uses none of it", async () => {
      const a1 = await isolatedFarm("SUPPLY-1");
      const a2 = await isolatedFarm("SUPPLY-2");
      const item = await request(app.getHttpServer())
        .post("/api/v1/supply-items")
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "Metal panel", category: "Panel", unit: "adet" })
        .expect(201);
      const itemId = item.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/supply-items/${itemId}/receive`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ farmId: a1.farmId, quantity: 10 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/supply-items/${itemId}/transfer`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromFarmId: a1.farmId, toFarmId: a2.farmId, quantity: 4 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/supply-items/${itemId}/transfer`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromFarmId: a1.farmId, toFarmId: a2.farmId, quantity: 20 })
        .expect(400);
      await request(app.getHttpServer())
        .post(`/api/v1/supply-items/${itemId}/transfer`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromFarmId: a1.farmId, toFarmId: a1.farmId, quantity: 1 })
        .expect(400);

      const list = await request(app.getHttpServer())
        .get("/api/v1/supply-items")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const row = list.body.data.find((r: { id: string }) => r.id === itemId);
      expect(row.totalQuantity).toBe(10);
      const balanceAt = (farmId: string) =>
        row.balances.find((b: { farmId: string }) => b.farmId === farmId)?.quantity;
      expect(balanceAt(a1.farmId)).toBe(6);
      expect(balanceAt(a2.farmId)).toBe(4);

      const otherList = await request(app.getHttpServer())
        .get("/api/v1/supply-items")
        .set("Authorization", auth(companyB.ownerToken))
        .expect(200);
      expect(otherList.body.data.find((r: { id: string }) => r.id === itemId)).toBeUndefined();
      await request(app.getHttpServer())
        .post(`/api/v1/supply-items/${itemId}/receive`)
        .set("Authorization", auth(companyB.ownerToken))
        .send({ farmId: companyB.farmId, quantity: 1 })
        .expect(404);
    });

    it("cold storage: dead fish in, shipped out to a plant; no shipment without a plant or beyond the balance; another company's farm is refused", async () => {
      const iso = await isolatedFarm("COLD");
      const path = `/api/v1/farms/${iso.farmId}/cold-storage`;
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "IN", weightKg: 120 })
        .expect(201);
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "OUT", weightKg: 50, destination: "Test Un Fabrikası" })
        .expect(201);
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "OUT", weightKg: 100, destination: "Test Un Fabrikası" })
        .expect(400);
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "OUT", weightKg: 10 })
        .expect(400);

      const res = await request(app.getHttpServer())
        .get(path)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(res.body.data.balanceKg).toBe(70);
      expect(res.body.data.entries).toHaveLength(2);

      await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/cold-storage`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);
    });

    it("supply corrections: a movement's quantity can change or it can be removed only while no farm would go negative; another company gets 404", async () => {
      const a1 = await isolatedFarm("SUPPLY-FIX-1");
      const a2 = await isolatedFarm("SUPPLY-FIX-2");
      const item = await request(app.getHttpServer())
        .post("/api/v1/supply-items")
        .set("Authorization", auth(companyA.ownerToken))
        .send({ name: "Filtre", category: "Filtre", unit: "adet" })
        .expect(201);
      const itemId = item.body.data.id as string;
      const received = await request(app.getHttpServer())
        .post(`/api/v1/supply-items/${itemId}/receive`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ farmId: a1.farmId, quantity: 10 })
        .expect(201);
      const transfer = await request(app.getHttpServer())
        .post(`/api/v1/supply-items/${itemId}/transfer`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromFarmId: a1.farmId, toFarmId: a2.farmId, quantity: 4 })
        .expect(201);
      const transferId = transfer.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/supply-items/movements/${transferId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ quantity: 2 })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/supply-items/movements/${transferId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ quantity: 20 })
        .expect(400);

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/supply-items/${itemId}/movements`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(movements.body.data).toHaveLength(2);
      const list = await request(app.getHttpServer())
        .get("/api/v1/supply-items")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const row = list.body.data.find((r: { id: string }) => r.id === itemId);
      const at = (farmId: string) => row.balances.find((b: { farmId: string }) => b.farmId === farmId)?.quantity;
      expect(at(a1.farmId)).toBe(8);
      expect(at(a2.farmId)).toBe(2);

      // Removing the receipt would leave the source farm with -2: refused.
      await request(app.getHttpServer())
        .delete(`/api/v1/supply-items/movements/${received.body.data.id}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(400);
      // Removing the transfer is fine: all 10 are back at the first farm.
      await request(app.getHttpServer())
        .delete(`/api/v1/supply-items/movements/${transferId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const after = await request(app.getHttpServer())
        .get("/api/v1/supply-items")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const afterRow = after.body.data.find((r: { id: string }) => r.id === itemId);
      expect(afterRow.totalQuantity).toBe(10);

      await request(app.getHttpServer())
        .patch(`/api/v1/supply-items/movements/${received.body.data.id}`)
        .set("Authorization", auth(companyB.ownerToken))
        .send({ quantity: 1 })
        .expect(404);
    });

    it("cold storage corrections: an entry can change or be removed only while the balance stays at or above zero; another company gets 404", async () => {
      const iso = await isolatedFarm("COLD-FIX");
      const path = `/api/v1/farms/${iso.farmId}/cold-storage`;
      const inEntry = await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "IN", weightKg: 120 })
        .expect(201);
      const outEntry = await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "OUT", weightKg: 50, destination: "Test Un Fabrikası" })
        .expect(201);
      const inId = inEntry.body.data.id as string;
      const outId = outEntry.body.data.id as string;

      await request(app.getHttpServer())
        .patch(`${path}/${inId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ weightKg: 40 })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`${path}/${inId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ weightKg: 100 })
        .expect(200);
      const shown = await request(app.getHttpServer()).get(path).set("Authorization", auth(companyA.ownerToken)).expect(200);
      expect(shown.body.data.balanceKg).toBe(50);

      // Removing the intake would leave -50: refused. Removing the shipment restores the balance.
      await request(app.getHttpServer())
        .delete(`${path}/${inId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(400);
      await request(app.getHttpServer())
        .delete(`${path}/${outId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const restored = await request(app.getHttpServer()).get(path).set("Authorization", auth(companyA.ownerToken)).expect(200);
      expect(restored.body.data.balanceKg).toBe(100);

      await request(app.getHttpServer())
        .delete(`/api/v1/farms/${companyB.farmId}/cold-storage/${inId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(404);
    });

    it("cold storage pit vs rendering: buried fish is recorded for the farm but never counts toward the cold room's balance", async () => {
      const iso = await isolatedFarm("COLD-PIT");
      const path = `/api/v1/farms/${iso.farmId}/cold-storage`;
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "IN", disposal: "RENDERING", weightKg: 80 })
        .expect(201);
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "IN", disposal: "PIT", weightKg: 30 })
        .expect(201);

      const res = await request(app.getHttpServer()).get(path).set("Authorization", auth(companyA.ownerToken)).expect(200);
      expect(res.body.data.balanceKg).toBe(80);
      expect(res.body.data.pitKg).toBe(30);
      expect(res.body.data.entries).toHaveLength(2);

      // A shipment to the plant can only use the rendering stock: 81 kg is more than the 80 kg there.
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ kind: "OUT", weightKg: 81, destination: "Test Un Fabrikası" })
        .expect(400);
    });
  });

  describe("regulatory inspection report", () => {
    it("aggregates active stock, mortality, treatments, water quality, feed usage, and harvests for a period", async () => {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `INSP-A${Date.now()}`,
          type: "TANK",
        },
      });

      const lotCode = nextLotCode();
      const stockRes = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode,
          tankId: tank.id,
          fishCount: 500,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const batchId = stockRes.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 15, reason: "DISEASE" })
        .expect(201);

      const treatmentProductName = `InspectionTestMed-${Date.now()}`;
      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/treatments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          batchId,
          type: "MEDICATION",
          productName: treatmentProductName,
          startedAt: new Date().toISOString(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/water-quality-readings`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ temperatureC: 12.3, dissolvedOxygenMgL: 9.9, ph: 6.9 })
        .expect(201);

      const inventoryRes = await request(app.getHttpServer())
        .post(`/api/v1/warehouses/${warehouseId}/inventory-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ feedProductId, quantityKg: 100 })
        .expect(201);
      const inventoryBatchId = inventoryRes.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/feeding-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, feedInventoryBatchId: inventoryBatchId, quantityKg: 12.5 })
        .expect(201);

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 1);
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 1);

      const reportRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/inspection-report`)
        .query({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const report = reportRes.body.data;
      expect(
        report.activeBatches.some((b: { lotCode: string }) => b.lotCode === lotCode),
      ).toBe(true);
      expect(report.mortality.total).toBeGreaterThanOrEqual(15);
      expect(
        report.treatments.some(
          (t: { productName: string }) => t.productName === treatmentProductName,
        ),
      ).toBe(true);
      expect(report.waterQuality.readingCount).toBeGreaterThanOrEqual(1);
      expect(report.waterQuality.dissolvedOxygenMgL.max).toBeGreaterThanOrEqual(9.9);
      expect(report.totalFeedKg).toBeGreaterThanOrEqual(12.5);

      const harvestRes = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/harvest-records`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, type: "ACTUAL", fullness: "FULL" })
        .expect(201);

      const reportAfterHarvestRes = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/inspection-report`)
        .query({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() })
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      expect(
        reportAfterHarvestRes.body.data.harvestRecords.some(
          (h: { fishCount: number }) => h.fishCount === harvestRes.body.data.fishCount,
        ),
      ).toBe(true);
    });
  });

  describe("Clerk webhook signature verification", () => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET!;

    function signedHeaders(payload: string) {
      const svixId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date();
      const signature = new Webhook(webhookSecret).sign(svixId, timestamp, payload);
      return {
        "svix-id": svixId,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": signature,
      };
    }

    it("rejects a request with missing svix headers (400)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/webhooks/clerk")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ type: "user.created", data: {} }));
      expect(res.status).toBe(400);
    });

    it("rejects a payload that no longer matches its signature (400)", async () => {
      const originalPayload = JSON.stringify({
        type: "user.created",
        data: { id: "clerk_tamper_test" },
      });
      const headers = signedHeaders(originalPayload);
      const tamperedPayload = JSON.stringify({
        type: "user.created",
        data: { id: "clerk_tamper_test_ATTACKER" },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/webhooks/clerk")
        .set(headers)
        .set("Content-Type", "application/json")
        .send(tamperedPayload);
      expect(res.status).toBe(400);
    });

    it("a correctly-signed user.created payload reconciles a placeholder User with real profile data", async () => {
      const authProviderId = `clerk_webhook_test_${Date.now()}`;
      await prisma.user.create({
        data: {
          authProviderId,
          email: `${authProviderId}@pending.aquai.local`,
          fullName: "Pending Profile",
        },
      });

      const payload = JSON.stringify({
        type: "user.created",
        data: {
          id: authProviderId,
          email_addresses: [{ email_address: "real.user@example.com" }],
          first_name: "Real",
          last_name: "User",
        },
      });
      const headers = signedHeaders(payload);

      const res = await request(app.getHttpServer())
        .post("/api/v1/webhooks/clerk")
        .set(headers)
        .set("Content-Type", "application/json")
        .send(payload);
      expect(res.status).toBe(201); // NestJS's default POST status; no @HttpCode override

      const updated = await prisma.user.findUnique({ where: { authProviderId } });
      expect(updated?.email).toBe("real.user@example.com");
      expect(updated?.fullName).toBe("Real User");
    });
  });

  describe("trial expiry enforcement", () => {
    it("blocks a TRIAL company once its 30-day window has passed (403)", async () => {
      const tenant = await seedTenant(prisma, "trial-expired");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await prisma.company.update({
        where: { id: tenant.companyId },
        data: { trialEndsAt: yesterday },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/farms")
        .set("Authorization", auth(tenant.ownerToken));
      expect(res.status).toBe(403);
    });

    it("still allows access while a TRIAL company's window is in the future", async () => {
      const tenant = await seedTenant(prisma, "trial-active");
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      await prisma.company.update({
        where: { id: tenant.companyId },
        data: { trialEndsAt: nextWeek },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/farms")
        .set("Authorization", auth(tenant.ownerToken));
      expect(res.status).toBe(200);
    });

    it("never blocks a company once it's off the TRIAL tier, even with a past trialEndsAt", async () => {
      const tenant = await seedTenant(prisma, "trial-converted");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await prisma.company.update({
        where: { id: tenant.companyId },
        data: { trialEndsAt: yesterday, planTier: "STARTER" },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/farms")
        .set("Authorization", auth(tenant.ownerToken));
      expect(res.status).toBe(200);
    });
  });

  describe("batch count adjustment — corrects a count without it reading as mortality", () => {
    async function stockBatch(fishCount: number) {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `ADJ-${Date.now()}-${lotSeq}`,
          type: "TANK",
        },
      });
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount,
          avgWeightG: 100,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      return { tank, batchId: create.body.data.id as string };
    }

    it("a negative adjustment lowers the count and never appears as mortality; a positive one raises it back", async () => {
      const { tank, batchId } = await stockBatch(1000);

      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ tankId: tank.id, fishCount: -40, notes: "Sayım düzeltmesi" })
        .expect(201);

      const afterDown = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(afterDown.body.data.currentState.estimatedCount).toBe(960);

      const mortalityList = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(mortalityList.body.data).toHaveLength(0);

      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ tankId: tank.id, fishCount: 40 })
        .expect(201);

      const afterUp = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(afterUp.body.data.currentState.estimatedCount).toBe(1000);
    });

    it("refuses an adjustment that would take a tank below zero, and a zero adjustment; another company gets 404", async () => {
      const { tank, batchId } = await stockBatch(1000);

      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ tankId: tank.id, fishCount: -1001 })
        .expect(400);
      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/adjustments`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ tankId: tank.id, fishCount: 0 })
        .expect(400);
      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/adjustments`)
        .set("Authorization", auth(companyB.ownerToken))
        .send({ tankId: tank.id, fishCount: -1 })
        .expect(404);
    });
  });

  describe("mortality reported by total weight", () => {
    async function stockBatch(avgWeightG: number) {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `WGT-${Date.now()}-${lotSeq}`,
          type: "TANK",
        },
      });
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 1000,
          avgWeightG,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      return { tank, batchId: create.body.data.id as string };
    }

    it("converts grams to a count using the batch's average weight and stores the weighed biomass", async () => {
      const { tank, batchId } = await stockBatch(100);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, totalWeightG: 500, reason: "OXYGEN" })
        .expect(201);

      expect(res.body.data.fishCount).toBe(5);
      expect(Number(res.body.data.estimatedBiomassKg)).toBeCloseTo(0.5);
    });

    it("rejects sending both a count and a weight, or neither", async () => {
      const { tank, batchId } = await stockBatch(100);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 2, totalWeightG: 200, reason: "OXYGEN" })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, reason: "OXYGEN" })
        .expect(400);
    });

    it("removing a mortality event restores the fish it counted as dead; another company gets 404", async () => {
      const { tank, batchId } = await stockBatch(100);
      const created = await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId, fishCount: 40, reason: "DISEASE" })
        .expect(201);
      const eventId = created.body.data.id as string;

      const afterMortality = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(afterMortality.body.data.currentState.estimatedCount).toBe(960);

      await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${tank.id}/mortality-events/${eventId}`)
        .set("Authorization", auth(companyB.ownerToken))
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/tanks/${tank.id}/mortality-events/${eventId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const afterRemoval = await request(app.getHttpServer())
        .get(`/api/v1/fish-batches/${batchId}`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(afterRemoval.body.data.currentState.estimatedCount).toBe(1000);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      expect(list.body.data.find((e: { id: string }) => e.id === eventId)).toBeUndefined();
    });
  });

  describe("farm overview — one request for the farms page", () => {
    it("GET /farm-overview lists only the caller's farms, each with the same summary as its per-farm endpoint", async () => {
      const overview = await request(app.getHttpServer())
        .get("/api/v1/farm-overview")
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const ids = overview.body.data.map((row: { farm: { id: string } }) => row.farm.id);
      expect(ids).toContain(companyA.farmId);
      expect(ids).not.toContain(companyB.farmId);

      const perFarm = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/stock-summary`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);
      const row = overview.body.data.find(
        (r: { farm: { id: string } }) => r.farm.id === companyA.farmId,
      );
      expect(row.summary).toEqual(perFarm.body.data);
    });
  });

  describe("farm-wide aggregate endpoints (replace the frontend's per-tank fan-out)", () => {
    it("GET /farms/:farmId/fish-batches — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/fish-batches`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/mortality-events — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/transfers — Company B's farm id, authed as A → 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyB.farmId}/transfers`)
        .set("Authorization", auth(companyA.ownerToken));
      expect(res.status).toBe(404);
    });

    it("GET /farms/:farmId/fish-batches — aggregates allocations across every tank in the farm, not just one", async () => {
      const [tankOne, tankTwo] = await Promise.all([
        prisma.tank.create({
          data: {
            companyId: companyA.companyId,
            farmSectionId: companyA.sectionId,
            code: `AGG-ONE-${Date.now()}`,
            type: "TANK",
          },
        }),
        prisma.tank.create({
          data: {
            companyId: companyA.companyId,
            farmSectionId: companyA.sectionId,
            code: `AGG-TWO-${Date.now()}`,
            type: "TANK",
          },
        }),
      ]);

      await Promise.all(
        [tankOne, tankTwo].map((tank) =>
          request(app.getHttpServer())
            .post("/api/v1/fish-batches")
            .set("Authorization", auth(companyA.ownerToken))
            .send({
              speciesId,
              lotCode: nextLotCode(),
              tankId: tank.id,
              fishCount: 200,
              avgWeightG: 50,
              farmEntryDate: "2026-01-01",
            })
            .expect(201),
        ),
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/fish-batches`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const tankIds = res.body.data.map((a: { tankId: string }) => a.tankId);
      expect(tankIds).toEqual(expect.arrayContaining([tankOne.id, tankTwo.id]));
    });

    it("GET /farms/:farmId/mortality-events — includes the tank, newest first, across tanks", async () => {
      const tank = await prisma.tank.create({
        data: {
          companyId: companyA.companyId,
          farmSectionId: companyA.sectionId,
          code: `AGG-MORT-${Date.now()}`,
          type: "TANK",
        },
      });
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode: nextLotCode(),
          tankId: tank.id,
          fishCount: 300,
          avgWeightG: 80,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tanks/${tank.id}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ batchId: create.body.data.id, fishCount: 10, reason: "OXYGEN" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/mortality-events`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const entry = res.body.data.find((e: { batchId: string }) => e.batchId === create.body.data.id);
      expect(entry).toBeDefined();
      expect(entry.tank.id).toBe(tank.id);
      expect(entry.tank.code).toBe(tank.code);
    });

    it("GET /farms/:farmId/transfers — joins lotCode/fromTankCode/toTankCode and excludes non-TRANSFER movements", async () => {
      const [fromTank, toTank] = await Promise.all([
        prisma.tank.create({
          data: {
            companyId: companyA.companyId,
            farmSectionId: companyA.sectionId,
            code: `AGG-FROM-${Date.now()}`,
            type: "TANK",
          },
        }),
        prisma.tank.create({
          data: {
            companyId: companyA.companyId,
            farmSectionId: companyA.sectionId,
            code: `AGG-TO-${Date.now()}`,
            type: "TANK",
          },
        }),
      ]);
      const lotCode = nextLotCode();
      const create = await request(app.getHttpServer())
        .post("/api/v1/fish-batches")
        .set("Authorization", auth(companyA.ownerToken))
        .send({
          speciesId,
          lotCode,
          tankId: fromTank.id,
          fishCount: 150,
          avgWeightG: 60,
          farmEntryDate: "2026-01-01",
        })
        .expect(201);
      const batchId = create.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/fish-batches/${batchId}/movements`)
        .set("Authorization", auth(companyA.ownerToken))
        .send({ fromTankId: fromTank.id, toTankId: toTank.id, fishCount: 100 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/farms/${companyA.farmId}/transfers`)
        .set("Authorization", auth(companyA.ownerToken))
        .expect(200);

      const entries = res.body.data as Array<{
        batchId: string;
        movementType: string;
        lotCode: string;
        fromTankCode: string | null;
        toTankCode: string | null;
      }>;
      expect(entries.every((e) => e.movementType === "TRANSFER")).toBe(true);
      const transfer = entries.find((e) => e.batchId === batchId);
      expect(transfer).toBeDefined();
      expect(transfer?.lotCode).toBe(lotCode);
      expect(transfer?.fromTankCode).toBe(fromTank.code);
      expect(transfer?.toTankCode).toBe(toTank.code);
    });
  });
});
