// 72. Komite · Seçim Masası · RAPOR (telefon, salt okunur) · ATLAS, 2026-09-30
// Seçimi takip edenlerin ana ekrana eklediği web uygulaması. Kendi başlığını ve alt sekme çubuğunu çizer.
// Sekmeler: Özet (halka + dörtlü + son dakika + saatlik grafik) · Gelenler · Referanslar · İlçeler.
// Tüm veri store'dan gelir; canlı olaylarda yalnız değişen parçalar yeniden yazılır.
import {
  store, esc, fmt, trBaslik, simdi, simdiDk, dakika, sayac, hedefSayi, firmaListesi, aramaEslesir, olayMetni,
  SINIF_AD, ROL_AD, gecikme, cikis,
} from '../core.js';
import { bas, rozetDurum, rozetSinif, kisiKartiAc, cekmeceKapat } from '../ui.js';

// ---------------------------------------------------------------- sabitler
const SEKMELER = [
  { k: 'ozet', ad: 'Özet' },
  { k: 'gelenler', ad: 'Gelenler' },
  { k: 'referanslar', ad: 'Referanslar' },
  { k: 'ilceler', ad: 'İlçeler' },
];
const SEKME_ANAHTAR = 'rapor-sekme';
const SERIT_ANAHTAR = 'rapor-ana-ekran-kapandi';
const TEMA_ANAHTAR = 'secim-tema';          // app.js ile ortak
// app.js EKRANLAR tablosunun rol izinleri (menüdeki "diğer ekranlar" için; app.js'i burada içe aktarmıyoruz)
const DIGER_EKRANLAR = [
  { k: 'masa', ad: 'Masa', roller: ['yonetici', 'masa'] },
  { k: 'kisiler', ad: 'Kişiler', roller: ['yonetici', 'masa', 'rapor'] },
  { k: 'harita', ad: 'Harita', roller: ['yonetici', 'masa', 'rapor'] },
  { k: 'dashboard', ad: 'Dashboard', roller: ['yonetici', 'masa', 'rapor'] },
  { k: 'saha', ad: 'Saha', roller: ['yonetici', 'masa', 'sofor'] },
];
const SAYFA_BOYU = 60;

