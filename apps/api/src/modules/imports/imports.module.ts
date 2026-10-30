import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FeedInventoryModule } from "../feed-inventory/feed-inventory.module";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [AuditModule, FeedInventoryModule, FishBatchesModule],
  providers: [ImportsService],
  controllers: [ImportsController],
})
export class ImportsModule {}
