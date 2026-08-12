# 08. Balık Partisi Soy Ağacı (Lineage) Modeli

Bu, tüm platform için üç temel karardan biridir (bkz. README). Bunu baştan doğru yapmak, ürünün
çekirdeğini daha sonra yeniden yazmakla doğru yapmak arasındaki farktır; kullanıcı bunu en yüksek
kaldıraçlı mimari karar olarak açıkça belirtmiştir.

## 8.1 Ne Seçildi

**Değişmez, sadece-ekleme (append-only) bir hareket ledger'ı** (`BatchMovement`, §4.4), balıkların
nerede olduğunun ve batch'lerin birbiriyle nasıl ilişkilendiğinin tek gerçek kaynağıdır.
`FishBatch.currentTankId`-tarzı değiştirilebilir alanlar mevcut değildir. Her stoklama, transfer,
split, merge ve harvest-çıkarma yeni bir satırdır; mevcut satırlar asla güncellenmez veya
silinmez. Mevcut durum (bir batch'in hangi havuz(lar)da olduğu, kaç balık) **türetilmiş, yeniden
inşa edilebilir bir projeksiyondur**, gerçek kaynak değil.

## 8.2 Neden

1. **Düzenleyici/ticari izlenebilirlik.** Akuakültür alıcıları, sertifikasyon kuruluşları ve
   düzenleyiciler giderek "bu hasat edilmiş balık partisi hangi havuzdan geçti, hangi yem
   lotlarını, hangi tedavileri hayatı boyunca deneyimledi" bilgisini istiyor — değiştirilebilir
   bir mevcut-durum modeli bunu bir transfer olur olmaz yok eder. Bir ledger bunu kalıcı olarak
   korur.
2. **Split ve merge işlemleri tek bir foreign key ile temsil edilemez.** 3 havuza bölünmüş, sonra
   bu havuzlardan ikisinin kalan balıkları büyütme için yeni bir batch'te birleştirilmiş bir
   batch — bu bir grafiktir (DAG), bir ağaç değildir ve kesinlikle tek bir `tankId` kolonu
   değildir. Bunu bir ledger tablosunda kenarlar olarak modellemek, bilgi kaybetmeyen tek
   temsildir.
3. **Düzeltmeler geçmişi yok etmemelidir.** Çiftlik veri girişi gerçek dünya koşulları altında
   gerçekleşir (bir işçi yanlış sayar, ertesi gün düzeltir). Değişmez bir ledger bunu, orijinal
   satırı düzenlemek yerine bir **ters kayıt** (`reversalOfId`, orijinale geri işaret eder, §4.4)
   ile ele alır — böylece bir denetçi veya gelecekteki bir anlaşmazlık hem orijinal iddiayı hem
   düzeltmeyi, her ikisinin de zaman damgalarıyla görebilir.
4. **Bu, tam olarak finansal ledger'lar/çift-taraflı muhasebe ile aynı desendir**, bilinçli
   olarak — görev metni açıkça "Bunu bir finansal ledger gibi ele al" diyor, ve haklı bir sebeple:
   balık biomass'ı bu şirketler için **finansal bir varlıktır**, ve muhasebe sistemlerinin
   yüzyıllardır uyguladığı aynı bütünlük garantileri (geçmişi asla üzerine yazma, her zaman ekle,
   bakiyeleri kayıtlardan yeniden inşa et) doğrudan geçerlidir.

## 8.3 Değerlendirilen Alternatifler

- **Değiştirilebilir `Tank.currentBatchId` / `FishBatch.currentTankId`** — "bariz" basit yaklaşım.
  Açık talimat gereği reddedildi (§8, ve kullanıcının kendi üç temel kuralıyla pekiştirildi).
  Kısmi transferleri, split'leri veya merge'leri veri kaybı olmadan temsil edemez ve her
  güncellemede geçmişi yok eder.
- **`FishBatch` üzerinde Slowly Changing Dimension (SCD Tip 2)** — versiyonlu satırlar
  (valid-from/valid-to) — yaygın bir veri ambarı deseni. Birincil model olarak reddedildi çünkü
  yine de "bir batch versiyon başına tam olarak bir yerdedir" modeller, bu da eş zamanlı
  çok-havuzlu split'ler için bozulur; *raporlama* snapshot'ları için (`BiomassSnapshot`'ın
  etkin biçimde yaptığı şey budur) makul bir desendir ama operasyonel ledger'ın kendisi için
  değil.
- **Tamamen event sourcing, genel bir `Event` tablosuyla ve sadece replay ile durum** (hiç
  projeksiyon tablosu olmadan) — desenin en saf hali, ama her okuma (örn. 40 havuzun mevcut
  doluluğunu listeleyen bir dashboard) cache'lenmedikçe potansiyel olarak yıllarca sürebilecek
  ledger geçmişini havuz başına tekrar oynatmayı gerektirirdi — bu yüzden bu, cache'lenmiş
  bu-desen'dir, ki tam olarak §4.4.1'in `BatchCurrentState`/`BatchTankState` projeksiyonlarının
  yaptığıdır. Bunu örtük değil açıkça benimsiyoruz.

## 8.4 Soy Ağacı (Lineage) İşlemleri

### Stoklama (Stocking)
`BatchMovement{ movementType: STOCKING, batchId: yeni, toTankId: X, fishCount: N }`. `FishBatch`
satırını ve ilk ledger kaydını atomik olarak oluşturur.

### Transfer (aynı batch kimliği, yeni havuz tahsisi)
Bir veya daha fazla `BatchMovement{ movementType: TRANSFER, batchId: aynı, fromTankId, toTankId,
fishCount }` satırı — tam olarak §5.3'teki işlenmiş örnek. Batch kimliği (`lotCode`) değişmez;
sadece havuz tahsisi değişir. Doğrulama: bir batch için bir havuzdan yapılan transferlerin toplamı
(`SUM`), `occurredAt` anında o havuz için batch'in canlı `BatchTankState.estimatedCount`'unu asla
aşamaz — ledger satırını yazan aynı transaction içinde servis katmanında uygulanır.

### Split (bir batch → birden fazla yeni batch kimliği)
Bir çiftlik, sonuçlanan alt popülasyonları farklı ticari lotlar olarak takip etmek istediğinde
(örn. farklı büyütme programları), bir `SPLIT` işlemi her biri `parentBatchIds: [orijinalId]`
olan N yeni `FishBatch` satırı oluşturur ve sonuçlanan her batch için `BatchMovement{
movementType: SPLIT, fromBatchId: orijinal, toBatchId: yeni_i, fishCount: n_i }` yazar. Orijinal
batch'in durumu, tamamen split edildiyse `CLOSED` olur, kısmen split edildiyse azaltılmış canlı
sayı ile `ACTIVE` kalır. Düz bir **transfer**'den (aynı kimlik, farklı havuz) ayırt edin — bir
çiftlik, sonuçlanan popülasyonların ileriye dönük ayrı ticari lotlar olarak izlenebilir olması
gerektiğinde (örn. farklı hasat tarihleri) SPLIT'i seçer; bir TRANSFER, operasyonel olarak "hâlâ
aynı batch" olduğunda, sadece havuzlara yayıldığında kullanılır.

### Merge (birden fazla batch → bir batch)
Her kaynak için `BatchMovement{ movementType: MERGE, fromBatchId: kaynak_i, toBatchId: yeni_veya_
mevcut, fishCount: n_i }`. Sonuçlanan batch'in `parentBatchIds`'i tüm kaynakları içerir.
**Merge, balıkların ortalama-ağırlık/biomass durumunu karışık (blended) bir tahmine değiştirir**
— bu yeniden hesaplama, Biomass Motoru'na aittir (bkz. [10](10-biological-calculations.md)),
ledger yazımının kendisine değil; ledger yalnızca *neyin taşındığını* kaydeder, asla türetilmiş
bir sayıyı sanki gerçekmiş gibi kaydetmez.

### Kısmi / Tam Harvest
`HarvestRecord` (§4.7), bir kullanıcının doldurduğu domain kaydıdır; onu `ACTUAL` ve `fishCount >
0` olarak göndermek **aynı zamanda** aynı transaction içinde `BatchMovement{ movementType:
HARVEST_REMOVAL, batchId, fromTankId, fishCount }` yazar, böylece hasat edilen balıklar diğer
herhangi bir hareketle aynı ledger mekanizması üzerinden canlı sayımdan çıkarılır — harvest,
ledger'ı atlayan özel bir durum değildir, hedefi "başka bir havuz" yerine "çiftlikten çıkış"
olan bir hareket tipidir.

## 8.5 Tam Geçmişi Yeniden İnşa Etmek

"Sistem, hasat edilmiş bir balık partisinin eksiksiz biyolojik geçmişini yeniden inşa
edebilmelidir" (§8), tek bir traversal ile yanıtlanır:

```
1. HarvestRecord → batchId'den başla
2. Tüm ata batch'leri bulmak için BatchMovement grafiğini fromBatchId/toBatchId kenarları
   üzerinden geriye doğru yürü (MERGE'i ele alır — hasat edilen bir lot birden fazla köken
   stoklamaya kadar izlenebilir)
3. Tam ata kümesi için tüm BatchMovement (transfer/split), FeedingEvent, MortalityEvent,
   WeightSample, Treatment, WaterQualityReading'i (havuz+zaman-penceresi join'i ile) topla
4. occurredAt'a göre sırala, eksiksiz bir zaman çizelgesi üret: [tarih]'te [havuz]'da
   [kuluçkahane]'den stoklandı → [yem ürünleri] ile beslendi → [aşılar] ile tedavi edildi →
   [havuzlar]'a transfer edildi → [ağırlıklar]'da örneklendi → [tarih]'te [ortalama ağırlık]'ta
   hasat edildi
```

Bu traversal, `BatchLineageService.getFullHistory(batchId)` şeklinde bir backend servisi olarak
sunulur, böylece raporlama, uyumluluk ihracatı ve gelecekteki müşteri-yüzlü bir
sertifika/izlenebilirlik özelliği için erişilebilir olur — rapor başına ad hoc olarak yeniden
inşa edilen bir şey değil.

## 8.6 Kabul Edilen Tradeoff'lar

- **Sorgu karmaşıklığı**, basit bir `WHERE tankId = X`'ten daha yüksektir — çoğu "bu havuzda şu
  anda ne var" okuması projeksiyon tabloları üzerinden geçer (§4.4.1) ve sadece
  lineage/geçmiş/audit özellikleri ledger traversal'ına ihtiyaç duyar. Geçmişi korumanın gerekli
  bedeli olarak bu iki katmanlı okuma modelini kabul ediyoruz.
- **Veri hacmi monoton olarak büyür** — ledger asla küçülmez. Uygun şekilde indekslendiğinde
  (§4.8) bu, belirtilen ölçekte (§15) çözülmüş bir problemdir, ama eski veriyi "temizleyebilen"
  bir modele karşı bilinçli bir tradeoff'tur.
