-- CreateEnum
CREATE TYPE "ReadingSource" AS ENUM ('MANUAL', 'SENSOR');

-- AlterTable
ALTER TABLE "weight_samples" ALTER COLUMN "individualWeightsG" SET DEFAULT ARRAY[]::DECIMAL(10,3)[];

-- CreateTable
CREATE TABLE "water_quality_readings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "source" "ReadingSource" NOT NULL DEFAULT 'MANUAL',
    "sensorId" TEXT,
    "temperatureC" DECIMAL(5,2),
    "dissolvedOxygenMgL" DECIMAL(5,2),
    "ph" DECIMAL(4,2),
    "salinityPpt" DECIMAL(5,2),
    "ammoniaMgL" DECIMAL(6,3),
    "nitriteMgL" DECIMAL(6,3),
    "nitrateMgL" DECIMAL(6,3),
    "flowRateM3H" DECIMAL(8,2),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_quality_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "water_quality_readings_companyId_tankId_occurredAt_idx" ON "water_quality_readings"("companyId", "tankId", "occurredAt");

-- AddForeignKey
ALTER TABLE "water_quality_readings" ADD CONSTRAINT "water_quality_readings_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
