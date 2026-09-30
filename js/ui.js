// 72. Komite · Seçim Masası · ORTAK ARAYÜZ BİLEŞENLERİ (ATLAS, 2026-09-30)
// Rozetler, toast + geri al, çekmece, modal, onay kutusu, Cmd+K hızlı arama ve KİŞİ KARTI (her ekrandan açılır).
// Kişi Kartı, ⌘K paleti ve toast Claude Design tasarımına (SM KisiKarti / Seçim Masası kabuğu) birebir uyar; stiller aşağıdaki STIL bloğunda.
import {
  store, bus, sb, esc, fmt, trBaslik, trKucuk, trArama, DURUMLAR, DURUM_AD, SINIFLAR, SINIF_AD, ARAC_DURUM_AD, GERI_SAYIM,
  gecikme, kisiGrubu, ulasim, aracOf, ekip,
  durumYap, sinifYap, notEkle, aracAta, sorumluAta, yazabilirMi, isaretleyebilirMi, aramaEslesir, firmaListesi, firmaAdi,
  karsiladim, referansBenMi, ROL_AD, oyOnaylayabilirMi, oyBekliyor, oyOnayla, oyReddet,
} from './core.js';

// ---------------------------------------------------------------- küçük yardımcılar
export const $ = (s, k = document) => k.querySelector(s);
export const $$ = (s, k = document) => [...k.querySelectorAll(s)];
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const bas = s => (String(s || '').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2)).toLocaleUpperCase('tr');
/** "Tarık Balcı" -> "Tarık B." */
export function kisaAd(ad) {
  const w = trBaslik(ad || '').trim().split(/\s+/).filter(Boolean);
  return !w.length ? '' : w.length > 1 ? `${w[0]} ${w[w.length - 1].charAt(0).toLocaleUpperCase('tr')}.` : w[0];
}
const ilkBuyuk = s => { s = String(s || ''); return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1); };
const buyuk = s => String(s ?? '').toLocaleUpperCase('tr');
/** "Harun Bulan" -> "Harun Bulan'ın" (ilgi eki, ünlü uyumu) */
function tamlama(ad) {
  const s = trBaslik(ad || '').trim(); if (!s) return '';
  const h = trKucuk(s).replace(/[^a-zçğıöşüâîû]/g, ''); const unlu = 'aeıioöuüâîû';
  let son = ''; for (const c of h) if (unlu.includes(c)) son = c;
  const ek = { a: 'ın', ı: 'ın', â: 'ın', e: 'in', i: 'in', î: 'in', o: 'un', u: 'un', û: 'un', ö: 'ün', ü: 'ün' }[son] || 'in';
  return `${s}'${unlu.includes(h.slice(-1)) ? 'n' : ''}${ek}`;
}
const rolAdi = ad => { for (const p of store.profiller.values()) if (p.ad_soyad === ad) return p.rol; return null; };

