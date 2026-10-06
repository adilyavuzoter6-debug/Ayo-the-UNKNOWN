-- CreateEnum
CREATE TYPE "SupplyMovementKind" AS ENUM ('RECEIVED', 'TRANSFER');

-- CreateEnum
CREATE TYPE "ColdStorageKind" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "supply_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "SupplyMovementKind" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "fromFarmId" TEXT,
    "toFarmId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cold_storage_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "kind" "ColdStorageKind" NOT NULL,
    "weightKg" DECIMAL(12,3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destination" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cold_storage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supply_items_companyId_idx" ON "supply_items"("companyId");

-- CreateIndex
CREATE INDEX "supply_movements_companyId_itemId_idx" ON "supply_movements"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "cold_storage_entries_companyId_farmId_idx" ON "cold_storage_entries"("companyId", "farmId");

-- AddForeignKey
ALTER TABLE "supply_movements" ADD CONSTRAINT "supply_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "supply_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_movements" ADD CONSTRAINT "supply_movements_fromFarmId_fkey" FOREIGN KEY ("fromFarmId") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_movements" ADD CONSTRAINT "supply_movements_toFarmId_fkey" FOREIGN KEY ("toFarmId") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cold_storage_entries" ADD CONSTRAINT "cold_storage_entries_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
