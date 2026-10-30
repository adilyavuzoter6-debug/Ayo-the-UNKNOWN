import { Prisma } from "@prisma/client";

/**
 * How a company's rows hang together, read from the Prisma schema so a new model is covered
 * without touching the demo code: which tables a company owns, how to find a table's rows for a
 * company, which columns hold ids of other rows, and an order that respects foreign keys.
 */

/** Not copied into a visitor's demo: people, access and history belong to the visitor, not the template. */
const NOT_COPIED = new Set([
  "Company",
  "User",
  "CompanyMembership",
  "MembershipFarmScope",
  "Invitation",
  "AuditLog",
  "IdempotencyRecord",
  "AssistantFeedback",
  "DataImport",
]);

export interface ModelPlan {
  name: string;
  table: string;
  /** SQL condition selecting this table's rows for the company given as $1. */
  ownedBy: string;
  /** The same as a Prisma filter. */
  ownedWhere: (companyId: string) => Record<string, unknown>;
  /** Prisma client property for the model, e.g. "fishBatch". */
  delegate: string;
  /** String columns holding another row's id (FKs and plain references such as sourceId). */
  idColumns: string[];
  /** Unique string columns that aren't ids (e.g. a tank's QR token), so a copy needs its own value. */
  uniqueTokens: string[];
  /** Models this one references, for ordering. */
  dependsOn: string[];
}

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

function buildPlans(): Map<string, ModelPlan> {
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((m) => [m.name, m]));
  const tableOf = (name: string) => byName.get(name)!.dbName ?? name;
  const hasCompanyId = (name: string) => byName.get(name)!.fields.some((f) => f.name === "companyId");

  const plans = new Map<string, ModelPlan>();
  for (const model of models) {
    if (model.name === "Company") continue;
    const relations = model.fields.filter((f) => f.kind === "object" && f.relationFromFields?.length);
    const fkColumns = new Set(relations.flatMap((f) => f.relationFromFields ?? []));

    let ownedBy: string;
    let ownedWhere: ModelPlan["ownedWhere"];
    if (hasCompanyId(model.name)) {
      ownedBy = `${quote("companyId")} = $1`;
      ownedWhere = (companyId) => ({ companyId });
    } else {
      // Owned through a required parent that carries the company, e.g. a batch's current state.
      const parent = relations.find((f) => f.isRequired && f.type !== "Company" && hasCompanyId(f.type));
      if (!parent) continue; // global tables such as User
      const column = parent.relationFromFields![0]!;
      ownedBy = `${quote(column)} IN (SELECT ${quote("id")} FROM ${quote(tableOf(parent.type))} WHERE ${quote("companyId")} = $1)`;
      ownedWhere = (companyId) => ({ [parent.name]: { companyId } });
    }

    const idColumns = model.fields
      .filter(
        (f) =>
          f.kind === "scalar" &&
          f.type === "String" &&
          f.name !== "id" &&
          f.name !== "companyId" &&
          (fkColumns.has(f.name) || /Ids?$/.test(f.name)),
      )
      .map((f) => f.name);
    const uniqueTokens = model.fields
      .filter((f) => f.kind === "scalar" && f.type === "String" && f.isUnique && f.name !== "id" && !idColumns.includes(f.name))
      .map((f) => f.name);

    plans.set(model.name, {
      name: model.name,
      table: tableOf(model.name),
      ownedBy,
      ownedWhere,
      delegate: model.name.charAt(0).toLowerCase() + model.name.slice(1),
      idColumns,
      uniqueTokens,
      dependsOn: [...new Set(relations.map((f) => f.type).filter((t) => t !== model.name && t !== "Company"))],
    });
  }
  return plans;
}

/** Parents before children. */
function topological(plans: ModelPlan[]): ModelPlan[] {
  const names = new Set(plans.map((p) => p.name));
  const done = new Set<string>();
  const ordered: ModelPlan[] = [];
  const visit = (plan: ModelPlan, path: Set<string>) => {
    if (done.has(plan.name)) return;
    if (path.has(plan.name)) throw new Error(`Cycle in company graph at ${plan.name}`);
    path.add(plan.name);
    for (const dep of plan.dependsOn) {
      const depPlan = plans.find((p) => p.name === dep);
      if (depPlan && names.has(dep)) visit(depPlan, path);
    }
    path.delete(plan.name);
    done.add(plan.name);
    ordered.push(plan);
  };
  for (const plan of plans) visit(plan, new Set());
  return ordered;
}

let cached: { copy: ModelPlan[]; purge: ModelPlan[] } | undefined;

export function companyGraph() {
  if (!cached) {
    const plans = [...buildPlans().values()];
    cached = {
      /** What a demo copies, parents first. */
      copy: topological(plans.filter((p) => !NOT_COPIED.has(p.name))),
      /** Everything a company owns, children first, for deleting it. */
      purge: topological(plans).reverse(),
    };
  }
  return cached;
}

export { quote };
