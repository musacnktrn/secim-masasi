// 72. Komite · Seçim Masası · SERVİS ÇALIŞANI (ATLAS, 2026-09-30)
// Görevi: uygulama kabuğunu (sayfa, stil, JS modülleri, ikonlar) telefonda saklamak ki ana ekrandan
// açılan uygulama zayıf ağda da hızlı gelsin. Strateji AĞ ÖNCE: internet varsa her zaman en güncel dosya
// gelir (gün içinde yapılan düzeltmeler anında yansır), ağ yoksa ya da çok yavaşsa saklanan kopya verilir.
// Yalnız bu sitenin kendi dosyalarına dokunur. Supabase (veri + canlı bağlantı), jsDelivr / unpkg (kütüphaneler),
// Google Fonts ve harita karoları başka kökendendir; bu çalışan onları hiç görmez, tarayıcı normal yoluyla gider.

const CACHE = 'secim-v6';          // kabuk listesi değişince sürümü artır: eski önbellek kendiliğinden silinir
const ONEK = 'secim-';             // yalnız bu uygulamanın önbelleklerini temizle
const ZAMAN_ASIMI = 3500;          // saklı kopya varken ağı en çok bu kadar bekle (ms)
const ZAYIF_SURE = 30000;          // ağ bir kez yavaş/kopuk bulununca bu süre boyunca saklı kopya beklemeden verilir
const SAGLAM_SURE = 1500;          // ağ bu sürede cevap verirse sağlıklı sayılır, zayıf ağ kipi kapanır

// Modüller zincir halinde yüklenir (index > app.js > core/ui > ekran). Zayıf ağda her halka ayrı ayrı
// ZAMAN_ASIMI beklemesin diye, ilk zaman aşımından sonra kalan dosyalar doğrudan saklı kopyadan gelir.
// Böylece aynı açılışta eski ve yeni dosyalar da karışmaz. Ağ arkada tazelemeye devam eder.
let zayifSon = 0;
const zayifMi = () => Date.now() - zayifSon < ZAYIF_SURE;

const KABUK = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/core.js',
  'js/ui.js',
  'js/asistan.js',
  'js/ekranlar/giris.js',
  'js/ekranlar/masa.js',
  'js/ekranlar/kisiler.js',
  'js/ekranlar/harita.js',
  'js/ekranlar/araclar.js',
  'js/ekranlar/dashboard.js',
  'js/ekranlar/yonetim.js',
  'js/ekranlar/saha.js',
  'js/ekranlar/rapor.js',
  'js/ekranlar/sorumlu.js',
  'js/ekranlar/bildirimler.js',
  'img/ikon-180.png',
  'img/ikon-192.png',
  'img/ikon-512.png',
];

const KOK = new URL('./', self.location.href);   // uygulamanın kök adresi (kapsam)
const KOK_URL = KOK.href;
const KOK_YOL = KOK.pathname;

// ---------------------------------------------------------------- kurulum: kabuğu indir
// Her dosya ayrı indirilir: biri eksikse (ör. henüz yayına alınmamış bir ekran) kurulum yine tamamlanır,
// eksik dosya ilk kullanıldığında önbelleğe girer.
self.addEventListener('install', olay => {
  olay.waitUntil((async () => {
    try {
      const onbellek = await caches.open(CACHE);
      await Promise.allSettled(KABUK.map(async yol => {
        const cevap = await fetch(new Request(yol, { cache: 'reload', credentials: 'same-origin' }));
        if (saklanirMi(cevap)) await onbellek.put(new URL(yol, KOK).href, cevap);
      }));
    } catch (e) { /* önbellek kullanılamıyorsa (ör. depolama kapalı) çalışan yalnız ağdan geçirir */ }
    await self.skipWaiting();
  })());
});

// ---------------------------------------------------------------- etkinleşme: eski sürümleri sil
self.addEventListener('activate', olay => {
  olay.waitUntil((async () => {
    try {
      const adlar = await caches.keys();
      await Promise.all(adlar.filter(ad => ad.startsWith(ONEK) && ad !== CACHE).map(ad => caches.delete(ad)));
    } catch (e) { /* yok say */ }
    await self.clients.claim();
  })());
});

// ---------------------------------------------------------------- istekler
self.addEventListener('fetch', olay => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;
  if (istek.headers.has('range')) return;
  if (istek.cache === 'only-if-cached' && istek.mode !== 'same-origin') return;
  const url = new URL(istek.url);
  if (url.origin !== KOK.origin) return;              // Supabase, CDN, font, harita: dokunma
  if (!url.pathname.startsWith(KOK_YOL)) return;      // kapsam dışı aynı köken yolları: dokunma
  if (url.pathname === KOK_YOL + 'sw.js') return;

  if (istek.mode === 'navigate') { olay.respondWith(gezinme(olay, url)); return; }
  // statusText yalnız Latin-1 kabul eder (Türkçe "ı" hata fırlatır), bu yüzden standart ifade
  olay.respondWith(agOnce(olay, istek, istek.url).catch(() => new Response('', { status: 504, statusText: 'Gateway Timeout' })));
});

// Sayfa açılışı: ağ önce, olmazsa saklı sayfa, o da yoksa çevrimdışı ekranı.
async function gezinme(olay, url) {
  const kok = url.pathname === KOK_YOL || url.pathname === KOK_YOL + 'index.html';
  const anahtar = kok ? KOK_URL : url.href;           // ?saat=10:30 gibi ekler aynı sayfanın kopyası
  const istek = new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' });
  try {
    return await agOnce(olay, istek, anahtar);
  } catch (e) {
    const sakli = await eslesen(anahtar) || (kok ? null : await eslesen(url.href));
    return sakli || cevrimdisiSayfa();
  }
}

