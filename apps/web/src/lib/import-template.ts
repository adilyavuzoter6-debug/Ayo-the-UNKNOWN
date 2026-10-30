/**
 * The Excel template for importing history: an instructions tab, one tab per record kind with the
 * headers the importer reads, and the company's own farm and tank codes and feed names to copy
 * from. Built in the browser like the exports (lib/excel.ts), so it always matches the importer.
 */

const SHEETS = [
  { name: "Yemleme", headers: ["Tarih", "Çiftlik kodu", "Tank kodu", "Parti kodu", "Yem", "Miktar (kg)", "Not"] },
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
];

const INSTRUCTIONS: [string, string][] = [
  ["Nasıl çalışır", "Her sekme bir kayıt türüdür: Yemleme, Ölüm, Tartım, Su kalitesi. Kullanmadığınız sekmeleri boş bırakın. Yüklediğiniz dosya önce kontrol edilir ve hiçbir şey yazılmadan sorunlu satırları görürsünüz."],
  ["Önce uygulamada", "Çiftliklerinizi, tanklarınızı ve partilerinizi oluşturun. Partiyi stoklama tarihindeki İLK adet ve ağırlıkla açın: geçmiş ölümler içe aktarılınca güncel adet kendiliğinden hesaplanır."],
  ["Yem", "Kullandığınız yemler Stoklar sayfasında yem ürünü olarak tanımlı olmalı; adı uygulamadaki gibi yazın (büyük/küçük harf fark etmez). İçe aktarılan yemlemeler bugünkü yem stoğunuzu değiştirmez."],
  ["Tarih", "15.03.2026 biçiminde yazın; Excel tarih hücresi de olur. Gelecek tarih ve partinin stoklama tarihinden önceki tarih kabul edilmez."],
  ["Saat", "Yalnızca Su kalitesi sekmesinde, isteğe bağlı: 08:30 gibi."],
  ["Tank kodu", "Zorunlu. Kodlarınız 'Kodlarınız' sekmesinde."],
  ["Çiftlik kodu", "Aynı tank kodu birden fazla çiftlikte varsa doldurun; yoksa boş bırakabilirsiniz."],
  ["Parti kodu", "Tankta şu an tek parti varsa boş bırakabilirsiniz. Tankta birden fazla parti olduysa ya da parti başka tanka taşındıysa doldurun."],
  ["Sayılar", "Ondalık için virgül kullanabilirsiniz: 12,5. Binlik ayırıcı olarak nokta: 1.250."],
  ["Ölüm sebebi", "İsteğe bağlı: Bilinmiyor, Hastalık, Oksijen yetersizliği, Sıcaklık, Transfer stresi, Fiziksel hasar, Yırtıcı, Yemle ilişkili, Diğer."],
  ["Su kalitesi", "Her satırda en az bir ölçüm olmalı. Geçmiş ölçümler uyarı ya da e-posta oluşturmaz."],
  ["Tekrar yükleme", "Aynı dosyayı ikinci kez yüklemek kayıtları çoğaltmaz: uygulamada zaten olan satırlar atlanır."],
  ["Geri alma", "Bir içe aktarımı Ayarlar → Veri aktarma sayfasından tek seferde geri alabilirsiniz."],
];

export async function downloadImportTemplate(codes: {
  tanks: { farmName: string; farmCode: string; tankCode: string }[];
  feeds: string[];
}): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const text = (value: string) => ({ value, type: String, wrap: true });
  const rows = Math.max(codes.tanks.length, codes.feeds.length);

  await writeXlsxFile(
    [
      {
        sheet: "Nasıl doldurulur",
        columns: [{ width: 18 }, { width: 100 }],
        data: [
          [bold("Piscatio · geçmiş kayıtları içe aktarma şablonu"), null],
          [null, null],
          ...INSTRUCTIONS.map(([title, body]) => [bold(title), text(body)]),
        ],
      },
      ...SHEETS.map((sheet) => ({
        sheet: sheet.name,
        stickyRowsCount: 1,
        columns: sheet.headers.map((h) => ({ width: Math.max(12, h.length + 4) })),
        data: [sheet.headers.map((h) => ({ ...bold(h), wrap: true }))],
      })),
      {
        sheet: "Kodlarınız",
        columns: [{ width: 24 }, { width: 14 }, { width: 12 }, { width: 4 }, { width: 28 }],
        data: [
          [bold("Çiftlik"), bold("Çiftlik kodu"), bold("Tank kodu"), null, bold("Yem ürünleri")],
          ...Array.from({ length: rows }, (_, i) => {
            const tank = codes.tanks[i];
            const feed = codes.feeds[i];
            return [
              tank ? text(tank.farmName) : null,
              tank ? text(tank.farmCode) : null,
              tank ? text(tank.tankCode) : null,
              null,
              feed ? text(feed) : null,
            ];
          }),
        ],
      },
    ],
    { fontFamily: "Calibri", fontSize: 11 },
  ).toFile("Piscatio-ice-aktarma-sablonu.xlsx");
}
