/*
  Warnings:

  - You are about to drop the `stock_entries` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'PARTIALLY_HARVESTED', 'HARVESTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('STOCKING', 'TRANSFER', 'SPLIT', 'MERGE', 'HARVEST_REMOVAL', 'ADJUSTMENT');

-- DropForeignKey
ALTER TABLE "stock_entries" DROP CONSTRAINT "stock_entries_tankId_fkey";

-- DropTable
DROP TABLE "stock_entries";

-- CreateTable
CREATE TABLE "fish_species" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "strain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fish_species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fish_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "hatcherySupplier" TEXT,
    "eggSource" TEXT,
    "hatchDate" TIMESTAMP(3),
    "farmEntryDate" TIMESTAMP(3) NOT NULL,
    "initialCount" INTEGER NOT NULL,
    "initialAvgWeightG" DECIMAL(10,3) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentBatchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fish_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "batchId" TEXT NOT NULL,
    "fromTankId" TEXT,
    "toTankId" TEXT,
    "fromBatchId" TEXT,
    "toBatchId" TEXT,
    "fishCount" INTEGER NOT NULL,
    "estimatedAvgWeightG" DECIMAL(10,3),
    "estimatedBiomassKg" DECIMAL(12,3),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "reversalOfId" TEXT,

    CONSTRAINT "batch_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_current_states" (
    "batchId" TEXT NOT NULL,
    "currentTankId" TEXT,
    "estimatedCount" INTEGER NOT NULL,
    "estimatedAvgWeightG" DECIMAL(10,3) NOT NULL,
    "estimatedBiomassKg" DECIMAL(12,3) NOT NULL,
    "lastRecalculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_current_states_pkey" PRIMARY KEY ("batchId")
);

-- CreateTable
CREATE TABLE "batch_tank_states" (
    "batchId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "estimatedCount" INTEGER NOT NULL,
    "lastRecalculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_tank_states_pkey" PRIMARY KEY ("batchId","tankId")
);

-- CreateIndex
CREATE INDEX "fish_batches_companyId_status_idx" ON "fish_batches"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fish_batches_companyId_lotCode_key" ON "fish_batches"("companyId", "lotCode");

-- CreateIndex
CREATE INDEX "batch_movements_companyId_batchId_idx" ON "batch_movements"("companyId", "batchId");

-- CreateIndex
CREATE INDEX "batch_movements_companyId_toTankId_idx" ON "batch_movements"("companyId", "toTankId");

-- CreateIndex
CREATE INDEX "batch_movements_companyId_fromTankId_idx" ON "batch_movements"("companyId", "fromTankId");

-- AddForeignKey
ALTER TABLE "fish_batches" ADD CONSTRAINT "fish_batches_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "fish_species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_movements" ADD CONSTRAINT "batch_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_current_states" ADD CONSTRAINT "batch_current_states_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_tank_states" ADD CONSTRAINT "batch_tank_states_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_tank_states" ADD CONSTRAINT "batch_tank_states_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
