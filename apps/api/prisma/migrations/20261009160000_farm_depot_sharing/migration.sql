-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "sharesDepotWithFarmId" TEXT;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_sharesDepotWithFarmId_fkey" FOREIGN KEY ("sharesDepotWithFarmId") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
