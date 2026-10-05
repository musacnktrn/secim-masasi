// 72. Komite · Seçim Masası · ARAÇLAR ekranı (Claude Design: SM Araclar + SM AracKarti + SM Gorev)
// Sayılar, Kartlar / Tablo / Görev dağılımı, sağda HIZLI ARAÇ EKLE, Araç Kartı çekmecesi (durum menüsü, şoför, sorumlu,
// metrikler, rota WhatsApp önizlemesi, Google Maps, sürükle-bırak durak sırası, yolcu ekle / çıkar, sefer geçmişi, notlar, araç geçmişi).
// Veri yazma yalnız core.js işlevleriyle: aracKaydet, aracSil, aracDurumYap, aracSorumluAta, aracAta, firmaAlanYaz, yonetim. İşaretleme ui.isaretle ile.
import {
  store, bus, sb, esc, fmt, trBaslik, trArama, dakika, ARAC_DURUMLARI, ARAC_DURUM_AD, DURUM_AD, ROL_AD, VARIS,
  yazabilirMi, yoneticiMi, referansBenMi, karsiladim, firmaListesi, firmaAdi, aramaEslesir, gecikme, ulasim, kisiGrubu, olayMetni, ekip,
  aracAta, aracKaydet, aracSil, aracDurumYap, aracSorumluAta, firmaAlanYaz, yonetim, profilleriYenile,
} from '../core.js';
import {
  el, bas, rozetSinif, rozetDurum, toast, hataGoster, cekmeceAc, cekmeceKapat, modal, modalKapat, onayla, isaretle, kisiKartiAc,
} from '../ui.js';
import { KOMITE, anahtar, komiteLinki } from '../komite.js';

// ---------------------------------------------------------------- ekran durumu
const GORUNUM_ANAHTAR = anahtar('secim-araclar-gorunum');
const GORUNUMLER = ['kart', 'tablo', 'gorev'];
let kok = null;
let gorunum = 'kart';
try { const g = localStorage.getItem(GORUNUM_ANAHTAR); if (GORUNUMLER.includes(g)) gorunum = g; } catch {}
let filtre = 'hepsi';          // hepsi | yolda | fuarda | bosta
let arama = '';
let acikArac = null;           // çekmecede açık araç id
let durumMenu = false, sorumluMenu = false;   // çekmece menüleri
let waAcik = false, waDuzenlendi = false;     // WhatsApp önizlemesi açık mı, metin elle değiştirildi mi
let formKirli = false;         // çekmecedeki bilgi formu elle değiştirildi mi (canlı yenileme ezmesin)
let surukleniyor = false, yenileBekliyor = false;   // görev dağılımı sürüklemesi
let siraYaziliyor = false;     // durak sırası kaydedilirken çekmece yenilenmesin
let durakSuruklenen = null, durakUstunde = null;
let yeniId = null, yeniZaman = null;

