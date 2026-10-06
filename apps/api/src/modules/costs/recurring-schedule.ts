/**
 * Calendar math for recurring costs, kept free of I/O so it can be unit-tested. Everything is UTC:
 * the stored startDate is a calendar date (no time), and a monthly occurrence is a calendar day.
 */

export interface PendingOccurrence {
  /** yyyy-mm of the month this occurrence belongs to. */
  month: string;
  /** The calendar day it's booked on (UTC midnight). */
  date: Date;
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(year, month, 1)); // month is 1-based here, so this is the month after
  return monthKey(next);
}

/**
 * The occurrences that are due and not yet written, oldest first. `dayOfMonth` is clamped to the
 * month's length (a "31" recurs on the 28th in February), the first occurrence is never before
 * `startDate`, and nothing after `today` is returned — a future month isn't a cost yet.
 */
export function pendingOccurrences(args: {
  startDate: Date;
  dayOfMonth: number;
  generatedThrough: string | null;
  today: Date;
}): PendingOccurrence[] {
  const { startDate, dayOfMonth, generatedThrough, today } = args;
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const startMs = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());

  const firstMonth = generatedThrough ? nextMonthKey(generatedThrough) : monthKey(startDate);
  const lastMonth = monthKey(today);

  const pending: PendingOccurrence[] = [];
  for (let month = firstMonth; month <= lastMonth; month = nextMonthKey(month)) {
    const [year, m] = month.split("-").map(Number) as [number, number];
    const lengthOfMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const date = new Date(Date.UTC(year, m - 1, Math.min(dayOfMonth, lengthOfMonth)));
    if (date.getTime() > todayMs) break;
    if (date.getTime() < startMs) continue;
    pending.push({ month, date });
  }
  return pending;
}
