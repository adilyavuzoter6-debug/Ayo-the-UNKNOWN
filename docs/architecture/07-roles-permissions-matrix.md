# 07. Roller & Yetki Matrisi

## 7.1 Model

**Ne seçildi:** MVP için sabit bir rol enum'u ile (`Role` enum, §4.2) RBAC, ama yetki
*kontrolü* dağınık `if (role === 'X')` kontrolleri değil, role göre anahtarlanan bir yetki
tablosuna karşı uygulanır — böylece "yetkiler ileride yapılandırılabilir olmalı" (belirtilen bir
gelecek gereksinimi) yetki tablosunun veri kaynağını statik bir map'ten bir veritabanı tablosuna
değiştirmek anlamına gelir, her guard'ı yeniden yazmak değil.

**Neden:** `packages/types`'ta (veya NestJS-only bir eşdeğerinde) tek bir `PermissionsGuard`
tarafından danışılan statik bir `ROLE_PERMISSIONS: Record<Role, Permission[]>` map'i, her
yetkilendirme kararını merkezi ve denetlenebilir tutar ve UI bileşenlerinin "bu kullanıcı Harvest
butonunu görebilir mi" sorusunu React'te rol mantığını yeniden uygulamak yerine aynı yetki
sabitleri üzerinden sorabilmesini sağlar (§5: "Yetkilendirme mantığını doğrudan UI bileşenlerine
gömme" — UI aynı yetki kaynağını *okur*, karar vermez).

**Değerlendirilen alternatifler:** İlk günden tam nitelik-tabanlı erişim kontrolü (ABAC) veya bir
politika motoru (örn. OPA/Cedar) — daha güçlü ve "yetkiler ileride yapılandırılabilir olmalı"
için nihayetinde gerekebilir, ama 9 rollü bir MVP için gereğinden fazla; statik bir RBAC
map'inden DB destekli yapılandırılabilir bir yetki tablosuna geçiş yolu gerektiğinde basittir
(bkz. §7.4), bu yüzden erkenden bu karmaşıklık bedelini ödemiyoruz.

## 7.2 Roller (görev metninden, §5)

| Rol | Açıklama |
|---|---|
| `PLATFORM_ADMIN` | AQUAI personeli; ayrı bir admin yolu üzerinden kiracılar-arası destek erişimi (§6.4) |
| `COMPANY_OWNER` | Şirket içinde faturalama/kullanıcı yönetimi dahil tam kontrol |
| `GENERAL_MANAGER` | Şirketin tüm çiftlikleri genelinde tam operasyonel kontrol |
| `FARM_MANAGER` | Atanmış çiftlik(ler)e kapsamlı tam operasyonel kontrol |
| `VETERINARIAN` | Tedavi/sağlık/aşılama odaklı; biyoloji verisine okuma erişimi |
| `FEED_MANAGER` | Yem stoğu ve yemleme kaydı odaklı |
| `ACCOUNTANT` | Maliyet/finansal veri odaklı; biyolojik operasyonlarda salt-okunur |
| `WORKER` | Saha veri girişi (yemleme, mortalite, örnekleme, su, transfer) |
| `READ_ONLY` | Kendisine verilen kapsamda sadece görüntüleme |

Çiftlik-kapsamı: `FARM_MANAGER`, `VETERINARIAN`, `FEED_MANAGER`, `WORKER`, ve `READ_ONLY`
ayrıca bir `MembershipFarmScope` join tablosu (§4'te gösterilmemiş, burada MVP-bitişik bir
detay olarak eklenmiştir) aracılığıyla bir şirketin çiftliklerinin bir alt kümesine
kapsamlanabilir — 5 çiftlikli bir şirkette bir `FARM_MANAGER` otomatik olarak 5 çiftliğin de
yöneticisi olmaz. `COMPANY_OWNER`, `GENERAL_MANAGER` ve `ACCOUNTANT`, şirketleri içinde örtük
olarak tüm-çiftlik kapsamındadır (finans ve sahiplik rolleri doğaları gereği çiftlikler-arası
görünürlüğe ihtiyaç duyar).

## 7.3 Yetki Matrisi (modül × aksiyon)

Açıklama: **C** = Oluştur (Create), **R** = Oku (Read), **U** = Güncelle (Update), **D** =
Sil/iptal et (her zaman soft), **A** = Onayla-özel-aksiyon (Approve)

| Modül | OWNER | GEN_MGR | FARM_MGR | VET | FEED_MGR | ACCOUNTANT | WORKER | READ_ONLY |
|---|---|---|---|---|---|---|---|---|
| Şirketler (kendi) | CRU | R | R | R | R | R | R | R |
| Kullanıcılar / Roller | CRUD | CRU | R (sadece worker-seviyesi davet) | R | R | R | – | – |
| Çiftlikler / Bölümler / Havuzlar | CRUD | CRUD | CRU (kendi çiftliği) | R | R | R | R | R |
| Balık Partileri | CRUD | CRUD | CRU (kendi çiftliği) | R | R | R | R | R |
| Batch Hareketleri (transfer/split/merge) | CRUD | CRUD | CR (kendi çiftliği) | – | – | R | C (sadece transfer) | – |
| Yemleme | CRUD | CRUD | CRUD (kendi çiftliği) | R | CRUD | R | C | R |
| Yem Stoğu / Ürünler | CRUD | CRUD | R (kendi çiftliği) | – | CRUD | R | R | R |
| Mortalite | CRUD | CRUD | CRUD (kendi çiftliği) | CRU | R | R | C | R |
| Ağırlık Örneklemesi | CRUD | CRUD | CRUD (kendi çiftliği) | R | R | R | C | R |
| Su Kalitesi | CRUD | CRUD | CRUD (kendi çiftliği) | R | R | – | C | R |
| Tedavi / Aşılama | CRUD | CRUD | R (kendi çiftliği) | CRUD | R | R | – | R |
| Biomass (görüntüleme/yeniden hesaplama) | R, A | R, A | R (kendi çiftliği) | R | R | R | – | R |
| Harvest / Harvest Planlama | CRUD, A | CRUD, A | CRU (kendi çiftliği) | R | R | R | C (kayıt girişi) | R |
| Maliyet Muhasebesi | CRUD | CRUD | R (kendi çiftliği) | – | R (yem maliyeti) | CRUD | – | R |
| Alert'ler | R, çöz | R, çöz | R, çöz (kendi çiftliği) | R | R | R | R | R |
| Raporlar | R (hepsi) | R (hepsi) | R (kendi çiftliği) | R (biyo) | R (yem) | R (maliyet) | – | R (kapsamlı) |
| Audit Log | R (hepsi) | R (hepsi) | R (kendi çiftliği, kendi aksiyonları) | – | – | R (maliyetle ilgili) | – | – |
| Bildirim ayarları | CRU (kendi) | CRU (kendi) | CRU (kendi) | CRU (kendi) | CRU (kendi) | CRU (kendi) | CRU (kendi) | CRU (kendi) |

Notlar:
- **Silme her zaman soft-delete/iptal etmedir**, herhangi bir operasyonel tablo için asla hard
  delete değildir (§3, §21) — yukarıdaki "D" kolonu her zaman "iptal edebilir/soft-delete
  edebilir" anlamına gelir, asla "kalıcı olarak silebilir" değil.
- **Onaylama (A)** aksiyonları Create'ten ayrı bir yetkidir — örn. bir `FARM_MANAGER` bir harvest
  *kaydedebilir*, ama maliyet tahsisini kilitleyen tamamlanmış bir harvest'i sonlandırma/onaylama
  şirket ayarlarına bağlı olarak `GENERAL_MANAGER`/`COMPANY_OWNER` ile sınırlı olabilir (bu, Faz
  2'de yapılandırılabilir bir iş akışı haline gelir, MVP'de sabit kodlanmaz).
- `WORKER`'ın erişimi bilinçli olarak en dar **yazma** yüzeyidir (§22'nin mobil saha iş akışıyla
  örtüşür: `FEED`, `MORTALITY`, `WEIGHT`, `TRANSFER`, `TREATMENT` (sadece görüntüleme/talep),
  `WATER`, `HARVEST` (sadece kayıt)) ve etkin biçimde kesişen (cross-cutting) hiçbir okuma erişimi
  yoktur (raporlar, maliyet, audit) — bir işçi diğer çiftliklerin verisini veya finansal bilgileri
  göremez.