// ---------------------------------------------------------------- ikonlar (çizgi, currentColor)
const svg = (d, b = 22, k = 1.9) => `<svg width="${b}" height="${b}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${k}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IKON = {
  ozet: b => svg('<circle cx="12" cy="12" r="8.5" opacity=".35"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/><path d="M12 8v4l2.5 2.5"/>', b),
  gelenler: b => svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 11.5l2 2 4-4.5"/>', b),
  referanslar: b => svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.2A6.5 6.5 0 0 1 21.5 20"/>', b),
  ilceler: b => svg('<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', b),
  tel: b => svg('<path d="M5.5 3.5h3l1.8 4.6-2.3 1.4a11.5 11.5 0 0 0 6.5 6.5l1.4-2.3 4.6 1.8v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2z"/>', b),
  ara: b => svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', b),
  kapat: b => svg('<path d="M6 6l12 12M18 6L6 18"/>', b, 2.2),
  menu: b => svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>', b),
  sag: b => svg('<path d="M9 6l6 6-6 6"/>', b, 2.2),
  paylas: b => svg('<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M7 10H5.5v11h13V10H17"/>', b),
  ekle: b => svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>', b),
  nokta3: b => svg('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>', b),
  cikis: b => svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l4-4-4-4"/><path d="M14 12H4"/>', b),
};

// ---------------------------------------------------------------- ekran durumu
let kok = null;
let sekme = 'ozet';
let saatZam = null, sureZam = null;
const kaydirma = {};
let gelenArama = '', gelenFiltre = 'hepsi', gelenSinir = SAYFA_BOYU;
let refSira = 'hedef', ilceSira = 'hedef';
let gorulen = null;                 // oy kullanmış görülen firma id'leri (yeni gelenleri vurgulamak için)
const vurgula = new Map();          // id -> ilk görüldüğü an (3 sn yeşil vurgu)
const VURGU_MS = 3000;
let yeniRozet = 0;                  // Gelenler sekmesi dışındayken gelen yeni oy sayısı
let sonOlayId = null;
let sonVeri = Date.now();
let sayfa = null;                   // açık alt sayfa: { tur: 'grup'|'hareket'|'menu'|'rehber', ... }
let sayfaGecmis = false;            // alt sayfa için history kaydı açıldı mı
let rehberPlatform = null;
const yazilan = new WeakMap();      // aynı HTML'i tekrar yazmamak için
let temaMq = null, temaDinle = null, temaEski = null;
let temaTercih = null;              // 'acik' | 'koyu' | null (sistem)
const dinleyiciler = [];

const dinle = (hedef, olay, fn, sec) => { hedef.addEventListener(olay, fn, sec); dinleyiciler.push(() => hedef.removeEventListener(olay, fn, sec)); };
const oku = k => { try { return localStorage.getItem(k); } catch { return null; } };
const yazLS = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
function yazHtml(hedef, html) { if (!hedef) return false; if (yazilan.get(hedef) === html) return false; yazilan.set(hedef, html); hedef.innerHTML = html; return true; }
const bul = s => kok?.querySelector(s);

// ---------------------------------------------------------------- küçük yardımcılar
const kisiAd = f => trBaslik(f.yetkili || '') || f.unvan || '(adsız)';
function refAd(k) {
  if (!k) return 'Referanssız';
  return String(k).trim().split(/\s+/).map(w => w.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length <= 2 ? w : trBaslik(w)).join(' ');
}
const ilceAd = k => k ? trBaslik(k) : 'İlçesiz';
function telSec(f) {
  const adaylar = [f.cep, f.cep2, ...String(f.sabit_tel || '').split(/\s*[-/,;]\s*/)];
  for (const a of adaylar) { const l = fmt.telLink(a); if (l) return { link: l, yazi: fmt.tel(a) }; }
  return null;
}
function sureYazi(dk) {
  dk = Math.max(0, Math.round(dk)); const s = Math.floor(dk / 60), d = dk % 60;
  return s ? `${s} sa${d ? ` ${d} dk` : ''}` : `${d} dk`;
}
const zamanAyar = () => { const z = store.ayarlar.zaman || {}; return { basY: z.bas || '09:00', bitY: z.bit || '17:00', bas: dakika(z.bas || '09:00'), bit: dakika(z.bit || '17:00') }; };
const yerelTarih = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const provaMi = () => new URLSearchParams(location.search).has('saat');
// seçim günü (yerel gece yarısı); prova (?saat=) modunda bugün sayılır
function secimGunu() {
  const tarih = store.ayarlar.secim?.tarih; if (!tarih || provaMi()) return null;
  const [y, a, g] = String(tarih).split('-').map(Number); return y && a && g ? new Date(y, a - 1, g) : null;
}
function sandikDurumu() {
  const { basY, bitY, bas: b, bit: t } = zamanAyar();
  const tarih = store.ayarlar.secim?.tarih; const d = simdi(); const bugun = yerelTarih(d);
  if (tarih && !provaMi()) {
    if (bugun < tarih) {
      const [y, a, g] = tarih.split('-').map(Number); const sd = new Date(y, a - 1, g);
      const yarin = new Date(d); yarin.setDate(yarin.getDate() + 1);
      const gun = yerelTarih(yarin) === tarih ? 'yarın' : sd.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
      return { tur: 'once', metin: `Seçim ${gun} · ${basY} ile ${bitY} arası` };
    }
    if (bugun > tarih) return { tur: 'kapali', metin: 'Seçim tamamlandı' };
  }
  const dk = simdiDk();
  if (dk < b) return { tur: 'once', metin: `Açılış ${basY} · ${sureYazi(b - dk)} kaldı` };
  if (dk < t) return { tur: 'acik', metin: `Sandık açık · kapanışa ${sureYazi(t - dk)}` };
  return { tur: 'kapali', metin: `Sandık kapandı · ${bitY}` };
}
const oyZamani = f => f.durum_zamani ? new Date(f.durum_zamani).getTime() : 0;
const gelenler = () => firmaListesi().filter(f => f.durum === 'oy_kullandi').sort((a, b) => oyZamani(b) - oyZamani(a));

// ---------------------------------------------------------------- ana ekrana ekle: ortam
function uygulamaModu() {
  try {
    return window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
  } catch { return false; }
}
function cihaz() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const uygulamaIci = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|TikTok/i.test(ua);
  let tarayici = 'diger';
  if (ios) tarayici = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : 'safari';
  else if (android) tarayici = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : 'chrome';
  return { ios, android, uygulamaIci, tarayici };
}
let kurulumIstemi = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); kurulumIstemi = e; if (kok) seritCiz(); });
window.addEventListener('appinstalled', () => { kurulumIstemi = null; yazLS(SERIT_ANAHTAR, '1'); if (kok) seritCiz(); });
const istem = () => kurulumIstemi || window.__kurulumIstemi || null;

// ---------------------------------------------------------------- tema (açık / koyu / sistem)
function temaUygula() {
  const t = temaTercih;
  const koyu = t ? t === 'koyu' : !!temaMq?.matches;
  document.documentElement.dataset.tema = koyu ? 'koyu' : 'acik';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) { if (temaEski === null) temaEski = meta.getAttribute('content'); meta.setAttribute('content', koyu ? '#16181B' : '#C8102E'); }
}

// ================================================================= EKRAN
export default {
  async render(hedef, param) {
    kok = hedef;
    stilEkle();
    document.documentElement.classList.add('rapor-acik');
    try { temaMq = matchMedia('(prefers-color-scheme: dark)'); temaDinle = () => temaUygula(); temaMq.addEventListener?.('change', temaDinle); } catch {}
    const kt = oku(TEMA_ANAHTAR); temaTercih = kt === 'acik' || kt === 'koyu' ? kt : null;
    temaUygula();
    // Koruma: app.js kabukBagla'daki $('[data-tema]') seçicisi <html data-tema> öğesine denk geliyor ve her dokunuşta
    // temayı çeviriyor. Tıklama html'e ulaştıktan sonra (window, kabarma sonu) tercihi geri yükle.
    dinle(window, 'click', () => {
      const bek = temaTercih ? temaTercih : (temaMq?.matches ? 'koyu' : 'acik');
      if (document.documentElement.dataset.tema !== bek || (oku(TEMA_ANAHTAR) || null) !== temaTercih) { yazLS(TEMA_ANAHTAR, temaTercih); temaUygula(); }
    });

    const kayitli = oku(SEKME_ANAHTAR);
    sekme = SEKMELER.some(s => s.k === param) ? param : SEKMELER.some(s => s.k === kayitli) ? kayitli : 'ozet';
    gorulen = new Set(firmaListesi().filter(f => f.durum === 'oy_kullandi').map(f => f.id));
    vurgula.clear(); yeniRozet = 0; sayfa = null; sayfaGecmis = false;
    sonOlayId = sonHareket()?.id ?? null;
    rehberPlatform = null;

    kok.innerHTML = `
      <div class="rp">
        <header class="rp-ust">
          <div class="rp-logo"><b>72. KOMİTE</b><i>|</i>GENÇ ENERJİ</div>
          <div class="rp-canli" data-canli><span class="rp-nokta"></span><span data-canli-yazi>Canlı</span></div>
          <div class="rp-saat" data-saat>--:--</div>
          <button class="rp-ikon-btn" data-menu aria-label="Menü">${IKON.menu(22)}</button>
        </header>
        <div data-serit></div>
        <div class="rp-baslik">
          <h1 data-baslik></h1>
          <div class="rp-alt" data-sandik></div>
        </div>
        <main data-govde></main>
      </div>
      <nav class="rp-sekme" aria-label="Rapor sekmeleri"><div class="rp-sekme-ic">
        ${SEKMELER.map(s => `<button data-sekme="${s.k}" aria-label="${esc(s.ad)}">${IKON[s.k](23)}<span>${esc(s.ad)}</span><em class="rp-sekme-rozet" data-rozet="${s.k}"></em></button>`).join('')}
      </div></nav>
      <div data-sayfa-kok></div>`;

    kok.addEventListener('click', tikla);
    kok.addEventListener('input', girdi);
    dinle(window, 'scroll', () => bul('.rp-ust')?.classList.toggle('golgeli', scrollY > 4), { passive: true });
    dinle(window, 'resize', () => { if (sekme === 'ozet') grafikCiz(); });
    dinle(window, 'popstate', () => { if (sayfa) sayfaKapat({ gecmis: false }); });
    // yakalama evresinde: kişi kartı (ui.js) açıksa Esc önce onu kapatsın, alt sayfa açık kalsın
    dinle(document, 'keydown', e => { if (e.key === 'Escape' && sayfa && !document.querySelector('.cekmece')) sayfaKapat(); }, true);
    dinle(document, 'visibilitychange', () => { if (!document.hidden) { saatCiz(); ustDurumCiz(); } });

    saatCiz(); saatZam = setInterval(saatCiz, 1000);
    ustDurumCiz();
    seritCiz();
    sekmeCiz(true);
  },

  yenile(sebep) {
    if (!kok) return;
    if (['firma', 'firmalar', 'olay', 'hazir'].includes(sebep)) sonVeri = Date.now();
    gelenTakip();
    ustDurumCiz();
    govdeGuncelle();
    if (sayfa && (sayfa.tur === 'grup' || sayfa.tur === 'hareket')) sayfaIcerikCiz();
  },

  temizle() {
    clearInterval(saatZam); saatZam = null; clearTimeout(sureZam);
    dinleyiciler.splice(0).forEach(f => { try { f(); } catch {} });
    try { temaMq?.removeEventListener?.('change', temaDinle); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta && temaEski !== null) meta.setAttribute('content', temaEski);
    temaEski = null;
    if (kok) { kok.removeEventListener('click', tikla); kok.removeEventListener('input', girdi); }
    document.documentElement.classList.remove('rapor-acik', 'rp-kilit');
    sayfa = null; sayfaGecmis = false; kok = null;
  },
};

// ---------------------------------------------------------------- üst şerit: saat, canlı, sandık durumu
function saatCiz() {
  const s = bul('[data-saat]'); if (s) s.textContent = simdi().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function ustDurumCiz() {
  const c = bul('[data-canli]'); if (c) {
    const kopuk = !store.cevrimici || !store.canli;
    c.classList.toggle('kopuk', kopuk);
    const y = !store.cevrimici ? 'Çevrimdışı' : !store.canli ? 'Bağlanıyor' : 'Canlı';
    const yz = c.querySelector('[data-canli-yazi]'); if (yz && yz.textContent !== y) yz.textContent = y;
    c.title = kopuk ? 'Canlı bağlantı yok, bağlantı gelince veriler tamamlanır' : 'Veriler anlık güncelleniyor';
  }
  const d = sandikDurumu();
  yazHtml(bul('[data-sandik]'), `<i class="rp-durum-nokta ${d.tur}"></i>${esc(d.metin)}`);
  const r = bul('[data-rozet="gelenler"]'); if (r) { r.textContent = yeniRozet ? (yeniRozet > 99 ? '99+' : String(yeniRozet)) : ''; r.classList.toggle('var', !!yeniRozet); }
}

// ---------------------------------------------------------------- yeni gelenleri takip (vurgu + sekme rozeti)
function gelenTakip() {
  if (!gorulen) return;
  const simdiki = new Set();
  for (const f of store.firmalar.values()) if (f.durum === 'oy_kullandi') simdiki.add(f.id);
  const an = Date.now();
  for (const id of simdiki) if (!gorulen.has(id)) { vurgula.set(id, an); if (sekme !== 'gelenler') yeniRozet++; }
  for (const [id, t] of vurgula) if (!simdiki.has(id) || an - t > VURGU_MS * 4) vurgula.delete(id);
  gorulen = simdiki;
}

// ---------------------------------------------------------------- "ana ekrana ekle" şeridi
function seritCiz() {
  const yer = bul('[data-serit]'); if (!yer) return;
  const c = cihaz();
  const goster = !uygulamaModu() && (c.ios || c.android) && oku(SERIT_ANAHTAR) !== '1';
  if (!goster) { yazHtml(yer, ''); return; }
  const dugme = c.android && istem()
    ? `<button class="rp-serit-btn" data-yukle>Yükle</button>`
    : `<button class="rp-serit-btn" data-rehber>Nasıl?</button>`;
  yazHtml(yer, `
    <div class="rp-serit" role="note">
      <div class="rp-uyg-ikon">72</div>
      <div class="rp-serit-metin"><b>Ana ekrana ekle</b><span>Uygulama gibi tam ekran, tek dokunuşla açılır.</span></div>
      ${dugme}
      <button class="rp-serit-kapat" data-serit-kapat aria-label="Kapat">${IKON.kapat(16)}</button>
    </div>`);
}

// ---------------------------------------------------------------- sekmeler
function sekmeCiz(ilk = false) {
  const tanim = SEKMELER.find(s => s.k === sekme);
  const b = bul('[data-baslik]'); if (b) b.textContent = tanim.ad;
  kok.querySelectorAll('[data-sekme]').forEach(x => { const a = x.dataset.sekme === sekme; x.classList.toggle('aktif', a); a ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'); });
  const g = bul('[data-govde]');
  yazilan.delete(g);
  if (sekme === 'ozet') g.innerHTML = ozetIskelet();
  else if (sekme === 'gelenler') g.innerHTML = gelenlerIskelet();
  else if (sekme === 'referanslar') g.innerHTML = `<div data-grup-liste="referans"></div>`;
  else g.innerHTML = `<div data-grup-liste="ilce"></div>`;
  govdeGuncelle();
  if (!ilk) requestAnimationFrame(() => window.scrollTo(0, kaydirma[sekme] || 0));
}
function sekmeDegistir(k) {
  if (k === sekme) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  kaydirma[sekme] = window.scrollY;
  sekme = k; yazLS(SEKME_ANAHTAR, k);
  if (k === 'gelenler') yeniRozet = 0;
  try { history.replaceState(history.state, '', '#rapor/' + k); } catch {}
  sekmeCiz();
  ustDurumCiz();
}
function govdeGuncelle() {
  if (sekme === 'ozet') ozetGuncelle();
  else if (sekme === 'gelenler') { yeniRozet = 0; gelenListeCiz(); }
  else if (sekme === 'referanslar') grupListeCiz('referans');
  else grupListeCiz('ilce');
}

// ================================================================= SEKME 1: ÖZET
const HALKA_R = 96, HALKA_C = 2 * Math.PI * HALKA_R;
function ozetIskelet() {
  const kutu = (k, ad, renk, alt) => `
    <div class="rp-kutu">
      <div class="rp-kutu-etiket"><i style="background:${renk}"></i>${esc(ad)}</div>
      <div class="rp-kutu-deger" data-alan="${k}">0</div>
      <div class="rp-kutu-alt" data-alt="${k}">${esc(alt)}</div>
    </div>`;
  return `
    <section class="rp-kart rp-halka-kart" aria-label="Hedefe ilerleme">
      <div class="rp-halka">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle class="iz" cx="110" cy="110" r="${HALKA_R}" stroke-width="16" fill="none"/>
          <circle class="dolu" data-halka cx="110" cy="110" r="${HALKA_R}" stroke-width="16" fill="none" stroke-linecap="round" stroke-dasharray="${HALKA_C.toFixed(2)}" stroke-dashoffset="${HALKA_C.toFixed(2)}"/>
        </svg>
        <div class="rp-halka-ic">
          <div class="rp-halka-etiket">Bizden oy</div>
          <div class="rp-buyuk" data-alan="oy_bizde">0</div>
          <div class="rp-halka-hedef">/ <span data-alan="hedef">0</span> hedef</div>
        </div>
      </div>
      <div class="rp-yuzde" data-yuzde></div>
      <div class="rp-toplam" data-toplam></div>
    </section>
    <div class="rp-dortlu">
      ${kutu('fuarda', 'Fuarda', 'var(--mor)', 'oy sırasında')}
      ${kutu('yolda', 'Yolda', 'var(--amber)', 'fuara geliyor')}
      ${kutu('kalan', 'Kalan', 'var(--kirmizi)', 'hedefe')}
      ${kutu('kendi_geldi', 'Kendi geldi', 'var(--yesil)', 'servissiz oy verdi')}
    </div>
    <button class="rp-sondk" data-hareketler aria-label="Son hareketleri aç">
      <span class="rp-sondk-etiket">SON DAKİKA</span>
      <span class="rp-sondk-metin" data-sondk-metin></span>
      <span class="rp-sondk-saat" data-sondk-saat></span>
      <span class="rp-sondk-ok">${IKON.sag(16)}</span>
    </button>
    <section class="rp-kart rp-grafik-kart" aria-label="Saatlik ilerleme">
      <div class="rp-kart-ust">
        <div><div class="rp-kart-baslik">Saatlik ilerleme</div><div class="rp-kart-alt">Bizden oy, kümülatif</div></div>
        <div class="rp-tempo" data-tempo></div>
      </div>
      <div class="rp-grafik" data-grafik></div>
      <div class="rp-saatler" data-saatler></div>
    </section>`;
}
function sayiYaz(alan, deger) {
  kok.querySelectorAll(`[data-alan="${alan}"]`).forEach(x => {
    const y = fmt.sayi(deger);
    if (x.textContent === y) return;
    const ilk = x.textContent === '' || x.dataset.ilk !== '1';
    x.textContent = y; x.dataset.ilk = '1';
    if (!ilk) { x.classList.remove('rp-degisti'); void x.offsetWidth; x.classList.add('rp-degisti'); }
  });
}
function ozetGuncelle() {
  const s = sayac();
  const hedef = s.hedef || 0;
  const oran = hedef ? Math.min(1, s.oy_bizde / hedef) : 0;
  sayiYaz('oy_bizde', s.oy_bizde); sayiYaz('hedef', hedef);
  sayiYaz('fuarda', s.fuarda); sayiYaz('yolda', s.yolda); sayiYaz('kalan', s.kalan); sayiYaz('kendi_geldi', s.kendi_geldi);
  const h = bul('[data-halka]'); if (h) h.setAttribute('stroke-dashoffset', (HALKA_C * (1 - oran)).toFixed(2));
  const tamam = hedef && s.oy_bizde >= hedef;
  yazHtml(bul('[data-yuzde]'), tamam
    ? `<span class="rp-yuzde-cip tamam">✓ Hedefe ulaşıldı · %${fmt.yuzde(s.oy_bizde, hedef)}</span>`
    : `<span class="rp-yuzde-cip">%${fmt.yuzde(s.oy_bizde, hedef)} tamamlandı</span>`);
  const hedefDisi = s.oy_kullandi - s.oy_bizde;
  yazHtml(bul('[data-toplam]'), s.oy_kullandi
    ? `Toplam oy kullanan <b>${fmt.sayi(s.oy_kullandi)}</b>${hedefDisi > 0 ? ` · hedef dışı <b>${fmt.sayi(hedefDisi)}</b>` : ''}`
    : `Henüz oy kullanan işaretlenmedi`);
  const ya = bul('[data-alt="yolda"]');
  if (ya) { ya.textContent = s.geciken ? `${fmt.sayi(s.geciken)} kişi gecikmede` : 'fuara geliyor'; ya.title = s.geciken ? 'Servis saati geçtiği halde henüz yola çıkmayanlar' : ''; }
  ya?.classList.toggle('uyari', !!s.geciken);
  sonDakikaCiz();
  grafikCiz();
}

// ---------------------------------------------------------------- son dakika
function sonHareket() { return store.olaylar.find(o => o.tur === 'durum') || null; }
function sonDakikaCiz() {
  const m = bul('[data-sondk-metin]'), z = bul('[data-sondk-saat]'); if (!m) return;
  const o = sonHareket();
  if (!o) { m.textContent = 'Henüz hareket yok. İlk işaret burada görünecek.'; z.textContent = ''; return; }
  const yeni = o.id !== sonOlayId;
  m.textContent = olayMetni(o);
  z.textContent = fmt.goreli(o.zaman);
  z.title = fmt.saat(o.zaman);
  if (yeni) { sonOlayId = o.id; const b = bul('.rp-sondk'); if (b) { b.classList.remove('rp-flas'); void b.offsetWidth; b.classList.add('rp-flas'); } }
}

// ---------------------------------------------------------------- saatlik grafik (SVG, kümülatif)
let grafikNoktalar = [];
function grafikVeri() {
  const { bas: b, bit: t } = zamanAyar();
  const sg = secimGunu();
  const bugun0 = simdi(); bugun0.setHours(0, 0, 0, 0);
  const gun0 = sg || bugun0;
  let simdiD = simdiDk();
  if (sg) { if (bugun0 < sg) simdiD = -1; else if (bugun0 > sg) simdiD = 24 * 60; }
  const son = Math.min(Math.max(simdiD, b), t);
  const dk = firmaListesi().filter(f => f.oy_sinifi === 'bizde' && f.durum === 'oy_kullandi').map(f => {
    if (!f.durum_zamani) return b;
    const m = (new Date(f.durum_zamani).getTime() - gun0.getTime()) / 60000;
    return Math.min(Math.max(m, b), son);
  }).sort((x, y) => x - y);
  const say = u => { let n = 0; for (const x of dk) { if (x <= u) n++; else break; } return n; };
  const acildi = simdiD >= b || dk.length > 0;
  const noktalar = [], kovalar = [];
  if (acildi) {
    for (let u = b; u < son; u += 60) noktalar.push({ dk: u, deger: say(u) });
    noktalar.push({ dk: son, deger: dk.length, simdi: true });
    // saatlik kovalar: ilk kova açılış öncesi işaretleri de içerir, kova toplamı = toplam
    for (let u = b; u < Math.max(son, b + 1); u += 60) {
      const bitis = Math.min(u + 60, son);
      kovalar.push({ bas: u, artis: say(bitis) - (u === b ? 0 : say(u)), simdi: simdiD >= u && simdiD < u + 60 && simdiD < t });
    }
  }
  const sonSaat = son - 60 < b ? dk.length : dk.length - say(son - 60);
  return { b, t, noktalar, kovalar, toplam: dk.length, sonSaat };
}
function grafikCiz() {
  const kap = bul('[data-grafik]'); if (!kap) return;
  const v = grafikVeri();
  const hedef = hedefSayi() || 0;
  const W = Math.max(260, Math.round(kap.clientWidth || 340)), H = 168;
  const sol = 16, sag = 38, ust = 20, alt = 24;
  const pw = W - sol - sag, ph = H - ust - alt;
  const ymax = Math.max(hedef, v.toplam, 1) * 1.08;
  const x = d => sol + ((d - v.b) / Math.max(1, v.t - v.b)) * pw;
  const y = n => ust + ph - (n / ymax) * ph;
  const saatEt = d => `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(Math.round(d % 60)).padStart(2, '0')}`;
  let s = `<svg class="rp-g" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saatlik kümülatif bizden oy grafiği">`;
  // ızgara: taban + hedef
  s += `<line class="rp-g-izgara" x1="${sol}" x2="${sol + pw}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
  if (hedef) {
    const hy = y(hedef).toFixed(1);
    s += `<line class="rp-g-hedef" x1="${sol}" x2="${sol + pw}" y1="${hy}" y2="${hy}"/>`;
    s += `<text class="rp-g-yazi" x="${sol - 4}" y="${(+hy - 6).toFixed(1)}">Hedef ${esc(fmt.sayi(hedef))}</text>`;
  }
  // saat etiketleri (2 saatte bir)
  const adim = v.t - v.b > 600 ? 180 : 120;
  for (let d = v.b; d <= v.t; d += adim) s += `<text class="rp-g-yazi" x="${x(d).toFixed(1)}" y="${H - 6}" text-anchor="middle">${saatEt(d)}</text>`;
  const n = v.noktalar;
  if (n.length) {
    const yol = n.map((p, i) => `${i ? 'L' : 'M'}${x(p.dk).toFixed(1)},${y(p.deger).toFixed(1)}`).join('');
    s += `<path class="rp-g-alan" d="${yol}L${x(n[n.length - 1].dk).toFixed(1)},${y(0).toFixed(1)}L${x(n[0].dk).toFixed(1)},${y(0).toFixed(1)}Z"/>`;
    s += `<path class="rp-g-cizgi" d="${yol}"/>`;
    const sn = n[n.length - 1]; const sx = x(sn.dk), sy = y(sn.deger);
    s += `<circle class="rp-g-nokta" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.5"/>`;
    s += `<text class="rp-g-deger" x="${(sx + 8).toFixed(1)}" y="${(sy + 4).toFixed(1)}">${esc(fmt.sayi(sn.deger))}</text>`;
  } else {
    s += `<text class="rp-g-bos" x="${(sol + pw / 2).toFixed(1)}" y="${(ust + ph / 2 + 4).toFixed(1)}" text-anchor="middle">Oy verme başlayınca çizgi burada yükselir</text>`;
  }
  s += `<g class="rp-g-arti" data-arti style="display:none"><line data-arti-cizgi y1="${ust - 6}" y2="${y(0).toFixed(1)}"/><circle data-arti-nokta r="5"/></g>`;
  s += `<rect data-dokunma x="0" y="0" width="${W}" height="${H}" fill="transparent"/>`;
  s += `</svg><div class="rp-g-ipucu" data-ipucu hidden><b></b><span></span></div>`;
  grafikNoktalar = n.map(p => ({ ...p, x: x(p.dk), y: y(p.deger) }));
  if (yazHtml(kap, s)) grafikEtkilesim(kap, saatEt);
  // tempo + saatlik tablo görünümü
  yazHtml(bul('[data-tempo]'), v.noktalar.length ? `<b>+${esc(fmt.sayi(v.sonSaat))}</b><span>son 1 saat</span>` : '');
  const sy = bul('[data-saatler]');
  if (yazHtml(sy, v.kovalar.length
    ? v.kovalar.map(k => `<div class="rp-saat-cip${k.simdi ? ' simdi' : ''}"><span>${saatEt(k.bas)}</span><b>+${esc(fmt.sayi(k.artis))}</b></div>`).join('')
    : `<div class="rp-saat-bos">Saat başı artışlar burada listelenecek.</div>`)) sy.scrollLeft = sy.scrollWidth;
}
function grafikEtkilesim(kap, saatEt) {
  const svgEl = kap.querySelector('svg'), alan = kap.querySelector('[data-dokunma]'), arti = kap.querySelector('[data-arti]');
  const ipucu = kap.querySelector('[data-ipucu]'); if (!svgEl || !alan || !grafikNoktalar.length) return;
  let gizleZam = null;
  const goster = e => {
    const r = svgEl.getBoundingClientRect(); const px = e.clientX - r.left;
    let en = grafikNoktalar[0]; for (const p of grafikNoktalar) if (Math.abs(p.x - px) < Math.abs(en.x - px)) en = p;
    const i = grafikNoktalar.indexOf(en); const once = i > 0 ? grafikNoktalar[i - 1].deger : 0;
    arti.style.display = '';
    arti.querySelector('[data-arti-cizgi]').setAttribute('x1', en.x); arti.querySelector('[data-arti-cizgi]').setAttribute('x2', en.x);
    const nk = arti.querySelector('[data-arti-nokta]'); nk.setAttribute('cx', en.x); nk.setAttribute('cy', en.y);
    ipucu.hidden = false;
    ipucu.querySelector('b').textContent = `${fmt.sayi(en.deger)} oy`;
    ipucu.querySelector('span').textContent = i > 0
      ? `${saatEt(grafikNoktalar[i - 1].dk)}-${saatEt(en.dk)} arası +${fmt.sayi(en.deger - once)}${en.simdi ? ' · şimdi' : ''}`
      : `${saatEt(en.dk)} · açılış`;
    const w = ipucu.offsetWidth; ipucu.style.left = `${Math.min(Math.max(0, en.x - w / 2), r.width - w)}px`;
    clearTimeout(gizleZam);
  };
  const gizle = (gecikmeli) => { clearTimeout(gizleZam); gizleZam = setTimeout(() => { arti.style.display = 'none'; ipucu.hidden = true; }, gecikmeli ? 2200 : 0); };
  alan.addEventListener('pointerdown', goster);
  alan.addEventListener('pointermove', goster);
  alan.addEventListener('pointerleave', e => gizle(e.pointerType !== 'mouse'));
  alan.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') gizle(true); });
}

