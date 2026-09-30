// 72. Komite · Seçim Masası · RAPOR (telefon, salt okunur) · Claude Design "SM Rapor" tasarımına göre (2026-09-30)
// Halka + üçlü sayı + REFERANSLAR / İLÇE ÖZETİ, kırmızı SON DAKİKA şeridi, sekmeler Özet · Gelenler · Referanslar
// (Referanslar sekmesinde İlçeler de var), "Ana Ekrana Ekle" 3 adım sayfası, zil ile Bildirimler (#bildirimler) girişi.
// Tüm veri store'dan gelir; canlı olaylarda yalnız değişen parçalar yeniden yazılır. Ekran kendi başlığını ve alt sekmesini çizer.
import {
  store, esc, fmt, trBaslik, simdi, simdiDk, dakika, sayac, hedefSayi, firmaListesi, aramaEslesir, olayMetni,
  SINIF_AD, ROL_AD, gecikme, cikis, okunmamisBildirim,
} from '../core.js';
import { bas, rozetDurum, rozetSinif, kisiKartiAc, cekmeceKapat } from '../ui.js';

// ---------------------------------------------------------------- sabitler
const SEKMELER = [
  { k: 'ozet', ad: 'Özet', ikon: '◎' },
  { k: 'gelenler', ad: 'Gelenler', ikon: '≡' },
  { k: 'referanslar', ad: 'Referanslar', ikon: '▤' },
];
const SEKME_ANAHTAR = 'rapor-sekme';
const SERIT_ANAHTAR = 'rapor-ana-ekran-kapandi';
const TEMA_ANAHTAR = 'secim-tema';          // app.js ile ortak
// app.js EKRANLAR tablosunun rol izinleri (menüdeki "diğer ekranlar" için; app.js'i burada içe aktarmıyoruz)
const DIGER_EKRANLAR = [
  { k: 'masa', ad: 'Masa', roller: ['yonetici', 'kurul', 'masa'] },
  { k: 'kisiler', ad: 'Kişiler', roller: ['yonetici', 'kurul', 'masa', 'rapor'] },
  { k: 'harita', ad: 'Harita', roller: ['yonetici', 'kurul', 'masa', 'rapor'] },
  { k: 'araclar', ad: 'Araçlar', roller: ['yonetici', 'kurul', 'masa'] },
  { k: 'dashboard', ad: 'Dashboard', roller: ['yonetici', 'kurul', 'masa', 'rapor'] },
  { k: 'saha', ad: 'Saha', roller: ['yonetici', 'kurul', 'masa', 'sofor'] },
  { k: 'sorumlu', ad: 'Araç sorumlusu', roller: ['yonetici', 'kurul', 'masa', 'sorumlu'] },
  { k: 'yonetim', ad: 'Admin', roller: ['yonetici'] },
  { k: 'bildirimler', ad: 'Bildirimler', roller: ['yonetici', 'kurul', 'masa', 'rapor', 'sofor', 'sorumlu'] },
];
const SAYFA_BOYU = 60;

