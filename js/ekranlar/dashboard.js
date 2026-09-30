// 72. Komite · Seçim Masası · DASHBOARD (ATLAS, 2026-09-30)
// Masaüstü, 3 metreden okunur. Hedef ilerlemesi, saatlik geliş grafiği (inline SVG, kütüphane yok), referans liderlik
// tablosu, "kesin bizde ama henüz gelmedi" eylem listesi, geciken alımlar, evrak uyarılı gelmeyenler, ilçe ve ulaşım.
// Her rakam store'dan hesaplanır; canlı olay gelince yeniden çizilir (kaydırma, filtre ve grafik imleci korunur).
import { store, esc, fmt, trBaslik, simdi, simdiDk, dakika, sayac, gecikme, ulasim, firmaListesi, aracOf } from '../core.js';
import { rozetDurum, rozetSinif, plakaHtml, kisiKartiAc } from '../ui.js';

const TERCIH_ANAHTAR = 'secim-dashboard-tercih';
const YOKSAY = new Set(['asistan', 'istek', 'profil']);
const GRAFIK_H = 340, PAD = { l: 48, r: 88, t: 34, b: 34 };
const DURUM_SIRA = { bekliyor: 0, arandi: 1, yolda: 2, fuarda: 3 };
const FILTRE_DURUM = [['hepsi', 'Hepsi'], ['bekliyor', 'Bekliyor'], ['arandi', 'Arandı'], ['yolda', 'Yolda'], ['fuarda', 'Fuarda']];
const ULASIM_AD = { kendi: 'Kendi gelecek', servis: 'Servisle alınacak', yok: 'Ulaşımı belirsiz' };

let kok = null, model = null, olcek = null, fare = null, ro = null, sonGenislik = 0;
const onbellek = new Map();   // bölüm -> son HTML: değişmeyen bölümün DOM'u yeniden kurulmaz (275 satırlık liste ~20 ms)
let tercih = { grup: false, durum: 'hepsi', ulasim: 'hepsi' };
try { tercih = { ...tercih, ...JSON.parse(localStorage.getItem(TERCIH_ANAHTAR) || '{}') }; } catch {}
// eski ya da bozuk kayıt listeyi sessizce boşaltmasın
if (!FILTRE_DURUM.some(([k]) => k === tercih.durum)) tercih.durum = 'hepsi';
if (!['hepsi', 'kendi', 'servis', 'yok'].includes(tercih.ulasim)) tercih.ulasim = 'hepsi';
tercih.grup = !!tercih.grup;
const tercihKaydet = () => { try { localStorage.setItem(TERCIH_ANAHTAR, JSON.stringify(tercih)); } catch {} };

// ---------------------------------------------------------------- yardımcılar
const r1 = n => Math.round(n * 10) / 10;
const iki = n => String(Math.floor(n)).padStart(2, '0');
const saatYaz = dk => `${iki(((dk % 1440) + 1440) % 1440 / 60)}:${iki(((dk % 60) + 60) % 60)}`;
const oyMu = f => f.durum === 'oy_kullandi';
const yuzdeYaz = (a, b) => `%${fmt.yuzde(a, b)}`;
// Referans adları: "HARUN BULAN" -> "Harun Bulan"; "İK", "63 MK" gibi kısaltmalar olduğu gibi kalır
const refAd = r => String(r || '').split(/\s+/).filter(Boolean).map(w => (w.length <= 2 ? w : trBaslik(w))).join(' ');
const kisiAd = f => trBaslik(f.yetkili || f.unvan || '');
const kolator = new Intl.Collator('tr', { sensitivity: 'base' });
// kaç eleman <= m (sıralı dizide ikili arama)
function kacTane(dizi, m) { let a = 0, b = dizi.length; while (a < b) { const o = (a + b) >> 1; if (dizi[o] <= m) a = o + 1; else b = o; } return a; }
function guzelAdim(tepe, adet = 5) { const kaba = Math.max(1, tepe / adet); const us = 10 ** Math.floor(Math.log10(kaba)); const n = kaba / us; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * us; }
// aranabilir ilk numara: cep, 2. cep, sonra sabit hatlar ("232... - 232..." gibi çoklu metin)
function telSec(f) {
  for (const t of [f.cep, f.cep2, ...String(f.sabit_tel || '').split(/\s*[-/,;]\s*/)]) if (t && fmt.telLink(t)) return t;
  return null;
}
function ulasimRozet(f) {
  const u = ulasim(f);
  if (u === 'servis') return `<span class="rozet u-servis">Servis</span>`;
  if (u === 'kendi') return `<span class="rozet u-kendi">Kendi</span>`;
  return `<span class="rozet u-ulasimyok">Belirsiz</span>`;
}

// ---------------------------------------------------------------- MODEL: tüm rakamlar store'dan
function hesapla() {
  const hepsi = firmaListesi();
  const s = sayac();
  const hedef = Math.max(0, Number(s.hedef) || 0);
  const biz = hepsi.filter(f => f.oy_sinifi === 'bizde');

  // zaman ekseni (ayarlar.zaman) + prova saati (?saat=10:30) kayması
  const z = store.ayarlar.zaman || {};
  const bas = dakika(z.bas) ?? 540;
  let bit = dakika(z.bit) ?? 1020; if (bit <= bas) bit = bas + 480;
  const simdiT = simdi();
  const kayma = Math.abs(simdiT.getTime() - Date.now()) > 60000 ? simdiT.getTime() - Date.now() : 0;
  const gunBasi = new Date(simdiT); gunBasi.setHours(0, 0, 0, 0);
  const simdiD = simdiDk();

  // oy kullanma anı: olaylardaki son "oy kullandı"ya geçiş; olay yoksa (ya da store daha yeniyse) durum_zamani
  const giris = new Map(), cozuldu = new Set();
  for (const o of store.olaylar) {                       // en yeni başta
    if (o.tur !== 'durum' || !o.firma_id || cozuldu.has(o.firma_id)) continue;
    const y = String(o.yeni || '').startsWith('oy_kullandi'), e = String(o.eski || '').startsWith('oy_kullandi');
    if (y && e) continue;                                  // yalnız "kendi geldi" düzeltmesi, geçiş anı değil
    cozuldu.add(o.firma_id);
    if (y) giris.set(o.firma_id, o.zaman);
  }
  const dkOf = f => {
    const ts = giris.get(f.id) || f.durum_zamani || f.guncelleme;
    const t = ts ? new Date(ts).getTime() : NaN;
    return Number.isFinite(t) ? (t + kayma - gunBasi.getTime()) / 60000 : -Infinity;
  };
  const oyBiz = biz.filter(oyMu), oyHepsi = hepsi.filter(oyMu);
  const bizDk = oyBiz.map(dkOf).sort((a, b) => a - b);
  const topDk = oyHepsi.map(dkOf).sort((a, b) => a - b);

  const oran = Math.max(0, Math.min(1, (simdiD - bas) / (bit - bas)));
  const beklenen = Math.round(hedef * oran);
  const son30 = bizDk.filter(d => d > simdiD - 30 && d <= simdiD + 1).length;

  // referanslar (hedef = o referansın bizdeki sayısı, gelen = bunlardan oy kullanan)
  const refMap = new Map();
  for (const f of biz) {
    const k = f.referans || '';
    const x = refMap.get(k) || { ref: k, hedef: 0, gelen: 0, diger: 0 };
    x.hedef++; if (oyMu(f)) x.gelen++;
    refMap.set(k, x);
  }
  for (const f of oyHepsi) if (f.oy_sinifi !== 'bizde' && refMap.has(f.referans || '')) refMap.get(f.referans || '').diger++;
  const referanslar = [...refMap.values()]
    .map(x => ({ ...x, kalan: Math.max(0, x.hedef - x.gelen), yuzde: x.hedef ? x.gelen / x.hedef : 0 }))
    .sort((a, b) => b.yuzde - a.yuzde || b.gelen - a.gelen || b.hedef - a.hedef || (!a.ref - !b.ref) || kolator.compare(a.ref, b.ref));

  // ilçe
  const ilceMap = new Map();
  for (const f of biz) {
    const k = f.ilce || '';
    const x = ilceMap.get(k) || { ilce: k, hedef: 0, gelen: 0 };
    x.hedef++; if (oyMu(f)) x.gelen++; ilceMap.set(k, x);
  }
  const ilceler = [...ilceMap.values()].sort((a, b) => b.hedef - a.hedef || b.gelen - a.gelen || kolator.compare(a.ilce, b.ilce));

  // ulaşım
  const ul = { kendi: { hedef: 0, gelen: 0 }, servis: { hedef: 0, gelen: 0, saatli: 0, arac: 0, geciken: 0 }, yok: { hedef: 0, gelen: 0 } };
  for (const f of biz) {
    const u = ul[ulasim(f)]; u.hedef++; if (oyMu(f)) u.gelen++;
    if (ulasim(f) === 'servis') { if (f.tasima_saati) u.saatli++; if (f.arac_id) u.arac++; if (gecikme(f, simdiD) > 0) u.geciken++; }
  }

  const gelmedi = biz.filter(f => !oyMu(f));
  const geciken = hepsi.map(f => ({ f, dk: gecikme(f, simdiD) })).filter(x => x.dk > 0).sort((a, b) => b.dk - a.dk);
  const evrak = hepsi.filter(f => f.evrak_uyari && !oyMu(f) && !['karsi', 'oy_yok'].includes(f.oy_sinifi))
    .sort((a, b) => (a.oy_sinifi === 'bizde' ? 0 : 1) - (b.oy_sinifi === 'bizde' ? 0 : 1) || kolator.compare(a.yetkili || a.unvan || '', b.yetkili || b.unvan || ''));

  return {
    s, hedef, elle: store.ayarlar.hedef?.elle != null, bas, bit, simdiD, kayma, beklenen, son30,
    bizDk, topDk, referanslar, ilceler, ul, gelmedi, geciken, evrak,
    bizKendi: biz.filter(f => f.kendi_geldi).length,
    bizFuarda: biz.filter(f => f.durum === 'fuarda').length,
    bizYolda: biz.filter(f => f.durum === 'yolda').length,
  };
}

