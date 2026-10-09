-- AlterEnum
ALTER TYPE "SupplyMovementKind" ADD VALUE 'CONSUMED';

-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "doseLiters" DECIMAL(10,3),
ADD COLUMN     "medicineItemId" TEXT,
ADD COLUMN     "stockMovementId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "treatments_stockMovementId_key" ON "treatments"("stockMovementId");

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_medicineItemId_fkey" FOREIGN KEY ("medicineItemId") REFERENCES "supply_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "supply_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
