-- CreateEnum
CREATE TYPE "HarvestType" AS ENUM ('PLANNED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "HarvestFullness" AS ENUM ('PARTIAL', 'FULL');

-- AlterTable
ALTER TABLE "weight_samples" ALTER COLUMN "individualWeightsG" SET DEFAULT ARRAY[]::DECIMAL(10,3)[];

-- CreateTable
CREATE TABLE "harvest_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "type" "HarvestType" NOT NULL,
    "fullness" "HarvestFullness" NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "harvestedAt" TIMESTAMP(3),
    "fishCount" INTEGER,
    "biomassKg" DECIMAL(12,3),
    "avgWeightG" DECIMAL(10,3),
    "sizeGrade" TEXT,
    "destination" TEXT,
    "customer" TEXT,
    "processingPlant" TEXT,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "harvest_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "harvest_records_companyId_batchId_idx" ON "harvest_records"("companyId", "batchId");

-- CreateIndex
CREATE INDEX "harvest_records_companyId_tankId_idx" ON "harvest_records"("companyId", "tankId");

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
