import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { WarehousesService } from "./warehouses.service";
import { WarehousesController, FarmWarehousesController } from "./warehouses.controller";

@Module({
  imports: [AuditModule],
  providers: [WarehousesService],
  controllers: [WarehousesController, FarmWarehousesController],
  exports: [WarehousesService],
})
export class WarehousesModule {}
