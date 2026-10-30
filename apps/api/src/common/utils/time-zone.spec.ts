import { usableTimeZone } from "./time-zone";

describe("usableTimeZone", () => {
  it("keeps a real zone and replaces free text or nothing with Turkey's", () => {
    expect(usableTimeZone("Europe/Oslo")).toBe("Europe/Oslo");
    expect(usableTimeZone("Fethıye")).toBe("Europe/Istanbul");
    expect(usableTimeZone(null)).toBe("Europe/Istanbul");
  });
});
