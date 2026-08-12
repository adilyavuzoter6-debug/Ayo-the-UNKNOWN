# 05. Varlık İlişki Haritası

## 5.1 Temel Hiyerarşi (kapsama)

```
Company (kiracı kökü)
 └─ CompanyMembership ──> User
 └─ Farm
     └─ FarmSection
         └─ Tank ── qrToken
 └─ FeedProduct (katalog)
 └─ Warehouse (Farm başına)
     └─ FeedInventoryBatch (teslim alım: tedarikçi lotu, maliyet, son kullanma tarihi)
         └─ FeedInventoryTransaction (ledger) ──> FeedInventoryBalance (türetilmiş)
 └─ FishSpecies (global veya şirkete özel)
 └─ FishBatch ── lotCode
     └─ BatchMovement (ledger: stoklama/transfer/split/merge/harvest-çıkarma)
         ↳ Havuz(lar) ↔ FishBatch(ler) arasında bağlantı kurar, batch split ve merge'lerinden
           doğan parent/child ilişkileri dahil
     └─ BatchCurrentState / BatchTankState (türetilmiş)
     └─ FeedingEvent ──> FeedInventoryTransaction (1:1, FEED_CONSUMPTION)
     └─ MortalityEvent
     └─ WeightSample
     └─ Treatment ──> FileAsset (veteriner belgeleri)
     └─ BiomassSnapshot
     └─ HarvestRecord ──> BatchMovement (HARVEST_REMOVAL)
     └─ CostEntry (Company/Farm/Tank/Batch seviyesinde tahsis edilir)
 └─ Tank
     └─ WaterQualityReading
 └─ Alert (uygun olduğunda Farm/Tank/Batch'e referans verir)
 └─ AuditLog (entityType/entityId üzerinden herhangi bir varlığa referans verir)
```

## 5.2 İlişki Notları

- **Company → Farm → FarmSection → Tank** katı bir kapsama zinciridir (her çocuğun tam olarak bir
  ebeveyni vardır), §4'ün belirttiği hiyerarşiyle örtüşür. `companyId`, her alt tabloya
  (sadece join ile türetilmiş değil) denormalize edilmiştir — özellikle kiracı-izolasyon
  sorgularını ve RLS politikalarını çok-adımlı bir join yerine tek-kolonlu bir kontrol yapmak
  için. Bu denormalizasyonun neden bilinçli bir güvenlik-performans tradeoff'u olduğu, bir gözden
  kaçma değil, [06-multi-tenant-security.md](06-multi-tenant-security.md) §6.3'te açıklanmıştır.
- **FishBatch ↔ Tank, zaman içinde çoktan-çoğa bir ilişkidir**, tamamen `BatchMovement` aracılığıyla
  yönetilir. Bir batch asla `FishBatch` üzerinde bir foreign key olarak bir havuzun "içinde"
  değildir — bu tam olarak §8'in yasakladığı anti-desen olurdu. `BatchTankState`, bir batch-havuz
  ilişkisinin doğrudan sorgulanabildiği tek yerdir ve türetilmiş bir cache'tir.
- **FishBatch ↔ FishBatch (soy ağacı/lineage)** — split ve merge işlemleri, bir batch'in birden
  fazla ebeveyn batch'e (merge) veya birden fazla çocuk batch'e (split) sahip olabileceği anlamına
  gelir. Bu, `FishBatch` üzerinde sabit-kardinaliteli bir parent/child FK yerine `BatchMovement`
  içinde kenarlar (`fromBatchId`/`toBatchId`) olarak modellenir, çünkü katı bir ağaç (tree)
  merge'leri (bir DAG gerektirir) temsil edemez. Tam traversal semantiği için bkz.
  [08-fish-batch-lineage.md](08-fish-batch-lineage.md).
