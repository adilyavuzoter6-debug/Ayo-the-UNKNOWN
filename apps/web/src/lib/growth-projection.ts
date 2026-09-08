import type { SgrPoint } from "@/lib/types";

export interface HarvestForecast {
  currentWeightG: number;
  asOf: string;
  avgSgrPctPerDay: number;
  daysToTarget: number;
  projectedDate: Date;
}

/**
 * Extrapolates from the batch's own trailing growth rate — not a temperature-driven
 * bioenergetic model. Water-quality readings in this app are periodic manual entries, not a
 * dense sensor time series, so a degree-day model built on them would look precise while
 * actually being noisy; the batch's own measured SGR is the more honest signal available today.
 * Averages up to the last 3 SGR points for stability against one noisy sample pair.
 */
export function projectHarvestDate(
  sgrSeries: SgrPoint[],
  targetWeightG: number,
): HarvestForecast | null {
  if (sgrSeries.length === 0 || !(targetWeightG > 0)) return null;

  const recent = sgrSeries.slice(-3);
  const avgSgrPctPerDay = recent.reduce((sum, p) => sum + p.sgrPctPerDay, 0) / recent.length;
  const last = sgrSeries.at(-1)!;
  const currentWeightG = last.finalAvgWeightG;

  if (avgSgrPctPerDay <= 0 || targetWeightG <= currentWeightG) return null;

  const daysToTarget = Math.log(targetWeightG / currentWeightG) / (avgSgrPctPerDay / 100);
  const projectedDate = new Date(last.finalOccurredAt);
  projectedDate.setDate(projectedDate.getDate() + Math.round(daysToTarget));

  return {
    currentWeightG,
    asOf: last.finalOccurredAt,
    avgSgrPctPerDay,
    daysToTarget: Math.round(daysToTarget),
    projectedDate,
  };
}
