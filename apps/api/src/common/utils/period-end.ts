/**
 * A period's end, as the caller meant it. A date-only value ("2026-10-06", what a date input sends)
 * means the whole day, so it's taken to 23:59:59.999 UTC; a full timestamp is used as given. Without
 * this, the end day collapses to midnight and everything that happened later that day is dropped.
 */
export function parsePeriodEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}
