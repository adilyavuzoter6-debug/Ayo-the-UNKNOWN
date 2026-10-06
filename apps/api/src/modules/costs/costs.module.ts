import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ExchangeRatesModule } from "../exchange-rates/exchange-rates.module";
import { CostAttributionService } from "./cost-attribution.service";
import { CostForecastService } from "./cost-forecast.service";
import { CostsService } from "./costs.service";
import { CostsController, CostSummaryController } from "./costs.controller";
import { CostForecastController } from "./cost-forecast.controller";
import { RecurringCostsService } from "./recurring-costs.service";
import { RecurringCostsController } from "./recurring-costs.controller";

@Module({
  imports: [AuditModule, ExchangeRatesModule],
  providers: [CostsService, CostAttributionService, CostForecastService, RecurringCostsService],
  controllers: [
    CostsController,
    CostSummaryController,
    RecurringCostsController,
    CostForecastController,
  ],
  exports: [CostsService, CostAttributionService],
})
export class CostsModule {}
