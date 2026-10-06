/**
 * Target-weight cost projection. Pure functions only: no I/O, no rounding. The screen rounds for display;
 * everything here is computed at full precision.
 *
 * Model (stated so it can be challenged):
 * - Growth is exponential, as the specific growth rate (SGR) defines it: each day the individual weight
 *   rises by a fixed percentage of its current weight. Within a stage the weight goes from the stage's
 *   lower to its upper bound in exactly the stage's duration; a manually typed simple duration uses the
 *   same kind of path between start and target.
 * - Survival within a stage is a constant daily rate, so the stage's mortality percentage is reached
 *   exactly at the end of the stage. Stage mortalities chain multiplicatively, never add up.
 * - The population is advanced in steps of at most one day. In each step the feed needed is the
 *   biomass gained by the average live population (dead fish included while they were alive) times
 *   the stage's FCR. So the feed a fish ate before it died is in the estimate, and FCR is applied once
 *   to growth, never on top of an economic FCR that already contains mortality.
 * - Costs already incurred (the batch's accumulated cost) are the starting point and are not
 *   recalculated. Only future feed and the expenses entered here are added.
 */

export type ProjectionMode = "SIMPLE" | "STAGED";
export type ExpenseMode = "TOTAL" | "DAILY";

export interface ExpenseInput {
  label: string;
  amountTry: number;
  /** TOTAL: the amount for the whole period. DAILY: the amount per day, multiplied by the period's days. */
  mode: ExpenseMode;
}

export interface StageInput {
  minG: number;
  maxG: number;
  feedPriceTryPerKg: number;
  fcr: number;
  /** Typed-in stage duration. When absent, sgrPctPerDay gives it. */
  durationDays?: number;
  /** Specific growth rate of this stage (%/day), used when durationDays is not given. */
  sgrPctPerDay?: number;
  mortalityPct: number;
}

export interface ScenarioInput {
  name?: string;
  startCount: number;
  startAvgWeightG: number;
  /** TRY already spent on these fish (realized). Not recalculated. */
  startAccumulatedCostTry: number;
  targetWeightG: number;
  mode: ProjectionMode;
  /** SIMPLE only. */
  feedPriceTryPerKg?: number;
  fcr?: number;
  durationDays?: number;
  mortalityPct?: number;
  /**
   * SIMPLE only, used when durationDays is not given: the batch's specific growth rate (%/day). The
   * duration is then ln(target / start) / (SGR / 100), the time exponential growth at that rate takes.
   */
  sgrPctPerDay?: number;
  /** STAGED only. */
  stages?: StageInput[];
  expenses: ExpenseInput[];
}

export interface StageBreakdown {
  fromG: number;
  toG: number;
  days: number;
  feedKg: number;
  feedCostTry: number;
  fcr: number;
  feedPriceTryPerKg: number;
  mortalityPct: number;
}

export interface ScenarioResult {
  targetWeightG: number;
  days: number;
  /** Where the duration came from: typed in (MANUAL), derived from growth rate (SGR), or stage durations (STAGED). */
  durationSource: "MANUAL" | "SGR" | "STAGED";
  startCount: number;
  aliveAtTarget: number;
  deadCount: number;
  startBiomassKg: number;
  targetBiomassKg: number;
  /** Target biomass minus start biomass: includes the biomass lost to death. */
  netBiomassChangeKg: number;
  /** Biomass the modelled population gained while it was alive; FCR is applied to this. */
  growthKg: number;
  feedKg: number;
  feedCostTry: number;
  expenses: { label: string; mode: ExpenseMode; amountTry: number }[];
  expensesTry: number;
  /** Future money: feed plus expenses. */
  additionalCostTry: number;
  startAccumulatedCostTry: number;
  totalCostTry: number;
  costPerFishTry: number | null;
  costPerKgTry: number | null;
  stages: StageBreakdown[];
  warnings: string[];
}

/** A problem with the inputs, phrased for the user. Thrown instead of guessing a value. */
export class ScenarioError extends Error {}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function requirePositive(value: unknown, message: string): number {
  if (!finite(value) || value <= 0) throw new ScenarioError(message);
  return value;
}

function requireNonNegative(value: unknown, message: string): number {
  if (!finite(value) || value < 0) throw new ScenarioError(message);
  return value;
}

function requireMortality(value: unknown, message: string): number {
  if (!finite(value) || value < 0 || value > 100) throw new ScenarioError(message);
  return value;
}

/**
 * A stage's full duration: typed in when given, otherwise the time exponential growth at the stage's
 * growth rate takes to go from its lower bound to its upper bound. The same rule as the simple mode, per stage.
 */