// ---------------------------------------------------------------- tasarım stilleri (Kişi Kartı, ⌘K paleti, toast, kaynak çipi)
const STIL = `
/* ---- ortak rozet (tasarım rozet tabanı) ---- */
.sm-b { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:6px; font-size:11px; font-weight:700; letter-spacing:.03em; white-space:nowrap; box-sizing:border-box; line-height:1; font-variant-numeric:tabular-nums; }
.sm-b.v-bizde { background:var(--red); color:var(--on-red); border:1.5px solid var(--red); }
.sm-b.v-yolda { background:transparent; color:var(--red); border:1.5px solid var(--red); }
.sm-b.v-belirsiz { background:var(--gray-soft); color:var(--ink-2); border:1.5px solid var(--gray-soft); }
.sm-b.v-karsi { background:var(--karsi); color:var(--karsi-ink); border:1.5px solid var(--karsi); }
.sm-b.v-oy_yok { background:var(--surface-3); color:var(--ink-3); border:1.5px solid var(--line); text-decoration:line-through; }
.sm-b.g-bekliyor { background:var(--gray-soft); color:var(--ink-2); border:1.5px solid var(--gray-soft); }
.sm-b.g-arandi { background:var(--blue-soft); color:var(--blue); border:1.5px solid var(--blue-soft); }
.sm-b.g-yolda { background:var(--amber-soft); color:var(--amber-ink); border:1.5px solid var(--amber-soft); }
.sm-b.g-fuarda { background:var(--violet-soft); color:var(--violet); border:1.5px solid var(--violet-soft); }
.sm-b.g-oy_kullandi { background:var(--green); color:#fff; border:1.5px solid var(--green); }
.sm-b.ul { background:transparent; color:var(--ink-2); border:1px solid var(--line-2); font-weight:600; }
.sm-b.ul-yok { color:var(--amber-ink); border-color:var(--amber); }
.sm-b.b-gec { background:var(--amber-soft); color:var(--amber-ink); border:1.5px solid var(--amber); animation:smPulse 1.6s ease-in-out infinite; }
.sm-b.b-evrak { background:var(--yellow-soft); color:var(--yellow-ink); border:1.5px solid var(--yellow); }
.sm-b.b-2oy { background:var(--surface); color:var(--ink); border:1.5px solid var(--ink); }
.sm-b.b-top { background:transparent; color:var(--ink-2); border:1px solid var(--line-2); font-weight:600; padding:0 6px; }
.sm-b.va-hazir { background:var(--green-soft); color:var(--green); border:1.5px solid var(--green-soft); }
.sm-b.va-yolda { background:var(--amber-soft); color:var(--amber-ink); border:1.5px solid var(--amber-soft); }
.sm-b.va-fuarda { background:var(--violet-soft); color:var(--violet); border:1.5px solid var(--violet-soft); }
.sm-b.va-mola { background:var(--gray-soft); color:var(--ink-2); border:1.5px solid var(--gray-soft); }
.sm-b.va-arizali { background:var(--amber); color:#1a1200; border:1.5px solid var(--amber); }

/* ---- veri kaynağı çipi (tasarım SRC_STYLE) ---- */
.kaynak-cip, .kk-src { display:inline-flex; align-items:center; gap:4px; height:20px; padding:0 7px; border-radius:5px; font-size:10.5px; font-weight:600; white-space:nowrap; cursor:default; box-sizing:border-box; line-height:1; background:var(--surface-3); color:var(--ink-2); border:1px solid var(--surface-3); }
.kaynak-cip.src-atlas, .kk-src.src-atlas { background:var(--ink); color:var(--surface); border:1px solid var(--ink); }
.kaynak-cip.src-konum, .kk-src.src-konum { background:transparent; color:var(--ink-2); border:1px dashed var(--line-2); }
.kaynak-cip.src-surucu, .kk-src.src-surucu { background:var(--surface); color:var(--ink-2); border:1px solid var(--line-2); }
.kaynak-cip.src-excel, .kk-src.src-excel { background:var(--surface-3); color:var(--ink-2); border:1px solid var(--surface-3); font-style:italic; }

/* ---- çekmece arka planı ---- */
.cekmece-arka { background:var(--scrim); }

/* ---- KİŞİ KARTI (sağdan 660px) ---- */
.cekmece.kk { line-height:normal; width:min(660px, 100vw); background:var(--surface); color:var(--ink); border-left:1px solid var(--line); box-shadow:var(--shadow-lg); display:flex; flex-direction:column; font-family:'Inter',system-ui,sans-serif; animation:smIn .18s ease-out; }
.kk-ust { flex:none; padding:18px 22px 14px; border-bottom:1px solid var(--line); display:flex; flex-direction:column; gap:10px; }
.kk-ust-satir { display:flex; align-items:flex-start; gap:12px; }
.kk-ad-kol { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.kk-etiket { font-size:11px; font-weight:700; letter-spacing:.1em; color:var(--ink-3); white-space:nowrap; }
.kk-ad { font-size:26px; font-weight:900; letter-spacing:-.02em; line-height:1.1; overflow-wrap:anywhere; }
.kk-firma { font-size:13.5px; color:var(--ink-2); line-height:1.4; text-wrap:pretty; }
.kk-kapat { flex:none; width:36px; height:36px; border-radius:9px; border:1px solid var(--line-2); background:var(--surface); color:var(--ink); font-size:18px; cursor:pointer; }
.kk-kapat:hover { background:var(--hover); }
.kk-rozetler { display:flex; flex-wrap:wrap; align-items:center; gap:6px; position:relative; }
.kk-sinif-btn { border:0; padding:0; background:none; cursor:pointer; display:flex; align-items:center; gap:4px; }
.kk-alt-yazi { font-size:12px; color:var(--ink-3); white-space:nowrap; }
.cekmece.kk .cekmece-govde { flex:1; min-height:0; overflow:auto; padding:16px 22px calc(24px + env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:16px; }
.kk-uyari { display:flex; gap:12px; align-items:flex-start; padding:12px 14px; border-radius:11px; background:var(--yellow-soft); border:1.5px solid var(--yellow); }
.kk-uyari .ikon { flex:none; font-size:20px; line-height:1; color:var(--yellow); }
.kk-uyari .kol { display:flex; flex-direction:column; gap:2px; min-width:0; }
.kk-uyari .bas { font-size:12px; font-weight:900; letter-spacing:.1em; color:var(--yellow-ink); white-space:nowrap; }
.kk-uyari .metin { font-size:14px; font-weight:600; color:var(--ink); line-height:1.4; overflow-wrap:anywhere; }
.kk-uyari .alt { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.kk-uyari .alt > span:first-child { font-size:12px; color:var(--ink-2); }
.kk-ikioy { display:flex; gap:12px; align-items:center; padding:10px 14px; border-radius:11px; border:1.5px solid var(--ink); background:var(--surface-2); }
.kk-ikioy .et { flex:none; font-size:13px; font-weight:900; letter-spacing:.04em; border:1.5px solid var(--ink); border-radius:6px; padding:3px 7px; }
.kk-ikioy .yazi { font-size:13.5px; line-height:1.4; }
.kk-ikioy a { font-weight:700; cursor:pointer; }
.kk-ikioy a:hover { text-decoration:underline; }
.kk-ikioy .sm-b { height:18px; font-size:10px; padding:0 6px; margin-left:4px; vertical-align:1px; }
.kk-bolum { display:flex; flex-direction:column; gap:10px; }
.kk-bolum-ust { display:flex; align-items:center; }
.kk-baslik { font-size:11px; font-weight:800; letter-spacing:.1em; white-space:nowrap; }
.kk-ipucu { margin-left:auto; font-size:12px; color:var(--ink-3); white-space:nowrap; }
.kk-adimlar { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:6px; }
.kk-adim { height:84px; border-radius:11px; cursor:pointer; padding:10px; display:flex; flex-direction:column; align-items:flex-start; justify-content:space-between; text-align:left; font-family:inherit; }
.kk-adim:disabled { cursor:default; }
.kk-adim.cur { background:var(--c); color:#fff; border:1.5px solid var(--c); }
.kk-adim.done { background:var(--s); color:var(--i); border:1.5px solid var(--s); }
.kk-adim.todo { background:var(--surface); color:var(--ink-3); border:1.5px dashed var(--line-2); }
.kk-adim.todo:not(:disabled):hover { border-color:var(--ink-3); }
.kk-adim .nokta { width:22px; height:22px; border-radius:99px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; }
.kk-adim.cur .nokta { background:rgba(255,255,255,.25); color:#fff; }
.kk-adim.done .nokta { background:var(--c); color:#fff; }
.kk-adim.todo .nokta { background:var(--surface-3); color:var(--ink-3); }
.kk-adim .ad { font-size:13px; font-weight:800; line-height:1.15; }
.kk-adim .saat { font-size:11px; font-weight:600; opacity:.8; font-variant-numeric:tabular-nums; min-height:13px; }
.kk-adim-alt { display:flex; gap:8px; }
.kk-kendi { flex:1; height:48px; border-radius:10px; border:1.5px solid var(--green); background:var(--green-soft); color:var(--green); font-size:14.5px; font-weight:800; cursor:pointer; }
.kk-geri { flex:none; height:48px; padding:0 16px; border-radius:10px; border:1px solid var(--line-2); background:var(--surface); color:var(--ink); font-size:13.5px; font-weight:700; cursor:pointer; white-space:nowrap; max-width:60%; overflow:hidden; text-overflow:ellipsis; }
.kk-eylemler { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px; }
.kk-eylem { height:46px; border-radius:10px; border:1px solid var(--line-2); color:var(--ink); display:flex; align-items:center; justify-content:center; gap:7px; font-size:13.5px; font-weight:700; text-decoration:none; white-space:nowrap; background:transparent; }
.kk-eylem.ana { background:var(--ink); color:var(--surface); border:0; font-size:14px; font-weight:800; }
.kk-eylem.pasif { opacity:.4; cursor:default; }
a.kk-eylem:not(.pasif):hover { background:var(--hover); }
a.kk-eylem.ana:not(.pasif):hover { background:var(--ink); opacity:.88; }
.kk-alma { display:flex; gap:10px; align-items:baseline; padding:10px 14px; border-radius:11px; border:1.5px solid var(--red); background:var(--red-soft); }
.kk-alma .et { flex:none; font-size:11px; font-weight:900; letter-spacing:.1em; color:var(--red); white-space:nowrap; }
.kk-alma .yazi { font-size:14px; font-weight:700; overflow-wrap:anywhere; }
.kk-kutu { position:relative; display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:11px; border:1px solid var(--line); background:var(--surface-2); }
.kk-kutu-et { flex:none; font-size:10.5px; font-weight:800; letter-spacing:.1em; color:var(--ink-3); white-space:nowrap; }
.kk-kutu-orta { flex:1; min-width:0; border:0; background:none; padding:0; text-align:left; font-family:inherit; color:var(--ink); display:flex; flex-direction:column; line-height:1.25; }
button.kk-kutu-orta { cursor:pointer; }
.kk-kutu-orta .u { font-size:13.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kk-kutu-orta .a { font-size:12px; color:var(--ink-3); font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kk-kutu-yok { flex:1; font-size:13.5px; color:var(--ink-2); }
.kk-kutu-yok.uyar { color:var(--amber-ink); font-weight:600; }
.kk-mini { flex:none; white-space:nowrap; height:34px; padding:0 10px; border-radius:8px; border:1px solid var(--line-2); color:var(--ink); background:var(--surface); display:flex; align-items:center; font-size:12.5px; font-weight:700; cursor:pointer; text-decoration:none; }
.kk-mini.gen { padding:0 12px; }
.kk-mini:hover { background:var(--hover); }
.kk-plaka { display:inline-flex; align-items:stretch; height:28px; border:1.5px solid #111; border-radius:4px; background:#fff; overflow:hidden; flex:none; }
.kk-plaka i { width:11px; background:#1F4FA8; }
.kk-plaka b { padding:0 8px; display:flex; align-items:center; font-size:15px; font-weight:800; letter-spacing:.05em; color:#111; white-space:nowrap; }
.kk-plaka.k { height:20px; border-width:1.2px; border-radius:3px; }
.kk-plaka.k i { width:7px; }
.kk-plaka.k b { padding:0 5px; font-size:11px; }
.kk-avatar { flex:none; width:30px; height:30px; border-radius:99px; background:var(--ink); color:var(--surface); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; }
.kk-menu { position:absolute; z-index:10; background:var(--surface); border:1px solid var(--line-2); border-radius:10px; box-shadow:var(--shadow-lg); padding:6px; display:flex; flex-direction:column; gap:2px; }
.kk-menu.sinif { top:28px; left:0; width:230px; }
.kk-menu.arac { top:52px; right:10px; width:330px; max-width:calc(100% - 20px); max-height:300px; overflow:auto; }
.kk-menu.sorumlu { top:52px; right:10px; width:280px; max-width:calc(100% - 20px); max-height:300px; overflow:auto; }
.kk-menu-baslik { font-size:10.5px; font-weight:700; letter-spacing:.08em; color:var(--ink-3); padding:6px 8px 4px; white-space:nowrap; }
.kk-menu-oge { display:flex; align-items:center; gap:8px; padding:7px 8px; border:0; border-radius:7px; background:transparent; cursor:pointer; text-align:left; font-family:inherit; color:var(--ink); }
.kk-menu-oge:hover, .kk-menu-oge.sec { background:var(--hover); }
.kk-menu-oge .ad { flex:1; min-width:0; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kk-menu-oge .ad .s { color:var(--ink-3); }
.kk-menu-oge .tik { margin-left:auto; font-size:12px; color:var(--ink-3); }
.kk-menu-oge .ini { width:24px; height:24px; flex:none; border-radius:99px; background:var(--surface-3); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; }
.kk-menu-oge .ad13 { flex:1; font-size:13px; font-weight:600; }
.kk-menu-oge .yuk { font-size:11.5px; color:var(--ink-3); white-space:nowrap; }
.kk-menu-son { padding:8px; border:0; border-top:1px solid var(--line); background:transparent; color:var(--ink-2); font-size:12.5px; font-weight:600; cursor:pointer; text-align:left; font-family:inherit; }
.kk-menu-son:hover { color:var(--ink); }
.kk-zincir { display:flex; flex-wrap:wrap; align-items:center; gap:4px 2px; }
.kk-zincir .oge { display:flex; align-items:center; gap:2px; }
.kk-zincir .ok { color:var(--ink-3); font-size:12px; padding:0 2px; }
.kk-cip { display:inline-flex; gap:3px; align-items:center; height:24px; padding:0 8px; border-radius:6px; font-size:11.5px; white-space:nowrap; border:0; }
.kk-cip b { font-weight:800; }
.kk-cip span { opacity:.75; }
.kk-cip.cd { background:var(--amber-soft); color:var(--amber-ink); }
.kk-cip.seen { background:var(--surface-3); color:var(--ink-2); }
.kk-cip.answer { background:var(--green-soft); color:var(--green); }
.kk-cip.reminder { background:var(--blue-soft); color:var(--blue); }
.kk-cip.missed { background:var(--amber); color:#1a1200; border:1.5px solid var(--amber); animation:smPulse 1.6s ease-in-out infinite; }
.kk-atlas { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.kk-atlas .rozet { flex:none; width:24px; height:24px; border-radius:99px; background:#C8102E; color:#fff; display:flex; align-items:center; justify-content:center; font-size:6.5px; font-weight:900; letter-spacing:.04em; }
.kk-atlas .et { font-size:12px; font-weight:800; letter-spacing:.06em; white-space:nowrap; }
.kk-atlas button { height:30px; padding:0 11px; border-radius:99px; border:1px solid var(--line-2); background:var(--surface); color:var(--ink); font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.kk-atlas button:hover { background:var(--hover); }
.kk-gruplar { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.kk-grup { display:flex; flex-direction:column; gap:6px; padding:12px 14px; border-radius:11px; border:1px solid var(--line); background:var(--surface-2); min-width:0; }
.kk-grup.tam { grid-column:1 / -1; }
.kk-grup .gb { font-size:10.5px; font-weight:800; letter-spacing:.1em; color:var(--ink-3); white-space:nowrap; }
.kk-satir { display:grid; grid-template-columns:104px minmax(0,1fr); gap:8px; font-size:13px; line-height:1.4; }
.kk-satir .k { color:var(--ink-3); }
.kk-satir .v { color:var(--ink); overflow-wrap:anywhere; }
.kk-satir .v.s { font-weight:700; }
.kk-satir .v.w { font-weight:700; color:var(--yellow-ink); }
.kk-satir .v.tb { font-variant-numeric:tabular-nums; }
.kk-satir .v a { color:inherit; }
.kk-satir .v a:hover { text-decoration:underline; }
.kk-not-form { display:flex; gap:8px; }
.kk-not-girdi { flex:1; min-width:0; height:40px; box-sizing:border-box; padding:0 12px; border-radius:9px; border:1px solid var(--line-2); background:var(--surface-2); color:var(--ink); font-size:13.5px; outline:none; }
.kk-not-girdi:focus { border-color:var(--red); }
.kk-not-ekle { height:40px; padding:0 14px; border-radius:9px; border:0; background:var(--ink); color:var(--surface); font-size:13px; font-weight:700; cursor:pointer; }
.kk-not { padding:9px 12px; border-radius:9px; background:var(--surface-2); border:1px solid var(--line); display:flex; flex-direction:column; gap:2px; }
.kk-not .m { font-size:13.5px; overflow-wrap:anywhere; white-space:pre-wrap; }
.kk-q-kap { position:relative; align-self:flex-start; }
.kk-q { display:none; position:absolute; left:0; top:24px; z-index:12; width:320px; max-width:calc(100vw - 60px); padding:9px 11px; border-radius:9px; background:#17171a; color:#fff; font-size:12.5px; line-height:1.45; box-shadow:var(--shadow-lg); white-space:normal; font-style:normal; }
.kk-q-kap:hover .kk-q, .kk-q-kap.ac .kk-q { display:block; }
.kk-gecmis { display:flex; flex-direction:column; }
.kk-g-satir { display:grid; grid-template-columns:44px 16px minmax(0,1fr); gap:8px; min-height:34px; }
.kk-g-satir .z { font-size:12px; font-weight:700; color:var(--ink-3); font-variant-numeric:tabular-nums; padding-top:1px; }
.kk-g-satir .ray { position:relative; display:flex; justify-content:center; }
.kk-g-satir .ray::before { content:''; position:absolute; top:12px; bottom:-2px; width:1.5px; background:var(--line-2); }
.kk-g-satir .dot { position:relative; margin-top:4px; width:10px; height:10px; border-radius:99px; box-sizing:border-box; background:var(--surface); border:2px solid var(--ink-3); }
.kk-g-satir .dot.gun { background:var(--dc); border:0; }
.kk-g-satir .ic { display:flex; flex-direction:column; align-items:flex-start; gap:4px; padding-bottom:10px; min-width:0; }
.kk-g-satir .m { font-size:13px; line-height:1.35; overflow-wrap:anywhere; }
.kk-bosyazi { font-size:13px; color:var(--ink-3); }
@media (max-width:520px) {
  .kk-ust { padding:14px 16px 12px; }
  .cekmece.kk .cekmece-govde { padding-left:16px; padding-right:16px; }
  .kk-ad { font-size:23px; }
  .kk-adimlar { gap:4px; }
  .kk-adim { padding:8px 6px; }
  .kk-adim .ad { font-size:12px; }
  .kk-adim .nokta { width:20px; height:20px; }
  .kk-eylemler { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .kk-gruplar { grid-template-columns:1fr; }
  .kk-satir { grid-template-columns:96px minmax(0,1fr); }
  .kk-kutu { flex-wrap:wrap; }
  .kk-geri { max-width:none; flex:1; }
  .kk-adim-alt { flex-wrap:wrap; }
}

/* ---- ⌘K PALETİ (720px, 22px giriş) ---- */
.palet { line-height:normal; position:fixed; top:clamp(24px, 12vh, 110px); left:0; right:0; margin:0 auto; transform:none; width:min(720px, calc(100vw - 24px)); background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:var(--shadow-lg); z-index:110; overflow:hidden; animation:smIn .16s ease-out; }
.palet .pl-ust { display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid var(--line); }
.palet .pl-ikon { font-size:22px; color:var(--ink-3); line-height:1; }
.palet .pl-girdi { flex:1; min-width:0; width:auto; height:auto; padding:0; border:0; outline:0; box-shadow:none; background:transparent; font-size:22px; font-weight:600; color:var(--ink); }
.palet .pl-esc { font-size:11px; font-weight:700; color:var(--ink-3); border:1px solid var(--line-2); border-radius:5px; padding:3px 6px; }
.palet .palet-liste { display:flex; flex-direction:column; padding:6px; max-height:calc(100vh - 260px); overflow:auto; }
.palet .palet-liste.bilgi { padding:0; }
.palet .palet-satir { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:10px; border-bottom:0; cursor:pointer; background:transparent; }
.palet .palet-satir:hover { background:transparent; }
.palet .palet-satir.secili { background:var(--hover); outline:1.5px solid var(--line-2); }
.pl-sol { flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
.pl-ad-satir { display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden; }
.pl-ad { flex:0 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:17px; font-weight:800; color:var(--ink); }
.pl-rozetler { flex:none; display:flex; gap:6px; }
.pl-yan { font-size:12.5px; color:var(--ink-2); white-space:nowrap; display:flex; min-width:0; }
.pl-yan .un { overflow:hidden; text-overflow:ellipsis; min-width:0; flex:0 1 auto; }
.pl-yan .kalan { flex:none; white-space:pre; }
.pl-kart { flex:none; height:40px; padding:0 12px; border-radius:9px; border:1px solid var(--line-2); background:var(--surface); color:var(--ink); font-size:13px; font-weight:600; cursor:pointer; }
.pl-oy { flex:none; height:40px; padding:0 16px; border-radius:9px; border:0; background:var(--green); color:#fff; font-size:14px; font-weight:800; cursor:pointer; white-space:nowrap; }
.pl-oy span { opacity:.75; font-weight:600; }
.pl-zaten { flex:none; width:150px; text-align:center; font-size:12.5px; font-weight:700; color:var(--green); }
.pl-bilgi { padding:22px 20px; display:flex; flex-direction:column; gap:6px; }
.pl-bilgi .b1 { font-size:14px; font-weight:600; color:var(--ink-2); }
.pl-bilgi .b2 { font-size:13px; color:var(--ink-3); }
.pl-bilgi b { color:var(--ink); }
.pl-bilgi.yok { font-size:14px; color:var(--ink-2); }
.palet .pl-ayak { display:flex; gap:16px; padding:10px 20px; border-top:1px solid var(--line); background:var(--surface-2); font-size:12px; color:var(--ink-3); }
.palet .pl-ayak span { white-space:nowrap; }
.palet .pl-ayak .sag { margin-left:auto; }
@media (max-width:640px) {
  .palet .palet-satir { flex-wrap:wrap; }
  .pl-sol { flex-basis:100%; }
  .pl-oy { flex:1; }
  .pl-zaten { width:auto; flex:1; text-align:right; }
  .palet .pl-ayak { flex-wrap:wrap; gap:6px 14px; }
  .palet .pl-ayak .sag { margin-left:0; }
  .palet .pl-girdi { font-size:19px; }
}
`;
(function stilEkle() {
  if (document.querySelector('style[data-ekran="ui-tasarim"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'ui-tasarim'; s.textContent = STIL; document.head.appendChild(s);
})();

// ---------------------------------------------------------------- rozetler
export const rozetSinif = s => `<span class="rozet s-${esc(s)}">${esc(SINIF_AD[s] || s)}</span>`;
export const rozetDurum = f => (f.kendi_geldi && f.durum === 'oy_kullandi'
  ? `<span class="rozet d-oy_kullandi">Kendi geldi · oy</span>`
  : `<span class="rozet d-${esc(f.durum)}">${esc(DURUM_AD[f.durum] || f.durum)}</span>`) + (oyBekliyor(f) ? `<span class="rozet o-bekliyor" style="margin-left:4px" title="${esc(trBaslik(f.oy_bildiren))} bildirdi, masa onayı bekliyor">Oy bildirildi</span>` : '');
export const rozetAracDurum = d => `<span class="rozet a-${esc(d)}">${esc(ARAC_DURUM_AD[d] || d)}</span>`;
export const plakaHtml = (p, buyuk = false) => p ? `<span class="plaka${buyuk ? ' buyuk' : ''}"><span>${esc(fmt.plaka(p))}</span></span>` : '';
export function uyariRozetleri(f, { hepsi = true } = {}) {
  const r = [];
  const g = gecikme(f); if (g) r.push(`<span class="rozet u-gecikti" title="Saati geçti">${g} dk gecikti</span>`);
  if (f.evrak_uyari) r.push(`<span class="rozet u-evrak" title="${esc(f.evrak_uyari)}">Evrak</span>`);
  if (f.kisi_oy_sayisi > 1) r.push(`<span class="rozet u-2oy" title="Aynı kişi ${f.kisi_oy_sayisi} firmayla oy kullanıyor">${f.kisi_oy_sayisi} OY</span>`);
  if (hepsi && f.toplulukta) r.push(`<span class="rozet u-topluluk" title="WhatsApp topluluğunda">Toplulukta</span>`);
  if (hepsi) { const u = ulasim(f); r.push(u === 'servis' ? `<span class="rozet u-servis">Servis${f.tasima_saati ? ' ' + fmt.saatKisa(f.tasima_saati) : ''}</span>` : u === 'kendi' ? `<span class="rozet u-kendi">Kendi gelecek</span>` : (f.oy_sinifi === 'bizde' ? `<span class="rozet u-ulasimyok">Ulaşım yok</span>` : '')); }
  return r.join(' ');
}
export function halka(yuzde, etiket) { return `<div class="halka" style="--p:${Math.max(0, Math.min(100, yuzde))}" data-deger="${esc(etiket ?? yuzde + '%')}"></div>`; }
export function cubuk(yuzde, sinif = '') { return `<div class="cubuk ${sinif}"><i style="width:${Math.max(0, Math.min(100, yuzde))}%"></i></div>`; }

// ---------------------------------------------------------------- veri kaynağı çipi (tasarım: El ile · Ayşe K. · 10:42 / ATLAS · X'in mesajından · 10:40 / Excel aktarımı / Konum · şoför telefonu / Sürücü uygulaması)
function kaynakTur(o) {
  return o.kaynak === 'asistan' ? 'atlas' : o.kaynak === 'excel' ? 'excel' : o.kaynak === 'konum' ? 'konum' : o.kaynak === 'sistem' ? 'sistem' : (rolAdi(o.kim_ad) === 'sofor' ? 'surucu' : 'el');
}
function kaynakEtiket(o) {
  const t = fmt.saat(o.zaman), k = kaynakTur(o), kim = o.kim_ad && o.kim_ad !== 'sistem' && o.kim_ad !== 'ATLAS' ? o.kim_ad : '';
  if (k === 'atlas') return kim ? `ATLAS · ${tamlama(kim)} mesajından · ${t}` : `ATLAS · asistan · ${t}`;
  if (k === 'surucu') return `Sürücü uygulaması · ${kisaAd(kim)} · ${t}`;
  if (k === 'konum') return `Konum · şoför telefonu · ${t}`;
  if (k === 'excel') return `Excel aktarımı · ${o.zaman ? new Date(o.zaman).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : ''}`;
  if (k === 'sistem') return `Sistem · ${t}`;
  return `El ile · ${kisaAd(o.kim_ad) || '?'} · ${t}`;
}
function kaynakAlinti(o) {
  const k = kaynakTur(o);
  if (o.kaynak_metin === 'geri alındı') return 'Önceki işaret geri alındı.';
  if (o.kaynak_metin) return `“${o.kaynak_metin}”${k === 'atlas' && o.kim_ad && o.kim_ad !== 'sistem' ? ' · ' + o.kim_ad : ''}`;
  return { excel: 'Excel listesinden aktarıldı.', konum: 'Şoför telefonunun konum paylaşımından otomatik kaydedildi.', surucu: 'Sürücü telefon ekranındaki düğmeyle işaretlendi.', atlas: 'ATLAS asistanı işledi.', sistem: 'Sistem tarafından yazıldı.' }[k] || 'Elle işaretlendi.';
}
export function kaynakCip(o) {
  const k = kaynakTur(o);
  return `<span class="kaynak-cip src-${k}${k === 'atlas' ? ' atlas' : ''}" title="${esc(kaynakAlinti(o))}">${esc(kaynakEtiket(o))}</span>`;
}

// ---------------------------------------------------------------- toast (siyah, alt orta, 5 sn geri al çubuğu)
const NOKTA = { oy: 'var(--green)', oy_kullandi: 'var(--green)', undo: '#8b8b94', vote: '#E3213F', online: '#34C46A', bekliyor: 'var(--ink-3)', arandi: 'var(--blue)', yolda: 'var(--amber)', fuarda: 'var(--violet)' };
export function toast(metin, { tur = '', geriAl = null, sure = 5000, nokta = null, geriAlMetin = 'Geri alındı' } = {}) {
  const renk = NOKTA[nokta] || nokta || (tur === 'hata' ? 'var(--amber)' : tur === 'basari' ? '#34C46A' : '#8b8b94');
  const t = el(`<div class="toast ${esc(tur)}"><i class="t-nokta" style="background:${renk}"></i><span class="t-metin">${esc(metin)}</span>${geriAl ? '<button data-geri>Geri al</button>' : ''}<i class="t-sure" style="animation-duration:${sure}ms"></i></div>`);
  const kap = $('#toastlar');
  kap.appendChild(t);
  while (kap.children.length > 3) kap.firstElementChild.remove();
  const kaldir = () => t.remove();
  if (geriAl) t.querySelector('[data-geri]').onclick = async () => { kaldir(); try { await geriAl(); toast(geriAlMetin, { nokta: 'undo' }); } catch (e) { toast(e.message, { tur: 'hata' }); } };
  setTimeout(kaldir, sure);
}
export const hataGoster = e => toast(e?.message || String(e), { tur: 'hata', sure: 7000 });

// ---------------------------------------------------------------- katman: çekmece, modal, onay
export function cekmeceAc(icerikHtml, { kapaninca } = {}) {
  cekmeceKapat();
  const arka = el('<div class="cekmece-arka" data-cekmece></div>');
  const c = el(`<aside class="cekmece" data-cekmece role="dialog">${icerikHtml}</aside>`);
  arka.onclick = cekmeceKapat;
  $('#katman').append(arka, c);
  c._kapaninca = kapaninca;
  return c;
}
export function cekmeceKapat() { $$('[data-cekmece]', $('#katman')).forEach(x => { x._kapaninca?.(); x.remove(); }); }
export function modal(baslik, govdeHtml, altHtml = '') {
  modalKapat();
  const m = el(`<div class="modal-arka" data-modal><div class="modal" role="dialog"><div class="modal-ust">${esc(baslik)}<button class="btn btn-hayalet btn-kucuk" style="margin-left:auto" data-kapat>✕</button></div><div class="modal-govde">${govdeHtml}</div>${altHtml ? `<div class="modal-alt">${altHtml}</div>` : ''}</div></div>`);
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-kapat]')) modalKapat(); });
  $('#katman').append(m); return m;
}
export function modalKapat() { $$('[data-modal]', $('#katman')).forEach(x => x.remove()); }
export function onayla(metin, { evet = 'Evet', hayir = 'Vazgeç', tehlike = false } = {}) {
  return new Promise(res => {
    const m = modal('Onay', `<p style="margin:0;font-weight:600">${esc(metin)}</p>`, `<button class="btn" data-h>${esc(hayir)}</button><button class="btn ${tehlike ? 'btn-kirmizi' : 'btn-koyu'}" data-e>${esc(evet)}</button>`);
    m.querySelector('[data-h]').onclick = () => { modalKapat(); res(false); };
    m.querySelector('[data-e]').onclick = () => { modalKapat(); res(true); };
  });
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('[data-modal]')) modalKapat();
  else if ($('.palet')) paletKapat();
  else if (KK.menu && acikKisi != null) { KK.menu = null; kisiKartiYenile(); }   // önce açık menü kapanır, sonra kart
  else cekmeceKapat();
});