// ---------------------------------------------------------------- stil (bir kez)
function stilEkle() {
  if (document.querySelector('style[data-ekran="dashboard"]')) return;
  const st = document.createElement('style'); st.dataset.ekran = 'dashboard';
  st.textContent = `
.db { --db-biz: var(--kirmizi); --db-top: var(--mavi); font-size: 15px; }
:root[data-tema="koyu"] .db { --db-biz: #E0364F; --db-top: #4C82F0; }
.db .sayfa-baslik { margin-bottom: 14px; }
.db .sayfa-baslik h1 { font-size: 28px; }
.db-canli { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--metin-2); }
.db-canli::before { content: ''; width: 9px; height: 9px; border-radius: 50%; background: var(--yesil); box-shadow: 0 0 0 3px var(--yesil-acik); animation: nabiz 2s infinite; }
.db-canli.kopuk { color: var(--turuncu); }
.db-canli.kopuk::before { background: var(--turuncu); box-shadow: 0 0 0 3px var(--turuncu-acik); animation-duration: 1s; }
.db .kart-baslik { font-size: 15px; padding: 14px 18px; flex-wrap: wrap; }
.db .kart-baslik .alt { font-size: 12.5px; }
.db-izgara { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; margin-top: 16px; align-items: stretch; }
.db-s8 { grid-column: span 8; min-width: 0; } .db-s4 { grid-column: span 4; min-width: 0; } .db-s12 { grid-column: 1 / -1; min-width: 0; }
.db-kaydir { overflow: auto; overscroll-behavior: contain; }
.db-bos-iyi { padding: 22px 16px; text-align: center; color: var(--yesil); font-weight: 800; }

/* kahraman: hedef ilerlemesi */
.db-kahraman { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 28px; padding: 22px 26px 24px; }
.db-etiket { font-size: 13px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--metin-3); display: flex; align-items: center; gap: 8px; }
.db-dev { display: flex; align-items: baseline; gap: 14px; line-height: .92; margin: 10px 0 18px; flex-wrap: wrap; }
.db-dev-sayi { font-size: clamp(76px, 8.4vw, 140px); font-weight: 900; letter-spacing: -.045em; color: var(--kirmizi); }
.db-dev-hedef { font-size: clamp(30px, 3.1vw, 52px); font-weight: 800; color: var(--metin-3); letter-spacing: -.02em; }
.db-dev-yuzde { margin-left: auto; font-size: clamp(44px, 4.6vw, 78px); font-weight: 900; letter-spacing: -.035em; color: var(--metin); }
.db-kc { position: relative; height: 20px; border-radius: 999px; background: var(--kirmizi-acik); }
.db-kc > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--kirmizi); border-radius: 999px; transition: width .5s; }
.db-kc > b { position: absolute; top: -7px; bottom: -7px; width: 3px; margin-left: -1.5px; background: var(--metin); border-radius: 2px; box-shadow: 0 0 0 2px var(--yuzey); }
.db-tempo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; font-size: 15px; font-weight: 600; color: var(--metin-2); }
.db-tempo b { color: var(--metin); font-weight: 900; }
.db-fark { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; font-weight: 900; font-size: 16px; }
.db-fark.iyi { background: var(--yesil-acik); color: var(--yesil); }
.db-fark.kotu { background: var(--turuncu-acik); color: var(--turuncu); }
.db-fark.notr { background: var(--yuzey-3); color: var(--metin-2); }
.db-kutular { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-content: center; }
.db-kutu { background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: var(--r-2); padding: 12px 14px; min-width: 0; }
.db-kutu .e { font-size: 11.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--metin-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-kutu .d { font-size: 40px; font-weight: 900; letter-spacing: -.03em; line-height: 1.05; margin-top: 4px; }
.db-kutu .a { font-size: 12.5px; color: var(--metin-3); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-kutu.uyari { background: var(--turuncu-acik); border-color: var(--turuncu); }
.db-kutu.uyari .d, .db-kutu.uyari .e { color: var(--turuncu); }
.db-kutu.iyi .d { color: var(--yesil); }

/* grafik */
.db-lejant { display: flex; gap: 16px; font-size: 12.5px; font-weight: 700; color: var(--metin-2); flex-wrap: wrap; }
.db-lejant span { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.db-lejant i { display: inline-block; width: 18px; height: 0; border-top: 2.5px solid; border-radius: 2px; }
.db-lejant i.biz { border-color: var(--db-biz); } .db-lejant i.top { border-color: var(--db-top); border-top-width: 2px; }
.db-lejant i.tem { border-color: var(--db-biz); border-top-style: dashed; opacity: .6; border-top-width: 2px; }
.db-grafik { position: relative; padding: 6px 8px 0 4px; }
.db-grafik svg { display: block; width: 100%; height: auto; overflow: visible; outline: none; }
.db-grafik svg:focus-visible { box-shadow: 0 0 0 3px var(--kirmizi-acik); border-radius: 8px; }
.db-g-izgara { stroke: var(--cizgi); stroke-width: 1; shape-rendering: crispEdges; }
.db-g-eksen { stroke: var(--cizgi-2); stroke-width: 1; shape-rendering: crispEdges; }
.db-g-yazi { fill: var(--metin-3); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.db-g-hedef-yazi { fill: var(--metin-2); font-size: 12px; font-weight: 800; letter-spacing: .04em; }
.db-g-biz { fill: none; stroke: var(--db-biz); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.db-g-alan { fill: var(--db-biz); opacity: .1; }
.db-g-top { fill: none; stroke: var(--db-top); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.db-g-tempo { fill: none; stroke: var(--db-biz); stroke-width: 1.75; stroke-dasharray: 6 5; opacity: .5; }
.db-g-simdi { stroke: var(--metin-2); stroke-width: 1; shape-rendering: crispEdges; }
.db-g-hap { fill: var(--koyu); } :root[data-tema="koyu"] .db-g-hap { fill: var(--yuzey-3); }
.db-g-hap-yazi { fill: #fff; font-size: 11.5px; font-weight: 800; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
.db-g-n-biz { fill: var(--db-biz); stroke: var(--yuzey); stroke-width: 2; }
.db-g-n-top { fill: var(--db-top); stroke: var(--yuzey); stroke-width: 2; }
.db-g-n-tem { fill: var(--yuzey); stroke: var(--db-biz); stroke-width: 2; opacity: .8; }
.db-g-deger { fill: var(--metin); font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums; }
.db-g-deger-alt { fill: var(--metin-3); font-size: 12px; font-weight: 700; }
.db-g-imlec { stroke: var(--metin-3); stroke-width: 1; shape-rendering: crispEdges; }
.db-g-bilgi { fill: var(--metin-2); font-size: 15px; font-weight: 800; }
.db-g-perde { fill: var(--yuzey); opacity: .94; }
.db-ipucu { position: absolute; top: 40px; pointer-events: none; background: var(--yuzey); border: 1px solid var(--cizgi-2); box-shadow: var(--golge-2); border-radius: 10px; padding: 9px 12px; font-size: 13px; min-width: 190px; z-index: 3; }
.db-ipucu .s { font-weight: 800; color: var(--metin-3); font-size: 12px; letter-spacing: .06em; margin-bottom: 6px; }
.db-ipucu .r { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.db-ipucu .r i { width: 14px; height: 0; border-top: 2.5px solid; flex: none; }
.db-ipucu .r b { font-size: 16px; font-weight: 900; min-width: 34px; font-variant-numeric: tabular-nums; }
.db-ipucu .r span { color: var(--metin-3); font-weight: 600; }
.db-saatler { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; padding: 10px 14px 14px; border-top: 1px solid var(--cizgi); }
.db-saat { text-align: center; border-radius: 8px; padding: 6px 2px 5px; min-width: 0; }
.db-saat.simdi { background: var(--kirmizi-acik); }
.db-saat .s { font-size: 11px; font-weight: 800; color: var(--metin-3); letter-spacing: .05em; font-variant-numeric: tabular-nums; }
.db-saat .n { font-size: 20px; font-weight: 900; line-height: 1.2; font-variant-numeric: tabular-nums; }
.db-saat .t { font-size: 11px; color: var(--metin-3); font-weight: 600; white-space: nowrap; }
.db-saat.gelecek .n { color: var(--metin-3); opacity: .45; }

/* referans liderlik */
.db-lider { display: flex; flex-direction: column; contain: size; min-height: 440px; }
.db-lider .db-kaydir { flex: 1 1 0; min-height: 0; }
.db-tablo { font-size: 14px; }
.db-tablo th { padding: 9px 8px; }
.db-tablo td { padding: 9px 8px; }
.db-lider .db-tablo th { padding: 9px 6px; letter-spacing: .03em; }
.db-lider .db-tablo td { padding: 9px 6px; }
.db-lider .db-tablo th:first-child, .db-lider .db-tablo td:first-child { padding-left: 14px; }
.db-tablo th.num, .db-tablo td.num { text-align: right; font-variant-numeric: tabular-nums; }
.db-tablo td.num { font-weight: 700; }
.db-tablo .sira { color: var(--metin-3); font-weight: 800; width: 24px; font-variant-numeric: tabular-nums; }
.db-tablo .ref { font-weight: 800; line-height: 1.25; }
.db-tablo .ref small { display: block; font-size: 11.5px; color: var(--metin-3); font-weight: 600; }
.db-tablo td.yuzde { font-weight: 900; font-size: 16px; }
.db-tablo tr.tamam td.yuzde { color: var(--yesil); }
.db-mini { width: 52px; height: 8px; border-radius: 999px; background: var(--gri-acik); overflow: hidden; }
.db-mini > i { display: block; height: 100%; background: var(--kirmizi); border-radius: 999px; }
.db-mini.tamam > i { background: var(--yesil); }
.db-tablo tr:focus-visible td { background: var(--kirmizi-acik); outline: none; }

/* gelmedi listesi */
.db-baslik-buyuk { font-size: 17px; font-weight: 900; letter-spacing: -.01em; }
.db-kontrol { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.db-kontrol .girdi { height: 30px; width: auto; font-size: 12.5px; font-weight: 600; padding: 0 8px; }
.db-grup-dugme { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: var(--metin-2); cursor: pointer; background: none; border: 0; padding: 0; }
.db-gelmedi { display: flex; flex-direction: column; }
.db-gelmedi .db-kaydir { flex: 1 1 auto; max-height: 660px; }
.db-ad { font-weight: 800; }
.db-firma { font-size: 12px; color: var(--metin-3); font-weight: 500; max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-tel-h { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.db-tel { font-weight: 700; font-variant-numeric: tabular-nums; }
.db-rozetler { display: flex; gap: 4px; flex-wrap: wrap; }
/* sabit sütunlar: Kişi kalan genişliği alır, uzun ad ve ünvan kırpılır; tablo kartın dışına taşmaz */
.db-gt { table-layout: fixed; min-width: 760px; }
.db-gt th.w-ref { width: 130px; } .db-gt th.w-tel { width: 186px; } .db-gt th.w-ul { width: 124px; }
.db-gt th.w-saat { width: 70px; } .db-gt th.w-durum { width: 152px; }
.db-gt td { overflow: hidden; }
.db-gt .db-ad, .db-gt .db-firma, .db-kes { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: none; }
.db-gec-k { font-size: 12.5px; font-weight: 900; color: var(--turuncu); white-space: nowrap; margin-top: 2px; }
.db-gt tr.db-gec-satir td:first-child { box-shadow: inset 3px 0 0 var(--turuncu); }
.db-tablo tr.db-grup td { background: var(--yuzey-3); font-weight: 800; padding: 8px 12px; }
.db-tablo tr.db-grup td small { color: var(--metin-3); font-weight: 600; margin-left: 8px; font-size: 12px; }
.db-tablo tr.db-grup[data-ref=""] { cursor: default; }

/* yan listeler */
.db-yan { display: flex; flex-direction: column; gap: 16px; min-width: 0; contain: size; min-height: 560px; }
.db-yan > .kart { display: flex; flex-direction: column; min-height: 0; }
.db-yan > .db-yan-ust { flex: 0 1 auto; max-height: 55%; }
.db-yan > .db-yan-alt { flex: 1 1 0; min-height: 150px; }
.db-yan .db-kaydir { flex: 1 1 auto; min-height: 0; }
.db-satir { display: flex; gap: 12px; padding: 11px 16px; border-bottom: 1px solid var(--cizgi); cursor: pointer; }
.db-satir:last-child { border-bottom: 0; }
.db-satir:hover, .db-satir:focus-visible { background: var(--yuzey-2); outline: none; }
.db-satir-ana { flex: 1; min-width: 0; }
.db-satir-alt { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 5px; font-size: 12px; }
.db-satir-sag { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.db-gec { font-size: 20px; font-weight: 900; color: var(--turuncu); line-height: 1; font-variant-numeric: tabular-nums; }
.db-evrak-yazi { font-size: 12.5px; font-weight: 700; color: var(--sari); margin-top: 3px; }
.db-evrak-yazi::before { content: '⚠ '; }
.db-zayif { color: var(--metin-3); font-size: 12px; font-weight: 600; }

/* ilçe + ulaşım */
.db-cubuklar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: column; gap: 10px 32px; }
.db-cs { display: grid; grid-template-columns: 112px minmax(0, 1fr) 96px; align-items: center; gap: 12px; font-size: 14px; }
.db-cs .ad { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-cs .iz { position: relative; height: 14px; }
.db-cs .iz > span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--kirmizi-acik); }
.db-cs .iz > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--kirmizi); }
.db-cs .sy { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.db-cs .sy small { color: var(--metin-3); font-weight: 600; font-size: 12px; }
.db-cs-lejant { display: flex; gap: 16px; font-size: 12px; font-weight: 700; color: var(--metin-2); }
.db-cs-lejant span { display: inline-flex; align-items: center; gap: 6px; }
.db-cs-lejant i { width: 12px; height: 10px; border-radius: 3px; display: inline-block; }
.db-ul { display: flex; flex-direction: column; gap: 18px; }
.db-ul-ust { display: flex; align-items: baseline; gap: 10px; margin-bottom: 7px; }
.db-ul-ad { font-weight: 800; font-size: 15px; }
.db-ul-say { margin-left: auto; font-size: 26px; font-weight: 900; letter-spacing: -.02em; }
.db-ul-say small { font-size: 15px; color: var(--metin-3); font-weight: 700; }
.db-ul-yuzde { font-weight: 900; font-size: 15px; color: var(--metin-2); min-width: 48px; text-align: right; }
.db-ul .cubuk { height: 10px; }
.db-ul-not { font-size: 12.5px; color: var(--metin-3); font-weight: 600; margin-top: 6px; }

@media (max-width: 1280px) {
  .db-kahraman { grid-template-columns: 1fr; }
}
@media (max-width: 1100px) {
  .db-s8, .db-s4 { grid-column: 1 / -1; }
  .db-lider { contain: none; min-height: 0; }
  .db-lider .db-kaydir { flex: none; max-height: 520px; }
  .db-cubuklar { grid-template-columns: 1fr; grid-auto-flow: row; grid-template-rows: none !important; }
  .db-yan { contain: none; min-height: 0; }
  .db-yan > .db-yan-ust, .db-yan > .db-yan-alt { flex: none; max-height: none; }
  .db-yan .db-kaydir { max-height: 330px; }
}
@media (max-width: 640px) {
  .db-kutular { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .db-kutu .d { font-size: 30px; }
  .db-kutu .e, .db-kutu .a { white-space: normal; }
  .db-kahraman { padding: 16px; }
  .db-saatler { overflow-x: auto; grid-auto-columns: minmax(64px, 1fr); }
  .db-lider .db-tablo th:last-child, .db-lider .db-tablo td:last-child { display: none; }
  /* gelmedi listesi telefonda satır başına küçük kart olur (yana kaydırma yok) */
  .db-gt { min-width: 0; table-layout: auto; display: block; }
  .db-gt thead { display: none; }
  .db-gt tbody { display: block; }
  .db-gt tr[data-kisi] { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "kisi saat" "tel durum" "ul ref"; gap: 6px 10px; padding: 10px 14px; border-bottom: 1px solid var(--cizgi); }
  .db-gt tr[data-kisi] td { display: block; padding: 0; border: 0; overflow: visible; background: none !important; }
  .db-gt td.db-kisi-td { grid-area: kisi; max-width: none; min-width: 0; overflow: hidden; }
  .db-gt td.db-saat-td { grid-area: saat; text-align: right; }
  .db-gt td.db-tel-td { grid-area: tel; }
  .db-gt td.db-durum-td { grid-area: durum; }
  .db-gt td.db-durum-td .db-rozetler { justify-content: flex-end; }
  .db-gt td.db-ul-td { grid-area: ul; }
  .db-gt td.db-kes { grid-area: ref; text-align: right; align-self: center; font-size: 12.5px; }
  .db-gt tr.db-grup, .db-gt tr.db-grup td { display: block; }
  .db-gt tr.db-gec-satir td:first-child { box-shadow: none; }
  .db-gt tr.db-gec-satir { box-shadow: inset 3px 0 0 var(--turuncu); }
}`;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------- iskelet (bir kez)
function iskeletHtml() {
  const secim = store.ayarlar.secim || {};
  let tarih = '';
  if (secim.tarih) { const d = new Date(`${secim.tarih}T12:00:00`); if (!isNaN(d)) tarih = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }); }
  const z = store.ayarlar.zaman || {};
  return `
  <div class="db">
    <div class="sayfa-baslik">
      <div>
        <h1>Dashboard</h1>
        <div class="alt">${esc([tarih, secim.yer || 'Fuar İzmir, Gaziemir', z.bas && z.bit ? `oy verme ${z.bas}-${z.bit}` : ''].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="sag" style="align-items:center;gap:14px">
        <span class="db-canli" data-canli>Canlı</span>
        <button class="btn btn-kucuk" data-tam title="Ekranı tam ekrana al (TV / projeksiyon)">⛶ Tam ekran</button>
      </div>
    </div>

    <section class="kart db-kahraman" data-b="kahraman"></section>

    <div class="db-izgara">
      <section class="kart db-s8">
        <div class="kart-baslik">Saatlik geliş <span class="alt">kümülatif oy kullanan</span>
          <div class="sag db-lejant">
            <span><i class="biz"></i>Bizde oy kullanan</span>
            <span><i class="top"></i>Toplam oy kullanan</span>
            <span><i class="tem"></i>Hedef temposu</span>
          </div>
        </div>
        <div class="db-grafik" data-grafik>
          <div data-svg></div>
          <div class="db-ipucu" data-ipucu hidden></div>
        </div>
        <div class="db-saatler" data-b="saatler" aria-label="Saat saat bizde oy kullanan"></div>
      </section>

      <section class="kart db-s4 db-lider">
        <div class="kart-baslik">Referans liderlik <span class="alt">bizdeki hedefe göre</span><div class="sag db-zayif" data-b="lider-say"></div></div>
        <div class="db-kaydir" data-kaydir="lider"><div data-b="lider"></div></div>
      </section>

      <section class="kart db-s8 db-gelmedi">
        <div class="kart-baslik">
          <span class="db-baslik-buyuk">Kesin bizde ama henüz gelmedi</span> <span class="rozet-sayi" data-b="gelmedi-say">0</span>
          <div class="sag db-kontrol">
            <div class="cipler" data-b="gelmedi-cip"></div>
            <select class="girdi" data-ulasim-f title="Ulaşım türü">
              <option value="hepsi">Tüm ulaşım</option><option value="kendi">Kendi gelecek</option><option value="servis">Servis</option><option value="yok">Ulaşımı belirsiz</option>
            </select>
            <button type="button" class="db-grup-dugme" data-grup><span class="anahtar ${tercih.grup ? 'acik' : ''}"></span>Referansa göre</button>
          </div>
        </div>
        <div class="db-kaydir" data-kaydir="gelmedi"><div data-b="gelmedi"></div></div>
      </section>

      <div class="db-s4 db-yan">
        <section class="kart db-yan-ust">
          <div class="kart-baslik">Geciken alımlar <span class="alt">servis saati geçti, yola çıkmadı</span><div class="sag" data-b="geciken-say"></div></div>
          <div class="db-kaydir" data-kaydir="geciken"><div data-b="geciken"></div></div>
        </section>
        <section class="kart db-yan-alt">
          <div class="kart-baslik">Evrak uyarılı, gelmeyenler<div class="sag" data-b="evrak-say"></div></div>
          <div class="db-kaydir" data-kaydir="evrak"><div data-b="evrak"></div></div>
        </section>
      </div>

      <section class="kart db-s8">
        <div class="kart-baslik">İlçe dağılımı <span class="alt">kesin bizde: hedef ve gelen</span>
          <div class="sag db-cs-lejant"><span><i style="background:var(--kirmizi-acik)"></i>Hedef</span><span><i style="background:var(--kirmizi)"></i>Gelen</span></div>
        </div>
        <div class="kart-govde" data-b="ilce"></div>
      </section>

      <section class="kart db-s4">
        <div class="kart-baslik">Ulaşım türü <span class="alt">kesin bizde</span></div>
        <div class="kart-govde" data-b="ulasim"></div>
      </section>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- bölümler
function kahramanHtml(m) {
  const s = m.s, yz = fmt.yuzde(s.oy_bizde, m.hedef);
  const basladi = m.simdiD >= m.bas, bitti = m.simdiD > m.bit;
  let tempo;
  if (!basladi) tempo = `<span class="db-fark notr">Oy verme henüz başlamadı</span><span>Başlangıç <b>${esc(saatYaz(m.bas))}</b> · bitiş <b>${esc(saatYaz(m.bit))}</b></span>`;
  else {
    const fark = s.oy_bizde - m.beklenen;
    const cip = fark > 0 ? `<span class="db-fark iyi">▲ ${fmt.sayi(fark)} önde</span>` : fark < 0 ? `<span class="db-fark kotu">▼ ${fmt.sayi(-fark)} geride</span>` : `<span class="db-fark notr">Tam tempoda</span>`;
    tempo = `${cip}<span>${bitti ? 'Oy verme süresi bitti' : `Bu saatte hedef temposu <b>${fmt.sayi(m.beklenen)}</b>`}</span>`;
  }
  const tempoIsaret = basladi && !bitti && m.hedef ? `<b style="left:${Math.min(100, (m.beklenen / m.hedef) * 100)}%" title="Hedef temposu: ${m.beklenen}"></b>` : '';
  const kutu = (etiket, deger, alt, sinif = '') => `<div class="db-kutu ${sinif}"><div class="e" title="${esc(etiket)}">${esc(etiket)}</div><div class="d">${deger}</div><div class="a" title="${esc(alt)}">${esc(alt)}</div></div>`;
  const disaridan = s.oy_kullandi - s.oy_bizde;
  return `
    <div>
      <div class="db-etiket">Bizde oy kullanan${m.elle ? ' <span class="rozet u-kendi" title="Hedef yönetim ekranından elle girildi">elle hedef</span>' : ''}</div>
      <div class="db-dev"><span class="db-dev-sayi">${fmt.sayi(s.oy_bizde)}</span><span class="db-dev-hedef">/ ${fmt.sayi(m.hedef)}</span><span class="db-dev-yuzde">%${yz}</span></div>
      <div class="db-kc" role="progressbar" aria-valuemin="0" aria-valuemax="${m.hedef}" aria-valuenow="${s.oy_bizde}"><i style="width:${Math.min(100, yz)}%"></i>${tempoIsaret}</div>
      <div class="db-tempo">${tempo}</div>
    </div>
    <div class="db-kutular">
      ${kutu('Toplam oy kullanan', fmt.sayi(s.oy_kullandi), disaridan > 0 ? `${fmt.sayi(disaridan)} kişi bizde dışı` : 'tüm sınıflar')}
      ${kutu('Kendi gelen', fmt.sayi(s.kendi_geldi), `bizde ${fmt.sayi(m.bizKendi)}`)}
      ${kutu('Kalan', fmt.sayi(s.kalan), s.kalan ? 'hedefe ulaşmak için' : 'hedef tamam', s.kalan ? '' : 'iyi')}
      ${kutu('Son 30 dakika', `+${fmt.sayi(m.son30)}`, 'bizde oy kullanan')}
      ${kutu('Fuarda, oy vermedi', fmt.sayi(m.bizFuarda), `bizde · yolda ${fmt.sayi(m.bizYolda)}`)}
      ${kutu('Geciken alım', fmt.sayi(m.geciken.length), m.geciken.length ? 'servis saati geçti' : 'gecikme yok', m.geciken.length ? 'uyari' : '')}
    </div>`;
}

function saatlerHtml(m) {
  const o = olcek; if (!o) return '';
  const ilkSaat = Math.floor(o.x0 / 60), sonSaat = Math.ceil(o.x1 / 60) - 1;
  const kova = new Map(), kovaTop = new Map(); let once = 0, onceTop = 0;
  for (const d of m.bizDk) { if (d < o.x0) once++; else { const h = Math.min(sonSaat, Math.floor(d / 60)); kova.set(h, (kova.get(h) || 0) + 1); } }
  for (const d of m.topDk) { if (d < o.x0) onceTop++; else { const h = Math.min(sonSaat, Math.floor(d / 60)); kovaTop.set(h, (kovaTop.get(h) || 0) + 1); } }
  const simdiSaat = Math.floor(m.simdiD / 60);
  const hucre = (etiket, n, t, sinif) => `<div class="db-saat ${sinif}" title="${esc(etiket)}: bizde ${n}, toplam ${t}"><div class="s">${esc(etiket)}</div><div class="n">${n ? '+' + fmt.sayi(n) : '0'}</div><div class="t">toplam ${fmt.sayi(t)}</div></div>`;
  let h = once || onceTop ? hucre('Önce', once, onceTop, '') : '';
  for (let s = ilkSaat; s <= sonSaat; s++) h += hucre(`${iki(s)}:00`, kova.get(s) || 0, kovaTop.get(s) || 0, s === simdiSaat ? 'simdi' : s > simdiSaat ? 'gelecek' : '');
  return h;
}

function liderHtml(m) {
  if (!m.referanslar.length) return `<div class="bos">Kesin bizde listesinde referans yok</div>`;
  const satirlar = m.referanslar.map((x, i) => {
    const yz = Math.round(x.yuzde * 100), tamam = x.hedef > 0 && x.kalan === 0;
    return `<tr ${x.ref ? `data-ref="${esc(x.ref)}" tabindex="0" title="${esc(refAd(x.ref))}: kişileri aç"` : ''} class="${tamam ? 'tamam' : ''}">
      <td class="sira">${i + 1}</td>
      <td class="ref">${esc(x.ref ? refAd(x.ref) : 'Referans yok')}${x.diger ? `<small>+${x.diger} bizde dışı oy</small>` : ''}</td>
      <td class="num">${fmt.sayi(x.hedef)}</td>
      <td class="num">${fmt.sayi(x.gelen)}</td>
      <td class="num yuzde">%${yz}</td>
      <td class="num">${tamam ? '✓' : fmt.sayi(x.kalan)}</td>
      <td><div class="db-mini ${tamam ? 'tamam' : ''}"><i style="width:${yz}%"></i></div></td>
    </tr>`;
  }).join('');
  return `<table class="tablo db-tablo"><thead><tr><th>#</th><th>Referans</th><th class="num">Hedef</th><th class="num">Gelen</th><th class="num">%</th><th class="num">Kalan</th><th></th></tr></thead><tbody>${satirlar}</tbody></table>`;
}

