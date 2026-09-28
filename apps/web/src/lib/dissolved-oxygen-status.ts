/**
 * Turns a dissolved-oxygen reading into a verdict a farm worker can act on.
 *
 * Thresholds follow the salmonid husbandry literature rather than a single mg/L cutoff, because
 * the same mg/L means very different things at different temperatures:
 *   - 80-100% saturation is the band recommended for maximum growth and feed conversion;
 *   - below ~80% comes reduced growth, poorer wound healing and higher disease susceptibility;
 *   - by ~5 mg/L trout are stressed outright, and ~3 mg/L is lethal.
 *
 * So saturation drives the verdict when it is available, with the absolute mg/L value able to
 * escalate it — a pond can sit at a respectable saturation percentage in very warm water and
 * still not hold enough actual oxygen.
 */
export type DoStatus = "good" | "low" | "critical";

const GOOD_SATURATION_PCT = 80;
const CRITICAL_SATURATION_PCT = 60;
const STRESS_MG_L = 5;
const LETHAL_MG_L = 3;

export interface DoVerdict {
  status: DoStatus;
  label: string;
  /** Tailwind text colour class matching the app's semantic tokens. */
  className: string;
}

const VERDICTS: Record<DoStatus, Omit<DoVerdict, "status">> = {
  good: { label: "Yeterli", className: "text-success" },
  low: { label: "Düşük — büyüme yavaşlar", className: "text-warning" },
  critical: { label: "Kritik", className: "text-destructive" },
};

export function assessDissolvedOxygen(
  saturationPct: number | null,
  mgPerL: number | null,
): DoVerdict | null {
  if (saturationPct === null && mgPerL === null) return null;

  let status: DoStatus = "good";

  if (saturationPct !== null) {
    if (saturationPct < CRITICAL_SATURATION_PCT) status = "critical";
    else if (saturationPct < GOOD_SATURATION_PCT) status = "low";
  }

  // The absolute concentration can only make the verdict worse, never better.
  if (mgPerL !== null) {
    if (mgPerL < LETHAL_MG_L) status = "critical";
    else if (mgPerL < STRESS_MG_L && status === "good") status = "low";
  }

  return { status, ...VERDICTS[status] };
}
