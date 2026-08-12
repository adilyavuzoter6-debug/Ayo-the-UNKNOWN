# 11. API Endpoint Mimarisi

## 11.1 Versiyonlama

**Ne seçildi:** NestJS'in yerleşik URI versiyonlaması aracılığıyla URL path versiyonlaması,
`/api/v1/...` (`app.enableVersioning({ type: VersioningType.URI })`).

**Neden:** Path versiyonlaması en açık ve cache-dostu seçenektir, ve görev metninin §25'indeki
tam örnek endpoint'lerle örtüşür. Sahadaki mobil uygulamalar anında zorla güncellenemeyeceğinden
(§22/§24), kırıcı değişiklikler `/v1` eski mobil build'lere hizmet vermeye devam ederken bir
rollout penceresi boyunca `/api/v2/...` olarak sunulabilmelidir — header-tabanlı veya
query-param versiyonlaması bunu altyapı/cache katmanında (CDN, rate limiter) net bir path'ten
daha zor akıl yürütülür hale getirir.

**Değerlendirilen alternatifler:** Header-tabanlı versiyonlama
(`Accept: application/vnd.aquai.v2+json`) — daha "REST açısından saf" ama test/curl/cache etmek
daha zor ve bu tüketici kümesi için pratik bir fayda yok. Hiç versiyonlama yapmamak — mobilin
güncelleme-gecikmesi kısıtlaması göz önüne alındığında açıkça reddedildi.

## 11.2 Kaynak Yapısı

Kaynaklar doğrudan domain hiyerarşisini takip eder:

```
/api/v1/companies
/api/v1/companies/:companyId/users
/api/v1/farms
/api/v1/farms/:farmId/sections
/api/v1/farms/:farmId/dashboard-summary        (aggregate, cache'lenmiş)
/api/v1/tanks
/api/v1/tanks/:tankId                          (mevcut batch durumu, son su kalitesi dahil)
/api/v1/tanks/:tankId/qr                       (QR token'ı → havuz operasyon payload'ına çözer)
/api/v1/fish-batches
/api/v1/fish-batches/:batchId
/api/v1/fish-batches/:batchId/lineage           (tam ledger traversal'ı, §8.5)
/api/v1/fish-batches/:batchId/biomass
/api/v1/fish-batches/:batchId/biomass/recalculate   POST, kısıtlı yetki
/api/v1/fish-batches/:batchId/fcr?from=&to=&methodology=
/api/v1/fish-batches/:batchId/sgr
/api/v1/batch-movements                         Sadece POST (append-only; PATCH/DELETE yok — bkz. 11.5)
/api/v1/feedings
/api/v1/feed-products
/api/v1/feed-inventory/warehouses
/api/v1/feed-inventory/transactions             POST + GET (append-only)
/api/v1/feed-inventory/balances                 GET (türetilmiş, salt-okunur)
/api/v1/mortalities
/api/v1/weight-samples
/api/v1/water-quality-readings
/api/v1/treatments
/api/v1/harvests
/api/v1/harvest-planning/forecasts
/api/v1/cost-entries
/api/v1/reports/{report-name}
/api/v1/alerts
/api/v1/alerts/:id/resolve                       POST
/api/v1/audit-logs                               Sadece GET, yetki-korumalı
/api/v1/files                                    yükleme metadata'sı + imzalı URL üretimi
```

Her liste endpoint'i standart `?page=&pageSize=&sortBy=&filter[...]=` query kurallarını
destekler; her liste örtük olarak kiracı-kapsamlıdır (§6) ve hiçbir zaman bir yetkilendirme
olarak client tarafından sağlanan bir `companyId` filtresini kabul etmez — bu her zaman
session'dan sunucu tarafında türetilir, ve mevcutsa herhangi bir client-sağlanan `companyId`
query parametresi (örn. `PLATFORM_ADMIN` kiracılar-arası görünümler için), onurlandırılmadan
önce çağıranın gerçek yetkilerine karşı doğrulanır.

## 11.3 Yanıt Zarfı (Response Envelope)

**Ne seçildi:** tüm yanıtlar için tutarlı bir zarf:

```json
// Başarı (tek kaynak)
{ "data": { ... }, "meta": { } }

// Başarı (liste)
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 143 } }

// Hata
{
  "error": {
    "code": "TENANT_MISMATCH" ,
    "message": "Kaynak bulunamadı.",
    "details": [ { "field": "quantityKg", "issue": "pozitif olmalı" } ],
    "requestId": "req_9k2..."
  }
}
```

