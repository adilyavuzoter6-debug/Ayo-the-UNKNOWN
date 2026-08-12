# 06. Çok Kiracılı Güvenlik Modeli

## 6.1 Tehdit Modeli

Bu dökümanın savunduğu birincil tehdit: **Şirket A'nın bir kullanıcısının, bir istekteki bir ID'yi
manipüle ederek, yeni bir endpoint'teki eksik bir yetki kontrolünü istismar ederek veya bir
rapor/aggregate sorgusundaki kiracı filtresini unutan bir bug'ı istismar ederek Şirket B'ye ait
veriyi alması, değiştirmesi veya çıkarım yapması**. Domain göz önüne alındığında (üretim verisi,
finansal veriler, büyüme performansı gibi biyolojik ticari sırlar), kiracılar-arası bir sızıntı
küçük bir bug değil ciddi bir olaydır — bu yüzden izolasyon bir UX güzelliği değil bir güvenlik
sınırı olarak ele alınır.

## 6.2 Derinlemesine Savunma — İki Bağımsız Katman

**Ne seçildi:** Kiracı izolasyonu hem **uygulama** hem **veritabanı** katmanında, bilinçli olarak
tekrarlı biçimde uygulanır.

**Neden:** Tek katmanlı bir savunma, kod tabanının herhangi bir yerinde kaçırılan tek bir
kontrolün tam bir kiracı-izolasyonu ihlali olması demektir. İki bağımsız katman, bir uygulama
katmanı bug'ının (yeni bir servis metodunda unutulmuş bir `WHERE companyId = ...`) hâlâ
veritabanı katmanı tarafından yakalanması demektir, ve tersi de geçerlidir. Bu standart bir
derinlemesine savunma pratiğidir ve görev metninde açıkça istenmiştir (§4: "Kiracı izolasyonunu
şu iki seviyede uygula: 1. Uygulama/servis seviyesi 2. Veritabanı erişim seviyesi").

### Katman 1 — Uygulama/Servis Seviyesi (birincil, her zaman aktif)

1. **Kiracı bağlamı çözümü istek başına merkezi olarak bir kez gerçekleşir** — bir NestJS
   `TenantContextInterceptor`'ı (veya `AsyncLocalStorage` destekli bir istek-kapsamlı provider),
   `companyId`'yi **doğrulanmış Clerk kullanıcı id'si** kullanılarak veritabanından
   (`CompanyMembership` tablosu) aranan, **kimlik doğrulaması yapılmış kullanıcının mevcut
   üyeliğinden** çözer — **asla** bir istek gövdesi alanından, query parametresinden veya
   olduğu gibi kabul edilen özel bir JWT claim'inden değil. Bir kullanıcı birden fazla şirketin
   üyesiyse, aktif şirket açık, sunucu tarafında doğrulanan bir mekanizma ile seçilir (örn.
   yalnızca girişte değil her istekte mevcut üyeliğe karşı yeniden doğrulanan şirket-kapsamlı bir
   session claim'i).
2. **Her repository/sorgu metodu çalışmak için bir kiracı bağlamı gerektirir.** Her modüldeki
   Prisma repository yardımcıları, kiracı bağlamı olmadan bir sorgu yazmayı yapısal olarak zor
   kılacak şekilde yazılır — örn. her yerde dağınık `prisma.tank.findMany(...)` çağrıları yerine
   her yerde kullanılan paylaşılan bir `withTenant(companyId)` sorgu-oluşturucu sarmalayıcısı. Kod
   incelemesi, kiracı-kapsamlı yardımcıdan geçmeyen çıplak bir `prisma.<model>.findMany`'yi
   engelleyici bir bulgu olarak ele alır.
3. **Her okuma ve mutasyon yapan endpoint, istenen kaynağın `companyId`'sinin çözülen kiracı
   bağlamıyla eşleştiğini yeniden doğrular**, kaynak kendi primary key'i ile bulunsa bile (örn.
   `GET /api/v1/tanks/:id` havuzu yükler, ardından döndürmeden önce `tank.companyId ===
   ctx.companyId` olduğunu doğrular — uyumsuzlukta bir `403` değil `404` döner, böylece kaynağın
   varlığı sızdırılmaz).
4. **RBAC, kiracı çözümünden sonra kontrol edilir, onun yerine değil** — bir route rol ile
   yetkilendirilebilir (`FARM_MANAGER` feeding olayları oluşturabilir) ama yine de çözülen
   kiracıya kapsamlanmalıdır; rol ve kiracı ikisi de gerekli bağımsız iki kontroldür
  (`RolesGuard` + `TenantScopeGuard`).

### Katman 2 — Veritabanı Seviyesi (derinlemesine savunma, RLS'e hazır)

**Ne seçildi:** Her kiracıya ait tabloyu, **PostgreSQL Row Level Security politikalarının ileride
bir şema migration'ı olmadan etkinleştirilebilmesi** için özellikle denormalize bir `companyId`
kolonuyla (§4.1) tasarla, ve ekip, MVP sonrası zaman bulduğunda temel bir RLS politika kümesini
etkinleştir.

**Neden şimdi "RLS'e hazır", "RLS etkin" değil:** RLS, uygulamanın veritabanı bağlantısının her
istekte/transaction'da bir session-local değişken ayarlamasını gerektirir (`SET LOCAL
app.current_company_id = '...'`), bu da connection pooling (transaction modunda PgBouncer) ile
dikkatli test edilmesi gereken şekillerde etkileşir — buradaki ince bir yanlış yapılandırma
sessizce RLS'i devre dışı bırakabilir veya havuzlanmış bağlantılar arasında sızıntıya neden
olabilir. RLS'i acele MVP'ye sokup yanlış yapılandırılmış bir politikadan yanlış bir güvenlik
hissine kapılmak yerine, MVP uygulama-katmanı savunmasını birincil uygulanan kontrol olarak
gönderir (kapsamlı test edilmiş, [13-testing-strategy.md](13-testing-strategy.md)'deki
kiracı-izolasyon test paketi dahil), şema ve bağlantı-yönetimi kodu ise ilk günden RLS'i
etkinleştirmeyi bir yeniden tasarım değil bir konfigürasyon değişikliği yapacak şekilde yazılır:

- Her tabloda `companyId` mevcut ve indekslidir (zaten §4.1'de performans nedenleriyle gerekli,
  bu yüzden bu sıfır ek maliyettir).
- Prisma `PrismaService`, istek başına RLS session değişkenini ayarlamak için dokümante edilmiş
  bir kanca noktasıyla yazılır, RLS devre dışıysa başlangıçta no-op'tur, böylece bu altyapı
  production'da güvenilmeden önce staging'de kanıtlanır.
- Tablo başına `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` ekleyen bir migration hazırlanır ve
  belirsiz bir "bir gün" olarak değil bir Faz 2 görevi olarak takip edilir.

**Değerlendirilen alternatifler:** RLS'i ilk migration'dan itibaren etkinleştirmek. MVP zaman
çizelgesi nedenleriyle yukarıda belirtildiği gibi reddedildi — ince bir şekilde bozuk bir RLS
politikası gönderme riski (bu, hiç RLS olmamasından *daha kötü* olabilir, çünkü yanlış bir güven
hissi yaratır), uygulama-katmanı kontrolünün zaten dikkatle inşa edilip test edildiği bir aşamada
sağlayacağı faydadan ağır basar. Kiracı başına ayrı veritabanı (veya ayrı şema) — reddedildi:
"1.000+ çiftlik" ölçeğine operasyonel olarak ölçeklenmez (migration'lar, connection pooling ve
platform-seviyesi kiracılar-arası raporlama hepsi çok daha zor hale gelir) ve RLS tek bir
veritabanı içinde eşdeğer izolasyon sağladığından gereksizdir. Belirli bir müşteri sözleşmeyle
fiziksel veri ayrımı gerektirmedikçe yalnızca gelecekteki bir "özel instance" kurumsal katman için
saklanır — bkz. [15-future-scaling.md](15-future-scaling.md).

## 6.3 Neden `companyId` Her Tabloya Denormalize Edilmiştir (sadece join ile türetilebilir değil)

`Tank → FarmSection → Farm → Company` üzerinden yukarı doğru join gerektiren bir kiracı filtresi
hem daha yavaştır (her sorguda çok-adımlı join) hem de daha hataya açıktır (yanlış yol üzerinden
join yapan bir sorgu, veya gelecekteki bir analitik özelliği tarafından yazılan ham bir SQL
sorgusu, yanlışlıkla bir adımı atlayabilir). `companyId`'yi her alt tabloya denormalize etmek,
kiracı kontrolünü her yerde tek bir indekslenmiş eşitlik filtresi haline getirir ve RLS
politikalarını (§6.2 Katman 2) hiyerarşi üzerinden alt sorgu gerektiren politikalar yerine önemsiz
tek-kolonlu `USING (company_id = current_setting('app.current_company_id')::text)` politikaları
haline getirir. Bedeli, `companyId`'nin her insert'te oluşturma anında doğru ve değişmez şekilde
ayarlanması gerektiğidir (yalnızca üst modülün servisi aracılığıyla alt kayıtlar oluşturularak
uygulanır, `companyId`'yi ebeveynden damgalayarak, asla client girdisinden değil).

## 6.4 PLATFORM_ADMIN Bilinçli Bir İstisnadır, Sıkı Kontrol Altındadır

`PLATFORM_ADMIN` (dahili AQUAI personeli), kiracılar arası hareket edebilen (örn. destek için) tek
roldür. Bu, normal kiracı guard'ında bir bypass bayrağı olarak değil **ayrı bir kod yolu** olarak
uygulanır: platform-admin endpoint'leri ayrı bir route prefix'inde yaşar (`/api/v1/admin/...`),
ayrı bir yetki kontrolü gerektirir ve bir platform admin'in her kiracılar-arası okuma/yazması
yükseltilmiş detayla audit-log'lanır (§21), hangi kiracıya erişildiği ve neden (admin aksiyonlarında
zorunlu bir "sebep" alanı) dahil. Bu, "admin'ler için kiracı kontrolünü devre dışı bırak"ın, bir
bug'ın yanlışlıkla non-admin rollere maruz bırakabileceği gizli bir arka kapıya dönüşmesini önler.

## 6.5 Şirket-Kapsamlı Benzersizlik ve ID Sızıntısı

- ID'ler sıralı tamsayı değil `cuid()` string'leridir, bu yüzden hiçbir kiracı ID sayımıyla başka
  bir kiracının kayıt sayılarını veya büyüme hızını çıkaramaz.
- Tasarım gereği sıralı/tahmin edilebilir olan insan-yüzlü kodlar (`LOT-2026-00125` gibi
  `lotCode`, `Farm.code`) global değil `@@unique([companyId, code])` şeklinde kapsamlanır — bu, iş
  kimliği benzersizlik kısıtlamasıdır, güvenlik ID'siyle ilgisizdir ve yanında `companyId`
  filtresi olmadan yetkilendirme-hassas sorgularda asla arama anahtarı olarak kullanılmaz.

## 6.6 Gerekli Otomatik Test: Kiracılar-Arası Erişim Yapısal Olarak İmkansız Olmalı

§35/§36 gereği, kod tabanındaki en önemli test paketi, bir Şirket A kullanıcısının Şirket B'nin
`fish-batches`, `tanks`, `feeding`, `mortality` vb. verilerine erişemediğini — Şirket A ile
doğrulanmış bir isteğe Şirket B ID'sini elle koyarak dahil — doğrular. Bu tam olarak
[13-testing-strategy.md](13-testing-strategy.md) §13.4'te belirtilmiştir ve bir release gate
olarak ele alınır: bu paket başarısız olursa hiçbir deploy devam etmez.