// ---------------------------------------------------------------- işaretleme (ortak): 2 oylu kişide tüm firmalarını sorar
const FIIL = { bekliyor: 'bekliyor', arandi: 'arandı', yolda: 'yola çıktı', fuarda: 'fuara geldi', oy_kullandi: 'oy kullandı' };
const SIRA_UI = ['bekliyor', 'arandi', 'yolda', 'fuarda', 'oy_kullandi'];
const sonGeriAl = new Map();   // firma id -> { fn, durum, fiil, t }: kişi kartındaki kalıcı "Geri al" düğmesi
// Yanlış dokunuşa karşı: kişi zaten işaretliyse başka bir duruma geçmeden önce kim/ne zaman işaretlediği gösterilip sorulur.
// Aynı anda iki dokunuş (çift tıklama) tek işlem sayılır.
const isleniyor = new Set();
export async function isaretle(id, durum, { kendi = null } = {}) {
  if (isleniyor.has(id)) return;
  isleniyor.add(id);
  try { await isaretleIc(id, durum, { kendi }); } finally { isleniyor.delete(id); }
}
async function isaretleIc(id, durum, { kendi = null } = {}) {
  const f = store.firmalar.get(id); if (!f) return;
  if (!isaretleyebilirMi(f)) return toast('Bu kişiyi işaretleme yetkin yok', { tur: 'hata' });
  const oyBildirimi = durum === 'oy_kullandi' && !oyOnaylayabilirMi();
  if (oyBildirimi && oyBekliyor(f)) return toast(`${firmaAdi(f)} · oy bildirimi zaten masada (${trBaslik(f.oy_bildiren)}), onay bekleniyor`);
  if (f.durum === durum && !(durum === 'oy_kullandi' && kendi !== null && !!kendi !== !!f.kendi_geldi)) return toast(`${firmaAdi(f)} zaten "${DURUM_AD[durum] || durum}"`);
  if (f.durum !== 'bekliyor' && f.durum !== durum && !oyBildirimi) {
    const kim = f.durum_kim ? `${trBaslik(f.durum_kim)}${f.durum_zamani ? ', ' + fmt.saat(f.durum_zamani) : ''}` : '';
    const devam = await onayla(`${firmaAdi(f)} şu an "${DURUM_AD[f.durum] || f.durum}"${kim ? ` (${kim})` : ''}. "${DURUM_AD[durum] || durum}" olarak değiştirilsin mi?`, { evet: 'Evet, değiştir', hayir: 'Vazgeç', tehlike: SIRA_UI.indexOf(durum) < SIRA_UI.indexOf(f.durum) });
    if (!devam) return;
  }
  let ids = [id];
  const grup = kisiGrubu(f);
  if (grup.length > 1 && ['oy_kullandi', 'fuarda', 'yolda'].includes(durum)) {
    const hepsi = await onayla(`${firmaAdi(f)} ${grup.length} firmayla oy kullanıyor. Hepsini "${DURUM_AD[durum]}" yapayım mı?`, { evet: `Evet, ${grup.length} firma`, hayir: 'Yalnız bu firma' });
    if (hepsi) ids = grup.map(x => x.id);
  }
  try {
    const geri = await durumYap(ids, durum, { kendi });
    const fiil = oyBildirimi ? 'oy bildirildi · masa onayı bekliyor' : kendi && durum === 'oy_kullandi' ? 'kendi geldi, oy kullandı' : (FIIL[durum] || durum);
    let kullanildi = false;
    const tek = async () => { if (kullanildi) return; kullanildi = true; ids.forEach(i => { if (sonGeriAl.get(i)?.fn === tek) sonGeriAl.delete(i); }); await geri(); };
    ids.forEach(i => sonGeriAl.set(i, { fn: tek, durum, fiil, t: Date.now() }));
    toast(`${firmaAdi(f)} · ${fiil}${ids.length > 1 ? ` (${ids.length} firma)` : ''}`, { geriAl: tek, nokta: durum, geriAlMetin: `${firmaAdi(f)} · işaret geri alındı` });
    kisiKartiYenile();
  } catch (e) { hataGoster(e); }
}

