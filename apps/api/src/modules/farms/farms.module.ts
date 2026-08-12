import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FarmsService } from "./farms.service";
import { FarmsController } from "./farms.controller";

@Module({
  imports: [AuditModule],
  providers: [FarmsService],
  controllers: [FarmsController],
  exports: [FarmsService],
})
export class FarmsModule {}
