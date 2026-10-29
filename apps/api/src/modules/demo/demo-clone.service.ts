import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { companyGraph, quote } from "./company-graph";

interface Column {
  name: string;
  /** information_schema data_type: "text", "ARRAY", "timestamp without time zone", "date", … */
  type: string;
}

/**
 * Copies a demo template company into a new company for one visitor, and deletes such copies.
 *
 * Every copied row keeps its template id plus a suffix unique to the copy, and every column that
 * holds an id is passed through the same mapping, so a copy points only at itself (and the template
 * owner's id at the visitor). Dates move forward by the time since the template was made, so a copy
 * always reads as if it had been recorded up to a few minutes ago. One transaction, in SQL: a copy
 * of seven months of a three-farm demo takes a second or two.
 */
@Injectable()
export class DemoCloneService {
  private columns = new Map<string, Column[]>();

  constructor(private readonly prisma: PrismaService) {}

  private async columnsOf(tx: Prisma.TransactionClient, table: string): Promise<Column[]> {
    const known = this.columns.get(table);
    if (known) return known;
    const rows = await tx.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table}
      ORDER BY ordinal_position`;
    const columns = rows.map((r) => ({ name: r.column_name, type: r.data_type }));
    this.columns.set(table, columns);
    return columns;
  }

  /** Copies the template into a new VISITOR company owned by `ownerUserId`. Returns its id. */
  async cloneTemplate(templateId: string, ownerUserId: string): Promise<string> {
    // Hex only, so it's safe written into SQL.
    const suffix = `-d${randomBytes(5).toString("hex")}`;
    const { copy } = companyGraph();

    return this.prisma.$transaction(
      async (tx) => {
        const template = await tx.company.findUniqueOrThrow({ where: { id: templateId } });
        const shiftMs = Math.max(0, Date.now() - template.createdAt.getTime());
        const companyId = `${template.id}${suffix}`;
        // Generated here, never from input; checked anyway before they're written into the SQL.
        if (!/^[A-Za-z0-9-]+$/.test(companyId)) throw new Error("Unexpected template id format.");
        const sfx = `'${suffix}'`;
        const newCompany = `'${companyId}'`;
        const shift = `'${Math.round(shiftMs)} milliseconds'::interval`;

        await tx.company.create({
          data: {
            id: companyId,
            name: template.name,
            legalName: template.legalName,
            countryCode: template.countryCode,
            timezone: template.timezone,
            planTier: "ENTERPRISE",
            demoKind: "VISITOR",
          },
        });
        await tx.companyMembership.create({
          data: { companyId, userId: ownerUserId, role: "COMPANY_OWNER", status: "ACTIVE", joinedAt: new Date() },
        });

        // old id → new id for every copied row, plus the template's people → the visitor.
        await tx.$executeRawUnsafe(`CREATE TEMP TABLE demo_id_map (old_id text PRIMARY KEY, new_id text NOT NULL) ON COMMIT DROP`);
        for (const plan of copy) {
          const columns = await this.columnsOf(tx, plan.table);
          if (!columns.some((c) => c.name === "id")) continue;
          await tx.$executeRawUnsafe(
            `INSERT INTO demo_id_map SELECT ${quote("id")}, ${quote("id")} || ${sfx} FROM ${quote(plan.table)} WHERE ${plan.ownedBy}`,
            templateId,
          );
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO demo_id_map SELECT ${quote("userId")}, $2 FROM ${quote("company_memberships")} WHERE ${quote("companyId")} = $1 ON CONFLICT DO NOTHING`,
          templateId,
          ownerUserId,
        );

        const mapped = (expr: string) => `COALESCE((SELECT new_id FROM demo_id_map WHERE old_id = ${expr}), ${expr})`;
        for (const plan of copy) {
          const columns = await this.columnsOf(tx, plan.table);
          const exprs = columns.map((c) => {
            const col = quote(c.name);
            if (c.name === "id") return `${col} || ${sfx}`;
            if (c.name === "companyId") return newCompany;
            if (plan.idColumns.includes(c.name)) {
              return c.type === "ARRAY" ? `ARRAY(SELECT ${mapped("x")} FROM unnest(${col}) AS x)` : mapped(col);
            }
            if (plan.uniqueTokens.includes(c.name)) return `${col} || ${sfx}`;
            if (c.type.startsWith("timestamp")) return `${col} + ${shift}`;
            if (c.type === "date") return `(${col} + ${shift})::date`;
            return col;
          });
          await tx.$executeRawUnsafe(
            `INSERT INTO ${quote(plan.table)} (${columns.map((c) => quote(c.name)).join(", ")})
             SELECT ${exprs.join(", ")} FROM ${quote(plan.table)} WHERE ${plan.ownedBy}`,
            templateId,
          );
        }
        return companyId;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  /**
   * Deletes a company and everything it owns, children first. Returns the users whose only
   * membership it was, so the caller can remove their sign-in accounts too.
   */
  async deleteCompany(companyId: string): Promise<{ id: string; authProviderId: string }[]> {
    const { purge } = companyGraph();
    return this.prisma.$transaction(
      async (tx) => {
        const members = await tx.companyMembership.findMany({
          where: { companyId },
          select: { user: { select: { id: true, authProviderId: true, memberships: { select: { companyId: true } } } } },
        });
        const soleMembers = members
          .map((m) => m.user)
          .filter((u) => u.memberships.every((other) => other.companyId === companyId));

        for (const plan of purge) {
          await tx.$executeRawUnsafe(`DELETE FROM ${quote(plan.table)} WHERE ${plan.ownedBy}`, companyId);
        }
        await tx.company.delete({ where: { id: companyId } });
        await tx.user.deleteMany({ where: { id: { in: soleMembers.map((u) => u.id) } } });
        return soleMembers.map((u) => ({ id: u.id, authProviderId: u.authProviderId }));
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