function gelmediFiltreli(m) {
  const ulf = tercih.ulasim || 'hepsi';
  const ulasimli = ulf === 'hepsi' ? m.gelmedi : m.gelmedi.filter(f => ulasim(f) === ulf);
  const sayilar = { hepsi: ulasimli.length }; for (const f of ulasimli) sayilar[f.durum] = (sayilar[f.durum] || 0) + 1;
  const liste = tercih.durum === 'hepsi' ? ulasimli : ulasimli.filter(f => f.durum === tercih.durum);
  // öncelik: geciken alım > bekliyor > arandı > yolda > fuarda > alım saati > ad (anahtarlar bir kez hesaplanır)
  const dk = m.simdiD;
  const sirali = liste.map(f => ({ f, g: gecikme(f, dk), d: DURUM_SIRA[f.durum] ?? 9, s: f.tasima_saati ? dakika(f.tasima_saati) : 9999, a: f.yetkili || f.unvan || '' }))
    .sort((x, y) => (y.g - x.g) || (x.d - y.d) || (x.s - y.s) || kolator.compare(x.a, y.a))
    .map(x => x.f);
  return { liste: sirali, sayilar };
}
// Satır: gecikme, alım saatinin altında turuncu "+N dk" olarak durur (Durum sütunu dar kalsın, tablo yana taşmasın)
function gelmediSatir(f, refSutun, dk) {
  const tel = telSec(f), a = aracOf(f), g = gecikme(f, dk);
  const uyari = [
    f.evrak_uyari ? `<span class="rozet u-evrak" title="${esc(f.evrak_uyari)}">Evrak</span>` : '',
    f.kisi_oy_sayisi > 1 ? `<span class="rozet u-2oy" title="Aynı kişi ${f.kisi_oy_sayisi} firmayla oy kullanıyor">${f.kisi_oy_sayisi} OY</span>` : '',
  ].join('');
  return `<tr data-kisi="${f.id}" tabindex="0"${g ? ' class="db-gec-satir"' : ''}>
    <td class="db-kisi-td"><div class="db-ad">${esc(kisiAd(f))}</div><div class="db-firma" title="${esc(f.unvan || '')}">${esc(f.unvan || '')}</div></td>
    ${refSutun ? `<td class="kalin db-kes" title="${esc(f.referans ? refAd(f.referans) : 'Referans yok')}">${esc(f.referans ? refAd(f.referans) : 'Referans yok')}</td>` : ''}
    <td class="db-tel-td">${tel ? `<div class="db-tel-h"><span class="db-tel">${esc(fmt.tel(tel))}</span><a class="btn btn-kucuk" href="${fmt.telLink(tel)}" title="${esc(fmt.tel(tel))} numarasını ara">📞 Ara</a></div>` : '<span class="db-zayif">Telefon yok</span>'}</td>
    <td class="db-ul-td"><div class="db-rozetler">${ulasimRozet(f)}${a ? ' ' + plakaHtml(a.plaka) : ''}</div></td>
    <td class="num db-saat-td">${f.tasima_saati ? `<b>${esc(fmt.saatKisa(f.tasima_saati))}</b>` : ''}${g ? `<div class="db-gec-k" title="Alım saati ${g} dakika geçti">+${g} dk</div>` : ''}</td>
    <td class="db-durum-td"><div class="db-rozetler">${rozetDurum(f)}${uyari}</div></td>
  </tr>`;
}
function gelmediHtml(m, liste) {
  if (!m.gelmedi.length) return m.s.bizde ? `<div class="db-bos-iyi">✓ Kesin bizde listesindeki herkes oy kullandı</div>` : `<div class="bos">Kesin bizde listesinde kimse yok</div>`;
  if (!liste.length) return `<div class="bos">Bu filtrede kimse yok</div>`;
  const bas = (ref) => `<thead><tr><th>Kişi</th>${ref ? '<th class="w-ref">Referans</th>' : ''}<th class="w-tel">Telefon</th><th class="w-ul">Ulaşım</th><th class="num w-saat">Saat</th><th class="w-durum">Durum</th></tr></thead>`;
  const dk = m.simdiD;
  if (!tercih.grup) return `<table class="tablo db-tablo db-gt">${bas(true)}<tbody>${liste.map(f => gelmediSatir(f, true, dk)).join('')}</tbody></table>`;
  const gruplar = new Map();
  for (const f of liste) { const k = f.referans || ''; if (!gruplar.has(k)) gruplar.set(k, []); gruplar.get(k).push(f); }
  const refBilgi = new Map(m.referanslar.map(x => [x.ref, x]));
  const sirali = [...gruplar.entries()].sort((a, b) => b[1].length - a[1].length || (!a[0] - !b[0]) || kolator.compare(a[0], b[0]));
  const govde = sirali.map(([k, fl]) => {
    const x = refBilgi.get(k);
    return `<tr class="db-grup" data-ref="${esc(k)}" ${k ? `tabindex="0" title="${esc(refAd(k))}: kişileri aç"` : ''}><td colspan="5">${esc(k ? refAd(k) : 'Referans yok')}<small>${fl.length} kişi gelmedi${x ? ` · gelen ${x.gelen} / ${x.hedef}` : ''}</small></td></tr>${fl.map(f => gelmediSatir(f, false, dk)).join('')}`;
  }).join('');
  return `<table class="tablo db-tablo db-gt">${bas(false)}<tbody>${govde}</tbody></table>`;
}
function gelmediCipHtml(sayilar) {
  return FILTRE_DURUM.map(([k, ad]) => `<button type="button" class="cip ${tercih.durum === k ? 'aktif' : ''}" data-dfiltre="${k}">${esc(ad)} <span class="say">${fmt.sayi(sayilar[k] || 0)}</span></button>`).join('');
}

