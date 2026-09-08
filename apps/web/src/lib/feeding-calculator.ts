/**
 * A rough guideline, not a precise prescription: real feed rates come from the feed
 * manufacturer's own chart for that specific pellet. This exists to give a starting point when
 * logging a feeding, derived from two well-established salmonid husbandry patterns —
 * feed rate drops sharply as fish grow, and feeding activity peaks in a mid-range water
 * temperature and falls off at both cold and warm extremes.
 */

/** % of body weight fed per day, by average fish weight bracket (typical salmonid feed chart). */
const BODY_WEIGHT_PCT_BRACKETS: { maxWeightG: number; pct: number }[] = [
  { maxWeightG: 5, pct: 5.0 },
  { maxWeightG: 20, pct: 4.0 },
  { maxWeightG: 50, pct: 3.0 },
  { maxWeightG: 100, pct: 2.2 },
  { maxWeightG: 250, pct: 1.6 },
  { maxWeightG: 500, pct: 1.2 },
  { maxWeightG: 1000, pct: 0.9 },
  { maxWeightG: 2000, pct: 0.7 },
  { maxWeightG: Infinity, pct: 0.5 },
];

function bodyWeightPct(avgWeightG: number): number {
  return (BODY_WEIGHT_PCT_BRACKETS.find((b) => avgWeightG <= b.maxWeightG) ?? BODY_WEIGHT_PCT_BRACKETS.at(-1)!)
    .pct;
}

/** Piecewise-linear multiplier peaking at 1.0 across 14-18°C, tapering toward the cold/warm extremes. */
function temperatureMultiplier(tempC: number): number {
  const points: [number, number][] = [
    [2, 0.05],
    [8, 0.6],
    [14, 1.0],
    [18, 1.0],
    [22, 0.6],
    [26, 0.15],
  ];
  if (tempC <= points[0]![0]) return points[0]![1];
  if (tempC >= points.at(-1)![0]) return points.at(-1)![1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    if (tempC >= x1 && tempC <= x2) {
      return y1 + ((tempC - x1) / (x2 - x1)) * (y2 - y1);
    }
  }
  return 1.0;
}

export interface FeedingRateEstimate {
  bodyWeightPct: number;
  temperatureMultiplier: number;
  suggestedKgPerDay: number;
}

/** Null when any required input is missing — no guessed water temperature. */
export function estimateFeedingRate(
  avgWeightG: number,
  biomassKg: number,
  waterTempC: number | null,
): FeedingRateEstimate | null {
  if (!(avgWeightG > 0) || !(biomassKg > 0) || waterTempC === null) return null;

  const pct = bodyWeightPct(avgWeightG);
  const multiplier = temperatureMultiplier(waterTempC);
  const suggestedKgPerDay = biomassKg * (pct / 100) * multiplier;

  return { bodyWeightPct: pct, temperatureMultiplier: multiplier, suggestedKgPerDay };
}
