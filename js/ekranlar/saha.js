// 72. Komite · Seçim Masası · SAHA (telefon ekranı, ~390px) · Claude Design "SM Surucu" tasarımı (ATLAS, 2026-09-30)
// Şoför: plaka + doluluk koltukları + "Konumumu paylaş" anahtarı, SIRADAKİ DURAK (kalan süre, 6 geri sayım düğmesi,
// sorumlu bildirimi, yolcuya WhatsApp) ve yolcu kartları (büyük durum düğmeleri).
// Referans / masa / yönetici: "Benim listem / Hepsi", arama, filtre çipleri, büyük kartlar ve durum düğmeleri.
// Mobil kabuk: üst başlığı ve alt sekme çubuğunu (Liste · Bildirimler · Rapor · ATLAS) bu ekran kendisi çizer.
import {
  store, esc, fmt, trBaslik, trKucuk, trArama, dakika, gecikme, firmaListesi, firmaAdi, aramaEslesir, cikis, ROL_AD, VARIS,
  ARAC_DURUMLARI, ARAC_DURUM_AD, DURUM_AD, SINIF_AD, GERI_SAYIM, geriSayimSonraki, geriSayimYap, okunmamisBildirim, kalanSure,
  aracKonum, firmaKonum, ulasim, sayac, aracDurumYap, konumGonder, notEkle, durumYap, kisiGrubu,
  karsiladim, referansBenMi, isaretleyebilirMi, oyBekliyor,
} from '../core.js';
import { toast, hataGoster, onayla, isaretle, kisiKartiAc, modal, modalKapat } from '../ui.js';
import asistan from '../asistan.js';

// ---------------------------------------------------------------- sabitler
const SAYFA = 40;                 // listede bir seferde çizilen kart
const KONUM_ARALIK = 30000;       // konum en çok 30 sn'de bir gönderilir
const ETA_ARALIK = 45000;         // kalan süre en çok 45 sn'de bir yenilenir
const siralayici = new Intl.Collator('tr', { sensitivity: 'base' });

// Yolcu durum düğmeleri (şoför ve referans için aynı 5 adım). "Aldım" = durum 'yolda' + "araca alındı" notu.
const ADIMLAR = [
  { k: 'arandi', ad: 'Arandı', durum: 'arandi', gun: 'arandi' },
  { k: 'yoldayim', ad: 'Yoldayım', durum: 'yolda', gun: 'yolda' },
  { k: 'aldim', ad: 'Aldım', durum: 'yolda', gun: 'yolda' },
  { k: 'birak', ad: 'Fuara bıraktım', durum: 'fuarda', gun: 'fuarda' },
  { k: 'oy', ad: 'Oy kullandı', durum: 'oy_kullandi', gun: 'oy' },
];
// Yönetim kurulu (referans) şoför değildir: yolcu taşıma adımlarını görmez, yalnız aradığını ve oy kullandığını işaretler; karşılama ayrı düğmede
const KURUL_ADIM = new Set(['arandi', 'oy']);
const FILTRELER = [
  { k: 'bizde', ad: 'Bizde', fn: f => f.oy_sinifi === 'bizde' },
  { k: 'gelmedi', ad: 'Gelmedi', fn: f => !['fuarda', 'oy_kullandi'].includes(f.durum) },
  { k: 'geciken', ad: 'Geciken', fn: (f, gec) => (gec.get(f.id) || 0) > 0 },
  { k: 'oy', ad: 'Oy kullandı', fn: f => f.durum === 'oy_kullandi' },
];
const FILTRE = Object.fromEntries(FILTRELER.map(f => [f.k, f]));
const HITAP = new Set(['bey', 'hanim', 'hn', 'bay', 'bayan', 'abi', 'abla']);
const GUN_AD = { bekliyor: 'Bekliyor', arandi: 'Arandı', yolda: 'Yolda', fuarda: 'Fuarda', oy_kullandi: 'OY KULLANDI' };
const ULASIM_AD = { servis: 'SERVİS', kendi: 'KENDİ GELECEK', yok: 'ULAŞIM YOK' };

// ---------------------------------------------------------------- ikonlar (çizgi, currentColor)
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IKON = {
  liste: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>'),
  zil: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  rapor: svg('<path d="M4 20V11M10 20V4M16 20v-8M21 20H3"/>'),
  atlas: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="3"/>'),
  ara: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  cikis: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  tema: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
  arac: svg('<path d="M5 17V6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5V17M5 12h14M3 17h18M7.5 20v-3M16.5 20v-3"/><path d="M8 14.5h.01M16 14.5h.01" stroke-width="3"/>'),
  bilgi: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  uyari: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>'),
  sil: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  bayrak: svg('<path d="M5 22V4M5 4h12l-2 4 2 4H5"/>'),
  rota: svg('<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>'),
  tamam: svg('<path d="M20 6 9 17l-5-5"/>'),
};

// ---------------------------------------------------------------- durum
let kok = null, zamanlayicilar = [], aramaZaman = null, miniZaman = null, flashZaman = null, gorunurlukDinle = null;
let tercih = { mod: null, filtre: [], arac: null };
let arama = '', sinir = SAYFA, bilgi = '', waAcik = false, flash = null;
let refOnbellek = new Map(), benKelimeler = [];
const mesgul = new Set();
const konum = { acik: false, izId: null, nabiz: null, son: null, sonGonderim: 0, hata: '', kilit: null, aracId: null, denendi: false };
const eta = { id: 0, anahtar: '', dur: null, fuar: null, t: 0, yukleniyor: false };

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
// Türkçe -e/-a hali: "Selin" -> "Selin'e", "Ayşe" -> "Ayşe'ye", "Hakan" -> "Hakan'a"
function datif(ad) {
  const w = trBaslik(String(ad || '').trim().split(/\s+/)[0]); if (!w) return '';
  const k = trKucuk(w); const unlu = 'aeıioöuü';
  let son = ''; for (let i = k.length - 1; i >= 0; i--) if (unlu.includes(k[i])) { son = k[i]; break; }
  return `${w}'${unlu.includes(k[k.length - 1]) ? 'y' : ''}${'aıou'.includes(son) ? 'a' : 'e'}`;
}

