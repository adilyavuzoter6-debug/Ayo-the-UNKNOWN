# 01. Eksiksiz Sistem Mimarisi

## 1.1 Bileşen Diyagramı

```
                                   ┌───────────────────────────┐
                                   │        WEB APP            │
                                   │  Next.js 14+ / React / TS │
                                   │  (sahipler, yöneticiler,  │
                                   │  veterinerler, yem ve     │
                                   │  finans ekipleri)         │
                                   └────────────┬──────────────┘
                                                │ HTTPS / JSON (REST v1)
┌──────────────┐                    ┌──────────▼───────────────┐                 ┌──────────────────┐
│ MOBİL APP    │  HTTPS / JSON      │        NESTJS API         │  HTTPS/webhook  │ IoT / SENSÖR      │
│ RN + Expo    ├───────────────────►│  Modüler DDD, versiyonlu  │◄────────────────┤ gateway'ler       │
│ (saha)       │                    │  REST, Swagger/OpenAPI    │                 │ (gelecek)         │
└──────────────┘                    └──────────┬─────────────┬─┘                 └──────────────────┘
                                                │             │
                          ┌─────────────────────┼──────┐      │ kontrollü salt-okunur
                          │                     │      │      │ analitik servis katmanı
                    ┌─────▼─────┐        ┌──────▼───┐  │  ┌───▼──────────────┐
                    │PostgreSQL │        │  Redis   │  │  │ AI / Analiz       │
                    │ (Prisma)  │        │ cache /  │  │  │ katmanı (Python,  │
                    │ + RLS'e   │        │ queue /  │  │  │ ileride)          │
                    │ hazır     │        │ session  │  │  └──────────────────┘
                    └─────┬─────┘        └────┬─────┘  │
                          │                    │        │
                    ┌─────▼─────┐        ┌─────▼─────┐  │
                    │ S3 uyumlu │        │  BullMQ   │  │
                    │  nesne    │        │ background│──┘
                    │  depolama │        │  worker'lar│
                    └───────────┘        └───────────┘
```

Hem web hem mobil, aynı NestJS REST API üzerinde çalışan ince (thin) istemcilerdir. Next.js server
action'larında veya React Native kodunda, form validasyonu ve sunum dışında iş mantığı
bulunmaz. Bu yapı sayesinde aynı backend, ileride biomass/FCR/stok mantığını
istemci başına tekrar yazmadan harici ERP entegrasyonlarına, IoT cihaz veri akışına ve AI
tool-calling'e hizmet verebilecek.

## 1.2 Stack Kararları

### Web frontend — Next.js + React + TypeScript + Tailwind + shadcn/ui + RHF + Zod + TanStack Query + Recharts

**Ne seçildi:** Web app için Next.js App Router, Tailwind üzerine kurulu bileşen katmanı olarak
shadcn/ui, form state/validasyonu için React Hook Form + Zod (şema, backend DTO'larıyla tip
seviyesinde paylaşılır), sunucu-state cache'i için TanStack Query, dashboard/grafikler için
Recharts.

**Neden:** Next.js dosya tabanlı routing, veri-yoğun dashboard sayfaları için server component'ler
(masaüstü ağırlıklı analitik ekranlarda daha az client JS) ve MVP aşaması için Vercel üzerinde
olgun bir deployment hikayesi sunar. shadcn/ui, sahip olunan, düzenlenebilir bileşen kaynak kodu
sağlar (kapalı-kutu bir bağımlılık değil) — bu, hazır UI kitlerinin sahip olmadığı yoğun veri
tabloları, çok adımlı formlar ve domain'e özgü widget'lara (havuz kartları, batch soy ağacı
görünümü) ihtiyaç duyacak uzun ömürlü bir ürün için önemlidir. Zod şemaları, frontend formları ile
backend DTO'ları arasında (bkz. §33) birebir değil ama ayna niteliğinde paylaşılabilen runtime
validasyon sözleşmesi görevi görür ve validasyon sapmasını azaltır.

