import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { WeightSamplingService } from "./weight-sampling.service";
import { WeightSamplesController } from "./weight-sampling.controller";

@Module({
  imports: [AuditModule, FishBatchesModule],
  providers: [WeightSamplingService],
  controllers: [WeightSamplesController],
  exports: [WeightSamplingService],
})
export class WeightSamplingModule {}
