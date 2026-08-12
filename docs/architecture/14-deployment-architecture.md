# 14. Deployment Mimarisi

## 14.1 Başlangıç Noktası — Vercel + Supabase/Neon

**Ne seçildi:** `apps/web`, Vercel'e deploy edilir; `apps/api`, yönetilen bir PostgreSQL ile
(uygulama zamanında ihtiyaç duyulan WebSocket/queue worker desteğine göre yapılan son seçimle)
bir container platformuna (Railway, Render veya Fly.io) deploy edilir — **Neon** (Vercel preview
deployment'larıyla doğal olarak eşleşen PR-başına-branch veritabanı önizlemeleri için tercih
edilir) veya **Supabase** (Storage/Auth özellikleri veritabanının ötesinde kullanılacaksa tercih
edilir). Yönetilen bir sağlayıcı üzerinden Redis (Upstash — serverless-dostu, bir container
platformu + kullanılıyorsa Vercel edge fonksiyonlarıyla iyi eşleşir).

**Neden burada başlanıyor:** Üretim-öncesi/erken-gelirli bir MVP için, altyapı operasyon
yükünü minimize etmek, küçük bir ekip için ham maliyet verimliliğinden veya maksimum kontrolden
daha önemlidir — küçük bir ekip zamanını Kubernetes'e değil domain'e (ledger doğruluğu, kiracı
izolasyonu) harcamalı. Neon/Supabase'in PR-başına-branch veritabanı özelliği, bu şemanın MVP
inşası sırasında değişeceği sıklık göz önüne alındığında gerçek bir üretkenlik kazancıdır (her
pull request için gerçek bir branch'lenmiş Postgres instance'ına karşı migration'ları test et,
paylaşılan bir dev DB'ye değil).

**Değerlendirilen alternatifler:** İlk günden doğrudan AWS'e (ECS/RDS) deploy etmek — MVP için
reddedildi: bu ölçüm bunu haklı çıkaran ölçeğe (§14.2 aşağı) ulaşılana kadar hiçbir fayda
sağlamadan bu ekip boyutu için daha yüksek kurulum maliyeti ve daha yavaş iterasyon. Self-hosted
VPS — reddedildi: verisi (üretim geçmişi, finansal veri) "asla sessizce kaybetme" gerekliliğine
sahip bir sistem için yönetilen-servis güvenilirliğini (yedekler, failover) kaybeder (§3).

## 14.2 Ortamlar

- **Preview** — PR başına bir tane (Vercel preview + branch'lenmiş Neon DB), merge/kapatma
  sonrası otomatik yıkılır.
- **Staging** — kalıcı, gerçekçi (sentetik) çok-kiracılı veriyle tohumlanmış, deploy-öncesi E2E
  paketi çalıştırmaları ve elle QA/demo için kullanılır.
- **Production** — canlı çok-kiracılı sistem.

Secret'lar (§36), ortam bazında hosting platformunun secret deposu üzerinden yönetilir (Vercel
env değişkenleri, container platformunun secret manager'ı) — asla commit edilmez, asla
ortamlar arasında birebir paylaşılmaz (staging ve production ayrı Clerk instance'ları/anahtarları,
ayrı S3 bucket'ları kullanır, böylece bir staging bug'ı production verisine veya dosyalarına
dokunamaz).

## 14.3 CI/CD Pipeline'ı

```
PR açıldı → CI (typecheck, lint, unit, kiracı-izolasyon paketi dahil integration, E2E smoke)
          → Preview deploy (branch'lenmiş DB'ye karşı web + api)
          → elle inceleme + onay
Main'e merge → CI tam paket (tam E2E dahil) → Staging'e otomatik deploy
              → elle promosyon (veya bir bekleme süresi sonrası otomatik) → Production deploy
              → Prisma migration'ı, yeni API versiyonu trafik almadan ÖNCE ayrı, kapılı bir
                pipeline adımı olarak çalışır (bkz. 14.4)
```

## 14.4 Üretimde Veritabanı Migration'ları

**Ne seçildi:** Migration'lar, yeni uygulama versiyonu trafik almaya başlamadan **önce** açık bir
pipeline adımı olarak (`prisma migrate deploy`) çalışır; geriye-uyumsuz herhangi bir şey için
expand/contract pratiği kullanılır (rollout ortasında çalışmakta olan eski versiyonu kıracak tek
bir migration yerine, yeni nullable kolon ekle → backfill yap → daha sonraki bir deploy'da
non-nullable yap).

**Neden:** Sistem, üretim geçmişini sessizce kaybetmeyi açıkça yasakladığından (§3),
migration'lar ledger-yazımı kodunun kendisiyle aynı dikkatle ele alınır — hiçbir yıkıcı
migration (`DROP COLUMN`, `DROP TABLE`) açık bir yedekleme kontrol noktası ve dokümante edilmiş
bir geri alma planı olmadan çalıştırılmaz ve hiçbir migration, uygulanmış olmasına bağımlı ilk
kodla aynı deploy'da bir güvenlik penceresi olmadan gönderilmez.

## 14.5 Background Job'lar & Worker'lar

BullMQ worker'ları (günlük biomass snapshot'ları, forecast üretimi, alert değerlendirmesi, rapor
üretimi, bildirim teslimatı, import'lar), API'nin HTTP-sunan instance'larından **ayrı bir deploy
edilebilir süreç** olarak çalışır (aynı kod tabanı/`apps/api`, farklı entrypoint/komut), böylece
bir job yükü patlaması (örn. büyük bir CSV import'u), saha-işi yapan kullanıcılar için API istek
gecikmesini yemleme ortasında bozmaz. Bu ayrıca yük desenleri ayrıştıkça worker vs. API
kapasitesinin bağımsız yatay ölçeklenmesine de izin verir.

## 14.6 Gözlemlenebilirlik

- **Yapılandırılmış loglama** (JSON, `requestId` ile korelasyonlu, §11.3), hacim gerektirdiğinde
  hosting platformunun log toplama aracına veya özel bir araca (örn. Axiom/Better Stack) taşınır.
- **Hata izleme** (Sentry), hem `apps/web` hem `apps/api` üzerinde, destek triyajı için hata
  olaylarına eklenmiş kiracı bağlamıyla (companyId, gerekenden fazla PII asla).
- **APM/tracing**, sistemin span-seviyesi detay gerektiren P95 gecikme araştırması için yeterli
  üretim trafiği olduğunda tanıtılır — MVP lansmanı için gerekli değil, ama istek yaşam döngüsü
  (§1.3) bilinçli olarak (guard'lar → interceptor → servis → transaction) yapılandırılmıştır,
  bu yüzden ileride OpenTelemetry span'leri eklemek ek bir iş olacak, bir refactor değil.

## 14.7 Yedekler & Felaket Kurtarma

§3/§36'ya göre ("Backups" açık bir güvenlik gerekliliğidir): ilk üretim deployment'ından itibaren
yönetilen Postgres sağlayıcısının nokta-zamanında kurtarma (PITR) özelliği etkin, dokümante
edilmiş, periyodik olarak test edilmiş bir geri yükleme prosedürüyle (bir tatbikatta hiç geri
yüklenmemiş bir yedek doğrulanmış bir yedek değildir). S3-uyumlu dosya depolama, sağlayıcının
yerleşik dayanıklılık/replikasyonunu kullanır; kritik belge tipleri (veteriner kayıtları,
sertifikalar) ayrıca versiyonlanmıştır (S3 nesne versiyonlaması) böylece kazara üzerine yazma
kurtarılabilirdir.

## 14.8 AWS'e Giden Yol ("Büyüdüğünde: AWS")

Migration tetikleyicileri (bunlardan herhangi biri tek başına AWS migration projesine başlamak
için yeterli gerekçedir):
- Yönetilen platformlardaki sürdürülebilir altyapı maliyeti, AWS'i doğrudan işletmenin mühendislik
  maliyetini aşarsa.
- Kurumsal müşteriler için VPC-seviyesi ağ izolasyonu ihtiyacı (sözleşmeye bağlı/uyumluluk
  gerekliliği, örn. bir müşterinin sözleşmeyle özel-kiracı deployment gerektirmesi — bkz.
  [15-future-scaling.md](15-future-scaling.md)).
- Yönetilen Postgres katmanının uygun maliyetle sunduğundan daha fazla okuma replikası/çok-bölgeli
  okuma ihtiyacı.
- Faz 3 Python AI/ML servisleri için, serverless'ten rezerve AWS kapasitesinde daha maliyet-etkin
  olan daha ağır GPU/compute ihtiyacı.

**Tetiklendiğinde migration şekli:** `apps/api` → ECS Fargate (veya o zamana kadar ekibin
operasyonel olgunluğu ve job/worker topolojisi gerekçelendirirse EKS); PostgreSQL → RDS/Aurora
PostgreSQL (neredeyse sıfır-kesintili geçiş için lojik replikasyon ile veri migration'ı); Redis →
ElastiCache; S3-uyumlu depolama → doğrudan AWS S3 (ara dönemde Cloudflare R2 veya benzeri
kullanıldıysa zaten API-uyumlu, bu yüzden migration'ın bu bacağı neredeyse no-op'tur); `apps/web`
süresiz olarak Vercel'de kalabilir (Vercel bağımsız olarak ölçeklenir ve AWS'e geçmeyi zorlamaz)
veya birleşik-sağlayıcı operasyonları öncelik olursa CloudFront + S3/ECS'e taşınabilir. Bu bilinçli
olarak "aynı mimariyi daha yetenekli altyapıya taşımak" migration'ıdır, yeniden yazım değil —
uygulama katmanını altyapıdan-bağımsız tutarak elde edilir (`apps/api`'nin iş mantığından
doğrudan yönetilen-platforma-özgü API'ler çağrılmaz; depolama erişimi `files` modülünün
S3-uyumlu client soyutlaması üzerinden geçer, §28, böylece somut sağlayıcıyı değiştirmek bir
konfigürasyon değişikliğidir).
