# 04. PostgreSQL Veritabanı Şeması Önerisi (Prisma)

Bu bir öneridir, nihai DDL değildir — alan listeleri uygulama sırasında büyüyecektir. Her temel
tablonun **şeklini**, her yerde tutarlı uygulanan kuralları ve daha sonra kolaylık uğruna asla
taviz verilmemesi gereken ledger desenlerini ortaya koyar.

## 4.1 Her Tabloya Uygulanan Kurallar

- **Primary key'ler:** `id` = `String @id @default(cuid())` (yeterince sıralanabilir,
  çakışmaya dayanıklı, seri int'lerin yapacağı gibi frontend'e kiracıların/batch'lerin sayısını
  sızdırmaz).
- **Kiracı kapsamı:** her kiracıya ait tabloda `Company`'ye FK ile bağlı bir `companyId String`
  ve her composite index'in başında `@@index([companyId, ...])` bulunur. Bkz.
  [06-multi-tenant-security.md](06-multi-tenant-security.md).
- **Soft delete:** operasyonel/üretim geçmişini tutan tablolar hard delete yerine
  `deletedAt DateTime?` kullanır (§3, §21). Referans/konfigürasyon tabloları (örn.
  `FeedProduct`) yalnızca hiçbir işlem tarafından referans alınmıyorsa hard-delete edilebilir —
  FK `RESTRICT` ile zorlanır.
- **Aktör + zaman takibi:** her değiştirilebilir tabloda `createdAt DateTime @default(now())`,
  `updatedAt DateTime @updatedAt`, `createdById String`, `updatedById String?` bulunur, tüm
  timestamp'ler **UTC** olarak saklanır; çiftlik-yerel görüntüleme tarih/saati, çiftliğin saklanan
  `timezone`'u kullanılarak sunum katmanında hesaplanır (§38).
- **Para/ağırlık hassasiyeti:** finansal, ağırlık veya oran-türetilmiş herhangi bir şey için
  `Decimal` (Prisma `Decimal`, Postgres `NUMERIC`). Asla `Float` değil. Bkz. §37 ve kanonik birim
  tablosu için [10](10-biological-calculations.md).
- **Enum'lar:** kapalı kümeler (olay tipleri, mortality nedenleri, roller) için Prisma `enum`
  aracılığıyla Postgres enum'ları olarak modellenir — sorgu performansı ve OpenAPI şema kalitesi
  için serbest-metin + check-constraint yerine seçildi. Bir kümenin ileride kiracı bazında
  özelleştirilebilir olması beklendiğinde (örn. mortality alt-nedenleri), bunun yerine bir
  referans tablosu deseni kullanılır (bkz. `FeedProduct` özel katalogları).

## 4.2 Kiracılık & Kimlik

```prisma
model Company {
  id           String   @id @default(cuid())
  name         String
  legalName    String?
  countryCode  String
  timezone     String   // IANA tz, farm bazında override edilmezse varsayılan
  planTier     PlanTier @default(STANDARD)
  status       CompanyStatus @default(ACTIVE)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  users        CompanyMembership[]
  farms        Farm[]
  // ...tüm kiracıya ait diğer ilişkiler
}

enum PlanTier { TRIAL STANDARD PROFESSIONAL ENTERPRISE }
enum CompanyStatus { ACTIVE SUSPENDED CANCELLED }

model User {
  id            String   @id @default(cuid())
  authProviderId String  @unique   // Clerk user id
  email         String   @unique
  fullName      String
  locale        String   @default("en")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  memberships   CompanyMembership[]
}

model CompanyMembership {
  id         String   @id @default(cuid())
  companyId  String
  userId     String
  role       Role
  status     MembershipStatus @default(ACTIVE)
  invitedAt  DateTime?
  joinedAt   DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  company    Company  @relation(fields: [companyId], references: [id])
  user       User     @relation(fields: [userId], references: [id])

  @@unique([companyId, userId])
  @@index([companyId])
}

enum Role {
  PLATFORM_ADMIN COMPANY_OWNER GENERAL_MANAGER FARM_MANAGER
  VETERINARIAN FEED_MANAGER ACCOUNTANT WORKER READ_ONLY
}
enum MembershipStatus { INVITED ACTIVE SUSPENDED REVOKED }
```

