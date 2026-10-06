-- AlterTable
ALTER TABLE "cold_storage_entries" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "supply_movements" ADD COLUMN     "deletedAt" TIMESTAMP(3);

