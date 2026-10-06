import { parsePeriodEnd } from "./period-end";

describe("parsePeriodEnd", () => {
  it("takes a date-only end to the last millisecond of that UTC day", () => {
    expect(parsePeriodEnd("2026-10-06").toISOString()).toBe("2026-10-06T23:59:59.999Z");
  });

  it("uses a full timestamp exactly as given", () => {
    expect(parsePeriodEnd("2026-10-06T12:30:00.000Z").toISOString()).toBe("2026-10-06T12:30:00.000Z");
  });
});
