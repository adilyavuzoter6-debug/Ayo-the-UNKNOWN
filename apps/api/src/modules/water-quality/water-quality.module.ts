import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AlertsModule } from "../alerts/alerts.module";
import { WaterQualityService } from "./water-quality.service";
import { WaterQualityController } from "./water-quality.controller";

@Module({
  imports: [AuditModule, AlertsModule],
  providers: [WaterQualityService],
  controllers: [WaterQualityController],
  exports: [WaterQualityService],
})
export class WaterQualityModule {}
