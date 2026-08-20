import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { TreatmentsService } from "./treatments.service";
import { TreatmentsController } from "./treatments.controller";

@Module({
  imports: [AuditModule],
  providers: [TreatmentsService],
  controllers: [TreatmentsController],
  exports: [TreatmentsService],
})
export class TreatmentsModule {}
