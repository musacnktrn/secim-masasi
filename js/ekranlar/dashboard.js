// 72. Komite · Seçim Masası · DASHBOARD (Claude Design "SM Dashboard" hi-fi tasarımı, 2026-09-30)
// 3 metreden okunur: hero "oy_bizde / hedef", saatlik geliş (gerçekleşen yeşil bar / beklenen kesik), referans liderlik tablosu,
// ilçe dağılımı, araç kullanımı + boşta araçlar, ulaşım türü ve üç eylem listesi (Kesin bizde henüz gelmedi · Geciken alımlar · Evrak uyarılı).
// Her rakam store'dan hesaplanır; canlı olay gelince yalnız değişen bölümün DOM'u yenilenir (kaydırma ve filtre korunur).
import { store, esc, fmt, trBaslik, simdi, simdiDk, dakika, sayac, gecikme, ulasim, firmaListesi, aracOf, DURUM_AD, referansBenMi, karsiladim, isaretleyebilirMi, yazabilirMi } from '../core.js';
import { kisiKartiAc, toast, hataGoster, paletAc } from '../ui.js';

const TERCIH_ANAHTAR = 'secim-dashboard-tercih';
const YOKSAY = new Set(['asistan', 'istek', 'profil', 'baglanti']);
// gelmedi listesinde sıra: ilerlemiş önce (yolda > arandı > bekliyor); fuarda olanlar zaten içeride, listede yok
const GUN_SIRA = { bekliyor: 0, arandi: 1, yolda: 2 };
const FILTRE_DURUM = [['hepsi', 'Hepsi'], ['yolda', 'Yolda'], ['arandi', 'Arandı'], ['bekliyor', 'Bekliyor']];
const ULASIM_TUR = [['kendi', 'Kendi gelecek', 'var(--ink)'], ['servis', 'Servis', 'var(--red)'], ['yok', 'Belirsiz / yok', 'var(--amber)']];
// "Beklenen" saatlik dağılım: tasarımdaki planlanan profil (09-17 için 8 saat, toplam 1). Farklı saat aralığında yeniden ölçeklenir.
const PROFIL = [0.17, 0.2, 0.16, 0.1, 0.1, 0.1, 0.09, 0.08];
const SEFER_ARA = 20 * 60000;   // aynı aracın 20 dk içindeki teslimleri tek sefer sayılır

let kok = null, model = null;
const onbellek = new Map();   // bölüm -> son HTML: değişmeyen bölümün DOM'u yeniden kurulmaz
let tercih = { durum: 'hepsi', ulasim: 'hepsi' };
try { tercih = { ...tercih, ...JSON.parse(localStorage.getItem(TERCIH_ANAHTAR) || '{}') }; } catch {}
// eski ya da bozuk kayıt listeyi sessizce boşaltmasın
if (!FILTRE_DURUM.some(([k]) => k === tercih.durum)) tercih.durum = 'hepsi';
if (!['hepsi', 'kendi', 'servis', 'yok'].includes(tercih.ulasim)) tercih.ulasim = 'hepsi';
const tercihKaydet = () => { try { localStorage.setItem(TERCIH_ANAHTAR, JSON.stringify(tercih)); } catch {} };

