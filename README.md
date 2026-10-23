# 💨 HASHTAG Lounge & Hookah - QR Kod Menü Sistemi

Bu proje, **HASHTAG** nargile kafesi için özel olarak tasarlanmış, lüks lounge temalı, mobil öncelikli ve dinamik yönetim paneline sahip QR Menü sistemidir.

---

## 🎯 Temel Özellikler

### 1. 📱 Müşteri Menüsü (Mobile-First Web App)
- **Karanlık & Lüks Lounge Teması:** Amber/Altın vurgular, cam efektleri (glassmorphism) ve koyu renk nargile lounge atmosferi.
- **Nargileye Özel Detaylar:**
  - Karışımların içerik profili ve aroma etiketleri (*örn: Love 66 -> Kavun, Karpuz, Çarkıfelek, Mentol*).
  - Lüle ve marpuç opsiyonları (*Meyve Çanak, Buzlu Marpuç, Sert Tütünler*).
  - Canlı arama (İsim, açıklama ve tütün aromalarına göre anında arama).
- **Hızlı Wi-Fi Bilgisi:** Masadaki müşterilerin tek tıkla kafenin Wi-Fi şifresini kopyalayabileceği modal pencere.
- **Masa Numarası Algılama:** Masaya özel QR okutulduğunda (`?table=5`), ekranda "Masa 5" rozeti görünür.

### 2. ⚡ QR Kod Sabitliği (En Önemli Kriter)
> **QR Kodlar Masalara Bir Kez Basılır ve ASLA Değişmez!**  
> QR kod, doğrudan menünün internet adresine (URL) bakar (`https://hashtag-menu.com?table=X`).  
> Yönetim panelinden ister her gün fiyatları değiştirin, ister yeni tütünler ekleyin, ister ürünleri "Tükendi" yapın; **masalardaki pleksi stantları veya çıkartmaları yeniden basmanız gerekmez.** Menü her zaman anlık olarak güncel haliyle açılır.

### 3. 🛠️ Yönetici Paneli (`/admin`)
- **Varsayılan PIN:** `1234` (Ayarlar sekmesinden kolayca değiştirilebilir).
- **Hızlı Fiyat Değiştirici:** Tek bir listeden tüm ürünlerin fiyatlarını tıklayıp doğrudan güncelleyebilme.
- **Stok Durumu Toggle:** Tükenen ürünleri tek tuşla "Tükendi" moduna alma / çıkarma.
- **Yeni Ürün & Kategori Ekleme:** Ürün fotoğrafları, aroma etiketleri, "Şefin Önerisi", "Popüler" gibi rozetler ekleme.
- **Sabit Masa Standı Baskı Oluşturucu:**
  - Tek masa veya 1'den 24'e kadar tüm masalar için altın/siyah lüks masa standı şablonu.
  - Tarayıcıdan tek tıkla **"Baskı Al / PDF Kaydet"** seçeneği.
- **Tek Tıkla JSON Yedekleme & Geri Yükleme.**

### 4. 🚀 Geleceğe Hazır Altyapı (Köz & Garson Çağır)
- Altyapısı şimdiden hazırlandı.
- Yönetici panelindeki **"Köz İste & Garson Çağır Butonları"** anahtarı açıldığında, müşteri menüsünün altında otomatik olarak beliren çağrı butonları devreye girer.

---

## 🖥️ Yerel Bilgisayarda Nasıl Çalıştırılır?

Herhangi bir kurulum veya paket yüklemeye gerek yoktur. Mac üzerinde yerleşik Python ile çalışır:

```bash
cd /Users/macbook/.gemini/antigravity/scratch/hashtag-qr-menu
python3 server.py
```

Tarayıcınızda açın:
- **Müşteri Menüsü:** [http://localhost:8080](http://localhost:8080)
- **Masa 5 Örneği:** [http://localhost:8080?table=5](http://localhost:8080?table=5)
- **Yönetici Paneli:** [http://localhost:8080/admin](http://localhost:8080/admin) (PIN: `1234`)

*(Ayrıca `public/index.html` dosyasını doğrudan herhangi bir tarayıcıda çift tıklayarak da çevrimdışı önizleyebilirsiniz).*

---

## 🌐 İnternette Ücretsiz Yayınlama (1 Dakikada Canlıya Alma)

Bu projeyi arkadaşınızın kafesi için ücretsiz ve ömür boyu çalışacak şekilde yayına almak çok kolaydır:

### Seçenek 1: Vercel / Netlify (Önerilen)
1. `public` klasörünün içeriğini [Vercel](https://vercel.com) veya [Netlify](https://netlify.com) üzerine sürükleyip bırakarak (veya GitHub reposu bağlayarak) **ücretsiz** olarak canlıya alabilirsiniz.
2. Size `https://hashtag-menu.vercel.app` gibi özel bir adres verir.
3. Kendi alan adınız varsa (örn: `hashtagcafe.com`) tek tıkla bağlayabilirsiniz.
4. Bu adresi yönetim panelindeki **"Sabit Domain / Yayın URL"** kutusuna yazıp **Masa Standları** sekmesinden tüm masaların baskısını PDF olarak alabilirsiniz!

---

## 📁 Proje Dosya Yapısı

```
hashtag-qr-menu/
├── server.py              # Yerel REST API ve Web Sunucusu
├── README.md              # Kullanım ve kurulum rehberi
├── data/
│   └── menu.json          # Tüm menü, ürünler, kategoriler ve kafe ayarları
└── public/
    ├── index.html         # Müşteri menüsü arayüzü
    ├── admin.html         # Yönetici paneli & QR masa standı oluşturucu
    ├── app.js             # İstemci tarafı menü mantığı ve etkileşimler
    ├── admin.js           # Yönetim paneli, hızlı fiyat ve baskı motoru
    ├── default-data.js    # Sunucusuz/Statik çalışabilme garantisi
    └── style.css          # Lüks dark lounge teması ve baskı stilleri
```