**Değerlendirilen alternatifler:** Remix (benzer DX, admin/dashboard bileşen kütüphaneleri için
daha küçük ekosistem); saf CRA/Vite SPA (daha basit zihinsel model, ama veri-yoğun masaüstü
kullanımı için SSR'yi ve dosya-tabanlı routing kurallarını kaybeder); Material UI / Ant Design
(daha hızlı başlangıç hızı, ama uzun ömürlü, çoklu-kiracılı ve ileride white-label ihtiyacı
olabilecek bir ürün için yeniden stillendirmesi daha zor).

**Kabul edilen tradeoff'lar:** Next.js App Router'ın server/client component sınırı bir öğrenme
eğrisi ve TanStack Query ile ara sıra sürtüşme getirir (`"use client"` sınırlarının bilinçli
yerleştirilmesi gerekir). Veri-yoğun sayfalardaki SSR/performans kazancı için bunu kabul ediyoruz.

### Backend — NestJS + TypeScript + REST + OpenAPI + Prisma/Zod validasyon

**Ne seçildi:** Web, mobil, entegrasyonlar, IoT veri akışı ve AI tool-calling için tek backend
olarak NestJS. Birincil API stili olarak REST (GraphQL değil), versiyonlu (`/api/v1/...`),
`@nestjs/swagger` üzerinden OpenAPI 3 olarak dokümante edilmiş. Controller sınırında DTO
validasyonu `class-validator`/`class-transformer` ile; frontend ile paylaşımın pratik olduğu
yerlerde (örn. biomass girdi şekli) `packages/validation` içinde Zod kullanılır.

**Neden:** NestJS'in modül sistemi, [03-backend-modules.md](03-backend-modules.md) içindeki domain
modül listesine doğrudan karşılık gelir — her sınırlı bağlam (bounded context) (fish-batches,
feeding, harvest, cost-accounting...) kendi controller/service/repository'lerine sahip bir Nest
modülü olur; bu da "asıl iş mantığı UI bileşenleri içinde değil backend'de olmalı" ilkesini
sadece bir kural değil, mimari zorunluluk haline getirir. REST, GraphQL yerine seçildi çünkü:
(a) tüketici kümesi (web, mobil, gelecekte IoT, gelecekte harici ERP'ler) GraphQL'in esnek
sorgulamasından çok basit, cache'lenebilir, versiyonlanabilir kaynak endpoint'lerinden ve her
route için öngörülebilir rol-bazlı yetki kontrolünden fayda görür; (b) REST + OpenAPI hem Next.js
hem Expo uygulaması için tipli client'ları kolayca üretir; (c) rate limiting, cache (Redis) ve
audit logging, alan-bazlı değil endpoint-bazlı düşünüldüğünde daha basittir.

**Değerlendirilen alternatifler:** GraphQL (Apollo/NestJS GraphQL) — esnek dashboard sorguları
için güçlü bir uyum ama mobilin basit, sabit, offline-dostu operasyonları (`FEED`, `MORTALITY`
vb.) için daha zayıf bir uyum; ayrıca zaten en zor problem olan satır-seviyesi tenant + rol
yetkilendirmesini alan-bazlı hale getirerek karmaşıklaştırır. tRPC — mükemmel TS-only DX ama
client ve server release döngüsünü birbirine bağlar ve TS-olmayan tüketicilere (mobil TS'dir ama
gelecekteki IoT cihazları, harici ERP entegrasyonları ve AI tool-caller'lar garanti TS değildir)
hizmet vermez. Düz Express — daha az yapı, yıllarca modüler kalması hedeflenen bir kod tabanında
Nest'in DI/modül sisteminin bedavaya verdiğini yeniden icat eder.

**Kabul edilen tradeoff'lar:** REST, bazı dashboard ekranlarının tek esnek bir sorgu yerine birden
fazla round trip veya özel amaçlı toplu (aggregate) endpoint'ler (örn. `GET
/api/v1/farms/:id/dashboard-summary`) gerektireceği anlamına gelir. Bunu kabul ediyoruz ve
backend aggregate/report endpoint'leri (bkz. [11-api-architecture.md](11-api-architecture.md))
ile pahalı aggregate'ler için Redis cache'i ile hafifletiyoruz.

### Veritabanı — PostgreSQL + Prisma

**Ne seçildi:** Tek gerçek kaynak (system of record) olarak PostgreSQL; ORM/migration aracı olarak
Prisma.

**Neden:** PostgreSQL, finansal ve biyolojik hassasiyet için `NUMERIC`/`DECIMAL` tipleri (§37),
çok-kiracılı model için native Row Level Security (§4,
[06-multi-tenant-security.md](06-multi-tenant-security.md)), esnek/gelişen alanlar için (örn.
forecast model parametreleri) ledger-ağırlıklı çekirdek için ilişkisel bütünlükten ödün vermeden
olgun JSON kolon desteği ve yolumuzdaki her hosting seçeneğinde (Neon/Supabase → AWS
RDS/Aurora) güçlü ekosistem desteği sağlar. Prisma, tip-güvenli sorgular, deklaratif migration'lar
ve domain modelinin canlı dokümantasyonu işlevi de gören bir şema dosyası sunar — domain'in
karmaşıklığı (batch'ler, ledger'lar, olaylar) göz önüne alındığında bu önemlidir.

**Değerlendirilen alternatifler:** MySQL (ledger tablolarında isteyeceğimiz gelişmiş
constraint/kısmi indeksler için daha zayıf native destek); esneklik için bir doküman veritabanı
(MongoDB) — reddedildi çünkü domain temelde ilişkiseldir ve ledger/finansal bütünlük şema
esnekliği değil ACID transaction'lar ve foreign-key doğruluğu gerektirir. Prisma yerine Drizzle
ORM — daha hafif ve SQL'e daha yakın, makul bir alternatif, ama Prisma'nın migration akışı ve
admin araçları (Prisma Studio) büyük bir domain modeli inşa eden küçük bir ekibi hızlandırır;
Prisma'nın nispeten daha ağır runtime'ını ve RLS-farkında veya window-function-ağırlıklı sorgular
(biomass zaman serisi, cost allocation) için ara sıra ham SQL'e (`$queryRaw`) inme ihtiyacını
kabul ediyoruz.

**Kabul edilen tradeoff'lar:** Prisma'nın migration motoru RLS politikalarını native olarak
yönetmez — bunlar Prisma-üretimli migration'ların üzerine ham SQL migration'lar olarak
uygulanır. Bu ekstra süreç adımını kabul ediyoruz çünkü RLS, birincil izolasyon mekanizması değil
derinlemesine savunma (defense-in-depth) katmanıdır (bkz.
[06](06-multi-tenant-security.md)).

### Auth — Clerk / Auth0 / Supabase Auth

**Ne seçildi:** **Clerk**, roller/şirket üyeliği kendi veritabanımızda modellenip webhook ile
senkronize edilerek (yalnızca auth sağlayıcısında değil).

**Neden:** Clerk, Next.js + NestJS + Expo stack'i için en az entegrasyon işiyle üretim
seviyesinde auth (MFA, session yönetimi, "Organizations" özelliği ile hazır çoklu-kiracılı
primitifler) sunar — Next.js için first-party middleware'i, NestJS için basit bir JWT-doğrulama
yolu (Clerk tarafından verilen JWT'leri doğrulayan bir Passport stratejisi) ve mobil için bir Expo
SDK'sı vardır. Organizations özelliği Şirket kavramına doğal olarak karşılık gelir, bu da
davet/üyelik UX'ini sıfırdan inşa etmeyi kısaltır.

**Değerlendirilen alternatifler:** Auth0 — eşit derecede yetenekli, daha fazla kurumsal özellik,
ama daha ağır kurulum ve ölçekte daha pahalı; Clerk'in org modeli kısıtlayıcı çıkarsa makul bir
yedek. Supabase Auth — Postgres için de Supabase seçseydik cazip olurdu, ama auth'u veritabanı
sağlayıcısı seçimine bağlar ve RBAC/org primitifleri şirket→çiftlik hiyerarşisi için Clerk'inkinden
daha az olgundur. Kendi auth'unu yazmak (NextAuth/Passport + bcrypt) — reddedildi: kimlik
doğrulama, yanlış yapıldığında ciddi sonuçları olan çözülmüş bir problemdir (kimlik bilgisi
depolama, session fixation, MFA); "Şifre/kimlik doğrulama güvenilir bir auth sağlayıcısı
tarafından yönetilir" belirtilen sert bir gerekliliktir (§36).

**Kabul edilen tradeoff'lar:** Clerk *kimlik* için tek gerçek kaynaktır (bu kullanıcı kim) ama
*yetkilendirme* için değildir (Şirket X'te ne yapabilir). `role` ve `companyId` üyeliğini,
Clerk org üyeliğinden webhook ile senkronize edilen, veritabanımızın sahip olduğu domain verisi
olarak ele alıyoruz ve her istekte her zaman sunucu tarafında yeniden doğruluyoruz — asla bir DB
kontrolü olmadan tek başına bir JWT claim'inden güvenilmiyor (bir kullanıcının rolü session
ortasında değişebilir veya iptal edilebilir). Bu, "JWT claim'lerine güven" yaklaşımına göre biraz
daha fazla altyapı gerektirir ama §4'ün kuralı gereği zorunludur: "Frontend'den gelen companyId'ye
yetkilendirme doğrulaması yapmadan asla güvenme."

### Mobil — React Native + Expo + TypeScript

**Ne seçildi:** Aynı REST API'yi tüketen Expo-managed React Native uygulaması.

**Neden:** Expo hızlı iterasyon, OTA güncellemeleri (saha cihazlarını fiziksel olarak güncellemek
zor olduğundan kritik), hazır kamera/QR erişimi (§23) ve §24'te açıklanan offline-first işe daha
sonra `expo-sqlite` + bir senkronizasyon motoru eklenerek ulaşılabilecek düz bir yol sunar.
`packages/types` ve `packages/validation`'ı web ile paylaşır.

**Değerlendirilen alternatifler:** Bare React Native — daha fazla native modül esnekliği, henüz
gerekli değil; Flutter — dil stratejisini parçalar (§34 mümkün olan her yerde TypeScript
zorunlu kılar) ve web app ile kod/tip paylaşımını kaybeder.

### Cache / Queue — Redis + BullMQ

**Ne seçildi:** Session'lar, dağıtık kilitler, dashboard aggregate cache'i ve rate limiting için
Redis; bunun üzerine background job'lar için BullMQ.

**Neden:** İkisi de standart, iyi anlaşılan ve §26/§27 ile tam olarak örtüşen çözümler. BullMQ
NestJS ile native entegre olur (`@nestjs/bullmq`). Redis *asla* gerçek kaynak olarak
kullanılmaz — her cache'lenmiş değer PostgreSQL'den yeniden inşa edilebilir olmalıdır
(cache-aside deseni), bu da Redis'i veri kaybı olmadan tahliye edilebilir (evictable) tutar.

### Dosya depolama — S3 uyumlu nesne depolama

**Ne seçildi:** S3-uyumlu depolama (doğrudan AWS S3, ya da erken aşamada Cloudflare R2 / Supabase
Storage), dosya metadata'sı (sahip, kiracı, varlık bağlantısı, content-type, boyut, checksum)
PostgreSQL'de saklanır.

**Neden:** §28 ile tam örtüşür — belgeler (veteriner kayıtları, lab analizleri, sertifikalar)
operasyonel veritabanından ayrı, dayanıklı, kiracı-kapsamlı, erişim-kontrollü depolamaya
ihtiyaç duyar. Yalnızca metadata'yı Postgres'te tutmak veritabanını küçük tutar ve dosya erişimini
kiracı bazında kısa ömürlü imzalı URL'lerle kontrol edilebilir kılar.

### Hosting — Vercel + Supabase/Neon ile başla, AWS'e büyü

Tam yol ve migration kriterleri için bkz.
[14-deployment-architecture.md](14-deployment-architecture.md).

### AI — Python servisleri + Claude API, kontrollü bir servis katmanı arkasında izole

**Ne seçildi (mimari olarak, MVP'de henüz uygulanmıyor):** AI özellikleri **kontrollü bir
analitik/servis katmanına** karşı ek (additive) ve salt-okunurdur, asla doğrudan veritabanı
erişimine sahip değildir ve asla çekirdek deterministik hesaplamalardan (biomass/FCR/SGR/cost
TypeScript servisleri olarak kalır) sorumlu değildir. Gelecekteki Python servisleri
(forecasting/ML), NestJS API'yi başka herhangi bir istemci gibi çağırır ya da NestJS tarafından
dahili job'lar olarak tetiklenir — sınırsız erişimli kendi doğrudan DB kimlik bilgilerini almazlar.

**Neden:** §32 açıktır — AI, sınırsız tablolara erişmemeli ve çekirdek hesaplamalara sahip
olmamalıdır. AI'ı aynı API/servis katmanının bir istemcisi olarak tutmak, web/mobil'e uygulanan her
tenant-izolasyon ve yetkilendirme kuralının AI'a da otomatik olarak uygulanması demektir —
korunacak paralel bir güvenlik modeli olmaz.

## 1.3 İstek Yaşam Döngüsü (temsili örnek: mobil bir çalışan feeding olayı kaydediyor)

1. Expo uygulaması Clerk üzerinden kimlik doğrular, bir session JWT'si tutar.
2. Çalışan Havuz QR'ını okutur → uygulama QR payload'ından `tankId`'yi çözer → havuz operasyon
   ekranını açar (veri önceden çekilmiştir: havuz, aktif batch, o çiftlikte mevcut yem ürünleri).
3. Çalışan `FEED`'e dokunur, miktar girer, gönderir.
4. `Authorization` header'ında JWT ile `POST /api/v1/feedings`, gövde DTO'ya karşı doğrulanır.
5. NestJS `AuthGuard` JWT'yi doğrular → `TenantContextInterceptor` doğrulanmış kullanıcının
   `companyId`/rolünü veritabanından çözer (istek gövdesinden değil) → `RolesGuard` route'un
   gerektirdiği yetkiyi çözülen role karşı kontrol eder.
6. `FeedingService.create()` bir Prisma transaction'ı içinde çalışır: feeding operasyonel olayını
   ekler, bir `FEED_CONSUMPTION` stok ledger işlemi ekler, etkilenen stok-eldeki-miktarı yeniden
   hesaplar (saklanan-ve-güvenilen değil, türetilmiş), bir audit log kaydı yazar.
7. Yanıt standart zarf (envelope) içinde döner (§11). TanStack Query / mobil yerel cache
   iyimser (optimistic) olarak güncellenir; eşikler aşılırsa BullMQ üzerinden arka planda günlük
   biomass/FCR snapshot'ı asenkron olarak yeniden hesaplanabilir.

Bu yaşam döngüsü — auth → tenant çözümü → rol kontrolü → transactional domain servisi →
ledger yazımı → audit log — sistemdeki her mutasyon endpoint'i için aynı şekildedir; bu da
tenant izolasyonunu ve denetlenebilirliği özellik başına değil merkezi olarak (guard'lar/
interceptor'lar aracılığıyla) uygulanabilir kılar.

## 1.4 Mimariyi Yönlendiren Fonksiyonel Olmayan Gereksinimler

- **Kolaylık yerine izlenebilirlik:** biyolojik veya stok durumundaki her mutasyon
  ledger/event-sourced'dır, asla körlemesine üzerine yazılmaz (§1, §8, §14).
- **Çekirdek metriklerin determinizmi:** biomass/FCR/SGR/cost backend servisleridir,
  açıklanabilir, versiyonlu metodolojiye sahiptir — kara kutu değildir, AI-türetilmiş değildir
  (§10-§12, §32).
- **Çok kiracılılık ilk-sınıf bir kaygıdır**, sonradan eklenen bir şey değildir (§4, §36).
- **İlk günden çok-yüzeyli:** API sözleşmesi, MVP'de yalnızca web+mobil çıksa da eş zamanlı
  olarak web+mobil+gelecek IoT/AI için tasarlanmıştır (§2, §22, §45).
- **Hassasiyet ve birimler merkezileştirilmiştir**, özellik başına rastgele değildir (§37, §40).
