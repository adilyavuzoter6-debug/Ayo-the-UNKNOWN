/**
 * The Excel template for importing a farm: an instructions tab, one tab per kind with the headers
 * the importer reads (structure first, then history), and the company's own codes and names to copy
 * from. Built in the browser like the exports (lib/excel.ts), so it always matches the importer. The
 * example version comes filled in with lib/import-example.ts.
 */

import { exampleRows, type ExampleCell } from "./import-example";

const SHEETS = [
  { name: "Çiftlikler", headers: ["Çiftlik adı", "Çiftlik kodu"] },
  { name: "Tanklar", headers: ["Çiftlik kodu", "Bölüm", "Tank kodu", "Tür", "Hacim (m³)", "Maks. biyokütle (kg)"] },
  {
    name: "Partiler",
    headers: ["Parti kodu", "Tür", "Çiftlik kodu", "Tank kodu", "Stoklama tarihi", "İlk adet", "İlk ortalama ağırlık (g)", "Hedef FCR", "Tedarikçi", "Not"],
  },
  { name: "Yemleme", headers: ["Tarih", "Çiftlik kodu", "Tank kodu", "Parti kodu", "Yem", "Miktar (kg)", "Birim fiyat (₺/kg)", "Not"] },
  { name: "Ölüm", headers: ["Tarih", "Çiftlik kodu", "Tank kodu", "Parti kodu", "Adet", "Sebep", "Not"] },
  { name: "Tartım", headers: ["Tarih", "Çiftlik kodu", "Tank kodu", "Parti kodu", "Örnek adedi", "Ortalama ağırlık (g)", "Not"] },
  {
    name: "Su kalitesi",
    headers: [
      "Tarih",
      "Saat",
      "Çiftlik kodu",
      "Tank kodu",
      "Sıcaklık (°C)",
      "Çözünmüş oksijen (mg/L)",
      "pH",
      "Amonyak (mg/L)",
      "Nitrit (mg/L)",
      "Nitrat (mg/L)",
      "Tuzluluk (ppt)",
      "Not",
    ],
  },
  {
    name: "Hasat",
    headers: [
      "Tarih",
      "Çiftlik kodu",
      "Tank kodu",
      "Parti kodu",
      "Adet",
      "Toplam ağırlık (kg)",
      "Ortalama ağırlık (g)",
      "Tam hasat",
      "Satış fiyatı (₺/kg)",
      "Müşteri",
      "Not",
    ],
  },
  {
    name: "Transfer",
    headers: ["Tarih", "Kaynak çiftlik kodu", "Kaynak tank kodu", "Parti kodu", "Hedef çiftlik kodu", "Hedef tank kodu", "Adet", "Not"],
  },
  {
    name: "Tedavi",
    headers: ["Başlangıç tarihi", "Bitiş tarihi", "Çiftlik kodu", "Tank kodu", "Parti kodu", "Tür", "Ürün", "Doz", "Arınma süresi (gün)", "Not"],
  },
];

const INSTRUCTIONS: [string, string][] = [
  ["Nasıl çalışır", "Her sekme bir kayıt türüdür. Kullanmadığınız sekmeleri boş bırakın. Yüklediğiniz dosya önce kontrol edilir ve hiçbir şey yazılmadan sorunlu satırları görürsünüz; hatalı satır kalmadan hiçbir kayıt yazılmaz."],
  ["Sıra", "Önce yapı (Çiftlikler, Tanklar, Partiler), sonra geçmiş kayıtlar. Aynı dosyada yeni açtığınız tank ve partilere kayıt girebilirsiniz. Uygulamada zaten olan çiftlik, tank ve parti kodları atlanır."],
  ["Çiftlikler", "Çiftlik kodu kısa olmalı (harf, rakam, - ve _; en fazla 20 karakter), ör. MRK. Planınızın çiftlik sayısı sınırı geçerlidir."],
  ["Tanklar", "Tür: Tank, Havuz, Kafes ya da Kanal (boşsa Tank). Bölüm boşsa çiftliğin tek bölümü kullanılır, yoksa 'Genel' adında açılır."],
  ["Partiler", "Partiyi stoklama tarihindeki İLK adet ve ağırlıkla girin; ölüm, hasat ve transferler içe aktarılınca güncel adet kendiliğinden hesaplanır. Tür, uygulamadaki balık türü adıyla aynı olmalı ('Kodlarınız' sekmesinde)."],
  ["Yem", "Yemler Stoklar sayfasında yem ürünü olarak tanımlı olmalı; adı uygulamadaki gibi yazın. Birim fiyat isteğe bağlı; girerseniz maliyet raporlarına yansır. İçe aktarılan yemlemeler bugünkü yem stoğunuzu değiştirmez."],
  ["Hasat", "Adet zorunlu. Toplam ağırlık ya da ortalama ağırlık girin; ikisi de boşsa o tarihteki son tartım kullanılır. Tam hasat: Evet/Hayır. Satış fiyatı TL/kg."],
  ["Transfer", "Balığı kaynak tanktan hedef tanka taşır; parti kodu, kaynak tankta tek parti varsa boş bırakılabilir."],
  ["Tedavi", "Tür: İlaç ya da Aşı (boşsa İlaç). Ürün zorunlu; arınma süresi gün olarak."],
  ["Tarih", "15.03.2026 biçiminde yazın; Excel tarih hücresi de olur. Gelecek tarih ve partinin stoklama tarihinden önceki tarih kabul edilmez. Saat yalnızca Su kalitesi sekmesinde: 08:30."],
  ["Kodlar", "Tank kodu zorunlu. Çiftlik kodu, aynı tank kodu birden fazla çiftlikte varsa gerekir. Parti kodu, tankta şu an tek parti varsa boş bırakılabilir."],
  ["Sayılar", "Ondalık için virgül kullanabilirsiniz: 12,5. Binlik ayırıcı olarak nokta: 1.250."],
  ["Ölüm sebebi", "İsteğe bağlı: Bilinmiyor, Hastalık, Oksijen yetersizliği, Sıcaklık, Transfer stresi, Fiziksel hasar, Yırtıcı, Yemle ilişkili, Diğer."],
  ["Geçmiş", "Geçmiş kayıtlar uyarı ya da e-posta oluşturmaz. Aynı dosyayı ikinci kez yüklemek kayıtları çoğaltmaz."],
  ["Geri alma", "Bir içe aktarımı Ayarlar → Veri aktarma sayfasından tek seferde geri alabilirsiniz; oluşturduğu çiftlik, tank ve partiler de silinir."],
];

