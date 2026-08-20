import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { HarvestService } from "./harvest.service";
import { HarvestController } from "./harvest.controller";

@Module({
  imports: [AuditModule, FishBatchesModule],
  providers: [HarvestService],
  controllers: [HarvestController],
  exports: [HarvestService],
})
export class HarvestModule {}
