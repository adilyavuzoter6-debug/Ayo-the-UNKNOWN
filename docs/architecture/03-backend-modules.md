# 03. Backend Modül Mimarisi (NestJS)

## 3.1 İlke

Her modül sınırlı bir bağlamdır (bounded context): kendi controller'ları, servisleri ve Prisma
repository erişimi vardır. Modüller arası okumalar, başka bir modülün Prisma tablolarına doğrudan
erişim yerine her zaman o modülün export ettiği servisten geçer (böylece yetkilendirme ve iş
kuralları merkezi kalır). Bu, her modülün `*.module.ts` dosyasının yalnızca servis sınıflarını
(repository'leri değil) export etmesiyle uygulanır.

## 3.2 Modül Listesi ve Sorumlulukları

| Modül | Sorumluluk | Bağımlı olduğu |
|---|---|---|
| `auth` | JWT doğrulama (Clerk), session bağlam çözümü, guard'lar | `users`, `companies` |
| `companies` | Şirket (kiracı) CRUD, abonelik/plan durumu, kiracı ayarları | — |
| `users` | Kullanıcı profilleri, şirket üyeliği, rol ataması | `companies`, `auth` |
| `farms` | Çiftlik CRUD, saat dilimi, coğrafi konum | `companies` |
| `farm-sections` | Çiftlik alt bölümü (site/bölüm) CRUD | `farms` |
| `tanks` | Havuz/gölet/kafes CRUD, kapasite, QR kimliği | `farm-sections` |
| `fish-species` | Tür/soy referans verisi (global + şirkete özel) | — |
| `fish-batches` | Batch kimliği, yaşam döngüsü durumu, mevcut toplu (türetilmiş) durum | `fish-species`, `tanks`, `batch-movements` |
| `batch-movements` | **Değişmez hareket ledger'ı** — stoklama, transfer, split, merge | `fish-batches`, `tanks` |
| `feeding` | Yemleme operasyonel olayları | `fish-batches`, `feed-inventory` |
| `feed-products` | Yem ürün kataloğu (üretici, formül, boyut) | `companies` |
| `feed-inventory` | **Stok ledger'ı** — satın alma, tüketim, transfer, düzeltme | `feed-products`, `farms` |
| `mortality` | Mortalite operasyonel olayları + neden taksonomisi | `fish-batches`, `tanks` |
| `weight-sampling` | Ham örnek yakalama (bireysel/toplu), örnek istatistikleri | `fish-batches` |
| `biomass` | Biomass hesaplama motoru + tarihsel snapshot'lar | `fish-batches`, `batch-movements`, `mortality`, `weight-sampling`, `harvest` |
| `water-quality` | Elle + (gelecekte) sensör beslemeli su parametresi okumaları | `tanks` |
| `treatments` | Tedavi/aşılama kayıtları, arınma (withdrawal) süreleri | `fish-batches` |
| `harvest` | Planlanan/gerçekleşen, kısmi/tam harvest kayıtları | `fish-batches`, `batch-movements`, `biomass` |
| `harvest-planning` | İleriye dönük planlama, hedef-pencere planlaması | `harvest`, `biomass`, `forecasting` |
| `cost-accounting` | Maliyet girişi, çiftlik/havuz/batch/döngüye tahsis, cost/kg | `feed-inventory`, `harvest`, `biomass` |
| `alerts` | Kural değerlendirme motoru, alert yaşam döngüsü (tespit/çözüm) | çoğu modülden servis çağrısıyla okur; kendi operasyonel verisine sahip değildir |
| `reports` | Rapor sorgu/aggregate endpoint'leri (çoğunlukla okuma, cache destekli) | çoğu modülden okur |
| `audit` | Tüm mutasyon yapan modüllerin kullandığı merkezi audit log yazma/sorgulama API'si | — (temel, herkes bağımlı) |
| `notifications` | Teslimat soyutlaması (şimdilik in-app; sonra push/e-posta/SMS/WhatsApp) | `alerts`, `users` |
| `forecasting` | Deterministik büyüme/harvest tahmin modelleri | `biomass`, `weight-sampling`, `water-quality` |
| `calculations` (dahili, bir Nest modülü değil) | `packages/calculations`'tan saf hesaplama fonksiyonları, `biomass`, `cost-accounting`, `forecasting` tarafından import edilir | — |
| `files` | S3-uyumlu nesne depolama metadata'sı + imzalı URL üretimi | `companies` |
| `qr` | Havuz/depo/batch/ürün için QR payload üretimi/çözümü | `tanks`, `feed-inventory`, `fish-batches` |

`audit` bilinçli olarak temeldir: durum değiştiren her modül, kendi transaction'ının bir parçası
olarak `AuditService.record(...)`'u çağırır, her modülün audit yazımını yeniden icat etmesi yerine.
Bu, §21'in gerekliliğini ("baştan itibaren audit logging") özellik başına unutulabilecek bir
kontrol listesi maddesi değil, yapısal bir gerçeklik haline getirir.

## 3.3 Bağımlılık Yönü

```
companies ← farms ← farm-sections ← tanks
fish-species ← fish-batches ← batch-movements
tanks + fish-batches → {feeding, mortality, weight-sampling, water-quality, treatments, harvest}
feed-products ← feed-inventory ← feeding
{batch-movements, mortality, weight-sampling, harvest} → biomass
{feed-inventory, harvest, biomass} → cost-accounting
biomass + weight-sampling + water-quality → forecasting
harvest + biomass + forecasting → harvest-planning
(neredeyse her şey) → alerts → notifications
(her mutasyon yapan modül) → audit
```

Döngüsel modül bağımlılığına izin verilmez — CI'da `madge`/dependency-cruiser ile uygulanır. İki
modül birbirine ihtiyaç duyuyor gibi görünüyorsa, paylaşılan kavram kendi modülüne çıkarılır (bu
yüzden `batch-movements`, `fish-batches`'ten ayrıdır ve `biomass`, `fish-batches`'in bir metodu
değil ayrı bir modüldür — biomass, movements, mortality ve sampling'e bağımlıdır, bunların hepsi
aksi halde `fish-batches`'e geri dönen bir döngü yaratırdı).

## 3.4 Neden Katmanlı (MVC-tarzı) Mimari Yerine Domain-Driven Modüller

**Ne seçildi:** (yukarıdaki gibi) yatay katmanlar (üst düzeyde `controllers/`, `services/`,
`models/`) yerine dikey, sınırlı-bağlam modülleri.

**Neden:** Domain, aralarında gerçek bağımlılık yapısı olan ~25 farklı kavrama sahip (§6). Katmanlı
bir mimari dosya sayısını ölçeklendirir ama *anlaşılırlığı* ölçeklendirmez — "harvest ile ilgili
her şeyi" bulmak, 25 kardeşin arasına dağılmış `controllers/harvest.controller.ts`,
`services/harvest.service.ts` vb. arasında avlanmak demek olurdu. Domain modülleri, her sınırlı
bağlamın controller'ını, servisini, DTO'larını ve testlerini bir arada tutar ve doğrudan yukarıdaki
modül tablosuna, o da zaten tüm ekibin (bu dökümanı inceleyen mühendis olmayanlar dahil) zaten
düşündüğü domain sözlüğüne karşılık gelir.

**Değerlendirilen alternatifler:** Modül başına tam hexagonal/ports-and-adapters mimarisi (her Nest
modülü içinde açık `domain/`, `application/`, `infrastructure/` alt katmanları) — MVP ekip boyutu
için muhtemelen aşırı mühendislik; belirli bir modül (en olası aday `biomass` veya `forecasting`,
birden fazla hesaplama metodolojisi göz önüne alındığında §11-§12) yeterince karmaşık hale
gelirse modül bazında yeniden değerlendirilir. Şimdilik modül başına daha basit bir
`controller → service → Prisma repository` yapısını kabul ediyoruz; `biomass`/`forecasting`/
`cost-accounting`'in ileride dahili olarak bir strategy-pattern katmanı sunabileceğine dair açık
bir mimari izin ile (bkz. [10](10-biological-calculations.md)) — bu, kod tabanı çapında bir yeniden
yapılandırma anlamına gelmeyecek.

**Kabul edilen tradeoff'lar:** Bazı modüller ince (`fish-species`) bazıları kalındır
(`fish-batches`, `biomass`). Yapay bir simetri zorlamak yerine, gerçek domain karmaşıklığının bir
yansıması olarak eşit olmayan modül boyutunu kabul ediyoruz.
