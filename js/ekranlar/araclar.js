// 72. Komite · Seçim Masası · ARAÇLAR (FİLO) ekranı (ATLAS, 2026-09-30)
// Filo özeti, kart / tablo görünümü, hızlı araç ekleme, araç çekmecesi (duraklar, yolcu ekleme, rota WhatsApp, şoför girişi).
// Veri yazma yalnız core.js işlevleriyle: aracKaydet, aracSil, aracDurumYap, aracAta, yonetim. İşaretleme ui.isaretle ile.
import {
  store, bus, sb, esc, fmt, trBaslik, trArama, dakika, ARAC_DURUMLARI, ARAC_DURUM_AD, DURUM_AD, ROL_AD, VARIS,
  yazabilirMi, yoneticiMi, firmaListesi, firmaAdi, aramaEslesir, gecikme, ulasim, kisiGrubu,
  aracAta, aracKaydet, aracSil, aracDurumYap, yonetim, profilleriYenile,
} from '../core.js';
import {
  el, bas, rozetDurum, rozetAracDurum, rozetSinif, plakaHtml, uyariRozetleri, cubuk, toast, hataGoster,
  cekmeceAc, cekmeceKapat, modal, modalKapat, onayla, isaretle, kisiKartiAc,
} from '../ui.js';

// ---------------------------------------------------------------- ekran durumu
const GORUNUM_ANAHTAR = 'secim-araclar-gorunum';
let kok = null;
let gorunum = 'kart';
try { gorunum = localStorage.getItem(GORUNUM_ANAHTAR) === 'tablo' ? 'tablo' : 'kart'; } catch {}
let filtre = 'hepsi';
let arama = '';
let acikArac = null;          // çekmecede açık araç id
let formKirli = false;        // çekmecedeki bilgi formu elle değiştirildi mi (canlı yenileme ezmesin)
let listeBekliyor = false;    // select açıkken gelen yenileme ertelendi mi
let yeniId = null, yeniZaman = null;

