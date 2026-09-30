// 72. Komite · Seçim Masası · SAHA (telefon ekranı, ~390px) (ATLAS, 2026-09-30)
// Şoför: kendi aracı, araç durumu, doluluk, KONUMUMU PAYLAŞ, sıradaki durak ve yolcu listesi (büyük durum düğmeleri).
// Masa / yönetici: "Benim listem / Hepsi", arama, filtre çipleri, büyük işaretleme kartları.
// Mobil kabuk: üst şeridi ve alt sekme çubuğunu bu ekran kendisi çizer.
import {
  store, esc, fmt, trBaslik, trKucuk, trArama, simdi, simdiDk, dakika, gecikme, firmaListesi, firmaAdi, aramaEslesir,
  cikis, ROL_AD, VARIS, ARAC_DURUMLARI, ARAC_DURUM_AD, DURUM_AD, aracDurumYap, konumGonder, notEkle, durumYap, kisiGrubu,
} from '../core.js';
import {
  bas, rozetSinif, rozetDurum, uyariRozetleri, plakaHtml, cubuk, toast, hataGoster, onayla, isaretle, kisiKartiAc, paletAc,
} from '../ui.js';

// ---------------------------------------------------------------- sabitler
const SAYFA = 40;                 // masa listesinde bir seferde çizilen kart
const KONUM_ARALIK = 30000;       // konum en çok 30 sn'de bir gönderilir
const siralayici = new Intl.Collator('tr', { sensitivity: 'base' });

// Şoförün yolcu adımları. "Aldım" = durum 'yolda' + "araca alındı" notu.
const SOFOR_ADIMLAR = [
  { k: 'arandi', ad: 'Arandı', durum: 'arandi', renk: 'mavi' },
  { k: 'yoldayim', ad: 'Yoldayım', durum: 'yolda', renk: 'amber' },
  { k: 'aldim', ad: 'Aldım', durum: 'yolda', renk: 'turuncu' },
  { k: 'birak', ad: 'Fuara bıraktım', durum: 'fuarda', renk: 'mor' },
  { k: 'oy', ad: 'Oy kullandı', durum: 'oy_kullandi', renk: 'yesil' },
];
const MASA_ADIMLAR = [
  { k: 'arandi', ad: 'Arandı', durum: 'arandi', renk: 'mavi' },
  { k: 'yolda', ad: 'Yolda', durum: 'yolda', renk: 'amber' },
  { k: 'fuarda', ad: 'Fuarda', durum: 'fuarda', renk: 'mor' },
  { k: 'oy', ad: 'Oy kullandı', durum: 'oy_kullandi', renk: 'yesil' },
];
const FILTRELER = [
  { k: 'bizde', ad: 'Bizde', fn: f => f.oy_sinifi === 'bizde' },
  { k: 'gelmedi', ad: 'Gelmedi', fn: f => !['fuarda', 'oy_kullandi'].includes(f.durum) },
  { k: 'geciken', ad: 'Geciken', fn: (f, gec) => (gec.get(f.id) || 0) > 0 },
  { k: 'oy', ad: 'Oy kullandı', fn: f => f.durum === 'oy_kullandi' },
];
const FILTRE = Object.fromEntries(FILTRELER.map(f => [f.k, f]));
const HITAP = new Set(['bey', 'hanim', 'hn', 'bay', 'bayan', 'abi', 'abla']);

