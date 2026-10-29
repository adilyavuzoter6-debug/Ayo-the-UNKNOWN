/**
 * Flags batches whose feed conversion or mortality looks wrong, from data the app already records.
 * Deterministic and explainable on purpose (docs/architecture/12-mvp-roadmap.md §12.5: deterministic
 * first, ML later): every flag carries the numbers it was raised on, so a farm manager can check it.
 *
 * FCR is judged against the batch's own target when it has one, and otherwise against batches of the
 * same species in the company (median and MAD, so one wild batch can't drag the reference with it).
 * Mortality is judged against the batch's own recent past: the last 7 days against the 28 before.
 */

export type AnomalyKind = "FCR_HIGH" | "FCR_LOW" | "MORTALITY_RISK";
export type AnomalySeverity = "HIGH" | "MEDIUM" | "LOW";

export interface BatchAnomalyInput {
  batchId: string;
  speciesId: string;
  daysSinceStocking: number;
  liveCount: number;
  avgWeightG: number;
  initialCount: number;
  initialAvgWeightG: number;
  targetFcr: number | null;
  totalFeedKg: number;
  harvestedKg: number;
  deadKg: number;
  /** Fish lost in the last 7 days. */
  deaths7d: number;
  /** Fish lost in the 28 days before that (days 8–35). */
  deathsPrior28d: number;
  openWaterQualityAlerts: number;
  activeTreatments: number;
}

export interface Anomaly {
  batchId: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** The measured value: FCR, or the last 7 days' mortality as % of the stock. */
  value: number;
  /** What it was compared with: target/peer FCR, or the earlier weekly mortality %. */
  reference: number | null;
  reasons: string[];
}

/** Batches younger than this haven't grown enough for their FCR to mean anything. */
export const MIN_DAYS_FOR_FCR = 30;
/** Weight gain below this share of the stocked biomass makes FCR a ratio of noise. */
export const MIN_GAIN_SHARE_FOR_FCR = 0.1;
/** Peers needed before a species median is trusted. */
export const MIN_PEERS = 5;
/** Above the target FCR by this factor → flag; by HIGH_FACTOR → high severity. */
export const TARGET_FCR_FACTOR = 1.15;
export const TARGET_FCR_HIGH_FACTOR = 1.3;
/** Above the peer median by this factor (and a robust z-score over PEER_Z) → flag. */
export const PEER_FCR_FACTOR = 1.25;
export const PEER_FCR_HIGH_FACTOR = 1.5;
export const PEER_Z = 2.5;
/** Below this FCR the feeding records are almost certainly incomplete. */
export const IMPLAUSIBLY_LOW_FCR = 0.6;
/** Weekly mortality under this % is everyday loss, whatever the trend. */
export const MIN_WEEKLY_MORTALITY_PCT = 0.5;
/** The last week's rate must be this many times the earlier weekly rate. */
export const MORTALITY_RISE_FACTOR = 3;
/** Weekly mortality from which the risk is high on its own. */
export const HIGH_WEEKLY_MORTALITY_PCT = 2;

const fmt = (n: number, digits = 2) => n.toLocaleString("tr", { maximumFractionDigits: digits });

/**
 * Realized FCR since stocking: all feed given over all biomass produced, counting what left the
 * tank as harvest or deaths. Null when there isn't enough growth on record to divide by.
 */
