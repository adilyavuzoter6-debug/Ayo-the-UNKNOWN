import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AlertsModule } from "../alerts/alerts.module";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { MortalityService } from "./mortality.service";
import { MortalityEventsController, FarmMortalityEventsController } from "./mortality.controller";

@Module({
  imports: [AuditModule, AlertsModule, FishBatchesModule],
  providers: [MortalityService],
  controllers: [MortalityEventsController, FarmMortalityEventsController],
  exports: [MortalityService],
})
export class MortalityModule {}