// ---------------------------------------------------------------- ikonlar (çizgi, currentColor)
const svg = (d, b = 22, k = 1.9) => `<svg width="${b}" height="${b}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${k}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IKON = {
  ara: b => svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', b),
  kapat: b => svg('<path d="M6 6l12 12M18 6L6 18"/>', b, 2.2),
  sag: b => svg('<path d="M9 6l6 6-6 6"/>', b, 2.2),
  ekle: b => svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>', b),
  cikis: b => svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l4-4-4-4"/><path d="M14 12H4"/>', b),
  zil: b => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', b),
  gelenler: b => svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 11.5l2 2 4-4.5"/>', b),
};

// ---------------------------------------------------------------- ekran durumu
let kok = null;
let sekme = 'ozet';
let grupTur = 'referans';           // Referanslar sekmesinde: 'referans' | 'ilce'
let saatZam = null;
const kaydirma = {};
let gelenArama = '', gelenFiltre = 'hepsi', gelenSinir = SAYFA_BOYU;
let refSira = 'yuzde', ilceSira = 'yuzde';
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
function firmaKisa(f) {
  const u = String(f.unvan || '').trim(); if (!u || !f.yetkili) return '';
  return u.length > 26 ? `${u.slice(0, 25).trimEnd()}…` : u;
}
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
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); kurulumIstemi = e; window.__kurulumIstemi = e; if (kok) seritCiz(); });
window.addEventListener('appinstalled', () => { kurulumIstemi = null; yazLS(SERIT_ANAHTAR, '1'); if (kok) seritCiz(); });
const istem = () => kurulumIstemi || window.__kurulumIstemi || null;

// ---------------------------------------------------------------- tema (açık / koyu / sistem)
function temaUygula() {
  const koyu = temaTercih ? temaTercih === 'koyu' : !!temaMq?.matches;
  const d = document.documentElement;
  d.dataset.tema = koyu ? 'koyu' : 'acik';            // eski ad (app.js ve bazı ekranlar okur)
  d.dataset.theme = koyu ? 'dark' : 'light';          // tasarım adı (token'lar buna bağlı)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) { if (temaEski === null) temaEski = meta.getAttribute('content'); meta.setAttribute('content', koyu ? '#151518' : '#FFFFFF'); }
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

    const kayitli = oku(SEKME_ANAHTAR);
    let ist = SEKMELER.some(s => s.k === param) || param === 'ilceler' ? param : kayitli;
    if (ist === 'ilceler') { ist = 'referanslar'; grupTur = 'ilce'; } else grupTur = 'referans';
    sekme = SEKMELER.some(s => s.k === ist) ? ist : 'ozet';
    gorulen = new Set(firmaListesi().filter(f => f.durum === 'oy_kullandi').map(f => f.id));
    vurgula.clear(); yeniRozet = 0; sayfa = null; sayfaGecmis = false;
    sonOlayId = sonOyOlayi()?.o.id ?? null;
    rehberPlatform = null;

    kok.innerHTML = `
      <div class="rp">
        <div class="rp-kafa">
          <header class="rp-ust">
            <div class="rp-marka">
              <div class="rp-logo">72. KOMİTE <span>|</span> GENÇ ENERJİ</div>
              <div class="rp-sub">Canlı rapor · salt okunur</div>
            </div>
            <div class="rp-sag">
              <a class="rp-zil" href="#bildirimler" aria-label="Bildirimler" data-zil>${IKON.zil(19)}<b class="rp-zil-rozet" data-zil-rozet hidden></b></a>
              <div class="rp-saatblok">
                <div class="rp-saat" data-saat>--:--</div>
                <div class="rp-canli" data-canli><i></i><span data-canli-yazi>Canlı</span></div>
              </div>
              <button class="rp-avatar" data-menu aria-label="Menü">${esc(bas(store.ben?.ad_soyad))}</button>
            </div>
          </header>
          <button class="rp-sondk" data-hareketler aria-label="Son hareketleri aç">
            <span class="rp-sondk-et">SON DAKİKA</span>
            <span class="rp-sondk-metin" data-sondk-metin></span>
            <span class="rp-sondk-ok" aria-hidden="true">›</span>
          </button>
        </div>
        <div class="rp-serit-kok" data-serit></div>
        <main class="rp-govde" data-govde></main>
      </div>
      <nav class="alt-sekme rp-sekme" aria-label="Rapor sekmeleri"><div class="rp-sekme-ic">
        ${SEKMELER.map(s => `<button data-sekme="${s.k}" aria-label="${esc(s.ad)}"><span class="rp-sk-ikon">${s.ikon}</span>${esc(s.ad)}<em class="rp-sekme-rozet" data-rozet="${s.k}"></em></button>`).join('')}
      </div></nav>
      <div data-sayfa-kok></div>`;

    kok.addEventListener('click', tikla);
    kok.addEventListener('input', girdi);
    dinle(window, 'resize', () => { if (sekme === 'ozet') grafikCiz(); });
    dinle(window, 'popstate', () => { if (sayfa) sayfaKapat({ gecmis: false }); });
    // yakalama evresinde: kişi kartı (ui.js) açıksa Esc önce onu kapatsın, alt sayfa açık kalsın
    dinle(document, 'keydown', e => { if (e.key === 'Escape' && sayfa && !document.querySelector('.cekmece')) sayfaKapat(); }, true);
    dinle(document, 'visibilitychange', () => { if (!document.hidden) { saatCiz(); ustDurumCiz(); } });

    saatCiz(); saatZam = setInterval(saatCiz, 1000);
    ustDurumCiz();
    sonDakikaCiz();
    seritCiz();
    sekmeCiz(true);
  },

  yenile(sebep) {
    if (!kok) return;
    if (['firma', 'firmalar', 'olay', 'hazir'].includes(sebep)) sonVeri = Date.now();
    gelenTakip();
    ustDurumCiz();
    sonDakikaCiz();
    govdeGuncelle();
    if (sayfa && (sayfa.tur === 'grup' || sayfa.tur === 'hareket')) sayfaIcerikCiz();
  },

  temizle() {
    clearInterval(saatZam); saatZam = null;
    dinleyiciler.splice(0).forEach(f => { try { f(); } catch {} });
    try { temaMq?.removeEventListener?.('change', temaDinle); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta && temaEski !== null) meta.setAttribute('content', temaEski);
    temaEski = null;
    if (kok) { kok.removeEventListener('click', tikla); kok.removeEventListener('input', girdi); }
    document.documentElement.classList.remove('rapor-acik', 'rp-kilit');
    sayfa = null; sayfaGecmis = false; kok = null;
  },
};

// ---------------------------------------------------------------- üst şerit: saat, canlı, zil rozeti
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
  const z = bul('[data-zil-rozet]'); if (z) {
    const n = okunmamisBildirim(); const y = n ? (n > 99 ? '99+' : String(n)) : '';
    z.hidden = !n; if (z.textContent !== y) z.textContent = y;
  }
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

// ---------------------------------------------------------------- SON DAKİKA şeridi (kırmızı, tüm sekmelerde görünür)
function sonOyOlayi() {
  for (const o of store.olaylar) {
    if (o.tur !== 'durum' || String(o.yeni || '').split('+')[0] !== 'oy_kullandi') continue;
    const f = store.firmalar.get(o.firma_id);
    if (f && f.durum === 'oy_kullandi') return { o, f };     // geri alınmış işaretler şeride girmez
  }
  return null;
}
function sonDakikaCiz() {
  const m = bul('[data-sondk-metin]'); if (!m) return;
  const son = sonOyOlayi();
  if (!son) { m.textContent = 'Henüz oy kullanan yok, ilk işaret burada görünecek'; return; }
  const { o, f } = son; const s = sayac(); const kisa = firmaKisa(f);
  m.textContent = `${fmt.saat(o.zaman)} · ${kisiAd(f)}${kisa ? ` (${kisa})` : ''} oy kullandı${f.referans ? ` · Ref: ${refAd(f.referans)}` : ''} · ${fmt.sayi(s.oy_bizde)}/${fmt.sayi(s.hedef)}`;
  m.title = m.textContent;
  if (o.id !== sonOlayId) { sonOlayId = o.id; const b = bul('.rp-sondk'); if (b) { b.classList.remove('rp-flas'); void b.offsetWidth; b.classList.add('rp-flas'); } }
}

// ---------------------------------------------------------------- sekmeler
function sekmeCiz(ilk = false) {
  kok.querySelectorAll('[data-sekme]').forEach(x => { const a = x.dataset.sekme === sekme; x.classList.toggle('aktif', a); a ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'); });
  const g = bul('[data-govde]');
  yazilan.delete(g);
  if (sekme === 'ozet') g.innerHTML = ozetIskelet();
  else if (sekme === 'gelenler') g.innerHTML = gelenlerIskelet();
  else g.innerHTML = referanslarIskelet();
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
  else grupListeCiz(grupTur);
}

// ================================================================= SEKME 1: ÖZET
function ozetIskelet() {
  const mini = (k, ad, renk) => `
    <div class="rp-mini"><div class="rp-mini-deger" style="color:${renk}" data-alan="${k}">0</div><div class="rp-mini-et">${ad}</div></div>`;
  return `
    <section class="rp-kart rp-halka-kart" aria-label="Hedefe ilerleme">
      <div class="rp-ring" data-ring>
        <div class="rp-ring-ic">
          <div class="rp-ring-et">OY KULLANDI</div>
          <div class="rp-ring-sayi" data-alan="oy_bizde">0</div>
          <div class="rp-ring-alt" data-ring-alt></div>
        </div>
      </div>
      <div class="rp-minis">
        ${mini('fuarda', 'FUARDA', 'var(--violet)')}
        ${mini('yolda', 'YOLDA', 'var(--amber-ink)')}
        ${mini('kalan', 'KALAN', 'var(--ink)')}
      </div>
      <div class="rp-ring-not" data-ring-not></div>
    </section>
    <section class="rp-kart" data-ozet-ref aria-label="Referanslar"></section>
    <section class="rp-kart" data-ozet-ilce aria-label="İlçe özeti"></section>
    <section class="rp-kart rp-grafik-kart" aria-label="Saatlik ilerleme">
      <div class="rp-kart-ust">
        <div><div class="rp-kb">SAATLİK İLERLEME</div><div class="rp-kart-alt">Bizden oy, kümülatif</div></div>
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
  const yuzde = hedef ? Math.round(Math.min(1, s.oy_bizde / hedef) * 100) : 0;
  sayiYaz('oy_bizde', s.oy_bizde);
  sayiYaz('fuarda', s.fuarda); sayiYaz('yolda', s.yolda); sayiYaz('kalan', s.kalan);
  const ring = bul('[data-ring]'); if (ring) ring.style.setProperty('--rp-a', `${(hedef ? Math.min(1, s.oy_bizde / hedef) : 0) * 360}deg`);
  const tamam = hedef && s.oy_bizde >= hedef;
  yazHtml(bul('[data-ring-alt]'), `/ ${esc(fmt.sayi(hedef))} · %${yuzde}${tamam ? ' ✓' : ''}`);
  const d = sandikDurumu();
  const hedefDisi = s.oy_kullandi - s.oy_bizde;
  yazHtml(bul('[data-ring-not]'), `
    <div class="rp-not-satir"><i class="rp-durum-nokta ${d.tur}"></i>${esc(d.metin)}</div>
    <div class="rp-not-satir">${s.oy_kullandi
      ? `Toplam oy kullanan <b>${fmt.sayi(s.oy_kullandi)}</b>${hedefDisi > 0 ? ` · hedef dışı <b>${fmt.sayi(hedefDisi)}</b>` : ''}${s.kendi_geldi ? ` · kendi geldi <b>${fmt.sayi(s.kendi_geldi)}</b>` : ''}`
      : 'Henüz oy kullanan işaretlenmedi'}</div>
    ${s.geciken ? `<div class="rp-not-satir uyari" title="Servis saati geçtiği halde henüz yola çıkmayanlar">◷ ${fmt.sayi(s.geciken)} kişi gecikmede</div>` : ''}`);
  ozetReferans();
  ozetIlce();
  grafikCiz();
}
function ozetReferans() {
  const ana = gruplar('referans').filter(g => g.k && g.hedef > 0);
  const oran = g => g.gelen / g.hedef;
  ana.sort((a, b) => oran(b) - oran(a) || b.hedef - a.hedef || refAd(a.k).localeCompare(refAd(b.k), 'tr'));
  const ust = ana.slice(0, 5);
  yazHtml(bul('[data-ozet-ref]'), `
    <div class="rp-kb-satir"><span class="rp-kb">REFERANSLAR</span><button class="rp-tumu" data-git-sekme="referanslar">Tümü ${IKON.sag(13)}</button></div>
    ${ust.length ? ust.map(g => `
      <button class="rp-rf" data-grup="referans" data-k="${esc(g.k)}">
        <span class="rp-rf-ust"><b>${esc(refAd(g.k))}</b><span class="rp-rf-sayi">${fmt.sayi(g.gelen)}/${fmt.sayi(g.hedef)}</span></span>
        <span class="rp-bar"><i style="width:${(oran(g) * 100).toFixed(1)}%"></i></span>
      </button>`).join('') : `<div class="rp-bos-kucuk">Referans verisi yükleniyor.</div>`}`);
}
function ilceOzet() {
  const m = new Map();
  for (const f of store.firmalar.values()) {
    if (f.oy_sinifi !== 'bizde' && f.oy_sinifi !== 'yolda') continue;      // kesin + ilzam
    const k = String(f.ilce || '').trim();
    let o = m.get(k); if (!o) m.set(k, o = { k, total: 0, oy: 0 });
    o.total++; if (f.durum === 'oy_kullandi') o.oy++;
  }
  return [...m.values()].sort((a, b) => b.total - a.total || ilceAd(a.k).localeCompare(ilceAd(b.k), 'tr'));
}
function ozetIlce() {
  const liste = ilceOzet().slice(0, 6);
  yazHtml(bul('[data-ozet-ilce]'), `
    <div class="rp-kb-satir"><span class="rp-kb">İLÇE ÖZETİ</span><button class="rp-tumu" data-git-sekme="ilceler">Tümü ${IKON.sag(13)}</button></div>
    ${liste.length ? liste.map(i => `
      <button class="rp-ilc" data-grup="ilce" data-k="${esc(i.k)}"><span>${esc(ilceAd(i.k))}</span><span class="rp-ilc-sayi">${fmt.sayi(i.oy)} <span>/ ${fmt.sayi(i.total)}</span></span></button>`).join('') : `<div class="rp-bos-kucuk">İlçe verisi yükleniyor.</div>`}`);
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
  const W = Math.max(240, Math.round(kap.clientWidth || 320)), H = 168;
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
    <div class="rp-liste-kap" data-gelen-liste></div>`;
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
    <div class="rp-liste-ust"><span class="rp-kb">SON GELENLER</span><span class="rp-liste-say">${fmt.sayi(liste.length)} kişi</span></div>
    ${gorunen.map(gelenSatir).join('')}
    ${liste.length > gorunen.length ? `<button class="rp-daha" data-daha>Daha fazla göster <span>${fmt.sayi(liste.length - gorunen.length)} kişi daha</span></button>` : ''}`;
  yazHtml(yer, html);
}
function gelenSatir(f) {
  const tel = telSec(f);
  const ad = kisiAd(f); const firma = f.yetkili ? f.unvan : '';
  const etiketler = [
    f.kendi_geldi ? `<span class="rp-etiket yesil">Kendi geldi</span>` : '',
    f.oy_sinifi !== 'bizde' ? `<span class="rp-etiket">${esc(SINIF_AD[f.oy_sinifi] || f.oy_sinifi || 'Sınıfsız')}</span>` : '',
    f.kisi_oy_sayisi > 1 ? `<span class="rp-etiket koyu">${f.kisi_oy_sayisi} OY</span>` : '',
  ].join('');
  const gecen = vurgula.has(f.id) ? Date.now() - vurgula.get(f.id) : Infinity;
  const yeni = gecen < VURGU_MS ? ` yeni" style="animation-delay:-${Math.round(gecen)}ms` : '';
  return `
    <div class="rp-gk${yeni}" data-kisi="${f.id}">
      <div class="rp-gk-saat">${esc(fmt.saat(f.durum_zamani) || '--:--')}</div>
      <div class="rp-gk-ic">
        <div class="rp-gk-ad">${esc(ad)}</div>
        ${firma ? `<div class="rp-gk-firma">${esc(firma)}</div>` : ''}
        ${f.karsilayan ? `<div class="rp-gk-kars">Karşılayan: ${esc(trBaslik(f.karsilayan))}${f.karsilama_zamani ? ` · ${esc(fmt.saat(f.karsilama_zamani))}` : ''}</div>` : ''}
        <div class="rp-gk-alt"><span class="rp-gk-ref">Ref: ${esc(refAd(f.referans))}</span>${etiketler}${tel ? `<a class="rp-gk-tel" href="${tel.link}" data-tel>${esc(tel.yazi)}</a>` : ''}</div>
      </div>
    </div>`;
}