`CompanyMembership` (tek bir `role` alanı `User` üzerinde değil) çünkü bir kullanıcı birden fazla
şirkete ait olabilir (örn. birden fazla müşteri şirketinde çalışan danışman bir veteriner) — rol,
kişinin değil, üyeliğin bir özelliğidir. Bu doğrudan
[07](07-roles-permissions-matrix.md)'i destekler.

## 4.3 Çiftlik Hiyerarşisi

```prisma
model Farm {
  id           String   @id @default(cuid())
  companyId    String
  name         String
  code         String   // kısa insan-okunur kod, şirket bazında unique
  timezone     String?  // ayarlanırsa Company.timezone'u override eder
  latitude     Decimal? @db.Decimal(9,6)
  longitude    Decimal? @db.Decimal(9,6)
  status       FarmStatus @default(ACTIVE)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  company      Company  @relation(fields: [companyId], references: [id])
  sections     FarmSection[]

  @@unique([companyId, code])
  @@index([companyId])
}
enum FarmStatus { ACTIVE INACTIVE }

model FarmSection {
  id        String   @id @default(cuid())
  companyId String
  farmId    String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  farm      Farm     @relation(fields: [farmId], references: [id])
  tanks     Tank[]

  @@index([companyId, farmId])
}

model Tank {
  id            String   @id @default(cuid())
  companyId     String
  farmSectionId String
  code          String            // örn. "A12"
  type          TankType          // TANK POND CAGE RACEWAY
  volumeM3      Decimal? @db.Decimal(10,2)
  maxBiomassKg  Decimal? @db.Decimal(12,2)
  qrToken       String   @unique  // QR'a gömülü opak token (bkz. 23-qr-system)
  status        TankStatus @default(ACTIVE)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  farmSection   FarmSection @relation(fields: [farmSectionId], references: [id])

  @@unique([companyId, farmSectionId, code])
  @@index([companyId])
}
enum TankType { TANK POND CAGE RACEWAY }
enum TankStatus { ACTIVE INACTIVE MAINTENANCE }
```

## 4.4 Balık Partisi & Hareket Ledger'ı

Tam gerekçe [08-fish-batch-lineage.md](08-fish-batch-lineage.md)'de. Şema özeti:

```prisma
model FishSpecies {
  id        String  @id @default(cuid())
  companyId String? // null = global referans tür; dolu = şirkete özel soy
  name      String
  strain    String?
  createdAt DateTime @default(now())
  deletedAt DateTime?
}

model FishBatch {
  id                String   @id @default(cuid())
  companyId         String
  lotCode           String            // örn. LOT-2026-00125, insan-yüzlü unique kimlik
  speciesId         String
  hatcherySupplier  String?
  eggSource         String?
  hatchDate         DateTime?
  farmEntryDate     DateTime
  initialCount      Int
  initialAvgWeightG Decimal  @db.Decimal(10,3)
  status            BatchStatus @default(ACTIVE) // ACTIVE PARTIALLY_HARVESTED HARVESTED CLOSED
  parentBatchIds    String[]           // SPLIT veya MERGE ile oluşturulduğunda doldurulur
                                        // (denormalize kolaylık işaretçisi; gerçek kaynak
                                        // BatchMovement'tır)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?

  species           FishSpecies @relation(fields: [speciesId], references: [id])
  movements         BatchMovement[]
  currentState      BatchCurrentState?  // türetilmiş, bkz. 4.4.1

  @@unique([companyId, lotCode])
  @@index([companyId, status])
}
enum BatchStatus { ACTIVE PARTIALLY_HARVESTED HARVESTED CLOSED }

// Değişmez ledger. Her stoklama, transfer, split, merge ve harvest-çıkarma işlemi
// burada append-only bir satırdır. Satırlar bir kez gönderildikten sonra ASLA güncellenmez
// veya silinmez.
model BatchMovement {
  id              String   @id @default(cuid())
  companyId       String
  movementType    MovementType   // STOCKING TRANSFER SPLIT MERGE HARVEST_REMOVAL ADJUSTMENT
  batchId         String         // bu ledger kaydının öncelikle ilgilendiği batch
  fromTankId      String?
  toTankId        String?
  fromBatchId     String?        // SPLIT/MERGE için: köken batch(ler)
  toBatchId       String?        // SPLIT/MERGE için: sonuçlanan batch(ler)
  fishCount       Int            // her zaman pozitif; yön movementType ile ima edilir
  estimatedAvgWeightG Decimal?  @db.Decimal(10,3)
  estimatedBiomassKg  Decimal?  @db.Decimal(12,3)
  occurredAt      DateTime       // gerçek olay zamanı (geç girişler için geçmişe tarihli olabilir)
  postedAt        DateTime @default(now())  // ledger satırının yazıldığı an — asla düzenlenmez
  createdById     String
  notes           String?
  reversalOfId    String?        // bir düzeltme gerekirse, yeni bir ters kayıt buna işaret eder;
                                  // orijinal satır asla değiştirilmez (append-only düzeltme)

  @@index([companyId, batchId])
  @@index([companyId, toTankId])
  @@index([companyId, fromTankId])
}
enum MovementType { STOCKING TRANSFER SPLIT MERGE HARVEST_REMOVAL ADJUSTMENT }

// Materialize edilmiş, ledger'dan yeniden inşa edilebilir kolaylık projeksiyonu. ASLA gerçek
// kaynak olarak ele alınmaz — zamanlanmış bir job (veya yazımda yeniden hesaplama) bunu
// BatchMovement + Mortality + Harvest'ten yeniden üretir. Sadece "batch X'in şu anki durumu
// nedir" sorusunun her okumada tüm ledger'ı tekrar oynatmayı gerektirmemesi için var.
model BatchCurrentState {
  batchId           String   @id
  currentTankId     String?           // birden fazla havuza bölünmüşse null — bkz. BatchTankState
  estimatedCount    Int
  estimatedAvgWeightG Decimal @db.Decimal(10,3)
  estimatedBiomassKg Decimal @db.Decimal(12,3)
  lastRecalculatedAt DateTime
}

// Bir batch aynı anda birden fazla havuza bölünebilir; bu tablo havuz-bazlı canlı tahsisi
// takip eder, aynı şekilde ledger'dan yeniden inşa edilebilir.
model BatchTankState {
  batchId        String
  tankId         String
  estimatedCount Int
  lastRecalculatedAt DateTime

  @@id([batchId, tankId])
}
```