// ---------------------------------------------------------------- ATLAS'a sor (asistan penceresini o soruyla açar)
export function atlasSor(metin) {
  cekmeceKapat();   // kişi kartı ATLAS panelinin üstünde kalmasın
  window.dispatchEvent(new CustomEvent('atlas-sor', { detail: metin }));
  // asistan modülü olayı dinlemiyorsa: pencereyi doğrudan aç (soru kutuya yazılı gelir)
  if (!document.documentElement.classList.contains('asistan-acik')) import('./asistan.js').then(m => m.default.ac(metin)).catch(() => {});
}

// ---------------------------------------------------------------- KİŞİ KARTI
let acikKisi = null, acikCekmece = null, sonHtml = '';
const KK = { menu: null, taslak: '' };            // açık menü ('sinif' | 'arac' | 'sorumlu') ve yazılmakta olan not
const ek = { id: null, olaylar: [], bildirimler: [] };   // kartı açılan kişinin tam geçmişi (store.olaylar yalnız son 800'ü tutar) ve bildirimleri

export function kisiKartiAc(id) {
  KK.menu = null; KK.taslak = ''; sonHtml = '';
  ek.id = id; ek.olaylar = []; ek.bildirimler = [];
  const c = cekmeceAc(kisiKartiHtml(id), { kapaninca: () => { if (acikCekmece === c) { acikKisi = null; acikCekmece = null; } } });
  c.classList.add('kk');
  acikKisi = id; acikCekmece = c; sonHtml = c.innerHTML;
  c.addEventListener('click', kartTikla);
  c.addEventListener('input', e => { if (e.target.matches('[data-not-girdi]')) KK.taslak = e.target.value; });
  c.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-not-girdi]')) { e.preventDefault(); notKaydet(); } });
  ekYukle(id);
}
async function ekYukle(id, sadeceBildirim = false) {
  try {
    const [o, b] = await Promise.all([
      sadeceBildirim ? { data: null } : sb.from('olaylar').select('*').eq('firma_id', id).order('zaman', { ascending: false }).limit(60),
      sb.from('bildirimler').select('*').eq('firma_id', id).order('zaman', { ascending: true }).limit(60),
    ]);
    if (acikKisi !== id || ek.id !== id) return;
    if (o.data) ek.olaylar = o.data;
    if (b.data) ek.bildirimler = b.data;
    kisiKartiYenile();
  } catch (e) { /* çevrimdışı: store'daki veriyle devam */ }
}
let bildirimZamani = 0;
function bildirimTazele() { if (acikKisi == null || Date.now() - bildirimZamani < 4000) return; bildirimZamani = Date.now(); ekYukle(acikKisi, true); }
bus.on('firma', ({ id }) => { if (acikKisi === id) kisiKartiYenile(); });
bus.on('firmalar', () => { if (acikKisi != null) kisiKartiYenile(); });
bus.on('olay', ({ olay }) => { if (acikKisi != null && (!olay || olay.firma_id === acikKisi)) { kisiKartiYenile(); if (olay?.tur === 'geri_sayim') setTimeout(bildirimTazele, 1500); } });
bus.on('arac', () => { if (acikKisi != null) kisiKartiYenile(); });
bus.on('araclar', () => { if (acikKisi != null) kisiKartiYenile(); });
bus.on('profil', () => { if (acikKisi != null) kisiKartiYenile(); });
bus.on('bildirim', () => { if (acikKisi != null) kisiKartiYenile(); });
bus.on('saat', () => { if (acikKisi != null) { kisiKartiYenile(); bildirimTazele(); } });