function mini(metin, tur = '') {
  const m = kok?.querySelector('[data-mini]'); if (!m) return;
  m.textContent = metin; m.className = `saha-mini goster ${tur}`;
  clearTimeout(miniZaman); miniZaman = setTimeout(() => { if (m.isConnected) m.className = `saha-mini ${tur}`; }, 1900);
}
function flashKur(id, metin) {
  flash = { id, metin }; clearTimeout(flashZaman);
  flashZaman = setTimeout(() => { flash = null; if (kok) ciz(); }, 2200);
  if (kok) ciz();
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
// -1 bekliyor · 0 arandı · 1 yoldayım · 2 araçta (aldım) · 3 fuarda · 4 oy kullandı
function asama(f) {
  if (f.durum === 'oy_kullandi') return 4;
  if (f.durum === 'fuarda') return 3;
  if (f.durum === 'yolda') return aractaMi(f) || ['aldim', 'yolda'].includes(f.geri_sayim) ? 2 : 1;   // geri sayımda ALDIM / YOLA ÇIKTIK basılmışsa araçtadır
  if (f.durum === 'arandi') return 0;
  return -1;
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
// REFERANS = kişiyi tanıyan yönetim kurulu üyesi (rol değil); kendi kişilerini referansBenMi(f) ile görür, kısaltılmış yazımlar ("GÜNAY H") için ad eşleşmesi de sayılır
const benimListesi = () => firmaListesi().filter(f => referansBenMi(f) || refEslesir(f.referans) || refEslesir(f.referans2));
const bizimSinif = f => f.oy_sinifi === 'bizde' || f.oy_sinifi === 'yolda';

// Yolcuya hitap: "Yasin Bey" / "Merve Hanım". Kayıtta cinsiyet alanı yok; ad kümesinden çıkarılır, emin değilsek yalnız ad (yanlış hitap yerine hitapsız)
const KADIN_ADLARI = new Set(['ayse', 'fatma', 'emine', 'hatice', 'zeynep', 'elif', 'merve', 'esra', 'ebru', 'seda', 'pinar', 'gamze', 'emel', 'pelin', 'demet', 'yasemin', 'melek', 'selda', 'rumeysa', 'aleyna', 'cansu', 'belin', 'canan', 'didem', 'havva', 'mehtap', 'hasibe', 'sehlanur', 'cennet', 'dilruba', 'yeliz', 'neslihan', 'fadik', 'hulya', 'gulsum', 'mesude', 'ece', 'tugce', 'remziye', 'ramize', 'seyma', 'natalia', 'harika', 'nazik', 'yilgul', 'muhterem', 'gulten', 'sevgi', 'sibel', 'burcu', 'ozlem', 'serpil', 'nur', 'nurten', 'ayten', 'aylin', 'derya', 'dilek', 'filiz', 'gul', 'ipek', 'kubra', 'leyla', 'meltem', 'nilufer', 'nihal', 'sevil', 'songul', 'tulay', 'ulku', 'yildiz', 'zehra', 'busra', 'buse', 'ceren', 'damla', 'gizem', 'hilal', 'irem', 'sena', 'sevda', 'sinem', 'tuba', 'ozge', 'ilknur', 'aysel', 'aysun', 'hacer', 'halime', 'hanife', 'huriye', 'kader', 'medine', 'melike', 'meryem', 'naime', 'nazli', 'nese', 'rabia', 'saliha', 'sultan', 'semra', 'sukran', 'tugba', 'yagmur', 'nihan', 'beyza', 'bahar', 'aslihan', 'asli', 'ayca', 'berna', 'betul', 'cigdem']);
const BELIRSIZ_ADLAR = new Set(['deniz', 'ozen', 'dolunay', 'guven', 'umut', 'yagiz', 'ozay', 'aydin', 'can', 'ilkay', 'mercan', 'ozgun', 'sahin', 'gunay', 'mursel', 'birgi', 'feza', 'ecevit', 'mingjun', 'francesco', 'franco', 'rasul']);
function hitapAdi(f) {
  const tam = trBaslik(String(f.yetkili || f.unvan || '').trim()); const ilk = tam.split(/\s+/)[0]; if (!ilk) return firmaAdi(f);
  if (!f.yetkili) return tam;
  const k = trArama(ilk);
  if (BELIRSIZ_ADLAR.has(k)) return ilk;
  return `${ilk} ${KADIN_ADLARI.has(k) ? 'Hanım' : 'Bey'}`;
}

// ---------------------------------------------------------------- iskelet
function sekmeHtml(bil, atl) {
  const rozet = (n, sinif = '') => n ? `<b class="saha-rozet ${sinif}">${n > 99 ? '99+' : n}</b>` : '';
  return `
    <a href="#saha" class="aktif" aria-current="page" data-yukari>${IKON.liste}<span>Liste</span></a>
    <a href="#bildirimler">${IKON.zil}<span>Bildirimler</span>${rozet(bil)}</a>
    <a href="#rapor">${IKON.rapor}<span>Rapor</span></a>
    <button type="button" data-atlas-ac>${IKON.atlas}<span>ATLAS</span>${rozet(atl, 'atlas')}</button>`;
}
const atlasSayi = () => parseInt(document.querySelector('.atlas-dugme .rozet-sayi')?.textContent, 10) || 0;
function ustHtml() {
  return `
  <header class="saha-ust">
    <div class="saha-marka">
      <div class="saha-logo">72. KOMİTE <i>|</i> GENÇ ENERJİ</div>
      <div class="saha-kirmizi">KIRMIZI LİSTE</div>
      <div class="saha-canli ok" data-nokta><i></i><span data-canli-yazi>Canlı</span></div>
    </div>
    <div class="saha-kim">
      <button class="saha-kim-sol" data-hesap aria-label="Hesap: tema ve çıkış"><span class="saha-kim-ad">${esc(store.ben.ad_soyad)}<em aria-hidden="true">▾</em></span><span class="saha-kim-rol" data-ust-rol></span></button>
      <div class="saha-sayac" data-sayac></div>
    </div>
    <div class="saha-bar" data-bar></div>
    ${soforMu()
      ? '<div data-arac-sec></div><div data-arac-kart></div><div data-sira></div>'
      : '<div data-seg></div>'}
  </header>`;
}
function masaIskelet() {
  return `
  <div data-bilgi></div>
  <div class="saha-ara">${IKON.ara}<input type="search" data-q placeholder="Ad, firma, telefon, referans…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Kişi ara"><button class="saha-ara-sil gizli" data-q-sil aria-label="Aramayı temizle">${IKON.sil}</button></div>
  <div class="saha-cipler" data-cipler></div>
  <div class="saha-liste" data-liste></div>`;
}
function seritHtml() {
  const n = store.kuyruk.length;
  if (store.cevrimici && !n) return '';
  return `<div class="saha-serit">${!store.cevrimici ? 'İnternet yok. ' : ''}${n ? `${n} işaret sırada, bağlantı gelince gönderilecek.` : 'Dokunuşların kaydediliyor, bağlantı gelince gönderilecek.'}</div>`;
}
function ustCiz() {
  const n = kok?.querySelector('[data-nokta]'); if (!n) return;
  const d = !store.cevrimici ? 'yok' : !store.canli ? 'bag' : 'ok';
  const yazi = d === 'ok' ? 'Canlı' : d === 'bag' ? 'Bağlanıyor…' : `Çevrimdışı${store.kuyruk.length ? ` · ${store.kuyruk.length} sırada` : ''}`;
  if (n._d === d && n._y === yazi) return;
  n._d = d; n._y = yazi; n.className = `saha-canli ${d}`;
  n.querySelector('[data-canli-yazi]').textContent = yazi;
}
function sayacCiz(bitti, toplam, etiket) {
  yerlestir('[data-sayac]', toplam ? `<b>${fmt.sayi(bitti)}<small>/${fmt.sayi(toplam)}</small></b><span>${esc(etiket)}</span>` : '');
  yerlestir('[data-bar]', toplam ? `<i style="width:${Math.max(0, Math.min(100, (bitti / toplam) * 100))}%"></i>` : '');
}
function sekmeCiz() { yerlestir('[data-sekme]', sekmeHtml(okunmamisBildirim(), atlasSayi())); }

// ---------------------------------------------------------------- çizim
function ciz() {
  if (!kok || !store.ben) return;
  ustCiz();
  yerlestir('[data-serit]', seritHtml());
  sekmeCiz();
  if (soforMu()) soforCiz(); else masaCiz();
}

// ---------------------------------------------------------------- ortak: yolcu kartı
function rozetSinifHtml(s) { return `<span class="saha-b sn-${esc(s)}">${esc(String(SINIF_AD[s] || s).toLocaleUpperCase('tr'))}</span>`; }
function gunHtml(f) {
  if (oyBekliyor(f)) return `<span class="saha-b g-oy-bekliyor" title="${esc(trBaslik(f.oy_bildiren))} bildirdi">OY BİLDİRİLDİ · MASA ONAYI</span>`;
  if (f.durum === 'oy_kullandi') return `<span class="saha-b g-oy_kullandi">✓ ${f.kendi_geldi ? 'KENDİ GELDİ · OY' : 'OY KULLANDI'}</span>`;
  return `<span class="saha-b g-${esc(f.durum)}">${esc(GUN_AD[f.durum] || f.durum)}</span>`;
}
function adresHtml(f) {
  if (!f.adres && !f.ilce) return '';
  const ilce = f.ilce ? trBaslik(f.ilce) : '';
  const varMi = ilce && trArama(f.adres || '').includes(trArama(ilce));
  return `<div class="saha-adres">${esc(adresYaz(f.adres || ''))}${ilce && !varMi ? `${f.adres ? ' · ' : ''}<b>${esc(ilce)}</b>` : ''}</div>`;
}
// Kişiyi referans YA DA başkası karşılar: karşılayan varsa "Karşılayan: Ad · saat", yolda/fuarda ve karşılanmamışsa yetkili kullanıcıya düğme
function karsilamaHtml(f, sofor) {
  if (f.karsilayan) return `<div class="saha-karsilayan"><span>${IKON.tamam}</span>Karşılayan: ${esc(trBaslik(f.karsilayan))}${f.karsilama_zamani ? ` · ${esc(fmt.saat(f.karsilama_zamani))}` : ''}</div>`;
  // Yönetim kurulu kişiyi fuarda karşılar: kendi gelen dahil her aşamada (oy kullanmadıysa) düğme görür
  const kurul = store.ben?.rol === 'kurul';
  if (sofor || !(kurul ? f.durum !== 'oy_kullandi' : ['yolda', 'fuarda'].includes(f.durum)) || !isaretleyebilirMi(f)) return '';
  const ben = referansBenMi(f);
  return `<button type="button" class="saha-karsila${ben ? ' ben' : ''}" data-karsila="${f.id}" title="${ben ? 'Bu kişinin referansısın' : 'Kişiyi sen karşıladıysan işaretle'}">${ben ? 'Karşıladım' : 'Ben karşıladım'}</button>`;
}
function kartHtml(f, { sofor = false, kucuk = false } = {}) {
  const a = asama(f); const g = gecikme(f); const tel = telLinki(f); const yol = yolLinki(f);
  const saat = fmt.saatKisa(f.tasima_saati);
  const rozetler = [
    !sofor && f.oy_sinifi ? rozetSinifHtml(f.oy_sinifi) : '',
    !sofor ? (() => { const u = ulasim(f); return u === 'yok' && f.oy_sinifi !== 'bizde' ? '' : `<span class="saha-b ul-${u}">${ULASIM_AD[u]}</span>`; })() : '',
    f.kisi_oy_sayisi > 1 ? `<span class="saha-b iki-oy" title="Aynı kişi ${f.kisi_oy_sayisi} firmayla oy kullanıyor">${f.kisi_oy_sayisi} OY</span>` : '',
  ].filter(Boolean).join('');
  const meta = !sofor ? [
    f.referans ? `Ref. ${trBaslik(f.referans)}` : '',
    f.durum !== 'bekliyor' && f.durum_zamani ? `${f.kendi_geldi ? 'Kendi geldi' : DURUM_AD[f.durum] || f.durum} ${fmt.saat(f.durum_zamani)}${f.durum_kim ? ` (${f.durum_kim})` : ''}` : '',
  ].filter(Boolean).join(' · ') : '';
  return `
  <article class="saha-kart${g ? ' gecikti' : ''}${kucuk ? ' kucuk' : ''}">
    <div class="saha-kart-ust">
      ${saat ? `<div class="saha-saat">${esc(saat)}</div>` : '<div class="saha-saat belirsiz">Saat belirsiz</div>'}
      ${g ? `<span class="saha-b gecikti" title="${g} dk gecikti">◷ GECİKTİ</span>` : ''}
      <div class="saha-kart-sag">${gunHtml(f)}</div>
    </div>
    <div class="saha-kimlik saha-tikla" data-kisi="${f.id}">
      <div class="saha-ad">${esc(firmaAdi(f))}</div>
      <div class="saha-firma">${esc(f.unvan || '')}</div>
      ${kucuk ? '' : adresHtml(f)}
    </div>
    ${rozetler ? `<div class="saha-rozetler">${rozetler}</div>` : ''}
    ${meta ? `<div class="saha-meta">${esc(meta)}</div>` : ''}
    ${f.alma_notu ? `<div class="saha-alma"><span>ALMA NOTU · </span>${esc(f.alma_notu)}</div>` : ''}
    ${f.evrak_uyari ? `<div class="saha-evrak">▲ EVRAK UYARISI · ${esc(f.evrak_uyari)}</div>` : ''}
    ${karsilamaHtml(f, sofor)}
    ${kucuk ? '' : `<div class="saha-ikili">
      ${tel ? `<a class="saha-a koyu" href="${esc(tel)}">📞 Ara</a>` : '<span class="saha-a pasif">Telefon yok</span>'}
      ${yol ? `<a class="saha-a cizgi" href="${esc(yol)}" target="_blank" rel="noopener">📍 Yol tarifi</a>` : '<span class="saha-a pasif">Adres yok</span>'}
    </div>`}
    <div class="saha-adimlar${store.ben?.rol === 'kurul' ? ' kurul' : ''}">${ADIMLAR.map((s, i) => (store.ben?.rol === 'kurul' && !KURUL_ADIM.has(s.k)) ? '' : `<button class="saha-adim r-${s.gun}${i < a ? ' gecti' : ''}${i === a ? ' simdi' : ''}" data-eylem="${s.k}" data-id="${f.id}" aria-pressed="${i === a}">${esc(s.ad)}</button>`).join('')}</div>
    ${flash && flash.id === f.id ? `<div class="saha-flash"><i></i>${esc(flash.metin)}</div>` : ''}
  </article>`;
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

// Sıradaki durak: geri sayımı başlamış ve henüz bırakılmamış kişi; yoksa henüz alınmamış ilk kişi (saat sırasıyla)
function aktifDurak(ys) {
  const acik = ys.filter(f => f.geri_sayim !== 'birakti' && asama(f) <= 2);
  return acik.find(f => f.geri_sayim && asama(f) <= 2) || acik.find(f => asama(f) <= 1) || null;
}

function soforCiz() {
  const { a, hepsi } = aracim();
  const bos = kok.querySelector('[data-liste]');
  if (!a) {
    if (konum.acik) konumDurdur({ kalici: false });
    konum.denendi = false;   // araç yeniden atanınca kayıtlı tercihe göre paylaşım kendiliğinden sürsün
    yerlestir('[data-ust-rol]', esc(ROL_AD.sofor));
    sayacCiz(0, 0, '');
    ['[data-arac-sec]', '[data-arac-kart]', '[data-sira]'].forEach(s => yerlestir(s, ''));
    if (bos) yerlestir('[data-liste]', bosHtml());
    return;
  }
  if (konum.acik && konum.aracId !== a.id) konum.aracId = a.id;
  if (!konum.acik && !konum.denendi && konumTercihi()) { konum.denendi = true; konumBaslat(a.id); }
  const ys = yolcular(a);
  const alinan = ys.filter(f => asama(f) >= 2).length;
  const rotalar = [...new Set(ys.map(f => (String(f.rota_kod || '').match(/Rota\s*\d+/i) || [])[0]).filter(Boolean))];
  const ilceler = [...new Set(ys.map(f => f.ilce).filter(Boolean).map(trBaslik))].slice(0, 3);
  yerlestir('[data-ust-rol]', esc([ROL_AD.sofor, (rotalar.length > 1 ? `${rotalar.length} rota` : rotalar[0]) || (ys.length ? '' : fmt.plaka(a.plaka)), ilceler.join(' / ')].filter(Boolean).join(' · ')));
  sayacCiz(alinan, ys.length, 'alındı');
  yerlestir('[data-arac-sec]', hepsi.length > 1 ? `<div class="saha-cipler ic">${hepsi.map(x => `<button class="saha-cip${x.id === a.id ? ' aktif' : ''}" data-arac-sec="${x.id}">${esc(fmt.plaka(x.plaka))}</button>`).join('')}</div>` : '');
  yerlestir('[data-arac-kart]', aracKartHtml(a, ys));
  yerlestir('[data-sira]', siraHtml(a, ys));
  yerlestir('[data-liste]', yolcularHtml(ys));
  etaYenile(a, ys);
}
function bosHtml() {
  return `
  <div class="saha-bos">
    <div class="saha-bos-ikon">${IKON.arac}</div>
    <h2>Sana henüz araç atanmadı</h2>
    <p>Masa ekibi sana bir araç atadığında plakan, yolcuların ve rotan burada kendiliğinden belirir. Sayfayı kapatmana gerek yok.</p>
  </div>`;
}
function aracKartHtml(a, ys) {
  const kap = Number(a.kapasite) || 0; const dolu = ys.filter(f => asama(f) === 2).length;
  const model = [[a.marka, a.model].filter(Boolean).map(trBaslik).join(' '), a.renk ? trBaslik(a.renk) : ''].filter(Boolean).join(' · ');
  const durum = a.durum ? (ARAC_DURUM_AD[a.durum] || a.durum) : 'Durum yok';
  const koltuk = kap ? Array.from({ length: Math.min(kap, 12) }, (_, i) => `<i class="${i < dolu ? 'dolu' : ''}"></i>`).join('') : '';
  const plaka = fmt.plaka(a.plaka);
  return `
  <div class="saha-arac">
    <div class="saha-arac-ust">
      <div class="saha-plaka" aria-label="Plaka ${esc(plaka)}"><i>TR</i><b>${esc(plaka)}</b></div>
      <button class="saha-arac-metin" data-arac-durum-ac aria-label="Araç durumunu değiştir">
        <span class="saha-arac-doluluk">${dolu}${kap ? `/${kap}` : ''} yolcu · <span class="saha-durum k-${esc(a.durum || 'yok')}">${a.durum === 'arizali' ? '✕ ' : ''}${esc(durum)} ▾</span></span>
        ${model ? `<span class="saha-arac-model">${esc(model)}</span>` : ''}
      </button>
      ${koltuk ? `<div class="saha-koltuk" aria-hidden="true">${koltuk}</div>` : ''}
    </div>
    ${konumHtml()}
  </div>`;
}
function konumHtml() {
  const acik = konum.acik;
  const yas = konum.sonGonderim ? Date.now() - konum.sonGonderim : 0;
  let satir, uyari = '';
  if (!acik) satir = 'Kapalı · masa aracı göremez';
  else if (!konum.sonGonderim) satir = konum.hata ? 'Konum bekleniyor…' : 'Konum alınıyor…';
  else satir = `Konum paylaşılıyor · ${fmt.goreli(konum.sonGonderim)} güncellendi`;
  if (konum.hata) uyari = konum.hata;
  else if (acik && yas > 120000) uyari = `Son konum ${fmt.goreli(konum.sonGonderim)} gitti. Ekran kapanınca ya da uygulama arka plana geçince konum durur.`;
  return `
  <button class="saha-konum${acik ? ' acik' : ''}" data-konum-anahtar role="switch" aria-checked="${acik}">
    <span class="saha-konum-yazi"><span class="saha-konum-baslik">Konumumu paylaş</span><span class="saha-konum-satir">${esc(satir)}</span></span>
    <span class="saha-sw" aria-hidden="true"><i></i></span>
  </button>
  ${uyari ? `<div class="saha-uyari">${IKON.uyari}<span>${esc(uyari)}</span></div>` : ''}`;
}

// ---- sıradaki durak
function cdZamanlari(f) {
  const z = {};
  for (const o of store.olaylar) {   // en yeni başta: her adımın son olayı
    if (o.tur !== 'geri_sayim' || o.firma_id !== f.id || !o.yeni || z[o.yeni]) continue;
    z[o.yeni] = fmt.saat(o.zaman);
  }
  if (f.geri_sayim && f.geri_sayim_zamani) z[f.geri_sayim] = fmt.saat(f.geri_sayim_zamani);
  return z;
}
function siraHtml(a, ys) {
  if (!ys.length) return '';
  const f = aktifDurak(ys);
  if (f) return durakHtml(a, f);
  const aracta = ys.filter(x => asama(x) === 2);
  if (aracta.length) return `
    <div class="saha-sira">
      <div class="saha-sira-ust"><div class="saha-sira-etiket">SIRADAKİ DURAK</div><div class="saha-sira-saat">${aracta.length} kişi araçta</div></div>
      <div class="saha-sira-ad">${esc(VARIS.ad)}</div>
      <div class="saha-sira-adres">Oy verme yeri. Yolcuları bırakınca aşağıdaki düğmeye dokun.</div>
      <div class="saha-ikili"><a class="saha-a cizgi" href="${esc(fuarLinki())}" target="_blank" rel="noopener">📍 Fuara yol tarifi</a><button class="saha-a koyu" data-toplu-birak>Fuara bıraktım (${aracta.length})</button></div>
    </div>`;
  const oy = ys.filter(x => x.durum === 'oy_kullandi').length;
  return `
  <div class="saha-sira bitti">
    <div class="saha-sira-ust"><div class="saha-sira-etiket yesil">${IKON.tamam} TÜM YOLCULAR FUARA ULAŞTI</div></div>
    <div class="saha-sira-adres">${oy} / ${ys.length} oy kullandı${oy < ys.length ? '. Oy kullananları aşağıdan işaretle.' : '. Teşekkürler!'}</div>
  </div>`;
}
function etaYazi(v, alindiYazi) {
  if (alindiYazi) return alindiYazi;
  if (v) return `~${v.dk} dk · ${String(v.km).replace('.', ',')} km`;
  return eta.yukleniyor ? '…' : '—';
}
function durakHtml(a, f) {
  const idx = GERI_SAYIM.findIndex(g => g.k === f.geri_sayim);
  const alindi = idx >= GERI_SAYIM.findIndex(g => g.k === 'aldim');
  const zamanlar = cdZamanlari(f);
  const gecerli = eta.id === f.id;
  const sonuncu = GERI_SAYIM[GERI_SAYIM.length - 1].k;
  const ilce = f.ilce ? trBaslik(f.ilce) : '';
  const adr = f.adres ? adresYaz(f.adres) : '';
  const ilceVar = ilce && trArama(adr).includes(trArama(ilce));
  const dugmeler = GERI_SAYIM.map((g, i) => {
    const bitti = i <= idx; const sira = i === idx + 1; const son = g.k === sonuncu;
    const alt = bitti ? (zamanlar[g.k] || '') : sira ? 'dokun' : '';
    return `<button class="saha-cd ${bitti ? 'bitti' : sira ? (son ? 'sira son' : 'sira') : 'kilit'}${son ? ' genis' : ''}" data-cd="${g.k}" data-id="${f.id}" ${sira ? '' : 'disabled'}><span>${bitti ? '✓ ' : ''}${esc(g.ad)}</span><span class="alt">${esc(alt)}</span></button>`;
  }).join('');
  const sorumluId = f.sorumlu_id || a.sorumlu_id; const sorumlu = sorumluId ? store.profiller.get(sorumluId) : null;
  // Sorumlunun "görüldü" bilgisi şoföre RLS ile kapalı (bildirimi yalnız alıcısı okur); şoför tarafında dürüst durum "gönderildi"
  const bilgi = f.geri_sayim && sorumlu ? `<div class="saha-cd-bilgi">Sorumlu ${esc(datif(sorumlu.ad_soyad))} bildirim gitti ✓ · gönderildi</div>` : '';
  return `
  <div class="saha-sira">
    <div class="saha-sira-ust"><div class="saha-sira-etiket">SIRADAKİ DURAK</div><div class="saha-sira-saat">${esc(fmt.saatKisa(f.tasima_saati) || 'Saat belirsiz')}</div></div>
    <div class="saha-sira-kimlik saha-tikla" data-kisi="${f.id}">
      <div class="saha-sira-ad">${esc(firmaAdi(f))}</div>
      ${adr || ilce ? `<div class="saha-sira-adres">${esc(adr)}${ilce && !ilceVar ? `${adr ? ' · ' : ''}<b>${esc(ilce)}</b>` : ''}</div>` : ''}
    </div>
    <div class="saha-eta">
      <div><small>Durağa</small><b>${esc(etaYazi(gecerli ? eta.dur : null, alindi ? 'Araçta ✓' : ''))}</b></div>
      <div><small>Fuar'a</small><b>${esc(etaYazi(gecerli ? eta.fuar : null, '').replace(/ · .*$/, ''))}</b></div>
    </div>
    <div class="saha-cd-izgara">${dugmeler}</div>
    ${bilgi}
    ${alindi ? '' : waHtml(a, f, gecerli ? eta.dur : null)}
  </div>`;
}
function waHtml(a, f, dur) {
  const sofor = trBaslik(String(a.sofor_ad || store.ben.ad_soyad || '').trim().split(/\s+/)[0]);
  const metin = `Merhaba ${hitapAdi(f)}, aracınız ${dur ? `yaklaşık ${dur.dk} dakika sonra` : 'kısa süre içinde'} kapınızda. Plaka ${fmt.plaka(a.plaka)}, şoför ${sofor}.`;
  const link = fmt.waLink(f.cep, metin) || fmt.waLink(f.cep2, metin);
  return `
    <button class="saha-wa-dugme" data-wa-ac aria-expanded="${waAcik}">Yolcuya WhatsApp'tan haber ver</button>
    ${waAcik ? `<div class="saha-wa">
      <div class="saha-wa-balon">${esc(metin)}</div>
      ${link ? `<a class="saha-wa-gonder" href="${esc(link)}" target="_blank" rel="noopener">Gönder</a>` : '<div class="saha-wa-yok">Bu kişinin cep telefonu kayıtlı değil.</div>'}
    </div>` : ''}`;
}

// ---- kalan süre (OSRM, trafiksiz tahmin)
function konumNoktasi(a) {
  if (konum.acik && konum.son && Date.now() - konum.son.timestamp < 120000) { const c = konum.son.coords; return { lat: c.latitude, lon: c.longitude }; }
  return aracKonum(a);
}
async function etaYenile(a, ys) {
  const f = aktifDurak(ys); if (!f || eta.yukleniyor) return;
  const bas = konumNoktasi(a); const hedef = firmaKonum(f);
  const alindi = ['aldim', 'yolda'].includes(f.geri_sayim) || asama(f) >= 2;
  const anahtar = [f.id, alindi ? 'f' : 'd', bas ? bas.lat.toFixed(3) : '-', bas ? bas.lon.toFixed(3) : '-'].join('|');
  const yas = Date.now() - eta.t;
  if (eta.anahtar === anahtar ? yas < ETA_ARALIK : (eta.id === f.id && yas < 15000)) return;   // aynı yerde 45 sn, hareket ederken en çok 15 sn'de bir
  eta.yukleniyor = true;
  let dur = null, fuar = null;
  try {
    if (bas) {
      if (alindi) fuar = await kalanSure(bas, VARIS);
      else if (hedef) {
        dur = await kalanSure(bas, hedef);
        const d2 = dur ? await kalanSure(hedef, VARIS) : null;
        fuar = dur && d2 ? { dk: dur.dk + d2.dk, km: Math.round((dur.km + d2.km) * 10) / 10 } : null;
      }
    }
  } catch {}
  Object.assign(eta, { id: f.id, anahtar, dur, fuar, t: Date.now(), yukleniyor: false });
  if (kok && soforMu()) { const { a: b } = aracim(); if (b) { const y = yolcular(b); yerlestir('[data-sira]', siraHtml(b, y)); } }
}

function yolcularHtml(ys) {
  if (!ys.length) return `
    <div class="saha-bos-kucuk">${IKON.liste}<div><b>Bu araca henüz yolcu atanmadı</b><span>Masa yolcu atadığında liste burada kendiliğinden belirir.</span></div></div>`;
  const aktif = ys.filter(f => asama(f) < 3), biten = ys.filter(f => asama(f) >= 3);
  const alinacak = aktif.filter(f => asama(f) <= 1).map(f => f.adres).filter(Boolean);
  const rota = alinacak.length > 1 ? fmt.rotaLink(alinacak.slice(0, 9)) : '';
  return `
  ${aktif.length ? `<div class="saha-bolum">Yolcular · ${ys.length}${rota ? `<a class="saha-rota" href="${esc(rota)}" target="_blank" rel="noopener">${IKON.rota}Rotayı aç</a>` : ''}</div>` : ''}
  ${aktif.map(f => kartHtml(f, { sofor: true })).join('')}
  ${biten.length ? `<div class="saha-bolum">Fuara ulaşanlar · ${biten.length}</div>${biten.map(f => kartHtml(f, { sofor: true, kucuk: true })).join('')}<div class="saha-ipucu">Yanlış işaret mi? Doğru düğmeye dokun ya da kişinin adına dokunup kartından düzelt.</div>` : ''}`;
}

// ================================================================ MASA / REFERANS / YÖNETİCİ
function masaCiz() {
  const benim = benimListesi();
  let mod = tercih.mod || (benim.length ? 'benim' : 'hepsi');
  let not = bilgi;
  if (mod === 'benim' && !benim.length) { mod = 'hepsi'; not = `Referans adı "${store.ben.ad_soyad}" olan firma bulunamadı. Tüm liste gösteriliyor.`; }
  yerlestir('[data-ust-rol]', esc(`${ROL_AD[store.ben.rol] || store.ben.rol} · ${mod === 'benim' ? 'referans listem' : 'tüm liste'}`));
  if (mod === 'benim') { const biz = benim.filter(bizimSinif); sayacCiz(biz.filter(f => f.durum === 'oy_kullandi').length, biz.length, 'bizde oy kullandı'); }
  else { const c = sayac(); sayacCiz(c.oy_bizde, c.hedef, 'bizde oy kullandı'); }
  yerlestir('[data-seg]', `
    <div class="saha-seg" role="tablist">
      <button role="tab" data-mod="benim" class="${mod === 'benim' ? 'aktif' : ''}" aria-selected="${mod === 'benim'}">Benim listem</button>
      <button role="tab" data-mod="hepsi" class="${mod === 'hepsi' ? 'aktif' : ''}" aria-selected="${mod === 'hepsi'}">Hepsi · ${fmt.sayi(store.firmalar.size)}</button>
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
  yerlestir('[data-liste]', masaListeHtml(sonuc));
}
function masaListeHtml(sonuc) {
  if (!sonuc.length) return `
    <div class="saha-bos">
      <div class="saha-bos-ikon">${IKON.ara}</div>
      <h2>Kayıt yok</h2>
      <p>Bu arama ve filtrelerle eşleşen kimse yok.</p>
      ${arama || tercih.filtre.length ? '<button class="saha-btn" data-filtre-temizle>Aramayı ve filtreleri temizle</button>' : ''}
    </div>`;
  return sonuc.slice(0, sinir).map(f => kartHtml(f)).join('')
    + (sonuc.length > sinir
      ? `<button class="saha-btn" data-daha>Daha fazla göster (${fmt.sayi(sonuc.length - sinir)} kaldı)</button>`
      : `<div class="saha-son">${fmt.sayi(sonuc.length)} kişinin hepsi gösteriliyor</div>`);
}

// ================================================================ eylemler
async function yolcuEylem(id, k) {
  if (mesgul.has(id)) return;
  const f = store.firmalar.get(id); if (!f) return;
  const sofor = soforMu();
  const adim = ADIMLAR.find(x => x.k === k); if (!adim) return;
  if (ADIMLAR.indexOf(adim) === asama(f)) return mini(`Zaten "${adim.ad}"`);
  // durum değişikliği uyarısı ve oy bildirimi (masa onayı) ortak isaretle() içinde
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
  if (sofor) {
    const s = await anlikKonum();
    flashKur(id, [ek, s === 'ok' ? 'Konum kaydedildi' : s === 'hata' ? 'İşaretlendi · konum alınamadı' : 'İşaretlendi · konum kapalı'].filter(Boolean).join(' · '));
  }
}
async function karsilaBas(id, dugme) {
  const anahtar = `ka${id}`; if (mesgul.has(anahtar)) return;
  const f = store.firmalar.get(id); if (!f) return;
  mesgul.add(anahtar); dugme.disabled = true;
  try { const geriAl = await karsiladim(id); toast(`${firmaAdi(f)} · ${trBaslik(store.ben?.ad_soyad || '')} karşıladı`, { tur: 'basari', geriAl }); }
  catch (e) { dugme.disabled = false; hataGoster(e); }
  finally { mesgul.delete(anahtar); }
  ciz();
}
async function cdBas(id, k) {
  const anahtar = `cd${id}`; if (mesgul.has(anahtar)) return;
  const f = store.firmalar.get(id); if (!f) return;
  const sonraki = geriSayimSonraki(f);
  if (!sonraki || sonraki.k !== k) return mini('Bu adım şimdi sırada değil', 'uyari');
  mesgul.add(anahtar);
  try {
    const geriAl = await geriSayimYap(id, k);
    toast(`${sonraki.ad} · ${firmaAdi(f)}`, { geriAl: geriAl || null });
    if (k === 'birakti') waAcik = false;
  } catch (e) { hataGoster(e); mesgul.delete(anahtar); return; }
  mesgul.delete(anahtar);
  ciz();
  const s = await anlikKonum();
  mini(s === 'ok' ? 'Konum kaydedildi' : s === 'hata' ? 'İşaretlendi · konum alınamadı' : 'İşaretlendi · konum kapalı', s === 'ok' ? 'yesil' : 'uyari');
}
function aracDurumSec() {
  const { a } = aracim(); if (!a) return;
  const m = modal('Araç durumu', `<div class="saha-durum-izgara">${ARAC_DURUMLARI.map(d => `<button class="saha-btn${a.durum === d.k ? ' secili k-' + d.k : ''}" data-durum-sec="${d.k}">${d.k === 'arizali' ? '✕ ' : ''}${esc(d.ad)}</button>`).join('')}</div>`);
  m.addEventListener('click', e => { const b = e.target.closest('[data-durum-sec]'); if (!b) return; modalKapat(); aracDurumDegistir(b.dataset.durumSec); });
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
  const ids = yolcular(a).filter(f => asama(f) === 2).map(f => f.id);
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
// Tasarım token'ları [data-theme="light|dark"] ile, eski adlar [data-tema="acik|koyu"] ile çalışır: ikisi birlikte yazılır.
let temaIstenen = 'acik';
function temaYaz(t) {
  const h = document.documentElement;
  if (h.dataset.tema !== t) h.dataset.tema = t;
  const theme = t === 'koyu' ? 'dark' : 'light';
  if (h.dataset.theme !== theme) h.dataset.theme = theme;
  try { if (localStorage.getItem('secim-tema') !== t) localStorage.setItem('secim-tema', t); } catch {}
}
function temaKoru() { temaYaz(temaIstenen); }
function temaDegistir() { temaIstenen = temaIstenen === 'koyu' ? 'acik' : 'koyu'; temaYaz(temaIstenen); }
function hesapAc() {
  const m = modal('Hesap', `
    <div class="saha-hesap">
      <div class="saha-hesap-kim"><b>${esc(store.ben.ad_soyad)}</b><span>${esc(ROL_AD[store.ben.rol] || store.ben.rol)}</span></div>
      <button class="saha-btn" data-h-tema>${IKON.tema}<span>${temaIstenen === 'koyu' ? 'Açık temaya geç' : 'Koyu temaya geç'}</span></button>
      <button class="saha-btn tehlike" data-h-cikis>${IKON.cikis}<span>Çıkış yap</span></button>
    </div>`);
  m.addEventListener('click', e => {
    if (e.target.closest('[data-h-tema]')) { temaDegistir(); modalKapat(); }
    else if (e.target.closest('[data-h-cikis]')) { modalKapat(); cikisSor(); }
  });
}
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
// Her dokunuşta o anki konumu da kaydet. Döner: 'ok' | 'kapali' | 'hata'
async function anlikKonum() {
  const aracId = konum.aracId;
  if (!konum.acik || !aracId) return 'kapali';
  try {
    const p = konum.son && Date.now() - konum.son.timestamp < 15000 ? konum.son : await konumAl({ maximumAge: 10000, timeout: 12000 });
    await gonder(p, aracId);
    return 'ok';
  } catch { return 'hata'; }
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
  if (!kok || !soforMu()) return;
  const { a } = aracim(); if (!a) return;
  yerlestir('[data-arac-kart]', aracKartHtml(a, yolcular(a)));
}

// ================================================================ olay yakalama
function tikla(e) {
  const h = e.target.closest('[data-eylem],[data-karsila],[data-cd],[data-wa-ac],[data-arac-durum-ac],[data-konum-anahtar],[data-kisi],[data-mod],[data-cip],[data-daha],[data-atlas-ac],[data-hesap],[data-toplu-birak],[data-arac-sec],[data-filtre-temizle],[data-q-sil],[data-yukari]');
  if (!h || !kok?.contains(h)) return;
  const d = h.dataset;
  if (d.eylem) return yolcuEylem(Number(d.id), d.eylem);
  if (d.karsila) return karsilaBas(Number(d.karsila), h);
  if (d.cd) return cdBas(Number(d.id), d.cd);
  if ('waAc' in d) { waAcik = !waAcik; return ciz(); }
  if ('aracDurumAc' in d) return aracDurumSec();
  if ('konumAnahtar' in d) return konumAnahtar();
  if (d.kisi) { e.preventDefault(); return kisiKartiAc(Number(d.kisi)); }
  if (d.mod) return modSec(d.mod);
  if (d.cip) return cipDegistir(d.cip);
  if ('daha' in d) { sinir += SAYFA; return ciz(); }
  if ('atlasAc' in d) return asistan.ac();
  if ('hesap' in d) return hesapAc();
  if ('topluBirak' in d) return topluBirak();
  if (d.aracSec) { tercih.arac = Number(d.aracSec); tercihYaz(); eta.anahtar = ''; return ciz(); }
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
    tercihOku(); arama = ''; sinir = SAYFA; bilgi = ''; waAcik = false; flash = null;
    Object.assign(eta, { id: 0, anahtar: '', dur: null, fuar: null, t: 0, yukleniyor: false });
    refOnbellek = new Map(); benKelimeler = kelimeler(store.ben?.ad_soyad);
    Object.assign(konum, { son: null, sonGonderim: 0, hata: '', denendi: false });
    kok.innerHTML = `
    <div class="saha">
      <div class="saha-serit-kap" data-serit></div>
      ${ustHtml()}
      <div class="saha-govde">${soforMu() ? '<div class="saha-liste" data-liste></div>' : masaIskelet()}</div>
      <nav class="alt-sekme saha-sekme" data-sekme aria-label="Sekmeler"></nav>
      <div class="saha-mini" data-mini role="status" aria-live="polite"></div>
    </div>`;
    kok.addEventListener('click', tikla);
    kok.addEventListener('input', yazildi);
    kok.addEventListener('keydown', tusBasildi);
    try { temaIstenen = localStorage.getItem('secim-tema') === 'koyu' ? 'koyu' : 'acik'; } catch { temaIstenen = document.documentElement.dataset.tema === 'koyu' ? 'koyu' : 'acik'; }
    temaYaz(temaIstenen);
    window.addEventListener('click', temaKoru);
    gorunurlukDinle = gorunurlukDegisti; document.addEventListener('visibilitychange', gorunurlukDinle);
    zamanlayicilar.push(setInterval(konumCiz, 5000));
    ciz();
  },
  yenile() { ciz(); },
  temizle() {
    zamanlayicilar.forEach(clearInterval); zamanlayicilar = [];
    clearTimeout(aramaZaman); clearTimeout(miniZaman); clearTimeout(flashZaman);
    konumDurdur({ kalici: false });
    window.removeEventListener('click', temaKoru);
    if (gorunurlukDinle) document.removeEventListener('visibilitychange', gorunurlukDinle);
    gorunurlukDinle = null;
    document.body.classList.remove('saha-acik');
    if (kok) { kok.removeEventListener('click', tikla); kok.removeEventListener('input', yazildi); kok.removeEventListener('keydown', tusBasildi); }
    kok = null; mesgul.clear(); flash = null;
  },
};

// ================================================================ stil (Claude Design "SM Surucu")
function stilEkle() {
  if (document.head.querySelector('style[data-ekran="saha"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'saha';
  s.textContent = `
body.saha-acik{background:var(--bg)}
body.saha-acik #toastlar{bottom:calc(84px + env(safe-area-inset-bottom));left:16px;right:16px;transform:none}
body.saha-acik .toast{max-width:100%;font-size:14px;min-height:48px;position:relative;overflow:hidden}
body.saha-acik .toast button{white-space:nowrap;height:36px;padding:0 14px;font-size:14px}
body.saha-acik .toast:has([data-geri])::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.55);transform-origin:left;animation:smDrain 5s linear forwards}
body.saha-acik .atlas-dugme{display:none!important}
.saha{font-family:var(--font);color:var(--ink);-webkit-tap-highlight-color:transparent}
.saha svg{display:block}
.saha button{font-family:inherit}
.saha-tikla{cursor:pointer}
.saha-serit{position:sticky;top:0;z-index:56;background:var(--amber);color:#1a1200;font-weight:700;font-size:13px;text-align:center;padding:7px 16px}
.saha-serit-kap{display:contents}

/* üst blok: marka, kişi, sayaç, çubuk, araç ve sıradaki durak */
.saha-ust{background:var(--surface);border-bottom:1px solid var(--line);padding:calc(14px + env(safe-area-inset-top)) 18px 14px;display:flex;flex-direction:column;gap:10px}
.saha-ust>div:empty{display:none}
.saha-marka{display:flex;align-items:center;gap:8px;min-height:20px}
.saha-logo{font-size:12px;font-weight:900;white-space:nowrap}
.saha-logo i{font-style:normal;color:var(--red)}
.saha-kirmizi{font-size:8.5px;font-weight:900;letter-spacing:.12em;background:var(--red);color:var(--on-red);padding:3px 5px;border-radius:4px;white-space:nowrap}
.saha-canli{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--green);white-space:nowrap}
.saha-canli i{width:7px;height:7px;border-radius:99px;background:var(--green)}
.saha-canli.bag,.saha-canli.yok{color:var(--amber-ink)}
.saha-canli.bag i,.saha-canli.yok i{background:var(--amber);animation:smBlink 1.2s infinite}
.saha-kim{display:flex;align-items:flex-end;gap:10px}
.saha-kim-sol{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px;flex:1;border:0;background:none;padding:6px 0;margin:-6px 0;text-align:left;color:inherit;cursor:pointer;touch-action:manipulation}
.saha-kim-ad{font-size:23px;font-weight:900;letter-spacing:-.02em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.saha-kim-ad em{font-style:normal;font-size:13px;font-weight:700;color:var(--ink-3);margin-left:6px;letter-spacing:0;vertical-align:3px}
.saha-kim-rol{font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.saha-hesap{display:flex;flex-direction:column;gap:10px}
.saha-hesap-kim{display:flex;flex-direction:column;gap:2px;padding-bottom:4px}
.saha-hesap-kim b{font-size:18px;font-weight:900}
.saha-hesap-kim span{font-size:13px;color:var(--ink-3);font-weight:600}
.saha-hesap .saha-btn svg{width:20px;height:20px;flex:none}
.saha-btn.tehlike{color:var(--red);border-color:var(--red-line)}
.saha-sayac{margin-left:auto;text-align:right;line-height:1;flex:none}
.saha-sayac b{font-size:28px;font-weight:900;font-variant-numeric:tabular-nums}
.saha-sayac small{font-size:18px;font-weight:900;color:var(--ink-3)}
.saha-sayac span{display:block;font-size:11px;color:var(--ink-3);margin-top:3px}
.saha-bar{height:8px;border-radius:99px;background:var(--surface-3);overflow:hidden}
.saha-bar i{display:block;height:100%;background:var(--red);border-radius:99px;transition:width .4s}

/* araç kartı, plaka, koltuklar, konum anahtarı */
.saha-arac{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2)}
.saha-arac-ust{display:flex;align-items:center;gap:10px}
.saha-plaka{display:inline-flex;align-items:stretch;height:30px;border:1.5px solid #111;border-radius:5px;background:#fff;overflow:hidden;flex:none}
.saha-plaka i{width:12px;background:#1F4FA8;color:#fff;display:flex;align-items:flex-end;justify-content:center;font-size:6px;font-weight:800;padding-bottom:2px;font-style:normal}
.saha-plaka b{padding:0 9px;display:flex;align-items:center;font-size:17px;font-weight:800;letter-spacing:.06em;color:#111;white-space:nowrap;font-variant-numeric:tabular-nums}
.saha-arac-metin{display:flex;flex-direction:column;align-items:flex-start;gap:1px;line-height:1.2;min-width:0;border:0;background:none;padding:6px 0;margin:-6px 0;text-align:left;color:var(--ink);cursor:pointer;touch-action:manipulation;flex:1}
.saha-arac-doluluk{font-size:13px;font-weight:800;white-space:nowrap}
.saha-arac-model{font-size:11.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.saha-durum{font-weight:800}
.saha-durum.k-hazir{color:var(--green)}
.saha-durum.k-yolda{color:var(--amber-ink)}
.saha-durum.k-fuarda{color:var(--violet)}
.saha-durum.k-mola{color:var(--ink-2)}
.saha-durum.k-arizali{color:var(--amber-ink);text-decoration:underline}
.saha-koltuk{margin-left:auto;display:flex;flex-wrap:wrap;gap:3px;justify-content:flex-end;max-width:66px;flex:none}
.saha-koltuk i{width:12px;height:18px;border-radius:3px;border:1.5px solid var(--ink);box-sizing:border-box}
.saha-koltuk i.dolu{background:var(--ink)}
.saha-konum{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0;border:0;background:none;color:var(--ink);text-align:left;cursor:pointer;touch-action:manipulation}
.saha-konum-yazi{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.saha-konum-baslik{font-size:15px;font-weight:800}
.saha-konum-satir{font-size:12px;font-weight:600;color:var(--amber-ink)}
.saha-konum.acik .saha-konum-satir{color:var(--green)}
.saha-sw{margin-left:auto;width:58px;height:34px;border-radius:99px;padding:3px;background:var(--line-2);display:flex;justify-content:flex-start;flex:none;box-sizing:border-box;transition:background .15s}
.saha-konum.acik .saha-sw{background:var(--green);justify-content:flex-end}
.saha-sw i{width:28px;height:28px;border-radius:99px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);display:block}
.saha-uyari{display:flex;gap:8px;align-items:flex-start;padding:9px 11px;border-radius:10px;border:1.5px solid var(--amber);background:var(--amber-soft);color:var(--amber-ink);font-size:12.5px;font-weight:700;line-height:1.35}
.saha-uyari svg{width:18px;height:18px;flex:none;color:var(--amber)}

/* sıradaki durak */
.saha-sira{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:14px;border:2px solid var(--ink);background:var(--surface)}
.saha-sira-ust{display:flex;align-items:center;gap:8px}
.saha-sira-etiket{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:900;letter-spacing:.12em;color:var(--red);white-space:nowrap}
.saha-sira-etiket.yesil{color:var(--green)}
.saha-sira-etiket svg{width:16px;height:16px}
.saha-sira-saat{margin-left:auto;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}
.saha-sira-kimlik{display:flex;flex-direction:column;gap:2px}
.saha-sira-ad{font-size:20px;font-weight:900;line-height:1.15}
.saha-sira-adres{font-size:12.5px;color:var(--ink-2);line-height:1.35}
.saha-sira-adres b{color:var(--ink)}
.saha-sira.bitti{border-color:var(--green);background:var(--green-soft)}
.saha-eta{display:flex;gap:6px}
.saha-eta>div{padding:7px 9px;border-radius:9px;background:var(--surface-3);display:flex;flex-direction:column;line-height:1.15;min-width:0}
.saha-eta>div:first-child{flex:1}
.saha-eta small{font-size:10.5px;font-weight:700;color:var(--ink-3);text-transform:uppercase}
.saha-eta b{font-size:16px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
.saha-cd-izgara{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.saha-cd{height:56px;border-radius:11px;font-size:13.5px;font-weight:900;letter-spacing:.01em;white-space:nowrap;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0 4px;cursor:pointer;touch-action:manipulation;transition:transform .06s}
.saha-cd:active:not(:disabled){transform:scale(.97)}
.saha-cd .alt{font-size:10.5px;font-weight:700;opacity:.85;font-variant-numeric:tabular-nums}
.saha-cd:empty{display:none}
.saha-cd.genis{grid-column:span 2}
.saha-cd.bitti{background:var(--green-soft);color:var(--green);border:1.5px solid var(--green);cursor:default}
.saha-cd.sira{background:var(--red);color:var(--on-red);border:0}
.saha-cd.sira.son{background:var(--violet)}
.saha-cd.kilit{background:var(--surface);color:var(--ink-3);border:1.5px dashed var(--line-2);opacity:.7;cursor:default}
.saha-cd-bilgi{font-size:12.5px;font-weight:700;color:var(--green);text-align:center}
.saha-wa-dugme{height:44px;border-radius:10px;border:1.5px solid var(--line-2);background:var(--surface);color:var(--ink);font-size:14px;font-weight:800;cursor:pointer;touch-action:manipulation}
.saha-wa{display:flex;flex-direction:column;gap:6px;padding:9px;border-radius:10px;background:var(--surface-3)}
.saha-wa-balon{background:var(--surface);border-radius:4px 12px 12px 12px;padding:9px 11px;font-size:13.5px;line-height:1.45}
.saha-wa-gonder{align-self:flex-end;height:36px;padding:0 14px;border-radius:9px;background:var(--ink);color:var(--surface);display:flex;align-items:center;font-size:13px;font-weight:800}
.saha-wa-yok{font-size:12.5px;font-weight:600;color:var(--ink-3)}

/* liste ve kart */
.saha-govde{padding:12px 12px calc(96px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px}
.saha-liste{display:flex;flex-direction:column;gap:10px}
.saha-liste:empty,.saha-govde>div:empty{display:none}
.saha-bolum{display:flex;align-items:center;gap:8px;min-height:24px;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin:6px 2px 0}
.saha-ipucu{font-size:13px;color:var(--ink-3);text-align:center;margin:2px 8px 0;font-weight:600}
.saha-kart{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow)}
.saha-kart.gecikti{border-color:var(--amber)}
.saha-kart-ust{display:flex;align-items:center;gap:8px}
.saha-kart-sag{margin-left:auto}
.saha-saat{font-size:24px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--ink)}
.saha-saat.belirsiz{font-size:13px;letter-spacing:.04em;color:var(--red);border:1.5px dashed var(--red);border-radius:7px;padding:4px 7px}
.saha-kart.kucuk .saha-saat:not(.belirsiz){font-size:20px}
.saha-kimlik{display:flex;flex-direction:column;gap:3px}
.saha-ad{font-size:19px;font-weight:800;line-height:1.2}
.saha-firma{font-size:13px;color:var(--ink-2);line-height:1.35}
.saha-adres{font-size:13px;color:var(--ink-2);line-height:1.35}
.saha-adres b{color:var(--ink)}
.saha-rozetler{display:flex;flex-wrap:wrap;gap:6px}
.saha-meta{font-size:12.5px;font-weight:600;color:var(--ink-3);line-height:1.35}
.saha-alma{padding:8px 10px;border-radius:9px;border:1.5px solid var(--red);background:var(--red-soft);font-size:13.5px;font-weight:700;line-height:1.35}
.saha-alma span{color:var(--red);font-size:11px;letter-spacing:.08em;white-space:nowrap}
.saha-evrak{padding:8px 10px;border-radius:9px;border:1.5px solid var(--yellow);background:var(--yellow-soft);color:var(--yellow-ink);font-size:13px;font-weight:700;line-height:1.35}
.saha-karsilayan{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;background:var(--green-soft);color:var(--green);font-size:13px;font-weight:800;line-height:1.3}
.saha-karsilayan span{display:grid;place-items:center;flex:none}
.saha-karsilayan svg{width:16px;height:16px;stroke-width:3}
.saha-karsila{height:46px;border-radius:11px;border:1.5px solid var(--red-line);background:var(--red-soft);color:var(--red);font-size:15px;font-weight:800;cursor:pointer;touch-action:manipulation;transition:transform .06s}
.saha-karsila.ben{background:var(--red);border-color:var(--red);color:var(--on-red)}
.saha-karsila:active:not(:disabled){transform:scale(.98)}
.saha-karsila:disabled{opacity:.5;cursor:default}
.saha-ikili{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.saha-a{height:50px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;text-decoration:none;cursor:pointer;border:0;touch-action:manipulation;font-family:inherit}
.saha-a.koyu{background:var(--ink);color:var(--surface)}
.saha-a.cizgi{border:1.5px solid var(--line-2);color:var(--ink);background:transparent}
.saha-a.pasif{border:1.5px dashed var(--line-2);color:var(--ink-3);cursor:default}
.saha-adimlar{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.saha-adim{grid-column:span 2;height:52px;border-radius:11px;font-size:14px;font-weight:800;line-height:1.1;padding:0 2px;cursor:pointer;touch-action:manipulation;border:1.5px solid var(--line-2);background:var(--surface);color:var(--ink);transition:transform .06s}
.saha-adim:nth-child(n+4){grid-column:span 3}
.saha-adimlar.kurul .saha-adim{grid-column:span 3}
.saha-b.g-oy-bekliyor{background:var(--amber-soft);color:var(--amber-ink);border-color:var(--amber)}
.saha-adim:active{transform:scale(.97)}
.saha-adim.r-arandi{--c:var(--blue);--s:var(--blue-soft);--k:var(--blue)}
.saha-adim.r-yolda{--c:var(--amber);--s:var(--amber-soft);--k:var(--amber-ink)}
.saha-adim.r-fuarda{--c:var(--violet);--s:var(--violet-soft);--k:var(--violet)}
.saha-adim.r-oy{--c:var(--green);--s:var(--green-soft);--k:var(--green)}
.saha-adim.gecti{background:var(--s);color:var(--k);border-color:var(--s)}
.saha-adim.simdi{background:var(--c);color:#fff;border-color:var(--c)}
.saha-flash{align-self:center;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--green);animation:smIn .15s ease-out}
.saha-flash i{width:7px;height:7px;border-radius:99px;background:var(--green)}
.saha-rota{margin-left:auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:99px;background:var(--ink);color:var(--surface);letter-spacing:0;text-transform:none;font-size:13.5px;font-weight:800}
.saha-rota svg{width:18px;height:18px}
.saha-bos-kucuk{display:flex;gap:12px;align-items:center;padding:14px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink-3)}
.saha-bos-kucuk svg{width:28px;height:28px;flex:none}
.saha-bos-kucuk b{display:block;color:var(--ink);font-size:15px}
.saha-bos-kucuk span{display:block;font-size:14px;font-weight:600}

/* rozetler (tasarım rozet tabanı) */
.saha-b{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.03em;white-space:nowrap;box-sizing:border-box;line-height:1;border:1.5px solid transparent;font-variant-numeric:tabular-nums}
.saha-b.g-bekliyor{background:var(--gray-soft);color:var(--ink-2);border-color:var(--gray-soft)}
.saha-b.g-arandi{background:var(--blue-soft);color:var(--blue);border-color:var(--blue-soft)}
.saha-b.g-yolda{background:var(--amber-soft);color:var(--amber-ink);border-color:var(--amber-soft)}
.saha-b.g-fuarda{background:var(--violet-soft);color:var(--violet);border-color:var(--violet-soft)}
.saha-b.g-oy_kullandi{background:var(--green);color:#fff;border-color:var(--green)}
.saha-b.gecikti{background:var(--amber-soft);color:var(--amber-ink);border-color:var(--amber);animation:smPulse 1.6s ease-in-out infinite}
.saha-b.sn-bizde{background:var(--red);color:var(--on-red);border-color:var(--red)}
.saha-b.sn-yolda{background:transparent;color:var(--red);border-color:var(--red)}
.saha-b.sn-belirsiz{background:var(--gray-soft);color:var(--ink-2);border-color:var(--gray-soft)}
.saha-b.sn-karsi{background:var(--karsi);color:var(--karsi-ink);border-color:var(--karsi)}
.saha-b.sn-oy_yok{background:var(--surface-3);color:var(--ink-3);border-color:var(--line);text-decoration:line-through}
.saha-b.ul-servis,.saha-b.ul-kendi,.saha-b.ul-yok{background:transparent;color:var(--ink-2);border:1px solid var(--line-2);font-weight:600}
.saha-b.ul-yok{color:var(--amber-ink);border-color:var(--amber)}
.saha-b.iki-oy{background:var(--surface);color:var(--ink);border-color:var(--ink)}

/* masa / referans: segment, arama, çipler */
.saha-seg{display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:11px;background:var(--surface-3)}
.saha-seg button{height:40px;border:0;border-radius:9px;background:transparent;color:var(--ink-2);font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation}
.saha-seg button.aktif{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.saha-bilgi{display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border-radius:12px;background:var(--blue-soft);color:var(--ink);font-size:13.5px;font-weight:600;line-height:1.35}
.saha-bilgi svg{width:20px;height:20px;color:var(--blue);flex:none;margin-top:1px}
.saha-ara{position:relative}
.saha-ara>svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:var(--ink-3);pointer-events:none}
.saha-ara input{width:100%;height:50px;padding:0 50px 0 44px;border-radius:12px;border:1.5px solid var(--line-2);background:var(--surface);color:var(--ink);font:inherit;font-size:16px;font-weight:600;outline:none;-webkit-appearance:none;appearance:none}
.saha-ara input::-webkit-search-cancel-button{display:none}
.saha-ara input:focus{border-color:var(--red);box-shadow:0 0 0 3px var(--red-soft)}
.saha-ara-sil{position:absolute;right:2px;top:1px;width:48px;height:48px;border:0;background:transparent;color:var(--ink-3);display:grid;place-items:center;cursor:pointer}
.saha-ara-sil svg{width:18px;height:18px}
.saha-cipler{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -12px;padding:0 12px}
.saha-cipler.ic{margin:0 -18px;padding:0 18px}
.saha-cipler::-webkit-scrollbar{display:none}
.saha-cip{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:99px;border:1.5px solid var(--line-2);background:var(--surface);color:var(--ink);font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.saha-cip .say{font-weight:800;color:var(--ink-3);font-variant-numeric:tabular-nums}
.saha-cip.uyari .say{color:var(--amber-ink)}
.saha-cip.aktif{background:var(--ink);border-color:var(--ink);color:var(--surface)}
.saha-cip.aktif .say{color:var(--surface);opacity:.7}
.saha-btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 12px;border-radius:12px;border:1.5px solid var(--line-2);background:var(--surface);color:var(--ink);font-weight:800;font-size:15px;line-height:1.15;text-align:center;cursor:pointer;touch-action:manipulation}
.saha-btn:active{transform:scale(.98)}
.saha-btn.secili{color:#fff;border-color:transparent}
.saha-btn.secili.k-hazir{background:var(--green)}
.saha-btn.secili.k-yolda{background:var(--amber)}
.saha-btn.secili.k-fuarda{background:var(--violet)}
.saha-btn.secili.k-mola{background:var(--ink-2)}
.saha-btn.secili.k-arizali{background:var(--amber);color:#1a1200}
.saha-durum-izgara{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.saha-son{text-align:center;font-size:13px;font-weight:600;color:var(--ink-3);padding:8px 0}
.saha-bos{text-align:center;padding:48px 20px}
.saha-bos-ikon{width:76px;height:76px;border-radius:50%;background:var(--surface-3);color:var(--ink-3);display:grid;place-items:center;margin:0 auto 16px}
.saha-bos-ikon svg{width:36px;height:36px}
.saha-bos h2{margin:0 0 6px;font-size:20px;font-weight:900;letter-spacing:-.01em}
.saha-bos p{margin:0 auto;max-width:310px;font-size:15px;color:var(--ink-3);line-height:1.45}
.saha-bos .saha-btn{margin:18px auto 0;display:inline-flex}

/* alt sekme çubuğu: Liste · Bildirimler · Rapor · ATLAS */
.alt-sekme.saha-sekme{max-width:520px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:0;justify-content:normal;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--line)}
.saha-sekme a,.saha-sekme button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:50px;padding:0;border:0;border-radius:12px;background:none;font-size:11.5px;font-weight:700;color:var(--ink-3);cursor:pointer;touch-action:manipulation}
.saha-sekme a:active,.saha-sekme button:active{background:var(--surface-3)}
.saha-sekme a.aktif{color:var(--red)}
.saha-sekme svg{width:22px;height:22px}
.saha-rozet{position:absolute;top:0;left:calc(50% + 4px);min-width:20px;height:20px;box-sizing:border-box;padding:0 5px;border-radius:99px;background:var(--amber);color:#1a1200;border:2px solid var(--surface);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;line-height:1}
.saha-rozet.atlas{background:var(--red);color:var(--on-red)}

/* küçük bildirim */
.saha-mini{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));z-index:125;transform:translate(-50%,-8px);opacity:0;pointer-events:none;display:inline-flex;align-items:center;gap:6px;max-width:calc(100vw - 32px);padding:8px 14px;border-radius:99px;background:var(--karsi);color:#fff;font-weight:800;font-size:13.5px;box-shadow:var(--shadow-lg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .18s,transform .18s}
.saha-mini.goster{opacity:1;transform:translate(-50%,0)}
.saha-mini.yesil{background:var(--green)}
.saha-mini.uyari{background:var(--amber);color:#1a1200}
@media (prefers-reduced-motion: reduce){.saha-b.gecikti,.saha-canli i,.saha-flash,.toast::after{animation:none!important}.saha-adim:active,.saha-cd:active{transform:none}}
`;
  document.head.appendChild(s);
}