// ================================================================= SEKME 2: GELENLER
function gelenlerIskelet() {
  return `
    <div class="rp-arama">
      ${IKON.ara(18)}
      <input type="search" data-gelen-ara placeholder="Ad, firma, referans ya da telefon" value="${esc(gelenArama)}" autocomplete="off" enterkeyhint="search">
      <button class="rp-arama-temizle" data-ara-temizle aria-label="Aramayı temizle" ${gelenArama ? '' : 'hidden'}>${IKON.kapat(14)}</button>
    </div>
    <div class="cipler rp-cipler" data-gelen-filtre></div>
    <div data-gelen-liste></div>`;
}
function gelenListeCiz() {
  const hepsi = gelenler();
  const say = { hepsi: hepsi.length, bizde: hepsi.filter(f => f.oy_sinifi === 'bizde').length, kendi: hepsi.filter(f => f.kendi_geldi).length };
  yazHtml(bul('[data-gelen-filtre]'), [['hepsi', 'Hepsi'], ['bizde', 'Bizden'], ['kendi', 'Kendi geldi']]
    .map(([k, ad]) => `<button class="cip${gelenFiltre === k ? ' aktif' : ''}" data-filtre="${k}">${esc(ad)} <span class="say">${fmt.sayi(say[k])}</span></button>`).join(''));
  let liste = hepsi;
  if (gelenFiltre === 'bizde') liste = liste.filter(f => f.oy_sinifi === 'bizde');
  else if (gelenFiltre === 'kendi') liste = liste.filter(f => f.kendi_geldi);
  const q = gelenArama.trim();
  if (q) liste = liste.filter(f => aramaEslesir(f, q));
  const yer = bul('[data-gelen-liste]'); if (!yer) return;
  if (!liste.length) {
    const msj = !hepsi.length ? ['Henüz gelen yok', 'Masada "oy kullandı" işaretlenen herkes burada anında belirir.']
      : q ? ['Sonuç yok', `"${q}" için eşleşen gelen bulunamadı.`] : ['Bu filtrede kimse yok', 'Başka bir filtre seç.'];
    yazHtml(yer, `<div class="rp-bos"><div class="rp-bos-ikon">${IKON.gelenler(28)}</div><b>${esc(msj[0])}</b><span>${esc(msj[1])}</span></div>`);
    return;
  }
  const gorunen = liste.slice(0, gelenSinir);
  const html = `
    <div class="rp-liste-ust">${q || gelenFiltre !== 'hepsi' ? `${fmt.sayi(liste.length)} sonuç` : `Son gelen en üstte · ${fmt.sayi(liste.length)} kişi`}</div>
    <div class="rp-liste">${gorunen.map(gelenSatir).join('')}</div>
    ${liste.length > gorunen.length ? `<button class="rp-daha" data-daha>Daha fazla göster <span>${fmt.sayi(liste.length - gorunen.length)} kişi daha</span></button>` : ''}`;
  yazHtml(yer, html);
}
function gelenSatir(f) {
  const tel = telSec(f);
  const ad = kisiAd(f); const firma = f.yetkili ? f.unvan : '';
  const meta = [
    f.referans ? `<span>Ref: ${esc(refAd(f.referans))}</span>` : '',
    f.ilce ? `<span>${esc(ilceAd(f.ilce))}</span>` : '',
  ].filter(Boolean).join('<span class="rp-ayrac">·</span>');
  const etiketler = [
    tel ? `<a href="${tel.link}" class="rp-tel-yazi" data-tel>${esc(tel.yazi)}</a>` : '',
    f.kendi_geldi ? `<span class="rp-etiket yesil">Kendi geldi</span>` : '',
    f.oy_sinifi !== 'bizde' ? `<span class="rp-etiket">${esc(SINIF_AD[f.oy_sinifi] || f.oy_sinifi || 'Sınıfsız')}</span>` : '',
    f.kisi_oy_sayisi > 1 ? `<span class="rp-etiket koyu">${f.kisi_oy_sayisi} OY</span>` : '',
  ].join('');
  const gecen = vurgula.has(f.id) ? Date.now() - vurgula.get(f.id) : Infinity;
  const yeni = gecen < VURGU_MS ? ` yeni" style="animation-delay:-${Math.round(gecen)}ms` : '';
  return `
    <div class="rp-satir${f.oy_sinifi === 'bizde' ? ' bizde' : ''}${yeni}" data-kisi="${f.id}">
      <div class="rp-satir-saat">${esc(fmt.saat(f.durum_zamani) || '--:--')}</div>
      <div class="rp-satir-govde">
        <div class="rp-ad">${esc(ad)}</div>
        ${firma ? `<div class="rp-firma">${esc(firma)}</div>` : ''}
        ${meta ? `<div class="rp-meta">${meta}</div>` : ''}
        ${etiketler ? `<div class="rp-etiketler">${etiketler}</div>` : ''}
      </div>
      ${tel ? `<a class="rp-ara-btn" href="${tel.link}" data-tel aria-label="${esc(ad)} ara">${IKON.tel(18)}</a>` : ''}
    </div>`;
}

