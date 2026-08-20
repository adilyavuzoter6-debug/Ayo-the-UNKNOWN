import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { TanksService } from "./tanks.service";
import { TanksController, FarmSectionTanksController, FarmTanksController } from "./tanks.controller";

@Module({
  imports: [AuditModule],
  providers: [TanksService],
  controllers: [TanksController, FarmSectionTanksController, FarmTanksController],
  exports: [TanksService],
})
export class TanksModule {}
