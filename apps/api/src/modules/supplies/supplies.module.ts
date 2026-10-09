import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { SuppliesController } from "./supplies.controller";
import { SuppliesService } from "./supplies.service";

@Module({
  imports: [AuditModule, ExchangeRatesModule],
  providers: [SuppliesService],
  controllers: [SuppliesController],
  exports: [SuppliesService],
})
export class SuppliesModule {}