function kisiKartiYenile() {
  const c = acikCekmece; if (!c || !c.isConnected || acikKisi == null) return;
  const html = kisiKartiHtml(acikKisi); if (html === sonHtml) return; sonHtml = html;
  const kaydir = c.querySelector('.cekmece-govde')?.scrollTop || 0;
  const a = document.activeElement; const notOdak = !!(a && c.contains(a) && a.matches?.('[data-not-girdi]'));
  const sel = notOdak ? [a.selectionStart, a.selectionEnd] : null;
  c.innerHTML = html;
  const g = c.querySelector('.cekmece-govde'); if (g) g.scrollTop = kaydir;
  if (notOdak) { const n = c.querySelector('[data-not-girdi]'); if (n) { n.focus(); try { n.setSelectionRange(sel[0], sel[1]); } catch {} } }
}

// kişinin tüm olayları (yerel önbellek + kartla çekilen eski kayıtlar), en yeni başta
function kisiOlaylari(id) {
  const m = new Map();
  if (ek.id === id) for (const o of ek.olaylar) m.set(o.id, o);
  for (const o of store.olaylar) if (o.firma_id === id) m.set(o.id, o);
  return [...m.values()].sort((a, b) => (Date.parse(b.zaman) - Date.parse(a.zaman)) || (b.id - a.id));
}
const CD_AD = Object.fromEntries(GERI_SAYIM.map(g => [g.k, ilkBuyuk(g.ad.toLocaleLowerCase('tr'))]));
function olayYazi(o) {
  const yeniD = String(o.yeni || '').split('+')[0]; const kendi = String(o.yeni || '').includes('+kendi');
  let m;
  if (o.tur === 'durum') m = kendi && yeniD === 'oy_kullandi' ? 'kendi geldi, oy kullandı' : (FIIL[yeniD] || DURUM_AD[yeniD] || yeniD);
  else if (o.tur === 'oy_sinifi') m = `oy sınıfı: ${buyuk(SINIF_AD[o.eski] || o.eski)} → ${buyuk(SINIF_AD[o.yeni] || o.yeni)}`;
  else if (o.tur === 'not') m = 'not ekledi';
  else if (o.tur === 'arac') { const a = store.araclar.get(Number(o.yeni)); m = a ? `araç: ${fmt.plaka(a.plaka)}` : 'araç kaldırıldı'; }
  else if (o.tur === 'sorumlu') { const p = store.profiller.get(o.yeni); m = p ? `sorumlu: ${p.ad_soyad}` : 'sorumlu kaldırıldı'; }
  else if (o.tur === 'karsilama') m = `${o.yeni || ''} karşıladı`;
  else if (o.tur === 'geri_sayim') m = `şoför: ${(CD_AD[o.yeni] || o.yeni || '').toLocaleLowerCase('tr')}`;
  else m = String(o.tur || '');
  return o.kaynak_metin === 'geri alındı' ? `${m} (geri alındı)` : m;
}

// bildirim zinciri: şoför geri sayım olayları + ilgili bildirimlerin görülme / cevap / hatırlatma izleri
function zincirOgeleri(id) {
  const oge = [];
  for (const o of kisiOlaylari(id)) if (o.tur === 'geri_sayim') {
    oge.push({ t: Date.parse(o.zaman), tur: 'cd', ad: CD_AD[o.yeni] || String(o.yeni || ''), kim: kisaAd(o.kim_ad) + (rolAdi(o.kim_ad) === 'sofor' ? ' (şoför)' : '') });
  }
  const b = new Map();
  if (ek.id === id) for (const x of ek.bildirimler) b.set(x.id, x);
  for (const x of store.bildirimler) if (x.firma_id === id) b.set(x.id, x);
  for (const x of b.values()) {
    if (x.tur === 'bilgi') continue;
    const kim = kisaAd(store.profiller.get(x.alici_id)?.ad_soyad || '');
    const t0 = Date.parse(x.zaman);
    const cevapsiz = !x.cevap && (x.secenekler?.length > 1) && Date.now() - t0 > 10 * 60000;
    if (x.tur === 'hatirlatma') oge.push({ t: t0, tur: 'reminder', ad: 'Hatırlatma', kim, kacirdi: cevapsiz });
    if (x.gorulme) oge.push({ t: Date.parse(x.gorulme), tur: 'seen', ad: 'Görüldü', kim });
    if (x.cevap) oge.push({ t: Date.parse(x.cevap_zamani || x.gorulme || x.zaman), tur: 'answer', ad: x.cevap, kim });
    if (cevapsiz && x.tur !== 'hatirlatma') oge.push({ t: t0 + 10 * 60000, tur: 'reminder', ad: 'Cevap yok', kim, kacirdi: true });
  }
  return oge.filter(x => x.t).sort((a, b2) => a.t - b2.t).slice(-14);
}

const GUN = {
  bekliyor: { ad: 'Bekliyor', c: 'var(--ink-3)', s: 'var(--gray-soft)', i: 'var(--ink-2)' },
  arandi: { ad: 'Arandı', c: 'var(--blue)', s: 'var(--blue-soft)', i: 'var(--blue)' },
  yolda: { ad: 'Yolda', c: 'var(--amber)', s: 'var(--amber-soft)', i: 'var(--amber-ink)' },
  fuarda: { ad: 'Fuarda', c: 'var(--violet)', s: 'var(--violet-soft)', i: 'var(--violet)' },
  oy_kullandi: { ad: 'OY KULLANDI', c: 'var(--green)', s: 'var(--green-soft)', i: 'var(--green)' },
};
const ULASIM_AD = { servis: 'SERVİS', kendi: 'KENDİ GELECEK', yok: 'ULAŞIM YOK' };
const gunEtiket = d => (d === 'oy_kullandi' ? '✓ ' : '') + (GUN[d]?.ad || d);
const sayiYazi = n => ({ 2: 'iki', 3: 'üç', 4: 'dört', 5: 'beş', 6: 'altı' }[n] || String(n));
const kkPlaka = (p, k = false) => `<span class="kk-plaka${k ? ' k' : ''}"><i></i><b>${esc(fmt.plaka(p))}</b></span>`;
const aracYolcu = a => firmaListesi().filter(f => f.arac_id === a.id && f.durum === 'yolda').length;
const aracRozeti = d => `<span class="sm-b va-${esc(d)}">${d === 'arizali' ? '✕ Arızalı' : esc(ARAC_DURUM_AD[d] || d)}</span>`;
const telHtml = d => { const l = fmt.telLink(d); return d ? (l ? `<a href="${l}">${esc(fmt.tel(d))}</a>` : esc(fmt.tel(d))) : ''; };
const ilkTel = f => [f.cep, f.cep2, ...String(f.sabit_tel || '').split(/\s*[-/]\s*/)].find(t => t && fmt.telLink(t)) || '';
const eylem = (href, ic, sinif = '', yeni = false) => href ? `<a class="kk-eylem ${sinif}" href="${esc(href)}"${yeni ? ' target="_blank" rel="noopener"' : ''}>${ic}</a>` : `<span class="kk-eylem ${sinif} pasif">${ic}</span>`;

function alintiKapsul(chipHtml, alinti) { return `<span class="kk-q-kap">${chipHtml}<span class="kk-q">${esc(alinti)}</span></span>`; }
function kaynakChipKK(o) { const k = kaynakTur(o); return alintiKapsul(`<span class="kk-src src-${k}" data-e="alinti">${esc(kaynakEtiket(o))}</span>`, kaynakAlinti(o)); }

