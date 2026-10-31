/**
 * The filled-in example of the import template: six months of one made-up trout farm, so a new
 * customer sees what each tab holds, in what form, and with numbers that hang together — the fish
 * grow with the water temperature, the feed follows the growth, the feed size changes as they grow,
 * the pond batches move to cages and are partly harvested. It imports as-is into a company whose
 * feed products carry these names. Dates count back from the day it's made, so it's always history.
 */

export type ExampleCell = string | number | Date | null;

const DAY_MS = 86_400_000;
const FARM = "ORN";

/** Deterministic, so every download is the same farm. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEEDS = [
  { name: "Alabalık Başlangıç 1,5 mm", upToG: 40, priceTry: 48 },
  { name: "Alabalık Büyütme 3 mm", upToG: 150, priceTry: 38.5 },
  { name: "Alabalık Büyütme 6 mm", upToG: Infinity, priceTry: 34 },
];

interface BatchPlan {
  lotSuffix: string;
  stockedDaysAgo: number;
  tank: string;
  count: number;
  weightG: number;
  /** Days ago → fish lost and why, in whichever tank the batch is in that day. */
  deaths: Record<number, [number, string]>;
  movedDaysAgo: number;
  movedTo: string;
}

const BATCHES: BatchPlan[] = [
  {
    lotSuffix: "01",
    stockedDaysAgo: 178,
    tank: "H-01",
    count: 20_000,
    weightG: 12,
    deaths: { 163: [120, "Bilinmiyor"], 137: [180, "Hastalık"], 107: [65, "Transfer stresi"], 82: [90, "Oksijen yetersizliği"], 43: [140, "Hastalık"] },
    movedDaysAgo: 108,
    movedTo: "K-01",
  },
  {
    lotSuffix: "02",
    stockedDaysAgo: 143,
    tank: "H-02",
    count: 15_000,
    weightG: 8,
    deaths: { 128: [150, "Bilinmiyor"], 103: [110, "Sıcaklık"], 71: [45, "Transfer stresi"], 56: [60, "Bilinmiyor"] },
    movedDaysAgo: 72,
    movedTo: "K-02",
  },
];

/** Every tab's example rows, header row first, keyed by tab name. */
export function exampleRows(today = new Date()): Record<string, ExampleCell[][]> {
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysAgo = (n: number) => new Date(base - n * DAY_MS);
  const rand = random(20260501);
  const jitter = (spread: number) => 1 + (rand() * 2 - 1) * spread;
  // Through toFixed, so a cell holds 28.9 rather than 28.900000000000002.
  const round = (n: number, step: number) => Number((Math.round(n / step) * step).toFixed(Math.max(0, -Math.floor(Math.log10(step)))));
  // A spring-fed farm: about 9 °C in February, 18 °C in August.
  const tempOn = (d: Date) => {
    const dayOfYear = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS;
    return 13.5 - 4.5 * Math.cos((2 * Math.PI * (dayOfYear - 40)) / 365);
  };
  const lotOf = (b: BatchPlan) => {
    const d = daysAgo(b.stockedDaysAgo);
    return `${FARM}-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}-${b.lotSuffix}`;
  };

  const feeding: ExampleCell[][] = [];
  const mortality: ExampleCell[][] = [];
  const weighing: ExampleCell[][] = [];
  const transfer: ExampleCell[][] = [];
  const harvest: ExampleCell[][] = [];
  const occupied = new Map<string, Set<number>>();

  for (const b of BATCHES) {
    const lot = lotOf(b);
    let tank = b.tank;
    let count = b.count;
    let weight = b.weightG;
    for (let ago = b.stockedDaysAgo; ago >= 1; ago--) {
      const date = daysAgo(ago);
      if (ago === b.movedDaysAgo) {
        transfer.push([date, FARM, tank, lot, FARM, b.movedTo, count, "Havuzdan kafese"]);
        tank = b.movedTo;
      }
      const death = b.deaths[ago];
      if (death) {
        mortality.push([date, FARM, tank, lot, death[0], death[1], null]);
        count -= death[0];
      }
      if (b.lotSuffix === "01" && ago === 11) {
        const fish = 3_000;
        harvest.push([date, FARM, tank, lot, fish, round((fish * weight) / 1000, 1), null, "Hayır", 145, "Ege Gıda", null]);
        count -= fish;
      }
      if (ago !== b.stockedDaysAgo && (b.stockedDaysAgo - ago) % 30 === 0) {
        weighing.push([date, FARM, tank, lot, 50, round(weight * jitter(0.03), 0.1), null]);
      }
      // Thermal growth (TGC 1,8) and the feed it takes at an FCR of about 1,1.
      const next = (Math.cbrt(weight) + 0.0018 * tempOn(date)) ** 3;
      const feed = FEEDS.find((f) => weight <= f.upToG)!;
      const kg = round(((count * (next - weight)) / 1000) * 1.1 * jitter(0.06), 0.5);
      feeding.push([date, FARM, tank, lot, feed.name, kg, feed.priceTry, null]);
      weight = next;
      occupied.set(tank, (occupied.get(tank) ?? new Set()).add(ago));
    }
  }
  feeding.sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime());

  const water: ExampleCell[][] = [];
  for (const [tank, days] of [...occupied].sort(([a], [b]) => a.localeCompare(b))) {
    for (const ago of [...days].sort((a, b) => b - a)) {
      if (ago % 2 !== 0) continue;
      const date = daysAgo(ago);
      const t = tempOn(date) * jitter(0.03);
      water.push([date, "08:00", FARM, tank, round(t, 0.1), round((9.8 - 0.17 * (t - 10)) * jitter(0.04), 0.1), round(7.4 * jitter(0.02), 0.01), null, null, null, null, null]);
    }
  }

  const [first, second] = BATCHES as [BatchPlan, BatchPlan];
  return {
    Çiftlikler: [["Örnek Alabalık Tesisi", FARM]],
    Tanklar: [
      [FARM, "Havuzlar", "H-01", "Havuz", 120, 3000],
      [FARM, "Havuzlar", "H-02", "Havuz", 120, 3000],
      [FARM, "Kafesler", "K-01", "Kafes", 800, 15_000],
      [FARM, "Kafesler", "K-02", "Kafes", 800, 15_000],
    ],
    Partiler: BATCHES.map((b) => [lotOf(b), "Gökkuşağı alabalığı", FARM, b.tank, daysAgo(b.stockedDaysAgo), b.count, b.weightG, 1.1, "Fethiye Kuluçkahanesi", null]),
    Yemleme: feeding,
    Ölüm: mortality.sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime()),
    Tartım: weighing.sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime()),
    "Su kalitesi": water,
    Hasat: harvest,
    Transfer: transfer.sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime()),
    Tedavi: [
      [daysAgo(136), daysAgo(127), FARM, first.tank, lotOf(first), "İlaç", "Florfenikol", "10 mg/kg yem, 10 gün", 15, "Veteriner önerisiyle"],
      [daysAgo(120), null, FARM, second.tank, lotOf(second), "Aşı", "ERM aşısı (daldırma)", null, null, null],
    ],
  };
}