// ---------------------------------------------------------------- ikonlar (çizgi, currentColor)
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IKON = {
  liste: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>'),
  rapor: svg('<path d="M4 20V11M10 20V4M16 20v-8M21 20H3"/>'),
  ara: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  masa: svg('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  tel: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
  yon: svg('<path d="M3 11 22 2l-9 19-2-8-8-2z"/>'),
  pin: svg('<path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
  cikis: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  tema: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
  tamam: svg('<path d="M20 6 9 17l-5-5"/>'),
  arac: svg('<path d="M5 17V6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5V17M5 12h14M3 17h18M7.5 20v-3M16.5 20v-3"/><path d="M8 14.5h.01M16 14.5h.01" stroke-width="3"/>'),
  konum: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>'),
  bilgi: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  uyari: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>'),
  sag: svg('<path d="m9 18 6-6-6-6"/>'),
  sil: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  bayrak: svg('<path d="M5 22V4M5 4h12l-2 4 2 4H5"/>'),
  rota: svg('<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>'),
};

// ---------------------------------------------------------------- durum
let kok = null, zamanlayicilar = [], aramaZaman = null, miniZaman = null, gorunurlukDinle = null;
let tercih = { mod: null, filtre: [], arac: null };
let arama = '', sinir = SAYFA, bilgi = '';
let refOnbellek = new Map(), benKelimeler = [];
const mesgul = new Set();
const konum = { acik: false, izId: null, nabiz: null, son: null, sonGonderim: 0, hata: '', kilit: null, aracId: null, denendi: false };

const soforMu = () => store.ben?.rol === 'sofor';
const tercihAnahtar = () => `saha-tercih-${store.ben?.id || ''}`;
const konumAnahtari = () => `saha-konum-acik-${store.ben?.id || ''}`;
function tercihOku() {
  tercih = { mod: null, filtre: [], arac: null };
  try {
    const t = JSON.parse(localStorage.getItem(tercihAnahtar()) || '{}');
    if (['benim', 'hepsi'].includes(t.mod)) tercih.mod = t.mod;
    if (Array.isArray(t.filtre)) tercih.filtre = t.filtre.filter(k => FILTRE[k]);
    if (Number(t.arac)) tercih.arac = Number(t.arac);
  } catch {}
}
function tercihYaz() { try { localStorage.setItem(tercihAnahtar(), JSON.stringify(tercih)); } catch {} }
function konumTercihi() { try { return localStorage.getItem(konumAnahtari()) === '1'; } catch { return false; } }
function konumTercihYaz(acik) { try { acik ? localStorage.setItem(konumAnahtari(), '1') : localStorage.removeItem(konumAnahtari()); } catch {} }

// ---------------------------------------------------------------- küçük yardımcılar
// Yalnız değişen bölümü yeniden çiz (canlı olaylarda kaydırma ve dokunma bozulmasın)
function yerlestir(secici, html) {
  const e = kok?.querySelector(secici);
  if (e && e._html !== html) { e.innerHTML = html; e._html = html; }
}
// BÜYÜK HARF adresi okunur hale getir: "ATATÜRK MAH. 5/A GAZİEMİR/İZMİR" -> "Atatürk Mah. 5/A Gaziemir/İzmir"
const adresYaz = s => String(s ?? '').split(/([\s/().,:;-]+)/).map(w => {
  if (!w || /^[\s/().,:;-]+$/.test(w) || /^\d/.test(w)) return w;
  const k = trKucuk(w); return k.charAt(0).toLocaleUpperCase('tr') + k.slice(1);
}).join('');
function telLinki(f) {
  const adaylar = [f.cep, f.cep2, f.sabit_tel, ...String(f.sabit_tel || '').split(/\s*[-/,;]\s*|\s{2,}/)];
  for (const t of adaylar) { const l = t ? fmt.telLink(t) : ''; if (l) return l; }
  return '';
}
const yolLinki = f => f.adres ? fmt.mapsLink(f.adres) : (f.lat && f.lon ? fmt.mapsLink(`${f.lat},${f.lon}`) : '');
const fuarLinki = () => fmt.mapsLink(`${VARIS.lat},${VARIS.lon}`);
const saatYaz = f => esc(fmt.saatKisa(f.tasima_saati) || '--:--');

function mini(metin, tur = '') {
  const m = kok?.querySelector('[data-mini]'); if (!m) return;
  m.textContent = metin; m.className = `saha-mini goster ${tur}`;
  clearTimeout(miniZaman); miniZaman = setTimeout(() => { if (m.isConnected) m.className = `saha-mini ${tur}`; }, 1900);
}

// "Aldım" izi: durum 'yolda' ve son "araca alındı" notu durum değişiminden sonra düşülmüş
function aractaMi(f) {
  if (f.durum !== 'yolda' || !f.notlar) return false;
  const satirlar = String(f.notlar).split('\n').filter(s => /araca alındı\s*$/i.test(s));
  if (!satirlar.length) return false;
  const m = satirlar[satirlar.length - 1].match(/^\[(\d{1,2}):(\d{2})/);
  if (!m || !f.durum_zamani) return true;
  const d = new Date(f.durum_zamani);
  return Number(m[1]) * 60 + Number(m[2]) >= d.getHours() * 60 + d.getMinutes();
}
// -1 bekliyor · 0 arandı · 1 yoldayım · 2 araçta · 3 fuarda · 4 oy kullandı
function soforAsama(f) {
  if (f.durum === 'oy_kullandi') return 4;
  if (f.durum === 'fuarda') return 3;
  if (f.durum === 'yolda') return aractaMi(f) ? 2 : 1;
  if (f.durum === 'arandi') return 0;
  return -1;
}
const masaAsama = f => ({ arandi: 0, yolda: 1, fuarda: 2, oy_kullandi: 3 }[f.durum] ?? -1);

function zamanYazi(f, kisa = false) {
  if (!f.tasima_saati) return '<span>saat belirsiz</span>';
  const g = gecikme(f); if (g) return `<span class="saha-gec">${g} dk gecikti</span>`;
  const kalan = Math.round(dakika(f.tasima_saati) - simdiDk());
  if (kalan >= 60) { const sa = Math.floor(kalan / 60), dk = kalan % 60; return `<span>${sa} sa${dk ? ` ${dk} dk` : ''}${kisa && dk ? '' : ' sonra'}</span>`; }
  if (kalan > 0) return `<span>${kalan} dk sonra</span>`;
  return '<span>şimdi</span>';
}

// Referans adı kullanıcının ad soyadıyla eşleşir mi ("GÜNAY H" -> "Günay Hacı...", "MUTLU BEY" -> "Mutlu ...")
const kelimeler = s => trArama(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w && !HITAP.has(w));
function refEslesir(ref) {
  if (!ref || !benKelimeler.length) return false;
  if (refOnbellek.has(ref)) return refOnbellek.get(ref);
  const r = kelimeler(ref);
  const sonuc = r.length > 0 && r[0] === benKelimeler[0] && r.every(w => benKelimeler.some(b => b.startsWith(w)));
  refOnbellek.set(ref, sonuc); return sonuc;
}
const benimListesi = () => firmaListesi().filter(f => refEslesir(f.referans) || refEslesir(f.referans2));

// ---------------------------------------------------------------- iskelet
function ustHtml() {
  const b = store.ben;
  return `
  <header class="saha-ust">
    <div class="saha-avatar" aria-hidden="true">${esc(bas(b.ad_soyad))}</div>
    <div class="saha-kim"><div class="saha-kim-ad">${esc(b.ad_soyad)}</div><div class="saha-kim-rol" data-ust-rol>${esc(ROL_AD[b.rol] || b.rol)}</div></div>
    <div class="saha-canli ok" data-nokta title="Canlı bağlantı" aria-label="Canlı bağlantı"><i></i><b data-saat>--:--</b></div>
    <button class="saha-ikon" data-tema aria-label="Açık / koyu tema">${IKON.tema}</button>
    <button class="saha-ikon" data-cikis aria-label="Çıkış">${IKON.cikis}</button>
  </header>`;
}
function sekmeHtml() {
  const masa = ['yonetici', 'masa'].includes(store.ben.rol);
  return `
  <nav class="alt-sekme saha-sekme" aria-label="Sekmeler">
    <a href="#saha" class="aktif" aria-current="page" data-yukari>${IKON.liste}<span>Liste</span></a>
    <a href="#rapor">${IKON.rapor}<span>Rapor</span></a>
    <a href="#" data-ara>${IKON.ara}<span>Ara</span></a>
    ${masa ? `<a href="#masa">${IKON.masa}<span>Masa</span></a>` : ''}
  </nav>`;
}
function masaIskelet() {
  return `
  <div data-seg></div>
  <div data-bilgi></div>
  <div class="saha-ara">${IKON.ara}<input type="search" data-q placeholder="Ad, firma, telefon, referans…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Kişi ara"><button class="saha-ara-sil gizli" data-q-sil aria-label="Aramayı temizle">${IKON.sil}</button></div>
  <div class="saha-cipler" data-cipler></div>
  <div data-ozet></div>
  <div data-liste></div>`;
}
function seritHtml() {
  const n = store.kuyruk.length;
  if (store.cevrimici && !n) return '';
  return `<div class="saha-serit">${!store.cevrimici ? 'İnternet yok. ' : ''}${n ? `${n} kayıt sırada, bağlantı gelince gönderilecek.` : 'Dokunuşların kaydediliyor, bağlantı gelince gönderilecek.'}</div>`;
}
function ustCiz() {
  const n = kok?.querySelector('[data-nokta]'); if (!n) return;
  const d = !store.cevrimici ? 'yok' : !store.canli ? 'bag' : 'ok';
  if (n._d === d) return;
  n._d = d; n.className = `saha-canli ${d}`;
  const ad = d === 'ok' ? 'Canlı bağlantı' : d === 'bag' ? 'Bağlanıyor' : 'Çevrimdışı';
  n.title = ad; n.setAttribute('aria-label', ad);
}
function saatCiz() {
  const s = kok?.querySelector('[data-saat]'); if (!s) return;
  const t = simdi().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (s.textContent !== t) s.textContent = t;
}

// ---------------------------------------------------------------- çizim
function ciz() {
  if (!kok || !store.ben) return;
  ustCiz();
  yerlestir('[data-serit]', seritHtml());
  if (soforMu()) soforCiz(); else masaCiz();
}

// ================================================================ ŞOFÖR
function aracim() {
  const hepsi = [...store.araclar.values()].filter(a => a.sofor_kullanici && a.sofor_kullanici === store.ben?.id).sort((a, b) => a.id - b.id);
  return { a: hepsi.find(x => x.id === tercih.arac) || hepsi[0] || null, hepsi };
}
const yolcuSira = (x, y) => (dakika(x.tasima_saati) ?? 9999) - (dakika(y.tasima_saati) ?? 9999)
  || (x.arac_sira ?? 999) - (y.arac_sira ?? 999) || (x.rota_sira ?? 999) - (y.rota_sira ?? 999)
  || siralayici.compare(firmaAdi(x), firmaAdi(y));
const yolcular = a => firmaListesi().filter(f => f.arac_id === a.id).sort(yolcuSira);

function soforCiz() {
  const { a, hepsi } = aracim();
  yerlestir('[data-ust-rol]', esc(`${ROL_AD.sofor}${a ? ' · ' + fmt.plaka(a.plaka) : ''}`));
  const kap = kok.querySelector('[data-sofor]'); if (!kap) return;
  if (!a) {
    if (konum.acik) konumDurdur({ kalici: false });
    konum.denendi = false;   // araç yeniden atanınca kayıtlı tercihe göre paylaşım kendiliğinden sürsün
    if (kap._mod !== 'bos') { kap._mod = 'bos'; kap._html = null; }
    return yerlestir('[data-sofor]', bosHtml());
  }
  if (kap._mod !== 'arac') {
    kap._mod = 'arac'; kap._html = null;
    kap.innerHTML = '<div data-arac-sec></div><section data-arac></section><section data-konum class="saha-konum-kap"></section><section data-sira></section><section data-yolcular></section>';
  }
  if (konum.acik && konum.aracId !== a.id) konum.aracId = a.id;
  if (!konum.acik && !konum.denendi && konumTercihi()) { konum.denendi = true; konumBaslat(a.id); }
  const ys = yolcular(a);
  yerlestir('[data-arac-sec]', hepsi.length > 1 ? `<div class="saha-cipler">${hepsi.map(x => `<button class="saha-cip${x.id === a.id ? ' aktif' : ''}" data-arac-sec="${x.id}">${esc(fmt.plaka(x.plaka))}</button>`).join('')}</div>` : '');
  yerlestir('[data-arac]', aracHtml(a, ys));
  yerlestir('[data-konum]', konumHtml());
  yerlestir('[data-sira]', siraHtml(ys));
  yerlestir('[data-yolcular]', yolcularHtml(ys));
}
function bosHtml() {
  return `
  <div class="saha-bos">
    <div class="saha-bos-ikon">${IKON.arac}</div>
    <h2>Sana henüz araç atanmadı</h2>
    <p>Masa ekibi sana bir araç atadığında plakan, yolcuların ve rotan burada kendiliğinden belirir. Sayfayı kapatmana gerek yok.</p>
  </div>`;
}
function sayim(ys) {
  const s = { alinacak: 0, aracta: 0, fuarda: 0, oy: 0 };
  ys.forEach(f => { const x = soforAsama(f); if (x === 4) s.oy++; else if (x === 3) s.fuarda++; else if (x === 2) s.aracta++; else s.alinacak++; });
  return s;
}
function aracHtml(a, ys) {
  const s = sayim(ys); const kap = Number(a.kapasite) || 0; const asim = kap > 0 && ys.length > kap;
  const bilgiSatir = [a.marka, a.model, a.renk].filter(Boolean).map(x => trBaslik(x)).join(' · ');
  return `
  <div class="saha-kart saha-arac">
    <div class="saha-arac-ust">
      <div class="saha-plaka">${plakaHtml(a.plaka, true)}</div>
      <span class="saha-arac-rozet k-${esc(a.durum || 'yok')}">${esc(ARAC_DURUM_AD[a.durum] || 'Durum yok')}</span>
    </div>
    ${bilgiSatir ? `<div class="saha-arac-bilgi">${esc(bilgiSatir)}</div>` : ''}
    <div class="saha-doluluk${asim ? ' asim' : ''}">
      <span><b>${ys.length}</b>${kap ? ` / ${kap}` : ''} yolcu</span>
      ${kap ? cubuk(fmt.yuzde(ys.length, kap)) : ''}
      ${asim ? '<span class="saha-gec">Kapasite aşıldı</span>' : ''}
    </div>
    <div class="saha-sayilar">
      ${[['Alınacak', s.alinacak], ['Araçta', s.aracta], ['Fuarda', s.fuarda], ['Oy ✓', s.oy]].map(([ad, n]) => `<div class="saha-sayi${n ? ' dolu' : ''}"><b>${n}</b><span>${ad}</span></div>`).join('')}
    </div>
    <div class="saha-bolum saha-bolum-ic">Araç durumu</div>
    <div class="saha-ad-izgara">
      ${ARAC_DURUMLARI.map(d => `<button class="saha-btn${a.durum === d.k ? ` secili k-${d.k}` : ''}" data-arac-durum="${d.k}" aria-pressed="${a.durum === d.k}">${esc(d.ad)}</button>`).join('')}
    </div>
  </div>`;
}
function konumHtml() {
  const acik = konum.acik;
  const yas = konum.sonGonderim ? Date.now() - konum.sonGonderim : 0;
  const dog = konum.son?.coords?.accuracy;
  const dogYazi = Number.isFinite(dog) ? `Doğruluk ±${fmt.sayi(Math.round(dog))} m. ` : '';
  let satir, uyari = '', alt = '';
  if (!acik) satir = 'Kapalı · açmak için dokun';
  else if (!konum.sonGonderim) satir = konum.hata ? 'Konum bekleniyor…' : 'Konum alınıyor…';
  else satir = `Konum paylaşılıyor · ${fmt.goreli(konum.sonGonderim)}`;
  if (!acik) uyari = konum.hata || 'Konum kapalı: masa aracını haritada göremiyor. Yola çıkmadan aç.';
  else if (konum.hata) uyari = konum.hata;
  else if (yas > 120000) uyari = `Son konum ${fmt.goreli(konum.sonGonderim)} gitti. Ekran kapanınca ya da uygulama arka plana geçince konum durur.`;
  if (acik && !uyari) alt = dogYazi + (konum.kilit ? 'Ekran açık tutuluyor. Uygulamayı önde bırak, konum 30 saniyede bir gider.' : 'Ekran açıkken çalışır. Ekranı kapatma, uygulamayı önde bırak.');
  return `
  <button class="saha-konum${acik ? ' acik' : ''}" data-konum-anahtar role="switch" aria-checked="${acik}">
    <span class="saha-konum-ikon">${IKON.konum}</span>
    <span class="saha-konum-yazi"><span class="saha-konum-baslik">KONUMUMU PAYLAŞ</span><span class="saha-konum-satir">${esc(satir)}</span></span>
    <span class="saha-anahtar" aria-hidden="true"></span>
  </button>
  ${uyari ? `<div class="saha-uyari">${IKON.uyari}<span>${esc(uyari)}</span></div>` : ''}
  ${alt ? `<div class="saha-konum-alt">${esc(alt)}</div>` : ''}`;
}
function adresHtml(f) {
  if (!f.adres && !f.ilce) return '';
  const ilceEk = f.ilce && !trArama(f.adres || '').includes(trArama(f.ilce)) ? ` <b>${esc(trBaslik(f.ilce))}</b>` : '';
  return `<div class="saha-adres">${IKON.pin}<span>${esc(adresYaz(f.adres || ''))}${ilceEk}</span></div>`;
}
const almaHtml = f => f.alma_notu ? `<div class="saha-alma"><span>Alma notu</span>${esc(f.alma_notu)}</div>` : '';
const evrakHtml = f => f.evrak_uyari ? `<div class="saha-evrak">${IKON.uyari}<span><b>Evrak:</b> ${esc(f.evrak_uyari)}</span></div>` : '';
const ikiOyHtml = f => f.kisi_oy_sayisi > 1 ? `<div class="saha-ikioy"><b>${f.kisi_oy_sayisi} OY</b> Bu kişi ${f.kisi_oy_sayisi} firmayla oy kullanacak. İşaretlerken hepsini sorar.</div>` : '';

function siraHtml(ys) {
  if (!ys.length) return '';
  const alinacak = ys.filter(f => soforAsama(f) <= 1);
  const aracta = ys.filter(f => soforAsama(f) === 2);
  if (alinacak.length) {
    const f = alinacak[0]; const tel = telLinki(f); const yol = yolLinki(f);
    return `
    <div class="saha-kart saha-sira">
      <div class="saha-etiket">Sıradaki durak<span>${alinacak.length > 1 ? `${alinacak.length} kişi alınacak` : 'son durak'}</span></div>
      <div class="saha-sira-zaman"><b>${saatYaz(f)}</b>${zamanYazi(f)}</div>
      <div class="saha-sira-ad saha-tikla" data-kisi="${f.id}">${esc(firmaAdi(f))}<span class="saha-ok">${IKON.sag}</span></div>
      <div class="saha-firma">${esc(f.unvan || '')}</div>
      ${adresHtml(f)}${almaHtml(f)}${ikiOyHtml(f)}${evrakHtml(f)}
      <div class="saha-iki">
        ${yol ? `<a class="saha-btn saha-btn-kirmizi" href="${esc(yol)}" target="_blank" rel="noopener">${IKON.yon}Yol tarifi</a>` : ''}
        ${tel ? `<a class="saha-btn" href="${esc(tel)}">${IKON.tel}Ara</a>` : ''}
      </div>
      <button class="saha-btn saha-btn-yesil saha-tam saha-dev" data-eylem="aldim" data-id="${f.id}">${IKON.tamam}Aldım</button>
    </div>`;
  }
  if (aracta.length) {
    return `
    <div class="saha-kart saha-sira">
      <div class="saha-etiket">Sıradaki durak<span>${aracta.length} kişi araçta</span></div>
      <div class="saha-sira-ad">${esc(VARIS.ad)}</div>
      <div class="saha-firma">Oy verme yeri. Yolcuları bırakınca aşağıdaki düğmeye dokun.</div>
      <div class="saha-iki"><a class="saha-btn saha-btn-kirmizi" href="${esc(fuarLinki())}" target="_blank" rel="noopener">${IKON.yon}Fuara yol tarifi</a></div>
      <button class="saha-btn saha-btn-koyu saha-tam saha-dev" data-toplu-birak>${IKON.bayrak}Araçtakileri fuara bıraktım (${aracta.length})</button>
    </div>`;
  }
  const oy = ys.filter(f => f.durum === 'oy_kullandi').length;
  return `
  <div class="saha-kart saha-bitti">
    <span class="saha-bitti-ikon">${IKON.tamam}</span>
    <div><b>Tüm yolcular fuara ulaştı</b><span>${oy} / ${ys.length} oy kullandı${oy < ys.length ? '. Oy kullananları aşağıdan işaretle.' : '. Teşekkürler!'}</span></div>
  </div>`;
}
function adimlarHtml(id, liste, asama, ikonlu) {
  return liste.map((a, i) => `<button class="saha-btn saha-adim r-${a.renk}${a.k === 'oy' ? ' oy' : ''}${i < asama ? ' gecti' : ''}${i === asama ? ' simdi' : ''}" data-eylem="${a.k}" data-id="${id}" aria-pressed="${i === asama}">${ikonlu && i <= asama ? IKON.tamam : ''}${esc(a.ad)}</button>`).join('');
}
function yolcuKartHtml(f) {
  const asama = soforAsama(f); const g = gecikme(f); const tel = telLinki(f); const yol = yolLinki(f);
  return `
  <article class="saha-kart saha-yolcu${g ? ' gecikti' : ''}${asama === 2 ? ' aracta' : ''}">
    <div class="saha-yolcu-ust">
      <div class="saha-saat-kutu"><b>${saatYaz(f)}</b>${asama === 2 ? '<span>araçta</span>' : zamanYazi(f, true)}</div>
      <div class="saha-ana saha-tikla" data-kisi="${f.id}">
        <div class="saha-ad">${esc(firmaAdi(f))}<span class="saha-ok">${IKON.sag}</span></div>
        <div class="saha-firma">${esc(f.unvan || '')}</div>
      </div>
    </div>
    ${adresHtml(f)}${almaHtml(f)}${ikiOyHtml(f)}${evrakHtml(f)}
    <div class="saha-iki">
      ${tel ? `<a class="saha-btn" href="${esc(tel)}">${IKON.tel}Ara</a>` : '<span class="saha-btn pasif">Telefon yok</span>'}
      ${yol ? `<a class="saha-btn" href="${esc(yol)}" target="_blank" rel="noopener">${IKON.yon}Yol tarifi</a>` : ''}
    </div>
    <div class="saha-adimlar">${adimlarHtml(f.id, SOFOR_ADIMLAR, asama, true)}</div>
  </article>`;
}
function yolcuKucukHtml(f) {
  const asama = soforAsama(f);
  return `
  <article class="saha-kart saha-yolcu kucuk">
    <div class="saha-yolcu-ust">
      <div class="saha-saat-kutu"><b>${saatYaz(f)}</b><span>${asama === 4 ? 'oy' : 'fuarda'}${f.durum_zamani ? ` ${esc(fmt.saat(f.durum_zamani))}` : ''}</span></div>
      <div class="saha-ana saha-tikla" data-kisi="${f.id}">
        <div class="saha-ad">${esc(firmaAdi(f))}<span class="saha-ok">${IKON.sag}</span></div>
        <div class="saha-firma">${esc(f.unvan || '')}</div>
      </div>
      <div class="saha-kucuk-rozet">${rozetDurum(f)}</div>
    </div>
    ${asama === 3 ? `<button class="saha-btn saha-adim r-yesil oy saha-tam" data-eylem="oy" data-id="${f.id}">${IKON.tamam}Oy kullandı</button>` : ''}
  </article>`;
}
function yolcularHtml(ys) {
  if (!ys.length) return `
    <div class="saha-kart saha-bos-kucuk">${IKON.liste}<div><b>Bu araca henüz yolcu atanmadı</b><span>Masa yolcu atadığında liste burada kendiliğinden belirir.</span></div></div>`;
  const aktif = ys.filter(f => soforAsama(f) < 3), biten = ys.filter(f => soforAsama(f) >= 3);
  const alinacak = aktif.filter(f => soforAsama(f) <= 1).map(f => f.adres).filter(Boolean);
  const rotalar = [...new Set(ys.map(f => f.rota_kod).filter(Boolean))];
  const rota = alinacak.length > 1 ? fmt.rotaLink(alinacak.slice(0, 9)) : '';
  return `
  <div class="saha-bolum">Yolcular · ${ys.length}${rota ? `<a class="saha-rota" href="${esc(rota)}" target="_blank" rel="noopener">${IKON.rota}Rotayı aç</a>` : ''}</div>
  ${rotalar.length ? `<div class="saha-rota-ad">${esc(rotalar.map(r => trBaslik(r)).join(' · '))}</div>` : ''}
  ${aktif.map(yolcuKartHtml).join('')}
  ${biten.length ? `<div class="saha-bolum">Fuara ulaşanlar · ${biten.length}</div>${biten.map(yolcuKucukHtml).join('')}<div class="saha-ipucu">Yanlış işaret mi? Kişinin adına dokun, kartından düzelt.</div>` : ''}`;
}

// ================================================================ MASA / YÖNETİCİ
function masaCiz() {
  yerlestir('[data-ust-rol]', esc(ROL_AD[store.ben.rol] || store.ben.rol));
  const benim = benimListesi();
  let mod = tercih.mod || (benim.length ? 'benim' : 'hepsi');
  let not = bilgi;
  if (mod === 'benim' && !benim.length) { mod = 'hepsi'; not = `Referans adı "${store.ben.ad_soyad}" olan firma bulunamadı. Tüm liste gösteriliyor.`; }
  yerlestir('[data-seg]', `
    <div class="saha-seg" role="tablist">
      <button role="tab" data-mod="benim" class="${mod === 'benim' ? 'aktif' : ''}" aria-selected="${mod === 'benim'}">Benim listem <span class="say">${benim.length}</span></button>
      <button role="tab" data-mod="hepsi" class="${mod === 'hepsi' ? 'aktif' : ''}" aria-selected="${mod === 'hepsi'}">Hepsi <span class="say">${fmt.sayi(store.firmalar.size)}</span></button>
    </div>`);
  yerlestir('[data-bilgi]', not ? `<div class="saha-bilgi">${IKON.bilgi}<span>${esc(not)}</span></div>` : '');
  const taban = mod === 'benim' ? benim : firmaListesi();
  const aranan = arama ? taban.filter(f => aramaEslesir(f, arama)) : taban;
  const gec = new Map(aranan.map(f => [f.id, gecikme(f)]));
  yerlestir('[data-cipler]', FILTRELER.map(fl => {
    const n = aranan.filter(f => fl.fn(f, gec)).length; const ak = tercih.filtre.includes(fl.k);
    return `<button class="saha-cip${ak ? ' aktif' : ''}${fl.k === 'geciken' && n ? ' uyari' : ''}" data-cip="${fl.k}" aria-pressed="${ak}">${esc(fl.ad)} <span class="say">${fmt.sayi(n)}</span></button>`;
  }).join(''));
  const sonuc = aranan.filter(f => tercih.filtre.every(k => FILTRE[k].fn(f, gec)));
  const adlar = new Map(sonuc.map(f => [f.id, firmaAdi(f)]));
  sonuc.sort((x, y) => (x.durum === 'oy_kullandi') - (y.durum === 'oy_kullandi')
    || (gec.get(y.id) || 0) - (gec.get(x.id) || 0)
    || (x.oy_sinifi !== 'bizde') - (y.oy_sinifi !== 'bizde')
    || (dakika(x.tasima_saati) ?? 9999) - (dakika(y.tasima_saati) ?? 9999)
    || siralayici.compare(adlar.get(x.id), adlar.get(y.id)));
  const biz = aranan.filter(f => f.oy_sinifi === 'bizde'); const oy = biz.filter(f => f.durum === 'oy_kullandi').length;
  yerlestir('[data-ozet]', biz.length ? `<div class="saha-ozet"><span><b>${oy}</b> / ${biz.length} bizde oy kullandı</span>${cubuk(fmt.yuzde(oy, biz.length), 'yesil')}<b>%${fmt.yuzde(oy, biz.length)}</b></div>` : '');
  yerlestir('[data-liste]', masaListeHtml(sonuc));
}
function masaListeHtml(sonuc) {
  if (!sonuc.length) return `
    <div class="saha-bos">
      <div class="saha-bos-ikon">${IKON.ara}</div>
      <h2>Kayıt yok</h2>
      <p>Bu arama ve filtrelerle eşleşen kimse yok.</p>
      ${arama || tercih.filtre.length ? '<button class="saha-btn saha-bos-btn" data-filtre-temizle>Aramayı ve filtreleri temizle</button>' : ''}
    </div>`;
  return sonuc.slice(0, sinir).map(masaKartHtml).join('')
    + (sonuc.length > sinir
      ? `<button class="saha-btn saha-tam saha-daha" data-daha>Daha fazla göster (${fmt.sayi(sonuc.length - sinir)} kaldı)</button>`
      : `<div class="saha-son">${fmt.sayi(sonuc.length)} kişinin hepsi gösteriliyor</div>`);
}
function masaKartHtml(f) {
  const asama = masaAsama(f); const tel = telLinki(f); const g = gecikme(f);
  const meta = [
    f.referans ? `Ref. ${trBaslik(f.referans)}` : '',
    f.ilce ? trBaslik(f.ilce) : '',
    f.durum !== 'bekliyor' && f.durum_zamani ? `${f.kendi_geldi ? 'Kendi geldi' : DURUM_AD[f.durum] || f.durum} ${fmt.saat(f.durum_zamani)}${f.durum_kim ? ` (${f.durum_kim})` : ''}` : '',
  ].filter(Boolean);
  return `
  <article class="saha-kart saha-mk${g ? ' gecikti' : ''}${asama === 3 ? ' bitti' : ''}">
    <div class="saha-mk-ust">
      <div class="saha-ana saha-tikla" data-kisi="${f.id}">
        <div class="saha-ad">${esc(firmaAdi(f))}<span class="saha-ok">${IKON.sag}</span></div>
        <div class="saha-firma">${esc(f.unvan || '')}</div>
      </div>
      ${tel ? `<a class="saha-yuvarlak" href="${esc(tel)}" aria-label="${esc(firmaAdi(f))} ara">${IKON.tel}</a>` : ''}
    </div>
    <div class="saha-rozetler">${f.oy_sinifi ? rozetSinif(f.oy_sinifi) : ''}${uyariRozetleri(f)}</div>
    ${meta.length ? `<div class="saha-meta">${esc(meta.join(' · '))}</div>` : ''}
    <div class="saha-mk-adimlar">${adimlarHtml(f.id, MASA_ADIMLAR, asama, false)}</div>
  </article>`;
}

// ================================================================ eylemler
async function yolcuEylem(id, k) {
  if (mesgul.has(id)) return;
  const f = store.firmalar.get(id); if (!f) return;
  const sofor = soforMu(); const liste = sofor ? SOFOR_ADIMLAR : MASA_ADIMLAR;
  const adim = liste.find(a => a.k === k); if (!adim) return;
  if (liste.indexOf(adim) === (sofor ? soforAsama(f) : masaAsama(f))) return mini(`Zaten "${adim.ad}"`);
  if (f.durum === 'oy_kullandi' && adim.durum !== 'oy_kullandi'
    && !await onayla(`${firmaAdi(f)} oy kullandı olarak işaretli. "${adim.ad}" olarak değiştireyim mi?`, { evet: 'Evet, değiştir' })) return;
  mesgul.add(id);
  let ek = '';
  try {
    if (k === 'aldim') {
      // Aynı kişinin diğer firmaları da (bu araçtaysa) araca alınmış sayılır; isaretle 2 oylu kişiyi sorar
      const digerleri = kisiGrubu(f).filter(x => x.id !== id);
      if (f.durum !== 'yolda' || digerleri.some(x => !['yolda', 'fuarda', 'oy_kullandi'].includes(x.durum))) await isaretle(id, 'yolda', { kendi: false });
      const notlanacak = kisiGrubu(f).filter(x => x.id === id || (x.durum === 'yolda' && x.arac_id === f.arac_id && !aractaMi(x)));
      for (const x of notlanacak) await notEkle(x.id, 'araca alındı');
      ek = notlanacak.length > 1 ? `Araca alındı (${notlanacak.length} firma)` : 'Araca alındı';
    } else await isaretle(id, adim.durum, { kendi: false });
  } catch (e) { hataGoster(e); } finally { mesgul.delete(id); }
  if (sofor && konum.acik) anlikKonum(ek); else if (ek) mini(ek, 'yesil');
}
async function aracDurumDegistir(k) {
  const { a } = aracim(); if (!a) return;
  if (a.durum === k) return mini(`Araç zaten "${ARAC_DURUM_AD[k]}"`);
  if (k === 'arizali' && !await onayla('Aracı "Arızalı" olarak işaretleyeyim mi? Masa hemen görür.', { evet: 'Evet, arızalı', tehlike: true })) return;
  const eski = a.durum;
  try {
    await aracDurumYap(a.id, k);
    toast(`Araç durumu: ${ARAC_DURUM_AD[k]}`, { geriAl: eski ? () => aracDurumYap(a.id, eski) : null });
  } catch (e) { hataGoster(e); return; }
  if (konum.acik) anlikKonum();
}
async function topluBirak() {
  const { a } = aracim(); if (!a) return;
  const ids = yolcular(a).filter(f => soforAsama(f) === 2).map(f => f.id);
  if (!ids.length) return;
  if (!await onayla(`Araçtaki ${ids.length} kişiyi "Fuarda" yapayım mı?`, { evet: `Evet, ${ids.length} kişi` })) return;
  try {
    const geriAl = await durumYap(ids, 'fuarda', { kendi: false });
    toast(`${ids.length} kişi fuara bırakıldı`, { geriAl });
  } catch (e) { hataGoster(e); return; }
  if (konum.acik) anlikKonum();
}
function modSec(m) {
  bilgi = '';
  if (m === 'benim' && !benimListesi().length) { bilgi = `Referans adı "${store.ben.ad_soyad}" olan firma bulunamadı. Tüm liste gösteriliyor.`; m = 'hepsi'; }
  tercih.mod = m; tercihYaz(); sinir = SAYFA; ciz();
  window.scrollTo({ top: 0 });
}
function cipDegistir(k) {
  bilgi = '';
  const s = new Set(tercih.filtre);
  if (s.has(k)) s.delete(k);
  else {
    s.add(k);
    if (k === 'oy') { s.delete('gelmedi'); s.delete('geciken'); }
    if (k === 'gelmedi' || k === 'geciken') s.delete('oy');
  }
  tercih.filtre = [...s]; tercihYaz(); sinir = SAYFA; ciz();
}
function aramaTemizle(odak) {
  const i = kok?.querySelector('[data-q]'); if (i) { i.value = ''; if (odak) i.focus(); }
  kok?.querySelector('[data-q-sil]')?.classList.add('gizli');
  arama = ''; sinir = SAYFA;
}
// Tema. Koruma: app.js kabukBagla'daki $('[data-tema]') seçicisi mobil kabukta <html data-tema> öğesine denk geliyor
// ve her dokunuşta temayı çeviriyor. Tıklama window'a ulaştığında (kabarmanın sonu) istenen temayı geri yükle.
let temaIstenen = 'acik';
function temaYaz(t) {
  if (document.documentElement.dataset.tema !== t) document.documentElement.dataset.tema = t;
  try { if (localStorage.getItem('secim-tema') !== t) localStorage.setItem('secim-tema', t); } catch {}
}
function temaKoru() { temaYaz(temaIstenen); }
function temaDegistir() { temaIstenen = temaIstenen === 'koyu' ? 'acik' : 'koyu'; temaYaz(temaIstenen); }
async function cikisSor() {
  if (!await onayla('Çıkış yapılsın mı? Tekrar girmek için PIN gerekir.', { evet: 'Çıkış yap', tehlike: true })) return;
  konumDurdur();
  cikis();
}

// ================================================================ KONUM
function konumAl(ek = {}) {
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000, ...ek }));
}
async function gonder(p, aracId) {
  if (!aracId) return;
  konum.son = p; konum.sonGonderim = Date.now(); konum.hata = '';
  const c = p.coords;
  await konumGonder(aracId, Number(c.latitude.toFixed(6)), Number(c.longitude.toFixed(6)), Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null);
  konumCiz();
}
function konumHata(e) {
  const geo = typeof e?.code === 'number' && e.code >= 1 && e.code <= 3 && !('details' in e);
  if (geo && e.code === 1) { konum.hata = 'Konum izni verilmedi. Telefon ayarlarında tarayıcıya konum izni ver, sonra yeniden aç.'; konumDurdur(); }
  else if (geo && e.code === 2) konum.hata = 'Konum bulunamıyor. Telefonun konum servisi (GPS) açık mı?';
  else if (geo) konum.hata = 'Konum gecikiyor, denemeye devam ediliyor.';
  else konum.hata = `Konum gönderilemedi: ${e?.message || e}`;
  konumCiz();
}
function konumBaslat(aracId) {
  konum.hata = '';
  if (!('geolocation' in navigator) || !window.isSecureContext) {
    konum.hata = 'Bu tarayıcıda konum paylaşılamıyor. Uygulamayı https adresinden aç.'; konumCiz(); return false;
  }
  if (konum.izId != null) konumDurdur({ kalici: false });
  konum.acik = true; konum.aracId = aracId; konumTercihYaz(true);
  konum.izId = navigator.geolocation.watchPosition(p => {
    if (!konum.acik) return;
    konum.son = p; konum.hata = '';
    if (Date.now() - konum.sonGonderim >= KONUM_ARALIK) gonder(p, konum.aracId).catch(konumHata); else konumCiz();
  }, konumHata, { enableHighAccuracy: true, maximumAge: 10000, timeout: 45000 });
  // Araç dururken telefon yeni konum vermeyebilir: 30 sn dolunca tek seferlik konum iste (canlılık sinyali)
  konum.nabiz = setInterval(() => {
    if (!konum.acik || document.hidden || Date.now() - konum.sonGonderim < KONUM_ARALIK) return;
    konumAl({ maximumAge: 15000, timeout: 20000 })
      .then(p => { if (konum.acik && Date.now() - konum.sonGonderim >= KONUM_ARALIK - 1000) return gonder(p, konum.aracId); })
      .catch(konumHata);
  }, 10000);
  ekranKilidiAl(); konumCiz();
  return true;
}
function konumDurdur({ kalici = true } = {}) {
  if (konum.izId != null) { try { navigator.geolocation.clearWatch(konum.izId); } catch {} }
  clearInterval(konum.nabiz);
  konum.izId = null; konum.nabiz = null; konum.acik = false;
  if (konum.kilit) { const k = konum.kilit; konum.kilit = null; k.release().catch(() => {}); }
  if (kalici) konumTercihYaz(false);
}
function konumAnahtar() {
  const { a } = aracim(); if (!a) return;
  if (konum.acik) { konumDurdur(); konum.hata = ''; konumCiz(); mini('Konum paylaşımı kapatıldı'); }
  else if (konumBaslat(a.id)) mini('Konum paylaşımı açıldı', 'yesil');
}
// Her dokunuşta o anki konumu da kaydet
async function anlikKonum(onEk = '') {
  const aracId = konum.aracId;
  const on = onEk ? `${onEk} · ` : '';
  if (!konum.acik || !aracId) { if (onEk) mini(onEk, 'yesil'); return; }
  try {
    const p = konum.son && Date.now() - konum.son.timestamp < 15000 ? konum.son : await konumAl({ maximumAge: 10000, timeout: 12000 });
    await gonder(p, aracId);
    mini(`${on}Konum kaydedildi`, 'yesil');
  } catch (e) {
    mini(`${on}Konum alınamadı`, 'uyari');
  }
}
async function ekranKilidiAl() {
  if (!konum.acik || konum.kilit || document.hidden || !('wakeLock' in navigator)) return;
  try {
    const k = await navigator.wakeLock.request('screen');
    if (!konum.acik) { k.release().catch(() => {}); return; }
    konum.kilit = k;
    k.addEventListener('release', () => { if (konum.kilit === k) konum.kilit = null; konumCiz(); });
  } catch {}
  konumCiz();
}
function gorunurlukDegisti() {
  if (document.hidden || !konum.acik) return;
  ekranKilidiAl();
  if (Date.now() - konum.sonGonderim >= KONUM_ARALIK) {
    konumAl({ maximumAge: 5000, timeout: 20000 }).then(p => { if (konum.acik) return gonder(p, konum.aracId); }).catch(konumHata);
  }
}
function konumCiz() {
  if (!kok || !soforMu() || !aracim().a) return;
  yerlestir('[data-konum]', konumHtml());
}