export function kisiKartiHtml(id) {
  const f = store.firmalar.get(id); if (!f) return '<div class="kk-ust"><div class="kk-ust-satir"><div class="kk-ad-kol"><div class="kk-ad">Kayıt bulunamadı</div></div><button type="button" class="kk-kapat" data-e="kapat" title="Kapat (Esc)">×</button></div></div>';
  const isaret = isaretleyebilirMi(f), yonet = yazabilirMi();
  const ad = f.yetkili ? trBaslik(f.yetkili) : (f.unvan || '(adsız)');
  const olaylar = kisiOlaylari(id);
  const gec = gecikme(f), ul = ulasim(f);
  const digerleri = kisiGrubu(f).filter(x => x.id !== f.id);
  const arac = aracOf(f);
  const sorumlu = f.sorumlu_id ? store.profiller.get(f.sorumlu_id) : null;
  const simdiI = DURUMLAR.findIndex(d => d.k === f.durum);
  const geriKayit = sonGeriAl.get(id);
  const geriGecerli = geriKayit && geriKayit.durum === f.durum && Date.now() - geriKayit.t < 15 * 60000 ? geriKayit : null;

  // --- üst
  const sinifMenu = KK.menu === 'sinif' ? `<div class="kk-menu sinif"><div class="kk-menu-baslik">OY SINIFINI DEĞİŞTİR</div>${SINIFLAR.map(s => `<button type="button" class="kk-menu-oge ${s.k === f.oy_sinifi ? 'sec' : ''}" data-e="sinif-sec" data-v="${s.k}"><span class="sm-b v-${s.k}">${esc(buyuk(s.ad))}</span><span class="tik">${s.k === f.oy_sinifi ? '✓' : ''}</span></button>`).join('')}</div>` : '';
  const sinifRozet = `<span class="sm-b v-${esc(f.oy_sinifi)}">${esc(buyuk(SINIF_AD[f.oy_sinifi] || f.oy_sinifi))}${yonet ? ' ▾' : ''}</span>`;
  const ust = `
  <div class="kk-ust">
    <div class="kk-ust-satir">
      <div class="kk-ad-kol">
        <div class="kk-etiket">KİŞİ KARTI · ${esc(f.sn ?? f.id)}</div>
        <div class="kk-ad">${esc(ad)}</div>
        <div class="kk-firma">${esc(f.unvan || '')}</div>
      </div>
      <button type="button" class="kk-kapat" data-e="kapat" title="Kapat (Esc)">×</button>
    </div>
    <div class="kk-rozetler">
      ${yonet ? `<button type="button" class="kk-sinif-btn" data-e="menu" data-v="sinif">${sinifRozet}</button>` : sinifRozet}
      <span class="sm-b g-${esc(f.durum)}">${esc(gunEtiket(f.durum))}</span>
      <span class="sm-b ul ul-${ul}">${ULASIM_AD[ul]}</span>
      ${gec ? `<span class="sm-b b-gec" title="${gec} dk gecikti">◷ GECİKTİ</span>` : ''}
      ${digerleri.length ? `<span class="sm-b b-2oy">${digerleri.length + 1} OY</span>` : ''}
      ${f.toplulukta ? '<span class="sm-b b-top">◉ TOPLULUKTA</span>' : ''}
      ${referansBenMi(f) ? '<span class="sm-b ul" title="Bu kişinin referansı sensin">SENİN KİŞİN</span>' : ''}
      <span class="kk-alt-yazi">· ${esc(f.tur || '')} · ${esc(trBaslik(f.ilce || ''))}</span>
      ${sinifMenu}
    </div>
  </div>`;

  // --- uyarılar
  const evrakExcel = f.sicil_notu && f.evrak_uyari === f.sicil_notu;
  const evrak = f.evrak_uyari ? `
    <div class="kk-uyari"><div class="ikon">▲</div><div class="kol">
      <div class="bas">EVRAK UYARISI</div>
      <div class="metin">${esc(f.evrak_uyari)}</div>
      <div class="alt"><span>Oy vermeden önce masada kontrol edilecek.</span>${evrakExcel ? alintiKapsul('<span class="kk-src src-excel" data-e="alinti">Excel aktarımı</span>', 'Firma listesinden (Excel) aktarıldı.') : ''}</div>
    </div></div>` : '';
  const ikiOy = digerleri.length ? `
    <div class="kk-ikioy"><div class="et">${digerleri.length + 1} OY</div>
      <div class="yazi">${digerleri.length === 1 ? 'İkinci firma' : 'Diğer firmalar'}: ${digerleri.map(x => `<a data-e="kisi" data-v="${x.id}">${esc(x.unvan)}</a><span class="sm-b g-${esc(x.durum)}">${esc(gunEtiket(x.durum))}</span>`).join(', ')}, ${sayiYazi(digerleri.length + 1)} pusula kullanacak.</div>
    </div>` : '';

  // --- gün içi akış
  const adimlar = DURUMLAR.map((d, i) => {
    const g = GUN[d.k]; const bitti = i <= simdiI, su = i === simdiI;
    const olay = bitti ? olaylar.find(o => o.tur === 'durum' && String(o.yeni || '').split('+')[0] === d.k) : null;
    return `<button type="button" class="kk-adim ${su ? 'cur' : bitti ? 'done' : 'todo'}" style="--c:${g.c};--s:${g.s};--i:${g.i}" data-e="adim" data-v="${d.k}" ${isaret ? '' : 'disabled'}><span class="nokta">${bitti ? '✓' : i + 1}</span><span class="ad">${d.k === 'oy_kullandi' ? 'Oy kullandı' : g.ad}</span><span class="saat">${olay ? esc(fmt.saat(olay.zaman)) : ''}</span></button>`;
  }).join('');
  const akis = `
    <div class="kk-bolum">
      <div class="kk-bolum-ust"><div class="kk-baslik">GÜN İÇİ AKIŞ</div>${isaret ? '<div class="kk-ipucu">Adıma dokun, ilerlet</div>' : ''}</div>
      <div class="kk-adimlar">${adimlar}</div>
      ${isaret && (f.durum !== 'oy_kullandi' || geriGecerli) ? `<div class="kk-adim-alt">
        ${f.durum !== 'oy_kullandi' ? '<button type="button" class="kk-kendi" data-e="kendi">✓ Kendi geldi, oy kullandı</button>' : ''}
        ${geriGecerli ? `<button type="button" class="kk-geri" data-e="geri">↶ Geri al · ${esc(geriGecerli.fiil)} (${esc(fmt.saat(new Date(geriGecerli.t)))})</button>` : ''}
      </div>` : ''}
    </div>`;

  // --- ara / 2. yetkili / whatsapp / yol tarifi
  const tel1 = ilkTel(f), wa = f.cep || f.cep2;
  const eylemler = `<div class="kk-eylemler">
      ${eylem(fmt.telLink(tel1), '📞 Ara', 'ana')}
      ${f.yetkili2 && fmt.telLink(f.cep2) ? eylem(fmt.telLink(f.cep2), '📞 2. yetkili') : ''}
      ${eylem(fmt.waLink(wa), 'WhatsApp', '', true)}
      ${eylem(f.adres ? fmt.mapsLink(f.adres) : '', '📍 Yol tarifi', '', true)}
    </div>`;
  const alma = f.alma_notu ? `<div class="kk-alma"><div class="et">ALMA NOTU</div><div class="yazi">${esc(f.alma_notu)}</div></div>` : '';

  // --- araç
  const aracler = [...store.araclar.values()].filter(a => a.durum !== 'arizali').sort((a, b) => String(a.plaka).localeCompare(String(b.plaka), 'tr'));
  const aracMenu = KK.menu === 'arac' ? `<div class="kk-menu arac">${aracler.length ? aracler.map(a => `<button type="button" class="kk-menu-oge ${a.id === f.arac_id ? 'sec' : ''}" data-e="arac-sec" data-v="${a.id}">${kkPlaka(a.plaka, true)}<span class="ad">${esc(trBaslik(a.sofor_ad || ''))} <span class="s">· ${aracYolcu(a)}/${a.kapasite ?? '?'} yolcu</span></span>${aracRozeti(a.durum)}</button>`).join('') : '<div class="kk-menu-baslik">Kayıtlı araç yok</div>'}<button type="button" class="kk-menu-son" data-e="arac-sec" data-v="-1">Aracı kaldır</button></div>` : '';
  const aracKutu = `
    <div class="kk-kutu"><span class="kk-kutu-et">ARAÇ</span>
      ${arac ? `${kkPlaka(arac.plaka)}
        <${yonet ? 'button type="button" data-e="arac-ac" data-v="' + arac.id + '"' : 'div'} class="kk-kutu-orta"><span class="u">${esc(trBaslik(arac.sofor_ad || 'Şoför yok'))} ${aracRozeti(arac.durum)}</span><span class="a">${esc(fmt.tel(arac.sofor_tel) || 'telefon yok')} · ${aracYolcu(arac)}/${arac.kapasite ?? '?'} yolcu</span></${yonet ? 'button' : 'div'}>
        ${fmt.telLink(arac.sofor_tel) ? `<a class="kk-mini" href="${fmt.telLink(arac.sofor_tel)}">📞 Şoför</a>` : ''}` : '<div class="kk-kutu-yok">Araç atanmadı</div>'}
      ${yonet ? '<button type="button" class="kk-mini gen" data-e="menu" data-v="arac">Değiştir ▾</button>' : ''}
      ${aracMenu}
    </div>`;

  // --- sorumlu
  // Sorumlu adayı: rapor (salt okunur) olmaz; kişinin REFERANSI sorumlu yapılmaz (referans karşılar, sahada görev yüklenmez).
  const sorumluAdaylari = f => { const refler = [f.referans, f.referans2].filter(Boolean).map(trArama); return ekip().filter(u => u.rol !== 'rapor' && !refler.includes(trArama(u.ad_soyad))); };
  const sorMenu = KK.menu === 'sorumlu' ? `<div class="kk-menu sorumlu">${sorumluAdaylari(f).map(u => `<button type="button" class="kk-menu-oge ${u.id === f.sorumlu_id ? 'sec' : ''}" data-e="sorumlu-sec" data-v="${u.id}"><span class="ini">${esc(bas(u.ad_soyad))}</span><span class="ad13">${esc(u.ad_soyad)}</span><span class="yuk">${firmaListesi().filter(x => x.sorumlu_id === u.id).length} kişi</span></button>`).join('')}<button type="button" class="kk-menu-son" data-e="sorumlu-sec" data-v="-">Sorumluyu kaldır</button></div>` : '';
  const ROL = ROL_AD;
  const sorKutu = `
    <div class="kk-kutu"><span class="kk-kutu-et">SORUMLU</span>
      ${sorumlu ? `<div class="kk-avatar">${esc(bas(sorumlu.ad_soyad))}</div><div class="kk-kutu-orta"><span class="u">${esc(sorumlu.ad_soyad)}</span><span class="a">${esc(ROL[sorumlu.rol] || sorumlu.rol)}</span></div>` : '<div class="kk-kutu-yok uyar">Sorumlu atanmadı</div>'}
      ${yonet ? '<button type="button" class="kk-mini gen" data-e="menu" data-v="sorumlu">Değiştir ▾</button>' : ''}
      ${sorMenu}
    </div>`;

  // --- oy bildirimi: masa dışından gelen "oy kullandı" masa onayı bekler
  const oyKutu = oyBekliyor(f) ? `
    <div class="kk-kutu kk-oy-bekliyor"><span class="kk-kutu-et">OY BİLDİRİMİ</span>
      <div class="kk-kutu-orta"><span class="u">${esc(trBaslik(f.oy_bildiren))} "oy kullandı" dedi</span><span class="a">${f.oy_bildirim_zamani ? esc(fmt.saat(f.oy_bildirim_zamani)) + ' · ' : ''}${oyOnaylayabilirMi() ? 'onaylarsan oy kullandı sayılır' : 'masa onayı bekliyor, onaylanınca sayılır'}</span></div>
      ${oyOnaylayabilirMi() ? '<button type="button" class="kk-mini" data-e="oy-reddet">Reddet</button><button type="button" class="kk-mini onay" data-e="oy-onayla">Onayla</button>' : ''}
    </div>` : '';

  // --- karşılama (referans ya da başkası; kim karşıladıysa kendi adıyla)
  const karsilamaKutu = ['yolda', 'fuarda', 'oy_kullandi'].includes(f.durum) || f.karsilayan ? `
    <div class="kk-kutu"><span class="kk-kutu-et">KARŞILAMA</span>
      ${f.karsilayan ? `<div class="kk-avatar">${esc(bas(f.karsilayan))}</div><div class="kk-kutu-orta"><span class="u">Karşılayan: ${esc(trBaslik(f.karsilayan))}</span><span class="a">${f.karsilama_zamani ? esc(fmt.saat(f.karsilama_zamani)) : 'saat kaydı yok'}${referansBenMi(f) ? ' · senin kişin' : ''}</span></div>` : `<div class="kk-kutu-yok uyar">Henüz karşılanmadı${f.referans ? ' · referans: ' + esc(trBaslik(f.referans)) : ''}</div>`}
      ${isaret && !f.karsilayan ? `<button type="button" class="kk-mini gen" data-e="karsila">${referansBenMi(f) ? 'Karşıladım' : 'Ben karşıladım'}</button>` : ''}
    </div>` : '';

  // --- bildirim zinciri
  const zincir = zincirOgeleri(id);
  const zincirHtml = zincir.length ? `
    <div class="kk-bolum" style="gap:8px">
      <div class="kk-baslik">BİLDİRİM ZİNCİRİ</div>
      <div class="kk-zincir">${zincir.map((z, i) => `<div class="oge"><span class="kk-cip ${z.kacirdi ? 'missed' : z.tur}"><b>${esc(z.ad)}</b><span> · ${esc(z.kim)}${z.kim ? ' · ' : ''}${esc(fmt.saat(z.t))}</span></span>${i < zincir.length - 1 ? '<span class="ok">→</span>' : ''}</div>`).join('')}</div>
    </div>` : '';

  // --- ATLAS'a sor
  const atlas = `<div class="kk-atlas"><div class="rozet">ATLAS</div><div class="et">ATLAS'A SOR</div>
      <button type="button" data-e="atlas" data-v="nerede">Bu kişi nerede?</button>
      <button type="button" data-e="atlas" data-v="sorumlu">Sorumlusu kim?</button>
      <button type="button" data-e="atlas" data-v="gelisme">Gelişme bildir</button>
    </div>`;

  // --- alan grupları
  const S = 's', W = 'w', TB = 'tb';
  const satir = (k, v, sinif = '') => `<div class="kk-satir"><div class="k">${esc(k)}</div><div class="v ${sinif}">${v}</div></div>`;
  const tire = '-';   // boş değer göstergesi
  const bos = v => (v === '' || v == null) ? tire : v;
  const adYaz = v => v ? esc(trBaslik(v)) : tire;
  const sabit = f.sabit_tel ? String(f.sabit_tel).split(/\s*[-/]\s*/).filter(Boolean).map(telHtml).join(' · ') : '';
  const grup = (baslik, satirlar, tam = false) => `<div class="kk-grup${tam ? ' tam' : ''}"><div class="gb">${baslik}</div>${satirlar.join('')}</div>`;
  const gruplar = [
    grup('İLETİŞİM', [
      satir('1. yetkili', adYaz(f.yetkili), S), satir('Cep', bos(telHtml(f.cep)), `${S} ${TB}`),
      ...((f.yetkili2 || f.cep2) ? [satir('2. yetkili', adYaz(f.yetkili2), S), satir('Cep', bos(telHtml(f.cep2)), `${S} ${TB}`)] : [satir('2. yetkili', tire)]),
      satir('Sabit', bos(sabit), TB),
    ]),
    grup('SEÇİM', [
      satir('Referans', adYaz(f.referans), S), satir('Referans 2', adYaz(f.referans2)),
      satir('İlzam', adYaz(f.ilzam)), satir('Yetki', f.yetki ? 'Var' : 'Yok'),
      satir('Zayi', f.zayi ? 'Var' : 'Yok', f.zayi ? W : ''), satir('Sicil notu', esc(f.sicil_notu || tire), f.sicil_notu ? W : ''),
    ]),
    grup('FİRMA', [
      satir('Ünvan', esc(f.unvan || tire)), satir('Tür', esc(f.tur || tire)), satir('Oda sicil no', esc(f.oda_sicil || tire)), satir('Ticari sicil', esc(f.ticari_sicil || tire)),
      satir('Tescilli adres', esc(adresMetni(f) || tire)),
    ], true),
    grup('ULAŞIM', [
      satir('Geliş', ULASIM_AD[ul], S), satir('Taşıma saati', esc(fmt.saatKisa(f.tasima_saati) || 'Belirsiz'), `${S} ${TB}`),
      satir('Rota grubu', esc(f.rota_kod ? `${trBaslik(f.rota_kod)}${f.rota_sira ? ' · ' + f.rota_sira + '. durak' : ''}` : tire)),
      satir('Araç', arac ? `${esc(fmt.plaka(arac.plaka))}${arac.sofor_ad ? ' · ' + esc(trBaslik(arac.sofor_ad)) : ''}` : tire),
    ]),
    grup('NOTLAR', [
      satir('Açıklama', esc(f.aciklama || tire)), ...(f.ek_not ? [satir('Ek not', esc(f.ek_not))] : []),
      satir('Toplulukta', f.toplulukta ? 'Evet · WhatsApp topluluğu' : 'Hayır'),
    ]),
  ].join('');

  // --- notlar (en yeni üstte; "[saat Ad] metin" satırlarından)
  const notOlaylari = olaylar.filter(o => o.tur === 'not');
  const notlar = String(f.notlar || '').split('\n').map(x => x.trim()).filter(Boolean).reverse().map(satirMetni => {
    const m = satirMetni.match(/^\[(\d{1,2}[:.]\d{2})\s+([^\]]+)\]\s*([\s\S]*)$/);
    const o = notOlaylari.find(x => String(x.yeni || '').split('\n').pop().trim() === satirMetni);
    const chip = o ? kaynakChipKK(o) : m ? alintiKapsul(`<span class="kk-src src-el" data-e="alinti">${esc(`El ile · ${kisaAd(m[2])} · ${m[1].replace('.', ':')}`)}</span>`, 'Elle işaretlendi.') : '';
    return `<div class="kk-not"><div class="m">${esc(m ? m[3] : satirMetni)}</div>${chip}</div>`;
  }).join('');
  const notBolum = `
    <div class="kk-bolum" style="gap:8px">
      <div class="kk-baslik">NOTLAR</div>
      ${isaret ? `<div class="kk-not-form"><input class="kk-not-girdi" data-not-girdi value="${esc(KK.taslak)}" placeholder="Not ekle… (ör. 11 gibi arayacak)" autocomplete="off"><button type="button" class="kk-not-ekle" data-e="not-ekle">Ekle</button></div>` : ''}
      ${notlar}
    </div>`;

  // --- işaret geçmişi
  const gecmis = olaylar.slice(0, 40).map(o => {
    const yeniD = String(o.yeni || '').split('+')[0];
    const gunNokta = o.tur === 'durum' && GUN[yeniD];
    return `<div class="kk-g-satir"><div class="z">${esc(fmt.saat(o.zaman))}</div><div class="ray"><div class="dot${gunNokta ? ' gun' : ''}" ${gunNokta ? `style="--dc:${GUN[yeniD].c}"` : ''}></div></div><div class="ic"><div class="m">${esc(olayYazi(o))}</div>${kaynakChipKK(o)}</div></div>`;
  }).join('');
  const gecmisBolum = `
    <div class="kk-bolum" style="gap:8px">
      <div class="kk-baslik">İŞARET GEÇMİŞİ</div>
      <div class="kk-gecmis">${gecmis || '<div class="kk-bosyazi">Henüz işaret yok.</div>'}</div>
    </div>`;

  return `${ust}<div class="cekmece-govde">${evrak}${ikiOy}${akis}${oyKutu}${eylemler}${alma}${aracKutu}${sorKutu}${karsilamaKutu}${zincirHtml}${atlas}<div class="kk-gruplar">${gruplar}</div>${notBolum}${gecmisBolum}</div>`;
}

