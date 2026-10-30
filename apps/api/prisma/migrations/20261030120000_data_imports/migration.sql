-- AlterTable
ALTER TABLE "feed_inventory_batches" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "feed_inventory_transactions" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "feeding_events" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "mortality_events" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "water_quality_readings" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "weight_samples" ADD COLUMN     "importId" TEXT;

-- CreateTable
CREATE TABLE "data_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_imports_companyId_createdAt_idx" ON "data_imports"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "feed_inventory_batches_importId_idx" ON "feed_inventory_batches"("importId");

-- CreateIndex
CREATE INDEX "feed_inventory_transactions_importId_idx" ON "feed_inventory_transactions"("importId");

-- CreateIndex
CREATE INDEX "feeding_events_importId_idx" ON "feeding_events"("importId");

-- CreateIndex
CREATE INDEX "mortality_events_importId_idx" ON "mortality_events"("importId");

-- CreateIndex
CREATE INDEX "water_quality_readings_importId_idx" ON "water_quality_readings"("importId");

-- CreateIndex
CREATE INDEX "weight_samples_importId_idx" ON "weight_samples"("importId");

-- AddForeignKey
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

