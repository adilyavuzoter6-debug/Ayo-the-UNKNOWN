import { dailyMeans, degreeDays, fitTgc, growWeight, median, temperatureProfile } from "./thermal-growth";

const DAY = 86_400_000;
const day = (iso: string) => new Date(`${iso}T08:00:00Z`);

/** A reading every day between two dates, from a temperature-by-date function. */
function readingsBetween(from: string, to: string, tempAt: (d: Date) => number) {
  const out: { at: Date; temperatureC: number }[] = [];
  for (let t = day(from).getTime(); t <= day(to).getTime(); t += DAY) out.push({ at: new Date(t), temperatureC: tempAt(new Date(t)) });
  return out;
}
/** ~9 °C in February, ~18 °C in August. */
const seasonal = (d: Date) => 13.5 - 4.5 * Math.cos((2 * Math.PI * (d.getUTCMonth() - 1)) / 12);

describe("thermal growth", () => {
  it("averages readings per day", () => {
    const daily = dailyMeans([
      { at: new Date("2026-05-01T06:00:00Z"), temperatureC: 12 },
      { at: new Date("2026-05-01T18:00:00Z"), temperatureC: 14 },
      { at: new Date("2026-05-02T06:00:00Z"), temperatureC: 15 },
    ]);
    expect([...daily.values()]).toEqual([13, 15]);
  });

  it("fills unmeasured months from a seasonal curve fitted to the measured ones", () => {
    const daily = dailyMeans(readingsBetween("2026-04-01", "2026-10-28", seasonal));
    const profile = temperatureProfile(daily, day("2026-10-29"))!;
    expect(profile[6]).toMatchObject({ source: "measured" });
    expect(profile[1]!.source).toBe("seasonal");
    // The fitted winter is colder than any measured month, close to the curve the data came from.
    expect(profile[1]!.temperatureC).toBeLessThan(12);
    expect(profile[1]!.temperatureC).toBeCloseTo(seasonal(day("2026-02-15")), 0);
  });

  it("uses the recent average when there are too few months for a seasonal curve", () => {
    const daily = dailyMeans(readingsBetween("2026-09-01", "2026-10-28", () => 15));
    const profile = temperatureProfile(daily, day("2026-10-29"))!;
    expect(profile[0]).toEqual({ temperatureC: 15, source: "recent" });
    expect(temperatureProfile(new Map(), day("2026-10-29"))).toBeNull();
  });

  it("counts degree-days from measured days, and the profile where a day has no reading", () => {
    const daily = dailyMeans([{ at: day("2026-05-01"), temperatureC: 20 }]);
    const profile = Array.from({ length: 12 }, () => ({ temperatureC: 10, source: "recent" as const }));
    expect(degreeDays(day("2026-05-01"), day("2026-05-04"), daily, profile)).toBe(20 + 10 + 10);
  });

  it("recovers a batch's coefficient from its weighings, and grows it back the same way", () => {
    const tgc = 2.4;
    const samples = [600, 1200, 1800].map((dd) => ({ weightG: growWeight(50, tgc, dd), degreeDays: dd }));
    expect(fitTgc(50, samples)).toBeCloseTo(tgc, 6);
    // The same degree-days grow a fish more in absolute grams the bigger it is.
    expect(growWeight(300, tgc, 300) - 300).toBeGreaterThan(growWeight(100, tgc, 300) - 100);
  });

  it("refuses too-early weighings and implausible coefficients", () => {
    expect(fitTgc(50, [{ weightG: 52, degreeDays: 40 }])).toBeNull();
    // A tenfold weight in 200 degree-days is a typo, not growth.
    expect(fitTgc(50, [{ weightG: 500, degreeDays: 200 }])).toBeNull();
    expect(fitTgc(50, [])).toBeNull();
  });

  it("takes the median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