export function stageDurationDays(stage: StageInput, label: string): number {
  if (stage.durationDays !== undefined) {
    return requirePositive(stage.durationDays, `${label}: yetiştirme süresi sıfırdan büyük olmalı.`);
  }
  if (stage.sgrPctPerDay === undefined) {
    throw new ScenarioError(`${label}: yetiştirme süresi (gün) ya da büyüme hızı (SGR) girilmeli.`);
  }
  const sgr = requirePositive(stage.sgrPctPerDay, `${label}: büyüme hızı (SGR) sıfırdan büyük olmalı.`);
  return Math.log(stage.maxG / stage.minG) / (sgr / 100);
}

/** The stages must be disjoint and must cover every weight from the start to the target, with no gaps. */
export function validateStages(stages: StageInput[], startG: number, targetG: number): StageInput[] {
  if (stages.length === 0) throw new ScenarioError("Aşamalı hesapta en az bir aşama tanımlayın.");

  const checked = stages.map((s, i) => {
    const label = `${i + 1}. aşama`;
    if (!finite(s.minG) || !finite(s.maxG) || s.minG <= 0 || s.maxG <= s.minG) {
      throw new ScenarioError(`${label}: alt gramaj sıfırdan büyük ve üst gramajdan küçük olmalı.`);
    }
    requirePositive(s.feedPriceTryPerKg, `${label}: yem fiyatı girilmeli ve sıfırdan büyük olmalı.`);
    requirePositive(s.fcr, `${label}: FCR girilmeli ve sıfırdan büyük olmalı.`);
    stageDurationDays(s, label);
    requireMortality(s.mortalityPct, `${label}: ölüm oranı 0 ile 100 arasında olmalı.`);
    return s;
  });

  const sorted = [...checked].sort((a, b) => a.minG - b.minG);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.minG < sorted[i - 1]!.maxG) {
      throw new ScenarioError(
        `Aşamalar çakışıyor: ${sorted[i - 1]!.minG}–${sorted[i - 1]!.maxG} g ile ${sorted[i]!.minG}–${sorted[i]!.maxG} g.`,
      );
    }
  }

  // Walk from the start weight upward; any stretch with no stage is a gap.
  let position = startG;
  for (const stage of sorted) {
    if (stage.maxG <= position) continue;
    if (stage.minG > position) break;
    position = stage.maxG;
    if (position >= targetG) break;
  }
  if (position < targetG) {
    const firstUncovered = position;
    throw new ScenarioError(
      `${firstUncovered} g ile hedef ${targetG} g arasında aşama yok; aralıkları tamamlayın.`,
    );
  }
  if (sorted[0]!.minG > startG) {
    throw new ScenarioError(`Başlangıç ağırlığı ${startG} g hiçbir aşamaya girmiyor.`);
  }
  return sorted;
}

interface Segment {
  fromG: number;
  toG: number;
  days: number;
  survival: number;
  fcr: number;
  feedPriceTryPerKg: number;
  mortalityPct: number;
}

/**
 * The simple-mode duration: typed in when given, otherwise the time that growth at the batch's specific
 * growth rate takes to get from the start weight to the target. Nothing is guessed when neither is there.
 */
export function simpleDays(input: ScenarioInput, startG: number, targetG: number): number {
  if (input.durationDays !== undefined) {
    return requirePositive(input.durationDays, "Hızlı hesapta yetiştirme süresi (gün) sıfırdan büyük olmalı.");
  }
  if (input.sgrPctPerDay === undefined) {
    throw new ScenarioError("Hızlı hesapta yetiştirme süresi (gün) ya da büyüme hızı (SGR) girilmeli.");
  }
  const sgr = requirePositive(
    input.sgrPctPerDay,
    "Büyüme hızı (SGR) sıfırdan büyük olmalı; süre bundan türetilemez.",
  );
  return Math.log(targetG / startG) / (sgr / 100);
}

function segmentsFor(input: ScenarioInput): Segment[] {
  const start = input.startAvgWeightG;
  const target = input.targetWeightG;

  if (input.mode === "SIMPLE") {
    const price = requirePositive(input.feedPriceTryPerKg, "Hızlı hesapta yem fiyatı (TL/kg) girilmeli.");
    const fcr = requirePositive(input.fcr, "Hızlı hesapta FCR girilmeli.");
    const days = simpleDays(input, start, target);
    const mortality = requireMortality(input.mortalityPct, "Hızlı hesapta ölüm oranı (%) girilmeli.");
    return [
      {
        fromG: start,
        toG: target,
        days,
        survival: 1 - mortality / 100,
        fcr,
        feedPriceTryPerKg: price,
        mortalityPct: mortality,
      },
    ];
  }

  const stages = validateStages(input.stages ?? [], start, target);
  const segments: Segment[] = [];
  for (const stage of stages) {
    const from = Math.max(stage.minG, start);
    const to = Math.min(stage.maxG, target);
    if (to <= from) continue;
    // Time spent between from and to on the stage's exponential path (minG → maxG over durationDays).
    const fraction = Math.log(to / from) / Math.log(stage.maxG / stage.minG);
    segments.push({
      fromG: from,
      toG: to,
      days: stageDurationDays(stage, "Aşama") * fraction,
      survival: Math.pow(1 - stage.mortalityPct / 100, fraction),
      fcr: stage.fcr,
      feedPriceTryPerKg: stage.feedPriceTryPerKg,
      mortalityPct: stage.mortalityPct,
    });
  }
  return segments;
}

