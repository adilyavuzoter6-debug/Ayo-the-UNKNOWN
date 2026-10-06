import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AlertsModule } from "../alerts/alerts.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { FeedInventoryProjectionService } from "./feed-inventory-projection.service";
import { FeedInventoryService } from "./feed-inventory.service";
import {
  InventoryBatchesController,
  WarehouseInventoryBatchesController,
} from "./feed-inventory.controller";

@Module({
  imports: [AuditModule, AlertsModule, ExchangeRatesModule],
  providers: [FeedInventoryService, FeedInventoryProjectionService],
  controllers: [InventoryBatchesController, WarehouseInventoryBatchesController],
  exports: [FeedInventoryService, FeedInventoryProjectionService],
})
export class FeedInventoryModule {}