function gecikenHtml(m) {
  if (!m.geciken.length) return `<div class="db-bos-iyi">✓ Geciken alım yok</div>`;
  return m.geciken.map(({ f, dk }) => {
    const a = aracOf(f), tel = telSec(f), soforTel = a?.sofor_tel && fmt.telLink(a.sofor_tel);
    return `<div class="db-satir" data-kisi="${f.id}" tabindex="0">
      <div class="db-satir-ana">
        <div class="db-ad">${esc(kisiAd(f))}</div><div class="db-firma">${esc(f.unvan || '')}</div>
        <div class="db-satir-alt">${a ? `${plakaHtml(a.plaka)} <span class="db-zayif">${esc(trBaslik(a.sofor_ad || ''))}</span>` : '<span class="rozet u-ulasimyok">Araç atanmadı</span>'}${f.rota_kod ? ` <span class="db-zayif">${esc(trBaslik(f.rota_kod))}</span>` : ''}</div>
      </div>
      <div class="db-satir-sag">
        <div class="db-gec">+${dk} dk</div><div class="db-zayif">alım ${esc(fmt.saatKisa(f.tasima_saati))}</div>
        <div style="display:flex;gap:4px">${soforTel ? `<a class="btn btn-kucuk" href="${soforTel}" title="Şoförü ara">Şoför</a>` : ''}${tel ? `<a class="btn btn-kucuk" href="${fmt.telLink(tel)}" title="Kişiyi ara">📞 Ara</a>` : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function evrakHtml(m) {
  if (!m.evrak.length) return `<div class="db-bos-iyi">✓ Evrak uyarılı bekleyen yok</div>`;
  return m.evrak.map(f => {
    const tel = telSec(f);
    return `<div class="db-satir" data-kisi="${f.id}" tabindex="0">
      <div class="db-satir-ana">
        <div class="db-ad">${esc(kisiAd(f))}</div><div class="db-firma">${esc(f.unvan || '')}</div>
        <div class="db-evrak-yazi">${esc(f.evrak_uyari)}</div>
      </div>
      <div class="db-satir-sag">
        <div class="db-rozetler" style="justify-content:flex-end">${f.oy_sinifi !== 'bizde' ? rozetSinif(f.oy_sinifi) : ''} ${rozetDurum(f)}</div>
        ${f.referans ? `<div class="db-zayif">${esc(refAd(f.referans))}</div>` : ''}
        ${tel ? `<a class="btn btn-kucuk" href="${fmt.telLink(tel)}">📞 Ara</a>` : ''}
      </div>
    </div>`;
  }).join('');
}

function ilceHtml(m) {
  if (!m.ilceler.length) return `<div class="bos">Veri yok</div>`;
  const tepe = Math.max(1, ...m.ilceler.map(x => x.hedef));
  return `<div class="db-cubuklar" style="grid-template-rows:repeat(${Math.ceil(m.ilceler.length / 2)}, auto)">${m.ilceler.map(x => `
    <div class="db-cs" title="${esc(trBaslik(x.ilce) || 'İlçe yok')}: hedef ${x.hedef}, gelen ${x.gelen}">
      <div class="ad">${esc(x.ilce ? trBaslik(x.ilce) : 'İlçe yok')}</div>
      <div class="iz"><span style="width:${(x.hedef / tepe) * 100}%"></span><i style="width:${(x.gelen / tepe) * 100}%"></i></div>
      <div class="sy">${fmt.sayi(x.gelen)} <small>/ ${fmt.sayi(x.hedef)} · %${fmt.yuzde(x.gelen, x.hedef)}</small></div>
    </div>`).join('')}</div>`;
}

function ulasimHtml(m) {
  const satir = (k, not) => {
    const u = m.ul[k], yz = fmt.yuzde(u.gelen, u.hedef);
    return `<div>
      <div class="db-ul-ust"><span class="db-ul-ad">${esc(ULASIM_AD[k])}</span><span class="db-ul-say">${fmt.sayi(u.gelen)} <small>/ ${fmt.sayi(u.hedef)}</small></span><span class="db-ul-yuzde">%${yz}</span></div>
      <div class="cubuk ${u.hedef && u.gelen >= u.hedef ? 'yesil' : ''}"><i style="width:${yz}%"></i></div>
      ${not ? `<div class="db-ul-not">${not}</div>` : ''}
    </div>`;
  };
  const sv = m.ul.servis;
  return `<div class="db-ul">
    ${satir('kendi', `${fmt.sayi(m.ul.kendi.hedef - m.ul.kendi.gelen)} kişi henüz gelmedi`)}
    ${satir('servis', `saati belli ${fmt.sayi(sv.saatli)} · araç atanmış ${fmt.sayi(sv.arac)}${sv.geciken ? ` · <b style="color:var(--turuncu)">${fmt.sayi(sv.geciken)} geciken</b>` : ''}`)}
    ${satir('yok', m.ul.yok.hedef - m.ul.yok.gelen ? `${fmt.sayi(m.ul.yok.hedef - m.ul.yok.gelen)} kişinin nasıl geleceği belli değil` : '')}
  </div>`;
}

// ---------------------------------------------------------------- SAATLİK GELİŞ GRAFİĞİ (inline SVG)
function grafikCiz() {
  const kap = kok?.querySelector('[data-grafik]'), yer = kok?.querySelector('[data-svg]');
  if (!kap || !yer || !model) return;
  const m = model;
  const W = Math.max(300, Math.round(kap.clientWidth - 12 || 900)), H = W < 560 ? 280 : GRAFIK_H;
  sonGenislik = kap.clientWidth;

  // x ekseni: oy verme saatleri; bugünkü işaretler ve şimdi 3 saate kadar dışarıdaysa eksen genişler
  let x0 = m.bas, x1 = m.bit;
  const icerde = d => d >= m.bas - 180 && d <= m.bit + 180;
  for (const d of [...m.topDk.filter(icerde), ...(icerde(m.simdiD) ? [m.simdiD] : [])]) {
    if (d < x0) x0 = Math.floor(d / 60) * 60;
    if (d > x1) x1 = Math.ceil(d / 60) * 60;
  }
  const kis = d => Math.max(x0, Math.min(x1, d));
  const bizDk = m.bizDk.map(kis), topDk = m.topDk.map(kis);
  const canli = m.simdiD >= x0;
  const son = kis(m.simdiD);

  const tepe = Math.max(m.hedef, topDk.length, 10);
  const adim = guzelAdim(tepe);
  const yMax = Math.ceil((tepe * 1.06) / adim) * adim;
  const pl = PAD.l, pr = W - PAD.r, pt = PAD.t, pb = H - PAD.b;
  const X = d => r1(pl + ((d - x0) / (x1 - x0)) * (pr - pl));
  const Y = v => r1(pt + (1 - v / yMax) * (pb - pt));
  const tempo = d => m.hedef * Math.max(0, Math.min(1, (d - m.bas) / (m.bit - m.bas)));

  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" tabindex="0" role="img" aria-label="Saatlik geliş grafiği: bizde ${bizDk.length} oy, toplam ${topDk.length} oy, hedef ${m.hedef}. Oklarla saat saat gezilebilir." data-svg-kok>`;
  // yatay ızgara + y etiketleri
  for (let v = 0; v <= yMax; v += adim) {
    s += `<line class="${v === 0 ? 'db-g-eksen' : 'db-g-izgara'}" x1="${pl}" x2="${pr}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    s += `<text class="db-g-yazi" x="${pl - 10}" y="${Y(v) + 4}" text-anchor="end">${fmt.sayi(v)}</text>`;
  }
  // x etiketleri (saat başları)
  // saat etiketleri en az ~58 px arayla: dar ekranda 2 saatte bir
  const saatAdim = ((pr - pl) / Math.max(1, (x1 - x0) / 60)) < 58 || x1 - x0 > 12 * 60 ? 120 : 60;
  for (let d = Math.ceil(x0 / 60) * 60; d <= x1; d += saatAdim) {
    s += `<line class="db-g-eksen" x1="${X(d)}" x2="${X(d)}" y1="${pb}" y2="${pb + 5}"/>`;
    s += `<text class="db-g-yazi" x="${X(d)}" y="${pb + 21}" text-anchor="middle">${saatYaz(d)}</text>`;
  }
  // hedef çizgisi
  if (m.hedef > 0) {
    s += `<line class="db-g-eksen" x1="${pl}" x2="${pr}" y1="${Y(m.hedef)}" y2="${Y(m.hedef)}"/>`;
    s += `<text class="db-g-hedef-yazi" x="${pl + 8}" y="${Y(m.hedef) - 7}">HEDEF ${fmt.sayi(m.hedef)}</text>`;
    // beklenen doğrusal tempo: başlangıçta 0, bitişte hedef
    s += `<path class="db-g-tempo" d="M${X(x0)},${Y(0)}H${X(m.bas)}L${X(m.bit)},${Y(m.hedef)}H${X(x1)}"/>`;
  }
  // gerçekleşen (basamaklı kümülatif)
  const basamak = dizi => {
    let c = kacTane(dizi, x0), d = `M${X(x0)},${Y(c)}`;
    for (let i = c; i < dizi.length && dizi[i] <= son; i++) { c++; d += `H${X(dizi[i])}V${Y(c)}`; }
    return { d: d + `H${X(son)}`, c };
  };
  let bizSon = 0, topSon = 0;
  if (canli) {
    const top = basamak(topDk), biz = basamak(bizDk); bizSon = biz.c; topSon = top.c;
    s += `<path class="db-g-alan" d="${biz.d}V${Y(0)}H${X(x0)}Z"/>`;
    s += `<path class="db-g-top" d="${top.d}"/>`;
    s += `<path class="db-g-biz" d="${biz.d}"/>`;
  }
  // şimdi çizgisi + tempo halkası
  const simdiIcerde = m.simdiD >= x0 && m.simdiD <= x1;
  if (simdiIcerde) {
    const xs = X(m.simdiD), etiket = `ŞİMDİ ${saatYaz(m.simdiD)}`, gen = 84;
    const hx = Math.max(pl, Math.min(W - gen - 2, xs - gen / 2));
    s += `<line class="db-g-simdi" x1="${xs}" x2="${xs}" y1="${pt - 8}" y2="${pb}"/>`;
    s += `<rect class="db-g-hap" x="${hx}" y="${pt - 28}" width="${gen}" height="20" rx="10"/><text class="db-g-hap-yazi" x="${hx + gen / 2}" y="${pt - 14}" text-anchor="middle">${etiket}</text>`;
  }
  if (canli) {
    const xe = X(son), yb = Y(bizSon), yt = Y(topSon);
    const bek = Math.round(tempo(son)), yk = Y(bek);
    if (m.hedef > 0 && simdiIcerde && m.simdiD >= m.bas) {
      s += `<circle class="db-g-n-tem" cx="${xe}" cy="${yk}" r="4.5"/>`;
      if (Math.abs(yk - yb) >= 20 && (topSon === bizSon || Math.abs(yk - yt) >= 20)) s += `<text class="db-g-deger-alt" x="${xe + 12}" y="${yk + 4}">tempo ${fmt.sayi(bek)}</text>`;
    }
    if (topSon !== bizSon) s += `<circle class="db-g-n-top" cx="${xe}" cy="${yt}" r="5"/>`;
    s += `<circle class="db-g-n-biz" cx="${xe}" cy="${yb}" r="6"/>`;
    s += `<text class="db-g-deger" x="${xe + 12}" y="${bizSon ? yb + 6 : yb - 9}">${fmt.sayi(bizSon)}<tspan class="db-g-deger-alt" dx="5">bizde</tspan></text>`;
    if (topSon !== bizSon && Math.abs(yt - yb) >= 18) s += `<text class="db-g-deger" x="${xe + 12}" y="${yt + 6}" style="font-size:14px">${fmt.sayi(topSon)}<tspan class="db-g-deger-alt" dx="5">toplam</tspan></text>`;
  } else {
    const pg = Math.min(350, W - 16), cx = W < 560 ? W / 2 : (pl + pr) / 2;
    s += `<rect class="db-g-perde" x="${cx - pg / 2}" y="${(pt + pb) / 2 - 32}" width="${pg}" height="60" rx="12"/>`;
    s += `<text class="db-g-bilgi" x="${cx}" y="${(pt + pb) / 2 - 6}" text-anchor="middle">Oy verme henüz başlamadı</text>`;
    s += `<text class="db-g-yazi" x="${cx}" y="${(pt + pb) / 2 + 16}" text-anchor="middle">${saatYaz(m.bas)} ile ${saatYaz(m.bit)} arası · şimdi ${saatYaz(m.simdiD)}</text>`;
  }
  // imleç (hover / klavye)
  s += `<g data-imlec visibility="hidden"><line class="db-g-imlec" y1="${pt}" y2="${pb}"/><circle data-n="tem" class="db-g-n-tem" r="4"/><circle data-n="top" class="db-g-n-top" r="5"/><circle data-n="biz" class="db-g-n-biz" r="5.5"/></g>`;
  s += `</svg>`;
  if (onbellek.get('svg') !== s) { onbellek.set('svg', s); yer.innerHTML = s; }
  olcek = { W, x0, x1, pl, pr, X, Y, son, canli, bizDk, topDk, tempo, hedef: m.hedef, bas: m.bas };
  bolum('saatler', saatlerHtml(m));
  if (fare != null) imlecCiz(fare); else imlecCiz(null);
}

function imlecCiz(dk) {
  const o = olcek, g = kok?.querySelector('[data-imlec]'), ip = kok?.querySelector('[data-ipucu]');
  if (!o || !g || !ip) return;
  if (dk == null) { g.setAttribute('visibility', 'hidden'); ip.hidden = true; return; }
  dk = Math.round(Math.max(o.x0, Math.min(o.x1, dk)));
  const x = o.X(dk), gecmis = o.canli && dk <= o.son + 0.5;
  const biz = kacTane(o.bizDk, dk), top = kacTane(o.topDk, dk), bek = Math.round(o.tempo(dk));
  g.setAttribute('visibility', 'visible');
  const ln = g.querySelector('line'); ln.setAttribute('x1', x); ln.setAttribute('x2', x);
  const nokta = (ad, v, gorun) => { const c = g.querySelector(`[data-n="${ad}"]`); c.setAttribute('cx', x); c.setAttribute('cy', o.Y(v)); c.setAttribute('visibility', gorun ? 'visible' : 'hidden'); };
  nokta('tem', bek, o.hedef > 0); nokta('top', top, gecmis && top !== biz); nokta('biz', biz, gecmis);
  const satir = (renk, deger, etiket, stil = '') => `<div class="r"><i style="border-color:${renk};${stil}"></i><b>${deger}</b><span>${etiket}</span></div>`;
  ip.innerHTML = `<div class="s">SAAT ${saatYaz(dk)}</div>`
    + (gecmis ? satir('var(--db-biz)', fmt.sayi(biz), 'bizde oy kullanan') + satir('var(--db-top)', fmt.sayi(top), 'toplam oy kullanan') : `<div class="db-zayif" style="margin-bottom:3px">Bu saat henüz gelmedi</div>`)
    + (o.hedef > 0 ? satir('var(--db-biz)', fmt.sayi(bek), 'hedef temposu', 'border-top-style:dashed;opacity:.6') : '')
    + (gecmis && o.hedef > 0 ? `<div class="db-zayif" style="margin-top:5px">${biz - bek >= 0 ? `tempodan ${biz - bek} önde` : `tempodan ${bek - biz} geride`}</div>` : '');
  ip.hidden = false;
  const svg = kok.querySelector('[data-svg-kok]'); const olc = svg.getBoundingClientRect().width / o.W || 1;
  const px = x * olc + 4, gen = ip.offsetWidth || 200, kapGen = kok.querySelector('[data-grafik]').clientWidth;
  ip.style.left = `${px + 16 + gen > kapGen ? px - gen - 16 : px + 16}px`;
}

function grafikOlaylari() {
  const kap = kok.querySelector('[data-grafik]');
  const dkBul = e => {
    const svg = kap.querySelector('[data-svg-kok]'); if (!svg || !olcek) return null;
    const rc = svg.getBoundingClientRect(); const px = (e.clientX - rc.left) * (olcek.W / rc.width);
    if (px < olcek.pl - 20 || px > olcek.pr + 40) return null;
    return olcek.x0 + ((Math.max(olcek.pl, Math.min(olcek.pr, px)) - olcek.pl) / (olcek.pr - olcek.pl)) * (olcek.x1 - olcek.x0);
  };
  kap.addEventListener('pointermove', e => { fare = dkBul(e); imlecCiz(fare); });
  kap.addEventListener('pointerleave', () => { fare = null; imlecCiz(null); });
  kap.addEventListener('focusin', e => { if (e.target.matches('[data-svg-kok]') && olcek) { fare = olcek.canli ? olcek.son : olcek.x0; imlecCiz(fare); } });
  kap.addEventListener('focusout', () => { fare = null; imlecCiz(null); });
  kap.addEventListener('keydown', e => {
    if (!olcek || fare == null || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const adim = e.shiftKey ? 60 : 10;
    fare = e.key === 'Home' ? olcek.x0 : e.key === 'End' ? olcek.x1 : Math.max(olcek.x0, Math.min(olcek.x1, fare + (e.key === 'ArrowRight' ? adim : -adim)));
    imlecCiz(fare);
  });
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => { if (Math.abs(kap.clientWidth - sonGenislik) > 2) grafikCiz(); });
    ro.observe(kap);
  }
}

// ---------------------------------------------------------------- güncelle (canlı)
function bolum(ad, html) {
  if (onbellek.get(ad) === html) return;
  const e = kok?.querySelector(`[data-b="${ad}"]`); if (!e) return;
  onbellek.set(ad, html); e.innerHTML = html;
}
function guncelle() {
  if (!kok) return;
  const kaydir = {}; kok.querySelectorAll('[data-kaydir]').forEach(e => { kaydir[e.dataset.kaydir] = e.scrollTop; });
  model = hesapla();
  const m = model;
  bolum('kahraman', kahramanHtml(m));
  grafikCiz();
  bolum('lider', liderHtml(m));
  bolum('lider-say', `${m.referanslar.filter(x => x.ref).length} referans`);
  const { liste, sayilar } = gelmediFiltreli(m);
  bolum('gelmedi-say', fmt.sayi(m.gelmedi.length));
  bolum('gelmedi-cip', gelmediCipHtml(sayilar));
  bolum('gelmedi', gelmediHtml(m, liste));
  bolum('geciken', gecikenHtml(m));
  bolum('geciken-say', m.geciken.length ? `<span class="rozet u-gecikti">${m.geciken.length}</span>` : '');
  bolum('evrak', evrakHtml(m));
  bolum('evrak-say', m.evrak.length ? `<span class="rozet u-evrak">${m.evrak.length}</span>` : '');
  bolum('ilce', ilceHtml(m));
  bolum('ulasim', ulasimHtml(m));
  canliCiz();
  kok.querySelectorAll('[data-kaydir]').forEach(e => { if (kaydir[e.dataset.kaydir]) e.scrollTop = kaydir[e.dataset.kaydir]; });
}

// "Canlı" yazısı bağlantıyı dürüst gösterir: kopuksa 8 saat açık kalan ekran eski rakamı canlı sanmasın
function canliCiz() {
  const c = kok?.querySelector('[data-canli]'); if (!c) return;
  const kopuk = !store.cevrimici || !store.canli, son = store.olaylar[0]?.zaman;
  c.classList.toggle('kopuk', kopuk);
  c.textContent = !store.cevrimici ? 'İnternet yok · rakamlar güncel olmayabilir'
    : !store.canli ? 'Bağlanıyor…'
    : son ? `Canlı · son hareket ${fmt.goreli(son)}` : 'Canlı · henüz hareket yok';
}
function tamEkranCiz() {
  const b = kok?.querySelector('[data-tam]'); if (!b) return;
  const acik = !!document.fullscreenElement;
  b.textContent = acik ? '✕ Tam ekrandan çık' : '⛶ Tam ekran';
  b.title = acik ? 'Tam ekrandan çık (Esc)' : 'Ekranı tam ekrana al (TV / projeksiyon)';
}

// ---------------------------------------------------------------- etkileşim (olay devri, bir kez)
function tikla(e) {
  if (e.target.closest('a[href]')) return;                         // Ara / Şoför düğmeleri kendi işini yapar, kartı açmaz
  const tam = e.target.closest('[data-tam]');
  if (tam) { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {}); return; }
  const df = e.target.closest('[data-dfiltre]');
  if (df) { tercih.durum = df.dataset.dfiltre; tercihKaydet(); guncelle(); return; }
  const gr = e.target.closest('[data-grup]');
  if (gr) { tercih.grup = !tercih.grup; tercihKaydet(); gr.querySelector('.anahtar')?.classList.toggle('acik', tercih.grup); guncelle(); return; }
  const k = e.target.closest('[data-kisi]');
  if (k) { kisiKartiAc(Number(k.dataset.kisi)); return; }
  const r = e.target.closest('[data-ref]');
  if (r && r.dataset.ref) location.hash = '#kisiler/' + encodeURIComponent(r.dataset.ref);
}
function tus(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const hedef = e.target.closest?.('[data-kisi], [data-ref]');
  if (!hedef || hedef !== e.target) return;
  e.preventDefault(); tikla({ target: hedef });
}

export default {
  async render(k) {
    kok = k; fare = null; olcek = null; sonGenislik = 0; onbellek.clear();
    stilEkle();
    kok.innerHTML = iskeletHtml();
    const sel = kok.querySelector('[data-ulasim-f]');
    sel.value = ULASIM_AD[tercih.ulasim] ? tercih.ulasim : 'hepsi';
    sel.addEventListener('change', () => { tercih.ulasim = sel.value; tercihKaydet(); guncelle(); });
    kok.addEventListener('click', tikla);
    kok.addEventListener('keydown', tus);
    grafikOlaylari();
    document.addEventListener('fullscreenchange', tamEkranCiz);
    if (!document.fullscreenEnabled) kok.querySelector('[data-tam]')?.remove();
    tamEkranCiz();
    guncelle();
  },
  yenile(sebep) {
    if (!kok || YOKSAY.has(sebep)) return;
    if (sebep === 'baglanti') return canliCiz();   // yalnız bağlantı yazısı değişir
    guncelle();
  },
  temizle() {
    ro?.disconnect(); ro = null;
    document.removeEventListener('fullscreenchange', tamEkranCiz);
    kok?.removeEventListener('click', tikla); kok?.removeEventListener('keydown', tus);
    kok = null; model = null; olcek = null; fare = null; onbellek.clear();
  },
};