// ---------------------------------------------------------------- yardımcılar
const iki = n => String(Math.floor(n)).padStart(2, '0');
const saatYaz = dk => `${iki(((dk % 1440) + 1440) % 1440 / 60)}:${iki(((dk % 60) + 60) % 60)}`;
const oyMu = f => f.durum === 'oy_kullandi';
const kolator = new Intl.Collator('tr', { sensitivity: 'base' });
// Referans adları: "HARUN BULAN" -> "Harun Bulan"; "İK", "63 MK" gibi kısaltmalar olduğu gibi kalır
const refAd = r => String(r || '').split(/\s+/).filter(Boolean).map(w => (w.length <= 2 ? w : trBaslik(w))).join(' ');
const kisiAd = f => trBaslik(f.yetkili || f.unvan || '');
const kisiKey = f => f.kisi_anahtar || `f${f.id}`;
// "ALPER SEZER" -> "Alper S."
function kisaAd(ad) {
  const p = trBaslik(ad || '').split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1].charAt(0).toLocaleUpperCase('tr')}.` : (p[0] || '');
}
// aranabilir ilk numara: cep, 2. cep, sonra sabit hatlar ("232... - 232..." gibi çoklu metin)
function telSec(f) {
  for (const t of [f.cep, f.cep2, ...String(f.sabit_tel || '').split(/\s*[-/,;]\s*/)]) if (t && fmt.telLink(t)) return t;
  return null;
}
// 'HARUN BULAN · Rota 3' -> 'Rota 3'
function rotaAd(f) {
  if (!f.rota_kod) return '';
  const m = String(f.rota_kod).match(/Rota\s*(\d+)/i);
  return m ? `Rota ${m[1]}` : trBaslik(f.rota_kod);
}
// planlanan profil, n saatlik dilimlere bölünür (kümülatif doğrusal aradeğerleme; n=8 iken birebir profil)
function beklenenAgirlik(n) {
  const K = PROFIL.length, kum = [0]; PROFIL.forEach((w, i) => kum.push(kum[i] + w));
  const C = t => { const x = Math.max(0, Math.min(K, t * K)), i = Math.min(K - 1, Math.floor(x)); return kum[i] + (kum[i + 1] - kum[i]) * (x - i); };
  return Array.from({ length: n }, (_, j) => C((j + 1) / n) - C(j / n));
}

// ---------------------------------------------------------------- MODEL: tüm rakamlar store'dan
function hesapla() {
  const hepsi = firmaListesi();
  const s = sayac();
  const hedef = Math.max(0, Number(s.hedef) || 0);
  const biz = hepsi.filter(f => f.oy_sinifi === 'bizde');
  const bizim = hepsi.filter(f => f.oy_sinifi === 'bizde' || f.oy_sinifi === 'yolda');   // "bizim liste" = kesin bizde + ilzam yolda

  // zaman ekseni (ayarlar.zaman) + prova saati (?saat=10:30) kayması
  const z = store.ayarlar.zaman || {};
  const bas = dakika(z.bas) ?? 540;
  let bit = dakika(z.bit) ?? 1020; if (bit <= bas) bit = bas + 480;
  const simdiT = simdi();
  const kayma = Math.abs(simdiT.getTime() - Date.now()) > 60000 ? simdiT.getTime() - Date.now() : 0;
  const gunBasi = new Date(simdiT); gunBasi.setHours(0, 0, 0, 0);
  const simdiD = simdiDk();

  // oy kullanma anı: olaylardaki son "oy kullandı"ya geçiş; olay yoksa (ya da store daha yeniyse) durum_zamani.
  // Aynı döngüde her firmanın son "fuarda" anı da toplanır (araç seferleri için).
  const giris = new Map(), cozuldu = new Set(), fuardaAn = new Map();
  for (const o of store.olaylar) {                          // en yeni başta
    if (o.tur !== 'durum' || !o.firma_id) continue;
    const yeni = String(o.yeni || ''), eski = String(o.eski || '');
    if (yeni.startsWith('fuarda') && !fuardaAn.has(o.firma_id)) fuardaAn.set(o.firma_id, o.zaman);
    if (cozuldu.has(o.firma_id)) continue;
    const y = yeni.startsWith('oy_kullandi'), e = eski.startsWith('oy_kullandi');
    if (y && e) continue;                                    // yalnız "kendi geldi" düzeltmesi, geçiş anı değil
    cozuldu.add(o.firma_id);
    if (y) giris.set(o.firma_id, o.zaman);
  }
  const dkOf = f => {
    const ts = giris.get(f.id) || f.durum_zamani || f.guncelleme;
    const t = ts ? new Date(ts).getTime() : NaN;
    return Number.isFinite(t) ? (t + kayma - gunBasi.getTime()) / 60000 : -Infinity;
  };

  // saatlik geliş: sütunlar oy verme saatleri; aralık dışı oylar en yakın sütuna yazılır (toplam hero ile tutsun)
  const ilkSaat = Math.floor(bas / 60);
  const adet = Math.max(1, Math.ceil(bit / 60) - ilkSaat);
  const gercek = new Array(adet).fill(0);
  for (const f of biz) if (oyMu(f)) gercek[Math.max(0, Math.min(adet - 1, Math.floor(dkOf(f) / 60) - ilkSaat))]++;
  const agirlik = beklenenAgirlik(adet);
  const beklenen = agirlik.map(w => Math.round(w * hedef));
  const saatler = gercek.map((n, i) => ({ h: ilkSaat + i, gercek: n, beklenen: beklenen[i] }));

  // referans liderlik (hedef = o referansın kesin bizdeki sayısı, gelen = bunlardan oy kullanan)
  const refMap = new Map();
  for (const f of biz) {
    const k = f.referans || '';
    const x = refMap.get(k) || { ref: k, hedef: 0, gelen: 0 };
    x.hedef++; if (oyMu(f)) x.gelen++;
    refMap.set(k, x);
  }
  const referanslar = [...refMap.values()]
    .map(x => ({ ...x, kalan: Math.max(0, x.hedef - x.gelen), yuzde: x.hedef ? x.gelen / x.hedef : 0 }))
    .sort((a, b) => b.yuzde - a.yuzde || b.gelen - a.gelen || b.hedef - a.hedef || (!a.ref - !b.ref) || kolator.compare(a.ref, b.ref));

  // ilçe (bizim liste: hedef ve gelen)
  const ilceMap = new Map();
  for (const f of bizim) {
    const k = f.ilce || '';
    const x = ilceMap.get(k) || { ilce: k, hedef: 0, gelen: 0 };
    x.hedef++; if (oyMu(f)) x.gelen++; ilceMap.set(k, x);
  }
  const ilceler = [...ilceMap.values()].sort((a, b) => b.hedef - a.hedef || b.gelen - a.gelen || kolator.compare(a.ilce, b.ilce));

  // ulaşım (bizim liste)
  const ul = { kendi: 0, servis: 0, yok: 0 };
  for (const f of bizim) ul[ulasim(f)]++;

  // araç kullanımı: araca atanmış kişiler (aynı kişi birden çok firmada tek sayılır)
  const gruplar = new Map();
  for (const f of hepsi) {
    if (!f.arac_id || !store.araclar.has(f.arac_id)) continue;
    const g = gruplar.get(f.arac_id) || { atanan: new Set(), tasinan: new Set(), yolda: new Set(), bekleyen: new Set(), teslim: [] };
    const k = kisiKey(f); g.atanan.add(k);
    if (f.durum === 'yolda') g.yolda.add(k);
    else if (f.durum === 'bekliyor' || f.durum === 'arandi') g.bekleyen.add(k);
    else if ((f.durum === 'fuarda' || f.durum === 'oy_kullandi') && !f.kendi_geldi && !g.tasinan.has(k)) {
      g.tasinan.add(k);
      const t = f.geri_sayim === 'birakti' && f.geri_sayim_zamani ? Date.parse(f.geri_sayim_zamani)
        : fuardaAn.has(f.id) ? Date.parse(fuardaAn.get(f.id))
        : f.durum === 'fuarda' && f.durum_zamani ? Date.parse(f.durum_zamani) : NaN;
      if (Number.isFinite(t)) g.teslim.push(t);
    }
    gruplar.set(f.arac_id, g);
  }
  const seferSay = g => {
    const t = g.teslim.sort((a, b) => a - b); let sefer = 0, son = -Infinity;
    for (const x of t) { if (x - son > SEFER_ARA) sefer++; son = x; }
    if (g.yolda.size) sefer++;                                       // şu an yolcu taşıyan sefer
    return Math.max(sefer, g.tasinan.size ? 1 : 0);
  };
  const kullanim = [...gruplar.entries()].map(([id, g]) => ({
    a: store.araclar.get(id), tasinan: g.tasinan.size, yolda: g.yolda.size, atanan: g.atanan.size, sefer: seferSay(g),
  })).sort((x, y) => (y.tasinan + y.yolda) - (x.tasinan + x.yolda) || y.atanan - x.atanan || kolator.compare(x.a.plaka || '', y.a.plaka || ''));
  const bosta = [...store.araclar.values()].filter(a => {
    const g = gruplar.get(a.id); return a.durum === 'hazir' && (!g || (!g.bekleyen.size && !g.yolda.size));
  }).sort((a, b) => kolator.compare(a.plaka || '', b.plaka || ''));

  // listeler
  const gelmediHam = biz.filter(f => !oyMu(f) && f.durum !== 'fuarda');
  const geciken = hepsi.map(f => ({ f, dk: gecikme(f, simdiD) })).filter(x => x.dk > 0).sort((a, b) => b.dk - a.dk);
  const evrak = bizim.filter(f => f.evrak_uyari && !oyMu(f))
    .sort((a, b) => (a.oy_sinifi === 'bizde' ? 0 : 1) - (b.oy_sinifi === 'bizde' ? 0 : 1) || kolator.compare(a.yetkili || a.unvan || '', b.yetkili || b.unvan || ''));

  return { s, hedef, elle: store.ayarlar.hedef?.elle != null, bas, bit, simdiD, saatler, referanslar, ilceler, ul, ulToplam: ul.kendi + ul.servis + ul.yok, kullanim, bosta, gelmediHam, geciken, evrak };
}

// ---------------------------------------------------------------- stil (bir kez)
function stilEkle() {
  const eski = document.querySelector('style[data-ekran="dashboard"]'); if (eski) eski.remove();
  const st = document.createElement('style'); st.dataset.ekran = 'dashboard';
  st.textContent = `
