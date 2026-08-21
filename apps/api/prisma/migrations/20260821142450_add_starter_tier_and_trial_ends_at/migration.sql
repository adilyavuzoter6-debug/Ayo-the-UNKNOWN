-- AlterEnum
ALTER TYPE "PlanTier" ADD VALUE 'STARTER';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "weight_samples" ALTER COLUMN "individualWeightsG" SET DEFAULT ARRAY[]::DECIMAL(10,3)[];
