import { CallHandler, ConflictException, ExecutionContext, UnprocessableEntityException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { firstValueFrom, Observable, of, throwError } from "rxjs";
import type { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { IdempotencyInterceptor } from "./idempotency.interceptor";

interface FakeRecord {
  id: string;
  companyId: string;
  userId: string;
  key: string;
  method: string;
  path: string;
  statusCode: number | null;
  responseBody: unknown;
  createdAt: Date;
  completedAt: Date | null;
}

/** In-memory stand-in for the idempotency_records table, with its (companyId, key) unique index. */
function makeFakeDb() {
  const rows: FakeRecord[] = [];
  let seq = 0;
  const table = {
    create: async ({ data }: { data: Omit<FakeRecord, "id" | "statusCode" | "responseBody" | "createdAt" | "completedAt"> }) => {
      if (rows.some((r) => r.companyId === data.companyId && r.key === data.key)) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        });
      }
      const row: FakeRecord = { ...data, id: `r${++seq}`, statusCode: null, responseBody: null, createdAt: new Date(), completedAt: null };
      rows.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: { key: string } }) => rows.find((r) => r.key === where.key) ?? null,
    updateMany: async ({ where, data }: { where: { id: string }; data: Partial<FakeRecord> }) => {
      const row = rows.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return { count: row ? 1 : 0 };
    },
    deleteMany: async ({ where }: { where: { id: string } }) => {
      const i = rows.findIndex((r) => r.id === where.id);
      if (i >= 0) rows.splice(i, 1);
      return { count: i >= 0 ? 1 : 0 };
    },
  };
  const tenantPrisma = { forTenant: () => ({ idempotencyRecord: table }) } as unknown as TenantPrismaService;
  return { rows, tenantPrisma };
}

