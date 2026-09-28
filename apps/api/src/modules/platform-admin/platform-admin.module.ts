import { Module } from "@nestjs/common";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminGuard } from "./platform-admin.guard";

@Module({
  providers: [PlatformAdminService, PlatformAdminGuard],
  controllers: [PlatformAdminController],
})
export class PlatformAdminModule {}