**Neden:** Tutarlı bir zarf, frontend'in TanStack Query katmanının ve mobil uygulamanın bir
yanıt-açma/hata-yönetimi yardımcı programını (`packages/types`'ta) paylaşmasına izin verir ve
`requestId`, her hatayı geri sunucu loglarına bağlar (audit log'la ve varsa APM tracing'le
korelasyonlu) — bu, bir çiftlik işçisinin "uygulama bozuldu" diye rapor ettiği bir destek
biletinden debug edilebilir olması gereken üretim sistemi için önemlidir. Hata `code`'u sabit
makine-okunabilir bir enum'dur (`packages/types`), bu yüzden client kodu davranışa karar vermek
için asla `message`'ı (yerelleştirilmiş olabilir, §39) string-eşleştirmez.

**Değerlendirilen alternatifler:** RFC 7807 Problem Details — hata şekli için makul standart
tabanlı bir alternatif; zarfımız ruh olarak uyumludur (`code`↔`type`, `message`↔`title`) ama
RFC 7807'nin tanımlamadığı `requestId` ve liste `meta.total` kuralını ekler. RFC 7807'yi harfiyen
benimsemek değerlendirildi ve sadece bir başarı zarfı tanımlamadığı için reddedildi — biz ikisi
için de tutarlı tek bir şekil istedik.

## 11.4 OpenAPI / Swagger

Her DTO ve controller üzerindeki `@nestjs/swagger` dekoratörleri aracılığıyla üretilir, üretim
dışı ortamlarda `/api/v1/docs`'ta sunulur (üretimde devre dışı veya auth-korumalı). Bu
spesifikasyon, hem (a) build adımı için `packages/types` request/response interface'lerini
üretmek, hem de (b) elle yazılmış dokümantasyon gerçeklikten sapmadan gelecekteki harici ERP
entegrasyon ortaklarına vermek için kullanılan sözleşmedir.

## 11.5 Ledger Endpoint'leri Tasarım Gereği Append-Only'dir

`POST /api/v1/batch-movements` ve `POST /api/v1/feed-inventory/transactions`'ın bilinçli olarak
**karşılık gelen bir PATCH veya DELETE'i yoktur**. Düzeltmeler, API üzerinden geçmişi düzenleyerek
değil, yeni bir ters/düzeltme kaydı göndererek yapılır (§8.2, §9.5). Bu, sadece bir servis-katmanı
kuralı olarak değil API yüzeyi seviyesinde uygulanır (route'lar basitçe mevcut değildir), böylece
gelecekteki bir geliştiricinin bu dökümanı bilinçli olarak yeniden ziyaret etmeden "hızlı bir
düzenleme" endpoint'i eklemesiyle atlatılamaz.

## 11.6 Mobile'a Özgü API Değerlendirmeleri (§22)

QR-tara-eyleme-geç iş akışı ("5-10 saniyelik veri girişi"), belirli bir endpoint tasarım
kararını yönlendirir: `GET /api/v1/tanks/:tankId/qr` (veya özel bir
`/api/v1/qr/resolve?token=`), mobil client'ın QR token'ını çözdükten sonra 4-5 ayrı çağrı
yapmasını gerektirmek yerine **tek bir aggregate payload** — havuz detayları, aktif batch özeti,
son su okuması, uygulanabilir yem ürünleri — tek bir round trip'te döner. Bu, belirtilen UX
gecikme bütçesiyle gerekçelendirilmiş, katı REST kaynak-başına-endpoint saflığına bilinçli bir
istisnadır; ileride API tasarım sapması sanılmaması için burada dokümante edilmiştir.

## 11.7 Rate Limiting & Idempotency

§36'ya göre, rate limiting gateway/guard seviyesinde uygulanır (API instance'ları genelinde
dağıtık sayım için Redis destekli `@nestjs/throttler`). Mutasyon yapan saha endpoint'leri
(`feedings`, `mortalities`, `batch-movements`), opsiyonel bir client-üretimli `Idempotency-Key`
header'ı kabul eder — mobil için önemli, çünkü zayıf bağlantı (§24) bir client'ın aslında
sunucu tarafında başarılı olmuş bir POST'u tekrar denemesine neden olabilir; idempotency
anahtarları olmadan, tekrarlanan bir yemleme girişi yem tüketimini ve biomass kazancını çift
sayardı.
