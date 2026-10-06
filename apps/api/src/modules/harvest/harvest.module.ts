import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { TreatmentsModule } from "../treatments/treatments.module";
import { HarvestService } from "./harvest.service";
import { HarvestController } from "./harvest.controller";

@Module({
  imports: [AuditModule, ExchangeRatesModule, FishBatchesModule, TreatmentsModule],
  providers: [HarvestService],
  controllers: [HarvestController],
  exports: [HarvestService],
})
export class HarvestModule {}
