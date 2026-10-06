import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ExchangeRatesService } from "./exchange-rates.service";

@ApiTags("exchange-rates")
@ApiBearerAuth()
@Controller({ path: "exchange-rates", version: "1" })
export class ExchangeRatesController {
  constructor(private readonly exchangeRates: ExchangeRatesService) {}

  /**
   * Public market data (the Central Bank's published rate), not tenant data, so no
   * @RequirePermission — any signed-in member who can enter a cost or a stock purchase needs it,
   * and those roles don't all hold COST_ENTRY_READ.
   */
  @Get("usd-try")
  getUsdTry(@Query("date") date?: string) {
    const day = date ? new Date(date) : new Date();
    if (Number.isNaN(day.getTime())) {
      throw new BadRequestException("date must be an ISO date (yyyy-mm-dd).");
    }
    return this.exchangeRates.getUsdTryRate(day);
  }
}
