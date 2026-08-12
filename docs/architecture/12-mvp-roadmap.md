# 12. MVP Uygulama Yol Haritası

## 12.1 Sıralama İlkesi

**Ne seçildi:** Bağımlılık sırasına göre inşa et (modül bağımlılık grafiği,
[03-backend-modules.md](03-backend-modules.md) §3.3), "özellik önemine" göre değil — çünkü örn.
Feeding, Feed Inventory olmadan var olamaz, Biomass ise Batch Movements + Mortality + Weight
Sampling olmadan var olamaz. Aşağıdaki her milestone, dikey olarak dilimlenmiş, demo edilebilir
bir artıştır (backend modülü + minimal web UI + uygulanabildiği yerde minimal mobil UI), "önce
tüm backend, sonra tüm frontend" şeklinde yatay bir ayrım değil — bu, ledger-deseni disiplinini
(§8, §9) ucuz olduğu erken aşamada uçtan uca doğrulanmış tutar, API sözleşmelerine zaten
güvenilmeye başlandığı geç bir aşamada keşfedilmesi yerine.

## 12.2 MVP (görev metninin §41'ine göre)

**Milestone 0 — Temel (henüz kullanıcıya yönelik özellik yok)**
- Monorepo iskeleti, `packages/config`/`tsconfig`/`types`/`validation` iskeletleri
- `auth`, `companies`, `users`, `audit` modülleriyle NestJS app iskeleti
- Clerk entegrasyonu, `TenantContextInterceptor`, `RolesGuard`, `PermissionsGuard` (§6, §7)
- Kiracılık + çiftlik hiyerarşisi için Prisma şeması, ilk migration
- CI pipeline'ı: lint, typecheck, unit testler, modül-sınırı lint kuralı (§2.3)
- **Çıkış kriteri:** bir kullanıcı kayıt olabilir, bir şirket oluşturabilir, bir role sahip bir
  arkadaşını davet edebilir ve kiracılar-arası izolasyon test paketi (§13.4) bu iskelete karşı
  geçer.

**Milestone 1 — Çiftlik Yapısı**
- `farms`, `farm-sections`, `tanks` modülleri (tam CRUD, QR token üretimi)
- Web: çiftlik/bölüm/havuz yönetim ekranları
- **Çıkış kriteri:** bir şirket, gerçek çiftlik düzenini uçtan uca modelleyebilir.

**Milestone 2 — Balık Partileri & Hareket Ledger'ı**
- Tam olarak [08-fish-batch-lineage.md](08-fish-batch-lineage.md)'e göre `fish-species`,
  `fish-batches`, `batch-movements` modülleri — stoklama, transfer, split, merge, hepsi ledger
  yazımı olarak; `BatchCurrentState`/`BatchTankState` projeksiyonları + gece çalışan uzlaştırma
  job'ı
- Web: batch listesi/detayı, stoklama formu, transfer formu, lineage görünümü
- **Çıkış kriteri:** §5.3'teki tam işlenmiş örnek (50.000 stokla, 3 havuza split) tekrarlanabilir
  ve tam geçmişi sorgulanabilir.

**Milestone 3 — Yem Stoğu & Yemleme**
- [09-feed-inventory-ledger.md](09-feed-inventory-ledger.md)'e göre `feed-products`,
  `feed-inventory` (ledger + projeksiyonlar), `feeding` modülleri
- Mobil: ilk sürüm — QR tara → havuz ekranı → `FEED` aksiyonu (§22 iş akışı)
- **Çıkış kriteri:** bir havuzu yemlemek, doğru stok lotunu bir ledger işlemi ile doğru şekilde
  düşürür, hem web hem mobilde görünür.

**Milestone 4 — Mortalite, Örnekleme, Biomass**
- [10-biological-calculations.md](10-biological-calculations.md)'e göre `mortality`,
  `weight-sampling`, `biomass` modülleri
- Mobil: `MORTALITY`, `WEIGHT` aksiyonları
- Günlük biomass snapshot background job'ı (BullMQ)
- **Çıkış kriteri:** bir dizi mortalite/transfer/örnekleme olayından sonra herhangi bir batch
  için biomass doğru ve açıklanabilir (son örnek yaşını, sayı türetimini gösterir).

