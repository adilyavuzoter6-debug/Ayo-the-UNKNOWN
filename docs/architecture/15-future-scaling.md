# 15. Gelecek Ölçeklenme Mimarisi

Kapsam: birkaç pilot şirket çalıştıran bir MVP'den, belirtilen uzun vadeli hedef olan 100 → 1.000+
çiftliğe, birçok şirket genelinde, sıfırdan bir yeniden yazım olmadan giden yol. Bu döküman
ölçekleme kaldıraçlarını isimlendirir ve her biri için, bu kaldıracı çekmeyi haklı çıkaran
tetikleyici koşulu belirtir — bunlar açıkça MVP'de uygulanmaz, sadece tasarlanır.

## 15.1 Veritabanı Ölçeklenmesi

**Okuma replikaları.** Raporlama/dashboard okuma yükü, aynı birincil instance için operasyonel
yazma yüküyle (yemleme olayları, ledger yazımları) maddi olarak rekabet etmeye başladığında, bir
okuma replikası ekle ve `reports`/`biomass` geçmiş sorgularını ve dashboard aggregate'lerini
Prisma'nın okuma-replikası desteği ile ona yönlendir. Tetikleyici: birincilin CPU/IO
sıkışıklığının rapor kullanımıyla korelasyonlu olarak sürdürülebilir olması, bir takvim tarihi
değil.

**Tablo partitioning.** Yüksek hacimli, sıkı zaman-sıralı, append-only tablolar — `AuditLog`,
`WaterQualityReading` (özellikle sensör verisi canlı olduğunda, §17/§26), `BatchMovement`,
`FeedInventoryTransaction` — hacim gerektirdiğinde uygulama kodunda hiçbir değişiklik olmadan
ay/çeyrek bazında partition edilecek şekilde tasarlanmıştır (append-only, `occurredAt`-indeksli,
§4.8) (Postgres native declarative partitioning). Tetikleyici: bu tablolardan herhangi birinin
kabaca 50-100M satırı geçmesi veya indeks şişmesinin yazma gecikmesini ölçülebilir şekilde
etkilemesi.

**Row Level Security etkinleştirme.** [06-multi-tenant-security.md](06-multi-tenant-security.md)
§6.2'de kapsandığı gibi, RLS ilk günden şemaya hazır ve connection-pooling etkileşiminin
staging'de yük altında güvenli olduğu kanıtlandıktan sonra bir Faz 2 sağlamlaştırma adımı olarak
etkinleştirilir — kesin olarak ölçeğe bağlı değildir, ama tenant sayısı büyüdükçe giderek önem
kazanan izolasyon hikayesinin veritabanı-katmanı yarısı olduğu için burada gruplanmıştır.

**Sharding / kiracı-bölümlenmiş veritabanları.** Gerçekten büyük ölçekte (1.000 çiftliğin çok
ötesinde, muhtemelen sadece her biri veritabanı-instance-ölçeğinde yük üreten az sayıda çok büyük
kurumsal müşteri varsa ilgili), `companyId`'nin zaten her tabloya denormalize edilmiş olması
sayesinde (§6.3) `companyId`-bazlı sharding stratejisi uygulanabilir hale gelir — RLS'i önemsiz
yapan aynı özellik, tenant-bazlı sharding'i de bir şema yeniden tasarımı değil bağlantı
katmanında bir routing meselesi haline getirir. 1.000 çiftlikte gerekli değil; bu tasarımın onu
dışlamadığını göstermek için burada isimlendirilmiştir.

**Özel-kiracı (dedicated-tenant) deployment'lar (kurumsal katman).** Sözleşmeye bağlı veri-izolasyon
gereksinimleri olan büyük bir kurumsal müşteri, *aynı* kod tabanı ve şemayı kullanarak tamamen
ayrı bir veritabanına (ve isteğe bağlı olarak ayrı bir API deployment'ına) deploy edilebilir —
çünkü kiracı izolasyonu zaten veritabanının paylaşımlı veya özel olmasından bağımsız olarak
uygulama katmanında uygulanır, bu bir deployment-topoloji kararıdır, bir mimari değişikliği değil.

## 15.2 Ölçekte Analitik & Raporlama

**Ne seçildi (ertelenmiş):** İlk başta ayrı bir veri ambarı yok (§29 açık talimatı); raporlama
doğrudan PostgreSQL'e karşı çalışır, sistemde her yerde zaten kullanılan materialize-edilmiş-
projeksiyon deseninden (§4.4.1, §9.6) ve gerektiğinde okuma replikasından (§15.1) yardım alarak.

**Bir ambar ne zaman haklı çıkar:** kiracılar-arası analitik (platform-seviyesi benchmarking,
§42/§43), yoğun ad hoc BI sorgulaması veya ML özellik deposu ihtiyaçları (Faz 3
forecasting/optimizasyon) operasyonel sorgu performansıyla rekabet etmeye başladığında ya da
operasyonel şemada verimli ifade etmesi garip join'ler/aggregation'lar gerektirdiğinde. O noktada,
standart bir CDC pipeline'ı (örn. Postgres lojik replikasyonu → BigQuery/Snowflake/ClickHouse gibi
bir ambar) operasyonel veritabanının **aşağı akışına** eklenir — bu noktada operasyonel şema buna
uyum sağlamak için değişmez; event/ledger tabloları (zaten append-only, zaten zaman damgalı, zaten
tipli), tam olarak [08](08-fish-batch-lineage.md)/[09](09-feed-inventory-ledger.md)'de yapılan
mimari kararlar sayesinde neredeyse ideal CDC kaynaklarına yakındır.