.db-isaretle { display: flex; align-items: center; gap: 12px; width: 100%; margin: 0 0 12px; padding: 12px 18px; border: 0; border-radius: 14px; background: var(--red); color: #fff; cursor: pointer; font: inherit; text-align: left; box-shadow: 0 6px 18px rgba(200,16,46,.25); flex: none; }
.db-isaretle:active { transform: scale(.99); }
.db-isaretle-i { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.2); display: grid; place-items: center; font-size: 18px; font-weight: 900; flex: none; }
.db-isaretle-m { display: flex; flex-direction: column; font-size: 17px; font-weight: 800; line-height: 1.2; }
.db-isaretle-m small { font-size: 12px; font-weight: 500; opacity: .85; }
@media (max-width: 900px) {
  .db-isaretle { position: fixed; left: 12px; right: 88px; bottom: calc(12px + var(--guvenli-alt, 0px)); width: auto; margin: 0; z-index: 40; min-height: 60px; }
  .db { padding-bottom: calc(84px + var(--guvenli-alt, 0px)); }
}

.icerik.db-tam { max-width: none; margin: 0; padding: 16px 20px; display: flex; flex-direction: column; }
.kabuk:has(> .icerik.db-tam) { height: 100vh; height: 100dvh; min-height: 0; }
.icerik.db-tam { flex: 1 1 0; min-height: 0; overflow: hidden; }
.db { flex: 1 1 0; min-height: 0; display: grid; grid-template-columns: clamp(420px, 36.11vw, 700px) minmax(0, 1fr) clamp(320px, 26.39vw, 460px); grid-template-rows: minmax(0, 1fr); gap: 14px; color: var(--ink); font-family: 'Inter', system-ui, sans-serif; line-height: normal; }
.db-kol { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.db-kart { min-width: 0; min-height: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.db-baslik { font-size: 11px; font-weight: 800; letter-spacing: .1em; white-space: nowrap; text-transform: uppercase; }
.db-not { margin-left: auto; font-size: 11.5px; color: var(--ink-3); white-space: nowrap; }
.db-iyi { padding: 14px 16px; color: var(--green); font-weight: 800; font-size: 13px; }
.db-yok { padding: 14px 16px; color: var(--ink-3); font-size: 13px; }
.db button { font-family: inherit; }
.db .kaydir { scrollbar-width: thin; scrollbar-color: var(--line-2) transparent; }

/* hero */
.db-hero { flex: none; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.db-h-ust { display: flex; align-items: center; gap: 8px; }
.db-h-ust .db-baslik { font-size: 12px; letter-spacing: .12em; }
.db-h-ust .db-not { font-size: 12px; }
.db-tam-dugme { flex: none; width: 26px; height: 26px; margin: -6px 0 -6px 4px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink-2); font-size: 14px; line-height: 1; cursor: pointer; display: grid; place-items: center; padding: 0; }
.db-tam-dugme:hover { background: var(--hover); color: var(--ink); }
.db-dev { display: flex; align-items: baseline; gap: 10px; line-height: .9; white-space: nowrap; }
.db-dev-sayi { font-size: clamp(110px, 10.42vw, 200px); font-weight: 900; letter-spacing: -.05em; font-variant-numeric: tabular-nums; color: var(--ink); }
.db-dev-hedef { font-size: clamp(38px, 3.61vw, 70px); font-weight: 800; letter-spacing: -.03em; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.db-hbar { position: relative; height: 18px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
.db-hbar > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--red); border-radius: 99px; transition: width .5s; }
.db-hbar > b { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--surface); }
.db-hsatir { display: flex; gap: 16px; font-size: 15px; color: var(--ink-2); font-variant-numeric: tabular-nums; flex-wrap: wrap; }
.db-hsatir b { color: var(--ink); }
.db-hsatir .k b { color: var(--red); font-size: 20px; }
.db-hsatir .k2 b { font-size: 20px; }
.db-hsatir .sag { margin-left: auto; }
.db-mini-kap { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding-top: 4px; border-top: 1px solid var(--line); }
.db-mini { display: flex; flex-direction: column; gap: 2px; padding-top: 10px; min-width: 0; }
.db-mini .e { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; color: var(--ink-3); white-space: nowrap; }
.db-mini .e i { width: 8px; height: 8px; border-radius: 99px; flex: none; }
.db-mini .d { font-size: 40px; font-weight: 900; letter-spacing: -.03em; line-height: 1.05; font-variant-numeric: tabular-nums; color: var(--ink); }
.db-mini .d.uyari { color: var(--amber-ink); }

/* saatlik geliş */
.db-saatlik { flex: 1 1 0; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.db-sat-ust { flex: none; display: flex; align-items: center; gap: 14px; }
.db-lej { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink-2); white-space: nowrap; }
.db-sat-ust .db-baslik + .db-lej { margin-left: auto; }
.db-lej i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; box-sizing: border-box; }
.db-lej i.g { background: var(--green); } .db-lej i.b { border: 1.5px dashed var(--ink-3); }
.db-sutunlar { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(var(--db-n, 8), minmax(0, 1fr)); gap: 10px; align-items: end; }
.db-sutun { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; min-width: 0; }
.db-sutun .n { height: 18px; font-size: 14px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; color: var(--ink); line-height: 18px; }
.db-sutun .iz { flex: 1; position: relative; min-height: 0; }
.db-sutun .iz .bek { position: absolute; left: 0; right: 0; bottom: 0; border: 1.5px dashed var(--ink-3); border-radius: 6px; box-sizing: border-box; opacity: .55; }
.db-sutun .iz .ger { position: absolute; left: 6px; right: 6px; bottom: 0; background: var(--green); border-radius: 5px; transition: height .5s; }
.db-sutun .iz .ger.simdi { background: repeating-linear-gradient(135deg, var(--green) 0 6px, var(--green-soft) 6px 10px); }
.db-sutun .s { font-size: 12px; font-weight: 700; text-align: center; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.db-sutun .s.simdi { color: var(--red); }

/* referans liderlik */
.db-lider { flex: 1.25 1 0; display: flex; flex-direction: column; overflow: hidden; }
.db-lider .db-baslik { flex: none; padding: 14px 18px 10px; }
.db-lg { display: grid; grid-template-columns: 22px minmax(0, 1fr) 46px 46px 46px 46px 64px; gap: 10px; align-items: center; padding: 0 18px; font-variant-numeric: tabular-nums; }
.db-lg.bas { flex: none; padding-bottom: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: .07em; color: var(--ink-3); border-bottom: 1px solid var(--line); white-space: nowrap; }
.db-lg.bas > :nth-child(n+3):nth-child(-n+6) { text-align: right; }
.db-lider .kaydir { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.db-lg.satir { height: 34px; box-sizing: content-box; border-bottom: 1px solid var(--line); font-size: 14px; outline: none; }
.db-lg.satir[data-ref] { cursor: pointer; }
.db-lg.satir[data-ref]:hover, .db-lg.satir[data-ref]:focus-visible { background: var(--hover); }
.db-lg.satir .sr { font-weight: 700; color: var(--ink-3); }
.db-lg.satir .ad { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-lg.satir .h { text-align: right; color: var(--ink-2); }
.db-lg.satir .g { text-align: right; font-weight: 800; }
.db-lg.satir .y { text-align: right; font-weight: 800; color: var(--red); }
.db-lg.satir .k { text-align: right; color: var(--ink-2); }
.db-lg.satir .br { height: 8px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
.db-lg.satir .br > i { display: block; height: 100%; border-radius: 99px; background: var(--ink-3); }
.db-lg.satir .br > i.ilk { background: var(--red); }

/* ilçe dağılımı */
.db-ilce { flex: 1 1 0; padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.db-ilce .db-ust, .db-arac .db-ust { flex: none; display: flex; align-items: center; }
.db-ilce .kaydir { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 8px; }
.db-i { display: grid; grid-template-columns: 92px minmax(0, 1fr) 64px; gap: 10px; align-items: center; font-size: 13px; cursor: pointer; outline: none; border-radius: 6px; flex: none; }
.db-i:hover, .db-i:focus-visible { background: var(--hover); }
.db-i .ad { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-i .iz { position: relative; height: 14px; border-radius: 4px; background: var(--surface-3); overflow: hidden; }
.db-i .iz > span { position: absolute; left: 0; top: 0; bottom: 0; background: var(--line-2); }
.db-i .iz > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--red); }
.db-i .sy { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.db-i .sy small { color: var(--ink-3); font-weight: 500; font-size: 13px; }

/* araç kullanımı */
.db-arac { flex: 1.1 1 0; padding: 14px 18px; display: flex; flex-direction: column; gap: 7px; overflow: hidden; }
.db-arac .kaydir { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 5px; }
.db-av { display: grid; grid-template-columns: 96px minmax(0, 1fr) 56px 44px; gap: 8px; align-items: center; border: 0; background: none; padding: 0; cursor: pointer; color: var(--ink); text-align: left; flex: none; border-radius: 4px; }
.db-av:hover, .db-av:focus-visible { background: var(--hover); outline: none; }
.db-pl { display: inline-flex; align-items: stretch; box-sizing: content-box; height: 20px; border: 1.2px solid #111; border-radius: 3px; background: #fff; overflow: hidden; justify-self: start; }
.db-pl > i { width: 6px; background: #1F4FA8; }
.db-pl > b { padding: 0 5px; display: flex; align-items: center; font-size: 11px; font-weight: 800; color: #111; white-space: nowrap; }
.db-av .br { position: relative; height: 12px; border-radius: 4px; background: var(--surface-3); overflow: hidden; }
.db-av .br > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); border-radius: 4px; }
.db-av .br > i.ariza { background: var(--amber); }
.db-av .kisi { font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.db-av .sef { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.db-bosta { flex: none; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-top: 6px; border-top: 1px solid var(--line); max-height: 62px; overflow: auto; }
.db-bosta > span { font-size: 11.5px; font-weight: 700; color: var(--ink-2); white-space: nowrap; }
.db-bosta button { height: 22px; padding: 0 7px; border-radius: 5px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.db-bosta button:hover { background: var(--hover); }

/* ulaşım türü */
.db-ulasim { flex: none; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.db-ul-bar { display: flex; height: 14px; border-radius: 99px; overflow: hidden; gap: 2px; background: var(--surface-3); }
.db-ul-bar > div { transition: flex-grow .5s; }
.db-ul-uc { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.db-ul-oge { display: flex; flex-direction: column; gap: 1px; text-align: left; border: 0; background: none; padding: 4px 6px; margin: -4px -6px; border-radius: 8px; cursor: pointer; color: var(--ink); min-width: 0; }
.db-ul-oge:hover { background: var(--hover); }
.db-ul-oge.aktif { box-shadow: inset 0 0 0 1.5px var(--red); }
.db-ul-oge .e { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }
.db-ul-oge .e i { width: 8px; height: 8px; border-radius: 99px; flex: none; }
.db-ul-oge .d { font-size: 28px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.1; }

/* eylem listeleri */
.db-liste { flex: 1 1 0; display: flex; flex-direction: column; overflow: hidden; }
.db-l-ust { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 16px 8px; }
.db-l-ust .n { margin-left: auto; font-size: 20px; font-weight: 900; font-variant-numeric: tabular-nums; }
.db-l-cip { flex: none; display: flex; gap: 5px; flex-wrap: wrap; padding: 0 16px 8px; }
.db-cip { height: 22px; padding: 0 9px; border-radius: 99px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink-2); font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
.db-cip:hover { background: var(--hover); }
.db-cip.aktif { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.db-cip small { font-size: 11px; font-weight: 800; opacity: .65; }
.db-liste .kaydir { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.db-oge { display: flex; align-items: center; gap: 8px; padding: 6px 16px; border-top: 1px solid var(--line); }
.db-oge .ana { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.db-oge .ad { border: 0; background: none; padding: 0; text-align: left; font-size: 13.5px; font-weight: 700; color: var(--ink); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-oge .ad:hover { text-decoration: underline; }
.db-oge .meta { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-oge .meta em { font-style: normal; font-weight: 800; color: var(--amber-ink); }
.db-ara { flex: none; box-sizing: content-box; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); color: var(--ink); font-size: 12px; font-weight: 700; display: flex; align-items: center; white-space: nowrap; background: var(--surface); }
.db-ara:hover { background: var(--hover); color: var(--ink); }
.db-ara.yok { opacity: .4; pointer-events: none; }
.db-karsila { flex: none; box-sizing: content-box; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--red-line); background: var(--red-soft); color: var(--red); font-size: 12px; font-weight: 800; white-space: nowrap; cursor: pointer; }
.db-karsila:hover { background: var(--red); color: var(--on-red); }
.db-karsila:disabled { opacity: .5; cursor: default; }
.db-oge .meta .kars { color: var(--green); font-weight: 700; }

/* dar ekran: tek sütun, sayfa kayar */
@media (max-width: 1240px) {
  .kabuk:has(> .icerik.db-tam) { height: auto; min-height: 100vh; }
  .icerik.db-tam { display: block; overflow: visible; padding: 14px; }
  .db { display: flex; flex-direction: column; gap: 14px; }
  .db-kol { display: contents; }
  .db-kart { flex: none; }
  .db-saatlik { height: 340px; }
  .db-lider { height: 440px; }
  .db-ilce { max-height: 360px; } .db-arac { max-height: 360px; }
  .db-liste { height: 340px; }
  .db-dev-sayi { font-size: 96px; } .db-dev-hedef { font-size: 34px; }
}
@media (max-width: 560px) {
  .db-mini-kap { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .db-lg { grid-template-columns: 22px minmax(0, 1fr) 40px 40px 42px 40px 0; gap: 8px; padding: 0 12px; }
  .db-lg > :last-child { display: none; }
}`;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------- iskelet (bir kez)
function iskeletHtml() {
  // Gelen kişiyi işaretle: ad / firma / telefon yaz, satırdaki "Oy kullandı" ile tek dokunuş (ortak palet)
  const isaretDugme = yazabilirMi() ? '<button type="button" class="db-isaretle" data-isaretle><span class="db-isaretle-i">✓</span><span class="db-isaretle-m">Gelen kişiyi işaretle<small>ad, firma ya da telefon yaz</small></span></button>' : '';
  return `${isaretDugme}
  <div class="db">
    <div class="db-kol">
      <section class="db-kart db-hero" data-b="hero"></section>
      <section class="db-kart db-saatlik">
        <div class="db-sat-ust">
          <div class="db-baslik">Saatlik geliş</div>
          <div class="db-lej"><i class="g"></i>Gerçekleşen</div>
          <div class="db-lej"><i class="b"></i>Beklenen</div>
        </div>
        <div class="db-sutunlar" data-b="saatlik"></div>
      </section>
    </div>

    <div class="db-kol">
      <section class="db-kart db-lider">
        <div class="db-baslik">Referans liderlik tablosu</div>
        <div class="db-lg bas"><div>#</div><div>REFERANS</div><div>HEDEF</div><div>GELEN</div><div>%</div><div>KALAN</div><div></div></div>
        <div class="kaydir" data-kaydir="lider"><div data-b="lider"></div></div>
      </section>
      <section class="db-kart db-ilce">
        <div class="db-ust"><div class="db-baslik">İlçe dağılımı</div><div class="db-not">gelen / bizim liste</div></div>
        <div class="kaydir" data-kaydir="ilce"><div data-b="ilce" style="display:contents"></div></div>
      </section>
      <section class="db-kart db-arac">
        <div class="db-ust"><div class="db-baslik">Araç kullanımı</div><div class="db-not">sefer · taşınan kişi</div></div>
        <div class="kaydir" data-kaydir="arac"><div data-b="arac" style="display:contents"></div></div>
        <div class="db-bosta" data-b="bosta"></div>
      </section>
    </div>

    <div class="db-kol">
      <section class="db-kart db-ulasim" data-b="ulasim"></section>
      <section class="db-kart db-liste">
        <div class="db-l-ust" data-b="gelmedi-ust"></div>
        <div class="db-l-cip" data-b="gelmedi-cip"></div>
        <div class="kaydir" data-kaydir="gelmedi"><div data-b="gelmedi"></div></div>
      </section>
      <section class="db-kart db-liste">
        <div class="db-l-ust" data-b="geciken-ust"></div>
        <div class="kaydir" data-kaydir="geciken"><div data-b="geciken"></div></div>
      </section>
      <section class="db-kart db-liste">
        <div class="db-l-ust" data-b="evrak-ust"></div>
        <div class="kaydir" data-kaydir="evrak"><div data-b="evrak"></div></div>
      </section>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- bölümler
function heroHtml(m) {
  const s = m.s, yz = fmt.yuzde(s.oy_bizde, m.hedef);
  const doldu = m.hedef ? Math.min(100, (s.oy_bizde / m.hedef) * 100) : 0;
  const disari = s.oy_kullandi - s.oy_bizde;
  const not = `${m.elle ? 'hedef = elle girildi' : 'hedef = kesin bizde'}${disari > 0 ? ` · bizde dışı ${fmt.sayi(disari)} oy` : ''}`;
  // saatte kaç oy gerekiyor: kalan süre, oy vermenin başlamasından önce baştan sayılır
  const kalanSaat = Math.max(1, (m.bit - Math.max(m.simdiD, m.bas)) / 60);
  const gerek = m.simdiD >= m.bit ? 'Oy verme süresi bitti' : !s.kalan ? 'Hedef tamam' : `Saatte <b>${fmt.sayi(Math.ceil(s.kalan / kalanSaat))}</b> oy gerekiyor`;
  const tamAcik = !!document.fullscreenElement;
  const tam = document.fullscreenEnabled ? `<button type="button" class="db-tam-dugme" data-tam title="${tamAcik ? 'Tam ekrandan çık (Esc)' : 'Tam ekran (TV / projeksiyon)'}" aria-label="Tam ekran">${tamAcik ? '✕' : '⛶'}</button>` : '';
  const mini = (etiket, deger, renk, uyari) => `<div class="db-mini"><div class="e"><i style="background:${renk}"></i>${etiket}</div><div class="d ${uyari ? 'uyari' : ''}">${fmt.sayi(deger)}</div></div>`;
  return `
    <div class="db-h-ust"><div class="db-baslik">OY KULLANDI</div><div class="db-not">${esc(not)}</div>${tam}</div>
    <div class="db-dev"><span class="db-dev-sayi">${fmt.sayi(s.oy_bizde)}</span><span class="db-dev-hedef">/ ${fmt.sayi(m.hedef)}</span></div>
    <div class="db-hbar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.hedef}" aria-valuenow="${s.oy_bizde}"><i style="width:${doldu}%"></i><b style="left:25%"></b><b style="left:50%"></b><b style="left:75%"></b></div>
    <div class="db-hsatir"><div class="k"><b>%${yz}</b> hedefte</div><div class="k2">Kalan <b>${fmt.sayi(s.kalan)}</b></div><div class="sag">${gerek}</div></div>
    <div class="db-mini-kap">
      ${mini('FUARDA', s.fuarda, 'var(--violet)')}${mini('YOLDA', s.yolda, 'var(--amber)')}${mini('ARANDI', s.arandi, 'var(--blue)')}${mini('GECİKEN', s.geciken, 'var(--amber)', true)}
    </div>`;
}

function saatlikHtml(m) {
  const enCok = Math.max(1, ...m.saatler.map(x => Math.max(x.gercek, x.beklenen)));
  const simdiH = Math.floor(m.simdiD / 60);
  return m.saatler.map(x => {
    const gecti = x.h <= simdiH, su = x.h === simdiH;
    return `<div class="db-sutun" title="${iki(x.h)}:00 · gerçekleşen ${x.gercek} · beklenen ${x.beklenen}">
      <div class="n">${gecti ? fmt.sayi(x.gercek) : ''}</div>
      <div class="iz"><div class="bek" style="height:${(x.beklenen / enCok) * 100}%"></div><div class="ger${su ? ' simdi' : ''}" style="height:${gecti ? (x.gercek / enCok) * 100 : 0}%"></div></div>
      <div class="s${su ? ' simdi' : ''}">${iki(x.h)}:00</div>
    </div>`;
  }).join('');
}

function liderHtml(m) {
  if (!m.referanslar.length) return `<div class="db-yok">Kesin bizde listesinde referans yok</div>`;
  return m.referanslar.map((x, i) => {
    const yz = Math.round(x.yuzde * 100), ad = x.ref ? refAd(x.ref) : 'Referans yok';
    return `<div class="db-lg satir" ${x.ref ? `data-ref="${esc(x.ref)}" tabindex="0" title="${esc(ad)}: kişileri aç"` : `title="${esc(ad)}"`}>
      <div class="sr">${i + 1}</div><div class="ad">${esc(ad)}</div><div class="h">${fmt.sayi(x.hedef)}</div><div class="g">${fmt.sayi(x.gelen)}</div><div class="y">%${yz}</div><div class="k">${fmt.sayi(x.kalan)}</div>
      <div class="br"><i class="${i < 3 ? 'ilk' : ''}" style="width:${yz}%"></i></div>
    </div>`;
  }).join('');
}

function ilceHtml(m) {
  if (!m.ilceler.length) return `<div class="db-yok">Veri yok</div>`;
  const tepe = Math.max(1, ...m.ilceler.map(x => x.hedef));
  return m.ilceler.map(x => {
    const ad = x.ilce ? trBaslik(x.ilce) : 'İlçe yok';
    return `<div class="db-i" ${x.ilce ? `data-ilce="${esc(x.ilce)}" tabindex="0"` : ''} title="${esc(ad)}: gelen ${x.gelen}, bizim liste ${x.hedef}">
      <div class="ad">${esc(ad)}</div>
      <div class="iz"><span style="width:${(x.hedef / tepe) * 100}%"></span><i style="width:${(x.gelen / tepe) * 100}%"></i></div>
      <div class="sy">${fmt.sayi(x.gelen)} <small>/ ${fmt.sayi(x.hedef)}</small></div>
    </div>`;
  }).join('');
}

function aracHtml(m) {
  if (!m.kullanim.length) return `<div class="db-yok">Araca atanmış yolcu yok</div>`;
  const tepe = Math.max(1, ...m.kullanim.map(x => x.tasinan + x.yolda));
  return m.kullanim.map(x => {
    const a = x.a, ad = [fmt.plaka(a.plaka), trBaslik(a.sofor_ad || '')].filter(Boolean).join(' · ');
    return `<button type="button" class="db-av" data-arac="${a.id}" title="${esc(ad)}: ${x.atanan} yolcu atanmış, ${x.tasinan} taşındı${x.yolda ? `, ${x.yolda} şu an araçta` : ''}">
      <span class="db-pl"><i></i><b>${esc(fmt.plaka(a.plaka))}</b></span>
      <span class="br"><i class="${a.durum === 'arizali' ? 'ariza' : ''}" style="width:${((x.tasinan + x.yolda) / tepe) * 100}%"></i></span>
      <span class="kisi">${fmt.sayi(x.tasinan)} kişi</span><span class="sef">${fmt.sayi(x.sefer)} sefer</span>
    </button>`;
  }).join('');
}
function bostaHtml(m) {
  return `<span>Boşta bekleyen ${m.bosta.length}:</span>${m.bosta.map(a => `<button type="button" data-arac="${a.id}" title="Aracı aç">${esc(fmt.plaka(a.plaka))}${a.sofor_ad ? ` · ${esc(kisaAd(a.sofor_ad))}` : ''}</button>`).join('')}`;
}

function ulasimHtml(m) {
  const seg = ULASIM_TUR.map(([k, , renk]) => `<div style="flex:${m.ul[k]};background:${renk}"></div>`).join('');
  const oge = ULASIM_TUR.map(([k, ad, renk]) => `<button type="button" class="db-ul-oge ${tercih.ulasim === k ? 'aktif' : ''}" data-ulf="${k}" title="${tercih.ulasim === k ? 'Filtreyi kaldır' : 'Gelmeyenler listesini bu ulaşıma göre süz'}"><span class="e"><i style="background:${renk}"></i>${esc(ad)}</span><span class="d">${fmt.sayi(m.ul[k])}</span></button>`).join('');
  return `<div class="db-baslik" style="text-transform:none">ULAŞIM TÜRÜ · bizim liste</div><div class="db-ul-bar" aria-label="Ulaşım dağılımı">${seg}</div><div class="db-ul-uc">${oge}</div>`;
}

// Kesin bizde henüz gelmeyenler: ulaşım süzgeci önce, durum çipleri sonra
function gelmediSuz(m) {
  const ulf = tercih.ulasim;
  const ulasimli = ulf === 'hepsi' ? m.gelmediHam : m.gelmediHam.filter(f => ulasim(f) === ulf);
  const sayilar = { hepsi: ulasimli.length, yolda: 0, arandi: 0, bekliyor: 0 }; for (const f of ulasimli) sayilar[f.durum]++;
  const liste = tercih.durum === 'hepsi' ? ulasimli : ulasimli.filter(f => f.durum === tercih.durum);
  const dk = m.simdiD;
  const sirali = liste.map(f => ({ f, d: GUN_SIRA[f.durum] ?? 0, g: gecikme(f, dk), s: f.tasima_saati ? dakika(f.tasima_saati) : 9999, a: f.yetkili || f.unvan || '' }))
    .sort((x, y) => (y.d - x.d) || (y.g - x.g) || (x.s - y.s) || kolator.compare(x.a, y.a)).map(x => x.f);
  return { liste: sirali, sayilar };
}
function araBtn(f) {
  const tel = telSec(f);
  return tel ? `<a class="db-ara" href="${fmt.telLink(tel)}" title="${esc(fmt.tel(tel))} numarasını ara">📞 Ara</a>` : `<span class="db-ara yok" title="Telefon yok">📞 Ara</span>`;
}
// Kişiyi referans YA DA başkası karşılar: karşılayan varsa adı ve saati, henüz yolda ve karşılanmadıysa yetkili kullanıcıya "Karşıladım" düğmesi
function karsilamaMeta(f) {
  return f.karsilayan ? ` · <span class="kars">Karşılayan: ${esc(trBaslik(f.karsilayan))}${f.karsilama_zamani ? ` · ${esc(fmt.saat(f.karsilama_zamani))}` : ''}</span>` : '';
}
function karsilaBtn(f) {
  if (f.karsilayan || f.durum !== 'yolda' || !isaretleyebilirMi(f)) return '';
  const ben = referansBenMi(f);
  return `<button type="button" class="db-karsila" data-karsila="${f.id}" title="${ben ? 'Bu kişinin referansısın: karşıladım olarak işaretle' : 'Kişiyi sen karşıladıysan işaretle'}">Karşıladım</button>`;
}
function ogeHtml(f, meta, ekstra = '') {
  const m = meta + karsilamaMeta(f);
  return `<div class="db-oge">
    <div class="ana"><button type="button" class="ad" data-kisi="${f.id}" title="${esc(f.unvan || '')}">${esc(kisiAd(f))}</button><div class="meta" title="${esc(String(m).replace(/<[^>]+>/g, ''))}">${m}</div></div>
    ${ekstra}${karsilaBtn(f)}${araBtn(f)}
  </div>`;
}
function ustHtml(baslik, renk, n) {
  return `<div class="db-baslik" style="color:${renk}">${baslik}</div><div class="n">${fmt.sayi(n)}</div>`;
}
function gelmediCipHtml(sayilar) {
  const cipler = FILTRE_DURUM.map(([k, ad]) => `<button type="button" class="db-cip ${tercih.durum === k ? 'aktif' : ''}" data-dfiltre="${k}">${esc(ad)} <small>${fmt.sayi(sayilar[k] || 0)}</small></button>`);
  if (tercih.ulasim !== 'hepsi') cipler.push(`<button type="button" class="db-cip aktif" data-ulf="hepsi" title="Ulaşım süzgecini kaldır">${esc(ULASIM_TUR.find(u => u[0] === tercih.ulasim)?.[1] || '')} ✕</button>`);
  return cipler.join('');
}
function gelmediHtml(m, liste) {
  if (!m.gelmediHam.length) return m.s.bizde ? `<div class="db-iyi">✓ Kesin bizde listesindeki herkes fuarda ya da oy kullandı</div>` : `<div class="db-yok">Kesin bizde listesinde kimse yok</div>`;
  if (!liste.length) return `<div class="db-yok">Bu süzgeçte kimse yok</div>`;
  return liste.map(f => ogeHtml(f, `${esc(DURUM_AD[f.durum] || f.durum)}${f.referans ? ` · Ref: ${esc(refAd(f.referans))}` : ''}${f.ilce ? ` · ${esc(trBaslik(f.ilce))}` : ''}`)).join('');
}
function gecikenHtml(m) {
  if (!m.geciken.length) return `<div class="db-iyi">✓ Geciken alım yok</div>`;
  return m.geciken.map(({ f, dk }) => {
    const a = aracOf(f), soforTel = a?.sofor_tel && fmt.telLink(a.sofor_tel);
    const meta = [f.tasima_saati ? esc(fmt.saatKisa(f.tasima_saati)) : '', esc(rotaAd(f)), esc(DURUM_AD[f.durum] || f.durum), `<em>+${dk} dk</em>`].filter(Boolean).join(' · ');
    const sofor = soforTel ? `<a class="db-ara" href="${soforTel}" title="Şoförü ara: ${esc(trBaslik(a.sofor_ad || ''))}">Şoför</a>` : '';
    return ogeHtml(f, meta, sofor);
  }).join('');
}
function evrakHtml(m) {
  if (!m.evrak.length) return `<div class="db-iyi">✓ Evrak uyarılı bekleyen yok</div>`;
  return m.evrak.map(f => ogeHtml(f, esc(trBaslik(f.evrak_uyari || f.sicil_notu || '')))).join('');
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
  kok.querySelector('.db')?.style.setProperty('--db-n', m.saatler.length);
  bolum('hero', heroHtml(m));
  bolum('saatlik', saatlikHtml(m));
  bolum('lider', liderHtml(m));
  bolum('ilce', ilceHtml(m));
  bolum('arac', aracHtml(m));
  bolum('bosta', bostaHtml(m));
  bolum('ulasim', ulasimHtml(m));
  const { liste, sayilar } = gelmediSuz(m);
  bolum('gelmedi-ust', ustHtml('KESİN BİZDE · HENÜZ GELMEDİ', 'var(--red)', liste.length));
  bolum('gelmedi-cip', gelmediCipHtml(sayilar));
  bolum('gelmedi', gelmediHtml(m, liste));
  bolum('geciken-ust', ustHtml('◷ GECİKEN ALIMLAR', 'var(--amber-ink)', m.geciken.length));
  bolum('geciken', gecikenHtml(m));
  bolum('evrak-ust', ustHtml('▲ EVRAK UYARILI · GELMEDİ', 'var(--yellow-ink)', m.evrak.length));
  bolum('evrak', evrakHtml(m));
  kok.querySelectorAll('[data-kaydir]').forEach(e => { if (kaydir[e.dataset.kaydir]) e.scrollTop = kaydir[e.dataset.kaydir]; });
}

// ---------------------------------------------------------------- etkileşim (olay devri, bir kez)
function tikla(e) {
  if (e.target.closest('[data-isaretle]')) { paletAc(); return; }
  if (e.target.closest('a[href]')) return;                         // Ara / Şoför bağlantıları kendi işini yapar, kartı açmaz
  const tam = e.target.closest('[data-tam]');
  if (tam) { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {}); return; }
  const ka = e.target.closest('[data-karsila]');
  if (ka) {
    const id = Number(ka.dataset.karsila); ka.disabled = true;
    karsiladim(id).then(geriAl => toast('Karşılandı olarak işaretlendi', { tur: 'basari', geriAl })).catch(err => { ka.disabled = false; hataGoster(err); });
    return;
  }
  const df = e.target.closest('[data-dfiltre]');
  if (df) { tercih.durum = df.dataset.dfiltre; tercihKaydet(); guncelle(); return; }
  const uf = e.target.closest('[data-ulf]');
  if (uf) { const k = uf.dataset.ulf; tercih.ulasim = tercih.ulasim === k ? 'hepsi' : k; tercihKaydet(); guncelle(); return; }
  const k = e.target.closest('[data-kisi]');
  if (k) { kisiKartiAc(Number(k.dataset.kisi)); return; }
  const ar = e.target.closest('[data-arac]');
  if (ar) { location.hash = '#araclar/' + ar.dataset.arac; return; }
  const r = e.target.closest('[data-ref]');
  if (r && r.dataset.ref) { location.hash = '#kisiler/' + encodeURIComponent(r.dataset.ref); return; }
  const i = e.target.closest('[data-ilce]');
  if (i && i.dataset.ilce) location.hash = '#kisiler/' + encodeURIComponent(i.dataset.ilce);
}
function tus(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const hedef = e.target.closest?.('[data-ref], [data-ilce]');
  if (!hedef || hedef !== e.target) return;
  e.preventDefault(); tikla({ target: hedef });
}
function tamEkranDegisti() { onbellek.delete('hero'); guncelle(); }

export default {
  async render(k) {
    kok = k; onbellek.clear();
    stilEkle();
    kok.classList.add('db-tam');
    kok.innerHTML = iskeletHtml();
    kok.addEventListener('click', tikla);
    kok.addEventListener('keydown', tus);
    document.addEventListener('fullscreenchange', tamEkranDegisti);
    guncelle();
  },
  yenile(sebep) {
    if (!kok || YOKSAY.has(sebep)) return;
    guncelle();
  },
  temizle() {
    document.removeEventListener('fullscreenchange', tamEkranDegisti);
    kok?.removeEventListener('click', tikla); kok?.removeEventListener('keydown', tus);
    kok?.classList.remove('db-tam');
    kok = null; model = null; onbellek.clear();
  },
};