### 4.4.1 Neden değişmez bir ledger'ın yanında türetilmiş bir "mevcut durum" tablosu

**Ne seçildi:** Ledger gerçek kaynaktır; `BatchCurrentState`/`BatchTankState` türetilmiş, yeniden
inşa edilebilir cache'lerdir.

**Neden:** "Havuz A14'te şu an kaç balık var" sorusunu her dashboard yüklemesinde tüm hareket
geçmişini tekrar oynatarak okumak, batch sayısı arttıkça ölçeklenmez. Ama *sadece* değiştirilebilir
bir mevcut-durum alanı saklamak (bu sistemin açıkça reddettiği anti-desen, §8) geçmişi kaybeder.
Standart çözüm — `feed-inventory` için de aynı şekilde kullanılan — **materialize edilmiş bir
projeksiyonla event-sourcing**'dir: ledger gerçektir, projeksiyon her zaman atılıp ledger tekrar
oynatılarak yeniden inşa edilebilen bir cache'tir. Bir background job, yazımda projeksiyonları
senkron olarak yeniden hesaplar (etkilenen batch/havuz için aynı transaction içinde, çünkü bu veri
neredeyse her operasyonel ekranda okunur) ve gece çalışan bir uzlaştırma (reconciliation) job'ı
tüm projeksiyonları sıfırdan yeniden türetir ve canlı projeksiyonla karşılaştırarak sapmayı
(bug'lar, elle DB düzenlemeleri vb.) yakalar — bu uzlaştırma job'ının ilk günden var olması, bu
rakamlar bu kadar merkezi olduğu için değerli bir güvenlik ağıdır.

**Değerlendirilen alternatifler:** Projeksiyon tablosu olmadan saf event-sourcing, durumu talep
üzerine sadece Redis'te ağır cache'leme ile hesaplamak — reddedildi çünkü Redis açıkça gerçek
kaynak değildir (§27) ve soğuk cache okumaları (örn. bir deploy cache'i temizledikten sonra)
dashboard'lar için yavaş olurdu. Ledger olmadan tek bir değiştirilebilir
`Tank.currentBatchId`/`Tank.currentFishCount` alanı — açıkça §8'in yasakladığı anti-desen.

## 4.5 Operasyonel Olaylar (Feeding, Mortality, Sampling, Water Quality, Treatment)

Tüm operasyonel olay tabloları, her birinin tipe özgü alanları olsa da ortak bir şekli paylaşır
(görev metninin §9'una bakın) — sorgu performansı, DB-seviyesi tip güvenliği ve daha basit
raporlama join'leri için (tek bir polimorfik `Event` tablosu değil) ayrı tablolar olarak
modellenir, ama hepsi `packages/types`'taki paylaşılan bir TypeScript interface'i tarafından
uygulanan aynı temel sözleşmeye uyar.

```prisma
model FeedingEvent {
  id           String   @id @default(cuid())
  companyId    String
  farmId       String
  tankId       String
  batchId      String
  feedProductId String
  quantityKg   Decimal  @db.Decimal(10,3)
  method       FeedingMethod
  occurredAt   DateTime
  createdById  String
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  inventoryTransactionId String  @unique  // oluşturduğu FEED_CONSUMPTION ledger satırına 1:1 bağlantı

  @@index([companyId, tankId, occurredAt])
  @@index([companyId, batchId, occurredAt])
}
enum FeedingMethod { MANUAL AUTOMATIC_FEEDER DEMAND_FEEDER }

model MortalityEvent {
  id          String   @id @default(cuid())
  companyId   String
  farmId      String
  tankId      String
  batchId     String
  fishCount   Int
  estimatedAvgWeightG Decimal? @db.Decimal(10,3)
  estimatedBiomassKg  Decimal? @db.Decimal(12,3)
  reason      MortalityReason
  occurredAt  DateTime
  createdById String
  notes       String?
  createdAt   DateTime @default(now())
  deletedAt   DateTime?

  @@index([companyId, tankId, occurredAt])
  @@index([companyId, batchId, occurredAt])
}
enum MortalityReason {
  UNKNOWN DISEASE OXYGEN TEMPERATURE TRANSFER_STRESS
  PHYSICAL_DAMAGE PREDATOR FEED_RELATED OTHER
}

model WeightSample {
  id             String   @id @default(cuid())
  companyId      String
  tankId         String
  batchId        String
  sampleMethod   SampleMethod   // INDIVIDUAL AGGREGATE
  sampleSize     Int
  individualWeightsG Decimal[]  @db.Decimal(10,3)  // sadece INDIVIDUAL için doldurulur
  totalWeightG   Decimal  @db.Decimal(12,3)
  avgWeightG     Decimal  @db.Decimal(10,3)
  minWeightG     Decimal? @db.Decimal(10,3)
  maxWeightG     Decimal? @db.Decimal(10,3)
  stdDevG        Decimal? @db.Decimal(10,3)
  cv             Decimal? @db.Decimal(6,3)    // varyasyon katsayısı, %
  occurredAt     DateTime
  createdById    String
  notes          String?
  createdAt      DateTime @default(now())
  deletedAt      DateTime?   // ham örnek satırları asla hard-delete edilmez (§16)

  @@index([companyId, batchId, occurredAt])
}
enum SampleMethod { INDIVIDUAL AGGREGATE }

model WaterQualityReading {
  id            String   @id @default(cuid())
  companyId     String
  tankId        String
  source        ReadingSource  // MANUAL SENSOR
  sensorId      String?
  temperatureC  Decimal? @db.Decimal(5,2)
  dissolvedOxygenMgL Decimal? @db.Decimal(5,2)
  ph            Decimal? @db.Decimal(4,2)
  salinityPpt   Decimal? @db.Decimal(5,2)
  ammoniaMgL    Decimal? @db.Decimal(6,3)
  nitriteMgL    Decimal? @db.Decimal(6,3)
  nitrateMgL    Decimal? @db.Decimal(6,3)
  flowRateM3H   Decimal? @db.Decimal(8,2)
  occurredAt    DateTime
  createdById   String?          // source = SENSOR ise null (kullanıcı girişi değil, otomatik alınmış)
  createdAt     DateTime @default(now())

  @@index([companyId, tankId, occurredAt])
}
enum ReadingSource { MANUAL SENSOR }

model Treatment {
  id            String   @id @default(cuid())
  companyId     String
  batchId       String
  tankId        String
  type          TreatmentType  // MEDICATION VACCINATION
  productName   String
  dosage        String?
  withdrawalPeriodDays Int?
  startedAt     DateTime
  endedAt       DateTime?
  veterinarianId String?
  createdById   String
  notes         String?
  createdAt     DateTime @default(now())
  deletedAt     DateTime?

  documents     FileAsset[]

  @@index([companyId, batchId])
}
enum TreatmentType { MEDICATION VACCINATION }
```

## 4.6 Yem Stok Ledger'ı

Tam gerekçe [09-feed-inventory-ledger.md](09-feed-inventory-ledger.md)'de. Şema özeti:

```prisma
model FeedProduct {
  id           String   @id @default(cuid())
  companyId    String
  name         String
  manufacturer String?
  pelletSizeMm Decimal? @db.Decimal(5,2)
  formula      String?
  proteinPct   Decimal? @db.Decimal(5,2)
  fatPct       Decimal? @db.Decimal(5,2)
  qrToken      String   @unique
  createdAt    DateTime @default(now())
  deletedAt    DateTime?

  @@index([companyId])
}

model Warehouse {
  id        String   @id @default(cuid())
  companyId String
  farmId    String
  name      String
  qrToken   String   @unique
  createdAt DateTime @default(now())
  deletedAt DateTime?

  @@index([companyId, farmId])
}

// Belirli bir stok teslim alımı — tedarikçi lotu, son kullanma tarihi, maliyet — FeedProduct'tan
// (katalog) ayrı
model FeedInventoryBatch {
  id             String   @id @default(cuid())
  companyId      String
  warehouseId    String
  feedProductId  String
  supplierLotCode String?
  manufactureDate DateTime?
  expiryDate     DateTime?
  unitCostPerKg  Decimal? @db.Decimal(12,4)
  createdAt      DateTime @default(now())

  @@index([companyId, warehouseId, feedProductId])
}

// Ledger. Eldeki stok HER ZAMAN bu satırların işaretli (signed) toplamıdır — asla doğrudan
// saklanmaz.
model FeedInventoryTransaction {
  id                   String   @id @default(cuid())
  companyId            String
  warehouseId          String
  feedInventoryBatchId String
  type                 InventoryTxType
  quantityKg           Decimal  @db.Decimal(12,3)  // her zaman pozitif; işaret type ile ima edilir
  occurredAt           DateTime
  createdById          String
  referenceType        String?  // örn. "FeedingEvent", "HarvestRecord" — polimorfik referans
  referenceId          String?
  notes                String?
  createdAt            DateTime @default(now())

  @@index([companyId, warehouseId, feedInventoryBatchId, occurredAt])
}
enum InventoryTxType {
  PURCHASE TRANSFER_IN TRANSFER_OUT FEED_CONSUMPTION ADJUSTMENT RETURN WASTE
}

// Türetilmiş, yeniden inşa edilebilir projeksiyon — BatchCurrentState ile aynı desen (4.4.1)
model FeedInventoryBalance {
  feedInventoryBatchId String @id
  quantityOnHandKg      Decimal @db.Decimal(12,3)
  lastRecalculatedAt     DateTime
}
```

## 4.7 Biomass Snapshot'ları, Harvest, Maliyet, Audit, Alert, Dosyalar

```prisma
// Zaman-serisi raporlama/tahmin girdisi için periyodik (günlük) belirli-an snapshot'ı.
// Talep üzerine yeniden hesaplamanın YERİNE geçmez — bkz. 10-biological-calculations.md.
model BiomassSnapshot {
  id           String   @id @default(cuid())
  companyId    String
  batchId      String
  tankId       String?
  snapshotDate DateTime  @db.Date
  estimatedCount Int
  avgWeightG   Decimal  @db.Decimal(10,3)
  biomassKg    Decimal  @db.Decimal(12,3)
  methodology  String    // versiyonlu hesaplama metodu tanımlayıcısı, bkz. 10-biological-calculations.md
  createdAt    DateTime @default(now())

  @@unique([batchId, tankId, snapshotDate])
  @@index([companyId, snapshotDate])
}

model HarvestRecord {
  id             String   @id @default(cuid())
  companyId      String
  batchId        String
  tankId         String
  type           HarvestType // PLANNED ACTUAL
  fullness       HarvestFullness // PARTIAL FULL
  plannedDate    DateTime?
  harvestedAt    DateTime?
  fishCount      Int?
  biomassKg      Decimal? @db.Decimal(12,3)
  avgWeightG     Decimal? @db.Decimal(10,3)
  sizeGrade      String?
  destination    String?
  customer       String?
  processingPlant String?
  createdById    String
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  @@index([companyId, batchId])
}
enum HarvestType { PLANNED ACTUAL }
enum HarvestFullness { PARTIAL FULL }

model CostEntry {
  id           String   @id @default(cuid())
  companyId    String
  category     CostCategory
  amount       Decimal  @db.Decimal(14,2)
  currency     String   @default("USD")
  farmId       String?
  tankId       String?
  batchId      String?
  incurredAt   DateTime
  sourceType   String?   // örn. otomatik türetilmiş yem maliyeti için "FeedInventoryTransaction"
  sourceId     String?
  createdById  String
  notes        String?
  createdAt    DateTime @default(now())

  @@index([companyId, batchId])
  @@index([companyId, farmId, incurredAt])
}
enum CostCategory {
  FEED EGGS FINGERLINGS MEDICINE VACCINATION LABOR ELECTRICITY
  OXYGEN FUEL TRANSPORTATION OVERHEAD DEPRECIATION OTHER
}

model AuditLog {
  id           String   @id @default(cuid())
  companyId    String
  userId       String?
  action       String       // örn. "UPDATE", "DELETE", "TRANSFER"
  entityType   String
  entityId     String
  previousValue Json?
  newValue     Json?
  ipAddress    String?
  occurredAt   DateTime @default(now())

  @@index([companyId, entityType, entityId])
  @@index([companyId, occurredAt])
}

model Alert {
  id          String   @id @default(cuid())
  companyId   String
  farmId      String?
  tankId      String?
  batchId     String?
  type        String
  severity    AlertSeverity
  message     String
  detectedAt  DateTime @default(now())
  resolvedAt  DateTime?
  resolvedById String?

  @@index([companyId, resolvedAt])
}
enum AlertSeverity { INFO WARNING CRITICAL }

model FileAsset {
  id           String   @id @default(cuid())
  companyId    String
  entityType   String
  entityId     String
  storageKey   String   // S3 nesne anahtarı
  fileName     String
  mimeType     String
  sizeBytes    Int
  checksum     String?
  uploadedById String
  createdAt    DateTime @default(now())
  deletedAt    DateTime?

  @@index([companyId, entityType, entityId])
}
```

## 4.8 İndeksleme Stratejisi

Her tablonun ilk composite index'i `companyId` ile başlar, çünkü neredeyse her sorgu önce
kiracı-kapsamlıdır (bkz. [06](06-multi-tenant-security.md)) — bu, kiracı filtresinin filtre
sonradan uygulanan tam tablo taraması yerine index tarafından kapsanmasını sağlar. Zaman-serisi
tabloları (olaylar, ledger işlemleri, su kalitesi), baskın sorgu deseni "bu havuz/batch, zamana
göre sıralı, yakın zamanlı pencere" olduğundan `(companyId, entityId, occurredAt)` composite
index'leri ekler. `companyId` aralığına veya aya göre partitioning (sensörler devreye girince
`WaterQualityReading` gibi yüksek hacimli tablolar için) [15-future-scaling.md](15-future-scaling.md)'e
ertelenmiştir — MVP ölçeğinde gerekli değil, ama bu tabloların append-only, zaman-sıralı şekli,
ileride şema yeniden tasarımı olmadan range partitioning'i basit hale getirir.

## 4.9 Neden Biomass/Stok Tek Bir Değiştirilebilir Alan Olarak Saklanmaz (tekrar vurgu)

Bu, tüm şemadaki en önemli tek kuraldır ve görev metninde üç kez belirtilmiştir (§1, §8, §14),
çünkü deadline baskısı altında en kolay yanlışlıkla ihlal edilebilecek kuraldır ("hızlıca bir
+1/-1 güncelleme ekleyelim, sonra düzgün hallederiz"). §4.4 ve §4.6'daki her tablo, **mevcut
durumu değiştirmenin tek yolunun bir ledger satırı eklemek olması** için tasarlanmıştır;
`BatchCurrentState`/`FeedInventoryBalance` herhangi bir anda hiçbir veri kaybı olmadan silinip
yeniden inşa edilebilen cache'lerdir. Kod incelemesi ve CI lint kuralları, ledger destekli bir
tablo olmadan doğrudan mutasyona uğrayan bir `currentCount`/`stockKg`-tarzı kolon ekleyen herhangi
bir migration'ı engelleyici bir mimari ihlal olarak ele almalıdır.