// adres ilçeyi zaten içeriyorsa ikinci kez eklenmez; kısaltmalar (AOSB, SK.) bozulmasın diye harf düzeni değişmez
function adresMetni(f) {
  const a = String(f.adres || '').trim(), i = String(f.ilce || '').trim();
  if (!a) return i ? trBaslik(i) : '';
  return !i || trArama(a).includes(trArama(i)) ? a : `${a} · ${trBaslik(i)}`;
}
async function notKaydet() {
  const id = acikKisi; if (id == null) return; const metin = KK.taslak.trim(); if (!metin) return;
  KK.taslak = '';
  try { await notEkle(id, metin); } catch (e) { KK.taslak = metin; hataGoster(e); }
  kisiKartiYenile();
  acikCekmece?.querySelector('[data-not-girdi]')?.focus();
}

async function kartTikla(ev) {
  const id = acikKisi; if (id == null) return;
  const h = ev.target.closest('[data-e]'); const e = h?.dataset.e, v = h?.dataset.v;
  if (KK.menu && !ev.target.closest('.kk-menu') && e !== 'menu') { KK.menu = null; kisiKartiYenile(); }   // menü dışına tıklayınca kapanır
  if (!e) return;
  const f = store.firmalar.get(id); if (!f) return;
  const ad = firmaAdi(f);
  try {
    if (e === 'kapat') return cekmeceKapat();
    if (e === 'menu') { KK.menu = KK.menu === v ? null : v; return kisiKartiYenile(); }
    if (e === 'alinti') { h.closest('.kk-q-kap')?.classList.toggle('ac'); return; }
    if (e === 'adim') { if (v !== f.durum) await isaretle(id, v, { kendi: false }); return; }
    if (e === 'kendi') return await isaretle(id, 'oy_kullandi', { kendi: true });
    if (e === 'oy-onayla') { const g = await oyOnayla(id); toast(`${ad} · oy onaylandı`, { nokta: 'oy_kullandi', geriAl: g }); return kisiKartiYenile(); }
    if (e === 'oy-reddet') { if (!await onayla(`${ad} için "${trBaslik(f.oy_bildiren)}" oy kullandı dedi. Bildirim reddedilsin mi?`, { evet: 'Reddet', tehlike: true })) return; const g = await oyReddet(id); toast(`${ad} · oy bildirimi reddedildi`, { geriAl: g }); return kisiKartiYenile(); }
    if (e === 'geri') {
      const k = sonGeriAl.get(id); if (!k) return;
      await k.fn(); toast(`${ad} · işaret geri alındı`, { nokta: 'undo' }); return;
    }
    if (e === 'sinif-sec') {
      KK.menu = null; kisiKartiYenile();
      if (v !== f.oy_sinifi) { const g = await sinifYap(id, v); toast(`${ad} · ${buyuk(SINIF_AD[v])}`, { geriAl: g, nokta: 'vote', geriAlMetin: `${ad} · oy sınıfı geri alındı` }); }
      return;
    }
    if (e === 'arac-sec') {
      KK.menu = null; kisiKartiYenile();
      const n = Number(v); const a = n > 0 ? store.araclar.get(n) : null;
      const g = await aracAta([id], a ? a.id : null);
      toast(`${ad} · ${a ? 'araç: ' + fmt.plaka(a.plaka) : 'araç kaldırıldı'}`, { geriAl: g, geriAlMetin: `${ad} · araç ataması geri alındı` }); return;
    }
    if (e === 'sorumlu-sec') {
      KK.menu = null; kisiKartiYenile();
      const u = v !== '-' ? store.profiller.get(v) : null;
      const g = await sorumluAta([id], u ? u.id : null);
      toast(`${ad} · ${u ? 'sorumlu: ' + u.ad_soyad : 'sorumlu kaldırıldı'}`, { geriAl: g, geriAlMetin: `${ad} · sorumlu ataması geri alındı` }); return;
    }
    if (e === 'arac-ac') { cekmeceKapat(); location.hash = '#araclar/' + v; return; }
    if (e === 'karsila') { const geriAl = await karsiladim(id); toast(`${ad} · ${store.ben?.ad_soyad ? trBaslik(store.ben.ad_soyad) : 'siz'} karşıladı`, { nokta: 'fuarda', geriAl }); return; }
    if (e === 'kisi') return kisiKartiAc(Number(v));
    if (e === 'not-ekle') return await notKaydet();
    if (e === 'atlas') return atlasSor(v === 'nerede' ? `${ad} nerede?` : v === 'sorumlu' ? `${ad} sorumlusu kim?` : `${ad}: `);
  } catch (er) { hataGoster(er); }
}

