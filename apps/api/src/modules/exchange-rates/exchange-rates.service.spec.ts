import { BadGatewayException } from "@nestjs/common";
import { ExchangeRatesService, parseUsdForexSelling, roundRate } from "./exchange-rates.service";

// Trimmed from a real TCMB daily bulletin: the USD row comes first, then other currencies.
const BULLETIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="06.10.2026" Date="10/06/2026" Bulten_No="2026/188">
	<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
		<Unit>1</Unit>
		<Isim>ABD DOLARI</Isim>
		<CurrencyName>US DOLLAR</CurrencyName>
		<ForexBuying>49.0918</ForexBuying>
		<ForexSelling>49.1802</ForexSelling>
	</Currency>
	<Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
		<ForexBuying>57.1000</ForexBuying>
		<ForexSelling>57.2500</ForexSelling>
	</Currency>
</Tarih_Date>`;

describe("parseUsdForexSelling", () => {
  it("returns the USD selling rate, not the buying rate or a later currency's rate", () => {
    expect(parseUsdForexSelling(BULLETIN_XML)).toBe(49.1802);
  });

  it("returns null when the bulletin has no USD row", () => {
    expect(parseUsdForexSelling(BULLETIN_XML.replace(/USD/g, "XXX"))).toBeNull();
  });

  it("returns null for a zero or non-numeric rate rather than a bogus conversion", () => {
    expect(parseUsdForexSelling(BULLETIN_XML.replace("49.1802", "0"))).toBeNull();
    expect(parseUsdForexSelling(BULLETIN_XML.replace("49.1802", "n/a"))).toBeNull();
  });
});

describe("roundRate", () => {
  it("rounds to the 4 decimal places the cost columns store", () => {
    expect(roundRate(49.18024999)).toBe(49.1802);
    expect(roundRate(40)).toBe(40);
  });
});

describe("ExchangeRatesService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses an entered rate as-is and never calls the Central Bank for it", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const service = new ExchangeRatesService();

    await expect(service.resolveTryRate("USD", new Date("2026-10-02"), 40.123456)).resolves.toBe(40.1235);
    await expect(service.resolveTryRate("TRY", new Date("2026-10-02"), 999)).resolves.toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("steps back over a weekend to the last published bulletin", async () => {
    const requested: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      requested.push(url);
      // Sun 04.10 and Sat 03.10 have no bulletin; Fri 02.10 does.
      return url.includes("02102026")
        ? new Response(BULLETIN_XML, { status: 200 })
        : new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    const service = new ExchangeRatesService();
    const result = await service.getUsdTryRate(new Date("2026-10-04T00:00:00Z"));

    expect(result).toEqual({ date: "2026-10-04", rate: 49.1802, bulletinDate: "2026-10-02" });
    expect(requested).toEqual([
      "https://www.tcmb.gov.tr/kurlar/202610/04102026.xml",
      "https://www.tcmb.gov.tr/kurlar/202610/03102026.xml",
      "https://www.tcmb.gov.tr/kurlar/202610/02102026.xml",
    ]);
  });

  it("fails with a 502 that tells the user to enter the rate, rather than guessing one", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const service = new ExchangeRatesService();
    await expect(service.getUsdTryRate(new Date("2026-10-02T00:00:00Z"))).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
