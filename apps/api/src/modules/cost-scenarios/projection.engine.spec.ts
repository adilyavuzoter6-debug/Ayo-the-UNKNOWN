import { calculateScenario, ScenarioError, ScenarioInput, validateStages } from "./projection.engine";

const base: ScenarioInput = {
  startCount: 1000,
  startAvgWeightG: 5,
  startAccumulatedCostTry: 2000,
  targetWeightG: 100,
  mode: "SIMPLE",
  feedPriceTryPerKg: 50,
  fcr: 1,
  durationDays: 120,
  mortalityPct: 0,
  expenses: [{ label: "Dönem ek giderleri", amountTry: 1000, mode: "TOTAL" }],
};

describe("calculateScenario — no mortality", () => {
  it("reproduces the hand-checked example: 1000 fish, 5 g → 100 g, FCR 1, 50 TL/kg, 2000 TL start, 1000 TL expenses", () => {
    const r = calculateScenario(base);
    expect(r.targetBiomassKg).toBeCloseTo(100, 9);
    expect(r.netBiomassChangeKg).toBeCloseTo(95, 9);
    expect(r.growthKg).toBeCloseTo(95, 9);
    expect(r.feedKg).toBeCloseTo(95, 9);
    expect(r.feedCostTry).toBeCloseTo(4750, 6);
    expect(r.totalCostTry).toBeCloseTo(7750, 6);
    expect(r.costPerFishTry).toBeCloseTo(7.75, 9);
    expect(r.costPerKgTry).toBeCloseTo(77.5, 9);
    expect(r.aliveAtTarget).toBeCloseTo(1000, 9);
    expect(r.days).toBe(120);
  });

  it("counts a DAILY expense once per day the fish are held, and a TOTAL expense once", () => {
    const r = calculateScenario({
      ...base,
      expenses: [
        { label: "Elektrik", amountTry: 10, mode: "DAILY" },
        { label: "Sağlık", amountTry: 300, mode: "TOTAL" },
      ],
    });
    expect(r.expenses.find((e) => e.label === "Elektrik")!.amountTry).toBe(1200); // 10 × 120 days
    expect(r.expenses.find((e) => e.label === "Sağlık")!.amountTry).toBe(300);
    expect(r.expensesTry).toBe(1500);
  });

  it("keeps full precision: a fractional target and an odd FCR are not rounded in the result", () => {
    const r = calculateScenario({ ...base, targetWeightG: 37.25, fcr: 1.123456 });
    expect(r.targetBiomassKg).toBeCloseTo(37.25, 9);
    expect(r.feedKg).toBeCloseTo((1000 * (37.25 - 5)) / 1000 * 1.123456, 9);
  });
});

