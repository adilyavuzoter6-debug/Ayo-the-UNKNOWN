-- AlterTable: cost_entries get the TRY-converted amount and the rate it was converted at.
ALTER TABLE "cost_entries" ADD COLUMN "exchangeRate" DECIMAL(12,4),
ADD COLUMN "amountTry" DECIMAL(14,2);

-- Backfill. Every existing row was written in TRY (the web app only ever sent TRY and the API
-- defaulted to it), so TRY rows get rate 1; any non-TRY legacy row keeps a NULL rate and is
-- converted 1:1 so the column is never left empty.
UPDATE "cost_entries" SET "exchangeRate" = 1 WHERE "currency" = 'TRY';
UPDATE "cost_entries" SET "amountTry" = "amount";

ALTER TABLE "cost_entries" ALTER COLUMN "amountTry" SET NOT NULL;

-- AlterTable: ACTUAL harvests can carry a sale price.
ALTER TABLE "harvest_records" ADD COLUMN "salePricePerKg" DECIMAL(12,4),
ADD COLUMN "saleCurrency" TEXT,
ADD COLUMN "saleExchangeRate" DECIMAL(12,4),
ADD COLUMN "saleRevenueTry" DECIMAL(14,2);
