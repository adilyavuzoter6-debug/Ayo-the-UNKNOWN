/**
 * Temperature-driven growth (the thermal growth coefficient, TGC), the standard model for salmonid
 * growth: the cube root of a fish's weight rises in proportion to the degree-days it lives through,
 *
 *   W₁^⅓ = W₀^⅓ + TGC/1000 × Σ daily water temperature (°C·days)
 *
 * so a batch grows fast in warm months and slowly in cold ones at the same coefficient. Each batch's
 * coefficient is fitted from its own weighings and the farm's own temperature records; nothing here
 * is a literature default. Pure functions, so the maths is testable without a database.
 */

const DAY_MS = 86_400_000;

/** A month's average counts as measured once this many days of it have a reading. */
const MIN_DAYS_PER_MEASURED_MONTH = 7;
/** A seasonal curve needs readings across at least half the year to be fitted rather than guessed. */
const MIN_MONTHS_FOR_SEASONAL_FIT = 6;
/** Below this many degree-days since stocking a weighing says too little about growth. */
const MIN_DEGREE_DAYS_FOR_FIT = 100;
/** TGC (×1000) outside this range means a data problem (a mistyped weight), not a real batch. */
const PLAUSIBLE_TGC = { min: 0.3, max: 6 };

export type TemperatureSource = "measured" | "seasonal" | "recent";

/** Expected water temperature for each calendar month (0 = January) and where the value comes from. */
export type TemperatureProfile = { temperatureC: number; source: TemperatureSource }[];

const dayKey = (date: Date) => Math.floor(date.getTime() / DAY_MS);

/** Daily mean temperature by UTC day number, from individual readings. */
export function dailyMeans(readings: { at: Date; temperatureC: number }[]): Map<number, number> {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const r of readings) {
    const key = dayKey(r.at);
    const entry = sums.get(key) ?? { sum: 0, n: 0 };
    entry.sum += r.temperatureC;
    entry.n += 1;
    sums.set(key, entry);
  }
  return new Map([...sums].map(([key, { sum, n }]) => [key, sum / n]));
}

/**
 * Twelve monthly temperatures for a farm. Months with enough readings use their average (across
 * years); the rest come from a yearly sine curve fitted to those averages when they cover half the
 * year, so the coming winter is colder than the summer just measured; otherwise from the recent
 * average. Null when the farm has no temperature readings at all.
 */
export function temperatureProfile(daily: Map<number, number>, now: Date): TemperatureProfile | null {
  if (daily.size === 0) return null;
  const byMonth = Array.from({ length: 12 }, () => ({ sum: 0, n: 0 }));
  for (const [key, mean] of daily) {
    const month = new Date(key * DAY_MS).getUTCMonth();
    byMonth[month]!.sum += mean;
    byMonth[month]!.n += 1;
  }
  const measured = byMonth.map((m) => (m.n >= MIN_DAYS_PER_MEASURED_MONTH ? m.sum / m.n : null));

  const recentFrom = dayKey(now) - 30;
  const recent = [...daily].filter(([key]) => key >= recentFrom).map(([, mean]) => mean);
  const all = [...daily.values()];
  const fallback = average(recent.length > 0 ? recent : all);

  const known = measured.flatMap((t, month) => (t === null ? [] : [{ month, t }]));
  const seasonal = known.length >= MIN_MONTHS_FOR_SEASONAL_FIT ? fitYearlySine(known) : null;

  return measured.map((t, month) =>
    t !== null
      ? { temperatureC: t, source: "measured" as const }
      : seasonal
        ? { temperatureC: clamp(seasonal(month), 1, 30), source: "seasonal" as const }
        : { temperatureC: fallback, source: "recent" as const },
  );
}

/** Least-squares fit of t = a + b·cos(2πm/12) + c·sin(2πm/12). */
function fitYearlySine(points: { month: number; t: number }[]): (month: number) => number {
  const rows = points.map(({ month, t }) => {
    const angle = (2 * Math.PI * month) / 12;
    return { x: [1, Math.cos(angle), Math.sin(angle)], t };
  });
  // Normal equations (XᵀX)β = Xᵀt, 3×3, solved by Cramer's rule.
  const xtx = [0, 1, 2].map((i) => [0, 1, 2].map((j) => rows.reduce((s, r) => s + r.x[i]! * r.x[j]!, 0)));
  const xtt = [0, 1, 2].map((i) => rows.reduce((s, r) => s + r.x[i]! * r.t, 0));
  const det = det3(xtx);
  if (Math.abs(det) < 1e-9) {
    const mean = average(points.map((p) => p.t));
    return () => mean;
  }
  const beta = [0, 1, 2].map((k) => det3(xtx.map((row, i) => row.map((v, j) => (j === k ? xtt[i]! : v)))) / det);
  return (month) => {
    const angle = (2 * Math.PI * month) / 12;
    return beta[0]! + beta[1]! * Math.cos(angle) + beta[2]! * Math.sin(angle);
  };
}

function det3(m: number[][]): number {
  const [a, b, c] = m as [number[], number[], number[]];
  return (
    a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)
  );
}

/**
 * Degree-days between two dates for one farm: each day's measured mean where there is one, the
 * profile's value for that month otherwise.
 */
export function degreeDays(from: Date, to: Date, daily: Map<number, number>, profile: TemperatureProfile): number {
  let total = 0;
  for (let key = dayKey(from); key < dayKey(to); key++) {
    total += daily.get(key) ?? profile[new Date(key * DAY_MS).getUTCMonth()]!.temperatureC;
  }
  return total;
}

/**
 * A batch's TGC (×1000) from its stocking weight and its weighings, each given with the degree-days
 * since stocking: the slope through the origin of (W^⅓ − W₀^⅓) against degree-days, so every
 * weighing counts and one odd sample can't decide it. Null when the weighings are too early or the
 * result is implausible.
 */
export function fitTgc(initialWeightG: number, samples: { weightG: number; degreeDays: number }[]): number | null {
  const usable = samples.filter((s) => s.degreeDays >= MIN_DEGREE_DAYS_FOR_FIT && s.weightG > 0);
  if (initialWeightG <= 0 || usable.length === 0) return null;
  const base = Math.cbrt(initialWeightG);
  let xy = 0;
  let xx = 0;
  for (const s of usable) {
    xy += s.degreeDays * (Math.cbrt(s.weightG) - base);
    xx += s.degreeDays * s.degreeDays;
  }
  const tgc = (xy / xx) * 1000;
  return tgc >= PLAUSIBLE_TGC.min && tgc <= PLAUSIBLE_TGC.max ? tgc : null;
}

/** Weight after living through `degreeDays` at the given TGC (×1000). */
export function growWeight(weightG: number, tgc: number, degreeDays: number): number {
  return (Math.cbrt(weightG) + (tgc / 1000) * degreeDays) ** 3;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function average(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
