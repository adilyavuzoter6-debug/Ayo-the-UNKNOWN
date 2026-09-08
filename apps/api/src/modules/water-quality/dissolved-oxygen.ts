/**
 * Weiss (1970) equation for oxygen solubility in water — the standard used across
 * limnology/oceanography and most water-quality instruments (Deep-Sea Research 17, 721-735).
 * Returns the equilibrium DO concentration (mg/L) at 1 atm for a given temperature/salinity, so
 * a measured reading can be expressed as % saturation — the number aquaculture welfare
 * literature actually sets thresholds against (~80% saturation = impaired growth/appetite,
 * ~40% = mortality onset), not raw mg/L, which means different things at different temperatures.
 *
 * No barometric-pressure correction is applied (no altitude/pressure data is collected), which
 * is the same simplification most field DO meters make at typical low-altitude fish farm sites.
 */
const WEISS_A = [-173.4292, 249.6339, 143.3483, -21.8492] as const;
const WEISS_B = [-0.033096, 0.014259, -0.0017] as const;
const ML_PER_L_TO_MG_PER_L = 1.42905;

function equilibriumDoMgL(temperatureC: number, salinityPpt: number): number {
  const tKelvin = temperatureC + 273.15;
  const [a1, a2, a3, a4] = WEISS_A;
  const [b1, b2, b3] = WEISS_B;
  const lnC =
    a1 +
    a2 * (100 / tKelvin) +
    a3 * Math.log(tKelvin / 100) +
    a4 * (tKelvin / 100) +
    salinityPpt * (b1 + b2 * (tKelvin / 100) + b3 * (tKelvin / 100) ** 2);
  return Math.exp(lnC) * ML_PER_L_TO_MG_PER_L;
}

/** Null when temperature or DO isn't available on the reading — saturation needs both. */
export function calculateDoSaturationPct(
  temperatureC: number | null,
  dissolvedOxygenMgL: number | null,
  salinityPpt: number | null = 0,
): number | null {
  if (temperatureC === null || dissolvedOxygenMgL === null) return null;
  const equilibrium = equilibriumDoMgL(temperatureC, salinityPpt ?? 0);
  if (equilibrium <= 0) return null;
  return (dissolvedOxygenMgL / equilibrium) * 100;
}