// ================================================================ olay yakalama
function tikla(e) {
  const h = e.target.closest('[data-eylem],[data-arac-durum],[data-konum-anahtar],[data-kisi],[data-mod],[data-cip],[data-daha],[data-ara],[data-cikis],[data-tema],[data-toplu-birak],[data-arac-sec],[data-filtre-temizle],[data-q-sil],[data-yukari]');
  if (!h || !kok?.contains(h)) return;
  const d = h.dataset;
  if (d.eylem) return yolcuEylem(Number(d.id), d.eylem);
  if (d.aracDurum) return aracDurumDegistir(d.aracDurum);
  if ('konumAnahtar' in d) return konumAnahtar();
  if (d.kisi) { e.preventDefault(); return kisiKartiAc(Number(d.kisi)); }
  if (d.mod) return modSec(d.mod);
  if (d.cip) return cipDegistir(d.cip);
  if ('daha' in d) { sinir += SAYFA; return ciz(); }
  if ('ara' in d) { e.preventDefault(); return paletAc(); }
  if ('cikis' in d) return cikisSor();
  if ('tema' in d) return temaDegistir();
  if ('topluBirak' in d) return topluBirak();
  if (d.aracSec) { tercih.arac = Number(d.aracSec); tercihYaz(); return ciz(); }
  if ('filtreTemizle' in d) { tercih.filtre = []; tercihYaz(); aramaTemizle(false); return ciz(); }
  if ('qSil' in d) { aramaTemizle(true); return ciz(); }
  if ('yukari' in d) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}