function makeContext(key: string | undefined, opts: { userId?: string; path?: string } = {}) {
  const request = {
    method: "POST",
    originalUrl: opts.path ?? "/api/v1/tanks/t1/feeding-events",
    tenant: { companyId: "c1", membershipId: "m1", role: "WORKER", farmScopeIds: [] },
    authUser: { id: opts.userId ?? "u1" },
    header: (name: string) => (name === "idempotency-key" ? key : undefined),
  };
  const response = { statusCode: 201, status(code: number) { this.statusCode = code; return this; } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
  return { context, response };
}

function handlerReturning(factory: () => Observable<unknown>) {
  const calls = { count: 0 };
  const next: CallHandler = { handle: () => { calls.count++; return factory(); } };
  return { next, calls };
}

const idempotentRoute = { get: () => true } as unknown as Reflector;

async function run(interceptor: IdempotencyInterceptor, context: ExecutionContext, next: CallHandler) {
  return firstValueFrom(await interceptor.intercept(context, next));
}

describe("IdempotencyInterceptor", () => {
  it("runs the handler once and replays the stored response for a repeated key", async () => {
    const { rows, tenantPrisma } = makeFakeDb();
    const interceptor = new IdempotencyInterceptor(idempotentRoute, tenantPrisma);
    const { next, calls } = handlerReturning(() => of({ id: "feed-1", quantityKg: new Prisma.Decimal("12.5") }));

    const first = await run(interceptor, makeContext("k1").context, next);
    const second = await run(interceptor, makeContext("k1").context, next);

    expect(calls.count).toBe(1);
    expect(first).toEqual({ id: "feed-1", quantityKg: new Prisma.Decimal("12.5") });
    // Replayed in its wire form (Decimal serialized to a string), exactly as Express sent it.
    expect(second).toEqual({ id: "feed-1", quantityKg: "12.5" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.completedAt).not.toBeNull();
  });

  it("does nothing special without an Idempotency-Key header", async () => {
    const { rows, tenantPrisma } = makeFakeDb();
    const interceptor = new IdempotencyInterceptor(idempotentRoute, tenantPrisma);
    const { next, calls } = handlerReturning(() => of({ id: "x" }));

    await run(interceptor, makeContext(undefined).context, next);
    await run(interceptor, makeContext(undefined).context, next);

    expect(calls.count).toBe(2);
    expect(rows).toHaveLength(0);
  });

  it("ignores the header on routes not marked @Idempotent()", async () => {
    const { rows, tenantPrisma } = makeFakeDb();
    const interceptor = new IdempotencyInterceptor({ get: () => undefined } as unknown as Reflector, tenantPrisma);
    const { next, calls } = handlerReturning(() => of({ id: "x" }));

    await run(interceptor, makeContext("k1").context, next);
    await run(interceptor, makeContext("k1").context, next);

    expect(calls.count).toBe(2);
    expect(rows).toHaveLength(0);
  });

  it("releases the key when the handler fails, so a retry runs it again", async () => {
    const { rows, tenantPrisma } = makeFakeDb();
    const interceptor = new IdempotencyInterceptor(idempotentRoute, tenantPrisma);
    let fail = true;
    const { next, calls } = handlerReturning(() => (fail ? throwError(() => new Error("db down")) : of({ id: "ok" })));

    await expect(run(interceptor, makeContext("k1").context, next)).rejects.toThrow("db down");
    expect(rows).toHaveLength(0);

    fail = false;
    await expect(run(interceptor, makeContext("k1").context, next)).resolves.toEqual({ id: "ok" });
    expect(calls.count).toBe(2);
  });

  it("answers 409 while the same key is still in flight", async () => {
    const { rows, tenantPrisma } = makeFakeDb();
    rows.push({ id: "r0", companyId: "c1", userId: "u1", key: "k1", method: "POST", path: "/api/v1/tanks/t1/feeding-events", statusCode: null, responseBody: null, createdAt: new Date(), completedAt: null });
    const interceptor = new IdempotencyInterceptor(idempotentRoute, tenantPrisma);
    const { next, calls } = handlerReturning(() => of({ id: "x" }));

    await expect(interceptor.intercept(makeContext("k1").context, next)).rejects.toBeInstanceOf(ConflictException);
    expect(calls.count).toBe(0);
  });

  it("re-runs a request whose in-flight record was abandoned long ago", async () => {
    const { rows, tenantPrisma } = makeFakeDb();
    rows.push({ id: "r0", companyId: "c1", userId: "u1", key: "k1", method: "POST", path: "/api/v1/tanks/t1/feeding-events", statusCode: null, responseBody: null, createdAt: new Date(Date.now() - 10 * 60 * 1000), completedAt: null });
    const interceptor = new IdempotencyInterceptor(idempotentRoute, tenantPrisma);
    const { next, calls } = handlerReturning(() => of({ id: "x" }));

    await expect(run(interceptor, makeContext("k1").context, next)).resolves.toEqual({ id: "x" });
    expect(calls.count).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it("rejects a key reused by a different user or for a different route", async () => {
    const { tenantPrisma } = makeFakeDb();
    const interceptor = new IdempotencyInterceptor(idempotentRoute, tenantPrisma);
    const { next } = handlerReturning(() => of({ id: "x" }));
    await run(interceptor, makeContext("k1").context, next);

    await expect(interceptor.intercept(makeContext("k1", { userId: "u2" }).context, next)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(
      interceptor.intercept(makeContext("k1", { path: "/api/v1/tanks/t1/mortality-events" }).context, next),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("replays the original status code", async () => {
    const { tenantPrisma } = makeFakeDb();
    const interceptor = new IdempotencyInterceptor(idempotentRoute, tenantPrisma);
    const { next } = handlerReturning(() => of({ id: "x" }));
    await run(interceptor, makeContext("k1").context, next);

    const { context, response } = makeContext("k1");
    response.statusCode = 200;
    await run(interceptor, context, next);
    expect(response.statusCode).toBe(201);
  });
});
