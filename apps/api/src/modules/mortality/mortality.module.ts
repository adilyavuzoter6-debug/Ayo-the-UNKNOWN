import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { MortalityService } from "./mortality.service";
import { MortalityEventsController } from "./mortality.controller";

@Module({
  imports: [AuditModule, FishBatchesModule],
  providers: [MortalityService],
  controllers: [MortalityEventsController],
  exports: [MortalityService],
})
export class MortalityModule {}
