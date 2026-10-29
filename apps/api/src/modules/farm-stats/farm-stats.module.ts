import { Module } from "@nestjs/common";
import { BatchPerformanceModule } from "../batch-performance/batch-performance.module";
import { FarmStatsService } from "./farm-stats.service";
import {
  FarmStatsController,
  FarmDashboardKpisController,
  FarmOverviewController,
  FarmWeightForecastController,
  FarmDailyTrendController,
} from "./farm-stats.controller";

@Module({
  imports: [BatchPerformanceModule],
  providers: [FarmStatsService],
  exports: [FarmStatsService],
  controllers: [
    FarmStatsController,
    FarmDashboardKpisController,
    FarmOverviewController,
    FarmWeightForecastController,
    FarmDailyTrendController,
  ],
})
export class FarmStatsModule {}
