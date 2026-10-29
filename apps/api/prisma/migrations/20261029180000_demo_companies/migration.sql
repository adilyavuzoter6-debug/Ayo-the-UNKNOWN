-- Demo companies: the template with the sample farm data, and per-visitor copies of it.
CREATE TYPE "DemoKind" AS ENUM ('TEMPLATE', 'VISITOR');

ALTER TABLE "companies" ADD COLUMN "demoKind" "DemoKind";

CREATE INDEX "companies_demoKind_createdAt_idx" ON "companies"("demoKind", "createdAt");
