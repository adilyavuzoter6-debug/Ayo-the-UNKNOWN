/**
 * Compares strings the way a person reads a label, not the way a database compares bytes:
 * "A2" before "A10". A plain `ORDER BY code ASC` — lexicographic — puts "A10" right after "A1"
 * (the character '1' < '2'), yielding A1, A10, A2, A3, ... A9 for a farm section with ten tanks.
 * `Intl.Collator`'s `numeric` option compares embedded digit runs by value instead of by
 * character, which is exactly what a tank/farm/lot code needs.
 */
const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

export function naturalSortByCode<T extends { code: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => collator.compare(a.code, b.code));
}