// ================================================================= SEKME 3 ve 4: REFERANSLAR, İLÇELER
function gruplar(tur) {
  const m = new Map();
  for (const f of store.firmalar.values()) {
    const k = String((tur === 'referans' ? f.referans : f.ilce) || '').trim();
    let g = m.get(k);
    if (!g) m.set(k, g = { k, adet: 0, hedef: 0, gelen: 0, fuarda: 0, yolda: 0, digerGelen: 0, toplamOy: 0 });
    g.adet++;
    const oy = f.durum === 'oy_kullandi';
    if (oy) g.toplamOy++;
    if (f.oy_sinifi === 'bizde') { g.hedef++; if (oy) g.gelen++; else if (f.durum === 'fuarda') g.fuarda++; else if (f.durum === 'yolda') g.yolda++; }
    else if (oy) g.digerGelen++;
  }
  return [...m.values()];
}
const grupAd = (tur, k) => tur === 'referans' ? refAd(k) : ilceAd(k);
function yigin(g) {
  if (!g.hedef) return `<div class="rp-yigin"></div>`;
  const p = n => (n / g.hedef) * 100;
  return `<div class="rp-yigin" role="img" aria-label="${g.gelen} oy kullandı, ${g.fuarda} fuarda, ${g.yolda} yolda, hedef ${g.hedef}">${g.gelen ? `<i class="g" style="width:${p(g.gelen).toFixed(2)}%"></i>` : ''}${g.fuarda ? `<i class="f" style="width:${p(g.fuarda).toFixed(2)}%"></i>` : ''}${g.yolda ? `<i class="y" style="width:${p(g.yolda).toFixed(2)}%"></i>` : ''}</div>`;
}
function grupListeCiz(tur) {
  const yer = bul(`[data-grup-liste="${tur}"]`); if (!yer) return;
  const hepsi = gruplar(tur);
  const ana = hepsi.filter(g => g.k && g.hedef > 0);
  const diger = hepsi.filter(g => !g.k || !g.hedef).sort((a, b) => b.adet - a.adet);
  const sira = tur === 'referans' ? refSira : ilceSira;
  const ad = g => grupAd(tur, g.k);
  const oran = g => g.hedef ? g.gelen / g.hedef : 0;
  ana.sort(sira === 'ad' ? (a, b) => ad(a).localeCompare(ad(b), 'tr')
    : sira === 'geride' ? (a, b) => oran(a) - oran(b) || b.hedef - a.hedef
      : (a, b) => b.hedef - a.hedef || ad(a).localeCompare(ad(b), 'tr'));
  const topH = ana.reduce((t, g) => t + g.hedef, 0), topG = ana.reduce((t, g) => t + g.gelen, 0);
  if (!hepsi.length) { yazHtml(yer, `<div class="rp-bos"><b>Veri yok</b><span>Firmalar yüklenince burada görünecek.</span></div>`); return; }
  const html = `
    <div class="rp-grup-ozet">
      <div><b>${fmt.sayi(ana.length)}</b> ${tur === 'referans' ? 'referans' : 'ilçe'} · hedef <b>${fmt.sayi(topH)}</b> · gelen <b>${fmt.sayi(topG)}</b></div>
      <div class="rp-lejant"><span><i class="g"></i>Oy kullandı</span><span><i class="f"></i>Fuarda</span><span><i class="y"></i>Yolda</span></div>
    </div>
    <div class="cipler rp-cipler">
      ${[['hedef', 'Hedefe göre'], ['geride', 'En geride'], ['ad', 'A-Z']].map(([k, a]) => `<button class="cip${sira === k ? ' aktif' : ''}" data-sirala="${tur}:${k}">${esc(a)}</button>`).join('')}
    </div>
    <div class="rp-liste">${ana.map(g => grupSatir(tur, g)).join('')}</div>
    ${diger.length ? `
      <div class="rp-bolum">Hedef listesi dışındakiler</div>
      <div class="rp-liste">${diger.map(g => `
        <button class="rp-grup kucuk" data-grup="${tur}" data-k="${esc(g.k)}">
          <div class="rp-grup-ust"><span class="rp-grup-ad">${esc(ad(g))}</span><span class="rp-grup-sayi"><b>${fmt.sayi(g.toplamOy)}</b> oy · ${fmt.sayi(g.adet)} firma</span><span class="rp-grup-ok">${IKON.sag(16)}</span></div>
        </button>`).join('')}</div>` : ''}`;
  yazHtml(yer, html);
}
function grupSatir(tur, g) {
  const bekleyen = g.hedef - g.gelen;
  const tamam = g.gelen >= g.hedef;
  const alt = [
    tamam ? `<span class="rp-tamam">✓ Tamamlandı</span>` : `<span>%${fmt.yuzde(g.gelen, g.hedef)}</span>`,
    !tamam ? `<span>${fmt.sayi(bekleyen)} bekleniyor</span>` : '',
    g.fuarda ? `<span>${fmt.sayi(g.fuarda)} fuarda</span>` : '',
    g.yolda ? `<span>${fmt.sayi(g.yolda)} yolda</span>` : '',
    g.digerGelen ? `<span>+${fmt.sayi(g.digerGelen)} liste dışı oy</span>` : '',
  ].filter(Boolean).join('<span class="rp-ayrac">·</span>');
  return `
    <button class="rp-grup" data-grup="${tur}" data-k="${esc(g.k)}">
      <div class="rp-grup-ust"><span class="rp-grup-ad">${esc(grupAd(tur, g.k))}</span><span class="rp-grup-sayi"><b>${fmt.sayi(g.gelen)}</b> / ${fmt.sayi(g.hedef)}</span><span class="rp-grup-ok">${IKON.sag(16)}</span></div>
      ${yigin(g)}
      <div class="rp-grup-alt">${alt}</div>
    </button>`;
}