- **FeedInventoryBatch vs FeedProduct** — `FeedProduct` katalog girişidir ("Skretting Nutra
  Olympic 6mm"); `FeedInventoryBatch` bu ürünün belirli bir fiziksel teslim alımıdır (bu ayki
  teslimat, kendi tedarikçi lotu/son kullanma tarihi/maliyeti ile). `FeedingEvent`, sadece bir
  `FeedProduct`'tan değil belirli bir `FeedInventoryBatch`'ten tüketir, böylece maliyet ve son
  kullanma tarihi takibi doğru kalır (FIFO/lot-özel maliyetleme ileride mümkün hale gelir).
- **CostEntry** dört opsiyonel kapsam seviyesine yayılır (`farmId`, `tankId`, `batchId`, artı
  örtük `companyId`) — biri gerektirmek yerine — bir işçilik maliyeti çiftlik-seviyesinde,
  bir yem maliyeti batch-seviyesinde olabilir. Aggregation sorguları hangi seviye doluysa ondan
  yukarı doğru toplanır.
- **AuditLog ve FileAsset, her varlık tipi için bir FK yerine polimorfik referanslar** (`entityType`
  + `entityId`) kullanır, çünkü neredeyse sistemdeki her tabloya bağlanırlar — her varlık tipi için
  tipli bir FK, her iki tabloda da 25+ nullable FK kolonu anlamına gelirdi. Bu, şemadaki katı
  referans bütünlüğünden bilinçli olarak tek sapmadır; kabul edilebilir bir tradeoff'tur çünkü her
  iki tablo da append-only/denetim amaçlıdır, operasyonel hesaplamaları yönlendiren tablolar değil.

## 5.3 Diyagram — Balık Partisi Soy Ağacı Örneği (görev metninin kendi örneğinden)

```
LOT-125 partisi Havuz A12'ye stoklandı (50.000 balık)              [BatchMovement: STOCKING]
                    │
                    ▼
        Transfer / Split olayı
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
   Havuz A14     Havuz A15   Havuz A16   (varsa kalan, A12'de kalır)
   20.000 balık  20.000 balık 10.000 balık
   [BatchMovement: TRANSFER, fromTankId=A12, toTankId=A14, fishCount=20000, batchId=LOT-125]
   [BatchMovement: TRANSFER, fromTankId=A12, toTankId=A15, fishCount=20000, batchId=LOT-125]
   [BatchMovement: TRANSFER, fromTankId=A12, toTankId=A16, fishCount=10000, batchId=LOT-125]
```

`batchId` bu süreç boyunca `LOT-125` olarak kaldığından (bir transfer, split'ten farklı olarak
yeni batch kimlikleri oluşturmaz), bu sıradan sonra `BatchTankState`, `LOT-125` için üç satır
gösterir: `(A14, 20000)`, `(A15, 20000)`, `(A16, 10000)`. Tam geçmiş, harvest'ten sonra dahil
olmak üzere gelecekte herhangi bir noktada `BatchMovement WHERE batchId = 'LOT-125' ORDER BY
occurredAt` sorgulanarak yeniden inşa edilebilir kalır — bu da "sistem, hasat edilmiş bir balık
partisinin eksiksiz biyolojik geçmişini yeniden inşa edebilmelidir" gerekliliğini karşılar.

## 5.4 Diyagram — Operasyonel Olayların Biyolojik Duruma Aktığı Yapı

```
FeedingEvent ─┐
MortalityEvent├──► (okur) ──► Biomass Motoru ──► BiomassSnapshot
WeightSample ─┤                        ▲
BatchMovement─┤                        │
HarvestRecord─┘                        │
                                  FCR / SGR Motorları ──► açıklanabilir hesaplama sonucu
                                        │
                                  Forecasting Motoru ──► HarvestForecast
                                        │
                                  Alert Motoru ──► Alert ──► Notification
```

Bu birleşim, operasyonel olayların neden tek biçimli modellendiğini açıklar (görev metninin §9'u)
— biomass, FCR, alerting ve forecasting motorlarının hepsi kendi özel veri kaynağına sahip olmak
yerine aynı olay tablolarını okur; bu da beş çekirdek KPI'yi (biomass, FCR, mortality, growth,
harvest forecast) birbirleriyle tutarlı tutan şeydir.
