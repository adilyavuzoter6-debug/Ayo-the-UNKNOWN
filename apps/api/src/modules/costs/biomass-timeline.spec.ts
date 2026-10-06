import { BatchTimelineInput, MovementRow, batchCountDelta, biomassKgDays } from "./biomass-timeline";

const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * DAY);

function movement(partial: Partial<MovementRow> & Pick<MovementRow, "movementType" | "batchId" | "fishCount">, at: number): MovementRow {
  return {
    fromBatchId: null,
    toBatchId: null,
    fromTankId: null,
    toTankId: null,
    occurredAt: day(at),
    ...partial,
  };
}

const BATCH = "A";

function timeline(overrides: Partial<BatchTimelineInput> = {}): BatchTimelineInput {
  return { initialAvgWeightG: 100, movements: [], mortality: [], weightSamples: [], ...overrides };
}

describe("biomassKgDays", () => {
  it("integrates a stocked batch as biomass × time", () => {
    // 100 fish × 100g = 10 kg, held for 10 days → 100 kg·days.
    const input = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100, toTankId: "t" }, 0)],
    });
    expect(biomassKgDays(input, BATCH, day(0), day(10))).toBeCloseTo(100);
  });

  it("drops biomass at a mortality and at a harvest removal, mid-window", () => {
    // 0–5: 10 kg × 5 = 50. Ten fish die on day 5 → 9 kg for 5 days = 45. Total 95.
    const input = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100 }, 0)],
      mortality: [{ fishCount: 10, occurredAt: day(5) }],
    });
    expect(biomassKgDays(input, BATCH, day(0), day(10))).toBeCloseTo(95);
  });

  it("uses the most recent weight sample at or before each moment, not the batch's initial weight", () => {
    // 0–5: 100 fish × 100g = 10 kg → 50. 5–10: 100 fish × 200g = 20 kg → 100. Total 150.
    const input = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100 }, 0)],
      weightSamples: [{ avgWeightG: 200, occurredAt: day(5) }],
    });
    expect(biomassKgDays(input, BATCH, day(0), day(10))).toBeCloseTo(150);
  });

  it("clips to the window — only the part of a batch's life inside [from, to] counts", () => {
    const input = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100 }, 0)],
    });
    // Days 2–4 of a constant 10 kg batch.
    expect(biomassKgDays(input, BATCH, day(2), day(4))).toBeCloseTo(20);
  });

  it("counts nothing before stocking and nothing after the batch is emptied", () => {
    const input = timeline({
      movements: [
        movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100 }, 5),
        movement({ movementType: "HARVEST_REMOVAL", batchId: BATCH, fishCount: 100 }, 10),
      ],
    });
    // Stocked day 5, harvested day 10 → 10 kg × 5 days = 50, regardless of the window's length.
    expect(biomassKgDays(input, BATCH, day(0), day(30))).toBeCloseTo(50);
  });

  it("treats a transfer between tanks as biomass-neutral for the batch", () => {
    const withTransfer = timeline({
      movements: [
        movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100 }, 0),
        movement({ movementType: "TRANSFER", batchId: BATCH, fishCount: 100, fromTankId: "a", toTankId: "b" }, 4),
      ],
    });
    const without = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100 }, 0)],
    });
    expect(biomassKgDays(withTransfer, BATCH, day(0), day(10))).toBeCloseTo(
      biomassKgDays(without, BATCH, day(0), day(10)),
    );
  });

  it("moves a split's fish to the recipient batch from the split day onward", () => {
    // Batch A holds 100 fish; 40 are split to B on day 5. Both start at 100g.
    const split = movement(
      { movementType: "SPLIT", batchId: "A", fromBatchId: "A", toBatchId: "B", fishCount: 40, fromTankId: "t", toTankId: "u" },
      5,
    );
    const input = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: "A", fishCount: 100 }, 0), split],
    });
    const forB = timeline({ movements: [split] });

    // A: 0–5 at 10 kg, then 60 fish = 6 kg for 5 days → 50 + 30 = 80.
    expect(biomassKgDays(input, "A", day(0), day(10))).toBeCloseTo(80);
    // B: 40 fish = 4 kg for 5 days → 20.
    expect(biomassKgDays(forB, "B", day(0), day(10))).toBeCloseTo(20);
  });

  it("is zero for an empty or inverted window", () => {
    const input = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 100 }, 0)],
    });
    expect(biomassKgDays(input, BATCH, day(5), day(5))).toBe(0);
    expect(biomassKgDays(input, BATCH, day(5), day(1))).toBe(0);
  });

  it("never goes negative when the ledger over-removes", () => {
    const input = timeline({
      movements: [movement({ movementType: "STOCKING", batchId: BATCH, fishCount: 10 }, 0)],
      mortality: [{ fishCount: 50, occurredAt: day(1) }],
    });
    // Day 0–1: 1 kg → 1. Day 1–2: count −40 clamped to 0 → 0.
    expect(biomassKgDays(input, BATCH, day(0), day(2))).toBeCloseTo(1);
  });
});

describe("batchCountDelta", () => {
  it("ignores stocking rows that belong to a different batch", () => {
    expect(batchCountDelta(movement({ movementType: "STOCKING", batchId: "other", fishCount: 9 }, 0), BATCH)).toBe(0);
  });

  it("gives a split recipient a positive delta and the source a negative one", () => {
    const split = movement(
      { movementType: "SPLIT", batchId: "A", fromBatchId: "A", toBatchId: "B", fishCount: 3 },
      0,
    );
    expect(batchCountDelta(split, "A")).toBe(-3);
    expect(batchCountDelta(split, "B")).toBe(3);
  });
});
