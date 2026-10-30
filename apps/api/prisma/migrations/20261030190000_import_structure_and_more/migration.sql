-- AlterTable
ALTER TABLE "batch_movements" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "farm_sections" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "fish_batches" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "harvest_records" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "tanks" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "importId" TEXT;

-- CreateIndex
CREATE INDEX "batch_movements_importId_idx" ON "batch_movements"("importId");

-- CreateIndex
CREATE INDEX "farm_sections_importId_idx" ON "farm_sections"("importId");

-- CreateIndex
CREATE INDEX "farms_importId_idx" ON "farms"("importId");

-- CreateIndex
CREATE INDEX "fish_batches_importId_idx" ON "fish_batches"("importId");

-- CreateIndex
CREATE INDEX "harvest_records_importId_idx" ON "harvest_records"("importId");

-- CreateIndex
CREATE INDEX "tanks_importId_idx" ON "tanks"("importId");

-- CreateIndex
CREATE INDEX "treatments_importId_idx" ON "treatments"("importId");
