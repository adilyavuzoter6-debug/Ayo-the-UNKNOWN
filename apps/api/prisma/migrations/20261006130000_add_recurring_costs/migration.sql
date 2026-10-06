-- CreateTable
CREATE TABLE "recurring_costs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "dayOfMonth" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "generatedThrough" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recurring_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_costs_companyId_farmId_idx" ON "recurring_costs"("companyId", "farmId");

-- CreateIndex: a source occurrence is booked at most once (NULLs are distinct, so manual entries
-- with no source are unaffected).
CREATE UNIQUE INDEX "cost_entries_companyId_sourceType_sourceId_key" ON "cost_entries"("companyId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
