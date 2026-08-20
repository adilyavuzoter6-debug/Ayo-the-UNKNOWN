import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Models that carry a denormalized `companyId` column (docs/architecture/04-database-schema.md
 * §4.1) and therefore must always be queried tenant-scoped. Grows as new modules ship.
 */
const TENANT_SCOPED_MODELS = new Set([
  "CompanyMembership",
  "Invitation",
  "Farm",
  "FarmSection",
  "Tank",
  "AuditLog",
  "Alert",
  "FishSpecies",
  "FishBatch",
  "BatchMovement",
  "FeedProduct",
  "Warehouse",
  "FeedInventoryBatch",
  "FeedInventoryTransaction",
  "FeedingEvent",
  "MortalityEvent",
  "WeightSample",
  "BiomassSnapshot",
  "WaterQualityReading",
  "HarvestRecord",
  // BatchCurrentState/BatchTankState/FeedInventoryBalance deliberately excluded — per
  // docs/architecture/04-database-schema.md §4.4/§4.6 they carry no companyId column at all
  // (keyed only by batchId/tankId or feedInventoryBatchId), same as MembershipFarmScope.
  // Tenant isolation for them comes from always reaching them through an already-tenant-
  // verified FishBatch/Tank/FeedInventoryBatch id (assertTankInTenant, FishBatchesService.
  // findById, etc.), never from a direct companyId filter on the table itself.
]);

/**
 * The ONLY sanctioned way for a module service to reach Prisma. See
 * docs/architecture/06-multi-tenant-security.md §6.2 Layer 1: every repository call must be
 * structurally forced to filter by the resolved tenant. This is enforced two ways:
 *
 *   1. `forTenant(companyId)` returns a Prisma Client Extension that auto-injects `companyId`
 *      into `where` on find/count/updateMany/deleteMany, and auto-stamps `companyId` into
 *      `data` on create — silently overwriting any client-supplied value rather than trusting it.
 *   2. `assertOwnedByTenant(...)` is used for primary-key lookups (`findUnique`), which Prisma
 *      extensions cannot safely filter (findUnique only accepts unique-constraint fields) — the
 *      caller loads by id, then this throws NotFoundException on tenant mismatch, never
 *      ForbiddenException, so a cross-tenant probe can't distinguish "wrong tenant" from
 *      "doesn't exist" (§6.2 point 3).
 *
 * The `eslint.nestjs.js` "no-restricted-syntax" rule blocks `this.prisma.*` access anywhere
 * outside this file, so a service bypassing this helper fails lint, not just code review.
 */
@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant-scoped Prisma client. Use for every read/write inside a request's company context. */
  forTenant(companyId: string) {
    if (!companyId) {
      throw new ForbiddenException("No tenant context resolved for this request.");
    }

    return this.prisma.$extends({
      name: `tenant-scope:${companyId}`,
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            if (TENANT_SCOPED_MODELS.has(model)) {
              args.where = { ...args.where, companyId };
            }
            return query(args);
          },
          async findFirst({ model, args, query }) {
            if (TENANT_SCOPED_MODELS.has(model)) {
              args.where = { ...args.where, companyId };
            }
            return query(args);
          },
          async count({ model, args, query }) {
            if (TENANT_SCOPED_MODELS.has(model)) {
              args.where = { ...args.where, companyId };
            }
            return query(args);
          },
          async updateMany({ model, args, query }) {
            if (TENANT_SCOPED_MODELS.has(model)) {
              args.where = { ...args.where, companyId };
            }
            return query(args);
          },
          async deleteMany({ model, args, query }) {
            if (TENANT_SCOPED_MODELS.has(model)) {
              args.where = { ...args.where, companyId };
            }
            return query(args);
          },
          async create({ model, args, query }) {
            if (TENANT_SCOPED_MODELS.has(model)) {
              // `data`'s type is a per-model discriminated union (CreateInput), so it can't be
              // widened generically across $allModels the way `where` can — the runtime
              // TENANT_SCOPED_MODELS check above is what actually keeps this safe.
              const data = args.data as Record<string, unknown>;
              args.data = { ...data, companyId } as typeof args.data;
            }
            return query(args);
          },
        },
      },
    });
  }

  /**
   * For findUnique-by-id lookups (which Prisma extensions can't tenant-filter directly).
   * Throws NotFoundException — never ForbiddenException — on mismatch or missing record, so
   * a cross-tenant ID probe gets an identical response either way.
   */
  assertOwnedByTenant<T extends { companyId: string } | null | undefined>(
    entity: T,
    companyId: string,
    entityLabel = "Resource",
  ): asserts entity is NonNullable<T> {
    if (!entity || entity.companyId !== companyId) {
      throw new NotFoundException(`${entityLabel} not found.`);
    }
  }

  /**
   * Narrow, deliberate exception: looking up an Invitation by its opaque token is, by
   * definition, the one lookup that can't start from an already-known companyId (that's what
   * this call resolves). Once resolved, all subsequent operations on it go through
   * `forTenant(invitation.companyId)` like everything else. See MembersService.acceptInvitation.
   */
  async findInvitationByToken(token: string) {
    return this.prisma.invitation.findUnique({ where: { token } });
  }

  /**
   * Another narrow, deliberate exception: FishSpecies rows with `companyId: null` are global
   * reference species shared across every tenant (see prisma/schema.prisma FishSpecies
   * doc-comment). `forTenant(companyId).fishSpecies.findMany()` would force an exact-match
   * `companyId` filter and silently exclude those global rows, so this reads both sets
   * explicitly instead. Every other FishSpecies operation (creating a company's own custom
   * strain) still goes through `forTenant()` as normal.
   */
  async findSpeciesForCompany(companyId: string) {
    return this.prisma.fishSpecies.findMany({
      where: { deletedAt: null, OR: [{ companyId }, { companyId: null }] },
      orderBy: { name: "asc" },
    });
  }
}