function yazildi(e) {
  if (!e.target.matches?.('[data-q]')) return;
  const v = e.target.value;
  kok.querySelector('[data-q-sil]')?.classList.toggle('gizli', !v);
  clearTimeout(aramaZaman);
  aramaZaman = setTimeout(() => { arama = v.trim(); sinir = SAYFA; ciz(); }, 140);
}
function tusBasildi(e) { if (e.key === 'Enter' && e.target.matches?.('[data-q]')) e.target.blur(); }

// ================================================================ modül
export default {
  async render(k) {
    this.temizle();
    kok = k; stilEkle(); document.body.classList.add('saha-acik');
    tercihOku(); arama = ''; sinir = SAYFA; bilgi = '';
    refOnbellek = new Map(); benKelimeler = kelimeler(store.ben?.ad_soyad);
    Object.assign(konum, { son: null, sonGonderim: 0, hata: '', denendi: false });
    kok.innerHTML = `
    <div class="saha">
      ${ustHtml()}
      <div data-serit></div>
      <div class="saha-govde">${soforMu() ? '<div data-sofor></div>' : masaIskelet()}</div>
      ${sekmeHtml()}
      <div class="saha-mini" data-mini role="status" aria-live="polite"></div>
    </div>`;
    kok.addEventListener('click', tikla);
    kok.addEventListener('input', yazildi);
    kok.addEventListener('keydown', tusBasildi);
    try { temaIstenen = localStorage.getItem('secim-tema') === 'koyu' ? 'koyu' : 'acik'; } catch { temaIstenen = document.documentElement.dataset.tema === 'koyu' ? 'koyu' : 'acik'; }
    temaYaz(temaIstenen);
    window.addEventListener('click', temaKoru);
    gorunurlukDinle = gorunurlukDegisti; document.addEventListener('visibilitychange', gorunurlukDinle);
    zamanlayicilar.push(setInterval(saatCiz, 1000), setInterval(konumCiz, 5000));
    saatCiz(); ciz();
  },
  yenile() { ciz(); },
  temizle() {
    zamanlayicilar.forEach(clearInterval); zamanlayicilar = [];
    clearTimeout(aramaZaman); clearTimeout(miniZaman);
    konumDurdur({ kalici: false });
    window.removeEventListener('click', temaKoru);
    if (gorunurlukDinle) document.removeEventListener('visibilitychange', gorunurlukDinle);
    gorunurlukDinle = null;
    document.body.classList.remove('saha-acik');
    if (kok) { kok.removeEventListener('click', tikla); kok.removeEventListener('input', yazildi); kok.removeEventListener('keydown', tusBasildi); }
    kok = null; mesgul.clear();
  },
};

