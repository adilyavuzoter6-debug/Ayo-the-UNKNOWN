# 10. Biyolojik Hesaplama Mimarisi

## 10.1 Tasarım İlkesi

Biomass, FCR ve SGR, platformun çekirdek deterministik KPI'larıdır (görev metninin §44'ü:
"BIOMASS, FCR, MORTALITY, GROWTH, HARVEST FORECAST"). `packages/calculations` içinde yaşarlar
(backend-only, §2.3), gizli durumu olmayan açık girdilerle saf fonksiyonlardır, kapsamlı unit
test edilirler (§13, [13-testing-strategy.md](13-testing-strategy.md)) ve versiyonludurlar,
böylece bir metodoloji değişikliği tarihsel raporların anlamını asla sessizce yeniden yazmaz.

**Mimari olarak ne seçildi:** her metrik için bir **strategy-pattern hesaplama servisi** —
`BiomassCalculationService`, `FcrCalculationService`, `SgrCalculationService` — her biri bir
`methodology` tanımlayıcısı kabul eder ve belirli bir saf-fonksiyon uygulamasına delege eder;
metodoloji tanımlayıcısı her kalıcı sonucun yanında saklanır (`BiomassSnapshot.methodology`,
§4.7), böylece sonuçlar olay sonrası açıklanabilir kalır ("bu FCR, `fcr.biomass_gain.v1`
metodolojisiyle hesaplandı").

**Neden:** §11/§12, zaman içinde birden fazla FCR metodolojisi desteğini (açıkça) ve
açıklanabilirliği ("SGR hesaplaması için kullanılan ölçümleri, hesaplamalar açıklanabilir olacak
şekilde sakla") gerektirir. Tek bir sabit-kodlanmış formül MVP için çalışırdı ama ya (a) formül
iyileştiğinde tarihsel sayıları sessizce değiştirmeye ya da (b) tüm hesaplama boru hattını ileride
çatallamaya zorlardı. Versiyonlu, isimlendirilmiş metodolojiler ikisini de çözer: eski raporlar
hesaplandıkları formülü belirtmeye devam eder; yeni hesaplamalar iyileştirilmiş bir metodolojiye
opt-in yapabilir; metodolojiler arası A/B karşılaştırması doğrulama için mümkün hale gelir.

**Değerlendirilen alternatifler:** Sadece okuma-anında hesaplama (saklanmış snapshot yok, her
zaman canlı türet) — tek mekanizma olarak reddedildi çünkü pahalı aggregate sorgular (bir
şirketin tüm geçmişi genelinde biomass) dashboard gecikme gereksinimlerine ölçeklenmez; snapshot'lar
+ talep-üzerine-yeniden-hesapla-eğer-eskimişse hibrit modeli doğru olandır (§10 ile örtüşür:
"gerektiğinde raporlama için tarihsel biomass snapshot'larını koru", canlı türetmeyle birlikte
mevcut durum için).

## 10.2 Kanonik Birimler (tüm hesaplama servisleri genelinde bağlayıcı)

Görev metninin §37'sine göre:

| Miktar | Kanonik birim | Depolama tipi |
|---|---|---|
| Balık sayısı | tamsayı | `Int` |
| Bireysel balık ağırlığı | gram (g) | `Decimal(10,3)` |
| Biomass (toplam) | kilogram (kg) | `Decimal(12,3)` |
| Yem miktarı | kilogram (kg) | `Decimal(12,3)` veya `(10,3)` |
| Finansal değerler | para birimi decimal'i, bağlama göre 2–4 ondalık | `Decimal` |
| FCR | boyutsuz oran | `Decimal(6,3)` |
| SGR | %/gün | `Decimal(6,3)` |

Gram/kilogram arası dönüşüm **sadece** hesaplama-servisi sınırlarında gerçekleşir (örn. biomass =
sayı × ortalama-ağırlık-gram ÷ 1000 → kg), asla örtük değil. Görüntüleme-birimi dönüşümü
(kg↔lb, °C↔°F) **sadece** sunum katmanında gerçekleşir (§40) — veritabanı ve tüm backend
servisleri, bir çiftliğin görüntüleme tercihinden bağımsız olarak her zaman yukarıdaki kanonik
birim kümesinde çalışır.

## 10.3 Biomass Motoru

**Formül (temel):** `Biomass kg = Balık Sayısı × Ortalama Balık Ağırlığı kg`

**Ne seçildi:** Biomass **türetilir**, birincil saklanan gerçek değil, şunlardan hesaplanır:
- `BatchTankState.estimatedCount` (kendisi hareket ledger'ı + mortaliteden türetilmiş, §4.4.1)
- O batch için en son geçerli `WeightSample.avgWeightG` (veya örnekler arasında yapılandırılabilir
  bir büyüme-eğrisi enterpolasyonu kullanan enterpole/azaltılmış bir tahmin — bkz. §10.5)
- Son ağırlık örneğinden sonra gerçekleşen hareket/mortalite/harvest'ler için düzeltmeler

**Neden naif olarak "sayı × son bilinen ağırlık" değil:** çünkü sayının kendisi ağırlık örnekleri
arasında değişir (mortalite, transferler) ve yaşını kabul etmeden eski bir ağırlığı kullanmak
hassasiyeti abartır. Motor, ağırlık tahmininin *ne zamana ait* olduğunu takip eder ve sayının
yanında bir "güven"/eskime göstergesi sunar (örn. "9 gün önce örneklendi"), aslında kaba bir
ekstrapolasyon olan hassas görünen bir sayı sunmak yerine — bu doğrudan açıklanabilirliğe hizmet
eder ve "biomass'ı tek gerçek kaynak olarak saklama" ile (§10) örtüşür.

**Kalıcı snapshot'lar:** Her aktif batch/havuz için zamanlanmış bir BullMQ job'ı tarafından
üretilen günlük bir `BiomassSnapshot` (§4.7), böylece zaman-serisi raporlama ve forecasting
girdileri her okumada geçmişi yeniden hesaplamayı gerektirmez. Talep-üzerine yeniden hesaplama da
sunulur (`POST /api/v1/fish-batches/:id/biomass/recalculate`, §7.3'e göre `A` (onaylama)
yetkisine sahip rollerle kısıtlanmış), "yeni bir ağırlık örneği geldi, güncel biomass'ı şimdi
göster, gecenin job'ını bekleme" gibi durumlar için.

## 10.4 FCR Motoru

**Temel formül:** `FCR = Tüketilen Yem / Biomass Kazancı`

**Ne seçildi:** Görev metninin §11'inde listelenen her faktörü açıkça hesaba katan, sadece naif
formülü değil, dönem-bazlı bir FCR hesaplaması:

```
Biomass Kazancı = (Bitiş Biomass + Harvest ile Çıkarılan Biomass + Mortalite ile Çıkarılan Biomass
                + Transfer ile Çıkan Biomass)
             − (Başlangıç Biomass + Transfer ile Giren Biomass)
FCR = Toplam Tüketilen Yem (kg, batch/havuz/dönem için FeedInventoryTransaction
      FEED_CONSUMPTION satırlarından) / Biomass Kazancı (kg)
```

Bu, açık bir `(batchId veya tankId, periodStart, periodEnd)` başına hesaplanır — servis
"stoklamadan beri" varsaymak yerine açık bir dönem kabul eder, çünkü çiftlikler farklı operasyonel
sorular için hem döngü-başlangıcından-bugüne FCR'ye hem de kayan pencere FCR'ye (örn. son 30 gün)
ihtiyaç duyar.

**Neden naif değil daha eksiksiz formül:** Naif `yem / (bitiş ağırlığı − başlangıç ağırlığı)`
formülü, dönemde herhangi bir transfer veya kısmi harvest olduğunda, başka nedenlerle
havuzdan çıkan/giren biomass'ı görmezden geldiği için sessizce yanlış (genellikle absürt derecede
düşük veya negatif) FCR üretir. Transferler ve kısmi harvest'ler rutin çiftlik operasyonları
olduğundan (edge case değil), transferleri/harvest'leri hesaba katmayan bir FCR motoru,
çok-havuzlu büyütme yapan herhangi bir çiftlikte çoğu zaman yanlış olurdu — tam olarak bu yüzden
§11 bunu açıkça belirtir ("Basitleştirilmiş bir FCR uygulaması oluşturma").

**Tasarımca desteklenen birden fazla metodoloji:** strategy pattern (§10.1), en azından şunları
öngörür: (a) yukarıdaki basit dönem FCR'si, (b) mortalite biomass'ı için normalize edilmiş
biyolojik FCR (bazı operatörler, ölen balıklara "yatırılan" yemin büyüme verimliliğine karşı
sayılmaması gerektiği görüşüyle ölü-balık biomass'ını kazanç hesaplamasından hariç tutar —
sektörde gerçek bir metodolojik anlaşmazlık), (c) ekonomik FCR (yem maliyeti / değer kazancı,
[cost-accounting]'e beslenir). MVP metodoloji (a)'yı gönderir; servis arayüzü, (b)/(c)'nin yeni
boru hatları değil yeni strategy uygulamaları olacak şekilde inşa edilir.

## 10.5 SGR Motoru

**Formül:** `SGR %/gün = ((ln(bitiş ağırlığı) − ln(başlangıç ağırlığı)) / gün sayısı) × 100`

**Ne seçildi:** SGR sıkı bir şekilde bir batch için **gerçek `WeightSample` çiftlerinden**
hesaplanır (asla türetilmiş/enterpole edilmiş biomass tahminlerinden değil) ve kullanılan spesifik
örnek ID'leri, sadece sayı değil sonucun yanında saklanır (`SgrCalculationResult {
initialSampleId, finalSampleId, sgrPctPerDay, periodDays }`) — "SGR hesaplaması için kullanılan
ölçümleri, hesaplamalar açıklanabilir olacak şekilde sakla" (§12) gerekliliğini harfiyen
karşılar: herhangi bir raporda bulunan bir SGR değeri, onu üreten tam olarak iki örnekleme
olayına kadar izlenebilir.

**Büyüme-eğrisi enterpolasyonunda kullanımı:** bir batch'in zaman içindeki SGR değerleri dizisi,
tam olarak §10.3'ün "örnekler arasında ağırlığı enterpole et" ihtiyacı ve Forecasting Motorunun
([12-mvp-roadmap.md] Faz 2/3, görev metninin §19'u) tarihsel büyüme-eğrisi girdisi olarak
ihtiyaç duyduğu şeydir — bu yüzden ham ağırlık örnekleri asla yok edilmez (§16) ve bu yüzden SGR,
düzgünleştirilmiş/türetilmiş veriden değil doğrudan onlardan hesaplanır.

## 10.6 Mortalite Oranı

Yukarıdakiler gibi tek bir "motor" değil, ama gerektiği her yerde tutarlı bir şekilde hesaplanır:
`Mortalite Oranı % = Dönemde Ölen Balık / Dönem Başındaki Tahmini Popülasyon × 100`, hem basit bir
dönem oranı olarak hem de (gelecekteki mortalite-anomalisi alert'i için, §15/§30) bir kayan
baz-çizgi (rolling baseline) karşılaştırması olarak — "Havuz A17 mortalitesi 30 günlük
baz-çizgisinin 7,8 katı üzerinde" bir kayan ortalamayı saklamayı/sorgulamayı gerektirir; bu,
`MortalityEvent` indekslemesinin (§4.5, `(companyId, tankId, occurredAt)`) verimli olarak
desteklemek üzere inşa edildiği bir sorgu desenidir.

## 10.7 Bunların Hiçbiri Neden AI-Türetilmiş Değildir

Görev metninin §32'sine ve açık talimatına göre, bu mimaride biomass/FCR/SGR/mortalite/maliyetin
hiçbiri bir AI/ML modeli tarafından hesaplanmaz veya yaklaşıklanmaz. Bunlar deterministik, test
edilebilir, açıklanabilir TypeScript servisleridir. AI'ın rolü (Faz 3,
[15-future-scaling.md](15-future-scaling.md)) bu zaten-hesaplanmış, zaten-güvenilir sayıları
*sorgulamak ve açıklamaktır* ("FCR neden arttı") — asla bir çiftlik yöneticisinin bir hasat
kararını temel aldığı sayıyı üreten şey olmak değil.
