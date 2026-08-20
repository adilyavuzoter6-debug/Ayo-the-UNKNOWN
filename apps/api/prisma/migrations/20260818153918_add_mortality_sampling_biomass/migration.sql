-- CreateEnum
CREATE TYPE "MortalityReason" AS ENUM ('UNKNOWN', 'DISEASE', 'OXYGEN', 'TEMPERATURE', 'TRANSFER_STRESS', 'PHYSICAL_DAMAGE', 'PREDATOR', 'FEED_RELATED', 'OTHER');

-- CreateEnum
CREATE TYPE "SampleMethod" AS ENUM ('INDIVIDUAL', 'AGGREGATE');

-- CreateTable
CREATE TABLE "mortality_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fishCount" INTEGER NOT NULL,
    "estimatedAvgWeightG" DECIMAL(10,3),
    "estimatedBiomassKg" DECIMAL(12,3),
    "reason" "MortalityReason" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mortality_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_samples" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sampleMethod" "SampleMethod" NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "individualWeightsG" DECIMAL(10,3)[] DEFAULT ARRAY[]::DECIMAL(10,3)[],
    "totalWeightG" DECIMAL(12,3) NOT NULL,
    "avgWeightG" DECIMAL(10,3) NOT NULL,
    "minWeightG" DECIMAL(10,3),
    "maxWeightG" DECIMAL(10,3),
    "stdDevG" DECIMAL(10,3),
    "cv" DECIMAL(6,3),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomass_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "tankId" TEXT,
    "snapshotDate" DATE NOT NULL,
    "estimatedCount" INTEGER NOT NULL,
    "avgWeightG" DECIMAL(10,3) NOT NULL,
    "biomassKg" DECIMAL(12,3) NOT NULL,
    "methodology" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biomass_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mortality_events_companyId_tankId_occurredAt_idx" ON "mortality_events"("companyId", "tankId", "occurredAt");

-- CreateIndex
CREATE INDEX "mortality_events_companyId_batchId_occurredAt_idx" ON "mortality_events"("companyId", "batchId", "occurredAt");

-- CreateIndex
CREATE INDEX "weight_samples_companyId_batchId_occurredAt_idx" ON "weight_samples"("companyId", "batchId", "occurredAt");

-- CreateIndex
CREATE INDEX "biomass_snapshots_companyId_snapshotDate_idx" ON "biomass_snapshots"("companyId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "biomass_snapshots_batchId_tankId_snapshotDate_key" ON "biomass_snapshots"("batchId", "tankId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "mortality_events" ADD CONSTRAINT "mortality_events_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortality_events" ADD CONSTRAINT "mortality_events_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_samples" ADD CONSTRAINT "weight_samples_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_samples" ADD CONSTRAINT "weight_samples_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biomass_snapshots" ADD CONSTRAINT "biomass_snapshots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
