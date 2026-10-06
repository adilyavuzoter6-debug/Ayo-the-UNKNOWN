import { pendingOccurrences } from "./recurring-schedule";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const months = (list: { month: string }[]) => list.map((o) => o.month);

describe("pendingOccurrences", () => {
  it("books each month from the start date's month, skipping occurrences before the start day", () => {
    // Start Aug 15, recurring on the 1st: August's 1st is before the start, so it's not booked.
    const pending = pendingOccurrences({
      startDate: utc("2026-08-15"),
      dayOfMonth: 1,
      generatedThrough: null,
      today: utc("2026-10-06"),
    });
    expect(months(pending)).toEqual(["2026-09", "2026-10"]);
    expect(pending[0]!.date.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("resumes after the last month already generated", () => {
    const pending = pendingOccurrences({
      startDate: utc("2026-01-01"),
      dayOfMonth: 1,
      generatedThrough: "2026-09",
      today: utc("2026-10-06"),
    });
    expect(months(pending)).toEqual(["2026-10"]);
  });

  it("does not book this month's occurrence until its day has arrived", () => {
    // Day 28 of October hasn't come yet on the 6th — only September's is due.
    const pending = pendingOccurrences({
      startDate: utc("2026-01-28"),
      dayOfMonth: 28,
      generatedThrough: null,
      today: utc("2026-10-06"),
    });
    expect(months(pending)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("clamps a 31st to the end of shorter months", () => {
    const pending = pendingOccurrences({
      startDate: utc("2026-01-31"),
      dayOfMonth: 31,
      generatedThrough: null,
      today: utc("2026-03-10"),
    });
    expect(pending.map((o) => o.date.toISOString().slice(0, 10))).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("rolls over the year boundary", () => {
    const pending = pendingOccurrences({
      startDate: utc("2026-01-01"),
      dayOfMonth: 1,
      generatedThrough: "2026-12",
      today: utc("2027-01-15"),
    });
    expect(months(pending)).toEqual(["2027-01"]);
  });

  it("returns nothing when the start date is still in the future", () => {
    const pending = pendingOccurrences({
      startDate: utc("2027-01-10"),
      dayOfMonth: 5,
      generatedThrough: null,
      today: utc("2026-10-06"),
    });
    expect(pending).toEqual([]);
  });
});