// ---------------------------------------------------------------- yardımcılar
const TAMAM = ['fuarda', 'oy_kullandi'];                 // teslim edildi
const ALINDI = ['yolda', 'fuarda', 'oy_kullandi'];       // araca bindi ya da vardı
const bekleyenMi = f => !ALINDI.includes(f.durum);
const plakaAnahtar = p => String(p || '').toLocaleUpperCase('tr').replace(/\s+/g, '');
const PLAKA_DESEN = /^\d{2} [A-Z]{1,3} \d{2,4}$/;
const kisiAnahtar = f => f.kisi_anahtar || 'f' + f.id;
const aracVar = f => !!(f.arac_id && store.araclar.has(f.arac_id));
const aracAdi = a => [a.marka, a.model].filter(Boolean).join(' ');
const MAKS_ARA_DURAK = 9;     // Google Maps yol tarifi bağlantısı en çok 9 ara durak alır
const KAPASITELER = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16];
const saatYaz = ts => fmt.saat(ts);
function telTemizle(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
// serbest metin telefon alanından ilk gerçek numarayı çıkar ("0532 111 22 33 / 0533 ..." gibi)
const ilkNumara = t => String(t || '').split(/[/,;]|\s-\s|\s{2,}/).map(x => x.replace(/\D/g, '')).find(d => d.length >= 10 && d.length <= 12) || '';
const kisiTel = f => ilkNumara(f.cep) || ilkNumara(f.cep2) || ilkNumara(f.sabit_tel);
// tasarımın SM.formatPlate işlevi: 35abc123 -> 35 ABC 123
function plakaBicimle(s) {
  const c = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const m = c.match(/^(\d{0,2})([A-Z]{0,3})(\d{0,4})/);
  return m ? [m[1], m[2], m[3]].filter(Boolean).join(' ') : '';
}
// "Uğur Demir" -> "Uğur D."
function kisaAd(f) {
  const w = firmaAdi(f).split(/\s+/).filter(Boolean);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1][0].toLocaleUpperCase('tr')}.` : (w[0] || '');
}
const shortBy = b => { if (!b) return ''; const w = trBaslik(b).split(' ').filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : trBaslik(b); };
// "SOLFER SOĞUTMA ... LİMİTED ŞİRKETİ" -> "Solfer Soğutma ..." (yasal ek çıkar; taşan kısmı CSS keser)
export function kisaFirma(u) {
  const s = String(u || '').replace(/\s+(LİMİTED|LIMITED|ANONİM)\s+ŞİRKETİ\s*$/i, '').replace(/\s+(LTD\.?\s*ŞTİ\.?|A\.?\s?Ş\.?)\s*$/i, '').replace(/\s+SANAYİ\s+VE\s+TİCARET\s*$/i, '').trim();
  return trBaslik(s);
}
// Türkçe iyelik eki: "Ayşe K." -> "Ayşe K.'nın"
const sonUnlu = w => { const m = w.toLocaleLowerCase('tr').match(/[aeıioöuü]/g); return m ? m[m.length - 1] : 'e'; };
const iyelik = w => {
  w = (w || '').trim(); if (/\.$/.test(w)) return `${w}'nın`;
  const s = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' }[sonUnlu(w)];
  return `${w}'${/[aeıioöuüAEIİOÖUÜ]$/.test(w) ? 'n' : ''}${s}`;
};
export function mesafeKm(lat1, lon1, lat2, lon2) {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// duraklar: önce elle verilen arac_sira (sürükle-bırak), sonra saat, rota sırası
function durakSirala(liste) {
  return liste.slice().sort((a, b) => {
    const o = (a.arac_sira ?? 999) - (b.arac_sira ?? 999); if (o) return o;
    const sa = dakika(a.tasima_saati), sb2 = dakika(b.tasima_saati);
    if (sa !== sb2) return sa == null ? 1 : sb2 == null ? -1 : sa - sb2;
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
const durakGoster = d => d.firmalar.find(bekleyenMi) || d.f;    // gün rozeti için temsilci firma
export function yolcuHaritasi() {
  const m = new Map();
  for (const f of store.firmalar.values()) if (f.arac_id) { if (!m.has(f.arac_id)) m.set(f.arac_id, []); m.get(f.arac_id).push(f); }
  return m;
}
// rota adı: baskın rota_kod ("HARUN BULAN · Rota 3") + ilçeler; referans: en çok geçen referans
function rotaBilgi(firmalar) {
  if (!firmalar.length) return { yok: true, tek: false, ad: 'Atanmamış · boşta', ref: '' };
  const say = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const kodlar = new Map(), refler = new Map();
  for (const f of firmalar) {
    if (f.rota_kod) kodlar.set(f.rota_kod, (kodlar.get(f.rota_kod) || 0) + 1);
    if (f.referans) refler.set(f.referans, (refler.get(f.referans) || 0) + 1);
  }
  const kod = say(kodlar), ref = say(refler);
  if (!kod) return { yok: false, tek: false, ad: 'Rota belirtilmemiş', ref: trBaslik(ref) };
  const p = kod.indexOf(' · ');
  const rotaAd = p > 0 ? kod.slice(p + 3) : kod, kodRef = p > 0 ? kod.slice(0, p) : '';
  const f0 = firmalar.find(f => f.rota_kod === kod);
  const ilc = f0?.rota_ilceler ? trBaslik(f0.rota_ilceler) : '';
  return { yok: false, tek: kodlar.size === 1, ad: `${ilc ? `${rotaAd} · ${ilc}` : rotaAd}${kodlar.size > 1 ? ` (+${kodlar.size - 1} rota)` : ''}`, ref: trBaslik(ref || kodRef) };
}
export function aracOzet(a, harita) {
  const firmalar = harita.get(a.id) || [];
  const d = duraklar(firmalar);
  const bekleyen = d.filter(durakBekliyor);
  const kap = Math.max(1, Number(a.kapasite) || 4);
  return {
    firmalar, duraklar: d, kisi: d.length, bekleyen, teslim: d.filter(durakTamam), kap,
    occ: d.filter(x => !durakTamam(x) && x.firmalar.some(f => f.durum === 'yolda')).length,                    // şu an araçta
    tasinan: d.filter(x => x.firmalar.some(f => ALINDI.includes(f.durum) && !f.kendi_geldi)).length,          // araçla gelen (araçta + teslim)
    siradaki: bekleyen[0] || null, rota: rotaBilgi(firmalar),
  };
}
const SIRA_DURUM = { yolda: 0, hazir: 1, fuarda: 2, mola: 3, arizali: 4 };
const aracListesi = () => [...store.araclar.values()].sort((a, b) => (SIRA_DURUM[a.durum] ?? 9) - (SIRA_DURUM[b.durum] ?? 9) || fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr', { numeric: true }));
export function konumBilgi(a) {
  if (!a.son_konum_zamani || a.son_lat == null) return { metin: 'konum yok', eski: false, yok: true };
  const dk = (Date.now() - new Date(a.son_konum_zamani).getTime()) / 60000;
  return { metin: fmt.goreli(a.son_konum_zamani), eski: dk > 10, yok: false, dk };
}
function siradakiMetin(o) {
  const s = o.siradaki; if (!s) return '—';
  return `${fmt.saatKisa(s.f.tasima_saati) || 'Saat ?'} · ${kisaAd(s.f)}${s.f.ilce ? ' · ' + trBaslik(s.f.ilce) : ''}`;
}
const dolulukOran = o => Math.min(100, Math.round((o.occ / o.kap) * 100));

// servisle alınacak, henüz araç atanmamış ve alınmamış yolcular: rota koduna göre gruplu
// (mesafeKm, yolcuHaritasi, aracOzet, konumBilgi, aracsizlar araç yöneticisi ekranında da kullanılır: ekranlar/dispec.js)
export function aracsizlar() {
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

// sorumlu adayları: masa / Admin / araç sorumlusu. Yönetim kurulu üyeleri referanstır (kişiyi tanır, karşılar), araç sorumluluğu YÜKLENMEZ; bot, şoför ve rapor kullanıcıları da hariç
const botMu = p => p.rol === 'bot' || /\bbotu?\b/i.test(p.ad_soyad || '');
const sorumluAdaylari = () => ekip().filter(p => ['sorumlu', 'masa', 'yonetici'].includes(p.rol) && !botMu(p));
const sorumluOf = a => (a.sorumlu_id ? store.profiller.get(a.sorumlu_id) : null);
const aracYuku = uid => [...store.araclar.values()].filter(a => a.sorumlu_id === uid).length;

// ---------------------------------------------------------------- kaynak çipi (tasarımın SRC_STYLE kuralları)
function kaynakOge(o) {
  const t = saatYaz(o.zaman);
  const kim = o.kim_ad && o.kim_ad !== 'sistem' ? o.kim_ad : '';
  if (o.kaynak === 'asistan') {
    const bot = /atlas|bot/i.test(kim);
    return { tur: 'atlas', etiket: `ATLAS · ${kim && !bot ? iyelik(shortBy(kim)) + ' mesajından' : 'mesajından'} · ${t}`, ipucu: o.kaynak_metin ? `“${o.kaynak_metin}”` : 'ATLAS asistanı işledi.' };
  }
  if (o.kaynak === 'konum') return { tur: 'konum', etiket: `Konum · şoför telefonu · ${t}`, ipucu: 'Şoför telefonunun konum paylaşımından otomatik kaydedildi.' };
  if (o.kaynak === 'excel') return { tur: 'excel', etiket: `Excel aktarımı · ${new Date(o.zaman).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`, ipucu: 'Excel listesinden aktarıldı.' };
  if (!kim) return { tur: 'el', etiket: `Sistem · ${t}`, ipucu: 'Sistem kaydı.' };
  const sofor = [...store.profiller.values()].some(p => p.ad_soyad === kim && p.rol === 'sofor');
  if (sofor) return { tur: 'surucu', etiket: `Sürücü uygulaması · ${shortBy(kim)} · ${t}`, ipucu: 'Sürücü telefon ekranındaki düğmeyle işaretlendi.' };
  return { tur: 'el', etiket: `El ile · ${shortBy(kim)} · ${t}`, ipucu: 'Masada elle işaretlendi.' };
}
const kaynakCipHtml = (tur, etiket, ipucu) => `<span class="araclar-kc araclar-kc-${tur}" title="${esc(ipucu || '')}">${esc(etiket)}</span>`;

// ---------------------------------------------------------------- küçük görünüm parçaları
function plakaKutu(p, boyut = 'kart', ham = false) {
  const metin = ham ? String(p || '') : fmt.plaka(p);
  return `<span class="araclar-pl araclar-pl-${boyut}"><i>${boyut === 'tablo' || boyut === 'mini' ? '' : 'TR'}</i><b>${esc(metin)}</b></span>`;
}
const durumRozet = d => `<span class="araclar-rz araclar-rz-${esc(d)}">${esc(d === 'arizali' ? '✕ Arızalı' : (ARAC_DURUM_AD[d] || d))}</span>`;
const GUN_AD = { bekliyor: 'Bekliyor', arandi: 'Arandı', yolda: 'Yolda', fuarda: 'Fuarda', oy_kullandi: '✓ OY KULLANDI' };
function gunRozet(f) {
  if (gecikme(f)) return `<span class="araclar-gr araclar-gr-gecikti">◷ GECİKTİ</span>`;
  return `<span class="araclar-gr araclar-gr-${esc(f.durum)}">${esc(GUN_AD[f.durum] || f.durum)}</span>`;
}
const avatar = ad => esc(bas(trBaslik(ad || '')) || '?');

// ---------------------------------------------------------------- CSS (ekrana özel, bir kez)
function stilEkle() {
  let s = document.querySelector('style[data-ekran="araclar"]');
  if (!s) { s = document.createElement('style'); s.dataset.ekran = 'araclar'; document.head.appendChild(s); }
  s.textContent = `
.araclar-sayfa { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; height: calc(100vh - var(--ust-h) - 40px); height: calc(100dvh - var(--ust-h) - 40px); min-height: 540px; color: var(--ink); }
.araclar-sayfa, .araclar-c { line-height: normal; }
.araclar-sol { min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.araclar-ust { flex: none; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.araclar-ust h1 { margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -.02em; }
.araclar-sayilar { display: flex; gap: 8px; flex-wrap: wrap; }
.araclar-sayi { display: flex; align-items: baseline; gap: 6px; padding: 6px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); color: inherit; font: inherit; cursor: pointer; text-align: left; transition: border-color .12s, background .12s; }
.araclar-sayi:hover { border-color: var(--line-2); }
.araclar-sayi.aktif { border-color: var(--red); background: var(--red-soft); }
.araclar-sayi b { font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
.araclar-sayi span { font-size: 12px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.araclar-aracsiz { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--amber); background: var(--amber-soft); color: var(--amber-ink); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.araclar-aracsiz:hover { filter: brightness(.97); }
.araclar-arac-bar { flex: none; display: flex; align-items: center; gap: 10px; margin-top: -4px; }
.araclar-ara { margin-left: auto; width: 260px; max-width: 100%; height: 32px; padding: 0 10px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12.5px; outline: none; transition: border-color .12s; }
.araclar-ara:focus { border-color: var(--red); }
.araclar-seg { margin-left: auto; display: grid; grid-template-columns: auto auto auto; padding: 3px; border-radius: 10px; background: var(--surface-3); }
.araclar-seg button { height: 32px; padding: 0 14px; border-radius: 8px; border: 0; cursor: pointer; font-size: 13px; font-weight: 700; font-family: inherit; background: transparent; color: var(--ink-2); box-shadow: none; }
.araclar-seg button.aktif { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
.araclar-liste { flex: 1; min-height: 0; overflow: auto; }
.araclar-bos { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 48px 16px; text-align: center; color: var(--ink-3); }
.araclar-bos b { display: block; color: var(--ink); font-size: 16px; margin-bottom: 4px; }

/* plaka kutuları (her iki temada beyaz) */
.araclar-pl { display: inline-flex; align-items: stretch; border: 1.5px solid #111; background: #fff; overflow: hidden; flex: none; box-sizing: content-box; }
.araclar-pl i { font-style: normal; background: #1F4FA8; color: #fff; display: flex; align-items: flex-end; justify-content: center; font-weight: 800; }
.araclar-pl b { display: flex; align-items: center; font-weight: 800; color: #111; white-space: nowrap; font-variant-numeric: tabular-nums; }
.araclar-pl-kart { height: 34px; border-radius: 5px; } .araclar-pl-kart i { width: 14px; font-size: 7px; padding-bottom: 3px; } .araclar-pl-kart b { padding: 0 10px; font-size: 19px; letter-spacing: .06em; }
.araclar-pl-tablo { height: 24px; border-radius: 4px; } .araclar-pl-tablo i { width: 9px; } .araclar-pl-tablo b { padding: 0 7px; font-size: 13px; letter-spacing: .05em; }
.araclar-pl-cekmece { height: 46px; border-width: 2px; border-radius: 6px; } .araclar-pl-cekmece i { width: 18px; font-size: 8px; padding-bottom: 4px; } .araclar-pl-cekmece b { padding: 0 14px; font-size: 27px; letter-spacing: .06em; }
.araclar-pl-onizleme { height: 30px; border-radius: 5px; } .araclar-pl-onizleme i { width: 12px; font-size: 6px; padding-bottom: 2px; } .araclar-pl-onizleme b { padding: 0 9px; font-size: 16px; letter-spacing: .06em; min-width: 90px; }
.araclar-pl-mini { height: 20px; border-width: 1.2px; border-radius: 3px; } .araclar-pl-mini i { width: 6px; } .araclar-pl-mini b { padding: 0 5px; font-size: 11px; }

/* araç durumu rozeti */
.araclar-rz { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; font-variant-numeric: tabular-nums; border: 1.5px solid transparent; }
.araclar-rz-hazir { background: var(--green-soft); color: var(--green); border-color: var(--green-soft); }
.araclar-rz-yolda { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber-soft); }
.araclar-rz-fuarda { background: var(--violet-soft); color: var(--violet); border-color: var(--violet-soft); }
.araclar-rz-mola { background: var(--gray-soft); color: var(--ink-2); border-color: var(--gray-soft); }
.araclar-rz-arizali { background: var(--amber); color: #1a1200; border-color: var(--amber); }
/* yolcunun gün durumu rozeti */
.araclar-gr { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; flex: none; }
.araclar-gr-bekliyor { background: var(--gray-soft); color: var(--ink-2); }
.araclar-gr-arandi { background: var(--blue-soft); color: var(--blue); }
.araclar-gr-yolda { background: var(--amber-soft); color: var(--amber-ink); }
.araclar-gr-fuarda { background: var(--violet-soft); color: var(--violet); }
.araclar-gr-oy_kullandi { background: var(--green); color: #fff; }
.araclar-gr-gecikti { background: var(--amber-soft); color: var(--amber-ink); border: 1px solid var(--amber); animation: smPulse 1.6s infinite; }

/* kartlar */
.araclar-kartlar { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.araclar-kart { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 9px; box-shadow: var(--shadow); cursor: pointer; min-width: 0; transition: border-color .12s; }
.araclar-kart:hover { border-color: var(--line-2); }
.araclar-kart:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
.araclar-kart.arizali { border: 1.5px solid var(--amber); padding: 13.5px; }
.araclar-kart.eski { opacity: .82; }
.araclar-kart.yeni { animation: araclar-parla 2.4s ease-out; }
@keyframes araclar-parla { 0% { box-shadow: 0 0 0 5px var(--red-line); } 100% { box-shadow: var(--shadow); } }
.araclar-k1 { display: flex; align-items: center; gap: 8px; }
.araclar-k1 .sag { margin-left: auto; }
.araclar-k2 { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-k3 { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.araclar-av { flex: none; width: 30px; height: 30px; border-radius: 99px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: var(--ink-2); }
.araclar-k3 .ad { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.araclar-k3 .ad b { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-k3 .ad span { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.araclar-ara-dugme { flex: none; width: 34px; height: 34px; border-radius: 9px; background: var(--ink); color: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 14px; }
.araclar-ara-dugme.pasif, .araclar-wa-dugme.pasif { opacity: .35; pointer-events: none; }
.araclar-wa-dugme { box-sizing: content-box; flex: none; height: 34px; padding: 0 9px; border-radius: 9px; border: 1px solid var(--line-2); color: var(--ink); display: flex; align-items: center; font-size: 11.5px; font-weight: 700; }
.araclar-k4 { font-size: 12.5px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-k4 span { color: var(--ink-3); }
.araclar-k5 { display: flex; align-items: center; gap: 8px; }
.araclar-bar { flex: 1; height: 6px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
.araclar-bar i { display: block; height: 100%; border-radius: 99px; background: var(--ink); }
.araclar-bar i.dolu { background: var(--amber); }
.araclar-k5 .say { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.araclar-k6 { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.araclar-k6 .sira { min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-2); }
.araclar-k6 .sira b { color: var(--ink); font-variant-numeric: tabular-nums; }
.araclar-ping { font-size: 12px; font-weight: 600; color: var(--ink-3); white-space: nowrap; }
.araclar-ping.eski { color: var(--amber-ink); }

/* tablo */
.araclar-tablo { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: auto; }
.araclar-tablo > div { min-width: 920px; }
.araclar-tsatir { display: grid; grid-template-columns: 150px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr) 96px 90px minmax(0, 1fr) 92px; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); cursor: pointer; }
.araclar-tsatir:not(.baslik):hover { background: var(--hover); }
.araclar-tsatir:last-child { border-bottom: 0; }
.araclar-tsatir.baslik { padding: 9px 16px; background: var(--surface-2); font-size: 11px; font-weight: 700; letter-spacing: .07em; color: var(--ink-3); white-space: nowrap; cursor: default; }
.araclar-tsatir .kes { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-tsatir .kes span { color: var(--ink-3); }
.araclar-tsatir .sofor { display: flex; flex-direction: column; min-width: 0; }
.araclar-tsatir .sofor b { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-tsatir .sofor a { font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.araclar-tsatir .rota { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-tsatir .doluluk { font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.araclar-tsatir .siradaki { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* görev dağılımı */
.araclar-gorev { height: 100%; min-height: 460px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; box-sizing: border-box; }
.araclar-g-ust { flex: none; display: flex; align-items: center; gap: 10px; }
.araclar-g-ust .a { font-size: 12.5px; color: var(--ink-2); }
.araclar-g-ust .b { margin-left: auto; font-size: 12px; color: var(--ink-3); white-space: nowrap; }
.araclar-g-kolonlar { flex: 1; min-height: 0; display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
.araclar-g-kol { flex: none; width: 214px; display: flex; flex-direction: column; border-radius: 11px; background: var(--surface-2); border: 1px solid var(--line); box-sizing: content-box; }
.araclar-g-kol.yok { background: var(--surface); border: 1.5px dashed var(--line-2); }
.araclar-g-kol.uzerinde { background: var(--red-soft); border: 1.5px dashed var(--red); }
.araclar-g-bas { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 10px 8px; }
.araclar-g-av { width: 30px; height: 30px; flex: none; border-radius: 99px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; background: var(--ink); color: var(--surface); box-sizing: border-box; }
.araclar-g-kol.yok .araclar-g-av { background: transparent; color: var(--ink-3); border: 1.5px dashed var(--line-2); }
.araclar-g-bas .ad { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
.araclar-g-bas .ad b { font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-g-bas .ad span { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.araclar-g-bas .n { font-size: 18px; font-weight: 900; font-variant-numeric: tabular-nums; }
.araclar-g-ilerleme { flex: none; display: flex; align-items: center; gap: 6px; padding: 0 10px 8px; }
.araclar-g-ilerleme .cubuk { flex: 1; height: 5px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
.araclar-g-ilerleme .cubuk i { display: block; height: 100%; background: var(--green); border-radius: 99px; }
.araclar-g-ilerleme .yazi { font-size: 11px; font-weight: 700; color: var(--ink-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.araclar-g-kartlar { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; padding: 0 8px 8px; }
.araclar-g-kart { display: flex; flex-direction: column; gap: 3px; padding: 8px 9px; border-radius: 8px; background: var(--surface); border: 1px solid var(--line); cursor: grab; box-shadow: var(--shadow); }
.araclar-g-kart.bitti { opacity: .6; }
.araclar-g-kart.suruklenen { opacity: .4; }
.araclar-g-kart .u { display: flex; align-items: center; gap: 6px; }
.araclar-g-kart .u .sag { margin-left: auto; flex: none; display: flex; }
.araclar-g-kart .alt { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-g-daha { font-size: 11.5px; color: var(--ink-3); text-align: center; padding: 4px; }
.araclar-g-bos { font-size: 12px; color: var(--ink-3); text-align: center; padding: 12px 6px; }

/* sağ panel: hızlı araç ekle */
.araclar-panel { min-height: 0; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.araclar-etk { font-size: 11px; font-weight: 800; letter-spacing: .1em; white-space: nowrap; }
.araclar-etk.kirmizi { color: var(--red); }
.araclar-p-alt { font-size: 12.5px; color: var(--ink-2); }
.araclar-form { display: flex; flex-direction: column; gap: 12px; }
.araclar-alan { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.araclar-alan > label, .araclar-alan > .l { font-size: 12px; font-weight: 700; color: var(--ink-2); }
.araclar-alan input, .araclar-alan select, .araclar-alan textarea { box-sizing: border-box; width: 100%; border: 1.5px solid var(--line-2); background: var(--surface-2); color: var(--ink); outline: none; font-family: inherit; transition: border-color .12s; }
.araclar-alan input, .araclar-alan select { height: 40px; padding: 0 10px; border-radius: 9px; font-size: 14px; }
.araclar-alan select { padding: 0 8px; font-weight: 600; }
.araclar-alan textarea { padding: 9px 10px; border-radius: 9px; font-size: 13.5px; resize: none; }
.araclar-alan input:focus, .araclar-alan select:focus, .araclar-alan textarea:focus { border-color: var(--red); }
.araclar-alan input.plaka-girdi { height: 44px; padding: 0 12px; border-radius: 10px; font-size: 16px; font-weight: 800; letter-spacing: .06em; }
.araclar-alan input.tel { font-variant-numeric: tabular-nums; }
.araclar-iki { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.araclar-onizleme { display: flex; align-items: center; gap: 8px; }
.araclar-ipucu { font-size: 12px; font-weight: 700; color: var(--amber-ink); }
.araclar-ipucu.iyi { color: var(--green); }
.araclar-ipucu:empty { display: none; }
.araclar-form-hata { color: var(--amber-ink); font-weight: 700; font-size: 13px; }
.araclar-form-hata:empty { display: none; }
.araclar-ekle { height: 48px; border-radius: 11px; border: 0; font-size: 15px; font-weight: 800; font-family: inherit; background: var(--line-2); color: var(--ink-3); cursor: default; }
.araclar-ekle.hazir { background: var(--red); color: #fff; cursor: pointer; }
.araclar-ekle.hazir:hover { background: var(--red-d); }

/* çekmece: araç kartı */
.cekmece[data-arac-cekmece] { width: min(640px, 100vw); border-left: 1px solid var(--line); box-shadow: var(--shadow-lg); animation: smIn .18s ease-out; }
.araclar-c { flex: 1; min-height: 0; display: flex; flex-direction: column; color: var(--ink); background: var(--surface); }
.araclar-c-ust { flex: none; padding: 18px 22px 14px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
.araclar-c-ust .s1 { display: flex; align-items: center; gap: 12px; }
.araclar-c-ust .s1 .et { font-size: 11px; font-weight: 700; letter-spacing: .1em; color: var(--ink-3); white-space: nowrap; }
.araclar-c-kapat { box-sizing: content-box; margin-left: auto; width: 36px; height: 36px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 18px; cursor: pointer; }
.araclar-c-kapat:hover { background: var(--hover); }
.araclar-c-ust .s2 { display: flex; align-items: center; gap: 12px; position: relative; }
.araclar-c-durum { position: relative; }
.araclar-c-durum > button { border: 0; padding: 0; background: none; cursor: pointer; }
.araclar-menu { position: absolute; top: 34px; left: 0; z-index: 10; width: 200px; background: var(--surface); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: var(--shadow-lg); padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.araclar-menu.sag { top: 40px; left: auto; right: 0; width: 260px; }
.araclar-menu button { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 0; border-radius: 7px; background: transparent; cursor: pointer; text-align: left; font-family: inherit; color: var(--ink); font-size: 13px; }
.araclar-menu button:hover { background: var(--hover); }
.araclar-menu .oto { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; border: 1px dashed var(--line-2); color: var(--ink-2); font-size: 11px; font-weight: 700; letter-spacing: .03em; }
.araclar-menu .ipucu { margin-left: auto; font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.araclar-menu .mav { width: 24px; height: 24px; flex: none; border-radius: 99px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; }
.araclar-menu .mad { flex: 1; font-size: 13px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.araclar-menu .bos { padding: 10px 8px; font-size: 12px; color: var(--ink-3); }
.araclar-c-ust .s3 { font-size: 13.5px; color: var(--ink-2); }
.araclar-c-ust .s3 b { color: var(--ink); }
.araclar-c-govde { flex: 1; min-height: 0; overflow: auto; padding: 16px 22px 24px; display: flex; flex-direction: column; gap: 16px; }
.araclar-c-govde > * { flex: none; }
.araclar-c-sofor { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); }
.araclar-c-sofor .g { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.araclar-c-etk { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; color: var(--ink-3); white-space: nowrap; }
.araclar-c-etk .bagli { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 5px; background: var(--green-soft); color: var(--green); letter-spacing: .04em; font-size: 9.5px; vertical-align: 1px; }
.araclar-c-sofor .ad { font-size: 17px; font-weight: 800; }
.araclar-c-sofor .ad.yok { font-size: 15px; color: var(--ink-3); font-weight: 600; }
.araclar-c-sofor .tel { font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.araclar-c-ara { flex: none; height: 44px; padding: 0 14px; border-radius: 10px; background: var(--ink); color: var(--surface); display: flex; align-items: center; font-size: 14px; font-weight: 800; white-space: nowrap; }
.araclar-c-wa { box-sizing: content-box; flex: none; white-space: nowrap; height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-2); color: var(--ink); display: flex; align-items: center; font-size: 13.5px; font-weight: 700; }
.araclar-c-ara.pasif, .araclar-c-wa.pasif { opacity: .35; pointer-events: none; }
.araclar-c-sorumlu { position: relative; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); }
.araclar-c-sorumlu .etk { flex: none; font-size: 10.5px; font-weight: 800; letter-spacing: .1em; color: var(--ink-3); white-space: nowrap; }
.araclar-c-sorumlu .av { flex: none; width: 30px; height: 30px; border-radius: 99px; background: var(--ink); color: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }
.araclar-c-sorumlu .kisi { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.araclar-c-sorumlu .kisi b { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-c-sorumlu .kisi span { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-c-sorumlu .yok { flex: 1; font-size: 13.5px; color: var(--amber-ink); font-weight: 600; }
.araclar-c-kucuk { box-sizing: content-box; flex: none; white-space: nowrap; height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; }
.araclar-c-kucuk:hover { background: var(--hover); }
.araclar-c-metrik { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.araclar-c-metrik > div { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 3px; }
.araclar-c-metrik .e { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; color: var(--ink-3); white-space: nowrap; }
.araclar-c-metrik .d { font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.1; white-space: nowrap; font-size: 22px; }
.araclar-c-metrik .d.k { font-size: 14px; }
.araclar-c-eylem { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.araclar-c-wa-dugme { height: 46px; border-radius: 10px; border: 0; background: var(--red); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; font-family: inherit; }
.araclar-c-wa-dugme:hover { background: var(--red-d); }
.araclar-c-wa-dugme:disabled { opacity: .45; cursor: not-allowed; }
.araclar-c-harita { box-sizing: content-box; height: 46px; border-radius: 10px; border: 1px solid var(--line-2); color: var(--ink); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
.araclar-c-harita:hover { background: var(--hover); }
.araclar-c-onizleme { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: var(--surface-3); }
.araclar-c-balon { align-self: flex-start; max-width: 100%; box-sizing: border-box; background: var(--surface); border-radius: 4px 12px 12px 12px; padding: 10px 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; outline: none; }
.araclar-c-balon:focus { box-shadow: 0 0 0 2px var(--red-line); }
.araclar-c-onizleme .alt { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
.araclar-c-gonder { height: 38px; padding: 0 14px; border-radius: 9px; background: var(--ink); color: var(--surface); display: flex; align-items: center; font-size: 13px; font-weight: 800; }
.araclar-c-kopya { height: 38px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.araclar-c-bolum { display: flex; flex-direction: column; gap: 8px; }
.araclar-c-bolum-ust { display: flex; align-items: center; }
.araclar-c-bolum-ust .b { font-size: 11px; font-weight: 800; letter-spacing: .1em; white-space: nowrap; }
.araclar-c-bolum-ust .i { margin-left: auto; font-size: 12px; color: var(--ink-3); white-space: nowrap; }
.araclar-c-duraklar { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 11px; overflow: hidden; }
.araclar-durak { position: relative; display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid var(--line); background: var(--surface); }
.araclar-durak.bitti { opacity: .6; }
.araclar-durak.suruklenen { background: var(--hover); }
.araclar-durak.ustunde { box-shadow: inset 0 2px 0 var(--red); }
.araclar-durak .tut { flex: none; color: var(--ink-3); font-size: 14px; cursor: grab; letter-spacing: -2px; }
.araclar-durak .no { flex: none; width: 22px; height: 22px; border-radius: 99px; background: var(--red); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; }
.araclar-durak .saat { flex: none; width: 44px; font-size: 13.5px; font-weight: 800; font-variant-numeric: tabular-nums; }
.araclar-durak .ad { flex: 1; min-width: 0; border: 0; background: none; padding: 0; text-align: left; font-family: inherit; color: var(--ink); cursor: pointer; display: flex; flex-direction: column; }
.araclar-durak .ad .a { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-durak .ad .a em { font-style: normal; margin-left: 6px; font-size: 10px; font-weight: 800; letter-spacing: .04em; padding: 1px 5px; border-radius: 4px; border: 1.5px solid var(--ink); vertical-align: 1px; }
.araclar-durak .ad .a u { text-decoration: none; margin-left: 6px; font-size: 11px; font-weight: 800; color: var(--yellow-ink); }
.araclar-durak .ad .b { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-durak .ad .n { font-size: 11.5px; color: var(--red); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-durak .eylem { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: none; gap: 4px; padding: 3px; border-radius: 9px; background: var(--hover); border: 1px solid var(--line-2); }
.araclar-durak:hover .eylem, .araclar-durak:focus-within .eylem { display: flex; }
.araclar-durak .eylem button { height: 26px; padding: 0 9px; border-radius: 7px; border: 0; background: var(--ink); color: var(--surface); font-size: 11.5px; font-weight: 800; cursor: pointer; font-family: inherit; white-space: nowrap; }
.araclar-durak .eylem button.yesil { background: var(--green); color: #fff; }
.araclar-durak .ad .k { font-size: 11.5px; color: var(--green); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-durak .eylem button.karsila { background: var(--red); color: var(--on-red, #fff); }
.araclar-durak .eylem button.cikar { background: var(--surface); color: var(--ink-2); border: 1px solid var(--line-2); }
.araclar-durak .eylem button.cikar:hover { color: var(--red); border-color: var(--red-line); }
.araclar-fuar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface-2); }
.araclar-fuar .b { flex: none; width: 22px; height: 22px; border-radius: 6px; background: var(--ink); color: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 12px; }
.araclar-fuar .a { font-size: 13px; font-weight: 800; white-space: nowrap; }
.araclar-fuar .c { font-size: 12px; color: var(--ink-3); }
.araclar-c-bos { font-size: 12.5px; color: var(--ink-3); padding: 4px 0; }
.araclar-c-iki { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.araclar-c-iki > div { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.araclar-sefer { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--line); font-size: 13px; }
.araclar-sefer span { color: var(--ink-3); font-variant-numeric: tabular-nums; }
.araclar-sefer em { margin-left: auto; font-style: normal; font-weight: 700; white-space: nowrap; }
.araclar-not-satir { display: flex; gap: 6px; }
.araclar-not-satir input { flex: 1; min-width: 0; height: 36px; box-sizing: border-box; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink); font-size: 13px; outline: none; font-family: inherit; }
.araclar-not-satir input:focus { border-color: var(--red); }
.araclar-not-satir button { height: 36px; padding: 0 12px; border-radius: 8px; border: 0; background: var(--ink); color: var(--surface); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.araclar-not { padding: 8px 10px; border-radius: 9px; background: var(--surface-2); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.araclar-not .t { font-size: 13px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.araclar-gecmis { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 8px; padding: 7px 0; border-top: 1px solid var(--line); }
.araclar-gecmis .z { font-size: 12px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.araclar-gecmis .g { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; font-size: 13px; }
.araclar-kc { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 5px; font-size: 10.5px; font-weight: 600; white-space: nowrap; cursor: default; box-sizing: border-box; line-height: 1; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.araclar-kc-atlas { background: var(--ink); color: var(--surface); border: 1px solid var(--ink); }
.araclar-kc-konum { background: transparent; color: var(--ink-2); border: 1px dashed var(--line-2); }
.araclar-kc-surucu { background: var(--surface); color: var(--ink-2); border: 1px solid var(--line-2); }
.araclar-kc-excel { background: var(--surface-3); color: var(--ink-2); border: 1px solid var(--surface-3); font-style: italic; }
.araclar-kc-el { background: var(--surface-3); color: var(--ink-2); border: 1px solid var(--surface-3); }

/* yolcu ekle */
.araclar-ara-girdi { box-sizing: border-box; width: 100%; height: 38px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink); font-size: 13px; outline: none; font-family: inherit; }
.araclar-ara-girdi:focus { border-color: var(--red); }
.araclar-sonuc { display: flex; flex-direction: column; gap: 6px; }
.araclar-sonuc-satir { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
.araclar-sonuc-satir.icinde { background: var(--surface-2); }
.araclar-sonuc-satir .ana { flex: 1; min-width: 0; }
.araclar-sonuc-satir .ana b { display: block; font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-sonuc-satir .ana span { display: block; font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.araclar-sonuc-satir .ana span.kisiler { white-space: normal; color: var(--ink-2); }
.araclar-sonuc-satir .sag { display: flex; gap: 6px; align-items: center; flex: none; }
.araclar-link { cursor: pointer; } .araclar-link:hover { text-decoration: underline; }
.araclar-mini-baslik { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); margin: 6px 0 0; }
.araclar-sonuc-daha { font-size: 12px; color: var(--ink-3); font-weight: 700; }
.araclar-mini-dugme { height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
.araclar-mini-dugme.koyu { background: var(--ink); color: var(--surface); border-color: var(--ink); }

/* Admin bölümleri */
.araclar-kutu { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.araclar-kutu.bagli { border-color: var(--green); background: var(--green-soft); }
.araclar-kutu .y { font-size: 13px; color: var(--ink-2); font-weight: 600; }
.araclar-kutu .y b { color: var(--ink); }
.araclar-kutu .ad { font-weight: 800; font-size: 15px; }
.araclar-kutu .satir { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.araclar-kutu input { flex: 1; min-width: 160px; height: 36px; box-sizing: border-box; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; outline: none; font-family: inherit; }
.araclar-kutu input:focus { border-color: var(--red); }
.araclar-detay { border: 1px solid var(--line); border-radius: 12px; }
.araclar-detay > summary { cursor: pointer; padding: 12px 14px; font-weight: 800; list-style: none; display: flex; align-items: center; gap: 8px; font-size: 13px; }
.araclar-detay > summary::-webkit-details-marker { display: none; }
.araclar-detay > summary::after { content: '▾'; margin-left: auto; color: var(--ink-3); transition: transform .15s; }
.araclar-detay[open] > summary::after { transform: rotate(180deg); }
.araclar-detay > div { padding: 0 14px 14px; }
.araclar-tehlike { padding-top: 14px; border-top: 1px dashed var(--line-2); display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--ink-3); }
.araclar-tehlike button { height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--red-line); background: var(--surface); color: var(--red); font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
.araclar-tehlike button:hover { background: var(--red-soft); }

/* modallar */
.araclar-pin-kutu { text-align: center; padding: 8px 0 14px; }
.araclar-pin-ad { font-weight: 800; font-size: 18px; margin: 2px 0 12px; }
.araclar-pin { font-size: 46px; font-weight: 900; letter-spacing: .28em; padding-left: .28em; font-variant-numeric: tabular-nums; color: var(--red); line-height: 1.1; }
.araclar-aracsiz-grup { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; }
.araclar-aracsiz-ust { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.araclar-aracsiz-ust .ana { flex: 1; min-width: 200px; }
.araclar-aracsiz-grup select { width: auto; max-width: 280px; height: 34px; }

@media (max-width: 1180px) {
  .araclar-kartlar { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .araclar-sayfa { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 0; }
  .araclar-liste { overflow: visible; }
  .araclar-gorev { height: 520px; }
  .araclar-panel { overflow: visible; }
}
@media (max-width: 760px) {
  .araclar-kartlar { grid-template-columns: minmax(0, 1fr); }
  .araclar-c-metrik { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .araclar-c-iki { grid-template-columns: minmax(0, 1fr); }
  .araclar-ara { width: 100%; }
}`;
}

// ---------------------------------------------------------------- sayfa iskeleti
function iskeletHtml() {
  const yaz = yazabilirMi();
  return `
  <div class="araclar-sayfa">
    <div class="araclar-sol">
      <div class="araclar-ust">
        <h1>Araçlar</h1>
        <div class="araclar-sayilar" data-sayilar></div>
        <div class="araclar-seg" role="tablist" aria-label="Görünüm">
          <button data-gorunum="kart" role="tab">Kartlar</button><button data-gorunum="tablo" role="tab">Tablo</button><button data-gorunum="gorev" role="tab">Görev dağılımı</button>
        </div>
      </div>
      <div class="araclar-arac-bar">
        <div data-aracsiz-yer style="display:contents"></div>
        <input class="araclar-ara" data-ara type="search" placeholder="Plaka, şoför ya da yolcu ara…" value="${esc(arama)}" autocomplete="off">
      </div>
      <div class="araclar-liste" data-liste></div>
    </div>
    ${yaz ? `<aside class="araclar-panel" data-yan>
      <div style="display:flex;flex-direction:column;gap:3px"><div class="araclar-etk kirmizi">HIZLI ARAÇ EKLE</div><div class="araclar-p-alt">Plaka biçimi kendiliğinden düzelir.</div></div>
      ${formHtml({}, 'yeni')}
    </aside>` : ''}
  </div>`;
}

function sayilar(harita) {
  const liste = [...store.araclar.values()];
  let tasinan = 0, bosta = 0;
  for (const a of liste) {
    const o = aracOzet(a, harita);
    tasinan += o.tasinan;
    if (a.durum === 'hazir' && !o.siradaki) bosta++;
  }
  return { toplam: liste.length, yolda: liste.filter(a => a.durum === 'yolda').length, fuarda: liste.filter(a => a.durum === 'fuarda').length, bosta, tasinan };
}
function sayilarHtml(s) {
  const p = (anahtar, deger, etiket, renk) => `<button class="araclar-sayi ${anahtar !== 'hepsi' && filtre === anahtar ? 'aktif' : ''}" data-filtre="${anahtar}" title="${anahtar === 'hepsi' ? 'Tüm araçlar' : 'Yalnız bunları göster'}"><b style="color:${renk}">${deger}</b><span>${etiket}</span></button>`;
  return p('hepsi', s.toplam, 'toplam araç', 'var(--ink)') + p('yolda', s.yolda, 'yolda', 'var(--amber-ink)') + p('fuarda', s.fuarda, 'fuarda', 'var(--violet)')
    + p('bosta', s.bosta, 'boşta', 'var(--ink)')
    + `<div class="araclar-sayi" style="cursor:default"><b style="color:var(--green)">${s.tasinan}</b><span>bugün taşınan</span></div>`;
}
function filtrelenmis(harita) {
  let liste = aracListesi();
  if (filtre === 'yolda' || filtre === 'fuarda') liste = liste.filter(a => a.durum === filtre);
  else if (filtre === 'bosta') liste = liste.filter(a => a.durum === 'hazir' && !aracOzet(a, harita).siradaki);
  const q = trArama(arama);
  if (q) {
    liste = liste.filter(a => {
      const yolcu = (harita.get(a.id) || []).map(f => `${f.yetkili || ''} ${f.unvan || ''}`).join(' ');
      const hay = trArama([a.plaka, plakaAnahtar(a.plaka), a.marka, a.model, a.renk, a.sofor_ad, a.sofor_tel, a.notlar, ARAC_DURUM_AD[a.durum], yolcu].join(' '));
      return q.split(' ').every(p => hay.includes(p));
    });
  }
  return liste;
}

// ---------------------------------------------------------------- kart ve tablo
function kartHtml(a, o) {
  const k = konumBilgi(a);
  const tel = a.sofor_tel;
  const alt = [aracAdi(a), a.renk ? trBaslik(a.renk) : '', `${o.kap} koltuk`].filter(Boolean);
  const sinif = ['araclar-kart', a.durum === 'arizali' ? 'arizali' : '', k.eski ? 'eski' : '', yeniId === a.id && Date.now() - yeniZaman < 2500 ? 'yeni' : ''].filter(Boolean).join(' ');
  return `
  <div class="${sinif}" data-arac="${a.id}" tabindex="0" role="button" aria-label="${esc(fmt.plaka(a.plaka))} aracını aç">
    <div class="araclar-k1">${plakaKutu(a.plaka, 'kart')}<div class="sag">${durumRozet(a.durum)}</div></div>
    <div class="araclar-k2">${esc(alt.join(' · '))}</div>
    <div class="araclar-k3">
      <div class="araclar-av">${avatar(a.sofor_ad)}</div>
      <div class="ad"><b>${a.sofor_ad ? esc(trBaslik(a.sofor_ad)) : '<span style="color:var(--ink-3);font-weight:600">Şoför girilmedi</span>'}</b><span>${tel ? esc(fmt.tel(tel)) : 'Telefon yok'}</span></div>
      <a class="araclar-ara-dugme ${fmt.telLink(tel) ? '' : 'pasif'}" href="${esc(fmt.telLink(tel) || '#')}" title="Ara">📞</a>
      <a class="araclar-wa-dugme ${fmt.waLink(tel) ? '' : 'pasif'}" href="${esc(fmt.waLink(tel) || '#')}" target="_blank" rel="noopener">WhatsApp</a>
    </div>
    <div class="araclar-k4"><b>${esc(o.rota.ad)}</b>${o.rota.ref ? ` <span>· Ref: ${esc(o.rota.ref)}</span>` : ''}</div>
    <div class="araclar-k5"><div class="araclar-bar"><i class="${o.occ >= o.kap ? 'dolu' : ''}" style="width:${dolulukOran(o)}%"></i></div><div class="say">${o.occ}/${o.kap} yolcu</div></div>
    <div class="araclar-k6"><div class="sira">Sıradaki: <b>${esc(siradakiMetin(o))}</b></div><div class="araclar-ping ${k.eski ? 'eski' : ''}">◎ ${esc(k.metin)}</div></div>
  </div>`;
}
function tabloHtml(liste, harita) {
  return `<div class="araclar-tablo"><div>
    <div class="araclar-tsatir baslik"><div>PLAKA</div><div>ARAÇ</div><div>ŞOFÖR</div><div>ROTA</div><div>DURUM</div><div>DOLULUK</div><div>SIRADAKİ</div><div>KONUM</div></div>
    ${liste.map(a => {
      const o = aracOzet(a, harita); const k = konumBilgi(a);
      return `<div class="araclar-tsatir" data-arac="${a.id}" tabindex="0">
        <div>${plakaKutu(a.plaka, 'tablo')}</div>
        <div class="kes">${esc(aracAdi(a) || 'Araç')} <span>· ${o.kap}</span></div>
        <div class="sofor"><b>${a.sofor_ad ? esc(trBaslik(a.sofor_ad)) : '—'}</b>${a.sofor_tel ? `<a href="${esc(fmt.telLink(a.sofor_tel) || '#')}">${esc(fmt.tel(a.sofor_tel))}</a>` : ''}</div>
        <div class="rota">${esc(o.rota.ad)}</div>
        <div>${durumRozet(a.durum)}</div>
        <div class="doluluk">${o.occ}/${o.kap} yolcu</div>
        <div class="siradaki">${esc(siradakiMetin(o))}</div>
        <div class="araclar-ping ${k.eski ? 'eski' : ''}">${esc(k.metin)}</div>
      </div>`;
    }).join('')}
  </div></div>`;
}

// ---------------------------------------------------------------- görev dağılımı (SM Gorev · kind=v)
function gorevHtml(liste, harita) {
  // tasarım: araç sorumlusu rolündekiler + araç yükü olanlar. Hiç araç sorumlusu kullanıcısı yoksa atanabilir herkes sütun olur (yoksa bırakılacak yer kalmaz)
  const sorumluRoluVar = ekip().some(p => p.rol === 'sorumlu' && !botMu(p));
  const uyeler = ekip().filter(p => !botMu(p) && (p.rol === 'sorumlu' || liste.some(a => a.sorumlu_id === p.id) || (!sorumluRoluVar && sorumluAdaylari().some(x => x.id === p.id))));
  const kolonlar = [...uyeler.map(p => ({ id: p.id, ad: trBaslik(p.ad_soyad), rol: ROL_AD[p.rol] || p.rol })), { id: null, ad: 'Atanmamış', rol: 'sorumlusu yok' }];
  const LIM = 14;
  const kolonHtml = kol => {
    const benim = liste.filter(a => (a.sorumlu_id || null) === kol.id).map(a => ({ a, o: aracOzet(a, harita) }));
    const bitti = x => x.a.durum === 'fuarda' || !x.o.siradaki;
    const acik = benim.filter(x => !bitti(x)), kapali = benim.filter(bitti);
    const yuzde = benim.length ? (kapali.length / benim.length) * 100 : 0;
    const gosterilen = [...acik, ...kapali];
    const kartlar = gosterilen.slice(0, LIM).map(x => `
      <div class="araclar-g-kart ${bitti(x) ? 'bitti' : ''}" draggable="true" data-g-arac="${x.a.id}">
        <div class="u">${plakaKutu(x.a.plaka, 'mini')}<span class="sag">${durumRozet(x.a.durum)}</span></div>
        <div class="alt">${esc([x.a.sofor_ad ? trBaslik(x.a.sofor_ad) : 'şoför yok', `${x.o.occ}/${x.o.kap} yolcu`, `${x.o.kisi} durak`].join(' · '))}</div>
      </div>`).join('');
    return `<div class="araclar-g-kol ${kol.id ? '' : 'yok'}" data-g-kol="${kol.id || ''}">
      <div class="araclar-g-bas"><div class="araclar-g-av">${kol.id ? avatar(kol.ad) : '?'}</div><div class="ad"><b>${esc(kol.ad)}</b><span>${esc(kol.rol)}</span></div><div class="n">${benim.length}</div></div>
      <div class="araclar-g-ilerleme"><div class="cubuk"><i style="width:${yuzde}%"></i></div><div class="yazi">${kapali.length} tamam · ${acik.length} bekleyen</div></div>
      <div class="araclar-g-kartlar">${kartlar || '<div class="araclar-g-bos">Araç yok</div>'}${gosterilen.length > LIM ? `<div class="araclar-g-daha">+${gosterilen.length - LIM} daha</div>` : ''}</div>
    </div>`;
  };
  const sorumluYok = !sorumluAdaylari().some(p => p.rol === 'sorumlu');
  return `<div class="araclar-gorev">
    <div class="araclar-g-ust"><div class="a">${liste.length} araç · sorumlulara göre${sorumluYok ? ' · araç sorumlusu kullanıcısı henüz yok (Araç Kartı’ndan oluştur)' : ''}</div><div class="b">Kartı sürükleyip başka sütuna bırak</div></div>
    <div class="araclar-g-kolonlar" data-g-kolonlar>${kolonlar.map(kolonHtml).join('')}</div>
  </div>`;
}

function ciz() {
  if (!kok || !kok.isConnected) return;
  yenileBekliyor = false;
  const harita = yolcuHaritasi();
  kok.querySelector('[data-sayilar]').innerHTML = sayilarHtml(sayilar(harita));
  const bek = aracsizlar().toplam;
  kok.querySelector('[data-aracsiz-yer]').innerHTML = bek ? `<button class="araclar-aracsiz" data-aracsiz title="Servisle alınacak ama aracı olmayan yolcuları araçlara ata">⚠ ${bek} yolcu araçsız</button>` : '';
  kok.querySelectorAll('[data-gorunum]').forEach(b => { const a = b.dataset.gorunum === gorunum; b.classList.toggle('aktif', a); b.setAttribute('aria-selected', a); });
  const hedef = kok.querySelector('[data-liste]');
  const kaydir = hedef.scrollTop, yatay = hedef.querySelector('[data-g-kolonlar]')?.scrollLeft || 0;
  const liste = filtrelenmis(harita);
  if (!store.araclar.size) {
    hedef.innerHTML = `<div class="araclar-bos"><b>Henüz araç yok</b>${yazabilirMi() ? 'Sağdaki formdan ilk aracı ekle: plaka ve şoför yeter.' : 'Araçları Admin, yönetim kurulu ya da masa ekler.'}</div>`;
  } else if (!liste.length) {
    hedef.innerHTML = `<div class="araclar-bos"><b>Eşleşen araç yok</b>Filtreyi ya da aramayı değiştir.</div>`;
  } else if (gorunum === 'tablo') {
    hedef.innerHTML = tabloHtml(liste, harita);
  } else if (gorunum === 'gorev') {
    hedef.innerHTML = gorevHtml(liste, harita);
  } else {
    hedef.innerHTML = `<div class="araclar-kartlar">${liste.map(a => kartHtml(a, aracOzet(a, harita))).join('')}</div>`;
  }
  hedef.scrollTop = kaydir;
  const g = hedef.querySelector('[data-g-kolonlar]'); if (g) g.scrollLeft = yatay;
}

// ---------------------------------------------------------------- araç formu (hızlı ekle ve bilgi düzenleme)
function formHtml(a = {}, tur = 'yeni') {
  const v = k => esc(a[k] ?? '');
  const kap = Number(a.kapasite) || 4;
  const secenek = [...new Set([...KAPASITELER, kap])].sort((x, y) => x - y);
  return `<form class="araclar-form" data-arac-form="${tur}" novalidate autocomplete="off">
    <div class="araclar-alan"><label>Plaka</label>
      <input class="plaka-girdi" data-f="plaka" value="${esc(a.plaka ? fmt.plaka(a.plaka) : '')}" placeholder="35abc123" autocapitalize="characters" spellcheck="false">
      <div class="araclar-onizleme"><span data-plaka-onizleme>${plakaKutu(a.plaka ? fmt.plaka(a.plaka) : '35 ··· ···', 'onizleme', true)}</span><span class="araclar-ipucu" data-ipucu="plaka"></span></div></div>
    <div class="araclar-iki">
      <div class="araclar-alan"><label>Marka</label><input data-f="marka" value="${v('marka')}" placeholder="Fiat"></div>
      <div class="araclar-alan"><label>Model</label><input data-f="model" value="${v('model')}" placeholder="Doblo"></div>
      <div class="araclar-alan"><label>Renk</label><input data-f="renk" value="${v('renk')}" placeholder="Beyaz"></div>
      <div class="araclar-alan"><label>Yolcu kapasitesi</label><select data-f="kapasite">${secenek.map(n => `<option value="${n}" ${n === kap ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <div class="araclar-alan"><label>Şoför ad soyad</label><input data-f="sofor_ad" value="${v('sofor_ad')}" placeholder="ör. Kaan Bulut" autocapitalize="words"></div>
    <div class="araclar-alan"><label>Şoför telefonu</label><input class="tel" data-f="sofor_tel" value="${esc(a.sofor_tel ? fmt.tel(a.sofor_tel) : '')}" placeholder="05xx xxx xx xx" inputmode="tel"><div class="araclar-ipucu" data-ipucu="sofor_tel"></div></div>
    <div class="araclar-alan"><label>Not</label><textarea data-f="notlar" rows="2" placeholder="ör. Bagajı dolu, 3 yolcu alır">${v('notlar')}</textarea></div>
    <div class="araclar-form-hata" data-form-hata></div>
    <button type="submit" class="araclar-ekle" data-kaydet>${tur === 'yeni' ? 'Aracı ekle' : 'Değişiklikleri kaydet'}</button>
  </form>`;
}
function formOku(fm) {
  const g = k => (fm.querySelector(`[data-f="${k}"]`)?.value || '').trim();
  return {
    plaka: g('plaka'), marka: g('marka') || null, model: g('model') || null, renk: g('renk') || null,
    kapasite: Number(g('kapasite')) || 4, sofor_ad: g('sofor_ad').replace(/\s+/g, ' ') || null, sofor_tel: g('sofor_tel'), notlar: g('notlar') || null,
  };
}
function ayniPlaka(plaka, haricId) {
  const k = plakaAnahtar(fmt.plaka(plaka));
  return k ? [...store.araclar.values()].find(a => a.id !== haricId && plakaAnahtar(a.plaka) === k) : null;
}
// forma bakıp: geçerlilik durumu + ipuçları. Döner: { hazir, satir }
function formDurumu(fm, id) {
  const v = formOku(fm); const yeni = fm.dataset.aracForm === 'yeni';
  const plaka = plakaBicimle(v.plaka);
  const gecerli = PLAKA_DESEN.test(plaka);
  const ayni = gecerli ? ayniPlaka(plaka, id) : null;
  const tel = telTemizle(v.sofor_tel);
  const telHata = v.sofor_tel && tel.length !== 10;
  const ip = fm.querySelector('[data-ipucu="plaka"]');
  fm.querySelector('[data-plaka-onizleme]').innerHTML = plakaKutu(plaka || '35 ··· ···', 'onizleme', true);
  if (!plaka) { ip.textContent = ''; ip.className = 'araclar-ipucu'; }
  else if (ayni) { ip.textContent = `Bu plaka zaten kayıtlı${ayni.sofor_ad ? ` (${trBaslik(ayni.sofor_ad)})` : ''}`; ip.className = 'araclar-ipucu'; }
  else if (gecerli) { ip.textContent = '✓ geçerli plaka'; ip.className = 'araclar-ipucu iyi'; }
  else { ip.textContent = 'eksik'; ip.className = 'araclar-ipucu'; }
  const tp = fm.querySelector('[data-ipucu="sofor_tel"]'); tp.textContent = telHata ? 'Telefon 10 haneli olmalı (5xx xxx xx xx)' : '';
  const hazir = gecerli && !ayni && !telHata && (!yeni || (v.sofor_ad || '').trim().length > 2);
  const btn = fm.querySelector('[data-kaydet]'); btn.classList.toggle('hazir', hazir);
  return { hazir, satir: { plaka, marka: v.marka, model: v.model, renk: v.renk, kapasite: v.kapasite, sofor_ad: v.sofor_ad, sofor_tel: tel || null, notlar: v.notlar } };
}
function formBagla(fm, { id = null, tamam } = {}) {
  const plaka = fm.querySelector('[data-f="plaka"]'), tel = fm.querySelector('[data-f="sofor_tel"]');
  plaka.addEventListener('input', () => { plaka.value = plakaBicimle(plaka.value); });
  tel.addEventListener('blur', () => { const d = telTemizle(tel.value); if (d.length === 10) tel.value = fmt.tel(d); formDurumu(fm, id); });
  fm.addEventListener('input', () => { if (id) formKirli = true; fm.querySelector('[data-form-hata]').textContent = ''; formDurumu(fm, id); });
  fm.addEventListener('submit', e => { e.preventDefault(); formGonder(fm, id, tamam); });
  formDurumu(fm, id);
}
async function formGonder(fm, id, tamam) {
  if (!yazabilirMi()) return toast('Araç kaydetme yetkin yok', { tur: 'hata' });
  const { hazir, satir } = formDurumu(fm, id);
  if (!hazir) return;
  const btn = fm.querySelector('[data-kaydet]'); const yazi = btn.textContent;
  btn.disabled = true; btn.textContent = 'Kaydediliyor…';
  try {
    // hızlı eklemede not, çekmecedeki not kayıtlarıyla aynı biçimde ("[10:42 Ad] metin") tutulur
    if (!id && satir.notlar) satir.notlar = `[${saatYaz(new Date())} ${store.ben?.ad_soyad || ''}] ${satir.notlar}`;
    const a = await aracKaydet(id ? { id, ...satir } : satir);
    btn.disabled = false; btn.textContent = yazi;
    tamam?.(a);
  } catch (e) {
    btn.disabled = false; btn.textContent = yazi;
    if (/plaka/i.test(e.message)) { const ip = fm.querySelector('[data-ipucu="plaka"]'); ip.textContent = e.message; ip.className = 'araclar-ipucu'; }
    else fm.querySelector('[data-form-hata]').textContent = e.message;
  }
}
function yeniEklendi(a, fm) {
  fm.reset();
  fm.querySelector('[data-f="kapasite"]').value = '4';
  yeniId = a.id; yeniZaman = Date.now();
  if (filtre !== 'hepsi') filtre = 'hepsi';
  formDurumu(fm, null);
  ciz();
  kok?.querySelector(`[data-arac="${a.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  toast(`${fmt.plaka(a.plaka)} eklendi`, { tur: 'basari', geriAl: async () => { await aracSil(a.id); } });
}

// ---------------------------------------------------------------- karşılama (referans ya da kim karşıladıysa)
async function karsilaDugme(ids) {
  const hedef = ids.filter(id => { const f = store.firmalar.get(id); return f && !f.karsilayan; });
  if (!hedef.length) return;
  try {
    for (const id of hedef) await karsiladim(id);
    const f = store.firmalar.get(hedef[0]);
    toast(`${f ? firmaAdi(f) : 'Kişi'} · karşıladın`, { tur: 'basari' });
  } catch (e) { hataGoster(e); }
}
// ---------------------------------------------------------------- araç durumu ve sorumlu
async function durumDegistir(id, durum) {
  const a = store.araclar.get(id); if (!a || a.durum === durum) return;
  const eski = a.durum;
  try {
    await aracDurumYap(id, durum);
    toast(`${fmt.plaka(a.plaka)} · ${ARAC_DURUM_AD[durum]}`, { geriAl: () => aracDurumYap(id, eski) });
  } catch (e) { hataGoster(e); ciz(); }
}
// "Otomatik": yolcuların şu anki durumundan türet (araçta yolcu varsa Yolda, yoksa Hazır)
function otomatikDurum(a) {
  const o = aracOzet(a, yolcuHaritasi());
  return o.occ > 0 ? 'yolda' : 'hazir';
}
async function sorumluDegistir(aracId, uid) {
  const a = store.araclar.get(aracId); if (!a || (a.sorumlu_id || null) === (uid || null)) return;
  if (!yazabilirMi()) return toast('Sorumlu atama yetkin yok', { tur: 'hata' });
  const eski = a.sorumlu_id || null;
  try {
    await aracSorumluAta(aracId, uid || null);
    const p = uid ? store.profiller.get(uid) : null;
    toast(`${fmt.plaka(a.plaka)} · ${p ? 'sorumlu ' + trBaslik(p.ad_soyad) : 'sorumlu kaldırıldı'}`, { geriAl: () => aracSorumluAta(aracId, eski) });
  } catch (e) { hataGoster(e); }
}

// ---------------------------------------------------------------- ROTA MESAJI (WhatsApp) ve Google Maps
function rotaAdresleri(duraklarListe) {
  return duraklarListe.filter(durakBekliyor).map(d => d.f.adres || (d.f.lat != null && d.f.lon != null ? `${d.f.lat},${d.f.lon}` : '')).filter(Boolean);
}
function rotaBaglanti(duraklarListe) {
  const adresler = rotaAdresleri(duraklarListe).slice(0, MAKS_ARA_DURAK);
  return adresler.length ? fmt.rotaLink(adresler) : fmt.mapsLink(`${VARIS.ad}, İzmir`);
}
function adresMetni(f) {
  const adres = String(f.adres || '').trim(); const ilce = trBaslik(f.ilce || '');
  if (!adres) return ilce || 'adres yok';
  return ilce && !trArama(adres).includes(trArama(ilce)) ? `${adres}, ${ilce}` : adres;
}
// tasarımın SM.vWaText biçimi: her durak tek satır; yalnız henüz alınmamış duraklar
function waMetni(a, o) {
  const s = [`🚐 ${fmt.plaka(a.plaka)}${o.rota.tek ? ' · ' + o.rota.ad : ''}`];
  if (!o.bekleyen.length) s.push('Şu an alınacak yolcu yok.');
  o.bekleyen.forEach((d, i) => {
    const f = d.f; const tel = kisiTel(f);
    s.push(`${i + 1}) ${fmt.saatKisa(f.tasima_saati) || 'Saat ?'} ${firmaAdi(f)}${d.firmalar.length > 1 ? ` (${d.firmalar.length} oy)` : ''} · ${adresMetni(f)}${tel ? ` · ${fmt.tel(tel)}` : ''}${f.alma_notu ? ` · NOT: ${String(f.alma_notu).trim()}` : ''}`);
  });
  s.push('Varış: Fuar İzmir (Gaziemir)');
  s.push(`Yol tarifi: ${rotaBaglanti(o.bekleyen)}`);
  return s.join('\n');
}
const soforTelGecerli = a => (a.sofor_tel && telTemizle(a.sofor_tel).length === 10 ? a.sofor_tel : '');
const waGonderUrl = (a, metin) => { const t = soforTelGecerli(a); return t ? fmt.waLink(t, metin) : `https://wa.me/?text=${encodeURIComponent(metin)}`; };
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
  return aracListesi().map(a => { const o = aracOzet(a, harita); return `<option value="${a.id}">${esc(fmt.plaka(a.plaka))} · ${esc(trBaslik(a.sofor_ad || 'şoför yok'))} · ${o.kisi} durak${a.durum !== 'hazir' ? ' · ' + esc(ARAC_DURUM_AD[a.durum] || a.durum) : ''}</option>`; }).join('');
}
function aracsizHtml() {
  const { toplam, gruplar, tekler } = aracsizlar();
  if (!toplam) return '<div class="araclar-c-bos" style="padding:20px 0;text-align:center">Tüm servis yolcularının aracı var.</div>';
  if (!store.araclar.size) return '<div class="araclar-c-bos" style="padding:20px 0;text-align:center">Önce araç ekle, sonra buradan atayabilirsin.</div>';
  const harita = yolcuHaritasi(); const sec = aracSecenekleri(harita);
  const satirKisi = f => `<a class="araclar-link" data-kisi="${f.id}">${esc(fmt.saatKisa(f.tasima_saati) || '--:--')} ${esc(firmaAdi(f))}</a>`;
  return `<div style="margin-bottom:10px;color:var(--ink-3);font-weight:600;font-size:13px">${toplam} yolcu servisle alınacak ama aracı yok. Rotayı ya da kişiyi seçtiğin araca ata.</div>
    ${gruplar.map(g => `<div class="araclar-aracsiz-grup">
      <div class="araclar-aracsiz-ust"><div class="ana"><div style="font-weight:800">${esc(g.kod)}</div><div style="color:var(--ink-3);font-size:12px;font-weight:600">${duraklar(g.firmalar).length} kişi · ${esc(saatAraligi(g.firmalar))} · ${esc(ilceMetni(g.firmalar))}</div></div>
        <select class="girdi" data-ata="${g.firmalar.map(f => f.id).join(',')}" data-etiket="${esc(g.kod)}"><option value="">Rotayı araca ata…</option>${sec}</select></div>
      <div style="margin-top:6px;font-size:12px;color:var(--ink-2)">${g.firmalar.map(satirKisi).join(' · ')}</div>
    </div>`).join('')}
    ${tekler.length ? `<div class="araclar-mini-baslik" style="margin-bottom:6px">Rotası olmayan</div>${tekler.map(f => `<div class="araclar-aracsiz-grup"><div class="araclar-aracsiz-ust"><div class="ana">${satirKisi(f)}<div style="font-size:12px;color:var(--ink-3);font-weight:600">${esc(trBaslik(f.ilce || ''))}${f.alma_notu ? ' · alma notu var' : ''}</div></div>
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
    toast(`${etiket || `${ids.length} kişi`} · ${fmt.plaka(a.plaka)} aracına eklendi${o.kisi > o.kap ? ` · ${o.kisi} durak, ${o.kap} koltuk` : ''}`, { geriAl });
  } catch (e) { hataGoster(e); }
}
async function yolcuCikar(aracId, ids, etiket) {
  const a = store.araclar.get(aracId);
  try { const geriAl = await aracAta(ids, null); toast(`${etiket} · ${a ? fmt.plaka(a.plaka) + ' aracından' : 'araçtan'} çıkarıldı`, { geriAl }); }
  catch (e) { hataGoster(e); }
}
// sürükle-bırak: durak sırasını arac_sira olarak yaz (aynı kişinin tüm firmaları aynı sıraya)
async function durakTasi(aracId, anahtar, hedef) {
  const a = store.araclar.get(aracId); if (!a || !yazabilirMi()) return;
  const liste = aracOzet(a, yolcuHaritasi()).duraklar.slice();
  const kaynak = liste.findIndex(d => kisiAnahtar(d.f) === anahtar); if (kaynak < 0) return;
  const [d0] = liste.splice(kaynak, 1); liste.splice(Math.max(0, Math.min(hedef, liste.length)), 0, d0);
  const degisim = [], onceki = new Map();
  liste.forEach((d, k) => d.firmalar.forEach(f => { if (f.arac_sira !== k) { onceki.set(f.id, f.arac_sira ?? null); degisim.push([f.id, k]); } }));
  if (!degisim.length) return;
  siraYaziliyor = true;
  try {
    for (const [id, k] of degisim) await firmaAlanYaz(id, { arac_sira: k });
    toast('Durak sırası güncellendi', { geriAl: async () => { for (const [id, eski] of onceki) await firmaAlanYaz(id, { arac_sira: eski }); } });
  } catch (e) { hataGoster(e); }
  finally { siraYaziliyor = false; cekmeceYenile(); if (yenileBekliyor) ciz(); }
}

// yolcunun bu araca katıldığı an (olaylardan); bundan önceki durum olayları bu aracın geçmişine ait değildir
function katilimZamanlari(a) {
  const m = new Map();
  for (const ev of store.olaylar) {
    if (ev.tur === 'arac' && ev.firma_id && String(ev.yeni) === String(a.id) && !m.has(ev.firma_id)) m.set(ev.firma_id, new Date(ev.zaman).getTime());
  }
  return m;
}
// ---------------------------------------------------------------- sefer geçmişi (olaylardan türetilir)
function seferler(a, o) {
  const teslim = o.firmalar.filter(f => TAMAM.includes(f.durum) && !f.kendi_geldi);
  if (!teslim.length) return [];
  const kimler = new Map(teslim.map(f => [f.id, f]));
  const birak = new Map(), aldi = new Map(); const katilim = katilimZamanlari(a);
  const azalt = (m, id, ms) => { if (!m.has(id) || ms < m.get(id)) m.set(id, ms); };
  for (const ev of store.olaylar) {
    if (!ev.firma_id || !kimler.has(ev.firma_id)) continue;
    const ms = new Date(ev.zaman).getTime(); const yeni = String(ev.yeni || '');
    if (katilim.has(ev.firma_id) && ms < katilim.get(ev.firma_id)) continue;
    if ((ev.tur === 'durum' && /^(fuarda|oy_kullandi)/.test(yeni) && !yeni.includes('+kendi')) || (ev.tur === 'geri_sayim' && yeni === 'birakti')) azalt(birak, ev.firma_id, ms);
    else if ((ev.tur === 'durum' && /^yolda/.test(yeni)) || (ev.tur === 'geri_sayim' && yeni === 'aldim')) azalt(aldi, ev.firma_id, ms);
  }
  const kisiler = new Map();   // aynı kişi tek koltuk
  for (const f of teslim) {
    const k = kisiAnahtar(f); const bt = birak.get(f.id) ?? (f.durum_zamani ? new Date(f.durum_zamani).getTime() : Date.now());
    const al = aldi.get(f.id); const m = kisiler.get(k);
    if (!m) kisiler.set(k, { bt, al: al != null && al <= bt ? al : null });
    else { m.bt = Math.min(m.bt, bt); if (al != null && al <= m.bt && (m.al == null || al < m.al)) m.al = al; }
  }
  const sirali = [...kisiler.values()].sort((x, y) => x.bt - y.bt);
  const kap = o.kap; const gruplar = [];
  for (const k of sirali) {
    const son = gruplar[gruplar.length - 1];
    if (son && k.bt - son.bitis <= 25 * 60000 && son.kisi < kap) { son.kisi++; son.bitis = k.bt; if (k.al != null && (son.bas == null || k.al < son.bas)) son.bas = k.al; }
    else gruplar.push({ kisi: 1, bitis: k.bt, bas: k.al });
  }
  return gruplar.map((g, i) => ({ no: i + 1, ...g }));
}

// ---------------------------------------------------------------- araç notları (araclar.notlar: "[10:42 Ad] metin" satırları)
function notSatirlari(a) {
  return String(a.notlar || '').split('\n').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^\[(\d{1,2}:\d{2}) ([^\]]*)\]\s*(.*)$/);
    return m ? { t: m[1], kim: m[2], metin: m[3] } : { t: '', kim: '', metin: s };
  }).reverse();
}
async function notEkleArac(id, metin) {
  const a = store.araclar.get(id); metin = (metin || '').trim(); if (!a || !metin) return false;
  if (!yazabilirMi()) { toast('Not ekleme yetkin yok', { tur: 'hata' }); return false; }
  const satir = `[${saatYaz(new Date())} ${store.ben?.ad_soyad || ''}] ${metin}`;
  try { await aracKaydet({ id, plaka: a.plaka, notlar: a.notlar ? `${a.notlar}\n${satir}` : satir }); toast('Not eklendi'); return true; }
  catch (e) { hataGoster(e); return false; }
}
// araç geçmişi: aracın kendi olayları + şu an bu araçtaki yolcuların durum olayları
function aracOlaylari(a, o) {
  const idler = new Set(o.firmalar.map(f => f.id)); const s = []; const katilim = katilimZamanlari(a);
  for (const ev of store.olaylar) {
    if (ev.arac_id === a.id) s.push(ev);
    else if (ev.tur === 'durum' && ev.firma_id && idler.has(ev.firma_id) && !(katilim.has(ev.firma_id) && new Date(ev.zaman).getTime() < katilim.get(ev.firma_id))) s.push(ev);
    else if (ev.tur === 'arac' && String(ev.eski) === String(a.id)) s.push(ev);
  }
  return s;
}
function olayYazisi(ev, a) {
  if (ev.tur === 'arac_durum') return `Araç durumu: ${ARAC_DURUM_AD[ev.yeni] || ev.yeni}`;
  const f = ev.firma_id ? store.firmalar.get(ev.firma_id) : null;
  if (ev.tur === 'arac' && f) return `${firmaAdi(f)} ${String(ev.yeni) === String(a.id) ? 'araca eklendi' : 'araçtan çıkarıldı'}`;
  return olayMetni(ev);
}

// ---------------------------------------------------------------- ARAÇ ÇEKMECESİ (SM AracKarti)
function aracAc(id) {
  const a = store.araclar.get(id); if (!a) return toast('Araç bulunamadı', { tur: 'hata' });
  acikArac = id; formKirli = false; durumMenu = false; sorumluMenu = false; waAcik = false; waDuzenlendi = false; durakSuruklenen = null; durakUstunde = null;
  const yaz = yazabilirMi(); const yon = yoneticiMi();
  const c = cekmeceAc(`
    <div class="araclar-c">
      <div class="araclar-c-ust" data-r="ust"></div>
      <div class="araclar-c-govde">
        <div data-r="sofor"></div>
        <div data-r="sorumlu"></div>
        <div class="araclar-c-metrik" data-r="metrik"></div>
        <div class="araclar-c-eylem" data-r="eylem"></div>
        <div data-r="wa" style="display:contents"></div>
        <div class="araclar-c-bolum">
          <div class="araclar-c-bolum-ust"><div class="b" data-baslik-durak>DURAKLAR</div><div class="i">${yaz ? 'Sürükleyerek sırayı değiştir' : ''}</div></div>
          <div class="araclar-c-duraklar" data-r="durak"></div>
        </div>
        ${yaz ? `<div class="araclar-c-bolum">
          <div class="araclar-c-bolum-ust"><div class="b">YOLCU EKLE</div></div>
          <input class="araclar-ara-girdi" data-yolcu-ara type="search" placeholder="Ad, firma, telefon, ilçe ya da rota ara…" autocomplete="off">
          <div class="araclar-sonuc" data-r="sonuc"></div>
        </div>` : ''}
        <div class="araclar-c-iki">
          <div><div class="araclar-c-bolum-ust"><div class="b">SEFER GEÇMİŞİ</div></div><div data-r="sefer" style="display:flex;flex-direction:column;gap:8px"></div></div>
          <div><div class="araclar-c-bolum-ust"><div class="b">NOTLAR</div></div>
            ${yaz ? `<div class="araclar-not-satir"><input data-not-girdi placeholder="Not ekle…"><button data-not-ekle>Ekle</button></div>` : ''}
            <div data-r="notlar" style="display:flex;flex-direction:column;gap:8px"></div></div>
        </div>
        <div class="araclar-c-bolum"><div class="araclar-c-bolum-ust"><div class="b">ARAÇ GEÇMİŞİ</div></div><div data-r="gecmis"></div></div>
        ${yon ? '<div class="araclar-c-bolum" data-r="giris"></div>' : ''}
        ${yaz ? `<details class="araclar-detay" data-c-bilgi><summary>Araç bilgileri</summary><div data-c-form></div></details>` : ''}
        ${yon ? `<div class="araclar-tehlike"><button data-sil>Aracı sil</button><span>Yolcular araçsız kalır, kayıtları silinmez.</span></div>` : ''}
      </div>
    </div>`, { kapaninca: () => { if (acikArac === id) acikArac = null; formKirli = false; durumMenu = false; sorumluMenu = false; } });
  c.dataset.aracCekmece = id;
  const arka = c.previousElementSibling; if (arka?.classList.contains('cekmece-arka')) arka.style.background = 'var(--scrim)';
  cekmeceBagla(c, id);
  cekmeceYenile({ form: true });
}
function bolgeYaz(c, ad, html) {
  const n = c.querySelector(`[data-r="${ad}"]`); if (!n || n._h === html) return;
  n.innerHTML = html; n._h = html;
}
function ustHtml(a, o) {
  const yaz = yazabilirMi();
  const menu = durumMenu && yaz ? `<div class="araclar-menu">
      <button data-durum-sec="auto"><span class="oto">Otomatik</span><span class="ipucu">yolcu durumundan</span></button>
      ${['hazir', 'yolda', 'fuarda', 'mola', 'arizali'].map(d => `<button data-durum-sec="${d}">${durumRozet(d)}${a.durum === d ? '<span class="ipucu">✓ şu an</span>' : ''}</button>`).join('')}
    </div>` : '';
  return `
    <div class="s1"><div class="et">ARAÇ KARTI</div><button class="araclar-c-kapat" data-kapat title="Kapat (Esc)">×</button></div>
    <div class="s2">${plakaKutu(a.plaka, 'cekmece')}
      <div class="araclar-c-durum"><button ${yaz ? 'data-durum-menu' : 'disabled style="cursor:default"'}>${durumRozet(a.durum).replace('</span>', yaz ? ' ▾</span>' : '</span>')}</button>${menu}</div>
    </div>
    <div class="s3">${esc([aracAdi(a), a.renk ? trBaslik(a.renk) : '', `${o.kap} yolcu`].filter(Boolean).join(' · '))} · <b>${esc(o.rota.ad)}</b></div>`;
}
function soforHtml(a) {
  const tel = a.sofor_tel; const bagli = a.sofor_kullanici;
  return `<div class="araclar-c-sofor">
    <div class="g"><div class="araclar-c-etk">ŞOFÖR${bagli ? '<span class="bagli" title="Şoför uygulamaya bağlı, PIN ile giriyor">UYGULAMADA</span>' : ''}</div>
      <div class="ad ${a.sofor_ad ? '' : 'yok'}">${a.sofor_ad ? esc(trBaslik(a.sofor_ad)) : 'Şoför girilmedi'}</div>
      <div class="tel">${tel ? esc(fmt.tel(tel)) : 'Telefon yok'}</div></div>
    <a class="araclar-c-ara ${fmt.telLink(tel) ? '' : 'pasif'}" href="${esc(fmt.telLink(tel) || '#')}">📞 Ara</a>
    <a class="araclar-c-wa ${fmt.waLink(tel) ? '' : 'pasif'}" href="${esc(fmt.waLink(tel) || '#')}" target="_blank" rel="noopener">WhatsApp</a>
  </div>`;
}
function sorumluHtml(a) {
  const yaz = yazabilirMi(); const p = sorumluOf(a);
  const adaylar = sorumluAdaylari();
  const menu = sorumluMenu && yaz ? `<div class="araclar-menu sag">
      ${a.sorumlu_id ? '<button data-sorumlu-sec=""><span class="mav">×</span><span class="mad">Sorumluyu kaldır</span></button>' : ''}
      ${adaylar.length ? adaylar.map(x => `<button data-sorumlu-sec="${esc(x.id)}"><span class="mav">${avatar(x.ad_soyad)}</span><span class="mad">${esc(trBaslik(x.ad_soyad))}</span><span class="ipucu">${aracYuku(x.id)} araç</span></button>`).join('') : '<div class="bos">Atanabilecek kullanıcı yok. Aşağıdan araç sorumlusu girişi oluştur.</div>'}
    </div>` : '';
  return `<div class="araclar-c-sorumlu"><div class="etk">SORUMLU</div>
    ${p ? `<div class="av">${avatar(p.ad_soyad)}</div><div class="kisi"><b>${esc(trBaslik(p.ad_soyad))}</b><span>${esc(ROL_AD[p.rol] || p.rol)}${p.son_giris ? ` · son giriş ${esc(fmt.goreli(p.son_giris))}` : ''}</span></div>`
      : '<div class="yok">Sorumlu atanmadı</div>'}
    ${yaz ? '<button class="araclar-c-kucuk" data-sorumlu-menu>Değiştir ▾</button>' : ''}${menu}</div>`;
}
function metrikHtml(a, o) {
  const k = konumBilgi(a); const sefer = seferler(a, o);
  const m = (e, d, renk, kucuk) => `<div><div class="e">${e}</div><div class="d ${kucuk ? 'k' : ''}" style="color:${renk}">${esc(d)}</div></div>`;
  return m('DOLULUK', `${o.occ}/${o.kap} yolcu`, o.occ >= o.kap ? 'var(--amber-ink)' : 'var(--ink)', true)
    + m('SEFER', sefer.length, 'var(--ink)') + m('TAŞINAN', o.tasinan, 'var(--green)')
    + m('SON KONUM', k.metin, k.eski ? 'var(--amber-ink)' : 'var(--ink)', String(k.metin).length > 8);
}
function eylemHtml(a, o) {
  return `<button class="araclar-c-wa-dugme" data-wa-ac ${o.bekleyen.length ? '' : 'disabled title="Alınacak yolcu yok"'}>Rotayı şoföre WhatsApp'la gönder</button>
    <a class="araclar-c-harita" href="${esc(rotaBaglanti(o.duraklar))}" target="_blank" rel="noopener">📍 Rotayı Google Maps'te aç</a>`;
}
function waHtml(a, o) {
  if (!waAcik) return '';
  const metin = waMetni(a, o);
  return `<div class="araclar-c-onizleme">
    <div class="araclar-c-etk">MESAJ ÖNİZLEMESİ · ${esc(a.sofor_ad ? trBaslik(a.sofor_ad) : 'Şoför')}</div>
    <div class="araclar-c-balon" data-wa-balon contenteditable="plaintext-only" spellcheck="false">${esc(metin)}</div>
    <div class="alt"><button class="araclar-c-kopya" data-wa-kopyala>Kopyala</button><a class="araclar-c-gonder" data-wa-gonder href="${esc(waGonderUrl(a, metin))}" target="_blank" rel="noopener">WhatsApp'ta aç ve gönder</a></div>
  </div>`;
}
function durakHtml(a, o) {
  const yaz = yazabilirMi();
  const satirlar = o.duraklar.map((d, i) => {
    const f = d.f; const g = durakGoster(d); const tamam = durakTamam(d);
    const ids = d.firmalar.map(x => x.id).join(',');
    const sonraki = { bekliyor: ['yolda', 'Alındı'], arandi: ['yolda', 'Alındı'], yolda: ['fuarda', 'Fuarda'], fuarda: ['oy_kullandi', 'Oy ✓'] }[g.durum];
    const evrak = d.firmalar.some(x => x.evrak_uyari);
    const kf = d.firmalar.find(x => x.karsilayan);
    const karsilanabilir = !kf && ['yolda', 'fuarda'].includes(g.durum);
    const karsiBilgi = kf ? `<span class="k">Karşılayan: ${esc(trBaslik(kf.karsilayan))}${kf.karsilama_zamani ? ` · ${esc(fmt.saat(kf.karsilama_zamani))}` : ''}</span>` : '';
    const benimRef = d.firmalar.some(x => referansBenMi(x));
    return `<div class="araclar-durak ${tamam ? 'bitti' : ''}" ${yaz ? 'draggable="true"' : ''} data-durak="${esc(kisiAnahtar(f))}" data-i="${i}">
      ${yaz ? '<div class="tut" title="Sürükle">⋮⋮</div>' : ''}
      <div class="no">${i + 1}</div>
      <div class="saat">${esc(fmt.saatKisa(f.tasima_saati) || '—')}</div>
      <button class="ad" data-kisi="${f.id}">
        <span class="a">${esc(firmaAdi(f))}${d.firmalar.length > 1 ? `<em>${d.firmalar.length} OY</em>` : ''}${evrak ? '<u title="Evrak uyarısı">▲</u>' : ''}</span>
        <span class="b">${esc([trBaslik(f.ilce || ''), kisaFirma(f.unvan)].filter(Boolean).join(' · '))}</span>
        ${f.alma_notu ? `<span class="n">📍 ${esc(f.alma_notu)}</span>` : ''}
        ${karsiBilgi}
      </button>
      ${gunRozet(g)}
      ${yaz ? `<div class="eylem">
        ${sonraki ? `<button class="${sonraki[0] === 'oy_kullandi' ? 'yesil' : ''}" data-isaret="${g.id}" data-durum="${sonraki[0]}" title="${esc(DURUM_AD[sonraki[0]])} olarak işaretle">${esc(sonraki[1])}</button>` : ''}
        ${karsilanabilir ? `<button class="karsila" data-karsila="${ids}" title="Kişiyi ben karşıladım">${benimRef ? 'Karşıladım' : 'Ben karşıladım'}</button>` : ''}
        <button class="cikar" data-cikar="${ids}" data-etiket="${esc(firmaAdi(f))}" title="Bu araçtan çıkar">Çıkar</button></div>` : ''}
    </div>`;
  }).join('');
  return (satirlar || `<div class="araclar-c-bos" style="padding:12px">Bu araca henüz yolcu atanmadı.${yaz ? ' Aşağıdan ara ya da bekleyen bir rotayı ekle.' : ''}</div>`)
    + `<div class="araclar-fuar"><div class="b">⚑</div><div class="a">FUAR İZMİR</div><div class="c">varış · Gaziemir</div></div>`;
}
function seferHtml(a, o) {
  const s = seferler(a, o);
  if (!s.length) return '<div class="araclar-c-bos">Henüz tamamlanan sefer yok.</div>';
  return s.slice().reverse().map(t => `<div class="araclar-sefer"><b>Sefer ${t.no}</b><span>${t.bas != null ? `${esc(saatYaz(t.bas))}–` : ''}${esc(saatYaz(t.bitis))}</span><em>${t.kisi} kişi</em></div>`).join('');
}
function notlarHtml(a) {
  const n = notSatirlari(a);
  if (!n.length) return '<div class="araclar-c-bos">Henüz not yok.</div>';
  return n.map(x => `<div class="araclar-not"><div class="t">${esc(x.metin)}</div>${x.t ? kaynakCipHtml('el', `El ile · ${shortBy(x.kim)} · ${x.t}`, 'Masada elle yazıldı.') : ''}</div>`).join('');
}
function gecmisHtml(a, o) {
  const ev = aracOlaylari(a, o).slice(0, 14);
  if (!ev.length) return '<div class="araclar-c-bos">Henüz kayıt yok.</div>';
  return ev.map(e => { const k = kaynakOge(e); return `<div class="araclar-gecmis"><div class="z">${esc(saatYaz(e.zaman))}</div><div class="g"><div>${esc(olayYazisi(e, a))}</div>${kaynakCipHtml(k.tur, k.etiket, k.ipucu)}</div></div>`; }).join('');
}
// yolcu ekle: arama sonucu ya da araç bekleyen rotalar
function sonucHtml(a, q) {
  q = (q || '').trim();
  if (q.length < 2) {
    const { toplam, gruplar, tekler } = aracsizlar();
    if (!toplam) return '<div class="araclar-c-bos">Araç bekleyen servis yolcusu yok. İsimle arayıp herhangi bir kişiyi ekleyebilirsin.</div>';
    const G = 6, T = 6;
    return `<div class="araclar-mini-baslik">Araç bekleyen rotalar (${gruplar.length})</div>
      ${gruplar.slice(0, G).map(g => { const dk = duraklar(g.firmalar).length; return `<div class="araclar-sonuc-satir">
        <div class="ana"><b>${esc(g.kod)}</b><span>${dk} kişi · ${esc(saatAraligi(g.firmalar))} · ${esc(ilceMetni(g.firmalar))}</span><span class="kisiler">${g.firmalar.map(f => esc(firmaAdi(f))).join(', ')}</span></div>
        <div class="sag"><button class="araclar-mini-dugme koyu" data-ekle="${g.firmalar.map(f => f.id).join(',')}" data-etiket="${esc(g.kod)}">Rotayı ekle (${dk})</button></div>
      </div>`; }).join('') || '<div class="araclar-c-bos">Rotası olan bekleyen yolcu yok.</div>'}
      ${gruplar.length > G ? `<div class="araclar-sonuc-daha">ve ${gruplar.length - G} rota daha: adını ya da rota kodunu yazarak bul</div>` : ''}
      ${tekler.length ? `<div class="araclar-mini-baslik">Rotası olmayan servis yolcuları (${tekler.length})</div>${tekler.slice(0, T).map(f => sonucSatir(a, f)).join('')}${tekler.length > T ? `<div class="araclar-sonuc-daha">ve ${tekler.length - T} kişi daha</div>` : ''}` : ''}`;
  }
  const parca = trArama(q).split(' ').filter(Boolean);
  const rotaUyar = f => { if (!f.rota_kod) return false; const rk = trArama(`${f.rota_kod} ${f.ilce || ''} ${f.rota_ilceler || ''}`); return parca.every(p => rk.includes(p)); };
  const bulunan = firmaListesi().filter(f => aramaEslesir(f, q) || rotaUyar(f));
  const puan = f => (f.arac_id === a.id ? 3 : 0) + (TAMAM.includes(f.durum) ? 2 : 0) + (ulasim(f) === 'servis' && !aracVar(f) ? 0 : 1) + (f.oy_sinifi === 'bizde' ? 0 : 0.5);
  bulunan.sort((x, y) => (puan(x) - puan(y)) || firmaAdi(x).localeCompare(firmaAdi(y), 'tr'));
  if (!bulunan.length) return '<div class="araclar-c-bos">Sonuç yok.</div>';
  const N = 15;
  return bulunan.slice(0, N).map(f => sonucSatir(a, f)).join('') + (bulunan.length > N ? `<div class="araclar-sonuc-daha">${bulunan.length - N} sonuç daha, aramayı daralt</div>` : '');
}
function sonucSatir(a, f) {
  const burada = f.arac_id === a.id; const baska = !burada && aracVar(f) ? store.araclar.get(f.arac_id) : null;
  const grup = kisiGrubu(f).filter(x => x.arac_id !== a.id);
  const ids = (grup.length ? grup : [f]).map(x => x.id).join(',');
  const bilgi = [f.unvan, trBaslik(f.ilce || ''), f.tasima_saati ? `servis ${fmt.saatKisa(f.tasima_saati)}` : ulasim(f) === 'servis' ? 'servis' : ulasim(f) === 'kendi' ? 'kendi gelecek' : '', f.rota_kod || ''].filter(Boolean).join(' · ');
  return `<div class="araclar-sonuc-satir ${burada ? 'icinde' : ''}">
    <div class="ana"><b><a class="araclar-link" data-kisi="${f.id}">${esc(firmaAdi(f))}</a></b><span>${esc(bilgi)}</span></div>
    <div class="sag">${rozetSinif(f.oy_sinifi)} ${rozetDurum(f)} ${baska ? `<span title="Şu an bu araçta">${plakaKutu(baska.plaka, 'mini')}</span>` : ''}
      ${burada ? '<span class="araclar-rz araclar-rz-hazir">Bu araçta</span>'
        : `<button class="araclar-mini-dugme ${baska ? '' : 'koyu'}" data-ekle="${ids}" data-etiket="${esc(firmaAdi(f))}" title="${baska ? `Şu an ${esc(fmt.plaka(baska.plaka))} aracında; bu araca taşınır` : 'Bu araca ekle'}">${baska ? 'Buraya al' : 'Ekle'}</button>`}
    </div>
  </div>`;
}
// Admin: şoför girişi + araç sorumlusu girişi
function girisHtml(a) {
  const soforKutu = (() => {
    if (a.sofor_kullanici) {
      const p = store.profiller.get(a.sofor_kullanici);
      return `<div class="araclar-kutu bagli">
        <div class="araclar-c-etk">ŞOFÖR GİRİŞİ · BAĞLI</div>
        <div class="ad">${esc(p?.ad_soyad || 'Kullanıcı')} ${p && !p.aktif ? '<span class="araclar-rz araclar-rz-arizali">Pasif</span>' : ''}</div>
        <div class="y">${p?.son_giris ? `Son giriş ${esc(fmt.goreli(p.son_giris))}` : 'Henüz giriş yapmadı'}${p && a.sofor_ad && trArama(p.ad_soyad) !== trArama(a.sofor_ad) ? ` · araçtaki şoför adı farklı: ${esc(trBaslik(a.sofor_ad))}` : ''}</div>
        <div class="satir"><button class="araclar-c-kucuk" data-pin-sifirla="${esc(a.sofor_kullanici)}">Yeni PIN üret</button><button class="araclar-c-kucuk" data-bag-kaldir>Bağlantıyı kaldır</button></div>
      </div>`;
    }
    if (!a.sofor_ad || a.sofor_ad.trim().length < 3) return `<div class="araclar-kutu"><div class="araclar-c-etk">ŞOFÖR GİRİŞİ</div><div class="y">Şoför girişi oluşturmak için önce aşağıdaki “Araç bilgileri” bölümünden şoförün adını soyadını yaz.</div></div>`;
    const ayni = [...store.profiller.values()].find(p => trArama(p.ad_soyad) === trArama(a.sofor_ad));
    if (ayni) {
      const baskaArac = [...store.araclar.values()].find(x => x.id !== a.id && x.sofor_kullanici === ayni.id);
      if (ayni.rol === 'sofor') return `<div class="araclar-kutu"><div class="araclar-c-etk">ŞOFÖR GİRİŞİ</div><div class="y">“<b>${esc(ayni.ad_soyad)}</b>” adlı şoför kullanıcısı zaten var${baskaArac ? ` ve şu an <b>${esc(fmt.plaka(baskaArac.plaka))}</b> aracına bağlı` : ''}.</div><div class="satir"><button class="araclar-c-kucuk" data-bagla="${esc(ayni.id)}">${baskaArac ? 'Bu araca taşı' : 'Bu araca bağla'}</button></div></div>`;
      return `<div class="araclar-kutu"><div class="araclar-c-etk">ŞOFÖR GİRİŞİ</div><div class="y">“<b>${esc(ayni.ad_soyad)}</b>” adıyla ${esc(ROL_AD[ayni.rol] || ayni.rol)} rolünde bir kullanıcı var. Şoför girişi için araç bilgilerinde farklı bir ad yaz (ör. “${esc(trBaslik(a.sofor_ad))} Şoför”).</div></div>`;
    }
    return `<div class="araclar-kutu"><div class="araclar-c-etk">ŞOFÖR GİRİŞİ</div><div class="y">“<b>${esc(trBaslik(a.sofor_ad))}</b>” için 4 haneli PIN üretilir ve kullanıcı bu araca bağlanır. Şoför telefonundan ad soyad + PIN ile girer.</div><div class="satir"><button class="araclar-c-kucuk" style="background:var(--ink);color:var(--surface);border-color:var(--ink)" data-giris-olustur>Şoför girişi oluştur</button></div></div>`;
  })();
  const p = sorumluOf(a);
  const sorumluKutu = `<div class="araclar-kutu ${p?.rol === 'sorumlu' ? 'bagli' : ''}">
    <div class="araclar-c-etk">ARAÇ SORUMLUSU GİRİŞİ</div>
    ${p?.rol === 'sorumlu' ? `<div class="ad">${esc(p.ad_soyad)}</div><div class="y">${p.son_giris ? `Son giriş ${esc(fmt.goreli(p.son_giris))}` : 'Henüz giriş yapmadı'} · telefonundan bu aracın yolcularını işaretler.</div>
      <div class="satir"><button class="araclar-c-kucuk" data-pin-sifirla="${esc(p.id)}" data-sorumlu-pin>Yeni PIN üret</button></div>` : ''}
    <div class="y">${p?.rol === 'sorumlu' ? 'Başka bir kişi için yeni giriş oluşturursan bu araç ona bağlanır.' : 'Araç sorumlusu, telefonundan bu aracın yolcularını işaretler ve şoförün geri sayımını izler. 4 haneli PIN üretilir ve kullanıcı bu araca sorumlu olarak bağlanır.'}</div>
    <div class="satir"><input data-sorumlu-ad placeholder="Ad soyad" autocapitalize="words"><button class="araclar-c-kucuk" style="background:var(--ink);color:var(--surface);border-color:var(--ink)" data-sorumlu-olustur>Sorumlu girişi oluştur</button></div>
  </div>`;
  return soforKutu + sorumluKutu;
}

function cekmeceYenile({ form = false } = {}) {
  const c = document.querySelector('#katman .cekmece[data-arac-cekmece]');
  if (!c || !acikArac || Number(c.dataset.aracCekmece) !== acikArac) return;
  if (siraYaziliyor || durakSuruklenen != null) return;    // sürükleme / kayıt sırasında liste kımıldamasın
  const a = store.araclar.get(acikArac);
  if (!a) { acikArac = null; cekmeceKapat(); toast('Araç silindi'); return; }
  const o = aracOzet(a, yolcuHaritasi());
  const govde = c.querySelector('.araclar-c-govde'); const kaydir = govde.scrollTop;
  bolgeYaz(c, 'ust', ustHtml(a, o));
  bolgeYaz(c, 'sofor', soforHtml(a));
  bolgeYaz(c, 'sorumlu', sorumluHtml(a));
  bolgeYaz(c, 'metrik', metrikHtml(a, o));
  bolgeYaz(c, 'eylem', eylemHtml(a, o));
  if (!waAcik || !waDuzenlendi) bolgeYaz(c, 'wa', waHtml(a, o));
  bolgeYaz(c, 'durak', durakHtml(a, o));
  c.querySelector('[data-baslik-durak]').textContent = `DURAKLAR · ${o.kisi}`;
  const ara = c.querySelector('[data-yolcu-ara]'); if (ara) bolgeYaz(c, 'sonuc', sonucHtml(a, ara.value));
  bolgeYaz(c, 'sefer', seferHtml(a, o));
  bolgeYaz(c, 'notlar', notlarHtml(a));
  bolgeYaz(c, 'gecmis', gecmisHtml(a, o));
  if (yoneticiMi()) { const gi = c.querySelector('[data-r="giris"]'); if (gi && !gi.contains(document.activeElement)) bolgeYaz(c, 'giris', girisHtml(a)); }
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
    // menüler dışına tıklayınca kapansın
    if ((durumMenu || sorumluMenu) && !t.closest('.araclar-menu, [data-durum-menu], [data-sorumlu-menu]')) { durumMenu = false; sorumluMenu = false; cekmeceYenile(); }
    if (t.closest('[data-kapat]')) return cekmeceKapat();
    if (t.closest('[data-durum-menu]')) { durumMenu = !durumMenu; sorumluMenu = false; return cekmeceYenile(); }
    const ds = t.closest('[data-durum-sec]'); if (ds) {
      durumMenu = false; const v = ds.dataset.durumSec; cekmeceYenile();
      return durumDegistir(id, v === 'auto' ? otomatikDurum(store.araclar.get(id)) : v);
    }
    if (t.closest('[data-sorumlu-menu]')) { sorumluMenu = !sorumluMenu; durumMenu = false; return cekmeceYenile(); }
    const ss = t.closest('[data-sorumlu-sec]'); if (ss) { sorumluMenu = false; cekmeceYenile(); return sorumluDegistir(id, ss.dataset.sorumluSec || null); }
    if (t.closest('[data-wa-ac]')) { waAcik = !waAcik; waDuzenlendi = false; return cekmeceYenile(); }
    if (t.closest('[data-wa-kopyala]')) return kopyala(c.querySelector('[data-wa-balon]')?.innerText || '', 'Rota mesajı kopyalandı');
    const k = t.closest('[data-kisi]'); if (k) { e.preventDefault(); return kisiKartiAc(Number(k.dataset.kisi)); }
    const is = t.closest('[data-isaret]'); if (is) return isaretle(Number(is.dataset.isaret), is.dataset.durum, { kendi: false });
    const kr = t.closest('[data-karsila]'); if (kr) return karsilaDugme(kr.dataset.karsila.split(',').map(Number));
    const ck = t.closest('[data-cikar]'); if (ck) return yolcuCikar(id, ck.dataset.cikar.split(',').map(Number), ck.dataset.etiket);
    const ek = t.closest('[data-ekle]'); if (ek) {
      const ids = ek.dataset.ekle.split(',').map(Number).filter(Boolean);
      const hedef = ids.filter(x => { const f = store.firmalar.get(x); return f && f.arac_id !== id; });
      return yolcuEkle(id, hedef, ek.dataset.etiket);
    }
    if (t.closest('[data-not-ekle]')) { const gi = c.querySelector('[data-not-girdi]'); if (await notEkleArac(id, gi.value)) gi.value = ''; return; }
    if (t.closest('[data-giris-olustur]')) return girisOlustur(id, t.closest('button'));
    const ps = t.closest('[data-pin-sifirla]'); if (ps) return pinSifirla(id, ps.dataset.pinSifirla);
    if (t.closest('[data-bag-kaldir]')) return baglantiKaldir(id);
    const bg = t.closest('[data-bagla]'); if (bg) return kullaniciBagla(id, bg.dataset.bagla);
    if (t.closest('[data-sorumlu-olustur]')) return sorumluGirisiOlustur(id, c.querySelector('[data-sorumlu-ad]'), t.closest('button'));
    if (t.closest('[data-sil]')) return aracSilAkisi(id);
  });
  c.addEventListener('input', e => {
    if (e.target.matches('[data-yolcu-ara]')) { const a = store.araclar.get(id); if (a) bolgeYaz(c, 'sonuc', sonucHtml(a, e.target.value)); }
    if (e.target.matches('[data-wa-balon]')) {
      waDuzenlendi = true; const a = store.araclar.get(id); const g = c.querySelector('[data-wa-gonder]');
      if (a && g) g.href = waGonderUrl(a, e.target.innerText);
    }
  });
  c.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('[data-not-girdi]')) { e.preventDefault(); c.querySelector('[data-not-ekle]')?.click(); }
    if (e.key === 'Enter' && e.target.matches('[data-sorumlu-ad]')) { e.preventDefault(); c.querySelector('[data-sorumlu-olustur]')?.click(); }
    if (e.key === 'Escape' && (durumMenu || sorumluMenu)) { e.stopPropagation(); durumMenu = false; sorumluMenu = false; cekmeceYenile(); }
  });
  // durak sırası: HTML5 sürükle-bırak
  const temizle = () => { c.querySelectorAll('.araclar-durak.ustunde, .araclar-durak.suruklenen').forEach(x => x.classList.remove('ustunde', 'suruklenen')); durakUstunde = null; };
  c.addEventListener('dragstart', e => {
    const r = e.target.closest?.('[data-durak]'); if (!r) return;
    durakSuruklenen = r.dataset.durak; e.dataTransfer.setData('text/plain', r.dataset.durak); e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => r.classList.add('suruklenen'), 0);
  });
  c.addEventListener('dragover', e => {
    const r = e.target.closest?.('[data-durak]'); if (!r || durakSuruklenen == null) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    if (durakUstunde !== r.dataset.i) { c.querySelectorAll('.araclar-durak.ustunde').forEach(x => x.classList.remove('ustunde')); if (r.dataset.durak !== durakSuruklenen) r.classList.add('ustunde'); durakUstunde = r.dataset.i; }
  });
  c.addEventListener('drop', e => {
    const r = e.target.closest?.('[data-durak]'); if (!r || durakSuruklenen == null) return;
    e.preventDefault(); const anahtar = e.dataTransfer.getData('text/plain') || durakSuruklenen; const hedef = Number(r.dataset.i);
    temizle(); durakSuruklenen = null; durakTasi(id, anahtar, hedef);
  });
  c.addEventListener('dragend', () => { temizle(); durakSuruklenen = null; cekmeceYenile(); });
}

// ---------------------------------------------------------------- şoför / sorumlu girişi (Admin)
function girisAdresi() {
  const u = store.ayarlar.site?.url; if (u) return komiteLinki(String(u));   // link bu seçimi açsın (?k=...), giriş merkezine düşmesin
  if (/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) return '';
  return komiteLinki(location.origin + location.pathname);
}
function pinGoster(a, adSoyad, pin, { yeni = true, rol = 'sofor' } = {}) {
  const adres = girisAdresi(); const rolAd = rol === 'sorumlu' ? 'araç sorumlusu' : 'şoför'; const rolKime = rol === 'sorumlu' ? 'araç sorumlusuna' : 'şoföre';
  const metin = [
    `Merhaba ${trBaslik(adSoyad)}, ${KOMITE.kisaAd} seçim günü ${rolAd} girişin ${yeni ? 'hazır' : 'yenilendi'}.`,
    `Araç: ${fmt.plaka(a.plaka)}`,
    adres ? `Giriş: ${adres}` : null,
    `Ad soyad: ${adSoyad}`,
    `PIN: ${pin}`,
    'Bu bilgilerle giriş yapabilirsin.',
  ].filter(Boolean).join('\n');
  const tel = rol === 'sofor' ? soforTelGecerli(a) : '';
  const m = modal(yeni ? `${rol === 'sorumlu' ? 'Sorumlu' : 'Şoför'} girişi oluşturuldu` : 'Yeni PIN üretildi', `
    <div class="araclar-pin-kutu">
      <div class="araclar-c-etk">Ad soyad</div><div class="araclar-pin-ad">${esc(adSoyad)}</div>
      <div class="araclar-c-etk">PIN</div><div class="araclar-pin">${esc(pin)}</div>
    </div>
    <div class="uyari-kutu turuncu" style="margin-top:0"><span>!</span><div>PIN yalnız şimdi görünür. Kapatmadan önce ${rolKime} ilet.<div style="font-weight:600">Unutulursa buradan yeni PIN üretilebilir.</div></div></div>
    <textarea class="girdi" rows="7" readonly style="font-size:13px">${esc(metin)}</textarea>
    ${adres ? '' : '<div style="margin-top:6px;font-size:12px;color:var(--ink-3);font-weight:600">Bu bilgisayar yerel adreste çalışıyor; mesaja giriş bağlantısı eklenmedi. Yayındaki adresi elle ekle.</div>'}`,
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
    pinGoster(store.araclar.get(id) || a, r.ad_soyad || ad, r.pin, { yeni: true, rol: 'sofor' });
  } catch (e) {
    hataGoster(e);
    if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'Şoför girişi oluştur'; }
  }
}
async function sorumluGirisiOlustur(id, girdi, btn) {
  const a = store.araclar.get(id); if (!a || !yoneticiMi()) return;
  const ad = String(girdi?.value || '').trim().replace(/\s+/g, ' ');
  if (ad.length < 3) { girdi?.focus(); return toast('Araç sorumlusunun adını soyadını yaz', { tur: 'hata' }); }
  const mevcut = sorumluOf(a);
  if (mevcut && !(await onayla(`${fmt.plaka(a.plaka)} aracının sorumlusu şu an ${mevcut.ad_soyad}. Yeni giriş oluşturursan araç ${trBaslik(ad)} adlı yeni sorumluya bağlanır.`, { evet: 'Yeni sorumlu oluştur' }))) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Oluşturuluyor…'; }
  try {
    const r = await yonetim('olustur', { ad_soyad: ad, rol: 'sorumlu', arac_id: id });
    await Promise.all([aracTazele(id), profilleriYenile()]).catch(() => {});
    pinGoster(store.araclar.get(id) || a, r.ad_soyad || ad, r.pin, { yeni: true, rol: 'sorumlu' });
  } catch (e) {
    hataGoster(e);
    if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'Sorumlu girişi oluştur'; }
  }
}
async function pinSifirla(id, kullaniciId) {
  const a = store.araclar.get(id); const p = store.profiller.get(kullaniciId);
  if (!a || !p || !yoneticiMi()) return;
  if (!(await onayla(`${p.ad_soyad} için yeni PIN üretilsin mi? Eski PIN hemen geçersiz olur.`, { evet: 'Yeni PIN üret' }))) return;
  try { const r = await yonetim('pin_sifirla', { id: kullaniciId }); pinGoster(a, p.ad_soyad, r.pin, { yeni: false, rol: p.rol === 'sorumlu' ? 'sorumlu' : 'sofor' }); }
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
    const fl = t.closest('[data-filtre]'); if (fl) { filtre = filtre === fl.dataset.filtre ? 'hepsi' : fl.dataset.filtre; return ciz(); }
    if (t.closest('[data-aracsiz]')) return aracsizModal();
    if (t.closest('a, button, select, input, textarea, label')) return;
    const kart = t.closest('[data-liste] [data-arac]'); if (kart) aracAc(Number(kart.dataset.arac));
  });
  kok.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const kart = e.target.closest?.('[data-liste] [data-arac]'); if (kart && e.target === kart) aracAc(Number(kart.dataset.arac));
  });
  const ara = kok.querySelector('[data-ara]');
  ara.addEventListener('input', () => { arama = ara.value; ciz(); });
  ara.addEventListener('keydown', e => { if (e.key === 'Escape' && ara.value) { e.stopPropagation(); ara.value = ''; arama = ''; ciz(); } });
  // görev dağılımı: kartı başka sorumlu sütununa sürükle
  const liste = kok.querySelector('[data-liste]');
  liste.addEventListener('dragstart', e => {
    const k = e.target.closest?.('[data-g-arac]'); if (!k) return;
    surukleniyor = true; e.dataTransfer.setData('text/plain', k.dataset.gArac); e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => k.classList.add('suruklenen'), 0);
  });
  liste.addEventListener('dragover', e => {
    const kol = e.target.closest?.('[data-g-kol]'); if (!kol || !surukleniyor) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    liste.querySelectorAll('.araclar-g-kol.uzerinde').forEach(x => { if (x !== kol) x.classList.remove('uzerinde'); });
    kol.classList.add('uzerinde');
  });
  liste.addEventListener('dragleave', e => {
    const kol = e.target.closest?.('[data-g-kol]'); if (kol && !kol.contains(e.relatedTarget)) kol.classList.remove('uzerinde');
  });
  liste.addEventListener('drop', e => {
    const kol = e.target.closest?.('[data-g-kol]'); if (!kol || !surukleniyor) return;
    e.preventDefault(); kol.classList.remove('uzerinde');
    const id = Number(e.dataTransfer.getData('text/plain')); surukleniyor = false;
    if (id) sorumluDegistir(id, kol.dataset.gKol || null).finally(() => { if (yenileBekliyor) ciz(); });
  });
  liste.addEventListener('dragend', () => { surukleniyor = false; liste.querySelectorAll('.uzerinde, .suruklenen').forEach(x => x.classList.remove('uzerinde', 'suruklenen')); if (yenileBekliyor) ciz(); });
  const yanForm = kok.querySelector('[data-yan] form');
  if (yanForm) formBagla(yanForm, { tamam: a => yeniEklendi(a, yanForm) });
}

// ---------------------------------------------------------------- ekran modülü
export default {
  async render(hedef, param) {
    stilEkle();
    kok = hedef; acikArac = null; formKirli = false; surukleniyor = false; siraYaziliyor = false; yenileBekliyor = false;
    kok.innerHTML = iskeletHtml();
    sayfaBagla();
    ciz();
    const id = Number(param);
    if (id && store.araclar.has(id)) aracAc(id);
  },
  yenile() {
    if (!kok || !kok.isConnected) return;
    if (surukleniyor || siraYaziliyor) yenileBekliyor = true; else ciz();
    cekmeceYenile();
  },
  temizle() {
    kok = null; acikArac = null; formKirli = false; surukleniyor = false; siraYaziliyor = false; yenileBekliyor = false; durumMenu = false; sorumluMenu = false;
  },
};