// ---------------------------------------------------------------- yardımcılar
const TAMAM = ['fuarda', 'oy_kullandi'];                 // teslim edildi
const ALINDI = ['yolda', 'fuarda', 'oy_kullandi'];       // araca bindi ya da vardı
const bekleyenMi = f => !ALINDI.includes(f.durum);
const plakaAnahtar = p => String(p || '').toLocaleUpperCase('tr').replace(/\s+/g, '');
const PLAKA_DESEN = /^\d{2} [A-ZÇĞİÖŞÜ]{1,3} \d{2,4}$/;
const kisiAnahtar = f => f.kisi_anahtar || 'f' + f.id;
const aracVar = f => !!(f.arac_id && store.araclar.has(f.arac_id));
const aracAdi = a => [a.marka, a.model].filter(Boolean).join(' ');
const MAKS_ARA_DURAK = 9;     // Google Maps yol tarifi bağlantısı en çok 9 ara durak alır
function telTemizle(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
// serbest metin telefon alanından ilk gerçek numarayı çıkar ("0532 111 22 33 / 0533 ..." gibi)
const ilkNumara = t => String(t || '').split(/[/,;]|\s-\s|\s{2,}/).map(x => x.replace(/\D/g, '')).find(d => d.length >= 10 && d.length <= 12) || '';
const kisiTel = f => ilkNumara(f.cep) || ilkNumara(f.cep2) || ilkNumara(f.sabit_tel);
function mesafeKm(lat1, lon1, lat2, lon2) {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const kmYaz = km => `${km.toLocaleString('tr-TR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
const kisiSay = n => `${n} kişi`;

function durakSirala(liste) {
  return liste.slice().sort((a, b) => {
    const sa = dakika(a.tasima_saati), sb2 = dakika(b.tasima_saati);
    if (sa !== sb2) return sa == null ? 1 : sb2 == null ? -1 : sa - sb2;
    const s = (a.arac_sira ?? 999) - (b.arac_sira ?? 999); if (s) return s;
    const r = String(a.rota_kod || '').localeCompare(String(b.rota_kod || ''), 'tr'); if (r) return r;
    return ((a.rota_sira ?? 999) - (b.rota_sira ?? 999)) || firmaAdi(a).localeCompare(firmaAdi(b), 'tr');
  });
}
// aynı kişi (2 oylu) tek durak sayılır: bir koltuk, bir alma noktası
function duraklar(firmalar) {
  const m = new Map();
  for (const f of durakSirala(firmalar)) { const k = kisiAnahtar(f); if (m.has(k)) m.get(k).firmalar.push(f); else m.set(k, { f, firmalar: [f] }); }
  return [...m.values()];
}
const durakBekliyor = d => d.firmalar.some(bekleyenMi);
const durakTamam = d => d.firmalar.every(f => TAMAM.includes(f.durum));
function yolcuHaritasi() {
  const m = new Map();
  for (const f of store.firmalar.values()) if (f.arac_id) { if (!m.has(f.arac_id)) m.set(f.arac_id, []); m.get(f.arac_id).push(f); }
  return m;
}
function aracOzet(a, harita) {
  const firmalar = harita.get(a.id) || [];
  const d = duraklar(firmalar);
  const bekleyen = d.filter(durakBekliyor);
  const teslim = d.filter(durakTamam);
  const kap = Math.max(1, Number(a.kapasite) || 4);
  return { firmalar, duraklar: d, kisi: d.length, bekleyen, teslim, yolda: d.length - bekleyen.length - teslim.length, kap, siradaki: bekleyen[0] || null };
}
const aracListesi = () => [...store.araclar.values()].sort((a, b) => fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr', { numeric: true }));

// servisle alınacak, henüz araç atanmamış ve alınmamış yolcular: rota koduna göre gruplu
function aracsizlar() {
  const adaylar = firmaListesi().filter(f => ulasim(f) === 'servis' && !aracVar(f) && bekleyenMi(f) && f.oy_sinifi !== 'oy_yok');
  const gm = new Map(); const tekler = [];
  for (const f of adaylar) {
    if (f.rota_kod) { if (!gm.has(f.rota_kod)) gm.set(f.rota_kod, []); gm.get(f.rota_kod).push(f); } else tekler.push(f);
  }
  const ilkSaat = l => Math.min(...l.map(f => dakika(f.tasima_saati) ?? 9999));
  const gruplar = [...gm.entries()].map(([kod, l]) => ({ kod, firmalar: durakSirala(l) }))
    .sort((a, b) => (ilkSaat(a.firmalar) - ilkSaat(b.firmalar)) || a.kod.localeCompare(b.kod, 'tr', { numeric: true }));
  return { toplam: adaylar.length, gruplar, tekler: durakSirala(tekler) };
}
function saatAraligi(liste) {
  const s = liste.map(f => fmt.saatKisa(f.tasima_saati)).filter(Boolean).sort();
  if (!s.length) return 'saat belirsiz';
  return s[0] === s[s.length - 1] ? s[0] : `${s[0]} - ${s[s.length - 1]}`;
}
const ilceMetni = liste => [...new Set(liste.map(f => trBaslik(f.ilce || '')).filter(Boolean))].join(', ');

function konumHtml(a) {
  if (!a.son_konum_zamani || a.son_lat == null || a.son_lon == null) return '<span class="araclar-konum-yok">Konum gelmedi</span>';
  const dk = (Date.now() - new Date(a.son_konum_zamani).getTime()) / 60000;
  const km = mesafeKm(Number(a.son_lat), Number(a.son_lon), VARIS.lat, VARIS.lon);
  const q = `${Number(a.son_lat)},${Number(a.son_lon)}`;
  return `<a href="https://www.google.com/maps?q=${esc(q)}" target="_blank" rel="noopener" class="${dk > 10 ? 'eski' : ''}" title="Son konum ${esc(fmt.saat(a.son_konum_zamani))}${dk > 10 ? ' (10 dakikadan eski)' : ''}">📍 ${esc(fmt.goreli(a.son_konum_zamani))}</a> · fuara ${esc(kmYaz(km))}`;
}
function durumSecHtml(a) {
  if (!yazabilirMi()) return rozetAracDurum(a.durum);
  return `<label class="araclar-durum a-${esc(a.durum)}" title="Araç durumunu değiştir"><select data-arac-durum="${a.id}" aria-label="Araç durumu">${ARAC_DURUMLARI.map(d => `<option value="${d.k}" ${d.k === a.durum ? 'selected' : ''}>${esc(d.ad)}</option>`).join('')}</select></label>`;
}
function dolulukHtml(o, { mini = false } = {}) {
  const yuzde = Math.round((o.kisi / o.kap) * 100);
  const sinif = o.kisi > o.kap ? 'araclar-asim' : o.kisi === o.kap ? 'yesil' : '';
  if (mini) return `<div class="araclar-mini"><b class="rakam">${o.kisi}/${o.kap}</b>${cubuk(yuzde, sinif)}</div>`;
  const alt = !o.kisi ? 'boş' : [o.bekleyen.length ? `${o.bekleyen.length} bekliyor` : '', o.yolda ? `${o.yolda} yolda` : '', o.teslim.length ? `${o.teslim.length} teslim` : ''].filter(Boolean).join(' · ');
  return `<div class="araclar-doluluk">
    <div class="araclar-doluluk-ust"><b class="rakam">${o.kisi}</b><span>/ ${o.kap} kişi</span><em>${esc(alt)}</em></div>
    ${cubuk(yuzde, sinif)}
    ${o.kisi > o.kap ? '<div class="araclar-asim-yazi">Kapasiteyi aşıyor, birden çok sefer gerekir</div>' : ''}
  </div>`;
}

// ---------------------------------------------------------------- CSS (ekrana özel, bir kez)
function stilEkle() {
  if (document.querySelector('style[data-ekran="araclar"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'araclar';
  s.textContent = `
.araclar-duzen { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.araclar-yan { position: sticky; top: calc(var(--ust-h) + 16px); max-height: calc(100vh - var(--ust-h) - 32px); overflow: auto; }
.araclar-yan .kart-govde { padding-top: 12px; }
@media (max-width: 1180px) { .araclar-duzen { grid-template-columns: minmax(0, 1fr); } .araclar-yan { display: none; } }
.araclar-cubugu { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.araclar-cubugu .araclar-ara { max-width: 300px; height: 34px; margin-left: auto; }
.araclar-seg { display: inline-flex; background: var(--yuzey-3); border-radius: 10px; padding: 3px; gap: 2px; }
.araclar-seg button { border: 0; background: transparent; height: 30px; padding: 0 12px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; color: var(--metin-2); }
.araclar-seg button.aktif { background: var(--yuzey); color: var(--metin); box-shadow: var(--golge-1); }
.araclar-kpi .kpi-deger.amber { color: var(--amber); } .araclar-kpi .kpi-deger.mor { color: var(--mor); }
.araclar-kpi .kpi.tik { cursor: pointer; } .araclar-kpi .kpi.tik:hover { border-color: var(--cizgi-2); box-shadow: var(--golge-2); }
.araclar-kpi .kpi.uyari { border-color: var(--turuncu); background: var(--turuncu-acik); } .araclar-kpi .kpi.uyari .kpi-deger { color: var(--turuncu); }
.araclar-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr)); gap: 14px; }
.araclar-kart { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 12px; cursor: pointer; transition: border-color .12s, box-shadow .12s; border-top-width: 3px; }
.araclar-kart:hover { box-shadow: var(--golge-2); }
.araclar-kart:focus-visible { outline: 2px solid var(--kirmizi); outline-offset: 2px; }
.araclar-kart[data-durum="hazir"] { border-top-color: var(--yesil); } .araclar-kart[data-durum="yolda"] { border-top-color: var(--amber); }
.araclar-kart[data-durum="fuarda"] { border-top-color: var(--mor); } .araclar-kart[data-durum="mola"] { border-top-color: var(--cizgi-2); }
.araclar-kart[data-durum="arizali"] { border-top-color: var(--turuncu); }
.araclar-kart.araclar-yeni { animation: araclar-parla 2.4s ease-out; }
@keyframes araclar-parla { 0% { box-shadow: 0 0 0 5px var(--kirmizi-cizgi); } 100% { box-shadow: var(--golge-1); } }
.araclar-kart-ust { display: flex; align-items: center; gap: 12px; }
.araclar-kart-ust .plaka { flex: none; }
.araclar-kart-ust .araclar-durum { margin-left: auto; }
.araclar-kart-alt-baslik { font-weight: 700; font-size: 13px; color: var(--metin-2); margin-top: -4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-kart-alt-baslik b { color: var(--metin); font-weight: 800; }
.araclar-arac-ad { flex: 1; min-width: 0; font-weight: 800; font-size: 14px; line-height: 1.2; }
.araclar-arac-ad span { display: block; font-weight: 600; font-size: 12px; color: var(--metin-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-durum { position: relative; display: inline-flex; align-items: center; height: 28px; border-radius: 8px; flex: none; }
.araclar-durum select { appearance: none; -webkit-appearance: none; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 800; font-size: 12px; height: 100%; padding: 0 26px 0 10px; cursor: pointer; outline: none; }
.araclar-durum select option { color: var(--metin); background: var(--yuzey); }
.araclar-durum::after { content: ''; position: absolute; right: 10px; top: 50%; width: 5px; height: 5px; margin-top: -4px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); pointer-events: none; }
.araclar-durum:focus-within { box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.araclar-sofor { display: flex; align-items: center; gap: 10px; padding: 9px 10px; background: var(--yuzey-2); border-radius: 10px; }
.araclar-sofor .avatar { width: 34px; height: 34px; flex: none; }
.araclar-sofor-ad { flex: 1; min-width: 0; font-weight: 800; line-height: 1.25; }
.araclar-sofor-ad > span { display: block; font-weight: 600; font-size: 12px; color: var(--metin-3); font-variant-numeric: tabular-nums; }
.araclar-bagli { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 5px; background: var(--yesil-acik); color: var(--yesil); font-size: 10px; font-weight: 800; letter-spacing: .03em; vertical-align: 2px; margin-left: 4px; }
.araclar-wa { color: #128C4A; }
.araclar-soluk { color: var(--metin-3); font-weight: 600; }
.araclar-sofor-eylem { display: flex; gap: 6px; flex: none; }
.araclar-doluluk-ust { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; }
.araclar-doluluk-ust b { font-size: 22px; font-weight: 900; letter-spacing: -.02em; line-height: 1; }
.araclar-doluluk-ust span { color: var(--metin-3); font-weight: 700; font-size: 13px; }
.araclar-doluluk-ust em { margin-left: auto; font-style: normal; font-size: 12px; color: var(--metin-3); font-weight: 600; text-align: right; }
.cubuk.araclar-asim > i { background: var(--amber); }
.araclar-asim-yazi { font-size: 11px; font-weight: 700; color: var(--amber); margin-top: 4px; }
.araclar-mini { display: flex; align-items: center; gap: 8px; }
.araclar-mini .cubuk { width: 64px; height: 6px; }
.araclar-siradaki { border: 1px solid var(--cizgi); border-radius: 10px; padding: 8px 10px; }
.araclar-siradaki.bos { color: var(--metin-3); font-weight: 600; font-size: 13px; background: var(--yuzey-2); border-style: dashed; text-align: center; padding: 10px; }
.araclar-etiket { font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--metin-3); }
.araclar-siradaki-satir { display: flex; align-items: center; gap: 10px; margin-top: 3px; }
.araclar-saat { font-weight: 900; font-size: 18px; font-variant-numeric: tabular-nums; letter-spacing: -.01em; min-width: 50px; }
.araclar-siradaki-ad { flex: 1; min-width: 0; font-weight: 800; line-height: 1.25; }
.araclar-siradaki-ad > span { display: block; font-size: 12px; font-weight: 600; color: var(--metin-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-kisi-link { cursor: pointer; } .araclar-kisi-link:hover { color: var(--kirmizi); text-decoration: underline; }
.araclar-yolcular { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 3px; }
.araclar-yolcular li { display: flex; align-items: center; gap: 8px; font-size: 13px; min-height: 26px; }
.araclar-yolcular li a { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.araclar-yolcular li.bitti a { color: var(--metin-3); font-weight: 600; }
.araclar-saat-k { width: 40px; flex: none; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--metin-2); font-size: 12px; }
.araclar-daha { font-size: 12px; color: var(--metin-3); font-weight: 700; padding-left: 48px; }
.araclar-kart-alt { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--cizgi); padding-top: 10px; margin-top: auto; }
.araclar-konum { font-size: 12px; font-weight: 600; color: var(--metin-3); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-konum a { color: var(--metin-2); font-weight: 700; } .araclar-konum a:hover { text-decoration: underline; }
.araclar-konum a.eski { color: var(--amber); }
.araclar-konum-yok { color: var(--metin-3); }
.araclar-not { font-size: 12px; color: var(--metin-2); background: var(--sari-acik); border-radius: 8px; padding: 6px 9px; font-weight: 600; white-space: pre-wrap; }
.araclar-tablo td.dar { white-space: nowrap; }
.araclar-tablo td.genis { min-width: 170px; }
.araclar-tablo .araclar-mini .cubuk { width: 48px; }
.araclar-tablo-konum { font-size: 12px; color: var(--metin-3); font-weight: 600; }
.araclar-tablo-konum a { color: var(--metin-2); font-weight: 700; } .araclar-tablo-konum a.eski { color: var(--amber); }
.araclar-bos { padding: 48px 16px; text-align: center; color: var(--metin-3); }
.araclar-bos b { display: block; color: var(--metin); font-size: 16px; margin-bottom: 4px; }
/* form */
.araclar-iki { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.araclar-ipucu { font-size: 12px; font-weight: 600; color: var(--metin-3); margin-top: 5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.araclar-ipucu:empty { display: none; }
.araclar-ipucu.hata { color: var(--turuncu); }
.girdi.araclar-hatali { border-color: var(--turuncu); box-shadow: 0 0 0 3px var(--turuncu-acik); }
.araclar-plaka-girdi { font-weight: 800; letter-spacing: .06em; text-transform: uppercase; font-variant-numeric: tabular-nums; }
.araclar-form-hata { color: var(--turuncu); font-weight: 700; font-size: 13px; margin-bottom: 8px; }
.araclar-form-hata:empty { display: none; }
.araclar-kaydet { width: 100%; height: 42px; }
/* çekmece */
.araclar-c-ust { flex: 1; min-width: 0; }
.araclar-c-ust .araclar-arac-ad { margin-top: 8px; font-size: 15px; }
.araclar-durum-seg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 2px 0 12px; }
.araclar-durum-seg button { height: 36px; border-radius: 10px; border: 1.5px solid var(--cizgi-2); background: var(--yuzey); font-weight: 800; font-size: 12px; cursor: pointer; color: var(--metin-2); }
.araclar-durum-seg button:hover { border-color: var(--metin-3); }
.araclar-durum-seg button.secili { border-color: currentColor; }
.araclar-durum-seg button.a-hazir { background: var(--yesil-acik); color: var(--yesil); }
.araclar-durum-seg button.a-yolda { background: var(--amber-acik); color: var(--amber); }
.araclar-durum-seg button.a-fuarda { background: var(--mor-acik); color: var(--mor); }
.araclar-durum-seg button.a-mola { background: var(--gri-acik); color: var(--metin); }
.araclar-durum-seg button.a-arizali { background: var(--turuncu-acik); color: var(--turuncu); }
.araclar-durum-seg button:disabled { cursor: default; }
.araclar-c-ozet { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; background: var(--yuzey-2); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
.araclar-c-ozet .araclar-konum { white-space: normal; }
.araclar-durak-liste { list-style: none; margin: 0 0 10px; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.araclar-durak { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--cizgi); border-radius: 12px; background: var(--yuzey); }
.araclar-durak.siradaki { border-color: var(--kirmizi-cizgi); box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.araclar-durak.bitti { background: var(--yuzey-2); }
.araclar-durak.bitti .araclar-durak-ad { color: var(--metin-3); }
.araclar-durak-no { width: 26px; height: 26px; border-radius: 50%; background: var(--koyu); color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 12px; flex: none; }
.araclar-durak.siradaki .araclar-durak-no { background: var(--kirmizi); }
.araclar-durak.bitti .araclar-durak-no { background: var(--yesil); }
.araclar-durak-govde { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.araclar-durak-ust { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.araclar-durak-ust .araclar-saat { font-size: 16px; min-width: 0; }
.araclar-durak-ad { font-weight: 800; font-size: 15px; }
.araclar-durak-alt { font-size: 12px; color: var(--metin-2); line-height: 1.4; word-break: break-word; }
.araclar-durak-alt b { color: var(--metin); }
.araclar-alma { font-size: 12px; font-weight: 700; color: var(--kirmizi); background: var(--kirmizi-acik); border-radius: 8px; padding: 5px 8px; }
.araclar-durak-eylem { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.araclar-bolum { margin-top: 20px; }
.araclar-bolum-ust { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.araclar-bolum-ust .bolum-baslik { margin: 0; }
.araclar-bolum-ust .sag { margin-left: auto; display: flex; gap: 6px; }
.araclar-sonuc { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; margin-top: 8px; }
.araclar-sonuc-satir { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--cizgi); border-radius: 10px; background: var(--yuzey); }
.araclar-sonuc-satir.icinde { background: var(--yuzey-2); }
.araclar-sonuc-satir .ana { flex: 1; min-width: 0; }
.araclar-sonuc-satir .ana b { display: block; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-sonuc-satir .ana span { display: block; font-size: 12px; color: var(--metin-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-sonuc-satir .sag { display: flex; gap: 6px; align-items: center; flex: none; }
.araclar-grup-ad { font-weight: 800; }
.araclar-grup-kisiler { font-size: 12px; color: var(--metin-2); white-space: normal !important; }
.araclar-alt-baslik { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--metin-3); margin: 10px 0 2px; }
.araclar-sofor-kutu { border: 1px solid var(--cizgi); border-radius: 12px; padding: 12px 14px; display: grid; gap: 8px; }
.araclar-sofor-kutu.bagli { border-color: #9BD8B0; background: var(--yesil-acik); }
.araclar-sofor-kutu .eylemler { margin: 0; }
.araclar-detay { margin-top: 20px; border: 1px solid var(--cizgi); border-radius: 12px; }
.araclar-detay > summary { cursor: pointer; padding: 12px 14px; font-weight: 800; list-style: none; display: flex; align-items: center; gap: 8px; }
.araclar-detay > summary::-webkit-details-marker { display: none; }
.araclar-detay > summary::after { content: '▾'; margin-left: auto; color: var(--metin-3); transition: transform .15s; }
.araclar-detay[open] > summary::after { transform: rotate(180deg); }
.araclar-detay > div { padding: 0 14px 14px; }
.araclar-tehlike { margin-top: 20px; padding-top: 14px; border-top: 1px dashed var(--cizgi-2); display: flex; align-items: center; gap: 10px; }
.araclar-tehlike .btn { color: var(--kirmizi); border-color: var(--kirmizi-cizgi); }
.araclar-tehlike .btn:hover { background: var(--kirmizi-acik); }
/* modallar */
textarea.girdi.araclar-rota-metin { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; min-height: 0; height: min(46vh, 380px); }
.araclar-ipucu.dikey { flex-direction: column; align-items: flex-start; gap: 2px; }
.araclar-onay-kutu { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; margin-bottom: 10px; cursor: pointer; }
.araclar-pin-kutu { text-align: center; padding: 8px 0 14px; }
.araclar-pin-ad { font-weight: 800; font-size: 18px; margin: 2px 0 12px; }
.araclar-pin { font-size: 46px; font-weight: 900; letter-spacing: .28em; padding-left: .28em; font-variant-numeric: tabular-nums; color: var(--kirmizi); line-height: 1.1; }
.araclar-aracsiz-grup { border: 1px solid var(--cizgi); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; }
.araclar-aracsiz-ust { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.araclar-aracsiz-ust .ana { flex: 1; min-width: 200px; }
.araclar-aracsiz-grup select { width: auto; max-width: 280px; height: 34px; }
@media (max-width: 760px) {
  .araclar-durum-seg { grid-template-columns: repeat(3, 1fr); }
  .araclar-c-ozet { grid-template-columns: 1fr; }
  .araclar-cubugu .araclar-ara { max-width: none; margin-left: 0; }
}`;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- sayfa iskeleti
function iskeletHtml() {
  const yaz = yazabilirMi();
  return `
  <div class="sayfa-baslik">
    <div><h1>Araçlar</h1><div class="alt">Filo, şoförler ve duraklar · canlı</div></div>
    <div class="sag">
      <div class="araclar-seg" role="tablist" aria-label="Görünüm">
        <button data-gorunum="kart" role="tab">Kartlar</button><button data-gorunum="tablo" role="tab">Tablo</button>
      </div>
      ${yaz ? '<button class="btn btn-kirmizi" data-yeni>+ Araç ekle</button>' : ''}
    </div>
  </div>
  <div data-kpi class="araclar-kpi"></div>
  <div class="araclar-duzen">
    <section style="min-width:0">
      <div class="araclar-cubugu">
        <div class="cipler" data-cipler></div>
        <input class="girdi araclar-ara" data-ara type="search" placeholder="Plaka, şoför ya da yolcu ara…" value="${esc(arama)}" autocomplete="off">
      </div>
      <div data-liste></div>
    </section>
    ${yaz ? `<aside class="kart araclar-yan" data-yan>
      <div class="kart-baslik">Hızlı araç ekle<span class="alt">Enter ile kaydet</span></div>
      <div class="kart-govde">${formHtml({}, 'yeni')}</div>
    </aside>` : ''}
  </div>`;
}

function sayilar(harita) {
  const liste = [...store.araclar.values()];
  const say = d => liste.filter(a => a.durum === d).length;
  let tasinan = 0, bekleyen = 0;
  for (const a of liste) {
    for (const f of harita.get(a.id) || []) if (TAMAM.includes(f.durum) && !f.kendi_geldi) tasinan++;
    bekleyen += aracOzet(a, harita).bekleyen.length;
  }
  return { toplam: liste.length, hazir: say('hazir'), yolda: say('yolda'), fuarda: say('fuarda'), mola: say('mola'), arizali: say('arizali'), tasinan, bekleyen, aracsiz: aracsizlar().toplam };
}
function kpiHtml(s) {
  return `<div class="kpi-serit">
    <div class="kpi"><div class="kpi-etiket">Toplam araç</div><div class="kpi-deger">${s.toplam}</div><div class="kpi-alt">${s.mola} mola · ${s.arizali} arızalı</div></div>
    <div class="kpi"><div class="kpi-etiket">Yolda</div><div class="kpi-deger amber">${s.yolda}</div><div class="kpi-alt">yolcu alıyor ya da getiriyor</div></div>
    <div class="kpi"><div class="kpi-etiket">Fuarda</div><div class="kpi-deger mor">${s.fuarda}</div><div class="kpi-alt">Gaziemir'de</div></div>
    <div class="kpi yesil"><div class="kpi-etiket">Boşta</div><div class="kpi-deger">${s.hazir}</div><div class="kpi-alt">hazır, görev verilebilir</div></div>
    <div class="kpi vurgu"><div class="kpi-etiket">Bugün taşınan</div><div class="kpi-deger">${s.tasinan}</div><div class="kpi-alt">${s.bekleyen ? `${s.bekleyen} kişi daha alınacak` : 'araçla gelip fuarda ya da oy kullanan'}</div></div>
    <div class="kpi tik ${s.aracsiz ? 'uyari' : ''}" data-aracsiz tabindex="0" title="Listeyi aç ve araç ata"><div class="kpi-etiket">Araç bekleyen</div><div class="kpi-deger">${s.aracsiz}</div><div class="kpi-alt">${s.aracsiz ? 'servis yolcusu, araç atanmadı' : 'tüm servis yolcularının aracı var'}</div></div>
  </div>`;
}
function ciplerHtml() {
  const liste = [...store.araclar.values()];
  const cip = (k, ad, n) => `<button class="cip ${filtre === k ? 'aktif' : ''}" data-filtre="${k}">${esc(ad)} <span class="say">${n}</span></button>`;
  return cip('hepsi', 'Tümü', liste.length) + ARAC_DURUMLARI.map(d => cip(d.k, d.ad, liste.filter(a => a.durum === d.k).length)).join('');
}
function filtrelenmis(harita) {
  let liste = aracListesi();
  if (filtre !== 'hepsi') liste = liste.filter(a => a.durum === filtre);
  const q = trArama(arama);
  if (q) {
    liste = liste.filter(a => {
      const yolcu = (harita.get(a.id) || []).map(f => `${f.yetkili || ''} ${f.unvan || ''}`).join(' ');
      const hay = trArama([a.plaka, plakaAnahtar(a.plaka), a.marka, a.model, a.renk, a.sofor_ad, a.sofor_tel, a.notlar, yolcu].join(' '));
      return q.split(' ').every(p => hay.includes(p));
    });
  }
  return liste;
}

// ---------------------------------------------------------------- kart ve tablo
function kartHtml(a, o) {
  const tel = a.sofor_tel;
  const bagli = a.sofor_kullanici ? store.profiller.get(a.sofor_kullanici) : null;
  const s = o.siradaki;
  const gos = o.duraklar.slice(0, 4);
  const g = s ? gecikme(s.f) : 0;
  return `
  <article class="kart araclar-kart ${yeniId === a.id && Date.now() - yeniZaman < 2500 ? 'araclar-yeni' : ''}" data-arac="${a.id}" data-durum="${esc(a.durum)}" tabindex="0" aria-label="${esc(fmt.plaka(a.plaka))} aracını aç">
    <div class="araclar-kart-ust">
      ${plakaHtml(a.plaka, true)}
      ${durumSecHtml(a)}
    </div>
    <div class="araclar-kart-alt-baslik"><b>${esc(aracAdi(a) || 'Araç')}</b>${esc([a.renk ? trBaslik(a.renk) : '', `${o.kap} kişilik`].filter(Boolean).map(x => ' · ' + x).join(''))}</div>
    <div class="araclar-sofor">
      <div class="avatar">${esc(bas(trBaslik(a.sofor_ad || '')) || '?')}</div>
      <div class="araclar-sofor-ad">${a.sofor_ad ? esc(trBaslik(a.sofor_ad)) : '<span class="araclar-soluk">Şoför girilmedi</span>'}${bagli ? '<b class="araclar-bagli" title="Şoför uygulamaya bağlı, PIN ile giriyor">UYGULAMADA</b>' : ''}
        <span>${tel ? esc(fmt.tel(tel)) : 'Telefon yok'}</span></div>
      <div class="araclar-sofor-eylem">
        ${fmt.telLink(tel) ? `<a class="btn btn-kucuk" href="${esc(fmt.telLink(tel))}" title="Şoförü ara">📞 Ara</a>` : ''}
        ${fmt.waLink(tel) ? `<a class="btn btn-kucuk araclar-wa" href="${esc(fmt.waLink(tel))}" target="_blank" rel="noopener" title="Şoföre WhatsApp">WhatsApp</a>` : ''}
      </div>
    </div>
    ${dolulukHtml(o)}
    ${s ? `<div class="araclar-siradaki">
      <div class="araclar-etiket">Sıradaki durak</div>
      <div class="araclar-siradaki-satir">
        <span class="araclar-saat">${esc(fmt.saatKisa(s.f.tasima_saati) || '--:--')}</span>
        <div class="araclar-siradaki-ad"><a class="araclar-kisi-link" data-kisi="${s.f.id}">${esc(firmaAdi(s.f))}</a><span>${esc([trBaslik(s.f.ilce || ''), s.f.alma_notu ? 'alma notu var' : ''].filter(Boolean).join(' · ') || 'adres yok')}</span></div>
        ${g ? `<span class="rozet u-gecikti">${g} dk gecikti</span>` : rozetDurum(s.f)}
      </div>
    </div>` : `<div class="araclar-siradaki bos">${o.kisi ? 'Bekleyen durak yok, yolcuların hepsi alındı' : 'Henüz yolcu atanmadı'}</div>`}
    ${gos.length ? `<ul class="araclar-yolcular">${gos.map(d => `
      <li class="${durakTamam(d) ? 'bitti' : ''}"><span class="araclar-saat-k">${esc(fmt.saatKisa(d.f.tasima_saati) || '--:--')}</span><a class="araclar-kisi-link" data-kisi="${d.f.id}" title="${esc(d.f.unvan || '')}">${esc(firmaAdi(d.f))}</a>${d.firmalar.length > 1 ? `<span class="rozet u-2oy">${d.firmalar.length} OY</span>` : ''}${rozetDurum(d.f)}</li>`).join('')}</ul>
      ${o.duraklar.length > gos.length ? `<div class="araclar-daha">+${o.duraklar.length - gos.length} yolcu daha</div>` : ''}` : ''}
    ${a.notlar ? `<div class="araclar-not">${esc(a.notlar)}</div>` : ''}
    <div class="araclar-kart-alt">
      <span class="araclar-konum">${konumHtml(a)}</span>
      ${o.duraklar.length ? `<button class="btn btn-kucuk" data-rota-gonder="${a.id}" title="Rotayı şoföre WhatsApp'la gönder">Rota gönder</button>` : ''}
      <button class="btn btn-kucuk btn-koyu" data-ac="${a.id}">Aç</button>
    </div>
  </article>`;
}
function tabloHtml(liste, harita) {
  return `<div class="tablo-kap"><table class="tablo araclar-tablo">
    <thead><tr><th>Plaka</th><th>Araç</th><th>Şoför</th><th>Durum</th><th>Doluluk</th><th>Sıradaki durak</th><th>Teslim</th><th>Son konum</th><th></th></tr></thead>
    <tbody>${liste.map(a => {
      const o = aracOzet(a, harita); const s = o.siradaki; const g = s ? gecikme(s.f) : 0;
      return `<tr data-arac="${a.id}">
        <td class="dar">${plakaHtml(a.plaka)}</td>
        <td><span class="kalin">${esc(aracAdi(a) || 'Araç')}</span><div class="zayif">${esc([a.renk ? trBaslik(a.renk) : '', `${o.kap} kişilik`].filter(Boolean).join(' · '))}</div></td>
        <td><span class="kalin">${esc(trBaslik(a.sofor_ad || '')) || '<span class="zayif">Yok</span>'}</span>${a.sofor_kullanici ? ' <span class="rozet a-hazir" title="Şoför uygulamaya bağlı">Uygulamada</span>' : ''}
          <div class="zayif">${fmt.telLink(a.sofor_tel) ? `<a href="${esc(fmt.telLink(a.sofor_tel))}">${esc(fmt.tel(a.sofor_tel))}</a>` : 'Telefon yok'}${fmt.waLink(a.sofor_tel) ? ` · <a href="${esc(fmt.waLink(a.sofor_tel))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></td>
        <td class="dar">${durumSecHtml(a)}</td>
        <td class="dar">${dolulukHtml(o, { mini: true })}</td>
        <td class="genis">${s ? `<span class="kalin rakam">${esc(fmt.saatKisa(s.f.tasima_saati) || '--:--')}</span> <a class="araclar-kisi-link kalin" data-kisi="${s.f.id}">${esc(firmaAdi(s.f))}</a> ${g ? `<span class="rozet u-gecikti">${g} dk</span>` : ''}<div class="zayif">${esc(trBaslik(s.f.ilce || ''))}</div>` : `<span class="zayif">${o.kisi ? 'Hepsi alındı' : 'Yolcu yok'}</span>`}</td>
        <td class="num">${o.teslim.length}/${o.kisi}</td>
        <td class="araclar-tablo-konum">${konumHtml(a)}</td>
        <td class="dar">${o.duraklar.length ? `<button class="btn btn-kucuk" data-rota-gonder="${a.id}">Rota gönder</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function ciz() {
  if (!kok || !kok.isConnected) return;
  listeBekliyor = false;
  const harita = yolcuHaritasi();
  kok.querySelector('[data-kpi]').innerHTML = kpiHtml(sayilar(harita));
  kok.querySelector('[data-cipler]').innerHTML = ciplerHtml();
  kok.querySelectorAll('[data-gorunum]').forEach(b => { b.classList.toggle('aktif', b.dataset.gorunum === gorunum); b.setAttribute('aria-selected', b.dataset.gorunum === gorunum); });
  const hedef = kok.querySelector('[data-liste]');
  const liste = filtrelenmis(harita);
  if (!store.araclar.size) {
    hedef.innerHTML = `<div class="kart araclar-bos"><b>Henüz araç yok</b>${yazabilirMi() ? 'Sağdaki formdan (ya da “+ Araç ekle”) ilk aracı ekle: plaka, şoför, telefon yeter.' : 'Araçları yönetici ya da masa ekler.'}</div>`;
  } else if (!liste.length) {
    hedef.innerHTML = `<div class="kart araclar-bos"><b>Eşleşen araç yok</b>Filtreyi ya da aramayı değiştir.</div>`;
  } else if (gorunum === 'tablo') {
    hedef.innerHTML = tabloHtml(liste, harita);
  } else {
    hedef.innerHTML = `<div class="araclar-izgara">${liste.map(a => kartHtml(a, aracOzet(a, harita))).join('')}</div>`;
  }
}

// ---------------------------------------------------------------- araç formu (hızlı ekle, modal, çekmece)
function formHtml(a = {}, tur = 'yeni') {
  const v = k => esc(a[k] ?? '');
  const yeni = tur !== 'duzenle';
  return `<form class="araclar-form" data-arac-form="${tur}" novalidate autocomplete="off">
    <div class="alan"><label class="etiket">Plaka</label>
      <input class="girdi araclar-plaka-girdi" data-f="plaka" value="${esc(a.plaka ? fmt.plaka(a.plaka) : '')}" placeholder="35 ABC 123" autocapitalize="characters" spellcheck="false">
      <div class="araclar-ipucu" data-ipucu="plaka"></div></div>
    <div class="araclar-iki">
      <div class="alan"><label class="etiket">Marka</label><input class="girdi" data-f="marka" value="${v('marka')}" placeholder="Fiat"></div>
      <div class="alan"><label class="etiket">Model</label><input class="girdi" data-f="model" value="${v('model')}" placeholder="Doblo"></div>
    </div>
    <div class="araclar-iki">
      <div class="alan"><label class="etiket">Renk</label><input class="girdi" data-f="renk" value="${v('renk')}" placeholder="Beyaz"></div>
      <div class="alan"><label class="etiket">Kapasite (yolcu)</label><input class="girdi" data-f="kapasite" type="number" min="1" max="60" inputmode="numeric" value="${esc(a.kapasite ?? 4)}"><div class="araclar-ipucu" data-ipucu="kapasite"></div></div>
    </div>
    <div class="alan"><label class="etiket">Şoför adı soyadı</label><input class="girdi" data-f="sofor_ad" value="${v('sofor_ad')}" placeholder="Ör. Ahmet Yılmaz" autocapitalize="words"></div>
    <div class="alan"><label class="etiket">Şoför telefonu</label><input class="girdi" data-f="sofor_tel" value="${esc(a.sofor_tel ? fmt.tel(a.sofor_tel) : '')}" placeholder="05xx xxx xx xx" inputmode="tel"><div class="araclar-ipucu" data-ipucu="sofor_tel"></div></div>
    <div class="alan"><label class="etiket">Not</label><textarea class="girdi" data-f="notlar" rows="2" placeholder="Ör. 11:00'den sonra müsait">${v('notlar')}</textarea></div>
    <div class="araclar-form-hata" data-form-hata></div>
    <button type="submit" class="btn btn-kirmizi araclar-kaydet" data-kaydet>${yeni ? 'Aracı ekle' : 'Değişiklikleri kaydet'}</button>
  </form>`;
}
function formOku(fm) {
  const g = k => (fm.querySelector(`[data-f="${k}"]`)?.value || '').trim();
  const k = g('kapasite');
  return {
    plaka: g('plaka'), marka: g('marka') || null, model: g('model') || null, renk: g('renk') || null,
    kapasite: k === '' ? 4 : Number(k), sofor_ad: g('sofor_ad').replace(/\s+/g, ' ') || null, sofor_tel: g('sofor_tel'), notlar: g('notlar') || null,
  };
}
function ayniPlaka(plaka, haricId) {
  const k = plakaAnahtar(fmt.plaka(plaka));
  return k ? [...store.araclar.values()].find(a => a.id !== haricId && plakaAnahtar(a.plaka) === k) : null;
}
function dogrula(v, id) {
  const h = {}; const plaka = fmt.plaka(v.plaka);
  if (!v.plaka) h.plaka = 'Plaka gerekli';
  else { const ayni = ayniPlaka(v.plaka, id); if (ayni) h.plaka = `Bu plaka zaten kayıtlı${ayni.sofor_ad ? ` (şoför ${trBaslik(ayni.sofor_ad)})` : ''}`; }
  const tel = telTemizle(v.sofor_tel);
  if (v.sofor_tel && tel.length !== 10) h.sofor_tel = 'Telefon 10 haneli olmalı (5xx xxx xx xx)';
  if (!Number.isInteger(v.kapasite) || v.kapasite < 1 || v.kapasite > 60) h.kapasite = '1 ile 60 arasında bir sayı';
  return { hatalar: h, satir: { plaka, marka: v.marka, model: v.model, renk: v.renk, kapasite: v.kapasite, sofor_ad: v.sofor_ad, sofor_tel: tel || null, notlar: v.notlar } };
}
function ipucuYaz(fm, alan, html, hata = false) {
  const i = fm.querySelector(`[data-ipucu="${alan}"]`); if (i) { i.innerHTML = html || ''; i.classList.toggle('hata', !!hata); }
  fm.querySelector(`[data-f="${alan}"]`)?.classList.toggle('araclar-hatali', !!hata);
}
function hatalariYaz(fm, h) {
  ['plaka', 'kapasite', 'sofor_tel'].forEach(k => { if (h[k]) ipucuYaz(fm, k, esc(h[k]), true); else if (k !== 'plaka') ipucuYaz(fm, k, ''); });
  if (!h.plaka) plakaKontrol(fm);
  const ilk = ['plaka', 'kapasite', 'sofor_tel'].find(k => h[k]); if (ilk) fm.querySelector(`[data-f="${ilk}"]`)?.focus();
}
function plakaKontrol(fm) {
  const inp = fm.querySelector('[data-f="plaka"]'); const ham = inp.value.trim(); const id = Number(fm.dataset.aracId) || null;
  if (!ham) return ipucuYaz(fm, 'plaka', '');
  const ayni = ayniPlaka(ham, id);
  if (ayni) return ipucuYaz(fm, 'plaka', `Bu plaka zaten kayıtlı${ayni.sofor_ad ? ` (şoför ${esc(trBaslik(ayni.sofor_ad))})` : ''}`, true);
  const b = fmt.plaka(ham);
  ipucuYaz(fm, 'plaka', PLAKA_DESEN.test(b) ? `Kaydedilecek: ${plakaHtml(b)}` : 'Biçim: 35 ABC 123');
}
function formBagla(fm, { id = null, tamam } = {}) {
  if (id) fm.dataset.aracId = id;
  const plaka = fm.querySelector('[data-f="plaka"]'), tel = fm.querySelector('[data-f="sofor_tel"]');
  plaka.addEventListener('input', () => { delete fm.dataset.plakaOnay; plakaKontrol(fm); });
  plaka.addEventListener('blur', () => { if (plaka.value.trim()) plaka.value = fmt.plaka(plaka.value); });
  tel.addEventListener('blur', () => { const d = telTemizle(tel.value); if (d.length === 10) { tel.value = fmt.tel(d); ipucuYaz(fm, 'sofor_tel', ''); } });
  fm.addEventListener('input', () => { if (id) formKirli = true; fm.querySelector('[data-form-hata]').textContent = ''; });
  fm.addEventListener('submit', e => { e.preventDefault(); formGonder(fm, id, tamam); });
}
async function formGonder(fm, id, tamam) {
  if (!yazabilirMi()) return toast('Araç kaydetme yetkin yok', { tur: 'hata' });
  const { hatalar, satir } = dogrula(formOku(fm), id);
  hatalariYaz(fm, hatalar);
  if (Object.keys(hatalar).length) return;
  if (!PLAKA_DESEN.test(satir.plaka) && fm.dataset.plakaOnay !== satir.plaka) {
    ipucuYaz(fm, 'plaka', `“${esc(satir.plaka)}” alışılmış plaka biçiminde değil (ör. 35 ABC 123). Doğruysa bir kez daha kaydet.`, true);
    fm.dataset.plakaOnay = satir.plaka;
    return;
  }
  const btn = fm.querySelector('[data-kaydet]'); const yazi = btn.textContent;
  btn.disabled = true; btn.textContent = 'Kaydediliyor…';
  try {
    const a = await aracKaydet(id ? { id, ...satir } : satir);
    btn.disabled = false; btn.textContent = yazi;
    tamam?.(a);
  } catch (e) {
    btn.disabled = false; btn.textContent = yazi;
    if (/plaka/i.test(e.message)) ipucuYaz(fm, 'plaka', esc(e.message), true);
    else fm.querySelector('[data-form-hata]').textContent = e.message;
  }
}
function yeniEklendi(a, fm) {
  fm.reset();
  fm.querySelector('[data-f="kapasite"]').value = 4;
  fm.querySelectorAll('[data-ipucu]').forEach(i => { i.innerHTML = ''; i.classList.remove('hata'); });
  fm.querySelectorAll('.araclar-hatali').forEach(i => i.classList.remove('araclar-hatali'));
  delete fm.dataset.plakaOnay;
  yeniId = a.id; yeniZaman = Date.now();
  if (filtre !== 'hepsi' && filtre !== a.durum) filtre = 'hepsi';
  ciz();
  kok?.querySelector(`[data-arac="${a.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  toast(`${fmt.plaka(a.plaka)} eklendi`, { tur: 'basari', geriAl: async () => { await aracSil(a.id); } });
}
function yeniAracAc() {
  const yan = kok?.querySelector('[data-yan]');
  if (yan && yan.offsetParent !== null) { const p = yan.querySelector('[data-f="plaka"]'); p.focus(); p.select(); return; }
  const m = modal('Araç ekle', formHtml({}, 'modal'));
  const fm = m.querySelector('form');
  formBagla(fm, { tamam: a => { modalKapat(); yeniEklendi(a, fm); } });
  fm.querySelector('[data-f="plaka"]').focus();
}

// ---------------------------------------------------------------- araç durumu
async function durumDegistir(id, durum) {
  const a = store.araclar.get(id); if (!a || a.durum === durum) return;
  const eski = a.durum;
  try {
    await aracDurumYap(id, durum);
    toast(`${fmt.plaka(a.plaka)} · ${ARAC_DURUM_AD[durum]}`, { geriAl: () => aracDurumYap(id, eski) });
  } catch (e) { hataGoster(e); ciz(); }
}

// ---------------------------------------------------------------- ROTA MESAJI (WhatsApp)
function rotaDuraklari(a, { hepsi = false } = {}) {
  const tum = duraklar(yolcuHaritasi().get(a.id) || []);
  return hepsi ? tum : tum.filter(durakBekliyor);
}
function rotaAdresleri(liste) {
  return liste.filter(durakBekliyor).map(d => d.f.adres || (d.f.lat != null && d.f.lon != null ? `${d.f.lat},${d.f.lon}` : '')).filter(Boolean);
}
function rotaBaglanti(liste) {
  const adresler = rotaAdresleri(liste).slice(0, MAKS_ARA_DURAK);
  return adresler.length ? fmt.rotaLink(adresler) : fmt.mapsLink(`${VARIS.ad}, İzmir`);
}
function rotaMetni(a, { hepsi = false } = {}) {
  const liste = rotaDuraklari(a, { hepsi });
  const s = ['🚐 72. Komite · Seçim günü rotası', `Araç: ${[fmt.plaka(a.plaka), aracAdi(a), a.renk ? trBaslik(a.renk) : ''].filter(Boolean).join(' · ')}`];
  if (a.sofor_ad) s.push(`Şoför: ${trBaslik(a.sofor_ad)}`);
  s.push('');
  if (!liste.length) s.push('Şu an alınacak yolcu yok.', '');
  else {
    s.push(`${hepsi ? 'Duraklar' : 'Alınacak yolcular'} (${liste.length}, saat sırasıyla):`, '');
    liste.forEach((d, i) => {
      const f = d.f; const tel = kisiTel(f);
      const ek = [d.firmalar.length > 1 ? `${d.firmalar.length} oy` : '', hepsi && !durakBekliyor(d) ? DURUM_AD[f.durum] : ''].filter(Boolean).join(', ');
      s.push(`${i + 1}) ${fmt.saatKisa(f.tasima_saati) || 'Saat belirsiz'} · ${firmaAdi(f)}${ek ? ` (${ek})` : ''}`);
      if (tel) s.push(`   📞 ${fmt.tel(tel)}`);
      if (f.adres) s.push(`   📍 ${String(f.adres).trim()}`);
      else if (f.ilce) s.push(`   📍 ${trBaslik(f.ilce)}`);
      if (f.alma_notu) s.push(`   📝 Alma notu: ${String(f.alma_notu).trim()}`);
      s.push('');
    });
  }
  s.push(`🏁 Varış: ${VARIS.ad}`);
  s.push('🗺️ Tüm rota (Google Maps):', rotaBaglanti(liste));
  return { metin: s.join('\n'), sayi: liste.length, adres: rotaAdresleri(liste).length };
}
function rotaModal(id) {
  const a = store.araclar.get(id); if (!a) return;
  const tel = a.sofor_tel && telTemizle(a.sofor_tel).length === 10 ? a.sofor_tel : '';
  const m = modal(`Rota · ${fmt.plaka(a.plaka)}`, `
    <label class="araclar-onay-kutu"><input type="checkbox" data-hepsi> Alınmış ve teslim edilmiş durakları da listele</label>
    <textarea class="girdi araclar-rota-metin" data-metin spellcheck="false"></textarea>
    <div class="araclar-ipucu dikey" data-rota-bilgi style="margin-top:8px"></div>`,
    `<button class="btn" data-kopyala>Kopyala</button>
     <a class="btn" data-harita target="_blank" rel="noopener">Google Maps</a>
     <a class="btn btn-yesil" data-wa target="_blank" rel="noopener">WhatsApp'ta aç</a>`);
  m.querySelector('.modal').style.width = 'min(640px, 100%)';
  const ta = m.querySelector('[data-metin]'), wa = m.querySelector('[data-wa]'), bilgi = m.querySelector('[data-rota-bilgi]'), hr = m.querySelector('[data-harita]');
  const linkYaz = () => { wa.href = tel ? fmt.waLink(tel, ta.value) : `https://wa.me/?text=${encodeURIComponent(ta.value)}`; };
  const olustur = () => {
    const hepsi = m.querySelector('[data-hepsi]').checked;
    const r = rotaMetni(a, { hepsi });
    ta.value = r.metin; linkYaz();
    hr.href = rotaBaglanti(rotaDuraklari(a, { hepsi }));
    bilgi.innerHTML = [
      tel ? `Gönderilecek: <b>${esc(trBaslik(a.sofor_ad || 'Şoför'))}</b> · ${esc(fmt.tel(tel))}` : 'Şoför telefonu kayıtlı değil: WhatsApp açılınca kişiyi sen seç.',
      r.adres > MAKS_ARA_DURAK ? `Google Maps bağlantısı en çok ${MAKS_ARA_DURAK} ara durak alır; ilk ${MAKS_ARA_DURAK} durak eklendi.` : '',
      'Metni göndermeden önce burada düzenleyebilirsin.',
    ].filter(Boolean).map(x => `<span>${x}</span>`).join('');
  };
  m.querySelector('[data-hepsi]').addEventListener('change', olustur);
  ta.addEventListener('input', linkYaz);
  m.querySelector('[data-kopyala]').addEventListener('click', () => kopyala(ta.value, 'Rota metni kopyalandı'));
  olustur();
}
async function kopyala(metin, basari = 'Kopyalandı') {
  try { await navigator.clipboard.writeText(metin); toast(basari, { tur: 'basari' }); }
  catch {
    const t = el('<textarea style="position:fixed;opacity:0;top:0;left:0"></textarea>'); t.value = metin; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    t.remove(); toast(ok ? basari : 'Kopyalanamadı, metni elle seç', { tur: ok ? 'basari' : 'hata' });
  }
}

// ---------------------------------------------------------------- ARAÇ BEKLEYEN yolcular (toplu atama)
function aracSecenekleri(harita) {
  return aracListesi().map(a => { const o = aracOzet(a, harita); return `<option value="${a.id}">${esc(fmt.plaka(a.plaka))} · ${esc(trBaslik(a.sofor_ad || 'şoför yok'))} · ${o.kisi}/${o.kap}${a.durum !== 'hazir' ? ' · ' + esc(ARAC_DURUM_AD[a.durum] || a.durum) : ''}</option>`; }).join('');
}
function aracsizHtml() {
  const { toplam, gruplar, tekler } = aracsizlar();
  if (!toplam) return '<div class="bos">Tüm servis yolcularının aracı var.</div>';
  if (!store.araclar.size) return '<div class="bos">Önce araç ekle, sonra buradan atayabilirsin.</div>';
  const harita = yolcuHaritasi(); const sec = aracSecenekleri(harita);
  const satirKisi = f => `<a class="araclar-kisi-link" data-kisi="${f.id}">${esc(fmt.saatKisa(f.tasima_saati) || '--:--')} ${esc(firmaAdi(f))}</a>`;
  return `<div class="zayif" style="margin-bottom:10px;color:var(--metin-3);font-weight:600">${toplam} yolcu servisle alınacak ama aracı yok. Rotayı ya da kişiyi seçtiğin araca ata.</div>
    ${gruplar.map(g => `<div class="araclar-aracsiz-grup">
      <div class="araclar-aracsiz-ust"><div class="ana"><div class="araclar-grup-ad">${esc(g.kod)}</div><div class="zayif" style="color:var(--metin-3);font-size:12px;font-weight:600">${esc(kisiSay(duraklar(g.firmalar).length))} · ${esc(saatAraligi(g.firmalar))} · ${esc(ilceMetni(g.firmalar))}</div></div>
        <select class="girdi" data-ata="${g.firmalar.map(f => f.id).join(',')}" data-etiket="${esc(g.kod)}"><option value="">Rotayı araca ata…</option>${sec}</select></div>
      <div class="araclar-grup-kisiler" style="margin-top:6px">${g.firmalar.map(satirKisi).join(' · ')}</div>
    </div>`).join('')}
    ${tekler.length ? `<div class="araclar-alt-baslik">Rotası olmayan</div>${tekler.map(f => `<div class="araclar-aracsiz-grup"><div class="araclar-aracsiz-ust"><div class="ana">${satirKisi(f)}<div style="font-size:12px;color:var(--metin-3);font-weight:600">${esc(trBaslik(f.ilce || ''))}${f.alma_notu ? ' · alma notu var' : ''}</div></div>
      <select class="girdi" data-ata="${kisiGrubu(f).filter(x => !aracVar(x)).map(x => x.id).join(',')}" data-etiket="${esc(firmaAdi(f))}"><option value="">Araca ata…</option>${sec}</select></div></div>`).join('')}` : ''}`;
}
function aracsizModal() {
  const m = modal('Araç bekleyen servis yolcuları', '<div data-aracsiz></div>');
  m.querySelector('.modal').style.width = 'min(760px, 100%)';
  const govde = m.querySelector('[data-aracsiz]');
  const yenile = () => { govde.innerHTML = aracsizHtml(); };
  m.addEventListener('change', async e => {
    const s = e.target.closest('[data-ata]'); if (!s || !s.value) return;
    const ids = s.dataset.ata.split(',').map(Number).filter(Boolean);
    await yolcuEkle(Number(s.value), ids, s.dataset.etiket);
    yenile();
  });
  m.addEventListener('click', e => { const k = e.target.closest('[data-kisi]'); if (k) { e.preventDefault(); modalKapat(); kisiKartiAc(Number(k.dataset.kisi)); } });
  yenile();
}

// ---------------------------------------------------------------- yolcu ekle / çıkar
async function yolcuEkle(aracId, ids, etiket) {
  const a = store.araclar.get(aracId); ids = [...new Set(ids)].filter(Boolean);
  if (!a || !ids.length) return;
  if (!yazabilirMi()) return toast('Araç atama yetkin yok', { tur: 'hata' });
  try {
    const geriAl = await aracAta(ids, aracId);
    const o = aracOzet(a, yolcuHaritasi());
    toast(`${etiket || kisiSay(ids.length)} · ${fmt.plaka(a.plaka)} aracına eklendi${o.kisi > o.kap ? ` · kapasite aşıldı (${o.kisi}/${o.kap})` : ''}`, { geriAl });
  } catch (e) { hataGoster(e); }
}
async function yolcuCikar(aracId, ids, etiket) {
  const a = store.araclar.get(aracId);
  try { const geriAl = await aracAta(ids, null); toast(`${etiket} · ${a ? fmt.plaka(a.plaka) + ' aracından' : 'araçtan'} çıkarıldı`, { geriAl }); }
  catch (e) { hataGoster(e); }
}

// ---------------------------------------------------------------- ARAÇ ÇEKMECESİ
function aracAc(id) {
  const a = store.araclar.get(id); if (!a) return toast('Araç bulunamadı', { tur: 'hata' });
  acikArac = id; formKirli = false;
  const c = cekmeceAc(`
    <div class="cekmece-ust"><div class="araclar-c-ust" data-c-ust></div><button class="btn btn-hayalet btn-ikon" data-kapat-cekmece title="Kapat (Esc)">✕</button></div>
    <div class="cekmece-govde">
      <div data-c-eylem></div>
      <div class="araclar-bolum" style="margin-top:4px">
        <div class="araclar-bolum-ust"><div class="bolum-baslik" data-c-durak-baslik>Duraklar</div></div>
        <div data-c-duraklar></div>
      </div>
      ${yazabilirMi() ? `<div class="araclar-bolum">
        <div class="araclar-bolum-ust"><div class="bolum-baslik">Yolcu ekle</div></div>
        <input class="girdi" data-yolcu-ara type="search" placeholder="Ad, firma, telefon, ilçe ya da rota ara…" autocomplete="off">
        <div class="araclar-sonuc" data-c-sonuc></div>
      </div>` : ''}
      <div class="araclar-bolum">
        <div class="araclar-bolum-ust"><div class="bolum-baslik">Şoför girişi</div></div>
        <div data-c-sofor></div>
      </div>
      <details class="araclar-detay" data-c-bilgi ${yazabilirMi() ? '' : 'hidden'}><summary>Araç bilgileri</summary><div data-c-form></div></details>
      ${yoneticiMi() ? `<div class="araclar-tehlike"><button class="btn btn-kucuk" data-sil>Aracı sil</button><span class="zayif" style="color:var(--metin-3);font-size:12px">Yolcular araçsız kalır, kayıtları silinmez.</span></div>` : ''}
    </div>`, { kapaninca: () => { if (acikArac === id) acikArac = null; formKirli = false; } });
  c.dataset.aracCekmece = id;
  cekmeceBagla(c, id);
  cekmeceYenile({ form: true });
}
function cekmeceUstHtml(a, o) {
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${plakaHtml(a.plaka, true)} ${rozetAracDurum(a.durum)}${a.sofor_kullanici ? ' <span class="rozet a-hazir">Şoför uygulamada</span>' : ''}</div>
    <div class="araclar-arac-ad">${esc(aracAdi(a) || 'Araç')}<span>${esc([a.renk ? trBaslik(a.renk) : '', `${o.kap} kişilik`, a.sofor_ad ? `şoför ${trBaslik(a.sofor_ad)}` : 'şoför girilmedi'].filter(Boolean).join(' · '))}</span></div>`;
}
function cekmeceEylemHtml(a, o) {
  const tel = a.sofor_tel; const yaz = yazabilirMi();
  const rota = rotaBaglanti(o.duraklar);
  return `
    <div class="bolum-baslik">Araç durumu</div>
    <div class="araclar-durum-seg">${ARAC_DURUMLARI.map(d => `<button class="${d.k === a.durum ? `secili a-${d.k}` : ''}" data-arac-durum-btn="${d.k}" ${yaz ? '' : 'disabled'}>${esc(d.ad)}</button>`).join('')}</div>
    <div class="araclar-c-ozet">
      <div>${dolulukHtml(o)}</div>
      <div class="araclar-konum" style="text-align:right">${konumHtml(a)}</div>
    </div>
    ${a.notlar ? `<div class="araclar-not" style="margin-bottom:12px">${esc(a.notlar)}</div>` : ''}
    <div class="eylemler" style="margin-top:0">
      ${o.duraklar.length ? `<button class="btn btn-yesil" data-rota-gonder="${a.id}">Rotayı şoföre WhatsApp'la gönder</button>` : ''}
      ${o.bekleyen.length ? `<a class="btn" href="${esc(rota)}" target="_blank" rel="noopener">🗺️ Rotayı Google Maps'te aç</a>` : ''}
      ${fmt.telLink(tel) ? `<a class="btn" href="${esc(fmt.telLink(tel))}">📞 Şoförü ara</a>` : ''}
      ${fmt.waLink(tel) ? `<a class="btn" href="${esc(fmt.waLink(tel))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
    </div>`;
}
const SONRAKI = { bekliyor: ['yolda', 'Alındı · yolda'], arandi: ['yolda', 'Alındı · yolda'], yolda: ['fuarda', 'Fuara vardı'], fuarda: ['oy_kullandi', 'Oy kullandı'] };
function duraklarHtml(a, o) {
  if (!o.duraklar.length) return `<div class="araclar-siradaki bos">Bu araca henüz yolcu atanmadı.${yazabilirMi() ? ' Aşağıdan ara ya da bekleyen bir rotayı ekle.' : ''}</div>`;
  const yaz = yazabilirMi(); const siradakiAnahtar = o.siradaki ? kisiAnahtar(o.siradaki.f) : null;
  return `<ol class="araclar-durak-liste">${o.duraklar.map((d, i) => {
    const f = d.f; const tamam = durakTamam(d); const tel = kisiTel(f); const sonraki = SONRAKI[f.durum];
    const ids = d.firmalar.map(x => x.id).join(',');
    const sira = siradakiAnahtar === kisiAnahtar(f);
    return `<li class="araclar-durak ${tamam ? 'bitti' : ''} ${sira ? 'siradaki' : ''}">
      <div class="araclar-durak-no">${tamam ? '✓' : i + 1}</div>
      <div class="araclar-durak-govde">
        <div class="araclar-durak-ust"><span class="araclar-saat">${esc(fmt.saatKisa(f.tasima_saati) || '--:--')}</span><a class="araclar-durak-ad araclar-kisi-link" data-kisi="${f.id}">${esc(firmaAdi(f))}</a>${rozetDurum(f)} ${uyariRozetleri(f, { hepsi: false })}${sira ? ' <span class="rozet u-atlas">Sıradaki</span>' : ''}</div>
        <div class="araclar-durak-alt">${d.firmalar.map(x => esc(x.unvan || '')).join('<br>')}</div>
        <div class="araclar-durak-alt">${tel ? `<b>${esc(fmt.tel(tel))}</b> · ` : ''}${esc(f.adres || 'Adres yok')}${f.ilce ? ` · ${esc(trBaslik(f.ilce))}` : ''}${f.rota_kod ? ` · <span title="Rota">${esc(f.rota_kod)}${f.rota_sira ? ` / ${f.rota_sira}. durak` : ''}</span>` : ''}</div>
        ${f.alma_notu ? `<div class="araclar-alma">📍 Alma notu: ${esc(f.alma_notu)}</div>` : ''}
        <div class="araclar-durak-eylem">
          ${yaz && sonraki && !tamam ? `<button class="btn btn-kucuk ${sonraki[0] === 'oy_kullandi' ? 'btn-yesil' : 'btn-koyu'}" data-isaret="${f.id}" data-durum="${sonraki[0]}">${esc(sonraki[1])}</button>` : ''}
          ${fmt.telLink(tel) ? `<a class="btn btn-kucuk" href="${esc(fmt.telLink(tel))}">📞 Ara</a>` : ''}
          ${f.adres ? `<a class="btn btn-kucuk" href="${esc(fmt.mapsLink(f.adres))}" target="_blank" rel="noopener">📍 Yol tarifi</a>` : ''}
          ${yaz ? `<button class="btn btn-kucuk btn-hayalet" data-cikar="${ids}" data-etiket="${esc(firmaAdi(f))}" title="Bu araçtan çıkar">Çıkar</button>` : ''}
        </div>
      </div>
    </li>`;
  }).join('')}</ol>`;
}
function sonucHtml(a, q) {
  q = (q || '').trim();
  if (q.length < 2) {
    const { toplam, gruplar, tekler } = aracsizlar();
    if (!toplam) return '<div class="zayif" style="color:var(--metin-3);font-size:12px;font-weight:600;padding:6px 2px">Araç bekleyen servis yolcusu yok. İsimle arayıp herhangi bir kişiyi ekleyebilirsin.</div>';
    const G = 6, T = 6;
    return `<div class="araclar-alt-baslik">Araç bekleyen rotalar (${gruplar.length})</div>
      ${gruplar.slice(0, G).map(g => { const dk = duraklar(g.firmalar).length; return `<div class="araclar-sonuc-satir">
        <div class="ana"><b class="araclar-grup-ad">${esc(g.kod)}</b><span>${esc(kisiSay(dk))} · ${esc(saatAraligi(g.firmalar))} · ${esc(ilceMetni(g.firmalar))}</span><span class="araclar-grup-kisiler">${g.firmalar.map(f => esc(firmaAdi(f))).join(', ')}</span></div>
        <div class="sag"><button class="btn btn-kucuk btn-koyu" data-ekle="${g.firmalar.map(f => f.id).join(',')}" data-etiket="${esc(g.kod)}">Rotayı ekle (${dk})</button></div>
      </div>`; }).join('') || '<div class="zayif" style="color:var(--metin-3);font-size:12px">Rotası olan bekleyen yolcu yok.</div>'}
      ${gruplar.length > G ? `<div class="araclar-daha" style="padding-left:2px">ve ${gruplar.length - G} rota daha: adını ya da rota kodunu yazarak bul</div>` : ''}
      ${tekler.length ? `<div class="araclar-alt-baslik">Rotası olmayan servis yolcuları (${tekler.length})</div>${tekler.slice(0, T).map(f => sonucSatir(a, f)).join('')}${tekler.length > T ? `<div class="araclar-daha" style="padding-left:2px">ve ${tekler.length - T} kişi daha</div>` : ''}` : ''}`;
  }
  const t = trArama(q);
  const parca = t.split(' ').filter(Boolean);
  const rotaUyar = f => { if (!f.rota_kod) return false; const rk = trArama(`${f.rota_kod} ${f.ilce || ''} ${f.rota_ilceler || ''}`); return parca.every(p => rk.includes(p)); };
  const bulunan = firmaListesi().filter(f => aramaEslesir(f, q) || rotaUyar(f));
  const puan = f => (f.arac_id === a.id ? 3 : 0) + (TAMAM.includes(f.durum) ? 2 : 0) + (ulasim(f) === 'servis' && !aracVar(f) ? 0 : 1) + (f.oy_sinifi === 'bizde' ? 0 : 0.5);
  bulunan.sort((x, y) => (puan(x) - puan(y)) || firmaAdi(x).localeCompare(firmaAdi(y), 'tr'));
  if (!bulunan.length) return '<div class="zayif" style="color:var(--metin-3);font-size:12px;font-weight:600;padding:6px 2px">Sonuç yok.</div>';
  const N = 15;
  return bulunan.slice(0, N).map(f => sonucSatir(a, f)).join('') + (bulunan.length > N ? `<div class="araclar-daha" style="padding-left:2px">${bulunan.length - N} sonuç daha, aramayı daralt</div>` : '');
}
function sonucSatir(a, f) {
  const burada = f.arac_id === a.id; const baska = !burada && aracVar(f) ? store.araclar.get(f.arac_id) : null;
  const grup = kisiGrubu(f).filter(x => x.arac_id !== a.id);
  const ids = (grup.length ? grup : [f]).map(x => x.id).join(',');
  const bilgi = [f.unvan, trBaslik(f.ilce || ''), f.tasima_saati ? `servis ${fmt.saatKisa(f.tasima_saati)}` : ulasim(f) === 'servis' ? 'servis' : ulasim(f) === 'kendi' ? 'kendi gelecek' : '', f.rota_kod || ''].filter(Boolean).join(' · ');
  return `<div class="araclar-sonuc-satir ${burada ? 'icinde' : ''}">
    <div class="ana"><b><a class="araclar-kisi-link" data-kisi="${f.id}">${esc(firmaAdi(f))}</a></b><span>${esc(bilgi)}</span></div>
    <div class="sag">${rozetSinif(f.oy_sinifi)} ${rozetDurum(f)} ${baska ? `<span title="Şu an bu araçta">${plakaHtml(baska.plaka)}</span>` : ''}
      ${burada ? '<span class="rozet a-hazir">Bu araçta</span>'
        : `<button class="btn btn-kucuk ${baska ? '' : 'btn-koyu'}" data-ekle="${ids}" data-etiket="${esc(firmaAdi(f))}" title="${baska ? `Şu an ${esc(fmt.plaka(baska.plaka))} aracında; bu araca taşınır` : 'Bu araca ekle'}">${baska ? 'Buraya al' : 'Ekle'}</button>`}
    </div>
  </div>`;
}
function soforHtml(a) {
  const yon = yoneticiMi();
  if (a.sofor_kullanici) {
    const p = store.profiller.get(a.sofor_kullanici);
    return `<div class="araclar-sofor-kutu bagli">
      <div><div class="araclar-etiket">Bağlı şoför kullanıcısı</div>
        <div style="font-weight:800;font-size:15px;margin-top:2px">${esc(p?.ad_soyad || 'Kullanıcı')} ${p && !p.aktif ? '<span class="rozet a-arizali">Pasif</span>' : ''}</div>
        <div style="font-size:12px;color:var(--metin-2);font-weight:600">${p?.son_giris ? `Son giriş ${esc(fmt.goreli(p.son_giris))}` : 'Henüz giriş yapmadı'}${p && a.sofor_ad && trArama(p.ad_soyad) !== trArama(a.sofor_ad) ? ` · araçtaki şoför adı farklı: ${esc(trBaslik(a.sofor_ad))}` : ''}</div></div>
      ${yon ? `<div class="eylemler"><button class="btn btn-kucuk" data-pin-sifirla>Yeni PIN üret</button><button class="btn btn-kucuk btn-hayalet" data-bag-kaldir>Bağlantıyı kaldır</button></div>` : ''}
    </div>`;
  }
  if (!yon) return '<div class="araclar-sofor-kutu"><div style="font-size:13px;color:var(--metin-2);font-weight:600">Bu araca bağlı şoför girişi yok. Şoför girişini yalnız yönetici oluşturabilir.</div></div>';
  if (!a.sofor_ad || a.sofor_ad.trim().length < 3) return '<div class="araclar-sofor-kutu"><div style="font-size:13px;color:var(--metin-2);font-weight:600">Şoför girişi oluşturmak için önce aşağıdaki “Araç bilgileri” bölümünden şoförün adını soyadını yaz.</div></div>';
  const ayni = [...store.profiller.values()].find(p => trArama(p.ad_soyad) === trArama(a.sofor_ad));
  if (ayni) {
    const baskaArac = [...store.araclar.values()].find(x => x.id !== a.id && x.sofor_kullanici === ayni.id);
    if (ayni.rol === 'sofor') {
      return `<div class="araclar-sofor-kutu"><div style="font-size:13px;font-weight:600">“${esc(ayni.ad_soyad)}” adlı şoför kullanıcısı zaten var${baskaArac ? ` ve şu an <b>${esc(fmt.plaka(baskaArac.plaka))}</b> aracına bağlı` : ''}.</div>
        <div class="eylemler"><button class="btn btn-koyu btn-kucuk" data-bagla="${esc(ayni.id)}">${baskaArac ? 'Bu araca taşı' : 'Bu araca bağla'}</button></div></div>`;
    }
    return `<div class="araclar-sofor-kutu"><div style="font-size:13px;font-weight:600">“${esc(ayni.ad_soyad)}” adıyla ${esc(ROL_AD[ayni.rol] || ayni.rol)} rolünde bir kullanıcı var. Şoför girişi için araç bilgilerinde farklı bir ad yaz (ör. “${esc(trBaslik(a.sofor_ad))} Şoför”).</div></div>`;
  }
  return `<div class="araclar-sofor-kutu">
    <div style="font-size:13px;color:var(--metin-2);font-weight:600">“${esc(trBaslik(a.sofor_ad))}” için 4 haneli PIN üretilir ve kullanıcı bu araca bağlanır. Şoför telefonundan ad soyad + PIN ile girer.</div>
    <div class="eylemler"><button class="btn btn-koyu" data-giris-olustur>Şoför girişi oluştur</button></div>
  </div>`;
}
function cekmeceYenile({ form = false } = {}) {
  const c = document.querySelector('#katman .cekmece');
  if (!c || !acikArac || Number(c.dataset.aracCekmece) !== acikArac) return;
  const a = store.araclar.get(acikArac);
  if (!a) { acikArac = null; cekmeceKapat(); toast('Araç silindi'); return; }
  const o = aracOzet(a, yolcuHaritasi());
  const govde = c.querySelector('.cekmece-govde'); const kaydir = govde.scrollTop;
  c.querySelector('[data-c-ust]').innerHTML = cekmeceUstHtml(a, o);
  c.querySelector('[data-c-eylem]').innerHTML = cekmeceEylemHtml(a, o);
  c.querySelector('[data-c-durak-baslik]').textContent = `Duraklar (${o.kisi})`;
  c.querySelector('[data-c-duraklar]').innerHTML = duraklarHtml(a, o);
  const ara = c.querySelector('[data-yolcu-ara]'); if (ara) c.querySelector('[data-c-sonuc]').innerHTML = sonucHtml(a, ara.value);
  c.querySelector('[data-c-sofor]').innerHTML = soforHtml(a);
  const fk = c.querySelector('[data-c-form]');
  if (fk && (form || (!formKirli && !fk.contains(document.activeElement)))) {
    fk.innerHTML = formHtml(a, 'duzenle');
    formBagla(fk.querySelector('form'), { id: a.id, tamam: kayit => { formKirli = false; toast(`${fmt.plaka(kayit.plaka)} kaydedildi`, { tur: 'basari' }); cekmeceYenile({ form: true }); } });
  }
  govde.scrollTop = kaydir;
}
function cekmeceBagla(c, id) {
  c.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-kapat-cekmece]')) return cekmeceKapat();
    const k = t.closest('[data-kisi]'); if (k) { e.preventDefault(); return kisiKartiAc(Number(k.dataset.kisi)); }
    const d = t.closest('[data-arac-durum-btn]'); if (d) return durumDegistir(id, d.dataset.aracDurumBtn);
    if (t.closest('[data-rota-gonder]')) return rotaModal(id);
    const is = t.closest('[data-isaret]'); if (is) return isaretle(Number(is.dataset.isaret), is.dataset.durum, { kendi: false });
    const ck = t.closest('[data-cikar]'); if (ck) return yolcuCikar(id, ck.dataset.cikar.split(',').map(Number), ck.dataset.etiket);
    const ek = t.closest('[data-ekle]'); if (ek) {
      const ids = ek.dataset.ekle.split(',').map(Number).filter(Boolean);
      const hedef = ids.filter(x => { const f = store.firmalar.get(x); return f && f.arac_id !== id; });
      return yolcuEkle(id, hedef, ek.dataset.etiket);
    }
    if (t.closest('[data-giris-olustur]')) return girisOlustur(id, t.closest('button'));
    if (t.closest('[data-pin-sifirla]')) return pinSifirla(id);
    if (t.closest('[data-bag-kaldir]')) return baglantiKaldir(id);
    const bg = t.closest('[data-bagla]'); if (bg) return kullaniciBagla(id, bg.dataset.bagla);
    if (t.closest('[data-sil]')) return aracSilAkisi(id);
  });
  c.querySelector('[data-yolcu-ara]')?.addEventListener('input', e => {
    const a = store.araclar.get(id); if (a) c.querySelector('[data-c-sonuc]').innerHTML = sonucHtml(a, e.target.value);
  });
}

// ---------------------------------------------------------------- şoför girişi (yönetici)
function girisAdresi() {
  const u = store.ayarlar.site?.url; if (u) return String(u);
  if (/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) return '';
  return location.origin + location.pathname;
}
function pinGoster(a, adSoyad, pin, { yeni = true } = {}) {
  const adres = girisAdresi();
  const metin = [
    `Merhaba ${trBaslik(adSoyad)}, 72. Komite seçim günü şoför girişin ${yeni ? 'hazır' : 'yenilendi'}.`,
    `Araç: ${fmt.plaka(a.plaka)}`,
    adres ? `Giriş: ${adres}` : null,
    `Ad soyad: ${adSoyad}`,
    `PIN: ${pin}`,
    'Bu bilgilerle giriş yapabilirsin.',
  ].filter(Boolean).join('\n');
  const tel = a.sofor_tel && telTemizle(a.sofor_tel).length === 10 ? a.sofor_tel : '';
  const m = modal(yeni ? 'Şoför girişi oluşturuldu' : 'Yeni PIN üretildi', `
    <div class="araclar-pin-kutu">
      <div class="araclar-etiket">Ad soyad</div><div class="araclar-pin-ad">${esc(adSoyad)}</div>
      <div class="araclar-etiket">PIN</div><div class="araclar-pin">${esc(pin)}</div>
    </div>
    <div class="uyari-kutu turuncu" style="margin-top:0"><span>!</span><div>PIN yalnız şimdi görünür. Kapatmadan önce şoföre ilet.<div style="font-weight:600">Unutulursa buradan yeni PIN üretilebilir.</div></div></div>
    <textarea class="girdi" data-pin-metin rows="7" readonly style="font-size:13px">${esc(metin)}</textarea>
    ${adres ? '' : '<div class="araclar-ipucu" style="margin-top:6px">Bu bilgisayar yerel adreste çalışıyor; mesaja giriş bağlantısı eklenmedi. Yayındaki adresi elle ekle.</div>'}`,
    `<button class="btn" data-kopyala>Kopyala</button>
     <a class="btn btn-yesil" target="_blank" rel="noopener" href="${esc(tel ? fmt.waLink(tel, metin) : `https://wa.me/?text=${encodeURIComponent(metin)}`)}">${tel ? "WhatsApp'la gönder" : "WhatsApp'ta aç"}</a>`);
  m.querySelector('[data-kopyala]').addEventListener('click', () => kopyala(metin, 'Giriş bilgisi kopyalandı'));
}
async function aracTazele(id) {
  const { data } = await sb.from('araclar').select('*').eq('id', id).maybeSingle();
  if (data) { store.araclar.set(id, data); bus.emit('arac', { id }); }
}
async function girisOlustur(id, btn) {
  const a = store.araclar.get(id); if (!a || !yoneticiMi()) return;
  const ad = String(a.sofor_ad || '').trim().replace(/\s+/g, ' ');
  if (ad.length < 3) return toast('Önce şoförün adını soyadını yaz', { tur: 'hata' });
  if (btn) { btn.disabled = true; btn.textContent = 'Oluşturuluyor…'; }
  try {
    const r = await yonetim('olustur', { ad_soyad: ad, rol: 'sofor', arac_id: id });
    await Promise.all([aracTazele(id), profilleriYenile()]).catch(() => {});
    pinGoster(store.araclar.get(id) || a, r.ad_soyad || ad, r.pin, { yeni: true });
  } catch (e) {
    hataGoster(e);
    if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'Şoför girişi oluştur'; }
  }
}
async function pinSifirla(id) {
  const a = store.araclar.get(id); const p = a?.sofor_kullanici ? store.profiller.get(a.sofor_kullanici) : null;
  if (!a || !a.sofor_kullanici || !yoneticiMi()) return;
  const ad = p?.ad_soyad || a.sofor_ad || 'Şoför';
  if (!(await onayla(`${ad} için yeni PIN üretilsin mi? Eski PIN hemen geçersiz olur.`, { evet: 'Yeni PIN üret' }))) return;
  try { const r = await yonetim('pin_sifirla', { id: a.sofor_kullanici }); pinGoster(a, ad, r.pin, { yeni: false }); }
  catch (e) { hataGoster(e); }
}
async function baglantiKaldir(id) {
  const a = store.araclar.get(id); if (!a || !yoneticiMi()) return;
  const p = store.profiller.get(a.sofor_kullanici);
  if (!(await onayla(`${p?.ad_soyad || 'Şoför'} kullanıcısının ${fmt.plaka(a.plaka)} ile bağlantısı kaldırılsın mı? Kullanıcı silinmez; bu aracın duraklarını göremez.`, { evet: 'Bağlantıyı kaldır', tehlike: true }))) return;
  try { await aracKaydet({ id, plaka: a.plaka, sofor_kullanici: null }); toast('Bağlantı kaldırıldı'); }
  catch (e) { hataGoster(e); }
}
async function kullaniciBagla(id, profilId) {
  const a = store.araclar.get(id); if (!a || !yoneticiMi()) return;
  try {
    const eski = [...store.araclar.values()].find(x => x.id !== id && x.sofor_kullanici === profilId);
    if (eski) await aracKaydet({ id: eski.id, plaka: eski.plaka, sofor_kullanici: null });
    await aracKaydet({ id, plaka: a.plaka, sofor_kullanici: profilId });
    toast(`${store.profiller.get(profilId)?.ad_soyad || 'Şoför'} · ${fmt.plaka(a.plaka)} aracına bağlandı`, { tur: 'basari' });
  } catch (e) { hataGoster(e); }
}
async function aracSilAkisi(id) {
  const a = store.araclar.get(id); if (!a || !yoneticiMi()) return;
  const o = aracOzet(a, yolcuHaritasi());
  const ek = [o.kisi ? `Atanmış ${o.kisi} yolcu araçsız kalır.` : '', a.sofor_kullanici ? 'Şoför kullanıcısı silinmez, yalnız bağlantısı kopar.' : ''].filter(Boolean).join(' ');
  if (!(await onayla(`${fmt.plaka(a.plaka)} aracı silinsin mi? ${ek}`.trim(), { evet: 'Evet, aracı sil', tehlike: true }))) return;
  try { await aracSil(id); cekmeceKapat(); toast(`${fmt.plaka(a.plaka)} silindi`); }
  catch (e) { hataGoster(e); }
}

// ---------------------------------------------------------------- sayfa olayları
function sayfaBagla() {
  kok.addEventListener('click', e => {
    const t = e.target;
    const g = t.closest('[data-gorunum]'); if (g) { gorunum = g.dataset.gorunum; try { localStorage.setItem(GORUNUM_ANAHTAR, gorunum); } catch {} return ciz(); }
    const fl = t.closest('[data-filtre]'); if (fl) { filtre = fl.dataset.filtre; return ciz(); }
    if (t.closest('[data-yeni]')) return yeniAracAc();
    if (t.closest('[data-aracsiz]')) return aracsizModal();
    const k = t.closest('[data-kisi]'); if (k) { e.preventDefault(); return kisiKartiAc(Number(k.dataset.kisi)); }
    const r = t.closest('[data-rota-gonder]'); if (r) return rotaModal(Number(r.dataset.rotaGonder));
    const ac = t.closest('[data-ac]'); if (ac) return aracAc(Number(ac.dataset.ac));
    if (t.closest('a, button, select, input, textarea, label')) return;
    const kart = t.closest('[data-liste] [data-arac]'); if (kart) aracAc(Number(kart.dataset.arac));
  });
  kok.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.matches?.('[data-aracsiz]')) return aracsizModal();
    if (e.target.matches?.('.araclar-kart')) aracAc(Number(e.target.dataset.arac));
  });
  kok.addEventListener('change', e => {
    const s = e.target.closest('[data-arac-durum]'); if (!s) return;
    const id = Number(s.dataset.aracDurum); const v = s.value;
    s.blur(); durumDegistir(id, v); ciz();
  });
  kok.addEventListener('focusout', () => { if (listeBekliyor) setTimeout(() => { if (listeBekliyor && !(document.activeElement?.tagName === 'SELECT' && kok?.contains(document.activeElement))) ciz(); }, 0); });
  const ara = kok.querySelector('[data-ara]');
  ara.addEventListener('input', () => { arama = ara.value; ciz(); });
  ara.addEventListener('keydown', e => { if (e.key === 'Escape' && ara.value) { e.stopPropagation(); ara.value = ''; arama = ''; ciz(); } });
  const yanForm = kok.querySelector('[data-yan] form');
  if (yanForm) formBagla(yanForm, { tamam: a => yeniEklendi(a, yanForm) });
}

// ---------------------------------------------------------------- ekran modülü
export default {
  async render(hedef, param) {
    stilEkle();
    kok = hedef; acikArac = null; formKirli = false;
    kok.innerHTML = iskeletHtml();
    sayfaBagla();
    ciz();
    const id = Number(param);
    if (id && store.araclar.has(id)) aracAc(id);
  },
  yenile() {
    if (!kok || !kok.isConnected) return;
    const odak = document.activeElement;
    if (odak && odak.tagName === 'SELECT' && kok.contains(odak)) listeBekliyor = true;   // açık açılır liste kapanmasın
    else ciz();
    cekmeceYenile();
  },
  temizle() {
    kok = null; acikArac = null; formKirli = false; listeBekliyor = false;
  },
};
