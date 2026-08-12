# 13. Test Stratejisi

## 13.1 Katmanlar

**Ne seçildi:** Üç katman — unit, integration, end-to-end — her biri görev metninin §35'ine göre
farklı bir amaca sahip. Hiçbir katman diğerinin yerine geçmez: unit testler hesaplama
doğruluğunu izole olarak kanıtlar; integration testler API/DB/auth kablolamasının doğru olduğunu
kanıtlar; E2E gerçek bir kullanıcı iş akışının gerçek UI üzerinden çalıştığını kanıtlar.

## 13.2 Unit Testler

Hedef: `packages/calculations` ve herhangi bir saf domain mantığı (`packages/validation`
şemaları, DB'den izole `BatchLineageService` grafik-traversal mantığı).

Gerekli kapsam, her biri elle hesaplanmış fixture beklentileriyle (sadece snapshot testleri
değil):
- **FCR** — [10-biological-calculations.md](10-biological-calculations.md) §10.4'teki transfer/
  mortalite/kısmi-harvest-düzeltilmiş durumlar dahil, sadece naif formül değil. En azından: basit
  dönem FCR'si, dönem ortasında transfer-giriş ile FCR, dönem ortasında transfer-çıkış ile FCR,
  kısmi harvest ile FCR, önemli mortalite ile FCR.
- **SGR** — standart durum ve tek-günlük dönem edge case'i (`ln` tanım alanı hatalarına/bölme
  sorunlarına karşı koruma).
- **Biomass** — sayı × ağırlık temel durumu, eski-ağırlık-tahmini durumu, mortalite-sonrası
  yeniden hesaplama, split/merge-sonrası yeniden hesaplama.
- **Mortalite oranı** — basit oran, kayan baz-çizgi karşılaştırması (gelecekteki alert kuralına
  besler).
- **Yem stok ledger'ı bakiye türetimi** — işlem toplamı doğruluğu, karışık işaret tipleri dahil,
  sıfırdan-yeniden-inşa uzlaştırma job'ının artımlı projeksiyon güncellemeleriyle aynı sonucu
  üretmesi dahil (bu spesifik eşdeğerlik testi, projeksiyon desenini güvenilir kılan şeydir — bkz.
  [09](09-feed-inventory-ledger.md) §9.6).
- **Batch hareket ledger'ı transfer-miktarı doğrulaması** — bir havuzdan şu anda o havuzda tahsis
  edilenden fazla balık transfer edilemez, bir balık iki canlı havuz tahsisinde çift sayılamaz.
- **Harvest hesaplamaları** — kısmi harvest, batch'i kapatmadan canlı sayıyı doğru şekilde
  azaltır; tam harvest onu kapatır.

## 13.3 Integration Testler

Hedef: mocklanmış Prisma değil, gerçek bir (test-container) PostgreSQL instance'ına karşı NestJS
controller'ları — çünkü doğrulanan özellikler (transaction'lar, unique constraint'ler, FK
bütünlüğü, indeks-destekli sorgu doğruluğu) tam olarak mocklanmış bir ORM'in doğrulayamayacağı
şeylerdir.

Gerekli kapsam:
- Her mutasyon yapan endpoint, mutlu yol + validasyon-başarısızlığı yolu (DTO reddi → doğru hata
  zarfı, §11.3).
- Kimlik doğrulama: süresi dolmuş/geçersiz/eksik JWT → 401; geçerli JWT ama şirket üyeliği yok →
  403.
- **Yetkilendirme matrisi testleri** — yetki matrisinin
  ([07-roles-permissions-matrix.md](07-roles-permissions-matrix.md)) temsili bir alt kümesi için,
  her rolün endpoint başına beklenen izin/red aldığını doğrula. Uygulamanın kullandığı aynı
  `ROLE_PERMISSIONS` map'inden üretilmiş/parametrize edilmiş, böylece test paketi ve app
  sessizce birbirinden sapamaz.
- Ledger-yazımı transaction'lılığı: bir `FeedingEvent` oluşturmanın stok-düşürme yarısı (simüle
  edilmiş olarak) başarısız olursa, `FeedingEvent` satırının kendisi de geri alınır — kısmi yazım
  yok.

## 13.4 Kiracı İzolasyon Test Paketi (release gate)

Bu, açık talimat gereği sistemdeki en kritik otomatik test kategorisi olduğu için ayrıca
belirtilmiştir.

