import { growthRangeEstimate, GrowthPair } from "./growth-profile";

const pair = (initial: number, final: number, periodDays: number): GrowthPair => ({
  initialAvgWeightG: initial,
  finalAvgWeightG: final,
  periodDays,
});

describe("growthRangeEstimate", () => {
  it("reads the rate of one period that lies inside the range", () => {
    // 5 g → 20 g in 30 days: ln(4) / 30 per day.
    const r = growthRangeEstimate([pair(5, 20, 30)], { minG: 5, maxG: 20 });
    expect(r.sgrPctPerDay).toBeCloseTo((Math.log(4) / 30) * 100, 9);
    expect(r.periods).toBe(1);
    expect(r.days).toBeCloseTo(30, 9);
  });

  it("gives a part of a period only the time that part took, at that period's rate", () => {
    // Same 5 g → 20 g period; the 5–10 g half of it is ln(2) of the ln(4) growth: 15 days.
    const r = growthRangeEstimate([pair(5, 20, 30)], { minG: 5, maxG: 10 });
    expect(r.sgrPctPerDay).toBeCloseTo((Math.log(4) / 30) * 100, 9);
    expect(r.days).toBeCloseTo(15, 9);
  });

  it("pools periods by time, not by averaging their rates", () => {
    // A: 5 → 10 g in 10 days (ln2 / 10). B: 10 → 20 g in 40 days (ln2 / 40).
    // Pooled over 5–20 g: ln4 of growth in 50 days, not the mean of the two rates.
    const r = growthRangeEstimate([pair(5, 10, 10), pair(10, 20, 40)], { minG: 5, maxG: 20 });
    expect(r.sgrPctPerDay).toBeCloseTo((Math.log(4) / 50) * 100, 9);
    expect(r.periods).toBe(2);
    expect(r.days).toBeCloseTo(50, 9);
  });

  it("leaves out periods that do not touch the range, and periods that did not grow", () => {
    const r = growthRangeEstimate(
      [pair(1, 2, 20), pair(30, 25, 10), pair(5, 5, 10), pair(5, 20, 30)],
      { minG: 5, maxG: 20 },
    );
    expect(r.periods).toBe(1);
    expect(r.sgrPctPerDay).toBeCloseTo((Math.log(4) / 30) * 100, 9);
  });

  it("has no rate for a range no measured period reaches", () => {
    const r = growthRangeEstimate([pair(5, 20, 30)], { minG: 100, maxG: 350 });
    expect(r.sgrPctPerDay).toBeNull();
    expect(r.periods).toBe(0);
    expect(r.days).toBe(0);
  });

  it("has no rate when there are no weighings at all", () => {
    expect(growthRangeEstimate([], { minG: 3, maxG: 5 }).sgrPctPerDay).toBeNull();
  });
});