**Milestone 5 — FCR & SGR**
- FCR/SGR hesaplama servisleri (batch/havuz/dönem başına metodoloji `v1`)
- Web: batch performans grafikleri (Recharts)
- **Çıkış kriteri:** dönem ortasında bir transfer ve kısmi harvest içeren bir batch'in FCR'si
  doğru hesaplanır (elle hesaplanmış test fixture'larına karşı doğrulanmış, §13).

**Milestone 6 — Su Kalitesi (temel)**
- `water-quality` modülü, sadece elle giriş (sensör verisi Faz 2/3'e ertelendi)
- Mobil: `WATER` aksiyonu
- **Çıkış kriteri:** su okumaları kaydedilir ve havuz detay/geçmiş üzerinde görünür.

**Milestone 7 — Harvest**
- `harvest` modülü (planlanan + gerçek, kısmi + tam), `HARVEST_REMOVAL` hareketleri yazar
- Mobil: `HARVEST` aksiyonu (sadece kayıt)
- **Çıkış kriteri:** tam bir harvest, bir batch'in canlı sayımını doğru şekilde sıfırlar ve
  kapatır, tam soy ağacını sonraki sorgu için korurken.

**Milestone 8 — Dashboard'lar, Alert'ler, Audit UI**
- `reports` temel dashboard endpoint'leri (şirket/çiftlik özeti, havuz bazında mortalite, yem
  tüketimi)
- İlk kural kümesiyle `alerts` modülü: düşük yem stoğu, mortalite artışı, eksik günlük kayıtlar
- Web: audit log görüntüleyici (yetki-korumalı), alert merkezi
- **Çıkış kriteri:** 5 çekirdek KPI (§44: biomass, FCR, mortality, growth, harvest forecast —
  forecast'in kendisi Faz 2'dir, ama diğer 4'ü canlıdır) bir çiftlik dashboard'unda görünür ve en
  azından yukarıdaki 3 alert kuralı test senaryolarında doğru tetiklenir.

**MVP tanımı — tamamlandı:** görev metninin §41'indeki her şey canlıdır — Auth, Şirketler,
Kullanıcılar & yetkiler, Çiftlikler, Çiftlik bölümleri, Havuzlar, Balık partileri, Batch
hareketleri, Yemleme, Yem stoğu, Mortalite, Ağırlık örneklemesi, Biomass, FCR, SGR, Temel su
kalitesi, Harvest kayıtları, Temel dashboard'lar, Alert'ler, Audit log'lar — ve kiracı-izolasyon
ile ledger-bütünlüğü test paketleri yeşil ve release gate olarak ele alınıyor.

## 12.3 Faz 2 (§42'ye göre)

MVP gerçek çiftlik kullanımıyla üretimde olduktan sonra sıralanır, her biri MVP verisinin var
olmasına bağlı olduğundan kabaca şu sırada:
1. **Harvest planning** — plan yapmak için gerçek biomass/büyüme geçmişine ihtiyaç var
2. **Gelişmiş yem stoğu** — FIFO/lot maliyetlemesi, tedarikçi yönetimi entegrasyonu
3. **Üretim maliyeti/kg** — yem ledger'ı + işçilik/diğer maliyet girişi + harvest verisinin hepsi
   canlı olmalı
4. **Veteriner yönetimi** — genişletilmiş tedavi/aşılama iş akışları, arınma-süresi alert'leri
5. **Gelişmiş raporlama** — şirket içinde çiftlikler-arası benchmarking, dışa aktarılabilir
   raporlar
6. **Push bildirimleri** — mobilin zaten operasyonel olarak benimsenmiş olmasına bağlı
7. **QR iş akışları (genişletilmiş)** — sadece havuz QR'ı değil, depo/yem-ürünü QR'ı
8. **Offline mobil destek** — bkz. §24; çekirdek online mobil iş akışları kanıtlanana kadar
   ertelendi
9. **Benchmarking** — bir kritik kütle şirketin anonimleştirilmiş/toplanmış verisine ihtiyaç var

## 12.4 Faz 3 (§43'e göre)

AI Farm Assistant, gelişmiş harvest tahmini (ML), FCR anomali tespiti, mortalite risk tahmini,
yem optimizasyonu, IoT entegrasyonu (otomatik su kalitesi izleme), computer vision balık-boyu
tahmini, çiftlikler-arası benchmarking, üretim optimizasyonu. Faz 3'ün tamamı, kontrollü
analitik servis katmanı (§32,
[10-biological-calculations.md](10-biological-calculations.md) §10.7) ve MVP'de inşa edilen
event/ledger mimarisi üzerine oturur — MVP'nin Faz 3 özellikleri henüz inşa edilmemişken bile
temiz event modellemesine yatırım yapmasının *nedeni* budur: event-sourcing'i sonradan bir
ML/forecasting katmanının altına yerleştirmek, event-sourcing zaten var olan bir şeyin üzerine
inşa etmekten çok daha maliyetli olurdu.

## 12.5 MVP'de Bilinçli Olarak Yer Almayan (ve neden bu güvenli)

- **RLS etkinleştirme** — (§6.2) için tasarlanmış ama açık değil; uygulama-katmanı izolasyon,
  kapsamlı test edilmiş uygulanan kontroldür.
- **Tam offline mobil senkronizasyon** — mimari bunu engelleyen kararlardan kaçınır (yerel ID'ler,
  API'de zaten var olan idempotency anahtarları, §11.7) ama senkronizasyon motorunun kendisi
  Faz 2'dir.
- **ML tabanlı forecasting** — MVP sadece deterministik büyüme-eğrisi enterpolasyonu kullanır
  (görev metninin §19'u: "Önce deterministik büyüme modelleri uygula. Machine learning daha
  sonra eklenebilir.").
- **Yapılandırılabilir özel roller** — MVP'nin 9 sabit rolü için statik RBAC map'i (§7.4)
  yeterlidir.
