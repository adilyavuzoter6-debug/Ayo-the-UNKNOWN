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

  it("reads structure sheets and harvests, transfers and treatments, with their own words for types", () => {
    const result = readImportWorkbook([
      { sheet: "Çiftlikler", data: [["Çiftlik adı", "Çiftlik kodu"], ["Yeni Tesis", "YNI"]] },
      {
        sheet: "Tanklar",
        data: [
          ["Çiftlik kodu", "Bölüm", "Tank kodu", "Tür", "Hacim (m³)"],
          ["YNI", "Kuzey", "K-1", "Kafes", "1.200"],
          ["YNI", null, "K-2", "denizaltı", null],
        ],
      },
      {
        sheet: "Partiler",
        data: [
          ["Parti kodu", "Tür", "Tank kodu", "Stoklama tarihi", "İlk adet", "İlk ortalama ağırlık (g)"],
          ["YN-01", "Gökkuşağı alabalığı", "K-1", "01.04.2026", "10.000", "35,5"],
        ],
      },
      {
        sheet: "Hasat",
        data: [
          ["Tarih", "Tank kodu", "Adet", "Toplam ağırlık (kg)", "Tam hasat", "Satış fiyatı (₺/kg)"],
          ["10.09.2026", "K-1", 500, "160", "Evet", 145],
          ["11.09.2026", "K-1", 100, null, "belki", null],
        ],
      },
      { sheet: "Transfer", data: [["Tarih", "Kaynak tank kodu", "Hedef tank kodu", "Adet"], ["01.06.2026", "K-1", "K-2", 3000]] },
      {
        sheet: "Tedavi",
        data: [
          ["Başlangıç tarihi", "Tank kodu", "Tür", "Ürün", "Arınma süresi (gün)", "Bitiş tarihi"],
          ["05.07.2026", "K-2", "Aşı", "ERM aşısı", null, "06.07.2026"],
        ],
      },
      { sheet: "Yemleme", data: [["Tarih", "Tank kodu", "Yem", "Miktar (kg)", "Birim fiyat (₺/kg)"], ["02.04.2026", "K-1", "Alabalık 2 mm", 12, "38,5"]] },
    ]);

    expect(result.rows).toEqual([
      expect.objectContaining({ kind: "farm", farmCode: "YNI", farmName: "Yeni Tesis" }),
      expect.objectContaining({ kind: "tank", farmCode: "YNI", sectionName: "Kuzey", tankCode: "K-1", tankType: "CAGE", volumeM3: 1200 }),
      expect.objectContaining({ kind: "batch", lotCode: "YN-01", speciesName: "Gökkuşağı alabalığı", fishCount: 10000, avgWeightG: 35.5 }),
      expect.objectContaining({ kind: "harvest", fishCount: 500, biomassKg: 160, full: true, unitPriceTry: 145 }),
      expect.objectContaining({ kind: "transfer", tankCode: "K-1", toTankCode: "K-2", fishCount: 3000 }),
      expect.objectContaining({ kind: "treatment", treatmentType: "VACCINATION", productName: "ERM aşısı", endDate: { year: 2026, month: 7, day: 6 } }),
      expect.objectContaining({ kind: "feeding", quantityKg: 12, unitPriceTry: 38.5 }),
    ]);
    expect(result.errors.map((e) => `${e.sheet}:${e.row} ${e.message}`)).toEqual([
      expect.stringMatching(/^Tanklar:3 "Tür" tanınmadı; şunlardan biri olmalı: Tank, Havuz, Kafes, Kanal/),
      expect.stringMatching(/^Hasat:3 "Tam hasat" Evet ya da Hayır olmalı/),
    ]);
  });
});