// ================================================================= ALT SAYFALAR (grup detayı, son hareketler, menü, rehber)
function sayfaAc(s) {
  const yeniAcilis = !sayfa;
  sayfa = s;
  const yer = bul('[data-sayfa-kok]'); if (!yer) return;
  yer.innerHTML = `
    <div class="rp-sayfa-arka" data-sayfa-kapat></div>
    <section class="rp-sayfa" role="dialog" aria-modal="true">
      <div class="rp-sayfa-tutamak" data-surukle><i></i></div>
      <div class="rp-sayfa-ust" data-surukle data-sayfa-ust></div>
      <div class="rp-sayfa-govde" data-sayfa-govde></div>
    </section>`;
  sayfaIcerikCiz(true);
  suruklemeBagla(yer.querySelector('.rp-sayfa'));
  if (yeniAcilis) { try { history.pushState({ raporSayfa: true }, ''); sayfaGecmis = true; } catch { sayfaGecmis = false; } }
  document.documentElement.classList.add('rp-kilit');
}
function sayfaKapat({ gecmis = true } = {}) {
  if (!sayfa) return;
  sayfa = null;
  const yer = bul('[data-sayfa-kok]');
  const s = yer?.querySelector('.rp-sayfa'), a = yer?.querySelector('.rp-sayfa-arka');
  if (s) { s.classList.add('kapaniyor'); a?.classList.add('kapaniyor'); setTimeout(() => { if (!sayfa && yer) yer.innerHTML = ''; }, 180); }
  document.documentElement.classList.remove('rp-kilit');
  if (gecmis && sayfaGecmis && history.state?.raporSayfa) { sayfaGecmis = false; history.back(); } else sayfaGecmis = false;
}
function suruklemeBagla(s) {
  let y0 = null, dy = 0;
  s.querySelectorAll('[data-surukle]').forEach(t => {
    t.addEventListener('pointerdown', e => { if (e.target.closest('button,a,input')) return; y0 = e.clientY; dy = 0; s.style.transition = 'none'; t.setPointerCapture?.(e.pointerId); });
    t.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); s.style.transform = `translateY(${dy}px)`; });
    const bitir = () => { if (y0 === null) return; y0 = null; s.style.transition = ''; if (dy > 90) sayfaKapat(); else s.style.transform = ''; };
    t.addEventListener('pointerup', bitir); t.addEventListener('pointercancel', bitir);
  });
}
function sayfaIcerikCiz(ilk = false) {
  if (!sayfa) return;
  const ustYer = bul('[data-sayfa-ust]'), govde = bul('[data-sayfa-govde]'); if (!ustYer || !govde) return;
  let ust = '', icerik = '';
  if (sayfa.tur === 'grup') [ust, icerik] = grupSayfa(sayfa.grupTur, sayfa.k);
  else if (sayfa.tur === 'hareket') [ust, icerik] = hareketSayfa();
  else if (sayfa.tur === 'menu') [ust, icerik] = menuSayfa();
  else if (sayfa.tur === 'rehber') [ust, icerik] = rehberSayfa();
  const kapat = `<button class="rp-ikon-btn yuvarlak" data-sayfa-kapat aria-label="Kapat">${IKON.kapat(16)}</button>`;
  yazHtml(ustYer, `<div class="rp-sayfa-baslik">${ust}</div>${kapat}`);
  const kay = govde.scrollTop;
  yazHtml(govde, icerik);
  if (!ilk) govde.scrollTop = kay;
}
function kisiSatiri(f, { saat = false } = {}) {
  const tel = telSec(f); const g = gecikme(f);
  return `
    <div class="rp-satir kompakt${f.oy_sinifi === 'bizde' ? ' bizde' : ''}" data-kisi="${f.id}">
      ${saat ? `<div class="rp-satir-saat">${esc(fmt.saat(f.durum_zamani) || '--:--')}</div>` : ''}
      <div class="rp-satir-govde">
        <div class="rp-ad">${esc(kisiAd(f))}</div>
        ${f.yetkili ? `<div class="rp-firma">${esc(f.unvan)}</div>` : ''}
        <div class="rp-etiketler">${tel ? `<a href="${tel.link}" class="rp-tel-yazi" data-tel>${esc(tel.yazi)}</a>` : ''}${saat ? (f.kendi_geldi ? `<span class="rp-etiket yesil">Kendi geldi</span>` : '') : rozetDurum(f)}${g ? `<span class="rozet u-gecikti">${g} dk gecikti</span>` : ''}${f.oy_sinifi !== 'bizde' ? rozetSinif(f.oy_sinifi) : ''}</div>
      </div>
      ${tel ? `<a class="rp-ara-btn" href="${tel.link}" data-tel aria-label="${esc(kisiAd(f))} ara">${IKON.tel(18)}</a>` : ''}
    </div>`;
}
const DURUM_SIRA = { fuarda: 0, yolda: 1, arandi: 2, bekliyor: 3 };
function grupSayfa(tur, k) {
  const liste = firmaListesi().filter(f => String((tur === 'referans' ? f.referans : f.ilce) || '').trim() === k);
  const ad = grupAd(tur, k);
  const biz = liste.filter(f => f.oy_sinifi === 'bizde');
  const gelen = liste.filter(f => f.durum === 'oy_kullandi').sort((a, b) => (a.oy_sinifi === 'bizde' ? 0 : 1) - (b.oy_sinifi === 'bizde' ? 0 : 1) || oyZamani(b) - oyZamani(a));
  const gelmeyen = biz.filter(f => f.durum !== 'oy_kullandi').sort((a, b) => (DURUM_SIRA[a.durum] ?? 9) - (DURUM_SIRA[b.durum] ?? 9) || kisiAd(a).localeCompare(kisiAd(b), 'tr'));
  const disarda = liste.filter(f => f.oy_sinifi !== 'bizde' && f.durum !== 'oy_kullandi').sort((a, b) => kisiAd(a).localeCompare(kisiAd(b), 'tr'));
  const g = { hedef: biz.length, gelen: biz.filter(f => f.durum === 'oy_kullandi').length, fuarda: biz.filter(f => f.durum === 'fuarda').length, yolda: biz.filter(f => f.durum === 'yolda').length };
  const ust = `<div class="rp-sayfa-ust-etiket">${tur === 'referans' ? 'Referans' : 'İlçe'}</div><h2>${esc(ad)}</h2>
    <div class="rp-sayfa-ust-alt">${g.hedef ? `<b>${fmt.sayi(g.gelen)}</b> / ${fmt.sayi(g.hedef)} hedef · %${fmt.yuzde(g.gelen, g.hedef)}` : `${fmt.sayi(liste.length)} firma · hedef listesinde değil`}</div>`;
  const bolum = (baslik, sayi, satirlar, bos) => `<div class="rp-bolum">${esc(baslik)} <span>${fmt.sayi(sayi)}</span></div>${satirlar || `<div class="rp-bos-kucuk">${esc(bos)}</div>`}`;
  let icerik = '';
  if (g.hedef) icerik += `${yigin(g)}<div class="rp-mini-dortlu"><div><b>${fmt.sayi(g.gelen)}</b><span>oy kullandı</span></div><div><b>${fmt.sayi(g.fuarda)}</b><span>fuarda</span></div><div><b>${fmt.sayi(g.yolda)}</b><span>yolda</span></div><div><b>${fmt.sayi(g.hedef - g.gelen - g.fuarda - g.yolda)}</b><span>henüz yok</span></div></div>`;
  if (g.hedef) icerik += bolum('Gelmeyenler', gelmeyen.length, gelmeyen.length ? `<div class="rp-liste">${gelmeyen.map(f => kisiSatiri(f)).join('')}</div>` : '', 'Hedefteki herkes oy kullandı.');
  icerik += bolum('Gelenler', gelen.length, gelen.length ? `<div class="rp-liste">${gelen.map(f => kisiSatiri(f, { saat: true })).join('')}</div>` : '', 'Henüz oy kullanan yok.');
  if (disarda.length) icerik += `<details class="rp-detay"${g.hedef ? '' : ' open'}><summary class="rp-bolum">Hedef dışı, henüz gelmedi <span>${fmt.sayi(disarda.length)}</span></summary><div class="rp-liste">${disarda.map(f => kisiSatiri(f)).join('')}</div></details>`;
  return [ust, icerik];
}
function hareketSayfa() {
  const liste = store.olaylar.filter(o => o.tur === 'durum').slice(0, 40);
  const ust = `<div class="rp-sayfa-ust-etiket">Canlı akış</div><h2>Son hareketler</h2><div class="rp-sayfa-ust-alt">Masada yapılan son ${fmt.sayi(liste.length)} işaret</div>`;
  if (!liste.length) return [ust, `<div class="rp-bos-kucuk">Henüz hareket yok.</div>`];
  const renk = o => String(o.yeni || '').split('+')[0];
  return [ust, `<ul class="rp-akis">${liste.map(o => `
    <li${o.firma_id ? ` data-kisi="${o.firma_id}"` : ''}>
      <span class="rp-akis-saat">${esc(fmt.saat(o.zaman))}</span>
      <i class="rp-akis-nokta n-${esc(renk(o))}"></i>
      <div><div class="rp-akis-metin">${esc(olayMetni(o))}</div><div class="rp-akis-alt">${esc(o.kim_ad || (o.kaynak === 'asistan' ? 'ATLAS' : ''))}${o.kaynak_metin ? ` · ${esc(o.kaynak_metin)}` : ''}</div></div>
    </li>`).join('')}</ul>`];
}
function menuSayfa() {
  const ben = store.ben || {};
  const t = temaTercih || 'sistem';
  const ekranlar = DIGER_EKRANLAR.filter(e => e.roller.includes(ben.rol));
  const ust = `<div class="rp-menu-kisi"><div class="rp-avatar">${esc(bas(ben.ad_soyad))}</div><div><h2>${esc(ben.ad_soyad || '')}</h2><div class="rp-sayfa-ust-alt">${esc(ROL_AD[ben.rol] || ben.rol || '')}</div></div></div>`;
  const icerik = `
    <div class="rp-bolum">Görünüm</div>
    <div class="rp-bolumlu" role="radiogroup">
      ${[['acik', 'Açık'], ['koyu', 'Koyu'], ['sistem', 'Otomatik']].map(([k, a]) => `<button role="radio" aria-checked="${t === k}" class="${t === k ? 'aktif' : ''}" data-tema-sec="${k}">${esc(a)}</button>`).join('')}
    </div>
    ${!uygulamaModu() ? `<button class="rp-menu-satir" data-rehber>${IKON.ekle(20)}<span>Ana ekrana ekle<small>Uygulama gibi tam ekran kullan</small></span>${IKON.sag(16)}</button>` : ''}
    ${ekranlar.length ? `<div class="rp-bolum">Diğer ekranlar</div><div class="rp-menu-ekranlar">${ekranlar.map(e => `<button class="rp-menu-ekran" data-git="${e.k}">${esc(e.ad)}</button>`).join('')}</div>` : ''}
    <button class="rp-menu-satir tehlike" data-cikis>${IKON.cikis(20)}<span>Çıkış yap</span></button>
    <div class="rp-menu-alt">Son veri ${esc(fmt.saat(sonVeri))} · ${fmt.sayi(store.firmalar.size)} firma · ${store.canli ? 'canlı bağlı' : 'bağlantı bekleniyor'}</div>`;
  return [ust, icerik];
}

