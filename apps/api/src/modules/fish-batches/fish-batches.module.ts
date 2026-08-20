import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AlertsModule } from "../alerts/alerts.module";
import { BatchProjectionService } from "./batch-projection.service";
import { FishBatchesService } from "./fish-batches.service";
import {
  MergeBatchesController,
  FishBatchesController,
  TankFishBatchesController,
} from "./fish-batches.controller";

@Module({
  imports: [AuditModule, AlertsModule],
  providers: [FishBatchesService, BatchProjectionService],
  controllers: [MergeBatchesController, FishBatchesController, TankFishBatchesController],
  exports: [FishBatchesService, BatchProjectionService],
})
export class FishBatchesModule {}
