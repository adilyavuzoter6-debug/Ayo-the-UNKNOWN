import type { BatchTankAllocation, Tank } from "@/lib/types";

/** A pond's live count and biomass, with the capacity and volume it was set up with. */
export interface TankLoad {
  count: number;
  biomassKg: number;
  maxBiomassKg: number | null;
  volumeM3: number | null;
}

/** Share of capacity at or above which a pond is treated as crowded. */
export const CROWDED_CAPACITY_RATIO = 0.8;

/** One pond's count and biomass. Biomass = count × current (or, if none, initial) average weight. */
export function tankLoad(tank: Tank, allocations: BatchTankAllocation[]): TankLoad {
  const count = allocations.reduce((sum, a) => sum + a.estimatedCount, 0);
  const biomassKg = allocations.reduce((sum, a) => {
    const avgWeightG = Number(a.batch.currentState?.estimatedAvgWeightG ?? a.batch.initialAvgWeightG);
    return sum + (a.estimatedCount * avgWeightG) / 1000;
  }, 0);
  return {
    count,
    biomassKg,
    maxBiomassKg: tank.maxBiomassKg ? Number(tank.maxBiomassKg) : null,
    volumeM3: tank.volumeM3 ? Number(tank.volumeM3) : null,
  };
}

export interface FarmProductionSummary {
  pondCount: number;
  stockedCount: number;
  emptyCount: number;
  liveFish: number;
  biomassKg: number;
  /** Biomass-weighted by fish count: the average weight of every live fish on the farm. Null when empty. */
  avgWeightG: number | null;
  /** Biomass over capacity, counting only ponds that have a capacity set. Null when none does. */
  capacityUsedPct: number | null;
  capacityKg: number;
  /** Capacity left in ponds that have one set; an empty pond counts its full capacity. */
  freeCapacityKg: number;
  pondsWithoutCapacity: number;
  crowdedCount: number;
  /** Biomass over volume, counting only ponds that have a volume set. Null when none does. */
  densityKgPerM3: number | null;
  volumeM3: number;
  pondsWithoutVolume: number;
  emptyVolumeM3: number;
}

export function summarizeFarmProduction(loads: TankLoad[]): FarmProductionSummary {
  const stocked = loads.filter((l) => l.count > 0);
  const liveFish = loads.reduce((sum, l) => sum + l.count, 0);
  const biomassKg = loads.reduce((sum, l) => sum + l.biomassKg, 0);

  const withCapacity = loads.filter((l): l is TankLoad & { maxBiomassKg: number } => l.maxBiomassKg !== null && l.maxBiomassKg > 0);
  const capacityKg = withCapacity.reduce((sum, l) => sum + l.maxBiomassKg, 0);
  const capacityBiomassKg = withCapacity.reduce((sum, l) => sum + l.biomassKg, 0);

  const withVolume = loads.filter((l): l is TankLoad & { volumeM3: number } => l.volumeM3 !== null && l.volumeM3 > 0);
  const volumeM3 = withVolume.reduce((sum, l) => sum + l.volumeM3, 0);
  const volumeBiomassKg = withVolume.reduce((sum, l) => sum + l.biomassKg, 0);

  return {
    pondCount: loads.length,
    stockedCount: stocked.length,
    emptyCount: loads.length - stocked.length,
    liveFish,
    biomassKg,
    avgWeightG: liveFish > 0 ? (biomassKg * 1000) / liveFish : null,
    capacityUsedPct: capacityKg > 0 ? (capacityBiomassKg / capacityKg) * 100 : null,
    capacityKg,
    freeCapacityKg: withCapacity.reduce((sum, l) => sum + Math.max(0, l.maxBiomassKg - l.biomassKg), 0),
    pondsWithoutCapacity: loads.length - withCapacity.length,
    crowdedCount: withCapacity.filter((l) => l.biomassKg / l.maxBiomassKg >= CROWDED_CAPACITY_RATIO).length,
    densityKgPerM3: volumeM3 > 0 ? volumeBiomassKg / volumeM3 : null,
    volumeM3,
    pondsWithoutVolume: loads.length - withVolume.length,
    emptyVolumeM3: withVolume.filter((l) => l.count === 0).reduce((sum, l) => sum + l.volumeM3, 0),
  };
}

export interface HarvestEtaEstimate {
  /** Stocked ponds with a weight to compare against the target. */
  pondsTracked: number;
  /** Of those, how many are already at or above the target. */
  pondsAtTarget: number;
  /** Average days for the ponds below target to reach it, at the given growth rate. Null when there is
   *  no growth rate, or every tracked pond is already at the target. */
  avgDays: number | null;
}

/**
 * How long the ponds below a target weight would take to reach it, assuming each grows at the given
 * specific growth rate (exponential, the same rule the cost-scenario engine uses): days =
 * ln(target / current) / (SGR / 100). One farm-wide rate stands in for each pond's own, since a
 * per-pond rate is not tracked here — a rough estimate, not a harvest plan.
 */
export function estimateDaysToTarget(
  loads: TankLoad[],
  targetWeightG: number,
  sgrPctPerDay: number | null,
): HarvestEtaEstimate {
  const stocked = loads.filter((l) => l.count > 0);
  const pondsAtTarget = stocked.filter((l) => (l.biomassKg * 1000) / l.count >= targetWeightG).length;
  const below = stocked.filter((l) => (l.biomassKg * 1000) / l.count < targetWeightG);

  if (sgrPctPerDay === null || sgrPctPerDay <= 0 || below.length === 0) {
    return { pondsTracked: stocked.length, pondsAtTarget, avgDays: null };
  }
  const days = below.map((l) => {
    const avgWeightG = (l.biomassKg * 1000) / l.count;
    return Math.log(targetWeightG / avgWeightG) / (sgrPctPerDay / 100);
  });
  return {
    pondsTracked: stocked.length,
    pondsAtTarget,
    avgDays: days.reduce((a, b) => a + b, 0) / days.length,
  };
}
