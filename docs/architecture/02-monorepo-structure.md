# 02. Monorepo Klasör Mimarisi

## 2.1 Karar

**Ne seçildi:** **pnpm workspaces + Turborepo** kullanan tek bir monorepo.

**Neden:** Ürün, web, mobil ve paylaşılan bir backend'in tipler ve validasyonu paylaşarak birlikte
evrilmesine açıkça ihtiyaç duyuyor (§33). Bir monorepo, tek bir PR'ın bir Prisma modelini, NestJS
DTO'sunu, paylaşılan Zod şemasını ve iki frontend formunu atomik olarak değiştirebilmesi, CI'ın
paketler arası kırılmayı anında yakalaması demektir. Turborepo, tüm paketler arasında (`apps/api`,
`apps/web`, `apps/mobile` ve 6+ paylaşılan paket mevcut olduğunda önemli hale gelir) artımlı,
cache'lenmiş build/test verir ve web app'in build pipeline'ı için Vercel ile temiz entegre olur.

**Değerlendirilen alternatifler:** Nx — daha güçlü generator'lar/graph görselleştirme, bu ekip
boyutu için başlangıçta daha dik konfigürasyon ve daha ağır; Turborepo'nun daha basit `turbo.json`
pipeline modeli ihtiyaçlarımız için yeterli ve kod-üretimi ihtiyaçları büyürse yeniden
değerlendirilebilir. Polyrepo (web/api/mobil için ayrı repolar) — reddedildi: `packages/types` ve
`packages/calculations`'ı sadece paylaşmak için harici npm paketleri olarak yayınlamamızı/
versiyonlamamızı zorlar, ekip boyutuyla orantısız release yükü ekler ve "her yerde aynı backend
tipleri" gerekliliğini (§45) dürüst tutmayı zorlaştırır.

**Kabul edilen tradeoff'lar:** Bir monorepo, paket sınırları (aşağıda §2.3) konusunda disiplin
gerektirir — örneğin, backend-only iş mantığının frontend'in import ettiği paylaşılan bir pakete
sızmaması için. Bunu sadece kurala değil, lint kurallarına bağlıyoruz (aşağıya bakın).

## 2.2 Klasör Düzeni

```
aquai/
├── apps/
│   ├── web/                     # Next.js app (sahipler, yöneticiler, veterinerler, finans)
│   ├── api/                     # NestJS backend — tek iş mantığı kaynağı
│   └── mobile/                  # Expo React Native app (saha operasyonları)
│
├── packages/
│   ├── types/                   # API sözleşmeleri için paylaşılan TS tip/interface'leri
│   │                             # (kısmen OpenAPI'den üretilir, domain enum'ları için elle
│   │                             # bakımı yapılır)
│   ├── validation/               # Web formları ile paylaşılan Zod şemaları, uygun olan yerlerde
│   │                             # backend DTO'ları tarafından yansıtılır — sadece girdi
│   │                             # *şekli*, asla iş kuralı veya hesaplama değil
│   ├── calculations/              # ⚠ Frontend'de runtime'da PAYLAŞILMAZ. Bağımsız test
│   │                             # edilebilmesi için burada, ama sadece apps/api tarafından
│   │                             # tüketilir. Aşağıdaki nota bakın — bu, sırf test edilebilirlik
│   │                             # için birlikte konumlandırılmış, kural + lint kuralıyla
│   │                             # backend-only bir pakettir.
│   ├── ui/                        # shadcn/ui tabanlı paylaşılan bileşen ilkelleri (sadece web;
│   │                             # mobilin RN'in farklı render modeli nedeniyle kendi
│   │                             # ilkelleri var)
│   ├── config/                    # Paylaşılan ESLint/Prettier/TS temel konfigürasyonları
│   ├── tsconfig/                  # Paylaşılan tsconfig temelleri (strict mode zorunlu)
│   └── i18n/                      # Paylaşılan çeviri anahtarları/yükleyici (bkz. §39)
│
├── docs/
│   └── architecture/              # Bu döküman seti
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## 2.3 Paket Sınırı Kuralı (önemli mimari koruma)

`packages/calculations` (biomass, FCR, SGR, mortality-rate, stok-türetme, cost allocation), test
edilebilirlik ve tekrar kullanım için fiziksel olarak `packages/` içinde ama **sadece backend
içinde** (örn. gelecekteki bir `apps/forecasting-worker`) kullanılmalıdır. `apps/web` veya
`apps/mobile` tarafından **asla** import edilmemelidir. Bu şu şekilde uygulanır:

- `packages/config` içinde `apps/web/**` ve `apps/mobile/**`'in `@aquai/calculations`'ı import
  etmesini yasaklayan bir dependency-cruiser / ESLint `no-restricted-imports` kuralı.
- Neyin import edilebilir olduğunu kısıtlayan paket `exports` alanı.

**Neden önemli:** §45 ve görev metni açıktır — "Asıl iş mantığını doğrudan Next.js bileşenleri
içine koyma" ve "Backend-only iş mantığını frontend kodla paylaşma." Monorepo'daki risk,
paylaşımın *çok kolay* olmasıdır; bir geliştirici deadline baskısı altında bir API round trip'ten
kaçınmak için FCR hesaplayıcısını bir dashboard bileşenine import edebilir. Lint kuralı bunu bir
code-review takdirine değil, bir build hatasına dönüştürür.

`packages/types` ve `packages/validation` ise tam tersine her yerde paylaşılmak üzere güvenli ve
amaçlanmıştır — hiçbir mantık içermezler, sadece şekil ve format validasyonu (örn. "miktar,
en fazla 2 ondalık basamaklı pozitif bir decimal olmalı") — bu da client ve server'da meşru olarak
aynıdır.

## 2.4 Paket Sınırları İçin Değerlendirilen Alternatifler

`packages/types`'ı tamamen NestJS OpenAPI spesifikasyonundan üretmek (örn.
`openapi-typescript` ile), tek frontend tip kaynağı olarak elle bakımı yapılan tekrarlanan
interface'leri elemek değerlendirildi. **Karar: pratik olan yerde (request/response DTO'ları) bunu
benimse**, ama domain enum'larını (balık türleri, mortality nedenleri, olay tipleri)
`packages/types`'ta elle bakımlı tut, çünkü bunlar OpenAPI üretiminin garip kaldığı yerlerde
(Zod enum şemaları, i18n anahtar eşleme) build zamanında referans alınır. Bu, %100 codegen veya
%100 elle yazım yerine pragmatik bir orta yoldur.