export function calculateScenario(input: ScenarioInput): ScenarioResult {
  const startCount = requirePositive(input.startCount, "Başlangıç canlı adedi sıfırdan büyük olmalı.");
  const startG = requirePositive(input.startAvgWeightG, "Başlangıç ortalama ağırlığı sıfırdan büyük olmalı.");
  const startCost = requireNonNegative(
    input.startAccumulatedCostTry,
    "Başlangıç birikmiş maliyeti girilmeli (yeni alımda 0 yazılabilir); negatif olamaz.",
  );
  const targetG = requirePositive(input.targetWeightG, "Hedef gramaj sıfırdan büyük olmalı.");
  if (targetG <= startG) {
    throw new ScenarioError(
      `Hedef gramaj (${targetG} g) başlangıç gramajından (${startG} g) büyük olmalı. Bu hesap büyütme içindir.`,
    );
  }

  for (const e of input.expenses ?? []) {
    if (!e.label || !e.label.trim()) throw new ScenarioError("Her giderin bir adı olmalı.");
    requireNonNegative(e.amountTry, `"${e.label}" giderinin tutarı negatif olamaz.`);
  }

  const segments = segmentsFor({ ...input, startAvgWeightG: startG, targetWeightG: targetG });
  const warnings: string[] = [];

  let count = startCount;
  let feedKg = 0;
  let feedCostTry = 0;
  let growthKg = 0;
  let deadCount = 0;
  let days = 0;
  const stages: StageBreakdown[] = [];

  for (const seg of segments) {
    const steps = Math.max(1, Math.ceil(seg.days));
    const dt = seg.days / steps;
    const stepSurvival = Math.pow(seg.survival, 1 / steps);
    const stage: StageBreakdown = {
      fromG: seg.fromG,
      toG: seg.toG,
      days: seg.days,
      feedKg: 0,
      feedCostTry: 0,
      fcr: seg.fcr,
      feedPriceTryPerKg: seg.feedPriceTryPerKg,
      mortalityPct: seg.mortalityPct,
    };

    for (let i = 0; i < steps; i++) {
      const wa = seg.fromG * Math.pow(seg.toG / seg.fromG, i / steps);
      const wb = seg.fromG * Math.pow(seg.toG / seg.fromG, (i + 1) / steps);
      const next = count * stepSurvival;
      const averageCount = (count + next) / 2;
      const growth = (averageCount * (wb - wa)) / 1000;

      const stepFeed = growth * seg.fcr;
      growthKg += growth;
      feedKg += stepFeed;
      feedCostTry += stepFeed * seg.feedPriceTryPerKg;
      stage.feedKg += stepFeed;
      stage.feedCostTry += stepFeed * seg.feedPriceTryPerKg;

      deadCount += count - next;
      days += dt;
      count = next;
    }
    stages.push(stage);
  }

  // Expenses: TOTAL counts once; DAILY is the per-day amount over the period the fish actually take.
  const expenses = (input.expenses ?? []).map((e) => ({
    label: e.label.trim(),
    mode: e.mode,
    amountTry: e.mode === "DAILY" ? e.amountTry * days : e.amountTry,
  }));
  const expensesTry = expenses.reduce((sum, e) => sum + e.amountTry, 0);

  const startBiomassKg = (startCount * startG) / 1000;
  const targetBiomassKg = (count * targetG) / 1000;
  const additionalCostTry = feedCostTry + expensesTry;
  const totalCostTry = startCost + additionalCostTry;

  if (count <= 0 || count < 1e-9) {
    warnings.push("Ölüm oranı %100: hedefte canlı balık kalmıyor, birim maliyet hesaplanamaz.");
  }

  const durationSource: ScenarioResult["durationSource"] =
    input.mode === "STAGED" ? "STAGED" : input.durationDays !== undefined ? "MANUAL" : "SGR";

  return {
    targetWeightG: targetG,
    durationSource,
    days,
    startCount,
    aliveAtTarget: count,
    deadCount,
    startBiomassKg,
    targetBiomassKg,
    netBiomassChangeKg: targetBiomassKg - startBiomassKg,
    growthKg,
    feedKg,
    feedCostTry,
    expenses,
    expensesTry,
    additionalCostTry,
    startAccumulatedCostTry: startCost,
    totalCostTry,
    costPerFishTry: count > 1e-9 ? totalCostTry / count : null,
    costPerKgTry: targetBiomassKg > 1e-9 ? totalCostTry / targetBiomassKg : null,
    stages,
    warnings,
  };
}