// ================================================================= SEKME 3: REFERANSLAR (ve İLÇELER)
function referanslarIskelet() {
  return `
    <div class="segment rp-seg" role="tablist">
      <button role="tab" data-grup-tur="referans" class="${grupTur === 'referans' ? 'aktif' : ''}">Referanslar</button>
      <button role="tab" data-grup-tur="ilce" class="${grupTur === 'ilce' ? 'aktif' : ''}">İlçeler</button>
    </div>
    <div data-grup-liste="${grupTur}"></div>`;
}
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
function yigin(g, kalin = false) {
  if (!g.hedef) return `<div class="rp-yigin${kalin ? ' kalin' : ''}"></div>`;
  const p = n => (n / g.hedef) * 100;
  return `<div class="rp-yigin${kalin ? ' kalin' : ''}" role="img" aria-label="${g.gelen} oy kullandı, ${g.fuarda} fuarda, ${g.yolda} yolda, hedef ${g.hedef}">${g.gelen ? `<i class="g" style="width:${p(g.gelen).toFixed(2)}%"></i>` : ''}${g.fuarda ? `<i class="f" style="width:${p(g.fuarda).toFixed(2)}%"></i>` : ''}${g.yolda ? `<i class="y" style="width:${p(g.yolda).toFixed(2)}%"></i>` : ''}</div>`;
}
function grupListeCiz(tur) {
  const yer = bul('[data-grup-liste]'); if (!yer) return;
  const hepsi = gruplar(tur);
  const ana = hepsi.filter(g => g.k && g.hedef > 0);
  const diger = hepsi.filter(g => !g.k || !g.hedef).sort((a, b) => b.adet - a.adet);
  const sira = tur === 'referans' ? refSira : ilceSira;
  const ad = g => grupAd(tur, g.k);
  const oran = g => g.hedef ? g.gelen / g.hedef : 0;
  ana.sort(sira === 'ad' ? (a, b) => ad(a).localeCompare(ad(b), 'tr')
    : sira === 'geride' ? (a, b) => oran(a) - oran(b) || b.hedef - a.hedef
      : sira === 'hedef' ? (a, b) => b.hedef - a.hedef || ad(a).localeCompare(ad(b), 'tr')
        : (a, b) => oran(b) - oran(a) || b.hedef - a.hedef || ad(a).localeCompare(ad(b), 'tr'));
  const topH = ana.reduce((t, g) => t + g.hedef, 0), topG = ana.reduce((t, g) => t + g.gelen, 0);
  if (!hepsi.length) { yazHtml(yer, `<div class="rp-bos"><b>Veri yok</b><span>Firmalar yüklenince burada görünecek.</span></div>`); return; }
  const html = `
    <div class="rp-grup-ozet">
      <div><b>${fmt.sayi(ana.length)}</b> ${tur === 'referans' ? 'referans' : 'ilçe'} · hedef <b>${fmt.sayi(topH)}</b> · gelen <b>${fmt.sayi(topG)}</b></div>
      <div class="rp-lejant"><span><i class="g"></i>Oy kullandı</span><span><i class="f"></i>Fuarda</span><span><i class="y"></i>Yolda</span></div>
    </div>
    <div class="cipler rp-cipler">
      ${[['yuzde', 'İlerlemeye göre'], ['hedef', 'Hedefe göre'], ['geride', 'En geride'], ['ad', 'A-Z']].map(([k, a]) => `<button class="cip${sira === k ? ' aktif' : ''}" data-sirala="${tur}:${k}">${esc(a)}</button>`).join('')}
    </div>
    <div class="rp-kart rp-kart-rf">
      <div class="rp-kb">${tur === 'referans' ? 'REFERANS İLERLEMESİ' : 'İLÇE İLERLEMESİ'}</div>
      ${ana.length ? ana.map(g => grupSatir(tur, g)).join('') : `<div class="rp-bos-kucuk">Hedef listesinde ${tur === 'referans' ? 'referans' : 'ilçe'} yok.</div>`}
    </div>
    ${diger.length ? `
      <div class="rp-kart rp-kart-rf">
        <div class="rp-kb">HEDEF LİSTESİ DIŞINDAKİLER</div>
        ${diger.map(g => `
          <button class="rp-rf" data-grup="${tur}" data-k="${esc(g.k)}">
            <span class="rp-rf-ust"><b>${esc(ad(g))}</b><span class="rp-rf-sayi"><span class="rp-soluk">${fmt.sayi(g.toplamOy)} oy · ${fmt.sayi(g.adet)} firma</span></span></span>
          </button>`).join('')}
      </div>` : ''}`;
  yazHtml(yer, html);
}
function grupSatir(tur, g) {
  const bekleyen = g.hedef - g.gelen;
  const tamam = g.gelen >= g.hedef;
  const alt = [
    g.fuarda ? `<span>${fmt.sayi(g.fuarda)} fuarda</span>` : '',
    g.yolda ? `<span>${fmt.sayi(g.yolda)} yolda</span>` : '',
    !tamam ? `<span>${fmt.sayi(bekleyen)} bekleniyor</span>` : '',
    g.digerGelen ? `<span>+${fmt.sayi(g.digerGelen)} liste dışı oy</span>` : '',
  ].filter(Boolean).join('<span class="rp-ayrac">·</span>');
  return `
    <button class="rp-rf" data-grup="${tur}" data-k="${esc(g.k)}">
      <span class="rp-rf-ust"><b>${esc(grupAd(tur, g.k))}</b><span class="rp-rf-sayi">${fmt.sayi(g.gelen)}/${fmt.sayi(g.hedef)} <span class="rp-rf-yuzde${tamam ? ' tamam' : ''}">${tamam ? '✓' : `%${fmt.yuzde(g.gelen, g.hedef)}`}</span></span></span>
      ${yigin(g, true)}
      ${alt ? `<span class="rp-rf-alt">${alt}</span>` : ''}
    </button>`;
}