export interface TemplateCodes {
  tanks: { farmName: string; farmCode: string; tankCode: string }[];
  feeds: string[];
  species: string[];
}

const EXAMPLE_NOTE =
  "ÖRNEK DOSYA: Rakamlar, 6 aylık uydurma bir alabalık tesisine aittir ve nasıl doldurulacağını göstermek içindir. Kendi verilerinizle değiştirip yükleyin; yüklerseniz 'Örnek Alabalık Tesisi' oluşur ve Veri aktarma sayfasından geri alabilirsiniz. Yem adları, uygulamanızdaki yem ürünleriyle aynı olmalı.";

/** The workbook's tabs, ready for write-excel-file: empty tabs, or with `example`, filled in. */
export function importWorkbook(codes: TemplateCodes, example: boolean) {
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const text = (value: string | undefined) => (value ? { value, type: String, wrap: true } : null);
  const cell = (value: ExampleCell) =>
    value === null
      ? null
      : value instanceof Date
        ? { value, type: Date, format: "dd.mm.yyyy" }
        : typeof value === "number"
          ? { value, type: Number }
          : { value, type: String };
  const filled = example ? exampleRows() : {};
  const rows = Math.max(codes.tanks.length, codes.feeds.length, codes.species.length);

  return [
    {
      sheet: "Nasıl doldurulur",
      columns: [{ width: 16 }, { width: 110 }],
      data: [
        [bold(example ? "Piscatio · içe aktarma şablonu (örnek dolu)" : "Piscatio · çiftlik ve geçmiş kayıtları içe aktarma şablonu"), null],
        ...(example ? [[bold("Örnek"), text(EXAMPLE_NOTE)]] : []),
        [null, null],
        ...INSTRUCTIONS.map(([title, body]) => [bold(title), text(body)]),
      ],
    },
    ...SHEETS.map((sheet) => ({
      sheet: sheet.name,
      stickyRowsCount: 1,
      columns: sheet.headers.map((h) => ({ width: Math.max(12, h.length + 4) })),
      data: [sheet.headers.map((h) => ({ ...bold(h), wrap: true })), ...(filled[sheet.name] ?? []).map((row) => row.map(cell))],
    })),
    {
      sheet: "Kodlarınız",
      columns: [{ width: 24 }, { width: 14 }, { width: 12 }, { width: 4 }, { width: 28 }, { width: 4 }, { width: 28 }],
      data: [
        [bold("Çiftlik"), bold("Çiftlik kodu"), bold("Tank kodu"), null, bold("Yem ürünleri"), null, bold("Balık türleri")],
        ...Array.from({ length: rows }, (_, i) => {
          const tank = codes.tanks[i];
          return [text(tank?.farmName), text(tank?.farmCode), text(tank?.tankCode), null, text(codes.feeds[i]), null, text(codes.species[i])];
        }),
      ],
    },
  ];
}

export async function downloadImportTemplate(codes: TemplateCodes, { example = false } = {}): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(importWorkbook(codes, example), { fontFamily: "Calibri", fontSize: 11 }).toFile(
    example ? "Piscatio-ornek-dolu-sablon.xlsx" : "Piscatio-ice-aktarma-sablonu.xlsx",
  );
}