## 15.3 API & Servis Ölçeklenmesi

- **`apps/api`'nin yatay ölçeklenmesi** — bir load balancer arkasında stateless NestJS
  instance'ları; session/kiracı bağlamı istek başına JWT + DB'den çözülür (§6.2), bellek-içi
  sunucu durumundan değil, bu yüzden bu hiçbir mimari değişiklik gerektirmez, sadece daha fazla
  instance.
- **Modülleri ayrı servislere bölmek** — belirli bir modülün (en olası aday `forecasting` veya
  gelecekteki bir computer-vision modülü, §43) geri kalan API'nin deployment profiliyle gerçekten
  uyumsuz kaynak gereksinimleri (GPU, uzun-süren job'lar) olmadıkça süresiz olarak ertelenir.
  Modüler monolit yapısı (§03), bu bölünme gerekirse tek bir modülün klasörünü, sadece sahip
  olduğu tablolara kapsamlanmış kendi Prisma client'ıyla kendi deploy edilebilirine taşımak
  anlamına gelecek şekilde bilinçli olarak seçilmiştir — dağıtık-sistemler yeniden tasarımı değil,
  çünkü modül sınırları (sadece export edilen servisler modüller arası kullanılır, §3.1) zaten
  servis sınırlarına yakındır.
- **BullMQ worker ölçeklenmesi** — API instance'larından bağımsız yatay ölçeklenme (§14.5), job
  kuyruğu bazında (örn. gece toplu çalışmalar sırasında `forecasting` kuyruğuna daha fazla worker
  ayırmak).

## 15.4 Ölçekte Cache Stratejisi

Redis-destekli caching (§27), "dashboard aggregate cache"inden şunları içerecek şekilde genişler:
hesaplanmış yetki kontrolleri (kısa TTL, üyelik değişikliğinde geçersiz kılınır), sık okunan
referans verisi (balık türü kataloğu, yem ürün kataloğu) ve daha fazla API instance'ı genelinde
dağıtık rate-limiting sayaçları. Cache-aside disiplini (§1.2 — "her cache'lenmiş değer
PostgreSQL'den yeniden inşa edilebilir olmalı"), bu genişlemeyi güvenli kılan şeydir: Redis her
zaman veri kaybı olmadan flush edilebilir, sadece yeniden dolarken geçici bir gecikme yaşanır.

## 15.5 AI / ML Ölçekleme Yolu

Faz 3'ün Python servisleri (forecasting, optimizasyon, computer vision), aynı kontrollü analitik
servis katmanının (§10.7, §32) ek tüketicileri/katkıda bulunanları olarak eklenir — doğrudan
veritabanı kimlik bilgileri almak yerine NestJS API'yi (veya dar bir dahili servis-servise API'yi)
çağırırlar, bu yüzden AI kabiliyetini ölçeklendirmek mimariye ek olur, bir yeniden mimari değil.
Bir özellik deposu (ML modelleri ölçekte mühendislik edilmiş özelliklere ihtiyaç duyarsa),
operasyonel veritabanının değil analitik ambarının (§15.2) aşağı akışında yaşar.

## 15.6 IoT / Sensör Ölçeklenmesi

`WaterQualityReading.source: SENSOR` ve `sensorId` alanı (§4.5) zaten yüksek-frekanslı otomatik
veri alımını öngörür; ölçekte bu veri alımı, senkron API istek yolundan, sensör-okuması-başına-
bir-HTTP-POST yerine özel bir veri alım pipeline'ına (örn. bir MQTT broker'ı veya toplu yazan
kuyruk-destekli hafif bir alım endpoint'i) taşınır — burada tek bir sensör entegrasyon ortağı bile
olmadan sensör altyapısını fazla inşa etmeden, şimdi inşa edilen değil tasarlanan bir gelecek
olarak isimlendirilmiştir, tüm ölçümlerin elle olduğunu varsaymamak gerektiğine dair §17'nin
talimatıyla tutarlı olarak.

## 15.7 Ölçekte Uluslararasılaştırma & Çoklu Para Birimi

§39/§40'ın i18n ve birim-sistemi altyapısı (locale-bazlı UI string'leri, sunum-sınırında dönüşüm
ile kanonik dahili birimler), hesaplama servislerine dokunmadan Türkiye/gökkuşağı alabalığının
ötesinde başka türlere, bölgelere ve para birimlerine genişlemeye izin veren şeydir — sadece
sunum katmanı ve referans verisi (tür kataloğu, birim-görüntüleme tercihleri,
`CostEntry.currency`, §4.7) büyümeye ihtiyaç duyar.

## 15.8 Özet — Neden 1.000+ Çiftlik Bir Yeniden Yazımı Zorunlu Kılmaz

Yukarıdaki her ölçekleme kaldıracı, zaten şu özelliklere sahip bir uygulama mimarisinin üzerine
katmanlanmış **eklemeli bir altyapı değişikliğidir** (replika, partition, cache genişlemesi,
aşağı-akış ambarı, ek worker kapasitesi): iki katmanda kiracı-izole (§6), en yüksek hacimli, en
yüksek bütünlükteki iki domain için event/ledger-kaynaklı (§8, §9), uygulanan sınırlarla modüler
(§3), ve birim/hassasiyet-disiplinli (§37). README'de isimlendirilen üç temel karar, tam olarak
olay-sonrası yeniden inşa etmesi aşırı derecede pahalı olan kararlardır — bu yüzden §15.1-§15.6'daki
gerçekten-ertelenebilir maddelerin yanında ertelenmek yerine, MVP'nin ilk migration'ından itibaren
uygulanır.