// ================================================================= ALT SAYFALAR (grup detayı, son hareketler, menü, ana ekrana ekle)
function sayfaAc(s) {
  const yeniAcilis = !sayfa;
  sayfa = s;
  const yer = bul('[data-sayfa-kok]'); if (!yer) return;
  const tam = s.tur === 'rehber';
  yer.innerHTML = `
    <div class="rp-sayfa-arka" data-sayfa-kapat></div>
    <section class="rp-sayfa${tam ? ' tam' : ''}" role="dialog" aria-modal="true">
      ${tam ? '' : '<div class="rp-sayfa-tutamak" data-surukle><i></i></div>'}
      <div class="rp-sayfa-ust" ${tam ? '' : 'data-surukle'} data-sayfa-ust></div>
      <div class="rp-sayfa-govde" data-sayfa-govde></div>
    </section>`;
  sayfaIcerikCiz(true);
  if (!tam) suruklemeBagla(yer.querySelector('.rp-sayfa'));
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
  const kapat = `<button class="rp-ikon-btn" data-sayfa-kapat aria-label="Kapat">${IKON.kapat(16)}</button>`;
  yazHtml(ustYer, `<div class="rp-sayfa-baslik">${ust}</div>${kapat}`);
  const kay = govde.scrollTop;
  yazHtml(govde, icerik);
  if (!ilk) govde.scrollTop = kay;
}
function kisiSatiri(f, { saat = false } = {}) {
  const tel = telSec(f); const g = gecikme(f);
  return `
    <div class="rp-satir${f.oy_sinifi === 'bizde' ? ' bizde' : ''}" data-kisi="${f.id}">
      ${saat ? `<div class="rp-satir-saat">${esc(fmt.saat(f.durum_zamani) || '--:--')}</div>` : ''}
      <div class="rp-satir-govde">
        <div class="rp-ad">${esc(kisiAd(f))}</div>
        ${f.yetkili ? `<div class="rp-firma">${esc(f.unvan)}</div>` : ''}
        ${f.karsilayan ? `<div class="rp-gk-kars">Karşılayan: ${esc(trBaslik(f.karsilayan))}${f.karsilama_zamani ? ` · ${esc(fmt.saat(f.karsilama_zamani))}` : ''}</div>` : ''}
        <div class="rp-etiketler">${tel ? `<a href="${tel.link}" class="rp-tel-yazi" data-tel>${esc(tel.yazi)}</a>` : ''}${saat ? (f.kendi_geldi ? `<span class="rp-etiket yesil">Kendi geldi</span>` : '') : rozetDurum(f)}${g ? `<span class="rozet u-gecikti">${g} dk gecikti</span>` : ''}${f.oy_sinifi !== 'bizde' ? rozetSinif(f.oy_sinifi) : ''}</div>
      </div>
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
  const ust = `<div class="rp-sayfa-ust-etiket">${tur === 'referans' ? 'REFERANS' : 'İLÇE'}</div><h2>${esc(ad)}</h2>
    <div class="rp-sayfa-ust-alt">${g.hedef ? `<b>${fmt.sayi(g.gelen)}</b> / ${fmt.sayi(g.hedef)} hedef · %${fmt.yuzde(g.gelen, g.hedef)}` : `${fmt.sayi(liste.length)} firma · hedef listesinde değil`}</div>`;
  const bolum = (baslik, sayi, satirlar, bos) => `<div class="rp-bolum">${esc(baslik)} <span>${fmt.sayi(sayi)}</span></div>${satirlar || `<div class="rp-bos-kucuk">${esc(bos)}</div>`}`;
  let icerik = '';
  if (g.hedef) icerik += `${yigin(g, true)}<div class="rp-mini-dortlu"><div><b>${fmt.sayi(g.gelen)}</b><span>oy kullandı</span></div><div><b>${fmt.sayi(g.fuarda)}</b><span>fuarda</span></div><div><b>${fmt.sayi(g.yolda)}</b><span>yolda</span></div><div><b>${fmt.sayi(g.hedef - g.gelen - g.fuarda - g.yolda)}</b><span>henüz yok</span></div></div>`;
  if (g.hedef) icerik += bolum('Gelmeyenler', gelmeyen.length, gelmeyen.length ? `<div class="rp-liste">${gelmeyen.map(f => kisiSatiri(f)).join('')}</div>` : '', 'Hedefteki herkes oy kullandı.');
  icerik += bolum('Gelenler', gelen.length, gelen.length ? `<div class="rp-liste">${gelen.map(f => kisiSatiri(f, { saat: true })).join('')}</div>` : '', 'Henüz oy kullanan yok.');
  if (disarda.length) icerik += `<details class="rp-detay"${g.hedef ? '' : ' open'}><summary class="rp-bolum">Hedef dışı, henüz gelmedi <span>${fmt.sayi(disarda.length)}</span></summary><div class="rp-liste">${disarda.map(f => kisiSatiri(f)).join('')}</div></details>`;
  return [ust, icerik];
}
function hareketSayfa() {
  const liste = store.olaylar.filter(o => o.tur === 'durum').slice(0, 40);
  const ust = `<div class="rp-sayfa-ust-etiket">CANLI AKIŞ</div><h2>Son hareketler</h2><div class="rp-sayfa-ust-alt">Masada yapılan son ${fmt.sayi(liste.length)} işaret</div>`;
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
  const ust = `<div class="rp-menu-kisi"><div class="rp-avatar-buyuk">${esc(bas(ben.ad_soyad))}</div><div><h2>${esc(ben.ad_soyad || '')}</h2><div class="rp-sayfa-ust-alt">${esc(ROL_AD[ben.rol] || ben.rol || '')}</div></div></div>`;
  const icerik = `
    <div class="rp-bolum">Görünüm</div>
    <div class="segment" role="radiogroup">
      ${[['acik', 'Açık'], ['koyu', 'Koyu'], ['sistem', 'Otomatik']].map(([k, a]) => `<button role="radio" aria-checked="${t === k}" class="${t === k ? 'aktif' : ''}" data-tema-sec="${k}">${esc(a)}</button>`).join('')}
    </div>
    ${!uygulamaModu() ? `<button class="rp-menu-satir" data-rehber>${IKON.ekle(20)}<span>Ana ekrana ekle<small>Uygulama gibi tam ekran kullan</small></span>${IKON.sag(16)}</button>` : ''}
    ${ekranlar.length ? `<div class="rp-bolum">Diğer ekranlar</div><div class="rp-menu-ekranlar">${ekranlar.map(e => `<button class="rp-menu-ekran" data-git="${e.k}">${esc(e.ad)}</button>`).join('')}</div>` : ''}
    <button class="rp-menu-satir tehlike" data-cikis>${IKON.cikis(20)}<span>Çıkış yap</span></button>
    <div class="rp-menu-alt">Son veri ${esc(fmt.saat(sonVeri))} · ${fmt.sayi(store.firmalar.size)} firma · ${store.canli ? 'canlı bağlı' : 'bağlantı bekleniyor'}</div>`;
  return [ust, icerik];
}

// ---------------------------------------------------------------- ANA EKRANA EKLE (SM Rapor üçüncü ekran: 3 adım kartı)
const PAYLAS_SVG = (w = 26, h = 30, k = 2.2) => `<svg width="${w}" height="${h}" viewBox="0 0 26 30" fill="none" stroke="var(--blue)" stroke-width="${k}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2v17M7 8l6-6 6 6"/><path d="M8 12H4v16h18V12h-4"/></svg>`;
const adimKart = (n, metin, sag) => `<div class="rp-ak"><div class="rp-ak-no">${n}</div><div class="rp-ak-metin">${metin}</div>${sag}</div>`;
const uygSimge = `<div class="rp-ak-simge"><div class="rp-ak-simge-kutu"><b>72</b><i>GENÇ ENERJİ</i></div><span>Seçim Masası</span></div>`;
function rehberSayfa() {
  const c = cihaz();
  const p = rehberPlatform || (c.android ? 'android' : 'ios');
  const ust = `<div class="rp-rehber-baslik">Raporu ana ekranına ekle</div><div class="rp-rehber-alt">Tek dokunuşla açılır, uygulama gibi çalışır. ${p === 'ios' ? "Safari'de 3 adım:" : "Chrome'da 3 adım:"}</div>`;
  const secici = `<div class="segment" role="tablist">${[['ios', 'iPhone'], ['android', 'Android']].map(([k, a]) => `<button role="tab" aria-selected="${p === k}" class="${p === k ? 'aktif' : ''}" data-platform="${k}">${esc(a)}</button>`).join('')}</div>`;
  let adimlar, alt = '';
  if (p === 'ios') {
    const krom = c.ios && c.tarayici !== 'safari';
    adimlar = [
      adimKart(1, krom ? 'Adres çubuğunun sağındaki <b>Paylaş</b> simgesine dokun.' : 'Alttaki <b>Paylaş</b> düğmesine dokun.', `<div class="rp-ak-kutu">${PAYLAS_SVG()}</div>`),
      adimKart(2, 'Listeyi aşağı kaydır, <b>Ana Ekrana Ekle</b>\'yi seç.', `<div class="rp-ak-liste"><i></i><div><span class="rp-ak-kare"></span>Ana Ekrana Ekle</div><i></i></div>`),
      adimKart(3, 'Sağ üstte <b>Ekle</b>\'ye dokun. Simge ana ekranda.', uygSimge),
    ];
    alt = `<div class="rp-safari"><div class="rp-safari-not">Paylaş düğmesi Safari'nin alt çubuğunda ↓</div>
      <div class="rp-safari-bar"><span>‹</span><span>›</span><span class="rp-safari-paylas">${PAYLAS_SVG(18, 21, 2.6)}</span><span>▢</span><span>⧉</span></div></div>`;
  } else {
    adimlar = [
      adimKart(1, 'Sağ üstteki <b>⋮</b> menüsüne dokun.', `<div class="rp-ak-kutu rp-ak-nokta">⋮</div>`),
      adimKart(2, 'Listeden <b>Uygulamayı yükle</b>\'yi seç. Bazı telefonlarda adı "Ana ekrana ekle" olur.', `<div class="rp-ak-liste"><i></i><div><span class="rp-ak-kare"></span>Uygulamayı yükle</div><i></i></div>`),
      adimKart(3, '<b>Yükle</b>\'ye dokun. Simge ana ekrana gelir.', uygSimge),
    ];
  }
  const not = p === 'ios'
    ? 'Bağlantıyı WhatsApp ya da Instagram içinde açtıysan önce Safari\'de aç (pusula simgesi ya da "Safari\'de Aç").'
    : 'Samsung İnternet\'te: alttaki ≡ menüsü, sonra "Sayfayı ekle" ve "Ana ekran". Bağlantı bir uygulamanın içinde açıldıysa önce "Chrome\'da aç" de.';
  const yukle = p === 'android' && istem() ? `<button class="rp-buyuk-btn" data-yukle>${IKON.ekle(20)} Şimdi yükle</button>` : '';
  const uyari = c.uygulamaIci ? `<div class="rp-not uyari">Şu an bir uygulamanın içindeki tarayıcıdasın. Ana ekrana eklemek için sayfayı ${c.ios ? 'Safari' : 'Chrome'}'de aç.</div>` : '';
  return [ust, `${secici}${uyari}${yukle}${adimlar.join('')}<div class="rp-not">${esc(not)}</div>${alt}`];
}

