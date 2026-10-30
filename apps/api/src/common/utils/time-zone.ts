/** Turkey's zone: where every customer so far farms, and what an unusable stored zone falls back to. */
export const DEFAULT_TIME_ZONE = "Europe/Istanbul";

/**
 * The stored IANA zone when it is one, else the default. Companies created before the zone was
 * validated can hold free text ("Fethıye"), and Intl throws on it, failing whatever reads dates.
 */
export function usableTimeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
