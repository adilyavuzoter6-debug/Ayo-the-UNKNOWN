import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";

@Module({
  imports: [AuditModule],
  providers: [PlatformAdminService, PlatformAdminGuard],
  controllers: [PlatformAdminController],
})
export class PlatformAdminModule {}
