# 09. Yem Stok Ledger Modeli

Üç temel kararın ikincisi (bkz. README).

## 9.1 Ne Seçildi

Yem eldeki-stok değeri **asla artırılıp/azaltılan saklanan bir sayı değildir**. Her zaman
`FeedInventoryTransaction` satırları üzerinden `SUM(işaretli miktar)`'dır (§4.6), balık hareket
ledger'ıyla tam olarak aynı event-sourcing + projeksiyon desenini izleyerek (§4.4.1,
[08](08-fish-batch-lineage.md)) her `FeedInventoryBatch` (belirli teslim alım/lot) için
türetilmiş, yeniden inşa edilebilir bir `FeedInventoryBalance` projeksiyonuna materialize edilir.

## 9.2 Neden

1. **"Yem nereye gitti"nin denetlenebilirliği.** Tek bir değiştirilebilir `stockKg = 48000`
   sayısı, "Temmuz'da Havuz A12 ne kadar tüketti" veya "bu ayki eksilme tüketimden mi, atıktan mı,
   yoksa bir veri-girişi düzeltmesinden mi kaynaklandı" sorularını yanıtlayamaz — bunların hepsine
   çiftlik operatörlerinin ve (nihayetinde) denetçilerin/sertifikasyon kuruluşlarının ihtiyacı
   var. Bir işlem ledger'ı, herhangi bir zaman noktasında, geriye dönük olarak bunların hepsini
   bir `GROUP BY` sorgusuyla yanıtlar.
2. **Yem maliyet doğruluğu.** Cost/kg (§20), hangi lotun maliyet tabanının tüketildiğini bilmeyi
   gerektirir, sadece "bir miktar yem tüketildi" değil. `FEED_CONSUMPTION` işlemlerini belirli bir
   `FeedInventoryBatch`'e (kendi `unitCostPerKg`'ı ile) bağlamak, ileride tüm boru hattını yeniden
   mimarilemeden lot-özel veya FIFO maliyetlemeyi mümkün kılan şeydir.
3. **Uzlaştırma (Reconciliation).** Fiziksel stok sayımları periyodik olarak sistemle
   uyuşmayacaktır (dökülme, yanlış sayım, hırsızlık). `ADJUSTMENT` işlem tipi, bir depo
   yöneticisinin geçmişi sessizce üzerine yazmadan uzlaştırma yapmasına izin verir — tutarsızlığın
   kendisi görünür, zaman damgalı, sahiplendirilmiş bir kayıt haline gelir; bu değerli bir
   operasyonel sinyaldir (bir depoda tekrar eden büyük düzeltmeler, Alert motorunun ileride işaret
   edebileceği bir şeydir).
4. **Balık hareket ledger'ı ile tutarlılık.** Platformun iki "akan miktar" domain'i (balık ve yem)
   için aynı deseni kullanmak, iki farklı bespoke sistem yerine tek bir zihinsel model, tek bir
   mühendislik kuralları kümesi, tek bir test yaklaşımı ve gelecekteki stream/event altyapısına
   (§26, §32) tek bir migration yolu anlamına gelir.

## 9.3 Değerlendirilen Alternatifler

