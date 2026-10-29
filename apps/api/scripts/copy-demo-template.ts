/**
 * Copies the demo template company (scripts/seed-demo.ts) from one database to another, ids and
 * all: seed the template quickly on a local database, then copy it to production in one go
 * instead of making thousands of API calls across the network.
 *
 *   npx ts-node --transpile-only scripts/copy-demo-template.ts \
 *     --from postgresql://…localhost…/aquai_demo_template --to <target url> [--allow-remote]
 *
 * The source's TEMPLATE company, its owner and everything it owns are written with createMany in
 * foreign-key order. The target must already have the schema (prisma migrate deploy) and no copy
 * of this template yet. Visitors' demos in the target then copy from it.
 */
import { PrismaClient } from "@prisma/client";
import { companyGraph } from "../src/modules/demo/company-graph";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const from = arg("from");
const to = arg("to");
if (!from || !to) {
  console.error("Usage: --from <source url> --to <target url> [--allow-remote]");
  process.exit(1);
}
const targetHost = new URL(to).hostname;
if (!["localhost", "127.0.0.1"].includes(targetHost) && !args.includes("--allow-remote")) {
  console.error(`Target is ${targetHost}. Pass --allow-remote to write to a non-local database.`);
  process.exit(1);
}

type Delegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  createMany: (args: unknown) => Promise<{ count: number }>;
};
const delegate = (client: PrismaClient, name: string) => (client as unknown as Record<string, Delegate>)[name]!;

async function main() {
  const source = new PrismaClient({ datasourceUrl: from });
  const target = new PrismaClient({ datasourceUrl: to });
  try {
    const template = await source.company.findFirst({ where: { demoKind: "TEMPLATE" }, orderBy: { createdAt: "desc" } });
    if (!template) throw new Error("The source has no TEMPLATE company. Run scripts/seed-demo.ts and mark it first.");
    if (await target.company.findUnique({ where: { id: template.id } })) {
      throw new Error(`The target already has template ${template.id}.`);
    }
    const memberships = await source.companyMembership.findMany({ where: { companyId: template.id } });
    const users = await source.user.findMany({ where: { id: { in: memberships.map((m) => m.userId) } } });
    for (const user of users) {
      if (await target.user.findUnique({ where: { authProviderId: user.authProviderId } })) {
        throw new Error(`The target already has a user signing in as ${user.authProviderId}; seed the template with a dedicated owner id.`);
      }
    }

    const started = Date.now();
    await target.company.create({ data: template });
    await target.user.createMany({ data: users });
    await target.companyMembership.createMany({ data: memberships });
    for (const plan of companyGraph().copy) {
      const rows = await delegate(source, plan.delegate).findMany({ where: plan.ownedWhere(template.id) });
      for (let i = 0; i < rows.length; i += 1000) {
        await delegate(target, plan.delegate).createMany({ data: rows.slice(i, i + 1000) });
      }
      if (rows.length > 0) console.log(`${plan.name}: ${rows.length}`);
    }
    console.log(`Template ${template.id} copied in ${Math.round((Date.now() - started) / 1000)} s.`);
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
