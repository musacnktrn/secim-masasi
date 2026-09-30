// 72. Komite · Seçim Masası · BİLDİRİMLER (telefon) · Claude Design "SM Bildirim" tasarımına göre (2026-09-30)
// Uygulama içi bildirim merkezi: 54 px cevap düğmeleri (bildirimCevapla), cevaplanan kart soluk + "✓ Fuarda · 10:42",
// cevapsız (10 dk+) kart amber. Ekrana girince görüldü (bildirimGoruldu). Üstte "Bildirimleri aç" kartı: izin ekranı
// (iPhone'da ana ekrandan açılmadıysa önce "Ana Ekrana Ekle" 3 adım, sonra pushAc), izin varsa yeşil onay + test bildirimi (pushTest).
// Kilit ekranı görünümü yalnız tasarım sunumudur, üründe yoktur. Ekran kendi başlığını ve alt sekmesini çizer.
import {
  store, esc, fmt, trBaslik, bildirimCevapla, bildirimGoruldu, cevapsizBildirimler,
  pushDestekli, pushIzni, pushAc, pushTest,
} from '../core.js';
import { toast, hataGoster, kisiKartiAc } from '../ui.js';

// ---------------------------------------------------------------- ikonlar
const svg = (d, k = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${k}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IKON = {
  liste: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>'),
  zil: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', 2),
  rapor: svg('<path d="M4 20V11M10 20V4M16 20v-8M21 20H3"/>'),
  atlas: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="3"/>'),
};
const ZIL_BUYUK = '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>';
const PAYLAS_SVG = '<svg width="26" height="30" viewBox="0 0 26 30" fill="none" stroke="var(--blue)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2v17M7 8l6-6 6 6"/><path d="M8 12H4v16h18V12h-4"/></svg>';

// ---------------------------------------------------------------- ekran durumu
const SAYFA_BOYU = 60;
let kok = null;
let gorunum = 'merkez';               // 'merkez' | 'izin'
let sinir = SAYFA_BOYU;
const bekleyen = new Set();           // cevabı gönderilmekte olan bildirim id'leri
const izinDurumu = { mesgul: false, hata: '', test: false };
let abonelikKontrol = false;          // izin zaten verilmişse abonelik bir kez sessizce tazelenir
const yazilan = new WeakMap();
const dinleyiciler = [];
const dinle = (hedef, olay, fn, sec) => { hedef.addEventListener(olay, fn, sec); dinleyiciler.push(() => hedef.removeEventListener(olay, fn, sec)); };
function yazHtml(hedef, html) { if (!hedef) return false; if (yazilan.get(hedef) === html) return false; yazilan.set(hedef, html); hedef.innerHTML = html; return true; }
const bul = s => kok?.querySelector(s);

// ---------------------------------------------------------------- ortam
function uygulamaModu() {
  try { return window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches; }
  catch { return false; }
}
function ios() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
const kisiAd = f => trBaslik(f?.yetkili || '') || f?.unvan || '';

// ================================================================= EKRAN
export default {
  async render(hedef) {
    kok = hedef;
    stilEkle();
    document.documentElement.classList.add('bl-acik');
    gorunum = 'merkez'; sinir = SAYFA_BOYU; bekleyen.clear();
    Object.assign(izinDurumu, { mesgul: false, hata: '', test: false });
    kok.innerHTML = `
      <div class="bl">
        <header class="bl-ust" data-ust></header>
        <div class="bl-liste" data-liste></div>
      </div>
      <nav class="alt-sekme bl-sekme" data-sekme-kok aria-label="Sekmeler"></nav>
      <div class="bl-izin" data-izin-kok hidden></div>`;
    kok.addEventListener('click', tikla);
    dinle(document, 'keydown', e => { if (e.key === 'Escape' && gorunum === 'izin' && !document.querySelector('.cekmece')) izinKapat(); });
    dinle(document, 'visibilitychange', () => { if (!document.hidden) ciz(); });
    ciz();
  },

  yenile(sebep) {
    if (!kok) return;
    if (['bildirim', 'saat', 'firma', 'firmalar', 'arac', 'araclar', 'profil', 'hazir', 'baglanti'].includes(sebep)) ciz();
  },

  temizle() {
    dinleyiciler.splice(0).forEach(f => { try { f(); } catch {} });
    if (kok) kok.removeEventListener('click', tikla);
    document.documentElement.classList.remove('bl-kilit', 'bl-acik');
    kok = null;
  },
};

// ---------------------------------------------------------------- çizim
function ciz() {
  if (!kok) return;
  const bek = store.bildirimler.filter(b => !b.cevap && b.secenekler?.length).length;
  yazHtml(bul('[data-ust]'), ustHtml(bek));
  yazHtml(bul('[data-liste]'), listeHtml());
  yazHtml(bul('[data-sekme-kok]'), sekmeHtml());
  const nav = bul('[data-sekme-kok]'); if (nav) nav.style.gridTemplateColumns = `repeat(${nav.children.length}, 1fr)`;
  const iz = bul('[data-izin-kok]');
  if (iz) {
    const ac = gorunum === 'izin';
    iz.hidden = !ac;
    document.documentElement.classList.toggle('bl-kilit', ac);
    if (ac) yazHtml(iz, izinHtml()); else yazilan.delete(iz);
  }
  goruldu();
}
// ekrana girince (ve listedeyken gelenler) görüldü: gönderene "görüldü" düşer
function goruldu() {
  if (document.hidden || gorunum !== 'merkez') return;
  const ids = store.bildirimler.slice(0, sinir).filter(b => !b.gorulme).map(b => b.id);
  if (ids.length) bildirimGoruldu(ids).catch(() => {});
}

function ustHtml(bek) {
  return `
    <div class="bl-baslik-kol">
      <div class="bl-baslik">Bildirimler</div>
      <div class="bl-alt">${bek ? `${fmt.sayi(bek)} cevap bekliyor` : 'Bekleyen cevap yok'} · ${esc(trBaslik(store.ben?.ad_soyad || ''))}</div>
    </div>
    <button type="button" class="bl-zil" data-izin-ac aria-label="Bildirim ayarları">
      ${IKON.zil}
      ${bek ? `<span class="bl-zil-rozet">${bek > 99 ? '99+' : bek}</span>` : ''}
    </button>`;
}

function izinKarti() {
  if (pushIzni() === 'granted') {
    return `<button type="button" class="bl-izin-kart tamam" data-izin-ac>
      <span class="bl-izin-ikon">✓</span>
      <span class="bl-izin-metin"><b>Bildirimler açık</b><small>Telefonun seni uyarır. Test bildirimi gönderebilirsin.</small></span>
      <span class="bl-ok" aria-hidden="true">›</span>
    </button>`;
  }
  return `<button type="button" class="bl-izin-kart" data-izin-ac>
    <span class="bl-izin-ikon">${IKON.zil}</span>
    <span class="bl-izin-metin"><b>Bildirimleri aç</b><small>Şoför “10 dk kaldı” dediğinde telefonun seni uyarsın.</small></span>
    <span class="bl-izin-btn">Aç</span>
  </button>`;
}

function listeHtml() {
  const hepsi = store.bildirimler;
  const cevapsiz = new Set(cevapsizBildirimler().map(b => b.id));
  const gorunen = hepsi.slice(0, sinir);
  if (!hepsi.length) {
    return `${izinKarti()}
      <div class="bl-bos">
        <div class="bl-bos-ikon">${IKON.zil}</div>
        <b>Henüz bildirim yok</b>
        <span>Şoför “10 dk kaldı” dediğinde ya da bir hatırlatma olduğunda burada görünür.</span>
      </div>`;
  }
  return `${izinKarti()}${gorunen.map(b => kart(b, cevapsiz.has(b.id))).join('')}${hepsi.length > gorunen.length ? `<button type="button" class="bl-daha" data-daha>Daha eskileri göster <span>${fmt.sayi(hepsi.length - gorunen.length)} bildirim</span></button>` : ''}`;
}

const cevapSinifi = c => /^(Aldık|Tamam|Gördüm|Karşıladım)$/i.test(c) ? 'ana' : /^Fuarda/i.test(c) ? 'fuarda' : /^Sorun/i.test(c) ? 'sorun' : /^Yolda$/i.test(c) ? 'yolda' : '';
function kart(b, cevapsiz) {
  const cevaplandi = !!b.cevap;
  const sec = !cevaplandi && Array.isArray(b.secenekler) ? b.secenekler : [];
  const kisi = b.firma_id ? store.firmalar.get(b.firma_id) : null;
  const arac = b.arac_id ? store.araclar.get(b.arac_id) : null;
  const baslik = b.baslik || b.metin || 'Bildirim';
  const ikinci = b.baslik && b.metin && b.metin !== b.baslik && b.metin !== 'Cevaplamak için dokun' ? `<div class="bl-metin">${esc(b.metin)}</div>` : '';
  const kimlik = kisi ? `<div class="bl-kisi">${esc(kisiAd(kisi))}${kisi.unvan && kisi.yetkili ? ` · ${esc(kisi.unvan)}` : ''}</div>` : '';
  const mesgul = bekleyen.has(b.id);
  const durum = cevaplandi ? ' cevaplandi' : cevapsiz ? ' cevapsiz' : '';
  const dugmeler = sec.length ? `
    <div class="bl-cevaplar${sec.length % 2 === 1 ? ' tek' : ''}">${sec.map(c => `<button type="button" class="bl-cvp ${cevapSinifi(c)}" data-cevap="${b.id}" data-c="${esc(c)}"${mesgul ? ' disabled' : ''}>${esc(c)}</button>`).join('')}</div>` : '';
  const karsi = kisi?.karsilayan ? `<div class="bl-karsi">Karşılayan: ${esc(trBaslik(kisi.karsilayan))}${kisi.karsilama_zamani ? ` · ${esc(fmt.saat(kisi.karsilama_zamani))}` : ''}</div>` : '';
  const yanit = cevaplandi ? `<div class="bl-yanit">✓ ${esc(b.cevap)}${b.cevap_zamani ? ` · ${esc(fmt.saat(b.cevap_zamani))}` : ''}</div>` : '';
  return `
    <article class="bl-kart${durum}" data-b="${b.id}">
      <div class="bl-kart-ust">
        <span class="bl-zaman">${esc(fmt.saat(b.zaman))}</span>
        ${cevapsiz ? '<span class="bl-cevapsiz">CEVAPSIZ</span>' : ''}
        ${arac ? `<span class="bl-plaka"><i></i><b>${esc(fmt.plaka(arac.plaka))}</b></span>` : ''}
      </div>
      ${b.firma_id ? `<button type="button" class="bl-baslik-btn" data-kisi="${b.firma_id}">${esc(baslik)}</button>` : `<div class="bl-kart-baslik">${esc(baslik)}</div>`}
      ${ikinci}${kimlik}${karsi}${dugmeler}${yanit}
    </article>`;
}

// ---------------------------------------------------------------- alt sekme (rol ekranına göre)
function sekmeHtml() {
  const r = store.ben?.rol;
  const ana = r === 'sorumlu' ? { href: '#sorumlu', ad: 'Liste', ikon: IKON.liste }
    : r === 'rapor' ? { href: '#rapor', ad: 'Rapor', ikon: IKON.rapor }
      : { href: '#saha', ad: 'Liste', ikon: IKON.liste };     // şoför, masa, admin, kurul
  const oge = [`<a href="${ana.href}">${ana.ikon}<span>${ana.ad}</span></a>`,
    `<a href="#bildirimler" class="aktif" aria-current="page">${IKON.zil}<span>Bildirimler</span></a>`];
  if (ana.href !== '#rapor') oge.push(`<a href="#rapor">${IKON.rapor}<span>Rapor</span></a>`);
  oge.push(`<button type="button" data-atlas-ac>${IKON.atlas}<span>ATLAS</span></button>`);
  return oge.join('');
}

// ---------------------------------------------------------------- "Bildirimleri aç" ekranı (SM Bildirim üçüncü telefon)
const adimKart = (n, metin, sag = '') => `<div class="bl-ak"><div class="bl-ak-no">${n}</div><div class="bl-ak-metin">${metin}</div>${sag}</div>`;
function izinHtml() {
  const izin = pushIzni(); const tamam = izin === 'granted'; const reddedildi = izin === 'denied';
  const kurulmamis = ios() && !uygulamaModu();
  const desteklenmiyor = !kurulmamis && !pushDestekli();
  let alt;
  if (tamam) {
    alt = `
      <div class="bl-yesil-serit">✓ Bildirimler açık</div>
      <button type="button" class="bl-buyuk-btn hayalet" data-test${izinDurumu.mesgul ? ' disabled' : ''}>${izinDurumu.mesgul ? 'Gönderiliyor…' : izinDurumu.test ? '✓ Test bildirimi gönderildi' : 'Test bildirimi gönder'}</button>`;
  } else if (kurulmamis) {
    alt = `<button type="button" class="bl-buyuk-btn" disabled>Önce Ana Ekrana Ekle</button>
      <div class="bl-kucuk-not">Ana ekrandaki 72 simgesinden aç, sonra bu ekrana dön.</div>`;
  } else if (reddedildi) {
    alt = `<div class="bl-uyari"><span>▲</span><div><b>Bildirim izni kapalı.</b> Telefonun Ayarlar bölümünde Bildirimler altından Seçim Masası için izni aç, sonra bu ekrana dön.</div></div>`;
  } else if (desteklenmiyor) {
    alt = `<div class="bl-uyari"><span>▲</span><div><b>Bu tarayıcı bildirimi desteklemiyor.</b> Chrome ya da Safari ile aç; iPhone'da uygulama ana ekrandan açılmalı.</div></div>`;
  } else {
    alt = `<button type="button" class="bl-buyuk-btn ana" data-izin-iste${izinDurumu.mesgul ? ' disabled' : ''}>${izinDurumu.mesgul ? 'İzin isteniyor…' : 'Bildirimlere izin ver'}</button>
      <div class="bl-kucuk-not">Daha sonra Ayarlar'dan kapatabilirsin.</div>`;
  }
  return `
    <div class="bl-izin-ic">
      <button type="button" class="bl-geri" data-izin-kapat>‹ Bildirimler</button>
      <div class="bl-zil-kutu${tamam ? ' yesil' : ''}">${tamam ? '<span>✓</span>' : ZIL_BUYUK}</div>
      <div class="bl-izin-yazi">
        <h2>${tamam ? 'Hazırsın' : 'Bildirimleri aç'}</h2>
        <p>Şoför “10 dk kaldı” dediğinde, yolcu alındığında ve cevap bekleyen hatırlatmalarda telefonun seni uyarır. Tek dokunuşla cevap verirsin.</p>
      </div>
      ${kurulmamis ? `
        <div class="bl-uyari"><span>▲</span><div><b>iPhone'da önce Ana Ekrana Ekle.</b> Safari → Paylaş → Ana Ekrana Ekle. Bildirimler yalnız ana ekrandan açılan uygulamada çalışır.</div></div>
        <div class="bl-adimlar">
          ${adimKart(1, 'Alttaki <b>Paylaş</b> düğmesine dokun.', `<div class="bl-ak-kutu">${PAYLAS_SVG}</div>`)}
          ${adimKart(2, 'Listeyi aşağı kaydır, <b>Ana Ekrana Ekle</b>\'yi seç.')}
          ${adimKart(3, 'Sağ üstte <b>Ekle</b>\'ye dokun. Ana ekrandaki <b>72</b> simgesinden aç.')}
        </div>` : ''}
      ${izinDurumu.hata ? `<div class="bl-uyari hata"><span>▲</span><div>${esc(izinDurumu.hata)}</div></div>` : ''}
      <div class="bl-izin-alt">${alt}</div>
    </div>`;
}
function izinAc() {
  gorunum = 'izin'; izinDurumu.hata = ''; izinDurumu.test = false;
  // izin daha önce verildiyse cihaz aboneliği sunucuda var mı diye bir kez sessizce tazele
  if (pushIzni() === 'granted' && pushDestekli() && !abonelikKontrol) { abonelikKontrol = true; pushAc().catch(() => { abonelikKontrol = false; }); }
  ciz();
  const iz = bul('[data-izin-kok]'); if (iz) iz.scrollTop = 0;
}
function izinKapat() { gorunum = 'merkez'; ciz(); }
async function izinIste() {
  if (izinDurumu.mesgul) return;
  izinDurumu.mesgul = true; izinDurumu.hata = ''; ciz();
  try { await pushAc(); toast('Bildirimler açıldı', { tur: 'basari' }); }
  catch (e) { izinDurumu.hata = e?.message || 'Bildirim açılamadı'; hataGoster(e); }
  finally { izinDurumu.mesgul = false; ciz(); }
}
async function testGonder() {
  if (izinDurumu.mesgul) return;
  izinDurumu.mesgul = true; izinDurumu.hata = ''; ciz();
  try { await pushTest(); izinDurumu.test = true; toast('Test bildirimi gönderildi', { tur: 'basari' }); }
  catch (e) { izinDurumu.hata = e?.message || 'Test bildirimi gönderilemedi'; hataGoster(e); }
  finally { izinDurumu.mesgul = false; ciz(); }
}

// ---------------------------------------------------------------- olaylar
async function cevapla(id, cevap) {
  if (bekleyen.has(id)) return;
  bekleyen.add(id); ciz();
  try { await bildirimCevapla(id, cevap); toast(`${cevap} · cevap gönderildi`, { tur: 'basari' }); }
  catch (e) { hataGoster(e); }
  finally { bekleyen.delete(id); ciz(); }
}
function tikla(e) {
  const t = e.target;
  const c = t.closest('[data-cevap]'); if (c) { cevapla(Number(c.dataset.cevap), c.dataset.c); return; }
  if (t.closest('[data-izin-iste]')) { izinIste(); return; }
  if (t.closest('[data-test]')) { testGonder(); return; }
  if (t.closest('[data-izin-ac]')) { izinAc(); return; }
  if (t.closest('[data-izin-kapat]')) { izinKapat(); return; }
  if (t.closest('[data-daha]')) { sinir += 60; ciz(); return; }
  if (t.closest('[data-atlas-ac]')) { import('../asistan.js').then(m => m.default.ac()).catch(() => {}); return; }
  const k = t.closest('[data-kisi]'); if (k) { kisiKartiAc(Number(k.dataset.kisi)); return; }
}

// ---------------------------------------------------------------- stil (bir kez)
function stilEkle() {
  if (document.querySelector('style[data-ekran="bildirimler"]')) return;
  const st = document.createElement('style'); st.dataset.ekran = 'bildirimler';
  st.textContent = `
html.bl-kilit body { overflow: hidden; }
html.bl-acik .atlas-dugme { display: none !important; }
.mobil-kabuk:has(.bl) { padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
.bl { min-height: 100vh; min-height: 100dvh; background: var(--bg); color: var(--ink); }
.bl button { font-family: inherit; color: inherit; }
.bl-ust { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 10px; padding: calc(env(safe-area-inset-top) + 14px) 16px 12px; background: var(--surface); border-bottom: 1px solid var(--line); }
.bl-baslik-kol { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bl-baslik { font-size: 24px; font-weight: 900; letter-spacing: -.02em; }
.bl-alt { font-size: 12.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bl-zil { position: relative; margin-left: auto; flex: none; width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.bl-zil svg { width: 20px; height: 20px; }
.bl-zil-rozet { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; box-sizing: border-box; padding: 0 5px; border-radius: 99px; background: var(--amber); color: #1a1200; border: 2px solid var(--surface); font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.bl-liste { padding: 10px 12px 30px; display: flex; flex-direction: column; gap: 10px; }

/* bildirimleri aç kartı */
.bl-izin-kart { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 12px 12px 14px; border-radius: 14px; border: 1.5px solid var(--red); background: var(--red-soft); text-align: left; cursor: pointer; }
.bl-izin-kart.tamam { border: 1.5px solid var(--green); background: var(--green-soft); }
.bl-izin-ikon { flex: none; width: 40px; height: 40px; border-radius: 12px; background: #C8102E; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; }
.bl-izin-ikon svg { width: 22px; height: 22px; }
.bl-izin-kart.tamam .bl-izin-ikon { background: var(--green); }
.bl-izin-metin { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.bl-izin-metin b { font-size: 15px; font-weight: 800; }
.bl-izin-metin small { font-size: 12.5px; color: var(--ink-2); line-height: 1.35; }
.bl-izin-btn { flex: none; height: 34px; padding: 0 14px; border-radius: 10px; background: var(--ink); color: var(--surface); font-size: 13px; font-weight: 800; display: flex; align-items: center; }
.bl-ok { flex: none; font-size: 22px; color: var(--green); line-height: 1; }

/* bildirim kartı (SM Bildirim: 14 px köşe, 13 px iç boşluk) */
.bl-kart { display: flex; flex-direction: column; gap: 9px; padding: 13px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); animation: smIn .18s ease-out; }
.bl-kart.cevapsiz { background: var(--amber-soft); border: 1.5px solid var(--amber); }
.bl-kart.cevaplandi { opacity: .55; }
.bl-kart-ust { display: flex; align-items: center; gap: 8px; }
.bl-zaman { font-size: 12px; font-weight: 800; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.bl-cevapsiz { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 6px; background: var(--amber); color: #1a1200; border: 1.5px solid var(--amber); font-size: 10px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; }
.bl-plaka { margin-left: auto; display: inline-flex; align-items: stretch; height: 18px; border: 1.2px solid #111; border-radius: 3px; background: #fff; overflow: hidden; }
.bl-plaka i { width: 5px; background: #1F4FA8; }
.bl-plaka b { padding: 0 4px; display: flex; align-items: center; font-size: 10px; font-weight: 800; color: #111; white-space: nowrap; }
.bl-kart-baslik, .bl-baslik-btn { font-size: 16px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
.bl-baslik-btn { border: 0; background: none; padding: 0; text-align: left; cursor: pointer; }
.bl-baslik-btn:active { text-decoration: underline; }
.bl-metin { font-size: 13.5px; color: var(--ink-2); line-height: 1.4; margin-top: -4px; overflow-wrap: anywhere; }
.bl-kisi { font-size: 12.5px; color: var(--ink-3); margin-top: -4px; overflow-wrap: anywhere; }
.bl-cevaplar { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.bl-cevaplar.tek > .bl-cvp:last-child { grid-column: 1 / -1; }
.bl-cvp { height: 54px; border-radius: 12px; cursor: pointer; font-size: 15.5px; font-weight: 800; background: var(--surface); color: var(--ink) !important; border: 1.5px solid var(--line-2); touch-action: manipulation; }
.bl-cvp:active { transform: translateY(1px); }
.bl-cvp:disabled { opacity: .5; cursor: default; }
.bl-cvp.ana { background: var(--ink); color: var(--surface) !important; border: 0; }
.bl-cvp.fuarda { background: var(--violet); color: #fff !important; border: 0; }
.bl-cvp.sorun { color: var(--amber-ink) !important; border: 1.5px solid var(--amber); }
.bl-karsi { font-size: 12.5px; font-weight: 700; color: var(--violet); margin-top: -4px; }
.bl-yanit { font-size: 14px; font-weight: 800; color: var(--green); }
.bl-daha { width: 100%; height: 48px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--surface); font-weight: 800 !important; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
.bl-daha span { color: var(--ink-3); font-weight: 600; font-size: 12.5px; }
.bl-bos { padding: 36px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink-3); }
.bl-bos b { color: var(--ink); font-size: 17px; font-weight: 800; }
.bl-bos span { font-size: 13.5px; max-width: 300px; line-height: 1.45; }
.bl-bos-ikon { width: 52px; height: 52px; border-radius: 99px; border: 1.5px dashed var(--line-2); display: flex; align-items: center; justify-content: center; margin-bottom: 6px; color: var(--ink-3); }
.bl-bos-ikon svg { width: 22px; height: 22px; }

/* alt sekme çubuğu: Liste · Bildirimler · Rapor · ATLAS */
.alt-sekme.bl-sekme { display: grid; gap: 0; justify-content: normal; padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); background: var(--surface); border-top: 1px solid var(--line); }
.bl-sekme a, .bl-sekme button { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 50px; padding: 0; border: 0; border-radius: 12px; background: none; font-size: 11.5px; font-weight: 700; color: var(--ink-3); cursor: pointer; touch-action: manipulation; }
.bl-sekme a:active, .bl-sekme button:active { background: var(--surface-3); }
.bl-sekme a.aktif { color: var(--red); }
.bl-sekme svg { width: 22px; height: 22px; }

/* bildirimleri aç ekranı (tam ekran) */
.bl-izin { position: fixed; inset: 0; z-index: 80; background: var(--bg); overflow: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.bl-izin[hidden] { display: none; }
.bl-izin-ic { min-height: 100%; box-sizing: border-box; max-width: 520px; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 24px) 24px calc(28px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 18px; }
.bl-geri { align-self: flex-start; height: 36px; padding: 0 12px 0 8px; border: 0; border-radius: 10px; background: transparent; font-size: 15px; font-weight: 700; color: var(--ink-2) !important; cursor: pointer; }
.bl-geri:active { background: var(--surface-3); }
.bl-zil-kutu { align-self: center; width: 96px; height: 96px; border-radius: 28px; background: #C8102E; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 30px rgba(200,16,46,.3); }
.bl-zil-kutu.yesil { background: var(--green); }
.bl-zil-kutu span { font-size: 40px; color: #fff; font-weight: 900; }
.bl-izin-yazi { display: flex; flex-direction: column; gap: 8px; text-align: center; }
.bl-izin-yazi h2 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -.02em; }
.bl-izin-yazi p { margin: 0; font-size: 15px; color: var(--ink-2); line-height: 1.5; }
.bl-uyari { display: flex; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--amber-soft); border: 1.5px solid var(--amber); }
.bl-uyari > span { flex: none; font-size: 16px; color: var(--amber-ink); }
.bl-uyari > div { font-size: 13.5px; line-height: 1.45; overflow-wrap: anywhere; }
.bl-uyari.hata > div { font-weight: 700; color: var(--amber-ink); }
.bl-adimlar { display: flex; flex-direction: column; gap: 10px; }
.bl-ak { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
.bl-ak-no { flex: none; width: 30px; height: 30px; border-radius: 99px; background: var(--red); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; }
.bl-ak-metin { flex: 1; font-size: 14.5px; line-height: 1.4; }
.bl-ak-kutu { flex: none; width: 52px; height: 52px; border-radius: 12px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; }
.bl-izin-alt { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
.bl-buyuk-btn { height: 58px; border-radius: 14px; border: 0; background: var(--surface-3); color: var(--ink) !important; font-size: 17px; font-weight: 800; cursor: pointer; }
.bl-buyuk-btn.ana { background: #C8102E; color: #fff !important; }
.bl-buyuk-btn.hayalet { height: 54px; background: var(--surface); border: 1.5px solid var(--line-2); font-size: 16px; }
.bl-buyuk-btn:disabled { opacity: .55; cursor: default; }
.bl-kucuk-not { text-align: center; font-size: 13px; color: var(--ink-3); }
.bl-yesil-serit { display: flex; align-items: center; justify-content: center; gap: 8px; height: 46px; border-radius: 12px; background: var(--green-soft); color: var(--green); font-size: 15px; font-weight: 800; }

@media (prefers-reduced-motion: reduce) { .bl-kart { animation: none; } }
`;
  document.head.appendChild(st);
}
