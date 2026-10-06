-- CreateEnum
CREATE TYPE "ColdStorageDisposal" AS ENUM ('PIT', 'RENDERING');

-- AlterTable
ALTER TABLE "cold_storage_entries" ADD COLUMN     "disposal" "ColdStorageDisposal" NOT NULL DEFAULT 'RENDERING';


