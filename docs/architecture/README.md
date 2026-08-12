# AQUAI — Akuakültür ERP / Çiftlik Yönetimi SaaS
## Mimari İnceleme Paketi

Bu dizin, akuakültür (başlangıçta gökkuşağı alabalığı) çiftlik yönetimi için çok kiracılı
(multi-tenant) bir SaaS platformu olan AQUAI'nin uygulama-öncesi mimari incelemesini içerir.
Mühendislik politikası gereği, **bu inceleme tamamlanıp onaylanmadan hiçbir üretim
uygulama kodu yazılmaz.**

Aşağıdaki her dökümanı yöneten temel tasarım ilkesi:

```
ŞİRKET → ÇİFTLİK → HAVUZ → BALIK PARTİSİ → OPERASYONEL OLAYLAR → BİYOLOJİK DURUM → ANALİTİK → TAHMİN → KARAR
```

Tüm sistemi çapalayan üç taviz verilemez karar var (gerekçeleri ilgili dökümanlarda):

1. **Balık hareketleri değişmez (immutable) bir ledger'dır**, asla mutasyona uğrayan bir `tank_id`
   alanı değildir. → [08-fish-batch-lineage.md](08-fish-batch-lineage.md)
2. **Yem stoğu işlem (transaction) kaynaklıdır**, asla elle üzerine yazılan bir stok rakamı değildir.
   → [09-feed-inventory-ledger.md](09-feed-inventory-ledger.md)
3. **Çok kiracılı izolasyon ilk günden itibaren kurulur**, hem uygulama hem veritabanı katmanında.
   → [06-multi-tenant-security.md](06-multi-tenant-security.md)

### Döküman İndeksi

| # | Döküman | Kapsam |
|---|----------|--------|
| 01 | [Sistem Mimarisi](01-system-architecture.md) | Tüm stack, bileşen diyagramı, istek yaşam döngüsü, alternatif/tradeoff'larıyla teknoloji kararları |
| 02 | [Monorepo Klasör Mimarisi](02-monorepo-structure.md) | `apps/` ve `packages/` için Turborepo/pnpm workspace düzeni |
| 03 | [Backend Modül Mimarisi](03-backend-modules.md) | NestJS domain modül ayrımı ve bağımlılık grafiği |
| 04 | [PostgreSQL Veritabanı Şeması Önerisi](04-database-schema.md) | Tüm temel domainler için Prisma şeması |
| 05 | [Varlık İlişki Haritası](05-entity-relationship-map.md) | Hiyerarşi ve ilişki diyagramları |
| 06 | [Çok Kiracılı Güvenlik Modeli](06-multi-tenant-security.md) | İzolasyon stratejisi, RLS tasarımı, tehdit modeli |
| 07 | [Roller ve Yetki Matrisi](07-roles-permissions-matrix.md) | RBAC rolleri × modül aksiyonları |
| 08 | [Balık Partisi Soy Ağacı (Lineage) Modeli](08-fish-batch-lineage.md) | Değişmez hareket ledger'ı, split/merge/harvest izlenebilirliği |
| 09 | [Yem Stok Ledger Modeli](09-feed-inventory-ledger.md) | İşlem kaynaklı (transaction-sourced) stok tasarımı |
| 10 | [Biyolojik Hesaplama Mimarisi](10-biological-calculations.md) | Biomass / FCR / SGR motorları, açıklanabilirlik |
| 11 | [API Endpoint Mimarisi](11-api-architecture.md) | REST versiyonlama, kaynak tasarımı, hata formatı |
| 12 | [MVP Uygulama Yol Haritası](12-mvp-roadmap.md) | MVP → Faz 2 → Faz 3 sıralaması |
| 13 | [Test Stratejisi](13-testing-strategy.md) | Unit / integration / E2E, tenant-izolasyon testleri |
| 14 | [Deployment Mimarisi](14-deployment-architecture.md) | Ortamlar, CI/CD, küçük başla-sonra-AWS yolu |
| 15 | [Gelecek Ölçeklenme Mimarisi](15-future-scaling.md) | ~100 çiftlikten 1.000+ çiftliğe giden yol |

### Bu paket nasıl okunur

Önemli bir karar içeren her döküman şunları belirtir: **Ne seçildi**, **Neden**,
**Değerlendirilen alternatifler**, ve **Kabul edilen tradeoff'lar**. Bir kararın ertelendiği
yerlerde (örn. ML tabanlı tahminleme, tam offline senkronizasyon) döküman bunu açıkça belirtir ve
ertelenen işin neden ileride bir yeniden yazıma zorlamayacağını, şimdiden hangi altyapının
kurulduğunu açıklar.
