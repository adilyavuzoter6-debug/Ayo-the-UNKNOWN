import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ExchangeRatesService, ForeignCurrency } from "./exchange-rates.service";

const FOREIGN: ForeignCurrency[] = ["USD", "EUR"];

function parseDate(date: string | undefined): Date {
  const day = date ? new Date(date) : new Date();
  if (Number.isNaN(day.getTime())) {
    throw new BadRequestException("date must be an ISO date (yyyy-mm-dd).");
  }
  return day;
}

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
  @Get()
  get(@Query("currency") currency?: string, @Query("date") date?: string) {
    const code = (currency ?? "USD").toUpperCase() as ForeignCurrency;
    if (!FOREIGN.includes(code)) {
      throw new BadRequestException("currency must be USD or EUR.");
    }
    return this.exchangeRates.getRate(code, parseDate(date));
  }

  /** Kept for the existing dollar-only callers. */
  @Get("usd-try")
  getUsdTry(@Query("date") date?: string) {
    return this.exchangeRates.getUsdTryRate(parseDate(date));
  }
}
