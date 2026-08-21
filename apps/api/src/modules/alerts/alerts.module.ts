import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AlertsService } from "./alerts.service";
import { FarmAlertsController, AlertsController } from "./alerts.controller";

@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [AlertsService],
  controllers: [FarmAlertsController, AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
