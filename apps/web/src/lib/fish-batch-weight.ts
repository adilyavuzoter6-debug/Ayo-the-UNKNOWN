import type { FishBatch } from "@/lib/types";

export function batchWeightLabel(batch: FishBatch): string {
  const grams = (value: string | number) =>
    `${Number(value).toLocaleString("tr", { maximumFractionDigits: 0 })} g`;
  const stocked = `giriş ${grams(batch.initialAvgWeightG)}`;
  return batch.currentState
    ? `${stocked} · şu an ${grams(batch.currentState.estimatedAvgWeightG)}`
    : stocked;
}