// Ağ önce. Saklı kopya varsa ağ ZAMAN_ASIMI içinde dönmezse saklıyı ver; ağ arka planda bitince önbellek tazelenir.
async function agOnce(olay, istek, anahtar) {
  let onbellek = null;
  try { onbellek = await caches.open(CACHE); } catch (e) { return fetch(istek); }

  // no-cache: tarayıcının HTTP önbelleğindeki eski kopya yerine sunucuya sorulur (değişmediyse 304, çok hafif)
  const basla = Date.now();
  const agdan = fetch(istek, { cache: 'no-cache' }).then(cevap => {
    if (saklanirMi(cevap)) {
      const kopya = cevap.clone();
      olay.waitUntil(onbellek.put(anahtar, kopya).catch(() => {}));
    }
    if (Date.now() - basla < SAGLAM_SURE) zayifSon = 0;   // hızlı döndü: ağ sağlıklı
    return cevap;
  }, hata => { zayifSon = Date.now(); throw hata; });
  olay.waitUntil(agdan.then(() => {}, () => {}));    // zaman aşımında da indirme yarıda kesilmesin

  const sakli = await eslesen(anahtar, onbellek);
  if (!sakli) return agdan;                           // saklı yok: ağı sonuna kadar bekle
  if (zayifMi()) return sakli;                        // zayıf ağ kipi: bekletme, ağ arkada tazelesin

  const bekle = new Promise(coz => setTimeout(() => coz(null), ZAMAN_ASIMI));
  try {
    const cevap = await Promise.race([agdan, bekle]);
    if (cevap && cevap.ok) return cevap;              // taze kopya
    if (!cevap) zayifSon = Date.now();                // zaman aşımı: zayıf ağ kipine geç
    return sakli;                                     // zaman aşımı ya da sunucu hatası: saklı kopya
  } catch (e) {
    return sakli;                                     // ağ yok
  }
}

async function eslesen(anahtar, onbellek) {
  try {
    const c = onbellek || await caches.open(CACHE);
    return (await c.match(anahtar)) || (await c.match(anahtar, { ignoreSearch: true })) || null;
  } catch (e) { return null; }
}

function saklanirMi(cevap) {
  return !!cevap && cevap.status === 200 && cevap.type === 'basic';
}

function cevrimdisiSayfa() {
  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#C8102E">
<title>Seçim Masası · Bağlantı yok</title>
<style>
  html,body{margin:0;height:100%;background:#C8102E;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
  main{min-height:100%;display:grid;place-content:center;gap:14px;text-align:center;padding:24px calc(24px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left))}
  .sayi{font-weight:900;font-size:88px;letter-spacing:-.05em;line-height:.9}
  h1{margin:6px 0 0;font-size:22px;font-weight:800}
  p{margin:0;opacity:.88;font-weight:500;max-width:320px;line-height:1.45}
  button{margin-top:10px;height:48px;padding:0 22px;border-radius:12px;border:0;background:#fff;color:#C8102E;font:inherit;font-weight:800;font-size:15px;cursor:pointer}
</style></head>
<body><main>
  <div class="sayi">72</div>
  <h1>İnternet bağlantısı yok</h1>
  <p>Bağlantı gelince sayfa kendiliğinden açılacak. Beklemek istemezsen aşağıdan tekrar dene.</p>
  <div><button onclick="location.reload()">Tekrar dene</button></div>
</main>
<script>
  // Telefon ağa bağlı görünse de sunucuya ulaşamıyor olabilir (online olayı gelmez): 8 sn'de bir sessizce yokla.
  addEventListener('online', function () { location.reload(); });
  setInterval(function () {
    fetch(location.href, { cache: 'no-store' }).then(function (r) { if (r.status < 500) location.reload(); }).catch(function () {});
  }, 8000);
</script>
</body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ---------------------------------------------------------------- telefon bildirimi (web push)
// Sunucu (push edge function) {baslik, metin, id, firma_id, tur, url} gönderir. iPhone'da yalnız Ana Ekrana Eklenmiş uygulamada çalışır.
self.addEventListener('push', olay => {
  let v = {};
  try { v = olay.data ? olay.data.json() : {}; } catch { v = { baslik: '72. Komite', metin: olay.data ? olay.data.text() : '' }; }
  olay.waitUntil(self.registration.showNotification(v.baslik || '72. Komite · Seçim Masası', {
    body: v.metin || '',
    icon: 'img/ikon-192.png',
    badge: 'img/ikon-192.png',
    tag: v.id ? `b-${v.id}` : undefined,
    renotify: true,
    data: { url: v.url || './#bildirimler', id: v.id, firma_id: v.firma_id },
  }));
});
self.addEventListener('notificationclick', olay => {
  olay.notification.close();
  const hedef = new URL(olay.notification.data?.url || './#bildirimler', KOK).href;
  olay.waitUntil((async () => {
    const pencereler = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const p of pencereler) { if (p.url.startsWith(KOK_URL)) { await p.focus(); try { await p.navigate(hedef); } catch { p.postMessage({ tur: 'git', url: hedef }); } return; } }
    await self.clients.openWindow(hedef);
  })());
});