**Somut olarak neyi kanıtlaması gerekiyor:**
1. İki şirket tohumla (A, B), her biri bir çiftlik, havuz ve balık partisiyle.
2. Bir Şirket A kullanıcısı olarak kimlik doğrula.
3. Her kaynak tipi için (havuzlar, balık partileri, yemlemeler, mortaliteler, ağırlık örnekleri,
   su kalitesi okumaları, tedaviler, harvest'ler, maliyet girişleri, yem stok işlemleri, audit
   log'lar, dosyalar): URL'ye elle konulan **Şirket B'nin gerçek ID'si** kullanılarak `GET
   /api/v1/<resource>/:id` dene. Beklenen: kayıt değil, `404` — ve kaydın varlığını doğrulayacak
   bir `403` değil.
4. Uygulanabildiği yerde alt-kaynak aksiyonları için `PATCH`/`POST` ile tekrarla (örn. Şirket A
   olarak kimlik doğrulanmışken Şirket B'nin `tankId`'sine referans veren bir `BatchMovement`
   göndermeyi dene — beklenen: reddedilir, ve özellikle kiracı uyuşmazlığı için reddedilir,
   client bug'ıyla karıştırılabilecek şekilde sadece "havuz bulunamadı" değil).
5. **Liste** endpoint'leri için tekrarla — Şirket A'nın havuz listesi, filtre/sıralama
   manipülasyonu altında bile asla bir Şirket B havuzunu içermemeli.
6. **Aggregate/rapor endpoint'leri** için tekrarla — bir Şirket A dashboard özeti, boş-filtre veya
   `all` sözde-değeri gibi edge case'ler dahil, asla Şirket B rakamlarını içermemeli.
7. Bu paket, **kod tabanına eklenen her yeni endpoint'e karşı** çalışır — yeni controller
   route'larının kiracı-izolasyon parametrize test listesinde karşılık gelen bir girişi olması
   gerektiğini uygulayan bir CI kontrolüyle (OpenAPI route listesini testin kapsadığı-route'lar
   listesine karşı diff'leyen bir lint/CI script'i) uygulanır, böylece kiracı izolasyon kapsamı
   yeni özelliklerin gerisinde sessizce kalamaz.

**Neden bu sadece "var olan bir test paketi" değil bir release gate:** buradaki kaçırılmış tek bir
kontrol, kötüleşmiş bir özellik değil gerçek bir üretim müşteri-verisi ihlalidir. CI, bu paket
başarısız olursa main'e merge'i ve deploy'u engelleyecek şekilde yapılandırılmıştır, gerçek acil
durumlar için ayrılmış açık, loglanmış bir admin bypass dışında hiçbir override yolu olmadan.

## 13.5 End-to-End Testler (Playwright)

Hedef: gerçek web UI üzerinden kritik kullanıcı iş akışları (ve mobil kararlı hale geldiğinde,
mümkün olduğunca Expo için Detox veya Playwright-mobil-web eşdeğerleri — native E2E aracı kararı
mobil çıktığında ertelenmiştir).

MVP için gerekli kritik-yol kapsamı:
- Kayıt ol → şirket oluştur → arkadaş davet et → arkadaş kabul eder → rol doğru şekilde yansır.
- Çiftlik → bölüm → havuz oluştur → bir balık partisi stokla.
- Tam yemleme → stok düşüşü → UI'da görünür bakiye değişikliği.
- Mortalite girişi → batch detay sayfasında yansıyan biomass yeniden hesaplaması.
- Bir batch'i transfer et/split et → lineage görünümü doğru ağacı gösterir.
- Kısmi harvest → batch azaltılmış sayı ile aktif kalır; tam harvest → batch kapanır.
- `WORKER`-rolündeki bir kullanıcı maliyet/finansal ekranları göremez (backend yetki
  kontrollerinden yansıtılan UI-seviyesi uygulama — bu E2E test özellikle "backend izin verdi ama
  UI gizlemedi" ya da tersi sapmasını yakalamak için var).

## 13.6 Test Verisi & Ortamlar

- Integration/E2E testleri geçici, tohumlanmış veritabanlarına karşı çalışır (yerelde
  Testcontainers, CI çalıştırması başına özel geçici bir DB) — asla paylaşılan staging verisine
  karşı değil, testleri deterministik tutmak ve testlerin gerçek kiracı verisine dokunma
  riskini önlemek için.
- Bir tohumlama script'i (`packages/database` veya `apps/api/prisma/seed.ts`), integration
  testleri, E2E testleri ve yerel geliştirme tarafından yeniden kullanılan gerçekçi bir
  çok-şirketli, çok-çiftlikli fixture kümesi üretir — bir kez yazılır, diğer şema sapmasını
  yakalayan aynı CI typecheck ile şema değişiklikleriyle senkron tutulur.

## 13.7 CI'ın Her PR'da Uyguladığı

1. Tüm paketler genelinde typecheck (`tsc --noEmit`), strict mode (§34).
2. Modül-sınırı kuralı (§2.3) ve kiracı-kapsamlı-sorgu-yardımcısı kuralı (§6.2) dahil lint.
3. Unit testler (packages/calculations ve benzerleri) — geçmeli, `packages/calculations` için
   özellikle uygulanan kapsam eşiği (yüksek çıta, örn. ≥%90) doğruluğu finansal/operasyonel
   olarak kritik olduğundan.
4. Kiracı-izolasyon paketinin tamamı dahil integration testleri (§13.4) — istisnasız geçmeli.
5. Her PR'da hızlı bir E2E duman (smoke) paketi (§13.5'in hızlı bir alt kümesi); main'e
   merge/deploy-öncesi tam E2E paketi.
