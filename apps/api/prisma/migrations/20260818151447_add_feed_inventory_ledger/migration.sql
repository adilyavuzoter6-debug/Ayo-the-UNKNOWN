/*
  Warnings:

  - You are about to drop the `feed_records` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "InventoryTxType" AS ENUM ('PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEED_CONSUMPTION', 'ADJUSTMENT', 'RETURN', 'WASTE');

-- CreateEnum
CREATE TYPE "FeedingMethod" AS ENUM ('MANUAL', 'AUTOMATIC_FEEDER', 'DEMAND_FEEDER');

-- DropForeignKey
ALTER TABLE "feed_records" DROP CONSTRAINT "feed_records_tankId_fkey";

-- DropTable
DROP TABLE "feed_records";

-- CreateTable
CREATE TABLE "feed_products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "pelletSizeMm" DECIMAL(5,2),
    "proteinPct" DECIMAL(5,2),
    "fatPct" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "feed_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_inventory_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "feedProductId" TEXT NOT NULL,
    "supplierLotCode" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "unitCostPerKg" DECIMAL(12,4),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_inventory_transactions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "feedInventoryBatchId" TEXT NOT NULL,
    "type" "InventoryTxType" NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_inventory_balances" (
    "feedInventoryBatchId" TEXT NOT NULL,
    "quantityOnHandKg" DECIMAL(12,3) NOT NULL,
    "lastRecalculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_inventory_balances_pkey" PRIMARY KEY ("feedInventoryBatchId")
);

-- CreateTable
CREATE TABLE "feeding_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "feedProductId" TEXT NOT NULL,
    "quantityKg" DECIMAL(10,3) NOT NULL,
    "method" "FeedingMethod" NOT NULL DEFAULT 'MANUAL',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inventoryTransactionId" TEXT NOT NULL,

    CONSTRAINT "feeding_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_products_companyId_idx" ON "feed_products"("companyId");

-- CreateIndex
CREATE INDEX "warehouses_companyId_farmId_idx" ON "warehouses"("companyId", "farmId");

-- CreateIndex
CREATE INDEX "feed_inventory_batches_companyId_warehouseId_feedProductId_idx" ON "feed_inventory_batches"("companyId", "warehouseId", "feedProductId");

-- CreateIndex
CREATE INDEX "feed_inventory_transactions_companyId_warehouseId_feedInven_idx" ON "feed_inventory_transactions"("companyId", "warehouseId", "feedInventoryBatchId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "feeding_events_inventoryTransactionId_key" ON "feeding_events"("inventoryTransactionId");

-- CreateIndex
CREATE INDEX "feeding_events_companyId_tankId_occurredAt_idx" ON "feeding_events"("companyId", "tankId", "occurredAt");

-- CreateIndex
CREATE INDEX "feeding_events_companyId_batchId_occurredAt_idx" ON "feeding_events"("companyId", "batchId", "occurredAt");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_inventory_batches" ADD CONSTRAINT "feed_inventory_batches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_inventory_batches" ADD CONSTRAINT "feed_inventory_batches_feedProductId_fkey" FOREIGN KEY ("feedProductId") REFERENCES "feed_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_inventory_transactions" ADD CONSTRAINT "feed_inventory_transactions_feedInventoryBatchId_fkey" FOREIGN KEY ("feedInventoryBatchId") REFERENCES "feed_inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_inventory_balances" ADD CONSTRAINT "feed_inventory_balances_feedInventoryBatchId_fkey" FOREIGN KEY ("feedInventoryBatchId") REFERENCES "feed_inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fish_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_feedProductId_fkey" FOREIGN KEY ("feedProductId") REFERENCES "feed_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
