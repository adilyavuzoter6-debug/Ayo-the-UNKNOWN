-- CreateEnum
CREATE TYPE "StockingSource" AS ENUM ('FINGERLINGS_PURCHASED', 'EGGS_PURCHASED', 'EGGS_IN_HOUSE');

-- AlterTable: how a batch was stocked and what it cost. All nullable — existing batches keep
-- no stocking cost until someone records one.
ALTER TABLE "fish_batches" ADD COLUMN "stockingSource" "StockingSource",
ADD COLUMN "eggCount" INTEGER,
ADD COLUMN "stockingUnitPrice" DECIMAL(12,4),
ADD COLUMN "stockingCurrency" TEXT,
ADD COLUMN "stockingExchangeRate" DECIMAL(12,4);