// ================================================================= olaylar
function tikla(e) {
  const t = e.target;
  const sek = t.closest('[data-sekme]'); if (sek) { sekmeDegistir(sek.dataset.sekme); return; }
  if (t.closest('[data-tel]')) return;                          // telefon bağlantısı kendi işini yapar
  if (t.closest('[data-zil]')) return;                          // bağlantı #bildirimler'e gider
  if (t.closest('[data-sayfa-kapat]')) { sayfaKapat(); return; }
  if (t.closest('[data-menu]')) { sayfaAc({ tur: 'menu' }); return; }
  if (t.closest('[data-serit-kapat]')) { yazLS(SERIT_ANAHTAR, '1'); seritCiz(); return; }
  if (t.closest('[data-rehber]')) { rehberPlatform = null; sayfaAc({ tur: 'rehber' }); return; }
  const pl = t.closest('[data-platform]'); if (pl) { rehberPlatform = pl.dataset.platform; sayfaIcerikCiz(); return; }
  if (t.closest('[data-yukle]')) { kurulumYap(); return; }
  if (t.closest('[data-hareketler]')) { sayfaAc({ tur: 'hareket' }); return; }
  const gs = t.closest('[data-git-sekme]'); if (gs) { grupTur = gs.dataset.gitSekme === 'ilceler' ? 'ilce' : 'referans'; sekmeDegistir('referanslar'); return; }
  const gt = t.closest('[data-grup-tur]'); if (gt) { grupTur = gt.dataset.grupTur; sekmeCiz(true); return; }
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
@property --rp-a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
html.rapor-acik body { background: var(--bg); overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }
html.rapor-acik.rp-kilit body { overflow: hidden; }
html.rapor-acik.rp-kilit .atlas-dugme { display: none !important; }
html.rapor-acik .atlas-dugme { bottom: calc(84px + env(safe-area-inset-bottom)); }
html.rapor-acik .cekmece { border-top: env(safe-area-inset-top, 0px) solid var(--red); }
html.rapor-acik .cekmece-govde { padding-bottom: calc(32px + env(safe-area-inset-bottom)); }
.rp { font-size: 14px; color: var(--ink); }
.rp button { font: inherit; color: inherit; }
.rp-kb { font-size: 11px; font-weight: 800; letter-spacing: .1em; white-space: nowrap; color: var(--ink); }

/* üst başlık (SM Rapor: yüzey zemin, marka + saat + canlı) */
.rp-kafa { position: sticky; top: 0; z-index: 55; }
.rp-ust { display: flex; align-items: center; gap: 8px; padding: calc(env(safe-area-inset-top) + 12px) 18px 10px; background: var(--surface); border-bottom: 1px solid var(--line); }
.rp-marka { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rp-logo { font-size: 13px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-logo span { color: var(--red); }
.rp-sub { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.rp-sag { margin-left: auto; display: flex; align-items: center; gap: 8px; flex: none; }
.rp-saatblok { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.rp-saat { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.rp-canli { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: var(--green); white-space: nowrap; }
.rp-canli i { width: 6px; height: 6px; border-radius: 99px; background: var(--green); animation: smBlink 2s ease-in-out infinite; }
.rp-canli.kopuk { color: var(--amber-ink); }
.rp-canli.kopuk i { background: var(--amber); animation: none; }
.rp-zil { position: relative; flex: none; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); display: flex; align-items: center; justify-content: center; }
.rp-zil:active { background: var(--surface-3); }
.rp-zil-rozet { position: absolute; top: -6px; right: -6px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 99px; background: var(--amber); color: #1a1200; border: 2px solid var(--surface); font-size: 10.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.rp-zil-rozet[hidden] { display: none; }
.rp-avatar { flex: none; width: 32px; height: 32px; border: 0; padding: 0; border-radius: 99px; background: var(--ink); color: var(--surface); font-size: 11.5px; font-weight: 800; display: grid; place-items: center; cursor: pointer; }
.rp-ikon-btn { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--surface-3); color: var(--ink-2); display: grid; place-items: center; cursor: pointer; flex: none; }

/* SON DAKİKA şeridi */
.rp-sondk { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 14px; border: 0; background: var(--red); color: #fff !important; text-align: left; cursor: pointer; overflow: hidden; }
.rp-sondk-et { flex: none; font-size: 10px; font-weight: 900; letter-spacing: .12em; background: #fff; color: #C8102E; padding: 3px 6px; border-radius: 4px; white-space: nowrap; }
.rp-sondk-metin { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-sondk-ok { flex: none; font-size: 20px; line-height: 1; opacity: .8; }
.rp-flas { animation: rp-flas 1.2s ease-out; }
@keyframes rp-flas { 0% { box-shadow: inset 0 0 0 40px rgba(255,255,255,.28); } 100% { box-shadow: inset 0 0 0 40px rgba(255,255,255,0); } }

/* ana ekrana ekle şeridi */
.rp-serit-kok:empty { display: none; }
.rp-serit-kok { padding: 12px 14px 0; }
.rp-serit { display: flex; align-items: center; gap: 12px; padding: 10px 6px 10px 10px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); animation: smIn .25s ease-out; }
.rp-uyg-ikon { width: 40px; height: 40px; border-radius: 10px; background: #C8102E; color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 15px; letter-spacing: -.02em; flex: none; }
.rp-serit-metin { flex: 1; min-width: 0; line-height: 1.3; }
.rp-serit-metin b { display: block; font-size: 14px; font-weight: 800; }
.rp-serit-metin span { display: block; font-size: 12px; color: var(--ink-2); }
.rp-serit-btn { flex: none; height: 32px; padding: 0 14px; border-radius: 10px; border: 0; background: var(--ink); color: var(--surface) !important; font-weight: 800; font-size: 12.5px; cursor: pointer; }
.rp-serit-kapat { flex: none; width: 30px; height: 30px; border: 0; background: transparent; color: var(--ink-3) !important; display: grid; place-items: center; cursor: pointer; border-radius: 8px; }

/* gövde + kartlar (SM Rapor: 16 px köşe, 14 px kenar boşluğu, 12 px aralık) */
.rp-govde { padding: 14px 14px 20px; display: flex; flex-direction: column; gap: 12px; }
.rp-kart { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.rp-kb-satir { display: flex; align-items: center; }
.rp-tumu { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; border: 0; background: none; padding: 4px 0 4px 10px; font-size: 12px; font-weight: 700; color: var(--ink-3) !important; cursor: pointer; }
.rp-halka-kart { padding: 20px 16px 16px; align-items: center; gap: 12px; }
.rp-ring { --rp-a: 0deg; width: 220px; height: 220px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: conic-gradient(var(--red) var(--rp-a), var(--surface-3) 0); transition: --rp-a .9s cubic-bezier(.2,.8,.2,1); }
.rp-ring-ic { width: 176px; height: 176px; border-radius: 99px; background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.rp-ring-et { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: var(--ink-3); white-space: nowrap; }
.rp-ring-sayi { font-size: 64px; font-weight: 900; letter-spacing: -.04em; font-variant-numeric: tabular-nums; margin-top: 4px; }
.rp-ring-alt { font-size: 17px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; margin-top: 2px; white-space: nowrap; }
.rp-minis { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.rp-mini { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border-radius: 10px; background: var(--surface-2); }
.rp-mini-deger { font-size: 26px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.1; }
.rp-mini-et { font-size: 11px; font-weight: 700; color: var(--ink-3); letter-spacing: .06em; white-space: nowrap; }
.rp-ring-not { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 12px; color: var(--ink-3); font-weight: 600; text-align: center; }
.rp-not-satir { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; }
.rp-not-satir b { color: var(--ink); font-weight: 800; }
.rp-not-satir.uyari { color: var(--amber-ink); font-weight: 800; }
.rp-durum-nokta { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); flex: none; }
.rp-durum-nokta.acik { background: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.rp-durum-nokta.once { background: var(--amber); box-shadow: 0 0 0 3px var(--amber-soft); }
.rp-degisti { animation: rp-degisti .9s ease-out; }
@keyframes rp-degisti { 0% { color: var(--green); transform: scale(1.06); } 100% { color: inherit; transform: none; } }

/* referans satırı: ad + gelen/hedef + çubuk */
.rp-rf { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.rp-rf:active { opacity: .7; }
.rp-rf-ust { display: flex; font-size: 13.5px; align-items: baseline; gap: 8px; }
.rp-rf-ust b { flex: 1; min-width: 0; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-rf-sayi { margin-left: auto; flex: none; font-weight: 800; font-variant-numeric: tabular-nums; }
.rp-rf-yuzde { color: var(--red); margin-left: 2px; }
.rp-rf-yuzde.tamam { color: var(--green); }
.rp-soluk { color: var(--ink-3); font-weight: 600; font-size: 12px; }
.rp-bar { display: block; height: 7px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
.rp-bar i { display: block; height: 100%; background: var(--red); border-radius: 99px; transition: width .5s cubic-bezier(.2,.8,.2,1); }
.rp-rf-alt { display: flex; flex-wrap: wrap; gap: 0 5px; font-size: 12px; color: var(--ink-3); font-weight: 600; }
.rp-ayrac { opacity: .5; }
.rp-kart-rf { gap: 12px; }
.rp-kart-rf .rp-rf-ust { font-size: 14px; }
.rp-kart-rf .rp-yigin { height: 8px; }

/* ilçe özeti */
.rp-ilc { display: flex; align-items: center; width: 100%; font-size: 14px; padding: 4px 0; border: 0; border-top: 1px solid var(--line); background: transparent; text-align: left; cursor: pointer; }
.rp-kb-satir + .rp-ilc { margin-top: -2px; }
.rp-ilc-sayi { margin-left: auto; font-weight: 800; font-variant-numeric: tabular-nums; }
.rp-ilc-sayi span { color: var(--ink-3); font-weight: 500; }
.rp-ilc:active { background: var(--surface-2); }

/* grafik */
.rp-kart-ust { display: flex; align-items: flex-start; gap: 12px; }
.rp-kart-alt { font-size: 12px; color: var(--ink-3); font-weight: 600; margin-top: 2px; }
.rp-tempo { margin-left: auto; text-align: right; line-height: 1.15; }
.rp-tempo b { display: block; font-size: 20px; font-weight: 900; letter-spacing: -.02em; }
.rp-tempo span { font-size: 11px; color: var(--ink-3); font-weight: 700; }
.rp-grafik { position: relative; margin: 0 -2px; }
.rp-g { display: block; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.rp-g-izgara { stroke: var(--line-2); stroke-width: 1; }
.rp-g-hedef { stroke: var(--ink-3); stroke-width: 1; opacity: .55; stroke-dasharray: 4 4; }
.rp-g-yazi { fill: var(--ink-3); font-size: 10.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rp-g-bos { fill: var(--ink-3); font-size: 12.5px; font-weight: 700; }
.rp-g-alan { fill: var(--red); opacity: .1; }
.rp-g-cizgi { fill: none; stroke: var(--red); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.rp-g-nokta { fill: var(--red); stroke: var(--surface); stroke-width: 2; }
.rp-g-deger { fill: var(--ink); font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums; }
.rp-g-arti line { stroke: var(--ink-2); stroke-width: 1; }
.rp-g-arti circle { fill: var(--red); stroke: var(--surface); stroke-width: 2; }
.rp-g-ipucu { position: absolute; top: -6px; pointer-events: none; background: #17171a; color: #fff; border-radius: 10px; padding: 6px 10px; box-shadow: var(--shadow-lg); white-space: nowrap; line-height: 1.25; }
.rp-g-ipucu[hidden] { display: none; }
.rp-g-ipucu b { display: block; font-size: 14px; font-weight: 900; }
.rp-g-ipucu span { font-size: 11px; opacity: .75; font-weight: 600; }
.rp-saatler { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px 2px; }
.rp-saatler::-webkit-scrollbar { display: none; }
.rp-saat-cip { flex: none; min-width: 58px; padding: 6px 8px; border-radius: 10px; background: var(--surface-2); text-align: center; line-height: 1.2; }
.rp-saat-cip span { display: block; font-size: 10.5px; color: var(--ink-3); font-weight: 700; font-variant-numeric: tabular-nums; }
.rp-saat-cip b { font-size: 14px; font-weight: 900; font-variant-numeric: tabular-nums; }
.rp-saat-cip.simdi { background: var(--red-soft); box-shadow: inset 0 0 0 1px var(--red-line); }
.rp-saat-bos { font-size: 12px; color: var(--ink-3); font-weight: 600; padding: 4px 0; }

/* gelenler: arama + filtre + kartlar */
.rp-arama { position: relative; }
.rp-arama > svg { position: absolute; left: 13px; top: 13px; color: var(--ink-3); pointer-events: none; }
.rp-arama input { width: 100%; height: 44px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--surface); padding: 0 42px; font-size: 16px; outline: none; color: var(--ink); -webkit-appearance: none; appearance: none; }
.rp-arama input::-webkit-search-cancel-button { display: none; }
.rp-arama input:focus { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.rp-arama-temizle[hidden] { display: none; }
.rp-arama-temizle { position: absolute; right: 8px; top: 8px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: var(--surface-3); color: var(--ink-2); display: grid; place-items: center; cursor: pointer; }
.rp-cipler { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -14px; padding-right: 14px; }
.rp-cipler::-webkit-scrollbar { display: none; }
.rp-cipler .cip { height: 34px; font-size: 13px; flex: none; }
.rp-liste-kap { display: flex; flex-direction: column; gap: 12px; }
.rp-liste-ust { display: flex; align-items: baseline; gap: 8px; padding: 0 4px; }
.rp-liste-say { margin-left: auto; font-size: 12px; color: var(--ink-3); }
.rp-gk { background: var(--surface); border: 1px solid var(--line); border-radius: 13px; padding: 11px 13px; display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 10px; cursor: pointer; }
.rp-gk:active { background: var(--surface-2); }
.rp-gk.yeni { animation: rp-yeni 3s ease-out; }
@keyframes rp-yeni { 0%, 30% { background: var(--green-soft); } 100% { background: var(--surface); } }
.rp-gk-saat { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--green); }
.rp-gk-ic { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rp-gk-ad { font-size: 16px; font-weight: 800; overflow-wrap: anywhere; }
.rp-gk-firma { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-gk-kars { font-size: 12.5px; font-weight: 700; color: var(--violet); }
.rp-gk-alt { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; font-size: 12.5px; color: var(--ink-3); }
.rp-gk-tel { margin-left: auto; font-weight: 700; color: var(--ink) !important; font-variant-numeric: tabular-nums; padding: 6px 0 6px 8px; }
.rp-etiket { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 6px; background: var(--gray-soft); color: var(--ink-2); font-size: 10.5px; font-weight: 800; }
.rp-etiket.yesil { background: var(--green-soft); color: var(--green); }
.rp-etiket.koyu { background: var(--karsi); color: var(--karsi-ink); }
.rp-daha { width: 100%; height: 48px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--surface); font-weight: 800 !important; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
.rp-daha span { color: var(--ink-3); font-weight: 600; font-size: 12.5px; }
.rp-bos { padding: 44px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink-3); }
.rp-bos b { color: var(--ink); font-size: 16px; font-weight: 800; }
.rp-bos span { font-size: 13px; max-width: 280px; }
.rp-bos-ikon { width: 56px; height: 56px; border-radius: 99px; border: 1.5px dashed var(--line-2); display: grid; place-items: center; margin-bottom: 6px; }
.rp-bos-kucuk { padding: 8px 0; color: var(--ink-3); font-size: 13px; font-weight: 600; }

/* referanslar sekmesi */
.rp-seg > button { font-size: 13.5px; }
.rp-grup-ozet { display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: var(--ink-2); font-weight: 600; padding: 0 2px; }
.rp-grup-ozet b { color: var(--ink); font-weight: 800; }
.rp-lejant { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--ink-3); font-weight: 700; }
.rp-lejant span { display: inline-flex; align-items: center; gap: 6px; }
.rp-lejant i { width: 10px; height: 10px; border-radius: 3px; }
.rp-lejant i.g, .rp-yigin i.g { background: var(--red); }
.rp-lejant i.f, .rp-yigin i.f { background: var(--violet); }
.rp-lejant i.y, .rp-yigin i.y { background: var(--amber); }
.rp-yigin { display: flex; gap: 2px; height: 8px; border-radius: 999px; background: var(--surface-3); overflow: hidden; margin: 2px 0; }
.rp-yigin.kalin { height: 8px; }
.rp-yigin i { display: block; height: 100%; flex: none; transition: width .5s cubic-bezier(.2,.8,.2,1); }
.rp-bolum { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); margin: 22px 2px 8px; }
.rp-bolum span { letter-spacing: 0; color: var(--ink-2); background: var(--surface-3); border-radius: 999px; padding: 1px 7px; font-size: 11px; }
.rp-detay summary { cursor: pointer; list-style: none; }
.rp-detay summary::-webkit-details-marker { display: none; }
.rp-detay summary::after { content: '▾'; margin-left: auto; font-size: 13px; transition: transform .15s; }
.rp-detay:not([open]) summary::after { transform: rotate(-90deg); }

/* alt sayfa (grup detayı, son hareketler, menü) ve tam ekran rehber */
.rp-sayfa-arka { position: fixed; inset: 0; z-index: 70; background: var(--scrim); animation: belir .18s ease-out; }
.rp-sayfa { position: fixed; left: 0; right: 0; bottom: 0; z-index: 71; margin: 0 auto; max-width: 560px; max-height: calc(100vh - env(safe-area-inset-top) - 28px); max-height: calc(100dvh - env(safe-area-inset-top) - 28px); background: var(--surface); border-radius: 22px 22px 0 0; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; animation: smIn .26s cubic-bezier(.2,.8,.2,1); transition: transform .2s ease-out; }
.rp-sayfa.kapaniyor { transform: translateY(100%) !important; transition: transform .18s ease-in; }
.rp-sayfa-arka.kapaniyor { opacity: 0; transition: opacity .18s; }
.rp-sayfa.tam { top: 0; max-width: none; max-height: none; height: 100vh; height: 100dvh; border-radius: 0; background: var(--bg); }
.rp-sayfa-tutamak { padding: 8px 0 2px; display: grid; place-items: center; touch-action: none; cursor: grab; }
.rp-sayfa-tutamak i { width: 38px; height: 5px; border-radius: 3px; background: var(--line-2); }
.rp-sayfa-ust { display: flex; align-items: flex-start; gap: 12px; padding: 6px 14px 14px 18px; border-bottom: 1px solid var(--line); touch-action: none; }
.rp-sayfa.tam .rp-sayfa-ust { padding: calc(env(safe-area-inset-top) + 18px) 18px 6px 22px; border-bottom: 0; }
.rp-sayfa-baslik { flex: 1; min-width: 0; }
.rp-sayfa-baslik h2 { margin: 2px 0 0; font-size: 22px; font-weight: 900; letter-spacing: -.02em; line-height: 1.15; overflow-wrap: anywhere; }
.rp-sayfa-ust-etiket { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: var(--red); }
.rp-sayfa-ust-alt { margin-top: 3px; font-size: 13px; color: var(--ink-2); font-weight: 600; }
.rp-sayfa-ust-alt b { color: var(--ink); font-weight: 900; }
.rp-sayfa-govde { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 4px 16px calc(24px + env(safe-area-inset-bottom)); }
.rp-sayfa-govde > .rp-yigin { margin-top: 14px; height: 10px; }
.rp-sayfa-govde .rp-bolum:first-child { margin-top: 14px; }
.rp-mini-dortlu { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 4px; }
.rp-mini-dortlu div { background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 8px 6px; text-align: center; line-height: 1.2; }
.rp-mini-dortlu b { display: block; font-size: 19px; font-weight: 900; }
.rp-mini-dortlu span { font-size: 10.5px; color: var(--ink-3); font-weight: 700; }
.rp-liste { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.rp-satir { position: relative; display: flex; align-items: center; gap: 12px; padding: 11px 12px 11px 16px; border-bottom: 1px solid var(--line); cursor: pointer; min-width: 0; }
.rp-satir:last-child { border-bottom: 0; }
.rp-satir:active { background: var(--surface-2); }
.rp-satir.bizde::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--red); }
.rp-satir-saat { flex: none; width: 42px; align-self: flex-start; padding-top: 1px; font-weight: 800; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--green); }
.rp-satir-govde { flex: 1; min-width: 0; }
.rp-ad { font-weight: 800; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-firma { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.rp-tel-yazi { color: var(--ink-2) !important; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-etiketler { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; align-items: center; }
.rp-etiketler .rp-tel-yazi { font-size: 12.5px; margin-right: 3px; padding: 4px 0; }
.rp-akis { list-style: none; margin: 12px 0 0; padding: 0; }
.rp-akis li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 2px; border-bottom: 1px solid var(--line); cursor: pointer; }
.rp-akis li:last-child { border-bottom: 0; }
.rp-akis-saat { flex: none; width: 40px; font-weight: 800; font-size: 13px; font-variant-numeric: tabular-nums; padding-top: 1px; }
.rp-akis-nokta { flex: none; width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; background: var(--ink-3); }
.rp-akis-nokta.n-oy_kullandi { background: var(--green); } .rp-akis-nokta.n-fuarda { background: var(--violet); } .rp-akis-nokta.n-yolda { background: var(--amber); } .rp-akis-nokta.n-arandi { background: var(--blue); }
.rp-akis-metin { font-weight: 700; font-size: 13.5px; }
.rp-akis-alt { font-size: 12px; color: var(--ink-3); font-weight: 600; margin-top: 1px; }

/* menü */
.rp-menu-kisi { display: flex; align-items: center; gap: 12px; }
.rp-avatar-buyuk { width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: var(--surface); display: grid; place-items: center; font-weight: 900; font-size: 15px; flex: none; }
.rp-menu-kisi h2 { font-size: 18px !important; }
.rp-sayfa-govde .segment { margin-top: 12px; }
.rp-menu-satir { width: 100%; display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 12px 12px 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface-2); text-align: left; cursor: pointer; }
.rp-menu-satir > span { flex: 1; font-weight: 800; font-size: 14.5px; }
.rp-menu-satir small { display: block; font-size: 12px; font-weight: 600; color: var(--ink-3); }
.rp-menu-satir > svg:last-child { color: var(--ink-3); }
.rp-menu-satir.tehlike { color: var(--red) !important; }
.rp-menu-ekranlar { display: flex; flex-wrap: wrap; gap: 8px; }
.rp-menu-ekran { height: 38px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--surface); font-weight: 700 !important; cursor: pointer; }
.rp-menu-alt { margin-top: 18px; font-size: 11.5px; color: var(--ink-3); font-weight: 600; text-align: center; }

/* ana ekrana ekle: 3 adım kartı (SM Rapor üçüncü ekran) */
.rp-rehber-baslik { font-size: 26px; font-weight: 900; letter-spacing: -.02em; line-height: 1.15; }
.rp-rehber-alt { margin-top: 6px; font-size: 14.5px; color: var(--ink-2); line-height: 1.45; }
.rp-sayfa.tam .rp-sayfa-govde { padding: 6px 22px calc(28px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 18px; }
.rp-sayfa.tam .rp-sayfa-govde .segment { margin-top: 0; }
.rp-ak { display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
.rp-ak-no { flex: none; width: 30px; height: 30px; border-radius: 99px; background: var(--red); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; }
.rp-ak-metin { flex: 1; font-size: 14.5px; line-height: 1.4; }
.rp-ak-kutu { flex: none; width: 56px; height: 56px; border-radius: 12px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; }
.rp-ak-nokta { font-size: 26px; font-weight: 900; color: var(--blue); }
.rp-ak-liste { flex: none; width: 128px; border-radius: 10px; background: var(--surface-3); padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.rp-ak-liste i { display: block; height: 14px; border-radius: 4px; background: var(--line-2); }
.rp-ak-liste div { height: 22px; border-radius: 5px; background: var(--surface); border: 1.5px solid var(--blue); display: flex; align-items: center; gap: 5px; padding: 0 6px; font-size: 9.5px; font-weight: 700; white-space: nowrap; overflow: hidden; }
.rp-ak-kare { flex: none; width: 10px; height: 10px; border: 1.5px solid var(--ink); border-radius: 3px; box-sizing: border-box; }
.rp-ak-simge { flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rp-ak-simge-kutu { width: 56px; height: 56px; border-radius: 14px; background: #C8102E; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; box-shadow: 0 4px 10px rgba(200,16,46,.3); }
.rp-ak-simge-kutu b { font-size: 20px; font-weight: 900; }
.rp-ak-simge-kutu i { font-style: normal; font-size: 6.5px; font-weight: 800; letter-spacing: .1em; margin-top: 2px; white-space: nowrap; }
.rp-ak-simge span { font-size: 10px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.rp-safari { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.rp-safari-not { font-size: 12.5px; color: var(--ink-3); text-align: center; line-height: 1.4; }
.rp-safari-bar { width: 100%; height: 54px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); display: flex; align-items: center; justify-content: space-around; color: var(--blue); font-size: 20px; }
.rp-safari-paylas { width: 40px; height: 40px; border-radius: 99px; box-shadow: 0 0 0 2px var(--blue); display: flex; align-items: center; justify-content: center; }
.rp-not { font-size: 12.5px; color: var(--ink-2); font-weight: 500; background: var(--surface-3); border-radius: 12px; padding: 10px 12px; }
.rp-not.uyari { background: var(--amber-soft); color: var(--amber-ink); font-weight: 700; }
.rp-buyuk-btn { width: 100%; height: 54px; border-radius: 14px; border: 0; background: var(--red); color: #fff !important; font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }

/* alt sekme çubuğu (3 sekme, glif ikonlu) */
.alt-sekme.rp-sekme { display: block; padding: 0; background: var(--surface); border-top: 1px solid var(--line); }
.rp-sekme-ic { max-width: 520px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); padding: 8px 10px calc(10px + env(safe-area-inset-bottom)); }
.rp-sekme button { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 50px; border: 0; background: none; cursor: pointer; font-size: 11.5px; font-weight: 700; color: var(--ink-3) !important; touch-action: manipulation; }
.rp-sekme button.aktif { color: var(--red) !important; }
.rp-sk-ikon { font-size: 18px; line-height: 1; }
.rp-sekme-rozet { position: absolute; top: 0; left: calc(50% + 8px); min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px; background: var(--red); color: #fff; font-style: normal; font-size: 10.5px; font-weight: 900; display: none; place-items: center; box-shadow: 0 0 0 2px var(--surface); }
.rp-sekme-rozet.var { display: grid; }

@media (max-width: 350px) { .rp-sub { display: none; } .rp-ring { width: 200px; height: 200px; } .rp-ring-ic { width: 160px; height: 160px; } .rp-ring-sayi { font-size: 56px; } }
@media (prefers-reduced-motion: reduce) { .rp-canli i, .rp-gk.yeni, .rp-degisti, .rp-flas { animation: none !important; } .rp-ring, .rp-bar i { transition: none; } }
`;
  document.head.appendChild(st);
}
