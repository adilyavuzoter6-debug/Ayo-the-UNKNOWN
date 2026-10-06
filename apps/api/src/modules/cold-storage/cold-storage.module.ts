import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ColdStorageController } from "./cold-storage.controller";
import { ColdStorageService } from "./cold-storage.service";

@Module({
  imports: [AuditModule],
  providers: [ColdStorageService],
  controllers: [ColdStorageController],
})
export class ColdStorageModule {}