export function realizedFcr(b: BatchAnomalyInput): number | null {
  if (b.daysSinceStocking < MIN_DAYS_FOR_FCR || b.totalFeedKg <= 0) return null;
  const initialKg = (b.initialCount * b.initialAvgWeightG) / 1000;
  const currentKg = (b.liveCount * b.avgWeightG) / 1000;
  const gainKg = currentKg + b.harvestedKg + b.deadKg - initialKg;
  if (gainKg <= 0 || gainKg < initialKg * MIN_GAIN_SHARE_FOR_FCR) return null;
  return b.totalFeedKg / gainKg;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface PeerReference {
  median: number;
  /** Median absolute deviation, scaled to be comparable with a standard deviation. */
  scaledMad: number;
  peers: number;
}

export function peerReferences(fcrBySpecies: Map<string, number[]>): Map<string, PeerReference> {
  const refs = new Map<string, PeerReference>();
  for (const [speciesId, values] of fcrBySpecies) {
    if (values.length < MIN_PEERS) continue;
    const m = median(values);
    const mad = median(values.map((v) => Math.abs(v - m)));
    refs.set(speciesId, { median: m, scaledMad: 1.4826 * mad, peers: values.length });
  }
  return refs;
}

function fcrAnomaly(b: BatchAnomalyInput, fcr: number, peer: PeerReference | undefined): Anomaly | null {
  if (fcr < IMPLAUSIBLY_LOW_FCR) {
    return {
      batchId: b.batchId,
      kind: "FCR_LOW",
      severity: "LOW",
      value: fcr,
      reference: peer?.median ?? b.targetFcr,
      reasons: [
        `FCR ${fmt(fcr)}: balığın verilen yemden fazla büyüdüğü görünüyor.`,
        "Yemleme kayıtları eksik ya da tartım hatalı olabilir.",
      ],
    };
  }

  if (b.targetFcr !== null && b.targetFcr > 0 && fcr > b.targetFcr * TARGET_FCR_FACTOR) {
    return {
      batchId: b.batchId,
      kind: "FCR_HIGH",
      severity: fcr > b.targetFcr * TARGET_FCR_HIGH_FACTOR ? "HIGH" : "MEDIUM",
      value: fcr,
      reference: b.targetFcr,
      reasons: [
        `FCR ${fmt(fcr)}, hedef ${fmt(b.targetFcr)} (%${fmt((fcr / b.targetFcr - 1) * 100, 0)} üzerinde).`,
      ],
    };
  }

  if (peer && fcr > peer.median * PEER_FCR_FACTOR) {
    const z = peer.scaledMad > 0 ? (fcr - peer.median) / peer.scaledMad : Infinity;
    if (z < PEER_Z) return null;
    return {
      batchId: b.batchId,
      kind: "FCR_HIGH",
      severity: fcr > peer.median * PEER_FCR_HIGH_FACTOR ? "HIGH" : "MEDIUM",
      value: fcr,
      reference: peer.median,
      reasons: [
        `FCR ${fmt(fcr)}, aynı türdeki ${peer.peers} partinin ortancası ${fmt(peer.median)} (%${fmt((fcr / peer.median - 1) * 100, 0)} üzerinde).`,
      ],
    };
  }
  return null;
}

function mortalityAnomaly(b: BatchAnomalyInput): Anomaly | null {
  if (b.deaths7d <= 0) return null;
  // Rates against the stock at the start of each window, so a die-off doesn't shrink its own base.
  const stockStart7d = b.liveCount + b.deaths7d;
  const weeklyPct = (b.deaths7d / stockStart7d) * 100;
  if (weeklyPct < MIN_WEEKLY_MORTALITY_PCT) return null;

  const stockStartPrior = stockStart7d + b.deathsPrior28d;
  const priorWeeklyPct = (b.deathsPrior28d / 4 / stockStartPrior) * 100;
  const rose = priorWeeklyPct === 0 || weeklyPct >= priorWeeklyPct * MORTALITY_RISE_FACTOR;
  const highOnItsOwn = weeklyPct >= HIGH_WEEKLY_MORTALITY_PCT;
  if (!rose && !highOnItsOwn) return null;

  const reasons = [
    priorWeeklyPct > 0
      ? `Son 7 günde ölüm %${fmt(weeklyPct)}; önceki 4 haftada haftalık ortalama %${fmt(priorWeeklyPct)}.`
      : `Son 7 günde ölüm %${fmt(weeklyPct)}; önceki 4 haftada ölüm kaydı yok.`,
  ];
  if (b.openWaterQualityAlerts > 0) reasons.push("Partinin bulunduğu tankta açık su kalitesi alarmı var.");
  if (b.activeTreatments > 0) reasons.push("Parti şu anda tedavi altında.");

  const aggravated = b.openWaterQualityAlerts > 0 || b.activeTreatments > 0;
  const severity: AnomalySeverity =
    highOnItsOwn || (rose && aggravated) ? "HIGH" : rose ? "MEDIUM" : "LOW";
  return {
    batchId: b.batchId,
    kind: "MORTALITY_RISK",
    severity,
    value: weeklyPct,
    reference: priorWeeklyPct,
    reasons,
  };
}

const SEVERITY_ORDER: Record<AnomalySeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function detectAnomalies(batches: BatchAnomalyInput[]): Anomaly[] {
  const fcrByBatch = new Map<string, number>();
  const fcrBySpecies = new Map<string, number[]>();
  for (const b of batches) {
    const fcr = realizedFcr(b);
    if (fcr === null) continue;
    fcrByBatch.set(b.batchId, fcr);
    // Implausibly low values are data gaps, not performance; keep them out of the reference.
    if (fcr >= IMPLAUSIBLY_LOW_FCR) {
      const list = fcrBySpecies.get(b.speciesId) ?? [];
      list.push(fcr);
      fcrBySpecies.set(b.speciesId, list);
    }
  }
  const refs = peerReferences(fcrBySpecies);

  const anomalies: Anomaly[] = [];
  for (const b of batches) {
    const fcr = fcrByBatch.get(b.batchId);
    if (fcr !== undefined) {
      const a = fcrAnomaly(b, fcr, refs.get(b.speciesId));
      if (a) anomalies.push(a);
    }
    const m = mortalityAnomaly(b);
    if (m) anomalies.push(m);
  }
  return anomalies.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
