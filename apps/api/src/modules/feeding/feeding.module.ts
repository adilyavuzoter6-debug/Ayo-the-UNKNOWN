import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AlertsModule } from "../alerts/alerts.module";
import { FeedInventoryModule } from "../feed-inventory/feed-inventory.module";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { FeedingService } from "./feeding.service";
import { FeedingEventsController } from "./feeding.controller";

@Module({
  imports: [AuditModule, AlertsModule, FeedInventoryModule, FishBatchesModule],
  providers: [FeedingService],
  controllers: [FeedingEventsController],
  exports: [FeedingService],
})
export class FeedingModule {}
