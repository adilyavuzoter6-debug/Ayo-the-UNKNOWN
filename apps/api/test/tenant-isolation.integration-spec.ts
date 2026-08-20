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
        .send({ feedProductId, quantityKg: 25, unitCostPerKg: 40 })
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
});
