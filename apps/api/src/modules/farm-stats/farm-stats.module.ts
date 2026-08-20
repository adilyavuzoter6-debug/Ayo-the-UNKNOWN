import { Module } from "@nestjs/common";
import { FarmStatsService } from "./farm-stats.service";
import { FarmStatsController } from "./farm-stats.controller";

@Module({
  providers: [FarmStatsService],
  controllers: [FarmStatsController],
})
export class FarmStatsModule {}
