import { Module } from "@nestjs/common";
import { FarmStatsModule } from "../farm-stats/farm-stats.module";
import { ReportsModule } from "../reports/reports.module";
import { ASSISTANT_MODEL, assistantModelFromEnv } from "./assistant-model";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";
import { AssistantTools } from "./assistant-tools";

@Module({
  imports: [FarmStatsModule, ReportsModule],
  providers: [AssistantService, AssistantTools, { provide: ASSISTANT_MODEL, useFactory: assistantModelFromEnv }],
  controllers: [AssistantController],
})
export class AssistantModule {}
