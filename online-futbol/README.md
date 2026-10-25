# Tut & Fırlat Online

1'e 1, 2'ye 2 veya 3'e 3 top-down futbol. Oda kurma, oda kodu / davet bağlantısı, açık ve şifreli odalar, bot tercihi, maç başladıktan sonra katılım ve seyirci modu var. Oyun sunucuda çalışır, tarayıcılar sadece giriş gönderip görüntüyü çizer.

Paket kurmak gerekmiyor. Sadece Node.js 18 veya üstü lazım.

## Bilgisayarında dene

```
cd online-futbol
node server.js
```

Tarayıcıda `http://localhost:3000` aç. Aynı ağdaki telefon ya da arkadaş için `http://BILGISAYAR_IP:3000` kullan.

## Arkadaşlarınla oynamak için internete koy

Bu oyun WebSocket kullandığı için Netlify, Vercel ve GitHub Pages gibi sadece statik dosya barındıran yerlerde çalışmaz. Node sunucusu çalıştıran bir yer gerekir. En kolayı Render:

1. Bu klasörü bir GitHub deposuna yükle.
2. render.com'da "New" > "Web Service" seç ve depoyu bağla.
3. Ayarlar: Runtime `Node`, Build Command boş (ya da `echo ok`), Start Command `node server.js`.
4. Deploy bitince Render sana bir `https://...onrender.com` adresi verir. Oyun orada açılır.

Aynı depoda `render.yaml` var, "Blueprint" ile de kurabilirsin. Railway, Fly.io ve Koyeb de aynı şekilde çalışır (başlatma komutu `node server.js`, port `PORT` ortam değişkeninden okunur).

Not: Render'ın ücretsiz planı 15 dakika kullanılmayınca uyur, ilk giriş 30-60 saniye sürebilir. Oda ve maçlar sunucunun belleğinde tutulur, sunucu yeniden başlarsa odalar silinir.

## Nasıl oynanır

- Nick yaz; 1v1, 2v2 veya 3v3 seç. İstersen botları kapat, maç başladıktan sonra katılımı kapat veya oda şifresi belirle.
- Odayı kuran (★) maçı başlatır. Botlar açıksa boş yerlere bot gelir. Botlar kapalıysa maçın başlaması için iki takımda da en az bir gerçek oyuncu gerekir.
- Oda koduyla oyuncu olarak ya da seyirci olarak katılabilirsin. Maç sırasında katılım açıksa oyuncular botların veya boş slotların yerine girebilir. Seyirciler maçı izleyebilir ve odadaki rol düğmesiyle oyuncu olmaya çalışabilir.
- Şifreli odalar açık oda listesinde görünmez; kod ve şifre gerekir.
- Maç bitince 12 saniye sonra herkes lobiye döner (kurucu "Lobiye dön" ile hemen de döndürebilir).
- Kontroller: WASD/oklar hareket, Boşluk şut, 3 pas (basılı tut = aşırtma), 1 topa atıl ve tut, 2 ileri atıl. Mobilde ekrandaki joystick ve butonlar.

## Dosyalar

- `server.js`: HTTP + WebSocket sunucusu, odalar, lobi, 60 Hz oyun döngüsü
- `game.js`: oyun mantığı (fizik, botlar, kurallar)
- `ws-lite.js`: bağımlılıksız küçük WebSocket katmanı
- `public/index.html`: menü, lobi ve oyun ekranı (tarayıcı tarafı)

## Arayüzü başka bir sitede barındırmak

Sunucu (Render vb.) her zaman gerekir. Ama `public/index.html` dosyasını kendi siten ya da Netlify gibi bir yerde de yayınlayabilirsin. Bunun için dosyanın başındaki `SERVER_URL` satırına sunucu adresini yaz:

```
const SERVER_URL='wss://SENIN-SUNUCUN.onrender.com';
```

Adres `https://` değil `wss://` ile başlamalı. Boş bırakırsan sayfa kendi açıldığı sunucuya bağlanır.


## Top kontrolü ve şut

- Şut düğmesini veya Boşluk tuşunu basılı tutarak güç biriktir; bıraktığında şut çekilir.
- Top sende iken hareket yönünü değiştirerek oyuncunun önündeki topu döndürebilirsin.
- `1` / Tut: topa doğru atılma ve topu kapma; `2` / Atla: ileri atılma.
