import { normalize, readDate, readImportWorkbook, readNumber } from "./import-sheets";

describe("import sheets", () => {
  it("normalizes names the way farms type them", () => {
    expect(normalize("Miktar (kg)")).toBe("miktarkg");
    expect(normalize("ÖLÜM")).toBe("olum");
    expect(normalize("Sıcaklık (°C)")).toBe("sicaklikc");
    expect(normalize("TARTIM")).toBe("tartim");
  });

  it("reads Turkish and plain numbers, and refuses what isn't one", () => {
    expect(readNumber("1.250,5")).toBe(1250.5);
    expect(readNumber("12,5")).toBe(12.5);
    expect(readNumber("1.250")).toBe(1250);
    expect(readNumber("12.5")).toBe(12.5);
    expect(readNumber("1 250")).toBe(1250);
    expect(readNumber(42)).toBe(42);
    expect(readNumber("on iki")).toBeNull();
  });

  it("reads dates as Excel dates, serial numbers and written dates", () => {
    expect(readDate(new Date("2026-03-15T00:00:00Z"))).toEqual({ year: 2026, month: 3, day: 15 });
    expect(readDate(46096)).toEqual({ year: 2026, month: 3, day: 15 });
    expect(readDate("15.03.2026")).toEqual({ year: 2026, month: 3, day: 15 });
    expect(readDate("2026-03-15")).toEqual({ year: 2026, month: 3, day: 15 });
    expect(readDate("15.03.2026 08:30")).toEqual({ year: 2026, month: 3, day: 15, hour: 8, minute: 30 });
    expect(readDate("31.02.2026")).toBeNull();
    expect(readDate("dün")).toBeNull();
  });

  it("reads each kind from its sheet, whatever the case or column order, and reports rows it can't read", () => {
    const result = readImportWorkbook([
      { sheet: "Nasıl doldurulur", data: [["Açıklama"]] },
      { sheet: "Eski notlar", data: [["Bir şey"]] },
      {
        sheet: "YEMLEME",
        data: [
          ["Tank Kodu", "TARİH", "Yem", "Miktar (kg)", "Parti kodu"],
          ["K-01", "01.05.2026", "Alabalık 3 mm", "25,5", "KZY-01"],
          [null, null, null, null, null],
          ["K-02", "dün", "Alabalık 3 mm", "-4", null],
        ],
      },
      {
        sheet: "Ölüm",
        data: [
          ["Tarih", "Tank kodu", "Adet", "Sebep"],
          [new Date("2026-05-02T00:00:00Z"), "K-01", 12, "Oksijen yetersizliği"],
          [new Date("2026-05-03T00:00:00Z"), "K-01", 3, "uzaylılar"],
        ],
      },
      { sheet: "Tartım", data: [["Tarih", "Tank kodu", "Ortalama ağırlık (g)"]] },
      {
        sheet: "Su kalitesi",
        data: [
          ["Tarih", "Saat", "Tank kodu", "Sıcaklık (°C)", "Çözünmüş oksijen (mg/L)", "pH"],
          ["04.05.2026", "08:30", "K-01", "14,2", 8.1, null],
          ["04.05.2026", null, "K-01", 120, null, null],
          ["04.05.2026", null, "K-01", null, null, null],
        ],
      },
    ]);

    expect(result.ignoredSheets).toEqual(["Eski notlar"]);
    expect(result.rows).toEqual([
      expect.objectContaining({ kind: "feeding", row: 2, tankCode: "K-01", lotCode: "KZY-01", feedName: "Alabalık 3 mm", quantityKg: 25.5 }),
      expect.objectContaining({ kind: "mortality", row: 2, fishCount: 12, reason: "OXYGEN" }),
      expect.objectContaining({
        kind: "water",
        row: 2,
        date: { year: 2026, month: 5, day: 4, hour: 8, minute: 30 },
        metrics: { temperatureC: 14.2, dissolvedOxygenMgL: 8.1 },
      }),
    ]);
    const errors = result.errors.map((e) => `${e.sheet}:${e.row} ${e.message}`);
    expect(errors).toEqual([
      expect.stringMatching(/^YEMLEME:4 "Tarih" okunamadı.*"Miktar \(kg\)" 0'dan büyük/),
      expect.stringMatching(/^Ölüm:3 "Sebep" tanınmadı/),
      expect.stringMatching(/^Tartım:1 Başlık satırında "Örnek adedi" sütunu bulunamadı/),
      expect.stringMatching(/^Su kalitesi:3 "Sıcaklık \(°C\)" -2–40 aralığında/),
      expect.stringMatching(/^Su kalitesi:4 En az bir ölçüm/),
    ]);
  });
});
