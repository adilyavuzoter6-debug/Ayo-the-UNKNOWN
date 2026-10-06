/**
 * Batch biomass over time, rebuilt from the ledger rather than from BiomassSnapshot — snapshots are
 * only written when someone presses "recalculate", so they can't say how many kg a batch had in
 * mid-period. The count rules mirror BatchProjectionService.recompute exactly (so this agrees with
 * the live count the rest of the app shows); weight is the most recent WeightSample at or before
 * each moment, falling back to the batch's initial stocking weight.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MovementRow {
  movementType: "STOCKING" | "TRANSFER" | "SPLIT" | "MERGE" | "HARVEST_REMOVAL" | "ADJUSTMENT";
  batchId: string;
  fromBatchId: string | null;
  toBatchId: string | null;
  fromTankId: string | null;
  toTankId: string | null;
  fishCount: number;
  occurredAt: Date;
}

export interface BatchTimelineInput {
  initialAvgWeightG: number;
  movements: MovementRow[];
  mortality: { fishCount: number; occurredAt: Date }[];
  weightSamples: { avgWeightG: number; occurredAt: Date }[];
}

/**
 * How one movement changes `batchId`'s live count at the batch level. Split/merge rows move fish
 * between batches, transfers net to zero, and only stocking/harvest change the total — the same
 * switch as BatchProjectionService so the two can never disagree.
 */
export function batchCountDelta(movement: MovementRow, batchId: string): number {
  if (movement.toBatchId === batchId && movement.toBatchId !== movement.fromBatchId) {
    return movement.fishCount;
  }
  if (movement.fromBatchId === batchId && movement.toBatchId && movement.toBatchId !== batchId) {
    return -movement.fishCount;
  }
  if (movement.batchId === batchId) {
    if (movement.movementType === "STOCKING") return movement.fishCount;
    if (movement.movementType === "HARVEST_REMOVAL") return -movement.fishCount;
  }
  return 0;
}

/**
 * Kilogram-days of live biomass inside [from, to]. Exact for the piecewise-constant model: between
 * two ledger events the count and weight don't change, so biomass × duration is exact per segment.
 */
export function biomassKgDays(input: BatchTimelineInput, batchId: string, from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;

  type Change = { at: number; countDelta?: number; weightG?: number };
  const changes: Change[] = [
    ...input.movements
      .map((m) => ({ at: m.occurredAt.getTime(), countDelta: batchCountDelta(m, batchId) }))
      .filter((c) => c.countDelta !== 0),
    ...input.mortality.map((m) => ({ at: m.occurredAt.getTime(), countDelta: -m.fishCount })),
    ...input.weightSamples.map((s) => ({ at: s.occurredAt.getTime(), weightG: s.avgWeightG })),
  ].sort((a, b) => a.at - b.at);

  let count = 0;
  let weightG = input.initialAvgWeightG;
  const kgNow = () => (Math.max(count, 0) * weightG) / 1000;

  // Bring the state up to `from` without integrating anything.
  let index = 0;
  for (; index < changes.length && changes[index]!.at <= from.getTime(); index++) {
    const c = changes[index]!;
    if (c.countDelta !== undefined) count += c.countDelta;
    if (c.weightG !== undefined) weightG = c.weightG;
  }

  let cursor = from.getTime();
  let kgDays = 0;
  for (; index < changes.length && changes[index]!.at < to.getTime(); index++) {
    const c = changes[index]!;
    kgDays += (kgNow() * (c.at - cursor)) / DAY_MS;
    cursor = c.at;
    if (c.countDelta !== undefined) count += c.countDelta;
    if (c.weightG !== undefined) weightG = c.weightG;
  }
  kgDays += (kgNow() * (to.getTime() - cursor)) / DAY_MS;
  return kgDays;
}
