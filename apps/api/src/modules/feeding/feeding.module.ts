import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AlertsModule } from "../alerts/alerts.module";
import { FeedInventoryModule } from "../feed-inventory/feed-inventory.module";
import { FeedingService } from "./feeding.service";
import { FeedingEventsController } from "./feeding.controller";

@Module({
  imports: [AuditModule, AlertsModule, FeedInventoryModule],
  providers: [FeedingService],
  controllers: [FeedingEventsController],
  exports: [FeedingService],
})
export class FeedingModule {}