- `VETERINARIAN`, kendi uzmanlığı (`Treatments`/`Mortality` neden bağlamı) dışında her yerde
  okuma-ağırlıklıdır; bu, operasyonel değil danışmanlık/gözetim ilişkisini yansıtır.

## 7.4 Yapılandırılabilir Yetkilere Giden Yol (Faz 2+)

Özel roller veya şirket bazlı yetki override'ları gerektiğinde, statik `ROLE_PERMISSIONS` map'i
aynı `PermissionsGuard` tarafından danışılan bir `RolePermission` tablosu (`companyId?, role,
permission, allowed`) ile değiştirilir — guard'ın çağrı imzası (`hasPermission(user, permission,
resourceContext)`) değişmez, sadece cevabı nerede aradığı değişir. Bu yüzden yetki kontrolleri
ilk günden itibaren satır-içi rol karşılaştırmaları değil, isimlendirilmiş bir enum'a karşı
(`guard.check(Permission.FEEDING_CREATE)`) yazılır — *yetkilerin* enum'u (ince taneli), *rollerin*
enum'undan (kaba taneli) özellikle ayrıştırılmıştır, böylece gelecekteki bir özel-rol sistemi her
kontrol noktasını yeniden adlandırmadan bunları karıştırıp eşleştirebilir.
