-- CreateTable
CREATE TABLE "cost_scenarios" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "batchId" TEXT,
    "tankId" TEXT,
    "name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "cost_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_scenarios_companyId_farmId_idx" ON "cost_scenarios"("companyId", "farmId");

-- AddForeignKey
ALTER TABLE "cost_scenarios" ADD CONSTRAINT "cost_scenarios_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
