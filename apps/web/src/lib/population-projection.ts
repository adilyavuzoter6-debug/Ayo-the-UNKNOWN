import type { MortalityEvent } from "@/lib/types";

export interface PopulationProjectionPoint {
  weeksAhead: number;
  date: Date;
  projectedCount: number;
}

export interface PopulationProjection {
  dailyMortalityRatePct: number;
  points: PopulationProjectionPoint[];
}

const LOOKBACK_DAYS = 30;
const WEEKS_AHEAD = 12;

/**
 * Extrapolates live fish count forward from the farm's own trailing mortality rate over the
 * last 30 days — not a model of disease, harvest, or new stocking. It answers "if things keep
 * dying at roughly the rate they have been, where does the count head," nothing more; a planned
 * harvest or a new stocking event isn't predicted and will move the real count away from this.
 */
export function projectPopulation(
  currentCount: number,
  mortalityEntries: Pick<MortalityEvent, "occurredAt" | "fishCount">[],
): PopulationProjection {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const recentMortality = mortalityEntries
    .filter((e) => new Date(e.occurredAt) >= cutoff)
    .reduce((sum, e) => sum + e.fishCount, 0);

  // Rough daily rate as a fraction of today's stock — the population was somewhat larger at
  // the start of the 30-day window, so this slightly understates the true historical rate,
  // acceptable for a directional estimate rather than a precise one.
  const dailyMortalityRate = currentCount > 0 ? recentMortality / (currentCount * LOOKBACK_DAYS) : 0;

  const points: PopulationProjectionPoint[] = [];
  for (let week = 0; week <= WEEKS_AHEAD; week++) {
    const date = new Date();
    date.setDate(date.getDate() + week * 7);
    const projectedCount = Math.round(currentCount * (1 - dailyMortalityRate) ** (week * 7));
    points.push({ weeksAhead: week, date, projectedCount: Math.max(projectedCount, 0) });
  }

  return { dailyMortalityRatePct: dailyMortalityRate * 100, points };
}
