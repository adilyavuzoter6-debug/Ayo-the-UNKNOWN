-- CreateEnum
CREATE TYPE "TreatmentType" AS ENUM ('MEDICATION', 'VACCINATION');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('FEED', 'EGGS', 'FINGERLINGS', 'MEDICINE', 'VACCINATION', 'LABOR', 'ELECTRICITY', 'OXYGEN', 'FUEL', 'TRANSPORTATION', 'OVERHEAD', 'DEPRECIATION', 'OTHER');

-- AlterTable
ALTER TABLE "weight_samples" ALTER COLUMN "individualWeightsG" SET DEFAULT ARRAY[]::DECIMAL(10,3)[];

-- CreateTable
CREATE TABLE "treatments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "type" "TreatmentType" NOT NULL,
    "productName" TEXT NOT NULL,
    "dosage" TEXT,
    "withdrawalPeriodDays" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "veterinarianId" TEXT,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "farmId" TEXT,
    "tankId" TEXT,
    "batchId" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatments_companyId_batchId_idx" ON "treatments"("companyId", "batchId");

-- CreateIndex
CREATE INDEX "treatments_companyId_tankId_idx" ON "treatments"("companyId", "tankId");

-- CreateIndex
CREATE INDEX "cost_entries_companyId_batchId_idx" ON "cost_entries"("companyId", "batchId");

-- CreateIndex
CREATE INDEX "cost_entries_companyId_farmId_incurredAt_idx" ON "cost_entries"("companyId", "farmId", "incurredAt");

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
