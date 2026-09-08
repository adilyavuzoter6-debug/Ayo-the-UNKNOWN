-- AlterTable
ALTER TABLE "fish_species" ADD COLUMN     "criticalDoMgL" DECIMAL(5,2),
ADD COLUMN     "criticalPhHigh" DECIMAL(4,2),
ADD COLUMN     "criticalPhLow" DECIMAL(4,2),
ADD COLUMN     "criticalTempHighC" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "weight_samples" ALTER COLUMN "individualWeightsG" SET DEFAULT ARRAY[]::DECIMAL(10,3)[];
