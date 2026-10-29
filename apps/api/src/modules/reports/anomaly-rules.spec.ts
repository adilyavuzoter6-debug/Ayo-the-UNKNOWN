import { BatchAnomalyInput, detectAnomalies, realizedFcr } from "./anomaly-rules";

// 10,000 fish stocked at 50 g (500 kg), now 9,800 at 150 g (1,470 kg): 970 kg gained.
const base: BatchAnomalyInput = {
  batchId: "b",
  speciesId: "trout",
  daysSinceStocking: 120,
  liveCount: 9_800,
  avgWeightG: 150,
  initialCount: 10_000,
  initialAvgWeightG: 50,
  targetFcr: null,
  totalFeedKg: 1_067, // FCR 1.1
  harvestedKg: 0,
  deadKg: 0,
  deaths7d: 0,
  deathsPrior28d: 0,
  openWaterQualityAlerts: 0,
  activeTreatments: 0,
};

/** Five ordinary peers around FCR 1.1, plus whatever batches the test adds. */
function withPeers(...batches: BatchAnomalyInput[]): BatchAnomalyInput[] {
  const peers = [1.05, 1.08, 1.1, 1.12, 1.15].map((fcr, i) => ({
    ...base,
    batchId: `peer-${i}`,
    totalFeedKg: fcr * 970,
  }));
  return [...peers, ...batches];
}

describe("realizedFcr", () => {
  it("divides all feed by all biomass produced, including harvested and dead fish", () => {
    expect(realizedFcr(base)).toBeCloseTo(1.1, 2);
    // 200 kg harvested and 30 kg dead were growth too.
    expect(realizedFcr({ ...base, harvestedKg: 200, deadKg: 30, totalFeedKg: 1_200 })).toBeCloseTo(1_200 / 1_200, 6);
  });

  it("returns null for young batches, unfed batches and batches with too little gain on record", () => {
    expect(realizedFcr({ ...base, daysSinceStocking: 10 })).toBeNull();
    expect(realizedFcr({ ...base, totalFeedKg: 0 })).toBeNull();
    // Never re-weighed: the average weight is still the stocking weight, so there's no gain.
    expect(realizedFcr({ ...base, avgWeightG: 50 })).toBeNull();
    expect(realizedFcr({ ...base, avgWeightG: 52 })).toBeNull();
  });
});

describe("detectAnomalies — FCR", () => {
  it("flags nothing for a batch in line with its peers", () => {
    expect(detectAnomalies(withPeers({ ...base, batchId: "x", totalFeedKg: 1.12 * 970 }))).toEqual([]);
  });

  it("flags a batch well above its species' median", () => {
    const [a] = detectAnomalies(withPeers({ ...base, batchId: "x", totalFeedKg: 1.6 * 970 }));
    // The batch counts among its species too: the median of 1.05…1.15 and 1.6 is 1.11.
    expect(a!).toMatchObject({ batchId: "x", kind: "FCR_HIGH", severity: "MEDIUM" });
    expect(a!.reference).toBeCloseTo(1.11, 6);
    expect(a!.value).toBeCloseTo(1.6, 6);
    const [high] = detectAnomalies(withPeers({ ...base, batchId: "x", totalFeedKg: 1.8 * 970 }));
    expect(high!.severity).toBe("HIGH");
  });

  it("needs enough peers before judging against them", () => {
    expect(detectAnomalies([{ ...base, batchId: "x", totalFeedKg: 2 * 970 }])).toEqual([]);
  });

  it("judges against the batch's own target when it has one", () => {
    const [a] = detectAnomalies([{ ...base, batchId: "x", targetFcr: 1.0, totalFeedKg: 1.2 * 970 }]);
    expect(a!).toMatchObject({ kind: "FCR_HIGH", severity: "MEDIUM", reference: 1.0 });
    expect(detectAnomalies([{ ...base, batchId: "x", targetFcr: 1.0, totalFeedKg: 1.1 * 970 }])).toEqual([]);
  });

  it("calls an implausibly low FCR a data problem and keeps it out of the peer median", () => {
    const anomalies = detectAnomalies(withPeers({ ...base, batchId: "x", totalFeedKg: 0.3 * 970 }));
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ batchId: "x", kind: "FCR_LOW", severity: "LOW", reference: 1.1 });
  });
});

describe("detectAnomalies — mortality", () => {
  it("ignores everyday loss", () => {
    expect(detectAnomalies([{ ...base, deaths7d: 20, deathsPrior28d: 0 }])).toEqual([]);
  });

  it("flags a week well above the batch's own earlier rate", () => {
    // 100 dead this week (~1%) against ~0.1% a week before.
    const [a] = detectAnomalies([{ ...base, deaths7d: 100, deathsPrior28d: 40 }]);
    expect(a!).toMatchObject({ kind: "MORTALITY_RISK", severity: "MEDIUM" });
    expect(a!.value).toBeCloseTo((100 / 9_900) * 100, 6);
  });

  it("does not flag a steady, moderate rate", () => {
    // ~1% this week, ~0.8% a week before: not a rise, and under the high-on-its-own line.
    expect(detectAnomalies([{ ...base, deaths7d: 100, deathsPrior28d: 320 }])).toEqual([]);
  });

  it("raises the severity when water quality or a treatment backs it up, or the rate is high on its own", () => {
    const water = detectAnomalies([{ ...base, deaths7d: 100, deathsPrior28d: 40, openWaterQualityAlerts: 1 }]);
    expect(water[0]!.severity).toBe("HIGH");
    expect(water[0]!.reasons).toContain("Partinin bulunduğu tankta açık su kalitesi alarmı var.");
    const steepButSteady = detectAnomalies([{ ...base, deaths7d: 300, deathsPrior28d: 1_000 }]);
    expect(steepButSteady[0]).toMatchObject({ kind: "MORTALITY_RISK", severity: "HIGH" });
  });

  it("lists high-severity anomalies first", () => {
    const anomalies = detectAnomalies([
      { ...base, batchId: "medium", deaths7d: 100, deathsPrior28d: 40 },
      { ...base, batchId: "high", deaths7d: 400, deathsPrior28d: 0 },
    ]);
    expect(anomalies.map((a) => a.batchId)).toEqual(["high", "medium"]);
  });
});