- **Depo+ürün başına tek değiştirilebilir stok alanı** — açıkça reddedildi, bu görev metninin
  temel kurallarında isimlendirilen tam anti-desendir ("stok = 48.000 kg şeklinde sadece bir
  rakam tutma").
- **Periyodik envanter (stok yalnızca sayım anında bilinir, sürekli ledger yok)** — çok küçük
  operasyonlarda yaygındır, ama her yemleme olayında otomatik düşüşle (§13: "Yem girildiğinde,
  stok otomatik olarak stok işlemleri üzerinden azalmalı") ve gerçek zamanlı düşük-stok
  uyarısıyla (§30) uyumsuzdur.
- **Çift-taraflı (muhasebe tarzı borç/alacak çiftleri) ledger** — daha titiz ama bir çiftlik
  işçisinin "yem girdi, yem çıktı" zihinsel modeli için kavramsal yük ekler. Aynı bütünlük
  garantisini, tam olarak aynı reconstructible ve denetlenebilir kalırken bir çiftlik işçisi için
  doğru UI'ı inşa etmesi daha kolay olan daha basit bir işaretli-işlem-tipi modeliyle
  (sabit bir enum içinde `PURCHASE`/`TRANSFER_IN` pozitif-yönlü, `FEED_CONSUMPTION`/
  `TRANSFER_OUT`/`WASTE` negatif-yönlü) yaklaşık olarak elde ediyoruz.

## 9.4 Hiyerarşi

```
Company → Farm → Warehouse → FeedProduct (katalog) → FeedInventoryBatch (belirli teslim alım/lot)
                                                              → FeedInventoryTransaction (ledger)
```

`FeedProduct` (katalog girişi: "Skretting Nutra Olympic 6mm, %45 protein"), `FeedInventoryBatch`'ten
(kendi tedarikçi lot kodu, son kullanma tarihi, üretim tarihi ve maliyeti olan bu ürünün belirli
bir teslimatı — görev metninin §14'ü) ayrıdır. Bu ayrım, aynı ürünün farklı maliyetlerde/son
kullanma tarihlerinde tekrar tekrar satın alınabilmesine ve yine de tek bir katalog girişine
toplanabilmesine izin verir ("bu çeyrekte tüm lotlar genelinde tüketilen toplam Nutra Olympic
6mm" raporlaması).

## 9.5 İşlem Tipleri ve Tetikleyicileri

| Tip | Tetikleyen | İşaret |
|---|---|---|
| `PURCHASE` | Depo yeni stok alır (elle giriş veya gelecekteki tedarikçi entegrasyonu) | + |
| `TRANSFER_IN` | Stok başka bir şirket deposundan gelir | + |
| `TRANSFER_OUT` | Stok başka bir şirket deposuna gönderilir | − |
| `FEED_CONSUMPTION` | Bir `FeedingEvent` gönderildiğinde otomatik oluşturulur, 1:1 (§4.5) | − |
| `ADJUSTMENT` | Fiziksel sayım sonrası elle uzlaştırma | +/− |
| `RETURN` | Stok tedarikçiye iade edilir | − |
| `WASTE` | Bozulma, son kullanma tarihi nedeniyle silme | − |

`FeedingEvent.inventoryTransactionId` zorunlu bir 1:1 bağlantıdır (§4.5) — bir yemleme olayı,
karşılık gelen `FEED_CONSUMPTION` işlemi aynı veritabanı transaction'ında başarıyla
oluşturulmadan kaydedilemez; o lot için stok negatife düşecekse, servis katmanı yemleme olayını
reddeder (şirket bazında yapılandırılabilir: sert engelleme vs. çiftlikler için formel olarak bir
teslimat almadan önce yemleme verisi giren çiftlikler için uyar-ve-negatife-izin-ver — çiftlik
operasyonlarını engellemek yerine yumuşak bir uyarı olarak izin vermeye değer gerçek dünya
zamanlama sorunu).

## 9.6 Bakiye Türetme ve Yeniden İnşa Edilebilirlik

Balık ledger'ındaki `BatchCurrentState` (§4.4.1) ile aynı mekanizma: `FeedInventoryBalance`, o
`FeedInventoryBatch`'i etkileyen herhangi bir yeni işlemle aynı transaction içinde senkron olarak
yeniden hesaplanır ve gece çalışan bir uzlaştırma job'ı, `FeedInventoryTransaction`'ı sıfırdan
toplayarak tüm bakiyeleri yeniden hesaplar ve canlı projeksiyonla karşılaştırarak sapmada uyarı
verir. Bu job'ın ilk günden var olması, projeksiyonu pratikte gerçekten "sadece bir cache" yapan
şeydir, sadece teoride değil — test edilmemiş yeniden-inşa mantığı çürümeye eğilimlidir.

## 9.7 Kabul Edilen Tradeoff'lar

Balık ledger'ı ile aynı (§8.6): "mevcut stok" okumaları için daha fazla sorgu dolaylılığı
(her zaman projeksiyon üzerinden, asla sıcak yolda naif bir canlı SUM ile değil), tam tarihsel
izlenebilirlik ve maliyet muhasebesi ile (nihayetinde) uyumluluk raporlamasına beslenen bir sistem
için isteğe bağlı değil gereklilik olan denetim savunulabilirliği karşılığında.