// ---------------------------------------------------------------- Cmd+K HIZLI ARAMA (masadaki en sık iş: gelen kişiyi bul, işaretle)
let paletSecim = 0, paletSonuc = [];
function paletAra(q) {
  const t = trArama(q); if (t.length < 2) return [];
  const kelimeler = t.split(' ');
  const skorlu = [];
  for (const f of firmaListesi()) {
    if (!aramaEslesir(f, q)) continue;
    const ad = trArama(f.yetkili || f.unvan);
    let skor = ad.startsWith(t) ? 0 : ad.split(' ').some(w => w.startsWith(kelimeler[0])) ? 1 : trArama([f.unvan, f.yetkili2, f.referans, f.ilce].join(' ')).split(' ').some(w => w.startsWith(kelimeler[0])) ? 2 : 3;
    if (f.oy_sinifi === 'bizde' || f.oy_sinifi === 'yolda') skor -= 0.5;
    if (f.durum === 'oy_kullandi') skor += 0.8;
    skorlu.push([skor, f]);
  }
  return skorlu.sort((a, b) => a[0] - b[0]).slice(0, 7).map(x => x[1]);
}
export function paletAc(baslangic = '') {
  paletKapat();
  if (acikKisi != null) cekmeceKapat();   // tasarım: palet açılınca kişi kartı kapanır
  const p = el(`<div class="palet" role="dialog" aria-label="Hızlı arama"><div class="pl-ust"><span class="pl-ikon">⌕</span><input class="pl-girdi" placeholder="İsim ya da firma yaz… 2 harf yeter" value="${esc(baslangic)}" autocomplete="off" spellcheck="false" aria-label="Kişi ara"><span class="pl-esc">ESC</span></div><div class="palet-liste"></div><div class="pl-ayak"><span>↑↓ seç</span><span>↵ oy kullandı</span><span>⇧↵ kartı aç</span><span class="sag">Her işaret 5 sn içinde geri alınabilir</span></div></div>`);
  const arka = el('<div class="cekmece-arka" data-palet-arka style="z-index:105"></div>');
  arka.onclick = paletKapat;
  $('#katman').append(arka, p);
  const inp = p.querySelector('input'); inp.focus();
  const liste = p.querySelector('.palet-liste');
  paletSecim = 0;
  const ciz = () => {
    const q = inp.value.trim();
    paletSonuc = paletAra(q);
    paletSecim = Math.min(paletSecim, Math.max(0, paletSonuc.length - 1));
    liste.classList.toggle('bilgi', !paletSonuc.length);
    liste.innerHTML = paletSonuc.length ? paletSonuc.map((f, i) => {
      const isaret = isaretleyebilirMi(f), oy = f.durum === 'oy_kullandi';
      return `
      <div class="palet-satir ${i === paletSecim ? 'secili' : ''}" data-i="${i}">
        <div class="pl-sol">
          <div class="pl-ad-satir"><div class="pl-ad">${esc(f.yetkili ? trBaslik(f.yetkili) : f.unvan)}</div>
            <div class="pl-rozetler"><span class="sm-b v-${esc(f.oy_sinifi)}">${esc(buyuk(SINIF_AD[f.oy_sinifi] || f.oy_sinifi))}</span>${f.evrak_uyari ? '<span class="sm-b b-evrak">▲ EVRAK</span>' : ''}${f.kisi_oy_sayisi > 1 ? `<span class="sm-b b-2oy">${f.kisi_oy_sayisi} OY</span>` : ''}</div></div>
          <div class="pl-yan"><span class="un">${esc(f.unvan || '')}</span><span class="kalan"> · ${esc(trBaslik(f.ilce || ''))} · Ref: ${esc(f.referans ? trBaslik(f.referans) : 'yok')}</span></div>
        </div>
        <span class="sm-b g-${esc(f.durum)}">${esc(gunEtiket(f.durum))}</span>
        <button type="button" class="pl-kart" data-kart="${f.id}">Kart</button>
        ${isaret ? (oy ? '<div class="pl-zaten">Zaten işaretli</div>' : `<button type="button" class="pl-oy" data-oy="${f.id}">✓ Oy kullandı <span>↵</span></button>`) : ''}
      </div>`;
    }).join('') : (q.length < 2
      ? `<div class="pl-bilgi"><div class="b1">Gelen kişinin adından ya da firmasından 2 harf yaz.</div><div class="b2">Örnek: <b>me</b> → Mehmet, Mert… · <b>↵</b> oy kullandı · <b>⇧↵</b> kartı aç</div></div>`
      : `<div class="pl-bilgi yok">"${esc(q)}" için kimse bulunamadı.</div>`);
  };
  const sec = i => { paletSecim = i; liste.querySelectorAll('.palet-satir').forEach((r, k) => r.classList.toggle('secili', k === i)); liste.querySelector('.palet-satir.secili')?.scrollIntoView({ block: 'nearest' }); };
  inp.addEventListener('input', () => { paletSecim = 0; ciz(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sec(Math.min(paletSecim + 1, paletSonuc.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sec(Math.max(paletSecim - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter' && paletSonuc[paletSecim]) {
      e.preventDefault();
      const f = paletSonuc[paletSecim]; const kendiKipi = p.classList.contains('masa-palet-kendi');
      paletKapat();
      if (e.shiftKey || !isaretleyebilirMi(f)) kisiKartiAc(f.id);
      else if (f.durum !== 'oy_kullandi') isaretle(f.id, 'oy_kullandi', kendiKipi ? { kendi: true } : {});
    }
  });
  liste.addEventListener('mouseover', e => { const s = e.target.closest('[data-i]'); if (s && Number(s.dataset.i) !== paletSecim) sec(Number(s.dataset.i)); });
  liste.addEventListener('click', e => {
    const oy = e.target.closest('[data-oy]'); if (oy) { paletKapat(); isaretle(Number(oy.dataset.oy), 'oy_kullandi'); return; }
    const kart = e.target.closest('[data-kart]'); if (kart) { paletKapat(); kisiKartiAc(Number(kart.dataset.kart)); return; }
    const s = e.target.closest('[data-i]'); if (s) { const f = paletSonuc[Number(s.dataset.i)]; if (f) { paletKapat(); kisiKartiAc(f.id); } }
  });
  ciz();
}
export function paletKapat() { $('.palet')?.remove(); $('[data-palet-arka]')?.remove(); }
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && store.ben) { e.preventDefault(); if ($('.palet')) paletKapat(); else paletAc(); }
  else if (e.key === '/' && store.ben && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !$('.palet') && !$('[data-modal]')) { e.preventDefault(); paletAc(); }
});