// ---------------------------------------------------------------- ana ekrana ekle rehberi (çizimli, 3 adım)
function rehberSayfa() {
  const c = cihaz();
  const p = rehberPlatform || (c.android ? 'android' : 'ios');
  const ust = `<div class="rp-sayfa-ust-etiket">3 adım</div><h2>Ana ekrana ekle</h2><div class="rp-sayfa-ust-alt">Bir kez ekle, sonra uygulama gibi aç.</div>`;
  const secici = `<div class="rp-bolumlu" role="tablist">${[['ios', 'iPhone'], ['android', 'Android']].map(([k, a]) => `<button role="tab" aria-selected="${p === k}" class="${p === k ? 'aktif' : ''}" data-platform="${k}">${esc(a)}</button>`).join('')}</div>`;
  const adim = (n, baslik, alt, cizim) => `<li class="rp-adim"><div class="rp-adim-no">${n}</div><div class="rp-adim-metin"><b>${baslik}</b><span>${alt}</span></div><div class="rp-adim-cizim">${cizim}</div></li>`;
  let adimlar;
  if (p === 'ios') {
    const krom = c.ios && c.tarayici !== 'safari';
    adimlar = [
      adim(1, 'Paylaş simgesine dokun', krom ? 'Adres çubuğunun sağındaki kare ve yukarı ok simgesi.' : 'Safari\'nin alt çubuğunda, kare ve yukarı ok. Görmüyorsan önce ••• simgesine dokun.', cizimIos1()),
      adim(2, '"Ana Ekrana Ekle"yi seç', 'Listede yoksa aşağı kaydır ya da "Daha Fazla"ya dokun.', cizimIos2()),
      adim(3, 'Sağ üstte "Ekle"ye dokun', '"Web uygulaması olarak aç" seçeneği varsa açık kalsın. Sonra ana ekrandaki 72 simgesinden aç; ilk açılışta adını ve PIN\'ini bir kez daha gir.', cizimIos3()),
    ];
  } else {
    adimlar = [
      adim(1, 'Sağ üstteki ⋮ menüsüne dokun', 'Chrome\'da adres çubuğunun yanındaki üç nokta.', cizimAnd1()),
      adim(2, '"Uygulamayı yükle"yi seç', 'Bazı telefonlarda adı "Ana ekrana ekle" olur.', cizimAnd2()),
      adim(3, '"Yükle"ye dokun', 'Simge ana ekrana gelir, oradan tam ekran açılır.', cizimAnd3()),
    ];
  }
  const not = p === 'ios'
    ? 'Bağlantıyı WhatsApp ya da Instagram içinde açtıysan önce Safari\'de aç (pusula simgesi ya da "Safari\'de Aç").'
    : 'Samsung İnternet\'te: alttaki ≡ menüsü, sonra "Sayfayı ekle" ve "Ana ekran". Bağlantı bir uygulamanın içinde açıldıysa önce "Chrome\'da aç" de.';
  const yukle = p === 'android' && istem() ? `<button class="rp-buyuk-btn" data-yukle>${IKON.ekle(20)} Şimdi yükle</button>` : '';
  const uyari = c.uygulamaIci ? `<div class="rp-not uyari">Şu an bir uygulamanın içindeki tarayıcıdasın. Ana ekrana eklemek için sayfayı ${c.ios ? 'Safari' : 'Chrome'}'de aç.</div>` : '';
  return [ust, `${secici}${uyari}${yukle}<ol class="rp-adimlar">${adimlar.join('')}</ol><div class="rp-not">${esc(not)}</div>`];
}
// çizimler: sınıflar CSS'te (.rp-il ...), iki temada da okunur
const ilSvg = (h, ic) => `<svg class="rp-il" viewBox="0 0 280 ${h}" aria-hidden="true">${ic}</svg>`;
const halkaIsaret = (cx, cy, r = 17) => `<circle class="ka" cx="${cx}" cy="${cy}" r="${r}"/><circle class="kc rp-il-nabiz" cx="${cx}" cy="${cy}" r="${r}"/>`;
const uygIkon = (x, y, s = 36) => `<rect class="k" x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.23}"/><text class="b" x="${x + s / 2}" y="${y + s / 2 + 5}" text-anchor="middle" font-size="${Math.round(s * 0.38)}" font-weight="900">72</text>`;
function cizimIos1() {
  return ilSvg(92, `
    <rect class="z2" x="0" y="0" width="280" height="92" rx="14"/>
    <rect class="z1 c" x="16" y="12" width="248" height="30" rx="15"/>
    <text class="m3" x="140" y="31" text-anchor="middle" font-size="11" font-weight="600">Seçim Masası</text>
    <path class="ci" d="M42 61l-7 7 7 7"/><path class="ci" d="M86 61l7 7-7 7"/>
    ${halkaIsaret(140, 68)}
    <g class="kci"><path d="M140 58.5v11"/><path d="M135.8 62.5l4.2-4.2 4.2 4.2"/><path d="M135 65.5h-2.5v11h15v-11H145"/></g>
    <path class="ci" d="M186 62.5c3-1.6 5.5-1.6 8 0v12c-2.5-1.6-5-1.6-8 0zM194 62.5c2.5-1.6 5-1.6 8 0v12c-3-1.6-5.5-1.6-8 0z"/>
    <rect class="ci" x="232" y="63" width="11" height="11" rx="2"/><path class="ci" d="M236 60h8.5a2 2 0 0 1 2 2v8.5"/>`);
}
function cizimIos2() {
  const satir = (y, yazi, ikon, vurgu) => `${vurgu ? `<rect class="ka" x="16" y="${y}" width="248" height="30"/>` : ''}<text class="${vurgu ? 'kt' : 'm'}" x="30" y="${y + 19}" font-size="11.5" font-weight="${vurgu ? 800 : 600}">${yazi}</text><g class="${vurgu ? 'kci' : 'ci'}" transform="translate(238 ${y + 7})">${ikon}</g>`;
  return ilSvg(112, `
    <rect class="z2" x="0" y="0" width="280" height="112" rx="14"/>
    <rect class="z1" x="16" y="10" width="248" height="92" rx="12"/>
    ${satir(10, 'Kopyala', '<rect x="4" y="4" width="10" height="12" rx="2"/><path d="M8 1h8a2 2 0 0 1 2 2v10"/>')}
    <line class="c" x1="30" x2="264" y1="40.5" y2="40.5"/>
    ${satir(40, 'Yer İşareti Ekle', '<path d="M4 2h11v15l-5.5-4L4 17z"/>')}
    <line class="c" x1="30" x2="264" y1="70.5" y2="70.5"/>
    <clipPath id="rp-il-kirp"><rect x="16" y="10" width="248" height="92" rx="12"/></clipPath>
    <g clip-path="url(#rp-il-kirp)">${satir(71, 'Ana Ekrana Ekle', '<rect x="1" y="1" width="16" height="16" rx="4"/><path d="M9 5v8M5 9h8"/>', true)}</g>
    <circle class="kc rp-il-nabiz" cx="246" cy="86" r="14"/>`);
}
function cizimIos3() {
  return ilSvg(112, `
    <rect class="z2" x="0" y="0" width="280" height="112" rx="14"/>
    <rect class="z1" x="16" y="10" width="248" height="92" rx="12"/>
    <text class="m3" x="30" y="31" font-size="11" font-weight="600">Vazgeç</text>
    <text class="m" x="140" y="31" text-anchor="middle" font-size="11.5" font-weight="800">Ana Ekrana Ekle</text>
    <rect class="ka" x="220" y="17" width="38" height="22" rx="11"/>
    <text class="kt" x="239" y="32" text-anchor="middle" font-size="11.5" font-weight="800">Ekle</text>
    <rect class="kc rp-il-nabiz" x="220" y="17" width="38" height="22" rx="11"/>
    <line class="c" x1="16" x2="264" y1="44.5" y2="44.5"/>
    ${uygIkon(30, 55)}
    <text class="m" x="78" y="70" font-size="12" font-weight="800">Seçim Masası</text>
    <text class="m3" x="78" y="86" font-size="10" font-weight="600">Web uygulaması olarak aç</text>
    <rect class="yz" x="226" y="76" width="26" height="15" rx="7.5"/><circle class="bz" cx="244.5" cy="83.5" r="5.5"/>`);
}
function cizimAnd1() {
  return ilSvg(80, `
    <rect class="z2" x="0" y="0" width="280" height="80" rx="14"/>
    <rect class="z1 c" x="16" y="24" width="208" height="32" rx="16"/>
    <text class="m3" x="120" y="44" text-anchor="middle" font-size="11" font-weight="600">Seçim Masası</text>
    <rect class="ci" x="232" y="32" width="14" height="14" rx="3"/><text class="m3" x="239" y="43" text-anchor="middle" font-size="8" font-weight="800">1</text>
    ${halkaIsaret(262, 40, 14)}
    <g class="kf"><circle cx="262" cy="33" r="2"/><circle cx="262" cy="40" r="2"/><circle cx="262" cy="47" r="2"/></g>`);
}
function cizimAnd2() {
  const satir = (y, yazi, vurgu) => `${vurgu ? `<rect class="ka" x="96" y="${y}" width="168" height="26"/>` : ''}<text class="${vurgu ? 'kt' : 'm'}" x="110" y="${y + 17}" font-size="11.5" font-weight="${vurgu ? 800 : 600}">${yazi}</text>`;
  return ilSvg(112, `
    <rect class="z2" x="0" y="0" width="280" height="112" rx="14"/>
    <clipPath id="rp-il-kirp2"><rect x="96" y="10" width="168" height="92" rx="10"/></clipPath>
    <rect class="z1 c" x="96" y="10" width="168" height="92" rx="10"/>
    <g clip-path="url(#rp-il-kirp2)">${satir(14, 'Yeni sekme')}${satir(40, 'Geçmiş')}${satir(66, 'Uygulamayı yükle', true)}</g>
    <circle class="kc rp-il-nabiz" cx="244" cy="79" r="12"/>
    <rect class="z1 c" x="16" y="10" width="68" height="92" rx="10" opacity=".6"/>
    <g class="sk"><rect x="26" y="22" width="44" height="6" rx="3"/><rect x="26" y="36" width="34" height="6" rx="3"/><rect x="26" y="50" width="40" height="6" rx="3"/><rect x="26" y="70" width="48" height="22" rx="5"/></g>`);
}
function cizimAnd3() {
  return ilSvg(112, `
    <rect class="z2" x="0" y="0" width="280" height="112" rx="14"/>
    <rect class="z1" x="30" y="10" width="220" height="92" rx="14"/>
    ${uygIkon(44, 22, 30)}
    <text class="m" x="84" y="35" font-size="11.5" font-weight="800">Uygulama yüklensin mi?</text>
    <text class="m3" x="84" y="50" font-size="10" font-weight="600">Seçim Masası</text>
    <text class="m3" x="160" y="86" text-anchor="middle" font-size="11.5" font-weight="700">İptal</text>
    <rect class="k" x="190" y="70" width="48" height="24" rx="12"/>
    <text class="b" x="214" y="86" text-anchor="middle" font-size="11.5" font-weight="800">Yükle</text>
    <rect class="kc rp-il-nabiz" x="190" y="70" width="48" height="24" rx="12"/>`);
}

// ================================================================= olaylar
function tikla(e) {
  const t = e.target;
  const sek = t.closest('[data-sekme]'); if (sek) { sekmeDegistir(sek.dataset.sekme); return; }
  if (t.closest('[data-tel]')) return;                          // telefon bağlantısı kendi işini yapar
  if (t.closest('[data-sayfa-kapat]')) { sayfaKapat(); return; }
  if (t.closest('[data-menu]')) { sayfaAc({ tur: 'menu' }); return; }
  if (t.closest('[data-serit-kapat]')) { yazLS(SERIT_ANAHTAR, '1'); seritCiz(); return; }
  if (t.closest('[data-rehber]')) { rehberPlatform = null; sayfaAc({ tur: 'rehber' }); return; }
  const pl = t.closest('[data-platform]'); if (pl) { rehberPlatform = pl.dataset.platform; sayfaIcerikCiz(); return; }
  if (t.closest('[data-yukle]')) { kurulumYap(); return; }
  if (t.closest('[data-hareketler]')) { sayfaAc({ tur: 'hareket' }); return; }
  const f = t.closest('[data-filtre]'); if (f) { gelenFiltre = f.dataset.filtre; gelenSinir = SAYFA_BOYU; gelenListeCiz(); return; }
  if (t.closest('[data-daha]')) { gelenSinir += 100; gelenListeCiz(); return; }
  if (t.closest('[data-ara-temizle]')) { const i = bul('[data-gelen-ara]'); gelenArama = ''; if (i) { i.value = ''; i.focus(); } t.closest('[data-ara-temizle]').hidden = true; gelenListeCiz(); return; }
  const s = t.closest('[data-sirala]'); if (s) { const [tur, k] = s.dataset.sirala.split(':'); if (tur === 'referans') refSira = k; else ilceSira = k; grupListeCiz(tur); return; }
  const g = t.closest('[data-grup]'); if (g) { sayfaAc({ tur: 'grup', grupTur: g.dataset.grup, k: g.dataset.k }); return; }
  const ts = t.closest('[data-tema-sec]'); if (ts) { const v = ts.dataset.temaSec; temaTercih = v === 'sistem' ? null : v; yazLS(TEMA_ANAHTAR, temaTercih); temaUygula(); sayfaIcerikCiz(); return; }
  const git = t.closest('[data-git]'); if (git) { sayfaKapat({ gecmis: false }); cekmeceKapat(); location.hash = '#' + git.dataset.git; return; }
  if (t.closest('[data-cikis]')) { sayfaKapat({ gecmis: false }); cikis(); return; }
  if (t.closest('summary')) return;
  const k = t.closest('[data-kisi]'); if (k) { kisiKartiAc(Number(k.dataset.kisi)); return; }
}
function girdi(e) {
  if (e.target.matches('[data-gelen-ara]')) {
    gelenArama = e.target.value; gelenSinir = SAYFA_BOYU;
    const x = bul('[data-ara-temizle]'); if (x) x.hidden = !gelenArama;
    gelenListeCiz();
  }
}
async function kurulumYap() {
  const ist = istem(); if (!ist) { rehberPlatform = 'android'; sayfaAc({ tur: 'rehber' }); return; }
  try { await ist.prompt(); const s = await ist.userChoice; if (s?.outcome === 'accepted') { yazLS(SERIT_ANAHTAR, '1'); if (sayfa) sayfaKapat(); } }
  catch {}
  kurulumIstemi = null; window.__kurulumIstemi = null; seritCiz();
}

