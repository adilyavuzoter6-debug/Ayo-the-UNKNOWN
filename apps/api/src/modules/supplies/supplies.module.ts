import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SuppliesController } from "./supplies.controller";
import { SuppliesService } from "./supplies.service";

@Module({
  imports: [AuditModule],
  providers: [SuppliesService],
  controllers: [SuppliesController],
})
export class SuppliesModule {}
