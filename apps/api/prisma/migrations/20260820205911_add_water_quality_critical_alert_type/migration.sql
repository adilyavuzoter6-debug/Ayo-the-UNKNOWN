-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'WATER_QUALITY_CRITICAL';

-- AlterTable
ALTER TABLE "weight_samples" ALTER COLUMN "individualWeightsG" SET DEFAULT ARRAY[]::DECIMAL(10,3)[];