// ================================================================ stil
function stilEkle() {
  if (document.head.querySelector('style[data-ekran="saha"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'saha';
  s.textContent = `
body.saha-acik #toastlar{bottom:calc(92px + env(safe-area-inset-bottom));left:16px;right:16px;transform:none}
body.saha-acik .toast{max-width:100%;font-size:14px;min-height:48px}
body.saha-acik .toast button{white-space:nowrap;height:36px;padding:0 14px;font-size:14px}
body.saha-acik .atlas-dugme{bottom:calc(92px + env(safe-area-inset-bottom));right:14px}
.saha{font-size:15px;-webkit-tap-highlight-color:transparent}
.saha svg{display:block}

/* üst şerit */
.saha-ust{position:sticky;top:0;z-index:55;display:flex;align-items:center;gap:6px;padding:calc(8px + env(safe-area-inset-top)) 8px 8px 16px;background:var(--yuzey);background:color-mix(in srgb,var(--yuzey) 90%,transparent);-webkit-backdrop-filter:saturate(1.5) blur(14px);backdrop-filter:saturate(1.5) blur(14px);border-bottom:1px solid var(--cizgi)}
.saha-avatar{width:38px;height:38px;border-radius:50%;background:var(--kirmizi);color:#fff;display:grid;place-items:center;font-weight:900;font-size:13px;letter-spacing:.02em;flex:none;margin-right:4px}
.saha-kim{flex:1;min-width:0}
.saha-kim-ad{font-weight:800;font-size:15px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.saha-kim-rol{font-size:12.5px;font-weight:600;color:var(--metin-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.saha-canli{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 11px;border-radius:999px;background:var(--yuzey-3);font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;flex:none}
.saha-canli i{width:9px;height:9px;border-radius:50%;background:var(--yesil);box-shadow:0 0 0 3px var(--yesil-acik)}
.saha-canli.bag i{background:var(--amber);box-shadow:0 0 0 3px var(--amber-acik);animation:nabiz 1.2s infinite}
.saha-canli.yok{background:var(--turuncu-acik);color:var(--turuncu)}
.saha-canli.yok i{background:var(--turuncu);box-shadow:0 0 0 3px var(--turuncu-acik);animation:nabiz 1.2s infinite}
.saha-ikon{width:48px;height:48px;border:0;border-radius:14px;background:transparent;color:var(--metin-2);display:grid;place-items:center;cursor:pointer;flex:none}
.saha-ikon:active{background:var(--yuzey-3)}
.saha-ikon svg{width:22px;height:22px}
.saha-serit{background:var(--turuncu);color:#fff;font-weight:700;font-size:13.5px;text-align:center;padding:8px 16px}

/* gövde ve kart */
.saha-govde{padding:14px 16px calc(100px + env(safe-area-inset-bottom))}
.saha-kart{background:var(--yuzey);border:1px solid var(--cizgi);border-radius:18px;box-shadow:var(--golge-1);padding:14px;margin-bottom:12px}
.saha-bolum{display:flex;align-items:center;gap:8px;min-height:24px;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--metin-3);margin:22px 2px 10px}
.saha-bolum-ic{margin:16px 0 8px}
.saha-ipucu{font-size:13.5px;color:var(--metin-3);text-align:center;margin:4px 8px 0;font-weight:600}
.saha-tikla{cursor:pointer}
.saha-ok{display:inline-block;vertical-align:-3px;margin-left:2px;color:var(--metin-3)}
.saha-ok svg{width:16px;height:16px}

/* düğmeler */
.saha-btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 12px;border-radius:14px;border:1.5px solid var(--cizgi-2);background:var(--yuzey);color:var(--metin);font:inherit;font-weight:800;font-size:15px;line-height:1.15;text-align:center;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none;transition:transform .06s,background .12s,border-color .12s,color .12s}
.saha-btn:active{transform:scale(.97)}
.saha-btn svg{width:20px;height:20px;flex:none}
.saha-btn.pasif{color:var(--metin-3);border-style:dashed;cursor:default;font-weight:700}
.saha-btn-kirmizi{background:var(--kirmizi);border-color:var(--kirmizi-koyu);color:#fff}
.saha-btn-yesil{background:var(--yesil);border-color:#11803A;color:#fff}
.saha-btn-koyu{background:var(--koyu);border-color:#000;color:#fff}
:root[data-tema="koyu"] .saha-btn-koyu{background:#F2F2F0;border-color:#F2F2F0;color:#111}
.saha-tam{width:100%;grid-column:1/-1}
.saha-dev{min-height:60px;font-size:17px;border-radius:16px;margin-top:10px}
.saha-dev svg{width:24px;height:24px}
.saha-iki{display:flex;gap:8px;margin-top:12px}
.saha-iki>*{flex:1;min-width:0}
.saha-iki:empty{display:none}

/* araç kartı */
.saha-arac-ust{display:flex;align-items:center;justify-content:space-between;gap:10px}
.saha-plaka .plaka.buyuk{height:46px;font-size:25px;border-width:2px;border-radius:7px}
.saha-plaka .plaka.buyuk::before{width:22px;font-size:10px}
.saha-plaka .plaka span{padding:0 12px}
.saha-arac-rozet{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:999px;font-weight:900;font-size:14px;background:var(--gri-acik);color:var(--metin-2);white-space:nowrap}
.saha-arac-rozet.k-hazir{background:var(--yesil-acik);color:var(--yesil)}
.saha-arac-rozet.k-yolda{background:var(--amber-acik);color:var(--amber)}
.saha-arac-rozet.k-fuarda{background:var(--mor-acik);color:var(--mor)}
.saha-arac-rozet.k-arizali{background:var(--turuncu-acik);color:var(--turuncu)}
.saha-arac-bilgi{margin-top:8px;font-size:14px;font-weight:600;color:var(--metin-2)}
.saha-doluluk{display:flex;align-items:center;gap:12px;margin-top:12px;font-size:14px;font-weight:700;color:var(--metin-2);white-space:nowrap}
.saha-doluluk b{font-size:20px;font-weight:900;color:var(--metin);font-variant-numeric:tabular-nums}
.saha-doluluk .cubuk{flex:1;height:10px}
.saha-doluluk.asim .cubuk>i{background:var(--turuncu)}
.saha-sayilar{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
.saha-sayi{background:var(--yuzey-2);border:1px solid var(--cizgi);border-radius:12px;padding:8px 4px 7px;text-align:center}
.saha-sayi b{display:block;font-size:22px;font-weight:900;line-height:1.1;font-variant-numeric:tabular-nums;color:var(--metin-3)}
.saha-sayi.dolu b{color:var(--metin)}
.saha-sayi span{display:block;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--metin-3);margin-top:2px}
.saha-ad-izgara{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.saha-ad-izgara .saha-btn{padding:0 2px;border-radius:12px;font-size:clamp(12.5px,3.6vw,15px)}
.saha-ad-izgara .secili{color:#fff}
.saha-ad-izgara .secili.k-hazir{background:var(--yesil);border-color:var(--yesil)}
.saha-ad-izgara .secili.k-yolda{background:var(--amber);border-color:var(--amber)}
.saha-ad-izgara .secili.k-fuarda{background:var(--mor);border-color:var(--mor)}
.saha-ad-izgara .secili.k-mola{background:var(--metin-2);border-color:var(--metin-2);color:var(--yuzey)}
.saha-ad-izgara .secili.k-arizali{background:var(--turuncu);border-color:var(--turuncu)}

/* konum anahtarı */
.saha-konum-kap{margin-bottom:12px}
.saha-konum{display:flex;align-items:center;gap:14px;width:100%;min-height:78px;padding:14px 16px;border-radius:18px;border:2px solid var(--cizgi-2);background:var(--yuzey);color:var(--metin);font:inherit;text-align:left;cursor:pointer;box-shadow:var(--golge-1);touch-action:manipulation;transition:background .15s,border-color .15s}
.saha-konum:active{transform:scale(.99)}
.saha-konum.acik{border-color:var(--yesil);background:var(--yesil-acik)}
.saha-konum-ikon{position:relative;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--yuzey-3);color:var(--metin-2);flex:none}
.saha-konum-ikon svg{width:24px;height:24px}
.saha-konum.acik .saha-konum-ikon{background:var(--yesil);color:#fff}
.saha-konum.acik .saha-konum-ikon::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--yesil);animation:saha-dalga 1.8s ease-out infinite}
@keyframes saha-dalga{from{transform:scale(.85);opacity:.9}to{transform:scale(1.4);opacity:0}}
.saha-konum-yazi{flex:1;min-width:0;display:flex;flex-direction:column}
.saha-konum-baslik{font-weight:900;font-size:16px;letter-spacing:.03em}
.saha-konum-satir{font-size:13.5px;font-weight:700;color:var(--metin-3);margin-top:2px}
.saha-konum.acik .saha-konum-satir{color:var(--yesil)}
.saha-anahtar{position:relative;width:58px;height:34px;border-radius:999px;background:var(--cizgi-2);flex:none;transition:background .15s}
.saha-anahtar::after{content:'';position:absolute;top:3px;left:3px;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s}
.saha-konum.acik .saha-anahtar{background:var(--yesil)}
.saha-konum.acik .saha-anahtar::after{left:27px}
.saha-uyari{display:flex;gap:10px;align-items:flex-start;margin-top:8px;padding:11px 12px;border-radius:14px;border:1.5px solid var(--amber);background:var(--amber-acik);color:var(--metin);font-size:14px;font-weight:700;line-height:1.35}
.saha-uyari svg{width:20px;height:20px;color:var(--amber);flex:none;margin-top:1px}
.saha-konum-alt{font-size:12.5px;font-weight:600;color:var(--metin-3);margin:8px 4px 0}

/* sıradaki durak */
.saha-sira{border:2px solid var(--kirmizi);padding:16px}
.saha-etiket{display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--kirmizi)}
.saha-etiket span{letter-spacing:0;text-transform:none;color:var(--metin-3);font-weight:700;font-size:13px}
.saha-sira-zaman{display:flex;align-items:baseline;gap:10px;margin-top:8px;font-weight:700;color:var(--metin-2)}
.saha-sira-zaman b{font-size:36px;font-weight:900;letter-spacing:-.02em;line-height:1;color:var(--metin);font-variant-numeric:tabular-nums}
.saha-sira-ad{font-size:22px;font-weight:900;line-height:1.2;margin-top:10px;letter-spacing:-.01em}
.saha-sira .saha-firma{margin-top:2px}
.saha-bitti{display:flex;gap:14px;align-items:center;border:2px solid var(--yesil);background:var(--yesil-acik)}
.saha-bitti-ikon{width:46px;height:46px;border-radius:50%;background:var(--yesil);color:#fff;display:grid;place-items:center;flex:none}
.saha-bitti-ikon svg{width:26px;height:26px}
.saha-bitti b{display:block;font-size:17px;font-weight:900}
.saha-bitti span{display:block;font-size:14px;font-weight:600;color:var(--metin-2);margin-top:2px}

/* yolcu kartı */
.saha-ad{font-size:17px;font-weight:800;line-height:1.25;letter-spacing:-.005em}
.saha-firma{font-size:13.5px;font-weight:600;color:var(--metin-2);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.saha-yolcu-ust{display:flex;gap:12px;align-items:flex-start}
.saha-saat-kutu{flex:none;width:66px;border-radius:12px;background:var(--yuzey-3);padding:8px 4px;text-align:center}
.saha-saat-kutu b{display:block;font-size:18px;font-weight:900;line-height:1.1;font-variant-numeric:tabular-nums}
.saha-saat-kutu span{display:block;font-size:11.5px;font-weight:700;color:var(--metin-3);margin-top:3px;line-height:1.2}
.saha-yolcu.gecikti{border-color:var(--turuncu)}
.saha-yolcu.gecikti .saha-saat-kutu{background:var(--turuncu-acik)}
.saha-yolcu.aracta .saha-saat-kutu{background:var(--amber-acik)}
.saha-yolcu.aracta .saha-saat-kutu span{color:var(--amber)}
.saha-gec{color:var(--turuncu)!important;font-weight:800}
.saha-ana{flex:1;min-width:0}
.saha-adres{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:15px;font-weight:600;line-height:1.4;color:var(--metin)}
.saha-adres svg{width:18px;height:18px;flex:none;margin-top:2px;color:var(--metin-3)}
.saha-adres b{font-weight:800}
.saha-alma{margin-top:10px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--kirmizi);background:var(--kirmizi-acik);font-size:15px;font-weight:800;line-height:1.35}
.saha-alma span{display:block;font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--kirmizi);margin-bottom:2px}
.saha-evrak{display:flex;gap:8px;align-items:flex-start;margin-top:8px;padding:9px 12px;border-radius:12px;background:var(--sari-acik);border:1px solid var(--sari);font-size:14px;font-weight:600;line-height:1.35}
.saha-evrak svg{width:18px;height:18px;color:var(--sari);flex:none;margin-top:1px}
.saha-ikioy{margin-top:8px;font-size:14px;font-weight:600;color:var(--metin-2);line-height:1.35}
.saha-ikioy b{display:inline-block;background:var(--koyu);color:#fff;border-radius:6px;padding:1px 6px;font-size:11.5px;font-weight:900;margin-right:4px}
.saha-adimlar{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.saha-adimlar .oy{grid-column:1/-1}
.saha-adim.gecti{background:var(--yuzey-3);border-color:transparent;color:var(--metin-3)}
.saha-adim.oy:not(.simdi):not(.gecti){border-color:var(--yesil);color:var(--yesil)}
.saha-adim.simdi{color:#fff}
.saha-adim.simdi.r-mavi{background:var(--mavi);border-color:var(--mavi)}
.saha-adim.simdi.r-amber{background:var(--amber);border-color:var(--amber)}
.saha-adim.simdi.r-turuncu{background:var(--turuncu);border-color:var(--turuncu)}
.saha-adim.simdi.r-mor{background:var(--mor);border-color:var(--mor)}
.saha-adim.simdi.r-yesil{background:var(--yesil);border-color:var(--yesil)}
.saha-yolcu.kucuk{padding:12px}
.saha-yolcu.kucuk .saha-ad{font-size:16px}
.saha-yolcu.kucuk .saha-adim{margin-top:10px}
.saha-kucuk-rozet{flex:none;padding-top:2px}
.saha-rota{margin-left:auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;background:var(--koyu);color:#fff;letter-spacing:0;text-transform:none;font-size:13.5px;font-weight:800}
:root[data-tema="koyu"] .saha-rota{background:#F2F2F0;color:#111}
.saha-rota svg{width:18px;height:18px}
.saha-rota-ad{font-size:13.5px;font-weight:700;color:var(--metin-2);margin:-4px 2px 10px}
.saha-bos-kucuk{display:flex;gap:12px;align-items:center;color:var(--metin-3)}
.saha-bos-kucuk svg{width:28px;height:28px;flex:none}
.saha-bos-kucuk b{display:block;color:var(--metin);font-size:15px}
.saha-bos-kucuk span{display:block;font-size:14px;font-weight:600}

/* masa görünümü */
.saha-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:16px;background:var(--yuzey-3);margin-bottom:12px}
.saha-seg button{min-height:48px;border:0;border-radius:12px;background:transparent;color:var(--metin-2);font:inherit;font-weight:800;font-size:15px;cursor:pointer;touch-action:manipulation}
.saha-seg button.aktif{background:var(--yuzey);color:var(--metin);box-shadow:var(--golge-1)}
.saha-seg .say{font-weight:700;color:var(--metin-3);margin-left:4px;font-variant-numeric:tabular-nums}
.saha-bilgi{display:flex;gap:10px;align-items:flex-start;margin:0 0 12px;padding:11px 12px;border-radius:14px;background:var(--mavi-acik);color:var(--metin);font-size:14px;font-weight:600;line-height:1.35}
.saha-bilgi svg{width:20px;height:20px;color:var(--mavi);flex:none;margin-top:1px}
.saha-ara{position:relative;margin-bottom:10px}
.saha-ara>svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:var(--metin-3);pointer-events:none}
.saha-ara input{width:100%;height:52px;padding:0 50px 0 44px;border-radius:14px;border:1.5px solid var(--cizgi-2);background:var(--yuzey);color:var(--metin);font:inherit;font-size:16px;font-weight:600;outline:none;-webkit-appearance:none;appearance:none}
.saha-ara input::-webkit-search-cancel-button{display:none}
.saha-ara input:focus{border-color:var(--kirmizi);box-shadow:0 0 0 3px var(--kirmizi-acik)}
.saha-ara-sil{position:absolute;right:2px;top:2px;width:48px;height:48px;border:0;background:transparent;color:var(--metin-3);display:grid;place-items:center;cursor:pointer}
.saha-ara-sil svg{width:18px;height:18px}
.saha-cipler{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 12px;padding:0 16px}
.saha-cipler::-webkit-scrollbar{display:none}
.saha-cip{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 16px;border-radius:999px;border:1.5px solid var(--cizgi-2);background:var(--yuzey);color:var(--metin);font:inherit;font-weight:700;font-size:15px;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.saha-cip .say{font-weight:800;color:var(--metin-3);font-variant-numeric:tabular-nums}
.saha-cip.uyari .say{color:var(--turuncu)}
.saha-cip.aktif{background:var(--koyu);border-color:var(--koyu);color:#fff}
.saha-cip.aktif .say{color:rgba(255,255,255,.75)}
:root[data-tema="koyu"] .saha-cip.aktif{background:#F2F2F0;border-color:#F2F2F0;color:#111}
:root[data-tema="koyu"] .saha-cip.aktif .say{color:#555}
.saha-ozet{display:flex;align-items:center;gap:12px;margin:2px 2px 12px;font-size:13.5px;font-weight:700;color:var(--metin-2);white-space:nowrap}
.saha-ozet b{color:var(--metin);font-variant-numeric:tabular-nums}
.saha-ozet .cubuk{flex:1}
.saha-mk-ust{display:flex;gap:10px;align-items:flex-start}
.saha-yuvarlak{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--yesil-acik);color:var(--yesil);flex:none}
.saha-yuvarlak svg{width:22px;height:22px}
.saha-yuvarlak:active{transform:scale(.95)}
.saha-rozetler{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.saha-rozetler:empty{display:none}
.saha-meta{margin-top:8px;font-size:13.5px;font-weight:600;color:var(--metin-3);line-height:1.35}
.saha-mk-adimlar{display:grid;grid-template-columns:1fr 1fr 1fr 1.4fr;gap:6px;margin-top:12px}
.saha-mk-adimlar .saha-btn{padding:0 4px;border-radius:12px;font-size:clamp(13px,3.8vw,15px)}
.saha-mk.gecikti{border-color:var(--turuncu);box-shadow:0 0 0 1px var(--turuncu)}
.saha-mk.bitti{background:var(--yuzey-2)}
.saha-mk.bitti .saha-ad{color:var(--metin-2)}
.saha-daha{margin-top:4px}
.saha-son{text-align:center;font-size:13.5px;font-weight:600;color:var(--metin-3);padding:8px 0}

/* boş durum */
.saha-bos{text-align:center;padding:48px 20px}
.saha-bos-ikon{width:76px;height:76px;border-radius:50%;background:var(--yuzey-3);color:var(--metin-3);display:grid;place-items:center;margin:0 auto 16px}
.saha-bos-ikon svg{width:36px;height:36px}
.saha-bos h2{margin:0 0 6px;font-size:20px;font-weight:900;letter-spacing:-.01em}
.saha-bos p{margin:0 auto;max-width:310px;font-size:15px;color:var(--metin-3);line-height:1.45}
.saha-bos-btn{margin:18px auto 0;display:inline-flex}

/* alt sekme */
.saha-sekme{justify-content:center;gap:4px;padding:4px 8px calc(4px + env(safe-area-inset-bottom));background:var(--yuzey);background:color-mix(in srgb,var(--yuzey) 92%,transparent);-webkit-backdrop-filter:saturate(1.5) blur(14px);backdrop-filter:saturate(1.5) blur(14px)}
.saha-sekme a{flex:1;max-width:124px;min-height:56px;justify-content:center;gap:3px;padding:6px 4px;border-radius:14px;font-size:12px;font-weight:800;position:relative;touch-action:manipulation}
.saha-sekme a svg{width:24px;height:24px}
.saha-sekme a:active{background:var(--yuzey-3)}
.saha-sekme a.aktif::before{content:'';position:absolute;top:-4px;left:32%;right:32%;height:3px;border-radius:0 0 3px 3px;background:var(--kirmizi)}

/* küçük bildirim */
.saha-mini{position:fixed;left:50%;top:calc(74px + env(safe-area-inset-top));z-index:125;transform:translate(-50%,-8px);opacity:0;pointer-events:none;display:inline-flex;align-items:center;gap:6px;max-width:calc(100vw - 32px);padding:8px 14px;border-radius:999px;background:var(--koyu);color:#fff;font-weight:800;font-size:13.5px;box-shadow:var(--golge-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .18s,transform .18s}
.saha-mini.goster{opacity:1;transform:translate(-50%,0)}
.saha-mini.yesil{background:#11803A}
.saha-mini.uyari{background:var(--turuncu)}
@media (prefers-reduced-motion: reduce){.saha-konum.acik .saha-konum-ikon::after,.saha-canli i{animation:none}.saha-btn:active{transform:none}}
`;
  document.head.appendChild(s);
}
