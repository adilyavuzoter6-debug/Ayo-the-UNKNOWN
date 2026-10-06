/**
 * Growth rate per weight range, taken from the farm's own weighings. Pure: no I/O.
 *
 * Each pair of consecutive weighings is one measured period with a constant rate (SGR). For a weight
 * range [minG, maxG], the pair contributes the part of its growth that lies inside the range: the log
 * growth ln(hi / lo) over the time that growth took, days × ln(hi / lo) / ln(final / initial). The range's
 * SGR is all of that log growth divided by all of that time. Periods that span two ranges are shared
 * between them by time, so a long period is not counted twice.
 *
 * Pairs that did not grow (final ≤ initial, usually a weighing error) are left out.
 */

export interface GrowthPair {
  initialAvgWeightG: number;
  finalAvgWeightG: number;
  periodDays: number;
}

export interface WeightRange {
  minG: number;
  maxG: number;
}

export interface GrowthRangeEstimate extends WeightRange {
  /** Pooled SGR (%/day) for the range, or null when no measured period touches it. */
  sgrPctPerDay: number | null;
  /** Number of measured periods that touch the range. */
  periods: number;
  /** Days of measured growth inside the range. */
  days: number;
}

export function growthRangeEstimate(pairs: GrowthPair[], range: WeightRange): GrowthRangeEstimate {
  let logGrowth = 0;
  let days = 0;
  let periods = 0;

  for (const p of pairs) {
    const initial = p.initialAvgWeightG;
    const final = p.finalAvgWeightG;
    if (!(initial > 0) || !(final > initial) || !(p.periodDays > 0)) continue;

    const lo = Math.max(range.minG, initial);
    const hi = Math.min(range.maxG, final);
    if (!(hi > lo)) continue;

    periods++;
    const share = Math.log(hi / lo) / Math.log(final / initial);
    logGrowth += Math.log(hi / lo);
    days += p.periodDays * share;
  }

  return {
    minG: range.minG,
    maxG: range.maxG,
    sgrPctPerDay: days > 0 ? (logGrowth / days) * 100 : null,
    periods,
    days,
  };
}