describe("calculateScenario — with mortality", () => {
  it("feeds the fish that died before dying: feed exceeds the naive end-minus-start estimate", () => {
    const r = calculateScenario({ ...base, mortalityPct: 10 });
    expect(r.aliveAtTarget).toBeCloseTo(900, 6);
    expect(r.deadCount).toBeCloseTo(100, 6);
    // Naive: 900 × 100 g − 1000 × 5 g = 85 kg of growth. The modelled population grows 90.2 kg.
    expect(r.feedKg).toBeGreaterThan(85);
    expect(r.feedKg).toBeGreaterThan(89);
    expect(r.feedKg).toBeLessThan(91);
    // Cost already in the fish is carried by the survivors: no separate charge for the dead.
    expect(r.startAccumulatedCostTry).toBe(2000);
    expect(r.totalCostTry).toBeCloseTo(2000 + r.feedCostTry + 1000, 6);
  });

  it("warns and leaves unit costs undefined when every fish dies", () => {
    const r = calculateScenario({ ...base, mortalityPct: 100 });
    expect(r.aliveAtTarget).toBeLessThan(1e-6);
    expect(r.costPerFishTry).toBeNull();
    expect(r.costPerKgTry).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("calculateScenario — staged", () => {
  const stages = [
    { minG: 3, maxG: 5, feedPriceTryPerKg: 40, fcr: 1.0, durationDays: 10, mortalityPct: 5 },
    { minG: 5, maxG: 20, feedPriceTryPerKg: 45, fcr: 1.1, durationDays: 20, mortalityPct: 3 },
    { minG: 20, maxG: 100, feedPriceTryPerKg: 50, fcr: 1.2, durationDays: 40, mortalityPct: 2 },
    { minG: 100, maxG: 350, feedPriceTryPerKg: 55, fcr: 1.4, durationDays: 60, mortalityPct: 1 },
  ];

  it("runs stage by stage and stops inside a stage when the target is in its middle", () => {
    const r = calculateScenario({ ...base, mode: "STAGED", startAvgWeightG: 3, targetWeightG: 50, stages });
    expect(r.stages.map((s) => [s.fromG, s.toG])).toEqual([
      [3, 5],
      [5, 20],
      [20, 50],
    ]);
    // Third stage: 30 of its 80 g, so 30/80 of its 40 days = 15 days. Total 10 + 20 + 15.
    expect(r.days).toBeCloseTo(45, 9);
    expect(r.stages[2]!.days).toBeCloseTo(15, 9);
    expect(r.stages[2]!.fcr).toBe(1.2);
  });

  it("chains stage mortalities: survival is the product, not a sum of percentages", () => {
    const r = calculateScenario({ ...base, mode: "STAGED", startAvgWeightG: 3, targetWeightG: 20, stages });
    const survival = 0.95 * 0.97;
    expect(r.aliveAtTarget).toBeCloseTo(1000 * survival, 6);
  });

  it("refuses gaps and overlaps between stages, and a target no stage reaches", () => {
    expect(() => validateStages([stages[0]!, { ...stages[1]!, minG: 6 }], 3, 10)).toThrow(ScenarioError);
    expect(() => validateStages([stages[0]!, { ...stages[1]!, minG: 4 }], 3, 10)).toThrow(/çakışıyor/);
    expect(() => validateStages([stages[0]!, stages[1]!], 3, 50)).toThrow(/aşama yok/);
  });

  it("refuses a stage with a missing price or FCR instead of guessing one", () => {
    const bad = [{ ...stages[0]!, feedPriceTryPerKg: undefined as unknown as number }];
    expect(() => calculateScenario({ ...base, mode: "STAGED", startAvgWeightG: 3, targetWeightG: 4, stages: bad })).toThrow(
      /yem fiyatı/,
    );
  });
});

describe("calculateScenario — input checks", () => {
  it("refuses a target below the start weight", () => {
    expect(() => calculateScenario({ ...base, targetWeightG: 4 })).toThrow(/büyük olmalı/);
  });

  it("refuses zero or negative counts, weights, costs and expenses", () => {
    expect(() => calculateScenario({ ...base, startCount: 0 })).toThrow(ScenarioError);
    expect(() => calculateScenario({ ...base, startAvgWeightG: -1 })).toThrow(ScenarioError);
    expect(() => calculateScenario({ ...base, startAccumulatedCostTry: -5 })).toThrow(ScenarioError);
    expect(() => calculateScenario({ ...base, expenses: [{ label: "x", amountTry: -1, mode: "TOTAL" }] })).toThrow(
      ScenarioError,
    );
  });

  it("refuses a simple scenario without a feed price, FCR or duration", () => {
    expect(() => calculateScenario({ ...base, feedPriceTryPerKg: undefined })).toThrow(/yem fiyatı/);
    expect(() => calculateScenario({ ...base, fcr: undefined })).toThrow(/FCR/);
    expect(() => calculateScenario({ ...base, durationDays: undefined })).toThrow(/süre/);
  });

  it("refuses a mortality above 100 or below 0", () => {
    expect(() => calculateScenario({ ...base, mortalityPct: 120 })).toThrow(ScenarioError);
    expect(() => calculateScenario({ ...base, mortalityPct: -1 })).toThrow(ScenarioError);
  });
});

describe("calculateScenario — duration from growth rate", () => {
  it("derives the duration from SGR when no duration is typed, and reports where it came from", () => {
    // 5 g → 100 g at 2 %/day: ln(20) / 0.02 ≈ 149.79 days.
    const r = calculateScenario({ ...base, durationDays: undefined, sgrPctPerDay: 2 });
    expect(r.days).toBeCloseTo(Math.log(20) / 0.02, 6);
    expect(r.durationSource).toBe("SGR");
  });

  it("uses a typed duration over the growth rate when both are given", () => {
    const r = calculateScenario({ ...base, durationDays: 120, sgrPctPerDay: 2 });
    expect(r.days).toBe(120);
    expect(r.durationSource).toBe("MANUAL");
  });

  it("refuses a zero or negative growth rate instead of inventing a duration", () => {
    expect(() => calculateScenario({ ...base, durationDays: undefined, sgrPctPerDay: 0 })).toThrow(/SGR/);
    expect(() => calculateScenario({ ...base, durationDays: undefined, sgrPctPerDay: -1 })).toThrow(/SGR/);
  });

  it("refuses a simple scenario with neither a duration nor a growth rate", () => {
    expect(() => calculateScenario({ ...base, durationDays: undefined })).toThrow(/süre/);
  });
});
