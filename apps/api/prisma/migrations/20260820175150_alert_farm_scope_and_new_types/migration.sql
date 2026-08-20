-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'LOW_FEED_STOCK';
ALTER TYPE "AlertType" ADD VALUE 'MORTALITY_SPIKE';
ALTER TYPE "AlertType" ADD VALUE 'MISSING_DAILY_RECORDS';

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_tankId_fkey";

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "farmId" TEXT,
ALTER COLUMN "tankId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "weight_samples" ALTER COLUMN "individualWeightsG" SET DEFAULT ARRAY[]::DECIMAL(10,3)[];

-- CreateIndex
CREATE INDEX "alerts_companyId_farmId_idx" ON "alerts"("companyId", "farmId");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
