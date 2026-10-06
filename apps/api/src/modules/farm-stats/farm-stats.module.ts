import { Module } from "@nestjs/common";
import { BatchPerformanceModule } from "../batch-performance/batch-performance.module";
import { FarmStatsService } from "./farm-stats.service";
import {
  FarmStatsController,
  FarmDashboardKpisController,
  FarmOverviewController,
} from "./farm-stats.controller";

@Module({
  imports: [BatchPerformanceModule],
  providers: [FarmStatsService],
  controllers: [FarmStatsController, FarmDashboardKpisController, FarmOverviewController],
})
export class FarmStatsModule {}
