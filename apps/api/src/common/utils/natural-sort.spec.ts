import { naturalSortByCode } from "./natural-sort";

describe("naturalSortByCode", () => {
  it("orders embedded numbers by value, not lexicographically", () => {
    const items = ["A1", "A10", "A2", "A3", "A9"].map((code) => ({ code }));
    expect(naturalSortByCode(items).map((i) => i.code)).toEqual(["A1", "A2", "A3", "A9", "A10"]);
  });

  it("is stable for already-sorted input and does not mutate the original array", () => {
    const items = ["A1", "A2", "A3"].map((code) => ({ code }));
    const sorted = naturalSortByCode(items);
    expect(sorted).not.toBe(items);
    expect(sorted.map((i) => i.code)).toEqual(["A1", "A2", "A3"]);
  });

  it("falls back to alphabetical order when there are no embedded numbers", () => {
    const items = ["Kafes B", "Kafes A", "Kafes C"].map((code) => ({ code }));
    expect(naturalSortByCode(items).map((i) => i.code)).toEqual(["Kafes A", "Kafes B", "Kafes C"]);
  });

  it("handles mixed prefixes without crossing groups out of numeric order", () => {
    const items = ["B2", "A10", "B10", "A2"].map((code) => ({ code }));
    expect(naturalSortByCode(items).map((i) => i.code)).toEqual(["A2", "A10", "B2", "B10"]);
  });
});
