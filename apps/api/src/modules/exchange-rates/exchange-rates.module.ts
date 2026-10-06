import { Module } from "@nestjs/common";
import { ExchangeRatesController } from "./exchange-rates.controller";
import { ExchangeRatesService } from "./exchange-rates.service";

@Module({
  providers: [ExchangeRatesService],
  controllers: [ExchangeRatesController],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
