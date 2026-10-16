/** Splits `total` across `weights`' shares as whole numbers that sum back to exactly `total`
 *  (largest-remainder method) — plain proportional rounding can land one fish short or over. */
export function distributeInt(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i]! }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) {
    result[order[k]!.i]! += 1;
  }
  return result;
}

/** Splits `total` across `weights`' shares proportionally, rounded to 2 decimals — fine for a
 *  kg/liter amount, unlike a fish count there's no need for the sum to land exactly on `total`. */
export function distributeFloat(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  return weights.map((w) => Math.round(((w / sum) * total) * 100) / 100);
}
