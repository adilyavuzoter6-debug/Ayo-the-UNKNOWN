import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FeedInventoryProjectionService } from "./feed-inventory-projection.service";
import { FeedInventoryService } from "./feed-inventory.service";
import {
  InventoryBatchesController,
  WarehouseInventoryBatchesController,
} from "./feed-inventory.controller";

@Module({
  imports: [AuditModule],
  providers: [FeedInventoryService, FeedInventoryProjectionService],
  controllers: [InventoryBatchesController, WarehouseInventoryBatchesController],
  exports: [FeedInventoryService, FeedInventoryProjectionService],
})
export class FeedInventoryModule {}
