import { BadGatewayException, Injectable, Logger } from "@nestjs/common";

export type ExchangeCurrency = "TRY" | "USD" | "EUR";
export type ForeignCurrency = Exclude<ExchangeCurrency, "TRY">;

export interface ForeignRate {
  /** The day the caller asked about (ISO yyyy-mm-dd). */
  date: string;
  /** The currency's price in TRY — the Central Bank's döviz satış (ForexSelling) rate. */
  rate: number;
  /** The day of the bulletin the rate came from; differs from `date` on weekends and holidays. */
  bulletinDate: string;
}

const TCMB_BULLETIN_BASE = "https://www.tcmb.gov.tr/kurlar";
/** Weekends and public holidays have no bulletin — step back to the last published one. */
const MAX_LOOKBACK_DAYS = 10;
const FETCH_TIMEOUT_MS = 5000;
const CACHE_LIMIT = 500;

/**
 * Pulls one currency's ForexSelling rate out of a TCMB daily bulletin (XML). The search stays inside
 * that currency's own element, so a malformed row can't fall through to the next currency's rate.
 */
export function parseForexSelling(xml: string, code: ForeignCurrency): number | null {
  const element = new RegExp(`<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)<\\/Currency>`).exec(xml);
  if (!element) return null;
  const match = /<ForexSelling>\s*([\d.]+)\s*<\/ForexSelling>/.exec(element[1] ?? "");
  if (!match) return null;
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** USD's selling rate from a bulletin. Kept as a named export because the USD path is the one tests pin. */
export function parseUsdForexSelling(xml: string): number | null {
  return parseForexSelling(xml, "USD");
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bulletinUrl(day: Date): string {
  const year = day.getUTCFullYear();
  const month = String(day.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(day.getUTCDate()).padStart(2, "0");
  return `${TCMB_BULLETIN_BASE}/${year}${month}/${dayOfMonth}${month}${year}.xml`;
}

/** Rates are stored at 4 decimal places (the column's precision); round before using them. */
export function roundRate(rate: number): number {
  return Math.round(rate * 10000) / 10000;
}

/**
 * Looks up foreign-currency rates from the Central Bank of the Republic of Turkey (TCMB). Published
 * rates for a past day never change, so they're cached per currency and day; today's rate is not
 * cached because the bulletin is only published after 15:30 (Turkey time) and an early lookup would
 * otherwise pin yesterday's rate.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly cache = new Map<string, ForeignRate>();

  getUsdTryRate(date: Date): Promise<ForeignRate> {
    return this.getRate("USD", date);
  }

  async getRate(currency: ForeignCurrency, date: Date): Promise<ForeignRate> {
    const requested = isoDay(date);
    const key = `${currency}:${requested}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    for (let back = 0; back <= MAX_LOOKBACK_DAYS; back++) {
      const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - back));
      const outcome = await this.fetchForexSelling(day, currency);
      if (outcome === "missing") continue;
      if (outcome === null) break;

      const result: ForeignRate = { date: requested, rate: outcome, bulletinDate: isoDay(day) };
      if (requested < isoDay(new Date())) this.remember(key, result);
      return result;
    }

    throw new BadGatewayException(
      `${currency} kuru alınamadı. Kuru elle girerek devam edebilirsiniz.`,
    );
  }

  /** TRY per 1 unit of `currency` on `date`. An entered rate always wins over the lookup. */
  async resolveTryRate(currency: ExchangeCurrency, date: Date, enteredRate?: number): Promise<number> {
    if (currency === "TRY") return 1;
    if (enteredRate !== undefined) return roundRate(enteredRate);
    return roundRate((await this.getRate(currency, date)).rate);
  }

  /** "missing" = no bulletin that day (weekend/holiday); null = the lookup itself failed. */
  private async fetchForexSelling(day: Date, currency: ForeignCurrency): Promise<number | "missing" | null> {
    let response: Response;
    try {
      response = await fetch(bulletinUrl(day), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) {
      this.logger.warn(`TCMB bulletin request failed: ${String(error)}`);
      return null;
    }
    if (response.status === 404) return "missing";
    if (!response.ok) {
      this.logger.warn(`TCMB bulletin ${response.status} for ${isoDay(day)}`);
      return null;
    }
    const rate = parseForexSelling(await response.text(), currency);
    if (rate === null) this.logger.warn(`${currency} row not found in TCMB bulletin ${isoDay(day)}`);
    return rate;
  }

  private remember(key: string, value: ForeignRate): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }
}