// ================================================================= stil (bir kez)
function stilEkle() {
  if (document.querySelector('style[data-ekran="rapor"]')) return;
  const st = document.createElement('style'); st.dataset.ekran = 'rapor';
  st.textContent = `
html.rapor-acik body { background: var(--zemin); overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }
html.rapor-acik.rp-kilit body { overflow: hidden; }
html.rapor-acik #toastlar { bottom: calc(84px + env(safe-area-inset-bottom)); }
html.rapor-acik .atlas-dugme { bottom: calc(80px + env(safe-area-inset-bottom)); }
html.rapor-acik .cekmece { border-top: env(safe-area-inset-top, 0px) solid var(--kirmizi); }
html.rapor-acik .cekmece-govde { padding-bottom: calc(32px + env(safe-area-inset-bottom)); }
.rp { padding: 0 16px calc(28px + env(safe-area-inset-bottom)); font-size: 14px; }
.rp button { font: inherit; color: inherit; }

/* üst başlık: açık temada marka kırmızısı (iOS durum çubuğunun beyaz yazısı okunur), koyu temada yüzey */
.rp-ust { position: sticky; top: 0; z-index: 55; margin: 0 -16px; padding: calc(env(safe-area-inset-top) + 10px) 12px 10px 16px; display: flex; align-items: center; gap: 12px; background: var(--kirmizi); color: #fff; transition: box-shadow .2s; }
.rp-ust.golgeli { box-shadow: 0 6px 18px rgba(0,0,0,.12); }
:root[data-tema="koyu"] .rp-ust { background: #16181B; border-bottom: 1px solid var(--cizgi); }
.rp-logo { font-weight: 900; font-size: 12.5px; letter-spacing: .04em; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rp-logo b { color: #fff; }
:root[data-tema="koyu"] .rp-logo b { color: #FF4D63; }
.rp-logo i { font-style: normal; font-weight: 400; opacity: .6; margin: 0 4px; }
.rp-canli { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; opacity: .92; white-space: nowrap; }
.rp-nokta { width: 8px; height: 8px; border-radius: 50%; background: #3BE07A; position: relative; flex: none; }
.rp-nokta::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; background: #3BE07A; opacity: .45; animation: rp-nabiz 2s ease-out infinite; }
.rp-canli.kopuk .rp-nokta, .rp-canli.kopuk .rp-nokta::after { background: #FFB547; }
@keyframes rp-nabiz { 0% { transform: scale(.5); opacity: .6; } 100% { transform: scale(1.5); opacity: 0; } }
.rp-saat { font-weight: 800; font-size: 18px; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.rp-ikon-btn { width: 38px; height: 38px; border-radius: 12px; border: 0; background: transparent; display: grid; place-items: center; cursor: pointer; color: inherit; flex: none; }
.rp-ust .rp-ikon-btn:active { background: rgba(255,255,255,.18); }
.rp-ikon-btn.yuvarlak { width: 32px; height: 32px; border-radius: 50%; background: var(--yuzey-3); color: var(--metin-2); }

/* ana ekrana ekle şeridi */
.rp-serit { margin-top: 12px; display: flex; align-items: center; gap: 12px; padding: 10px 6px 10px 10px; border-radius: 16px; background: var(--koyu); color: #fff; box-shadow: var(--golge-2); animation: rp-in .25s ease-out; }
:root[data-tema="koyu"] .rp-serit { background: var(--yuzey-3); border: 1px solid var(--cizgi-2); }
.rp-uyg-ikon { width: 40px; height: 40px; border-radius: 10px; background: var(--kirmizi); color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 15px; letter-spacing: -.02em; flex: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
.rp-serit-metin { flex: 1; min-width: 0; line-height: 1.3; }
.rp-serit-metin b { display: block; font-size: 14px; font-weight: 800; }
.rp-serit-metin span { display: block; font-size: 12px; opacity: .72; }
.rp-serit-btn { flex: none; height: 32px; padding: 0 14px; border-radius: 10px; border: 0; background: #fff; color: #111 !important; font-weight: 800 !important; font-size: 12.5px; cursor: pointer; }
.rp-serit-kapat { flex: none; width: 30px; height: 30px; border: 0; background: transparent; color: rgba(255,255,255,.6) !important; display: grid; place-items: center; cursor: pointer; border-radius: 8px; }

/* sayfa başlığı */
.rp-baslik { padding: 18px 0 14px; }
.rp-baslik h1 { margin: 0; font-size: 30px; font-weight: 900; letter-spacing: -.025em; line-height: 1.1; }
.rp-alt { margin-top: 6px; display: flex; align-items: center; gap: 8px; color: var(--metin-2); font-weight: 600; font-size: 13px; }
.rp-durum-nokta { width: 8px; height: 8px; border-radius: 50%; background: var(--metin-3); flex: none; }
.rp-durum-nokta.acik { background: var(--yesil); box-shadow: 0 0 0 3px var(--yesil-acik); }
.rp-durum-nokta.once { background: var(--amber); box-shadow: 0 0 0 3px var(--amber-acik); }

/* kartlar */
.rp-kart { background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: 20px; box-shadow: var(--golge-1); }
.rp-halka-kart { padding: 22px 16px 18px; text-align: center; }
.rp-halka { position: relative; width: 220px; height: 220px; margin: 0 auto; }
.rp-halka svg { width: 100%; height: 100%; transform: rotate(-90deg); display: block; }
.rp-halka .iz { stroke: var(--gri-acik); }
.rp-halka .dolu { stroke: var(--kirmizi); transition: stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1); }
.rp-halka-ic { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.rp-halka-etiket { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--metin-3); }
.rp-buyuk { font-size: 68px; font-weight: 900; letter-spacing: -.045em; line-height: 1; margin: 4px 0 2px; }
.rp-halka-hedef { font-size: 14px; font-weight: 700; color: var(--metin-3); }
.rp-halka-hedef span { color: var(--metin-2); }
.rp-yuzde { margin-top: 14px; }
.rp-yuzde-cip { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 999px; background: var(--kirmizi-acik); color: var(--kirmizi); font-weight: 800; font-size: 13px; }
.rp-yuzde-cip.tamam { background: var(--yesil-acik); color: var(--yesil); }
.rp-toplam { margin-top: 10px; font-size: 12.5px; color: var(--metin-3); font-weight: 600; }
.rp-toplam b { color: var(--metin); font-weight: 800; }
.rp-dortlu { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.rp-kutu { background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: 18px; padding: 13px 14px 12px; box-shadow: var(--golge-1); min-width: 0; }
.rp-kutu-etiket { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--metin-2); }
.rp-kutu-etiket i { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.rp-kutu-deger { font-size: 34px; font-weight: 900; letter-spacing: -.035em; line-height: 1.1; margin-top: 6px; }
.rp-kutu-alt { font-size: 11.5px; color: var(--metin-3); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-kutu-alt.uyari { color: var(--turuncu); font-weight: 700; }
.rp-degisti { animation: rp-degisti .9s ease-out; }
@keyframes rp-degisti { 0% { color: var(--yesil); transform: scale(1.06); } 100% { color: inherit; transform: none; } }

/* son dakika */
.rp-sondk { margin-top: 10px; width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 10px 11px 12px; border-radius: 16px; border: 1px solid var(--kirmizi-cizgi); background: var(--kirmizi-acik); text-align: left; cursor: pointer; }
.rp-sondk-etiket { flex: none; font-size: 9.5px; font-weight: 900; letter-spacing: .1em; color: #fff; background: var(--kirmizi); border-radius: 6px; padding: 4px 6px; }
.rp-sondk-metin { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; font-size: 13.5px; color: var(--metin); }
.rp-sondk-saat { flex: none; font-size: 12px; color: var(--metin-2); font-weight: 700; white-space: nowrap; }
.rp-sondk-ok { flex: none; color: var(--metin-3); display: grid; }
.rp-flas { animation: rp-flas 1.2s ease-out; }
@keyframes rp-flas { 0% { box-shadow: 0 0 0 0 rgba(200,16,46,.45); } 100% { box-shadow: 0 0 0 12px rgba(200,16,46,0); } }

/* grafik */
.rp-grafik-kart { margin-top: 10px; padding: 14px 14px 12px; }
.rp-kart-ust { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
.rp-kart-baslik { font-weight: 800; font-size: 15px; }
.rp-kart-alt { font-size: 12px; color: var(--metin-3); font-weight: 600; }
.rp-tempo { margin-left: auto; text-align: right; line-height: 1.15; }
.rp-tempo b { display: block; font-size: 20px; font-weight: 900; letter-spacing: -.02em; }
.rp-tempo span { font-size: 11px; color: var(--metin-3); font-weight: 700; }
.rp-grafik { position: relative; margin: 0 -2px; }
.rp-g { display: block; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.rp-g-izgara { stroke: var(--cizgi-2); stroke-width: 1; }
.rp-g-hedef { stroke: var(--metin-3); stroke-width: 1; opacity: .55; }
.rp-g-yazi { fill: var(--metin-3); font-size: 10.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rp-g-bos { fill: var(--metin-3); font-size: 12.5px; font-weight: 700; }
.rp-g-alan { fill: var(--kirmizi); opacity: .1; }
.rp-g-cizgi { fill: none; stroke: var(--kirmizi); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.rp-g-nokta { fill: var(--kirmizi); stroke: var(--yuzey); stroke-width: 2; }
.rp-g-deger { fill: var(--metin); font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums; }
.rp-g-arti line { stroke: var(--metin-2); stroke-width: 1; }
.rp-g-arti circle { fill: var(--kirmizi); stroke: var(--yuzey); stroke-width: 2; }
.rp-g-ipucu { position: absolute; top: -6px; pointer-events: none; background: var(--koyu); color: #fff; border-radius: 10px; padding: 6px 10px; box-shadow: var(--golge-2); white-space: nowrap; line-height: 1.25; }
:root[data-tema="koyu"] .rp-g-ipucu { background: var(--yuzey-3); border: 1px solid var(--cizgi-2); }
.rp-g-ipucu b { display: block; font-size: 14px; font-weight: 900; }
.rp-g-ipucu span { font-size: 11px; opacity: .75; font-weight: 600; }
.rp-saatler { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 8px -14px 0; padding: 0 14px 2px; }
.rp-saatler::-webkit-scrollbar { display: none; }
.rp-saat-cip { flex: none; min-width: 58px; padding: 6px 8px; border-radius: 10px; background: var(--yuzey-3); text-align: center; line-height: 1.2; }
.rp-saat-cip span { display: block; font-size: 10.5px; color: var(--metin-3); font-weight: 700; font-variant-numeric: tabular-nums; }
.rp-saat-cip b { font-size: 14px; font-weight: 900; font-variant-numeric: tabular-nums; }
.rp-saat-cip.simdi { background: var(--kirmizi-acik); box-shadow: inset 0 0 0 1px var(--kirmizi-cizgi); }
.rp-saat-bos { font-size: 12px; color: var(--metin-3); font-weight: 600; padding: 4px 0; }

/* arama + listeler */
.rp-arama { position: relative; margin-bottom: 10px; }
.rp-arama > svg { position: absolute; left: 13px; top: 13px; color: var(--metin-3); pointer-events: none; }
.rp-arama input { width: 100%; height: 44px; border-radius: 14px; border: 1px solid var(--cizgi-2); background: var(--yuzey); padding: 0 42px; font-size: 16px; outline: none; color: var(--metin); -webkit-appearance: none; appearance: none; }
.rp-arama input::-webkit-search-cancel-button { display: none; }
.rp-arama input:focus { border-color: var(--kirmizi); box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.rp-arama-temizle[hidden] { display: none; }
.rp-arama-temizle { position: absolute; right: 8px; top: 8px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: var(--yuzey-3); color: var(--metin-2); display: grid; place-items: center; cursor: pointer; }
.rp-cipler { margin-bottom: 12px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -16px; padding-right: 16px; }
.rp-cipler::-webkit-scrollbar { display: none; }
.rp-cipler .cip { height: 34px; font-size: 13px; }
.rp-liste-ust { font-size: 12px; font-weight: 700; color: var(--metin-3); margin: 0 2px 8px; }
.rp-liste { background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: 18px; overflow: hidden; box-shadow: var(--golge-1); }
.rp-satir { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--cizgi); cursor: pointer; min-width: 0; }
.rp-satir:last-child { border-bottom: 0; }
.rp-satir:active { background: var(--yuzey-2); }
.rp-satir.bizde::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--kirmizi); }
.rp-satir.yeni { animation: rp-yeni 3s ease-out; }
@keyframes rp-yeni { 0%, 30% { background: var(--yesil-acik); } 100% { background: transparent; } }
.rp-satir-saat { flex: none; width: 42px; align-self: flex-start; padding-top: 1px; font-weight: 800; font-size: 13px; font-variant-numeric: tabular-nums; }
.rp-satir-govde { flex: 1; min-width: 0; }
.rp-ad { font-weight: 800; font-size: 15px; letter-spacing: -.005em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-firma { font-size: 12.5px; color: var(--metin-2); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.rp-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0 5px; font-size: 12px; color: var(--metin-3); font-weight: 600; margin-top: 3px; }
.rp-ayrac { opacity: .5; }
.rp-tel-yazi { color: var(--metin-2); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-etiketler { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; align-items: center; }
.rp-etiketler .rp-tel-yazi { font-size: 12.5px; margin-right: 3px; }
.rp-etiket { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 6px; background: var(--gri-acik); color: var(--metin-2); font-size: 10.5px; font-weight: 800; }
.rp-etiket.yesil { background: var(--yesil-acik); color: var(--yesil); }
.rp-etiket.koyu { background: var(--koyu); color: #fff; }
.rp-ara-btn { flex: none; width: 42px; height: 42px; border-radius: 50%; background: var(--yesil-acik); color: var(--yesil); display: grid; place-items: center; }
.rp-ara-btn:active { transform: scale(.94); }
.rp-daha { width: 100%; margin-top: 10px; height: 48px; border-radius: 14px; border: 1px solid var(--cizgi-2); background: var(--yuzey); font-weight: 800 !important; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
.rp-daha span { color: var(--metin-3); font-weight: 600; font-size: 12.5px; }
.rp-bos { padding: 44px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--metin-3); }
.rp-bos b { color: var(--metin); font-size: 16px; font-weight: 800; }
.rp-bos span { font-size: 13px; max-width: 280px; }
.rp-bos-ikon { width: 56px; height: 56px; border-radius: 18px; background: var(--yuzey-3); display: grid; place-items: center; margin-bottom: 6px; }
.rp-bos-kucuk { padding: 14px 4px; color: var(--metin-3); font-size: 13px; font-weight: 600; }

/* gruplar */
.rp-grup-ozet { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; font-size: 13px; color: var(--metin-2); font-weight: 600; }
.rp-grup-ozet b { color: var(--metin); font-weight: 800; }
.rp-lejant { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--metin-3); font-weight: 700; }
.rp-lejant span { display: inline-flex; align-items: center; gap: 6px; }
.rp-lejant i { width: 10px; height: 10px; border-radius: 3px; }
.rp-lejant i.g, .rp-yigin i.g { background: var(--kirmizi); }
.rp-lejant i.f, .rp-yigin i.f { background: var(--mor); }
.rp-lejant i.y, .rp-yigin i.y { background: var(--amber); }
.rp-grup { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--cizgi); background: transparent; padding: 13px 14px 12px 16px; cursor: pointer; }
.rp-grup:last-child { border-bottom: 0; }
.rp-grup:active { background: var(--yuzey-2); }
.rp-grup-ust { display: flex; align-items: baseline; gap: 10px; }
.rp-grup-ad { flex: 1; min-width: 0; font-weight: 800; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-grup-sayi { flex: none; font-size: 13px; color: var(--metin-3); font-weight: 700; font-variant-numeric: tabular-nums; }
.rp-grup-sayi b { color: var(--metin); font-size: 17px; font-weight: 900; }
.rp-grup-ok { flex: none; color: var(--metin-3); align-self: center; display: grid; margin-right: -4px; }
.rp-yigin { display: flex; gap: 2px; height: 8px; border-radius: 999px; background: var(--gri-acik); overflow: hidden; margin: 9px 0 7px; }
.rp-yigin i { display: block; height: 100%; flex: none; transition: width .5s cubic-bezier(.2,.8,.2,1); }
.rp-grup-alt { display: flex; flex-wrap: wrap; gap: 0 5px; font-size: 12px; color: var(--metin-3); font-weight: 600; }
.rp-tamam { color: var(--yesil); font-weight: 800; }
.rp-grup.kucuk { padding: 12px 14px 12px 16px; }
.rp-grup.kucuk .rp-grup-ad { font-size: 14px; }
.rp-grup.kucuk .rp-grup-sayi b { font-size: 14px; }
.rp-bolum { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--metin-3); margin: 22px 2px 8px; }
.rp-bolum span { letter-spacing: 0; color: var(--metin-2); background: var(--yuzey-3); border-radius: 999px; padding: 1px 7px; font-size: 11px; }
.rp-detay summary { cursor: pointer; list-style: none; }
.rp-detay summary::-webkit-details-marker { display: none; }
.rp-detay summary::after { content: '▾'; margin-left: auto; font-size: 13px; transition: transform .15s; }
.rp-detay:not([open]) summary::after { transform: rotate(-90deg); }

/* alt sayfa */
.rp-sayfa-arka { position: fixed; inset: 0; z-index: 70; background: rgba(8,8,8,.45); animation: rp-belir .18s ease-out; }
.rp-sayfa { position: fixed; left: 0; right: 0; bottom: 0; z-index: 71; margin: 0 auto; max-width: 560px; max-height: calc(100vh - env(safe-area-inset-top) - 28px); max-height: calc(100dvh - env(safe-area-inset-top) - 28px); background: var(--yuzey); border-radius: 22px 22px 0 0; box-shadow: var(--golge-3); display: flex; flex-direction: column; animation: rp-yukari .26s cubic-bezier(.2,.8,.2,1); transition: transform .2s ease-out; }
.rp-sayfa.kapaniyor { transform: translateY(100%) !important; transition: transform .18s ease-in; }
.rp-sayfa-arka.kapaniyor { opacity: 0; transition: opacity .18s; }
.rp-sayfa-tutamak { padding: 8px 0 2px; display: grid; place-items: center; touch-action: none; cursor: grab; }
.rp-sayfa-tutamak i { width: 38px; height: 5px; border-radius: 3px; background: var(--cizgi-2); }
.rp-sayfa-ust { display: flex; align-items: flex-start; gap: 12px; padding: 6px 14px 14px 18px; border-bottom: 1px solid var(--cizgi); touch-action: none; }
.rp-sayfa-baslik { flex: 1; min-width: 0; }
.rp-sayfa-baslik h2 { margin: 2px 0 0; font-size: 22px; font-weight: 900; letter-spacing: -.02em; line-height: 1.15; overflow-wrap: anywhere; }
.rp-sayfa-ust-etiket { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--kirmizi); }
.rp-sayfa-ust-alt { margin-top: 3px; font-size: 13px; color: var(--metin-2); font-weight: 600; }
.rp-sayfa-ust-alt b { color: var(--metin); font-weight: 900; }
.rp-sayfa-govde { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 4px 16px calc(24px + env(safe-area-inset-bottom)); }
.rp-sayfa-govde > .rp-yigin { margin-top: 14px; height: 10px; }
.rp-sayfa-govde .rp-bolum:first-child { margin-top: 14px; }
.rp-mini-dortlu { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 4px; }
.rp-mini-dortlu div { background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: 12px; padding: 8px 6px; text-align: center; line-height: 1.2; }
.rp-mini-dortlu b { display: block; font-size: 19px; font-weight: 900; }
.rp-mini-dortlu span { font-size: 10.5px; color: var(--metin-3); font-weight: 700; }
.rp-satir.kompakt { padding: 11px 10px 11px 14px; }
.rp-satir.kompakt .rp-ad { font-size: 14.5px; }
@keyframes rp-yukari { from { transform: translateY(60px); opacity: .4; } to { transform: none; opacity: 1; } }
@keyframes rp-belir { from { opacity: 0; } to { opacity: 1; } }
@keyframes rp-in { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }

/* son hareketler akışı */
.rp-akis { list-style: none; margin: 12px 0 0; padding: 0; }
.rp-akis li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 2px; border-bottom: 1px solid var(--cizgi); cursor: pointer; }
.rp-akis li:last-child { border-bottom: 0; }
.rp-akis-saat { flex: none; width: 40px; font-weight: 800; font-size: 13px; font-variant-numeric: tabular-nums; padding-top: 1px; }
.rp-akis-nokta { flex: none; width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; background: var(--metin-3); }
.rp-akis-nokta.n-oy_kullandi { background: var(--yesil); } .rp-akis-nokta.n-fuarda { background: var(--mor); } .rp-akis-nokta.n-yolda { background: var(--amber); } .rp-akis-nokta.n-arandi { background: var(--mavi); }
.rp-akis-metin { font-weight: 700; font-size: 13.5px; }
.rp-akis-alt { font-size: 12px; color: var(--metin-3); font-weight: 600; margin-top: 1px; }

/* menü */
.rp-menu-kisi { display: flex; align-items: center; gap: 12px; }
.rp-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--kirmizi); color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 15px; flex: none; }
.rp-menu-kisi h2 { font-size: 18px !important; }
.rp-bolumlu { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 3px; border-radius: 12px; background: var(--yuzey-3); margin-top: 12px; }
.rp-bolumlu button { height: 36px; border: 0; border-radius: 10px; background: transparent; font-weight: 700 !important; font-size: 13px; color: var(--metin-2) !important; cursor: pointer; }
.rp-bolumlu button.aktif { background: var(--yuzey); color: var(--metin) !important; box-shadow: var(--golge-1); font-weight: 800 !important; }
.rp-menu-satir { width: 100%; display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 12px 12px 12px 14px; border-radius: 14px; border: 1px solid var(--cizgi); background: var(--yuzey-2); text-align: left; cursor: pointer; }
.rp-menu-satir > span { flex: 1; font-weight: 800; font-size: 14.5px; }
.rp-menu-satir small { display: block; font-size: 12px; font-weight: 600; color: var(--metin-3); }
.rp-menu-satir > svg:last-child { color: var(--metin-3); }
.rp-menu-satir.tehlike { color: var(--kirmizi) !important; }
.rp-menu-ekranlar { display: flex; flex-wrap: wrap; gap: 8px; }
.rp-menu-ekran { height: 38px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--cizgi-2); background: var(--yuzey); font-weight: 700 !important; cursor: pointer; }
.rp-menu-alt { margin-top: 18px; font-size: 11.5px; color: var(--metin-3); font-weight: 600; text-align: center; }

/* rehber */
.rp-adimlar { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.rp-adim { display: grid; grid-template-columns: 30px 1fr; gap: 4px 12px; padding: 12px; border: 1px solid var(--cizgi); border-radius: 18px; background: var(--yuzey-2); }
.rp-adim-no { width: 28px; height: 28px; border-radius: 50%; background: var(--kirmizi); color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 14px; }
.rp-adim-metin b { display: block; font-size: 15px; font-weight: 800; line-height: 1.25; padding-top: 3px; }
.rp-adim-metin span { display: block; font-size: 12.5px; color: var(--metin-2); font-weight: 500; margin-top: 2px; }
.rp-adim-cizim { grid-column: 1 / -1; margin-top: 8px; }
.rp-il { display: block; width: 100%; height: auto; }
.rp-il .z1 { fill: var(--yuzey); } .rp-il .z2 { fill: var(--yuzey-3); }
.rp-il .c { stroke: var(--cizgi-2); stroke-width: 1; }
.rp-il line.c { fill: none; }
.rp-il .m { fill: var(--metin); } .rp-il .m3 { fill: var(--metin-3); }
.rp-il .k { fill: var(--kirmizi); } .rp-il .ka { fill: var(--kirmizi-acik); } .rp-il .kt { fill: var(--kirmizi); }
.rp-il .b { fill: #fff; } .rp-il .kf { fill: var(--kirmizi); }
.rp-il .sk rect { fill: var(--gri-acik); }
.rp-il .yz { fill: var(--yesil); } .rp-il .bz { fill: #fff; }
.rp-il .kc { fill: none; stroke: var(--kirmizi); stroke-width: 2; }
.rp-il .ci, .rp-il .ci * { fill: none; stroke: var(--metin-3); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.rp-il .kci, .rp-il .kci * { fill: none; stroke: var(--kirmizi); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.rp-il-nabiz { transform-box: fill-box; transform-origin: center; animation: rp-il-nabiz 1.8s ease-out infinite; }
@keyframes rp-il-nabiz { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(1.45); opacity: 0; } }
.rp-not { margin-top: 14px; font-size: 12.5px; color: var(--metin-2); font-weight: 500; background: var(--yuzey-3); border-radius: 12px; padding: 10px 12px; }
.rp-not.uyari { background: var(--amber-acik); color: var(--amber); font-weight: 700; margin-top: 12px; }
.rp-buyuk-btn { width: 100%; margin-top: 12px; height: 50px; border-radius: 14px; border: 0; background: var(--kirmizi); color: #fff !important; font-weight: 800 !important; font-size: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }

/* alt sekme çubuğu */
.rp-sekme { position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; background: var(--yuzey); border-top: 1px solid var(--cizgi); padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); }
@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .rp-sekme { background: color-mix(in srgb, var(--yuzey) 86%, transparent); -webkit-backdrop-filter: saturate(1.8) blur(18px); backdrop-filter: saturate(1.8) blur(18px); }
}
.rp-sekme-ic { max-width: 520px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); }
.rp-sekme button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 5px 0 3px; border: 0; background: transparent; color: var(--metin-3) !important; font-size: 10.5px; font-weight: 700 !important; letter-spacing: .01em; cursor: pointer; }
.rp-sekme button.aktif { color: var(--kirmizi) !important; }
:root[data-tema="koyu"] .rp-sekme button.aktif { color: #FF4D63 !important; }
.rp-sekme button:active svg { transform: scale(.9); }
.rp-sekme svg { transition: transform .12s; }
.rp-sekme-rozet { position: absolute; top: 0; left: calc(50% + 7px); min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px; background: var(--kirmizi); color: #fff; font-style: normal; font-size: 10.5px; font-weight: 900; display: none; place-items: center; box-shadow: 0 0 0 2px var(--yuzey); }
.rp-sekme-rozet.var { display: grid; }

@media (min-width: 560px) { .rp-dortlu { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 380px) { .rp-canli [data-canli-yazi] { display: none; } .rp-ust { gap: 10px; } .rp-serit-metin span { display: none; } }
@media (prefers-reduced-motion: reduce) { .rp-nokta::after, .rp-il-nabiz, .rp-satir.yeni, .rp-degisti, .rp-flas { animation: none !important; } .rp-halka .dolu { transition: none; } }
`;
  document.head.appendChild(st);
}
