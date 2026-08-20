import { Module } from "@nestjs/common";
import { BatchPerformanceController } from "./batch-performance.controller";
import { FcrCalculationService } from "./fcr-calculation.service";
import { SgrCalculationService } from "./sgr-calculation.service";

@Module({
  providers: [FcrCalculationService, SgrCalculationService],
  controllers: [BatchPerformanceController],
  exports: [FcrCalculationService, SgrCalculationService],
})
export class BatchPerformanceModule {}
