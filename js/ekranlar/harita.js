// 72. Komite · Seçim Masası · HARİTA (ATLAS, 2026-09-30 · Claude Design "SM Harita" tasarımı, Leaflet üzerinde)
// Sol 380px panel: ARAÇLAR / ROTALAR. Harita: kişi pinleri (gün rengi), araç ikonları (yön oku, plaka, konum yaşı),
// iz çizgileri (aracKonumlari), takip/odak aracın numaralı durakları + kalan rota (kesik kırmızı), FUAR İZMİR, Trafik, lejant, pin mini kartı.
// Canlı olaylarda harita baştan kurulmaz: pin, çizgi ve araç ikonları yerinde güncellenir (titreme yok).
// Başka ekrandan bağlantı: #harita/firma-<id> (pini açar) · #harita/arac-<id> (araca kilitlenir) · #harita/rota-<rota_kod>
// 2026-10-05: TAHMİNİ KONUM DAİRESİ (aracın nerede olabileceği, zamanla büyür, yeni konumla küçülür) + "Konum gir"
// (Admin / araç yöneticisi şoförün söylediği yeri haritaya dokunarak ya da yer adıyla girer). Bölüm: "tahmini konum dairesi".
import {
  store, bus, esc, fmt, trBaslik, trArama, VARIS, gecikme, firmaAdi, firmaListesi,
  aracKonumlari, aracKonum, firmaKonum, kalanSure, sayac, yazabilirMi,
  isaretleyebilirMi, karsiladim, referansBenMi, konumGonder, simdi,
} from '../core.js';
import { el, kisiKartiAc, toast } from '../ui.js';
import { anahtar, KOMITE } from '../komite.js';

// ---------------------------------------------------------------- sabitler
// ALTLIK: CARTO Positron / dark_all 2026-09-30 itibarıyla anahtar istiyor (her karo "API KEY REQUIRED" görseli). Anahtar gelene kadar
// altlık OpenStreetMap; tasarımdaki Google haritasının süzgeci (açık: doygunluk düşük, koyu: ters çevrilmiş) CSS ile uygulanır.
// Anahtarlı karo adresi alınırsa ayarlar.harita.karo_url (ve isteğe bağlı karo_url_koyu) yazılması yeter; harita onu süzgeçsiz kullanır.
const OSM_KARO = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATIF = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const ESKI_DK = 10;              // bu kadar dakikadır konum gelmeyen araç %45 opak + "konum eski"
const IZ_DK = 60;                // iz: son 60 dakika
const IZ_TAZELE_MS = 120000;     // izler 2 dakikada bir veritabanından tazelenir
const SURE_ARALIK_MS = 30000;    // takip edilen araç için kalan süre en çok 30 sn'de bir yenilenir (aynı konum/durak)
const SURE_EN_AZ_MS = 10000;     // konum değişse de iki hesap arası en az 10 sn
const FUARA_YAKIN = 0.02;        // derece: Fuar'a bu kadar yakın araç odakta değilse etiketsiz çizilir (tasarım)
const IZMIR = [38.418, 27.125];
const BEKLEYEN = ['bekliyor', 'arandi'];
const BITTI = ['fuarda', 'oy_kullandi'];
const SEKME_ANAHTAR = anahtar('secim-harita-sekme');
const GUNLER = [
  { k: 'bekliyor', ad: 'Bekliyor' }, { k: 'arandi', ad: 'Arandı' }, { k: 'yolda', ad: 'Yolda' },
  { k: 'fuarda', ad: 'Fuarda' }, { k: 'oy_kullandi', ad: 'Oy kullandı' },
];
const GUN_ETIKET = { bekliyor: 'Bekliyor', arandi: 'Arandı', yolda: 'Yolda', fuarda: 'Fuarda', oy_kullandi: '✓ OY KULLANDI' };
const GUN_RENK = { bekliyor: 'var(--ink-3)', arandi: 'var(--blue)', yolda: 'var(--amber)', fuarda: 'var(--violet)', oy_kullandi: 'var(--green)' };
const ARAC_ETIKET = { hazir: 'Hazır', yolda: 'Yolda', fuarda: 'Fuarda', mola: 'Mola', arizali: '✕ Arızalı' };
// tahmini konum dairesi: yarıçap = doğruluk (yoksa kaynağa göre taban) + geçen dakika × 500 m (30 km/sa), üst sınır 6 km
const DAIRE_TABAN_M = { gps: 50, sozlu: 800, ilce: 2500 };
const DAIRE_HIZ_M_DK = 500;
const DAIRE_TAVAN_M = 6000;
const DAIRE_ARALIK_MS = 15000;   // daireler 15 sn'de bir yeniden hesaplanır (sayfa yenilemeden büyür)
const YAKIN_M = 3000;            // merkezi Fuar'a bundan yakın araç "Fuar'a yaklaşıyor" (parlak vurgu)
const YAKIN_ETA_DK = 5;          // ya da tahmini varışı 5 dk ya da daha az
const BUYUMEYEN = ['fuarda', 'mola', 'arizali'];   // duran araçta daire büyümez, yaklaşma vurgusu yok
// Konum gir: yer adı araması (OpenStreetMap Nominatim, istemciden; saniyede en çok 1 istek, yalnız Bul'a basınca)
const YER_ARA_URL = 'https://nominatim.openstreetmap.org/search';
const IZMIR_KUTU = '26.20,39.45,28.55,37.75';   // İzmir ili: sol, üst, sağ, alt
const KG_DOGRULUK = [{ m: 300, ad: 'Tam yer' }, { m: 800, ad: 'Semt' }, { m: 2500, ad: 'İlçe' }];

// ---------------------------------------------------------------- ekran durumu
let L = null;                    // window.L (Leaflet 1.9.4)
let S = null;                    // açık ekranın durumu; temizle() ile null olur
let sonGorunum = null;           // ekrandan çıkıp dönünce harita aynı yerde açılsın
const gizliDurumlar = new Set(); // lejanttan gizlenen gün durumları (oturum boyunca)
const hafiza = { rota: null, arac: null, takip: null };

// ---------------------------------------------------------------- yardımcılar
const sayiMi = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const konumlu = f => sayiMi(f.lat) && sayiMi(f.lon);
const aracKonumlu = a => !!a && sayiMi(a.son_lat) && sayiMi(a.son_lon);
const koyuMu = () => document.documentElement.dataset.theme === 'dark';
const konumYasiDk = a => (a?.son_konum_zamani ? (Date.now() - new Date(a.son_konum_zamani).getTime()) / 60000 : Infinity);
const eskiMi = a => konumYasiDk(a) > ESKI_DK;
const temizAdres = a => String(a || '').replace(/İÇ KAPI NO\s*:?\s*\S+/gi, '').trim();
const telVar = t => !!(t && fmt.telLink(t));
const hedefArac = () => S.takip ?? S.odakArac;   // takip edilen ya da odaklanan araç
const soforKisa = ad => { const w = trBaslik(ad || '').trim().split(/\s+/).filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : (w[0] || ''); };
const kmYaz = km => String(km).replace('.', ',');
const mesafeM = (a, b) => Math.hypot((b[1] - a[1]) * 111320 * Math.cos(a[0] * Math.PI / 180), (b[0] - a[0]) * 111320);
const yonDerece = (a, b) => (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI + 360) % 360;
function varis() {
  const v = store.ayarlar.secim?.varis;
  return v && sayiMi(v.lat) && sayiMi(v.lon) ? { ad: VARIS.ad, lat: Number(v.lat), lon: Number(v.lon) } : VARIS;
}
function altlik() {
  const h = store.ayarlar.harita || {};
  if (h.karo_url) return { url: (koyuMu() && h.karo_url_koyu) || h.karo_url, atif: h.karo_atif || OSM_ATIF, suzgec: false };
  return { url: OSM_KARO, atif: OSM_ATIF, suzgec: true };
}
// tema ya da ayar değişince yalnız karo adresi/süzgeci değişir, harita yeniden kurulmaz
function altlikEsitle() {
  if (!S?.karo) return;
  const a = altlik();
  S.karo.getContainer()?.classList.toggle('harita-karo-suzgec', a.suzgec);
  if (a.url !== S.karoUrl) { S.karoUrl = a.url; S.karo.setUrl(a.url); }
}
function rotaParca(kod) {
  const i = String(kod).indexOf(' · ');
  return i > 0 ? { ref: trBaslik(kod.slice(0, i)), ad: kod.slice(i + 3) } : { ref: '', ad: String(kod) };
}
const siraKarsilastir = (a, b) => (a.rota_sira ?? 999) - (b.rota_sira ?? 999) || String(a.tasima_saati || '').localeCompare(String(b.tasima_saati || '')) || a.id - b.id;
const rotaDuraklari = kod => firmaListesi().filter(f => f.rota_kod === kod).sort(siraKarsilastir);
const aracDuraklari = id => firmaListesi().filter(f => f.arac_id === id)
  .sort((a, b) => (a.arac_sira ?? 999) - (b.arac_sira ?? 999) || String(a.tasima_saati || '').localeCompare(String(b.tasima_saati || '')) || siraKarsilastir(a, b));
const siradaki = d => d.find(f => BEKLEYEN.includes(f.durum)) || null;
// saha notu: kişinin notlarının son satırı ("[10:42 Ad Soyad] metin" -> metin + kim/ne zaman)
function sahaNotu(f) {
  const s = String(f.notlar || '').split('\n').map(x => x.trim()).filter(Boolean).pop();
  if (!s) return null;
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(s);
  return m ? { metin: m[2] || m[1], kim: m[2] ? m[1] : '' } : { metin: s, kim: '' };
}
// aynı kişi (2 oylu) tek numara alır; rota seçiliyken rota_sira, araç odağında duraklar sırası
function numaralandir(d, rotaSirasi) {
  const sira = new Map(), kisi = new Map(); let n = 0;
  for (const f of d) {
    const k = f.kisi_anahtar || `f${f.id}`;
    if (!kisi.has(k)) kisi.set(k, rotaSirasi && f.rota_sira != null ? f.rota_sira : ++n);
    sira.set(f.id, kisi.get(k));
  }
  return sira;
}
function rotalariTopla() {
  const m = new Map();
  for (const f of store.firmalar.values()) {
    if (!f.rota_kod) continue;
    let l = m.get(f.rota_kod); if (!l) m.set(f.rota_kod, l = []); l.push(f);
  }
  const liste = [];
  for (const [kod, duraklar] of m) {
    duraklar.sort(siraKarsilastir);
    const saatler = duraklar.map(f => f.tasima_saati).filter(Boolean).sort();
    const ilceHam = duraklar.find(f => f.rota_ilceler)?.rota_ilceler || [...new Set(duraklar.map(f => f.ilce).filter(Boolean))].join(' / ');
    const aracId = duraklar.find(f => f.arac_id)?.arac_id;
    liste.push({
      kod, ...rotaParca(kod), duraklar, ilkSaat: saatler[0] || null, ilceler: trBaslik(ilceHam),
      ulasan: duraklar.filter(f => BITTI.includes(f.durum)).length,
      arac: aracId ? store.araclar.get(aracId) : null,
      arama: trArama([kod, ilceHam, ...duraklar.flatMap(f => [f.yetkili, f.unvan, f.ilce])].join(' ')),
    });
  }
  return liste.sort((a, b) => (a.ilkSaat ? 0 : 1) - (b.ilkSaat ? 0 : 1)
    || String(a.ilkSaat || '').localeCompare(String(b.ilkSaat || ''))
    || a.kod.localeCompare(b.kod, 'tr', { numeric: true }));
}
// aracın duraklarındaki en sık rota
function aracRotaYazi(d) {
  if (!d.length) return 'Atanmamış · boşta';
  const say = new Map(); d.forEach(f => { if (f.rota_kod) say.set(f.rota_kod, (say.get(f.rota_kod) || 0) + 1); });
  const s = [...say.entries()].sort((a, b) => b[1] - a[1]);
  if (!s.length) return `${d.length} durak · rota yok`;
  const p = rotaParca(s[0][0]); const ilce = S.rotaMap.get(s[0][0])?.ilceler;
  return `${p.ad}${p.ref ? ' · ' + p.ref : ''}${ilce ? ' · ' + ilce : ''}${s.length > 1 ? ` (+${s.length - 1} rota)` : ''}`;
}
const sureYazi = s => (s ? `~${s.dk} dk · ${kmYaz(s.km)} km` : 'alınamadı');

// ---------------------------------------------------------------- tahmini konum dairesi
// Şoför konumunu söyleyince ya da telefon GPS'i gelince aracın ŞU AN nerede olabileceği bir daireyle gösterilir.
// Yarıçap = son konumun doğruluğu (araclar.son_dogruluk; yoksa kaynağa göre GPS 50 m, sözlü 800 m, ilçe 2,5 km)
//         + son konumdan beri geçen dakika × 500 m (30 km/sa varsayımı), üst sınır 6 km.
// Merkez son bilinen konumda kalır: aracın Fuar'a doğru ilerlediği VARSAYILMAZ, daire yalnız büyür; yeni konum gelince küçülür.
// Fuarda, molada ya da arızalı araçta büyüme yok. Sözlü / ilçe kaynaklı daire kesik çizgili, GPS ince.
// Renk token'dan (--red): 72'de kırmızı, 26-27'de turkuaz. Fuar'a yaklaşan araç --marka-parlak ile parlar.
const metreYaz = m => {
  if (!Number.isFinite(m)) return '?';
  if (m < 1000) return `${m < 100 ? Math.round(m) : Math.round(m / 10) * 10} m`;
  return `${kmYaz((m / 1000).toFixed(1).replace(/\.0$/, ''))} km`;
};
const konumGirebilir = () => !!KOMITE.konumGir && ['yonetici', 'arac_yoneticisi'].includes(store.ben?.rol);
function konumKaynagi(a) {
  const k = trArama(a?.konum_kaynak || a?.son_konum_kaynak || 'telefon');
  if (k === 'telefon' || k === 'gps') return { tur: 'gps', yazi: 'GPS' };
  if (k === 'ilce') return { tur: 'ilce', yazi: 'şoför söyledi (ilçe)' };
  if (k === 'elle') return { tur: 'sozlu', yazi: 'haritada işaretlendi' };
  return { tur: 'sozlu', yazi: 'şoför söyledi' };
}
// doğruluk: araclar.son_dogruluk (26-27 şeması); yoksa (72) izin son satırı aynı konumsa onun doğruluğu
function aracDogruluk(a) {
  if (sayiMi(a.son_dogruluk)) return Number(a.son_dogruluk);
  const son = S?.izler.get(a.id)?.son;
  if (son && sayiMi(son.dogruluk) && a.son_konum_zamani && Math.abs(new Date(son.zaman) - new Date(a.son_konum_zamani)) < 5000) return Number(son.dogruluk);
  return null;
}
// tahmini varış: eta_zaman (yazıldığı anda now()+eta_dk) varsa ondan kalan dakika; çok eskiyse yok sayılır
function kalanEtaDk(a) {
  if (a.eta_zaman) { const d = (new Date(a.eta_zaman).getTime() - Date.now()) / 60000; return Number.isFinite(d) && d > -10 ? Math.max(0, Math.round(d)) : null; }
  return sayiMi(a.eta_dk) ? Number(a.eta_dk) : null;
}
const fuaraMesafeM = a => { const v = varis(); return mesafeM([Number(a.son_lat), Number(a.son_lon)], [v.lat, v.lon]); };
function fuaraYaklasiyor(a) {
  if (!aracKonumlu(a) || BUYUMEYEN.includes(a.durum)) return false;
  if (fuaraMesafeM(a) < YAKIN_M) return true;
  const eta = kalanEtaDk(a); return eta != null && eta <= YAKIN_ETA_DK;
}
function daireBilgi(a) {
  const kaynak = konumKaynagi(a);
  const dogruluk = aracDogruluk(a);
  const taban = Math.max(10, dogruluk ?? DAIRE_TABAN_M[kaynak.tur]);
  const yas = konumYasiDk(a);
  const buyume = BUYUMEYEN.includes(a.durum) ? 0 : Number.isFinite(yas) ? DAIRE_HIZ_M_DK * Math.max(0, yas) : Infinity;
  const r = Math.min(DAIRE_TAVAN_M, taban + buyume);
  return { kaynak, dogruluk, taban, r: Math.round(r), tavan: r >= DAIRE_TAVAN_M, yakin: fuaraYaklasiyor(a) };
}
// "~4 dk kaldı" ya da "2,1 km kaldı" (tahmini varış yoksa kuş uçuşu uzaklık)
function yaklasanMetni(a) {
  const eta = kalanEtaDk(a);
  return eta != null ? `~${eta} dk kaldı` : `${metreYaz(fuaraMesafeM(a))} kaldı`;
}
// konumun saati uygulama saatine göre (?saat= provasında da tutarlı; normalde son_konum_zamani'nın kendisi)
const konumSaati = a => (a.son_konum_zamani ? fmt.saat(new Date(simdi().getTime() - (Date.now() - new Date(a.son_konum_zamani).getTime()))) : 'saat ?');
function dairePopupHtml(id) {
  const a = store.araclar.get(id);
  if (!a || !aracKonumlu(a)) return '<div class="hp"><div class="hp-zayif">Bu araçtan konum yok.</div></div>';
  const b = daireBilgi(a);
  const saat = konumSaati(a);
  const yas = a.son_konum_zamani ? fmt.goreli(a.son_konum_zamani) : 'zamanı bilinmiyor';
  const ana = `Tahmini konum · ${b.kaynak.yazi} ${saat} · ±${metreYaz(b.taban)} · ${yas}`;
  const buyudu = BUYUMEYEN.includes(a.durum) ? 'Araç duruyor, daire büyümüyor.'
    : b.r > b.taban + 5 ? `Daire şimdi ±${metreYaz(b.r)}${b.tavan ? ' (üst sınır)' : ''}. Son konumdan beri dakikada 500 m büyüyor, yeni konum gelince küçülür.` : '';
  return `<div class="hp">
    <div class="hp-ust"><div class="hp-baslik"><div class="hp-ad">${esc(fmt.plaka(a.plaka))}</div><div class="hp-firma">${esc(soforKisa(a.sofor_ad) || 'Şoför yok')} · ${esc(ARAC_ETIKET[a.durum] || a.durum || '')}</div></div><button type="button" class="hp-kapat" data-pop-kapat aria-label="Kapat">×</button></div>
    <div class="hd-ana">${esc(ana)}</div>
    ${a.konum_metni ? `<div class="hp-not hd-metin">“${esc(a.konum_metni)}”</div>` : ''}
    ${b.yakin ? `<div class="hp-not hd-yakin"><b>Fuar'a yaklaşıyor</b> · ${esc(yaklasanMetni(a))}</div>` : ''}
    ${buyudu ? `<div class="hp-zayif">${esc(buyudu)}</div>` : ''}
    ${konumGirebilir() ? `<div class="hp-eylem"><button type="button" class="hp-kart" data-konum-gir="${a.id}">Yeni konum gir</button></div>` : ''}
  </div>`;
}
// daireler yerinde güncellenir (yarıçap, merkez, sınıf); konumu olmayan aracın dairesi kalkar
function dairelerEsitle() {
  const gorulen = new Set(); let yaklasan = false;
  for (const a of store.araclar.values()) {
    if (!aracKonumlu(a)) continue;
    gorulen.add(a.id);
    const b = daireBilgi(a); const ll = [Number(a.son_lat), Number(a.son_lon)];
    if (b.yakin) yaklasan = true;
    let d = S.daireler.get(a.id);
    if (!d) {
      const id = a.id;
      const c = L.circle(ll, { radius: b.r, className: 'harita-daire', interactive: true, bubblingMouseEvents: true });
      d = { c, r: b.r, cls: '', popupHtml: '' };
      c.bindPopup(() => (d.popupHtml = dairePopupHtml(id)), { ...POPUP_SECENEK, offset: [0, -2] });
      S.katman.daire.addLayer(c); c.bringToBack();   // iz ve rota çizgileri dairenin üstünde kalsın
      S.daireler.set(a.id, d);
    } else {
      const e = d.c.getLatLng(); if (e.lat !== ll[0] || e.lng !== ll[1]) d.c.setLatLng(ll);
      if (d.r !== b.r) { d.r = b.r; d.c.setRadius(b.r); }
    }
    const cls = `k-${b.kaynak.tur}${b.yakin ? ' yakin' : ''}${b.tavan ? ' tavan' : ''}${hedefArac() === a.id ? ' odak' : ''}`;
    const pe = d.c.getElement();
    if (pe && d.cls !== cls) { pe.setAttribute('class', `harita-daire leaflet-interactive ${cls}`); d.cls = cls; }
    if (d.c.isPopupOpen()) { const h = dairePopupHtml(a.id); if (h !== d.popupHtml) { d.popupHtml = h; popupIcerik(d.c, h); } }
  }
  for (const [id, d] of S.daireler) if (!gorulen.has(id)) { S.katman.daire.removeLayer(d.c); S.daireler.delete(id); }
  S.yaklasanVar = yaklasan;
}

// ---------------------------------------------------------------- popup ve ipucu içerikleri
function ipucuHtml(id) {
  const f = store.firmalar.get(id); if (!f) return '';
  return `<b>${esc(firmaAdi(f))}</b>${f.tasima_saati ? ` · ${esc(fmt.saatKisa(f.tasima_saati))}` : ''}<span>${esc(GUN_ETIKET[f.durum] || f.durum)}${gecikme(f) ? ` · ${gecikme(f)} dk gecikti` : ''}</span>`;
}
// tasarımdaki pin mini kartı: ad + firma, gün rozeti, saat · ilçe, saha/alma notu, Kartı aç · Ara · Yol
function kisiPopupHtml(id) {
  const f = store.firmalar.get(id); if (!f) return '<div class="hp">Kayıt bulunamadı</div>';
  const g = gecikme(f); const not = sahaNotu(f); const tel = [f.cep, f.cep2].find(telVar);
  return `<div class="hp">
    <div class="hp-ust"><div class="hp-baslik"><div class="hp-ad">${esc(firmaAdi(f) || '(yetkili yok)')}</div><div class="hp-firma">${esc(f.unvan || '')}</div></div><button type="button" class="hp-kapat" data-pop-kapat aria-label="Kapat">×</button></div>
    <div class="hp-rozet"><span class="hr hr-${esc(f.durum)}">${esc(GUN_ETIKET[f.durum] || f.durum)}</span>${g ? `<span class="hr hr-gec" title="${g} dk gecikti">◷ GECİKTİ</span>` : ''}<span class="hp-saat">${f.tasima_saati ? esc(fmt.saatKisa(f.tasima_saati)) : 'Saat belirsiz'}${f.ilce ? ` · ${esc(trBaslik(f.ilce))}` : ''}</span></div>
    ${karsilamaHtml(f)}
    ${not ? `<div class="hp-not hp-saha"><b>Saha notu:</b> ${esc(not.metin)}${not.kim ? ` <span>${esc(not.kim)}</span>` : ''}</div>` : ''}
    ${f.alma_notu ? `<div class="hp-not hp-alma"><b>Alma notu:</b> ${esc(f.alma_notu)}</div>` : ''}
    <div class="hp-eylem">
      <button type="button" class="hp-kart" data-kart="${f.id}">Kartı aç</button>
      ${tel ? `<a class="hp-bag" href="${fmt.telLink(tel)}">📞 Ara</a>` : '<span class="hp-bag yok">📞 Ara</span>'}
      ${f.adres || konumlu(f) ? `<a class="hp-bag" target="_blank" rel="noopener" href="${fmt.mapsLink(f.adres || `${f.lat},${f.lon}`)}">📍 Yol</a>` : ''}
    </div>
  </div>`;
}
// referans (kişiyi tanıyan yönetim kurulu üyesi) ya da başkası karşılar: "Karşılayan: Ad · saat" ya da "Karşıladım" düğmesi
function karsilamaHtml(f) {
  if (f.karsilayan) {
    return `<div class="hp-not hp-karsi">Karşılayan: <b>${esc(trBaslik(f.karsilayan))}</b>${f.karsilama_zamani ? ` · ${esc(fmt.saat(f.karsilama_zamani))}` : ''}</div>`;
  }
  if (!['yolda', 'fuarda', 'oy_kullandi'].includes(f.durum)) return '';
  const ref = f.referans ? ` <span>referans: ${esc(trBaslik(f.referans))}</span>` : '';
  return `<div class="hp-not hp-karsi hp-karsi-yok"><span>Henüz karşılanmadı</span>${ref}${isaretleyebilirMi(f) ? `<button type="button" class="hp-karsila" data-karsila="${f.id}">${referansBenMi(f) ? 'Karşıladım' : 'Ben karşıladım'}</button>` : ''}</div>`;
}
function varisPopupHtml() {
  const v = varis(); const s = sayac(); const z = store.ayarlar.zaman || {};
  const duraklar = firmaListesi().filter(konumlu); const ulasan = duraklar.filter(f => BITTI.includes(f.durum)).length;
  return `<div class="hp">
    <div class="hp-ust"><div class="hp-baslik"><div class="hp-ad">FUAR İZMİR</div><div class="hp-firma">${esc(v.ad)}${z.bas && z.bit ? ` · oy verme ${esc(z.bas)}-${esc(z.bit)}` : ''}</div></div><button type="button" class="hp-kapat" data-pop-kapat aria-label="Kapat">×</button></div>
    <div class="hp-sayilar">
      <div><b>${fmt.sayi(s.fuarda)}</b><span>Fuarda</span></div>
      <div><b>${fmt.sayi(s.oy_kullandi)}</b><span>Oy kullandı</span></div>
      <div><b>${fmt.sayi(s.yolda)}</b><span>Yolda</span></div>
    </div>
    ${duraklar.length ? `<div class="hp-zayif">Servis durakları: ${ulasan}/${duraklar.length} fuara ulaştı</div>` : ''}
    <div class="hp-eylem"><a class="hp-bag" target="_blank" rel="noopener" href="${fmt.mapsLink(v.ad + ', İzmir')}">📍 Yol tarifi</a></div>
  </div>`;
}
// açık popup'ın içeriğini yerinde değiştir (popup.update() haritayı kaydırabildiği için kullanılmaz)
function popupIcerik(isaret, html) {
  const ic = isaret.getPopup()?.getElement()?.querySelector('.leaflet-popup-content');
  if (ic) ic.innerHTML = html;
}

// ---------------------------------------------------------------- işaretler: pin, araç, varış
const POPUP_SECENEK = { className: 'harita-popup', closeButton: false, minWidth: 244, maxWidth: 244, offset: [0, -12], autoPanPaddingTopLeft: [24, 64], autoPanPaddingBottomRight: [24, 48] };
function pinKur(f) {
  const id = f.id;
  const m = L.marker([Number(f.lat), Number(f.lon)], {
    icon: L.divIcon({ className: 'hp-kap', html: '<div class="hpin"><span></span><i class="w">!</i></div>', iconSize: [0, 0], iconAnchor: [0, 0] }),
    keyboard: false, riseOnHover: true,
  });
  const p = { m, z: 0, cls: '', no: '', popupHtml: '' };
  m.bindTooltip(() => ipucuHtml(id), { direction: 'top', offset: [0, -12], className: 'harita-ipucu', opacity: 1 });
  m.bindPopup(() => (p.popupHtml = kisiPopupHtml(id)), POPUP_SECENEK);
  m.on('popupopen', () => { if (!S) return; m.closeTooltip(); S.seciliKisi = id; esitle(); });
  m.on('popupclose', () => { if (!S) return; if (S.seciliKisi === id) S.seciliKisi = null; esitle(); });
  return p;
}
function aracKur(a) {
  const id = a.id;
  const m = L.marker([Number(a.son_lat), Number(a.son_lon)], {
    icon: L.divIcon({
      className: 'ha-kap', iconSize: [0, 0], iconAnchor: [0, 0],
      html: `<div class="harita-arac"><div class="ha-etiket"><span class="ha-plaka"><i></i><b></b></span><span class="ha-sofor"></span></div><div class="ha-ikon"><span class="ha-ok">▲</span></div><div class="ha-yas"></div></div>`,
    }),
    zIndexOffset: 1000, keyboard: false,
  });
  const k = { m, z: 1000, cls: '', yon: null, r: null };
  m.on('click', () => aracHaritadanSec(id));
  S.katman.arac.addLayer(m);
  const e = m.getElement()?.firstElementChild;
  if (e) k.r = { e, plaka: e.querySelector('.ha-plaka b'), sofor: e.querySelector('.ha-sofor'), yas: e.querySelector('.ha-yas'), ok: e.querySelector('.ha-ok') };
  return k;
}
function aracIkonGuncelle(k, a) {
  if (!k.r) { const e = k.m.getElement()?.firstElementChild; if (!e) return; k.r = { e, plaka: e.querySelector('.ha-plaka b'), sofor: e.querySelector('.ha-sofor'), yas: e.querySelector('.ha-yas'), ok: e.querySelector('.ha-ok') }; }
  const { e, plaka, sofor, yas, ok } = k.r; const v = varis();
  const eski = eskiMi(a), odak = hedefArac() === a.id;
  const yakin = Math.hypot(Number(a.son_lat) - v.lat, Number(a.son_lon) - v.lon) < FUARA_YAKIN;
  const yaklasan = fuaraYaklasiyor(a);   // Fuar'a yaklaşan (duran değil): etiketi görünür, parlak halka
  const etiketli = odak || !!S.takip || !yakin || yaklasan;
  const cls = `harita-arac st-${a.durum || 'hazir'}${eski ? ' eski' : ''}${odak ? ' odak' : ''}${etiketli ? '' : ' etiketsiz'}${yaklasan ? ' yakin' : ''}`;
  if (e.className !== cls) e.className = cls;
  const yasYazi = eski ? `konum eski · ${fmt.goreli(a.son_konum_zamani)}` : fmt.goreli(a.son_konum_zamani);
  const pl = fmt.plaka(a.plaka), so = soforKisa(a.sofor_ad), ya = yaklasan ? `Fuar'a ${yaklasanMetni(a).replace(' kaldı', '')} · ${yasYazi}` : yasYazi;
  if (plaka.textContent !== pl) plaka.textContent = pl;
  if (sofor.textContent !== so) sofor.textContent = so;
  if (yas.textContent !== ya) yas.textContent = ya;
  const okYazi = k.yon == null ? '●' : '▲';
  if (ok.textContent !== okYazi) ok.textContent = okYazi;
  ok.classList.toggle('yon-yok', k.yon == null);
  const dn = k.yon == null ? 'none' : `rotate(${Math.round(k.yon)}deg)`;
  if (ok.style.transform !== dn) ok.style.transform = dn;
  const z = odak ? 3000 : 1000;
  if (k.z !== z) { k.z = z; k.m.setZIndexOffset(z); }
}
// araç yeni konuma kayarak gider (yakınlaştırmada geçiş kapalı)
function aracKaydir(k, ll) {
  const e = k.m.getElement();
  if (e && !S.yakinlasiyor) { e.classList.add('kayiyor'); clearTimeout(k.kayZaman); k.kayZaman = setTimeout(() => e.classList.remove('kayiyor'), 1100); }
  k.m.setLatLng(ll);
}
function varisKur() {
  const v = varis();
  S.varisM = L.marker([v.lat, v.lon], {
    icon: L.divIcon({ className: 'hv-kap', iconSize: [0, 0], iconAnchor: [0, 0], html: `<div class="harita-varis"><div class="hv-ikon">⚑</div><div class="hv-etiket"><b>FUAR İZMİR</b><span>Varış · Gaziemir</span></div></div>` }),
    zIndexOffset: 500, keyboard: false, riseOnHover: false,
  }).addTo(S.map);
  S.varisM.bindPopup(() => (S.varisHtml = varisPopupHtml()), { ...POPUP_SECENEK, offset: [0, -14] });
}

// ---------------------------------------------------------------- canlı eşitleme (baştan kurmadan)
// odak kümesi: araç odağında aracın duraklarının hepsi (numaralı), rota seçiliyken rotanın durakları; yoksa hepsi
function kumeHesapla() {
  const aid = hedefArac();
  if (aid && store.araclar.has(aid)) { const d = aracDuraklari(aid); return { tur: 'arac', d, sira: numaralandir(d, false) }; }
  if (S.seciliRota) { const d = rotaDuraklari(S.seciliRota); if (d.length) return { tur: 'rota', d, sira: numaralandir(d, true) }; }
  return null;
}
function esitle() {
  if (!S || S.esitliyor) return;   // popup kapanırken tetiklenen iç içe çağrı sonsuz döngü yapmasın
  S.esitliyor = true;
  try { esitleIc(); } finally { if (S) S.esitliyor = false; }
}
function esitleIc() {
  // odak temizliği (silinen araç / boşalan rota)
  if (S.odakArac && !store.araclar.has(S.odakArac)) S.odakArac = null;
  if (S.takip && !store.araclar.has(S.takip)) S.takip = null;
  if (S.seciliRota && !firmaListesi().some(f => f.rota_kod === S.seciliRota)) S.seciliRota = null;
  const kume = kumeHesapla();
  pinleriEsitle(kume);
  aracleriEsitle();
  dairelerEsitle();
  cizgileriEsitle(kume);
  if (S.varisM) {
    const v = varis(); const e = S.varisM.getLatLng();
    if (e.lat !== v.lat || e.lng !== v.lon) S.varisM.setLatLng([v.lat, v.lon]);
    if (S.varisM.isPopupOpen()) { const h = varisPopupHtml(); if (h !== S.varisHtml) { S.varisHtml = h; popupIcerik(S.varisM, h); } }
  }
  altlikEsitle();
  lejantCiz(); panelCiz(); trafikCiz(); takipCiz();
  sureTazele(); izleriTazele();
  // veri ekran açıldıktan sonra geldiyse (ilk yükleme) haritayı bir kez duraklara sığdır
  if (!S.sigdi && S.pinler.size) { S.sigdi = true; tumunuGoster(false, { cekirdek: true }); }
  hafiza.rota = S.seciliRota; hafiza.arac = S.odakArac; hafiza.takip = S.takip;
}
function pinleriEsitle(kume) {
  const gorulen = new Set();
  for (const f of store.firmalar.values()) {
    if (!konumlu(f)) continue;
    gorulen.add(f.id);
    let p = S.pinler.get(f.id);
    const ll = [Number(f.lat), Number(f.lon)];
    if (!p) { p = pinKur(f); S.pinler.set(f.id, p); }
    else { const e = p.m.getLatLng(); if (e.lat !== ll[0] || e.lng !== ll[1]) p.m.setLatLng(ll); }
    const gorunur = !gizliDurumlar.has(f.durum) && (!kume || kume.sira.has(f.id));
    const var_ = S.katman.pin.hasLayer(p.m);
    if (gorunur && !var_) { S.katman.pin.addLayer(p.m); p.cls = ''; p.no = ''; }   // yeniden eklenince ikon DOM'u yeni kurulur
    else if (!gorunur && var_) { if (p.m.isPopupOpen()) p.m.closePopup(); S.katman.pin.removeLayer(p.m); }
    if (gorunur) pinIkonGuncelle(p, f, kume?.sira.get(f.id));
    if (p.m.isPopupOpen()) { const h = kisiPopupHtml(f.id); if (h !== p.popupHtml) { p.popupHtml = h; popupIcerik(p.m, h); } }
  }
  for (const [id, p] of S.pinler) if (!gorulen.has(id)) { S.katman.pin.removeLayer(p.m); S.pinler.delete(id); }
}
function pinIkonGuncelle(p, f, no) {
  const d = p.m.getElement()?.firstElementChild; if (!d) return;
  const buyuk = no != null, gec = gecikme(f) > 0, on = S.seciliKisi === f.id;
  const cls = `hpin g-${f.durum}${buyuk ? ' b' : on ? ' on' : ''}${gec ? ' gec' : ''}${BITTI.includes(f.durum) && !buyuk ? ' bit' : ''}${sahaNotu(f) ? ' uyari' : ''}`;
  if (p.cls !== cls) { p.cls = cls; d.className = cls; }
  const t = buyuk ? String(no) : '';
  if (p.no !== t) { p.no = t; d.firstElementChild.textContent = t; }
  const z = on ? 900 : buyuk ? 600 : gec ? 300 : 0;
  if (p.z !== z) { p.z = z; p.m.setZIndexOffset(z); }
}
function aracleriEsitle() {
  const gorulen = new Set();
  for (const a of store.araclar.values()) {
    if (!aracKonumlu(a)) continue;
    gorulen.add(a.id);
    const ll = [Number(a.son_lat), Number(a.son_lon)];
    let k = S.aracM.get(a.id);
    if (!k) { k = aracKur(a); S.aracM.set(a.id, k); }
    else {
      const e = k.m.getLatLng();
      if (e.lat !== ll[0] || e.lng !== ll[1]) {
        const onceki = [e.lat, e.lng];
        aracKaydir(k, ll);
        if (S.takip === a.id) S.map.panTo(ll, { animate: true, duration: 0.8 });
        const iz = S.izler.get(a.id);
        if (iz) { const son = iz.ll[iz.ll.length - 1]; if (!son || son[0] !== ll[0] || son[1] !== ll[1]) { iz.ll.push(ll); izCiz(a.id); } }
        if (mesafeM(onceki, ll) > 15) k.yon = yonDerece(onceki, ll);
      }
    }
    aracIkonGuncelle(k, a);
  }
  for (const [id, k] of S.aracM) if (!gorulen.has(id)) { clearTimeout(k.kayZaman); S.katman.arac.removeLayer(k.m); S.aracM.delete(id); }
}
// kalan rota (kesik kırmızı): araç odağında aracın konumu + alınmamış duraklar + Fuar; rota seçiliyken rotanın duraklarından Fuar'a
function cizgileriEsitle(kume) {
  const v = varis(); let ll = null;
  if (kume?.tur === 'arac') {
    const a = store.araclar.get(hedefArac());
    const kalan = kume.d.filter(f => BEKLEYEN.includes(f.durum) && konumlu(f)).map(f => [Number(f.lat), Number(f.lon)]);
    ll = [...(aracKonumlu(a) ? [[Number(a.son_lat), Number(a.son_lon)]] : []), ...kalan, [v.lat, v.lon]];
  } else if (kume?.tur === 'rota') {
    ll = [...kume.d.filter(konumlu).map(f => [Number(f.lat), Number(f.lon)]), [v.lat, v.lon]];
  }
  if (!ll || ll.length < 2) { if (S.kalanCizgi && S.katman.rota.hasLayer(S.kalanCizgi)) S.katman.rota.removeLayer(S.kalanCizgi); S.kalanImza = ''; return; }
  const imza = ll.join(';');
  if (!S.kalanCizgi) S.kalanCizgi = L.polyline(ll, { className: 'harita-kalan', interactive: false, lineJoin: 'round', lineCap: 'round' });
  else if (imza !== S.kalanImza) S.kalanCizgi.setLatLngs(ll);
  S.kalanImza = imza;
  if (!S.katman.rota.hasLayer(S.kalanCizgi)) S.katman.rota.addLayer(S.kalanCizgi);
}

// ---------------------------------------------------------------- iz çizgileri (aracKonumlari) ve yön
function izleriTazele() {
  for (const a of store.araclar.values()) {
    if (!aracKonumlu(a)) continue;
    const iz = S.izler.get(a.id);
    if (!iz || (!iz.bekle && Date.now() - iz.cek > IZ_TAZELE_MS)) izCek(a.id);
  }
  for (const [id, iz] of S.izler) if (iz.cizgi) iz.cizgi.getElement()?.classList.toggle('odak', hedefArac() === id);
}
async function izCek(id) {
  const s = S; if (!s) return;
  let iz = s.izler.get(id); if (!iz) s.izler.set(id, iz = { ll: [], cizgi: null, cek: 0, bekle: false });
  if (iz.bekle) return; iz.bekle = true;
  try {
    const satirlar = await aracKonumlari(id, IZ_DK);
    if (S !== s) return;
    iz.ll = satirlar.filter(n => sayiMi(n.lat) && sayiMi(n.lon)).map(n => [Number(n.lat), Number(n.lon)]);
    iz.son = satirlar[satirlar.length - 1] || null;   // son satırın doğruluğu: araclar.son_dogruluk yoksa daire tabanı
  } catch (e) { console.warn('iz', e); }
  finally { iz.bekle = false; iz.cek = Date.now(); }
  if (S !== s) return;
  izCiz(id);
  const k = s.aracM.get(id);
  if (k) { const y = izYonu(id); if (y != null) k.yon = y; const a = store.araclar.get(id); if (a) aracIkonGuncelle(k, a); }
}
function izCiz(id) {
  const iz = S.izler.get(id); const a = store.araclar.get(id); if (!iz) return;
  const ll = iz.ll.slice();
  if (aracKonumlu(a)) { const s = [Number(a.son_lat), Number(a.son_lon)]; const son = ll[ll.length - 1]; if (!son || son[0] !== s[0] || son[1] !== s[1]) ll.push(s); }
  if (ll.length < 2) { if (iz.cizgi) { S.katman.iz.removeLayer(iz.cizgi); iz.cizgi = null; } return; }
  if (!iz.cizgi) { iz.cizgi = L.polyline(ll, { className: 'harita-iz', interactive: false, lineJoin: 'round', lineCap: 'round' }); S.katman.iz.addLayer(iz.cizgi); }
  else iz.cizgi.setLatLngs(ll);
  iz.cizgi.getElement()?.classList.toggle('odak', hedefArac() === id);
}
// hareket yönü: izin sonundan, son konumdan en az 15 m uzaktaki noktaya göre
function izYonu(id) {
  const iz = S.izler.get(id); if (!iz || iz.ll.length < 2) return null;
  const son = iz.ll[iz.ll.length - 1];
  for (let i = iz.ll.length - 2; i >= 0; i--) if (mesafeM(iz.ll[i], son) > 15) return yonDerece(iz.ll[i], son);
  return null;
}

// ---------------------------------------------------------------- takip edilen araç: sıradaki durağa ve Fuar'a kalan süre
function sureTazele() {
  const id = S.takip;
  if (!id) { S.sure = null; return; }
  const a = store.araclar.get(id); const poz = aracKonum(a);
  if (!poz || S.sureBekle) return;
  const nx = siradaki(aracDuraklari(id)); const nxKonum = nx && konumlu(nx) ? firmaKonum(nx) : null;
  const imza = [Number(poz.lat).toFixed(3), Number(poz.lon).toFixed(3), nx?.id ?? '-'].join(',');
  const s = S.sure; const yas = s && s.aracId === id ? Date.now() - s.t : Infinity;
  if (yas < SURE_EN_AZ_MS || (s?.imza === imza && s.aracId === id && yas < SURE_ARALIK_MS)) return;
  const sn = S; S.sureBekle = true;
  const kendi = { lat: Number(poz.lat), lon: Number(poz.lon) };
  const v = varis();
  Promise.all([nxKonum ? kalanSure(kendi, { lat: Number(nxKonum.lat), lon: Number(nxKonum.lon) }) : null, kalanSure(kendi, { lat: v.lat, lon: v.lon })]).then(([sonraki, fuar]) => {
    if (S !== sn) return;
    sn.sure = { aracId: id, imza, t: Date.now(), sonraki, fuar, nx: !!nx, nxAd: nx ? firmaAdi(nx) : '' };
    sn.sureBekle = false; panelCiz(); takipCiz();
  }).catch(() => { if (S === sn) { sn.sureBekle = false; sn.sure = { aracId: id, imza, t: Date.now(), sonraki: null, fuar: null, nx: !!nx, nxAd: '' }; panelCiz(); takipCiz(); } });
}

// ---------------------------------------------------------------- seçimler: rota, kişi, araç, takip
function sigdir(noktalar, animate = true) {
  if (!noktalar.length) return;
  if (noktalar.length === 1) { S.map.setView(noktalar[0], Math.max(S.map.getZoom(), 15), { animate }); return; }
  S.map.fitBounds(L.latLngBounds(noktalar), { paddingTopLeft: [40, 70], paddingBottomRight: [40, 80], maxZoom: 15, animate });
}
function tumNoktalar() {
  const n = firmaListesi().filter(f => konumlu(f) && !gizliDurumlar.has(f.durum)).map(f => [Number(f.lat), Number(f.lon)]);
  for (const a of store.araclar.values()) if (aracKonumlu(a)) n.push([Number(a.son_lat), Number(a.son_lon)]);
  const v = varis(); n.push([v.lat, v.lon]);
  return n;
}
function tumunuGoster(animate = true, { cekirdek = false } = {}) {
  let n = tumNoktalar();
  // ilk açılışta şehir çekirdeği: Fuar'a 30 km'den uzak tek tük duraklar (Çeşme, Urla) haritayı küçültmesin; "Tümünü göster" hepsini gösterir
  if (cekirdek && n.length > 4) {
    const v = L.latLng(varis().lat, varis().lon);
    const yakin = n.filter(x => v.distanceTo(x) <= 30000);
    if (yakin.length >= n.length * 0.8) n = yakin;
  }
  if (n.length > 1) sigdir(n, animate); else S.map.setView(n[0] || IZMIR, 11, { animate });
}
function odagiTemizle() {
  S.odakArac = null; S.takip = null; S.seciliRota = null; S.map.closePopup();
}
function tumunuGosterDugmesi() { odagiTemizle(); esitle(); tumunuGoster(true, { cekirdek: true }); }
function rotaSec(kod, { toggle = true, yakinlas = true } = {}) {
  S.takip = null; S.odakArac = null;
  if (toggle && S.seciliRota === kod) S.seciliRota = null;
  else S.seciliRota = kod;
  S.map.closePopup();
  if (S.seciliRota && S.sekme !== 'rotalar') sekmeYap('rotalar');
  esitle();
  if (S.seciliRota) {
    if (yakinlas) sigdir(rotaDuraklari(kod).filter(konumlu).map(f => [Number(f.lat), Number(f.lon)]));
    satirGoster(S.seciliRota);
  }
}
// seçilen rota satırı ve açılan durak listesi panelde görünür olsun (gerekirse en az kaydırmayla)
function satirGoster(kod) {
  const satir = S.liste.querySelector(`[data-rota="${CSS.escape(kod)}"]`); if (!satir) return;
  const duraklar = satir.nextElementSibling?.classList.contains('hk-duraklar') ? satir.nextElementSibling : null;
  const l = S.liste.getBoundingClientRect(), ust = satir.getBoundingClientRect().top, alt = (duraklar || satir).getBoundingClientRect().bottom;
  let d = 0;
  if (alt > l.bottom - 6) d = alt - l.bottom + 6;
  if (ust - d < l.top + 6) d = ust - l.top - 6;
  if (d) S.liste.scrollBy({ top: d, behavior: 'smooth' });
}
function kisiOdak(id) {
  const f = store.firmalar.get(id); const p = S.pinler.get(id);
  if (!f || !p) { kisiKartiAc(id); return; }
  if (gizliDurumlar.has(f.durum)) gizliDurumlar.delete(f.durum);
  S.takip = null;
  const kume = kumeHesapla();
  if (kume && !kume.sira.has(id)) { S.odakArac = null; S.seciliRota = null; }   // odak dışındaki kişi: odak kalkar ki pin görünsün
  esitle();
  S.map.setView(p.m.getLatLng(), Math.max(S.map.getZoom(), 15), { animate: true });
  p.m.openPopup();
}
// panelden araç kartına tıklama: odak aç/kapat (aracın duraklarını numaralı gösterir); takip açıksa dokunmaz
function aracOdak(id, { yakinlas = true } = {}) {
  const a = store.araclar.get(id); if (!a) return;
  if (S.takip === id) return;
  if (S.odakArac === id) { S.odakArac = null; esitle(); return; }
  S.odakArac = id; S.takip = null; S.seciliRota = null; S.map.closePopup();
  esitle();
  if (yakinlas) {
    const n = aracDuraklari(id).filter(konumlu).map(f => [Number(f.lat), Number(f.lon)]);
    if (aracKonumlu(a)) n.push([Number(a.son_lat), Number(a.son_lon)]);
    sigdir(n);
  }
}
// haritada araç ikonuna tıklama: odak aç/kapat + panel ARAÇLAR sekmesine geçer ve kartı gösterir
function aracHaritadanSec(id) {
  if (S.sekme !== 'araclar') sekmeYap('araclar');
  if (S.takip === id) { aracKartiGoster(id); return; }
  if (S.odakArac === id) { S.odakArac = null; esitle(); return; }
  S.odakArac = id; S.takip = null; S.seciliRota = null; S.map.closePopup();
  esitle(); aracKartiGoster(id);
}
function aracKartiGoster(id) {
  S.liste.querySelector(`[data-arac="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function takipDegistir(id) {
  if (S.takip === id) { S.takip = null; esitle(); return; }
  const a = store.araclar.get(id);
  if (!aracKonumlu(a)) { toast('Bu araçtan henüz konum gelmedi', { tur: 'hata' }); return; }
  S.takip = id; S.odakArac = id; S.seciliRota = null; S.map.closePopup(); S.sure = null;
  S.map.setView([Number(a.son_lat), Number(a.son_lon)], Math.max(S.map.getZoom(), 13), { animate: true });
  esitle();
}
function takipBirak() { if (S.takip) { S.takip = null; esitle(); } }

// ---------------------------------------------------------------- Trafik (Google Maps, canlı trafik, yeni sekme)
function aracTrafikLinki(a) {
  const kalan = aracDuraklari(a.id).filter(f => BEKLEYEN.includes(f.durum));
  const nokta = f => (konumlu(f) ? `${f.lat},${f.lon}` : temizAdres(f.adres));
  if (aracKonumlu(a)) {
    const q = { origin: `${a.son_lat},${a.son_lon}`, destination: `${VARIS.ad}, İzmir`, travelmode: 'driving' };
    if (kalan.length) q.waypoints = [...new Set(kalan.map(nokta))].slice(0, 9).join('|');
    return 'https://www.google.com/maps/dir/?api=1&' + new URLSearchParams(q);
  }
  return kalan.length ? fmt.rotaLink([...new Set(kalan.map(f => f.adres || `${f.lat},${f.lon}`))].slice(0, 9)) : null;
}
function trafikHedefi() {
  const kisi = S.seciliKisi ? store.firmalar.get(S.seciliKisi) : null;
  const aid = hedefArac(); const arac = aid ? store.araclar.get(aid) : null;
  if (kisi) return { url: fmt.mapsLink(kisi.adres || `${kisi.lat},${kisi.lon}`), acik: `${firmaAdi(kisi)} adresine yol tarifi` };
  if (arac) { const u = aracTrafikLinki(arac); if (u) return { url: u, acik: aracKonumlu(arac) ? `${fmt.plaka(arac.plaka)}: bulunduğu yerden Fuar İzmir'e` : `${fmt.plaka(arac.plaka)}: kalan duraklar` }; }
  if (S.seciliRota) {
    const d = rotaDuraklari(S.seciliRota).slice(0, 9);
    if (d.length) return { url: fmt.rotaLink([...new Set(d.map(f => f.adres || `${f.lat},${f.lon}`))]), acik: `${rotaParca(S.seciliRota).ad}: duraklar sırayla, varış Fuar İzmir` };
  }
  const c = S.map.getCenter();
  return { url: `https://www.google.com/maps/@?api=1&map_action=map&center=${c.lat.toFixed(5)},${c.lng.toFixed(5)}&zoom=${Math.round(S.map.getZoom())}&basemap=roadmap&layer=traffic`, acik: 'Seçim yok: haritada görünen bölge açılır' };
}
function trafikCiz() {
  if (!S) return;
  const h = trafikHedefi(); const imza = h.url;
  if (imza === S.trafikImza) return; S.trafikImza = imza;
  const a = S.trafik;
  a.href = h.url;
  a.querySelector('[data-trafik-acik]').textContent = h.acik;
  a.setAttribute('aria-label', `Trafik: canlı trafik için Google Maps yeni sekmede açılır. ${h.acik}`);
}

// ---------------------------------------------------------------- sol panel, lejant, takip çipi
function panelCiz() {
  if (!S) return;
  const q = trArama(S.arama);
  S.rotalar = rotalariTopla(); S.rotaMap = new Map(S.rotalar.map(r => [r.kod, r]));
  const araclar = [...store.araclar.values()];
  const html = S.sekme === 'araclar' ? aracPaneli(araclar, q) : rotaPaneli(S.rotalar, q);
  if (html !== S.panelHtml) { const y = S.liste.scrollTop; S.liste.innerHTML = html; S.liste.scrollTop = y; S.panelHtml = html; }
  const sa = String(araclar.length), sr = String(S.rotalar.length);
  if (S.sayArac.textContent !== sa) S.sayArac.textContent = sa;
  if (S.sayRota.textContent !== sr) S.sayRota.textContent = sr;
  const odak = !!(hedefArac() || S.seciliRota);
  if (S.tumuBtn.hidden === odak) S.tumuBtn.hidden = !odak;
}
function rotaPaneli(rotalar, q) {
  if (!rotalar.length) return '<div class="bos">Rotası olan servis durağı yok.</div>';
  const liste = q ? rotalar.filter(r => q.split(' ').every(p => r.arama.includes(p))) : rotalar;
  if (!liste.length) return '<div class="bos">Aramaya uyan rota yok.</div>';
  return liste.map(rotaKart).join('');
}
function rotaKart(r) {
  const sec = S.seciliRota === r.kod; const n = r.duraklar.length;
  const gun = k => r.duraklar.filter(f => f.durum === k).length;
  const seg = ['oy_kullandi', 'fuarda', 'yolda', 'arandi'].map(k => `<div style="width:${(gun(k) / Math.max(1, n)) * 100}%;background:${GUN_RENK[k]}"></div>`).join('');
  return `<button type="button" class="hk-rota${sec ? ' sec' : ''}" data-rota="${esc(r.kod)}" aria-expanded="${sec}">
    <div class="hk-r1"><span class="hk-rno">${esc(r.ad)}</span><span class="hk-ril">${esc(r.ilceler)}</span><span class="hk-rsay">${r.ulasan}/${n}</span></div>
    <div class="hk-r2">${r.ref ? `<span>${esc(r.ref)}</span>` : ''}<span>${n} durak</span><span>ilk ${r.ilkSaat ? esc(fmt.saatKisa(r.ilkSaat)) : '-'}</span>${r.arac ? `<span>${esc(fmt.plaka(r.arac.plaka))}</span>` : ''}</div>
    <div class="hk-bar">${seg}</div>
  </button>${sec ? `<div class="hk-duraklar">${r.duraklar.map(durakSatir).join('')}</div>` : ''}`;
}
function durakSatir(f) {
  const g = gecikme(f);
  return `<div class="hk-durak${S.seciliKisi === f.id ? ' sec' : ''}" data-durak="${f.id}" role="button" tabindex="0" title="Haritada göster (çift tıklama: kişi kartı)">
    <span class="hk-dno" style="background:${GUN_RENK[f.durum]}">${esc(f.rota_sira ?? '')}</span>
    <div class="hk-dad"><b>${esc(firmaAdi(f) || f.unvan)}</b><span>${esc(f.unvan || '')}</span></div>
    <div class="hk-dsag"><span class="hk-dsaat">${f.tasima_saati ? esc(fmt.saatKisa(f.tasima_saati)) : ''}</span>${g ? '<span class="hr hr-gec">◷ GECİKTİ</span>' : `<span class="hr hr-${esc(f.durum)}">${esc(GUN_ETIKET[f.durum] || f.durum)}</span>`}</div>
  </div>`;
}
function aracPaneli(araclar, q) {
  if (!araclar.length) return `<div class="bos">Kayıtlı araç yok.${yazabilirMi() ? '<br><a href="#araclar" class="btn btn-kucuk" style="margin-top:10px">Araç ekle</a>' : ''}</div>`;
  const sirali = araclar.slice().sort((a, b) => aracSirasi(a) - aracSirasi(b) || fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr', { numeric: true }));
  const liste = q ? sirali.filter(a => trArama(`${a.plaka} ${fmt.plaka(a.plaka)} ${a.sofor_ad || ''} ${a.marka || ''} ${a.model || ''}`).includes(q)) : sirali;
  const konumsuz = !araclar.some(aracKonumlu);
  return `${konumsuz ? '<div class="hk-bilgi">Henüz konum gönderen araç yok. Şoför telefonunda Saha ekranından konum paylaşınca araç burada canlı görünür.</div>' : ''}
    ${liste.length ? liste.map(aracKart).join('') : '<div class="bos">Aramaya uyan araç yok.</div>'}`;
}
const aracSirasi = a => (!aracKonumlu(a) ? 2 : eskiMi(a) ? 1 : 0);
function aracKart(a) {
  const odak = hedefArac() === a.id, takip = S.takip === a.id;
  const konum = aracKonumlu(a), eski = konum && eskiMi(a);
  const d = aracDuraklari(a.id); const nx = siradaki(d);
  const sonraki = nx ? `${nx.tasima_saati ? fmt.saatKisa(nx.tasima_saati) : 'Saat ?'} · ${soforKisa(firmaAdi(nx))}${nx.ilce ? ' · ' + trBaslik(nx.ilce) : ''}` : '-';
  const ping = konum ? fmt.goreli(a.son_konum_zamani) : 'konum yok';
  const plaka = `<span class="hk-plaka"><i></i><b>${esc(fmt.plaka(a.plaka))}</b></span>`;
  const tel = telVar(a.sofor_tel) ? `<a class="hk-tel" href="${fmt.telLink(a.sofor_tel)}" title="Şoförü ara">📞</a>` : '<span class="hk-tel yok" title="Şoför telefonu yok">📞</span>';
  return `<div class="hk-arac${odak ? ' sec' : ''}${!konum || eski ? ' eski' : ''}" data-arac="${a.id}">
    <div class="hk-a1">${plaka}<span class="hk-sofor">${esc(soforKisa(a.sofor_ad) || 'Şoför yok')}</span><span class="hk-vst vst-${esc(a.durum)}">${esc(ARAC_ETIKET[a.durum] || a.durum)}</span></div>
    <div class="hk-a2">${esc(aracRotaYazi(d))}</div>
    <div class="hk-a3"><span class="hk-sira">Sıradaki: <b>${esc(sonraki)}</b></span><span class="hk-ping${eski ? ' eski' : ''}">◎ ${esc(ping)}</span></div>
    ${konum ? tahminSatiri(a) : ''}
    ${takip ? sureSatiri(a) : ''}
    <div class="hk-a4">
      <button type="button" class="hk-takip${takip ? ' acik' : ''}" data-takip="${a.id}" ${konum ? '' : 'disabled title="Henüz konum gelmedi"'}>${takip ? '✓ Takipte' : '◎ Takip et'}</button>
      ${yazabilirMi() ? `<button type="button" class="hk-kart" data-arac-kart="${a.id}">Araç kartı</button>` : ''}
      ${konumGirebilir() ? `<button type="button" class="hk-kart" data-konum-gir="${a.id}" title="Şoförün söylediği yeri haritaya gir">Konum gir</button>` : ''}
      ${tel}
    </div>
  </div>`;
}
// araç kartında tahmini konum özeti: sözlü / ilçe kaynakta ya da Fuar'a yaklaşırken (GPS'te ve yaklaşmıyorsa satır yok)
function tahminSatiri(a) {
  const b = daireBilgi(a);
  if (b.kaynak.tur === 'gps' && !b.yakin) return '';
  const parca = [];
  if (b.yakin) parca.push(`<b>Fuar'a yaklaşıyor</b> · ${esc(yaklasanMetni(a))}`);
  if (b.kaynak.tur !== 'gps') {
    parca.push(`${esc(b.kaynak.yazi)}${a.son_konum_zamani ? ' ' + esc(konumSaati(a)) : ''}${a.konum_metni ? ` · “${esc(a.konum_metni)}”` : ''}`);
    parca.push(`şimdi ±${esc(metreYaz(b.r))}`);
  }
  return `<div class="hk-tahmin${b.yakin ? ' yakin' : ''}" title="Tahmini konum dairesi: zamanla büyür, yeni konum gelince küçülür"><span class="hk-tahmin-ic" aria-hidden="true"></span><span>${parca.join(' · ')}</span></div>`;
}
function sureSatiri(a) {
  const s = S.sure;
  if (!s || s.aracId !== a.id) return '<div class="hk-sure">Kalan süre hesaplanıyor…</div>';
  return `<div class="hk-sure" title="Trafiksiz tahmin (OSRM)">${s.nx ? `<div><span>Sıradaki durağa</span><b>${esc(sureYazi(s.sonraki))}</b></div>` : ''}<div><span>Fuar'a</span><b>${esc(sureYazi(s.fuar))}</b></div></div>`;
}
function lejantCiz() {
  const say = {}; firmaListesi().filter(konumlu).forEach(f => { say[f.durum] = (say[f.durum] || 0) + 1; });
  const html = GUNLER.map(g => `<button type="button" class="hl${gizliDurumlar.has(g.k) ? ' kapali' : ''}" data-lj="${g.k}" title="${gizliDurumlar.has(g.k) ? 'Göster' : 'Gizle'}: ${esc(g.ad)} (${say[g.k] || 0} durak)"><span class="hl-nokta" style="background:${GUN_RENK[g.k]}"></span>${esc(g.ad)}</button>`).join('')
    + '<span class="hl sabit"><span class="hl-arac"></span>Araç</span><span class="hl sabit"><span class="hl-not"></span>Saha notu</span>'
    + (S.daireler.size ? '<span class="hl sabit" title="Aracın şu an olabileceği alan: zamanla büyür, yeni konum gelince küçülür. Kesik çizgi = şoför söyledi"><span class="hl-daire"></span>Tahmini konum</span>' : '')
    + (S.yaklasanVar ? '<span class="hl sabit"><span class="hl-daire yakin"></span>Fuar\'a yaklaşan</span>' : '');
  if (html !== S.lejantHtml) { S.lejant.innerHTML = html; S.lejantHtml = html; }
}
function takipCiz() {
  const a = S.takip ? store.araclar.get(S.takip) : null;
  let ek = '';
  if (a && S.sure?.aracId === a.id) { const s = S.sure; ek = `<em>${s.nx ? `durağa ${esc(sureYazi(s.sonraki))} · ` : ''}Fuar'a ${esc(sureYazi(s.fuar))}</em>`; }
  const html = a ? `◎ Takipte: ${esc(fmt.plaka(a.plaka))}${ek}<button type="button" data-takip-birak>Bırak</button>` : '';
  if (html !== S.takipHtml) { S.takipSerit.innerHTML = html; S.takipSerit.hidden = !html; S.takipHtml = html; }
}
function sekmeYap(s) {
  S.sekme = s === 'rotalar' ? 'rotalar' : 'araclar';
  try { localStorage.setItem(SEKME_ANAHTAR, S.sekme); } catch {}
  S.kok.querySelectorAll('[data-sekme]').forEach(b => { const a = b.dataset.sekme === S.sekme; b.classList.toggle('aktif', a); b.setAttribute('aria-selected', a); });
  S.ara.placeholder = S.sekme === 'araclar' ? 'Plaka ya da şoför ara' : 'Rota, referans, ilçe ya da kişi ara';
  S.panelHtml = null; S.liste.scrollTop = 0;
  panelCiz();
}

// ---------------------------------------------------------------- Konum gir (şoförün sözlü konumu)
// Admin ve araç yöneticisi: araç seç, şoförün söylediği yeri yaz ve Bul (Nominatim) ya da haritada o noktaya dokun,
// ne kadar kesin olduğunu seç (Tam yer ±300 m · Semt ±800 m · İlçe ±2,5 km), Kaydet. arac_konumlari'na kaynak 'sozlu'
// (ilçede 'ilce'), dogruluk ve konum_metni ile yazılır; tetikleyici aracın son konumunu günceller, daire oradan büyür.
const kgDogrulukHtml = () => KG_DOGRULUK.map(d => `<button type="button" class="hkg-dog-b" data-kg-dog="${d.m}" role="radio" aria-checked="false">${esc(d.ad)}<small>±${esc(metreYaz(d.m))}</small></button>`).join('');
function kgKur() {
  const p = el(`<div class="hkg" data-kg hidden role="dialog" aria-label="Şoförün söylediği konumu gir">
    <div class="hkg-ust"><b>Konum gir</b><select class="hkg-arac" data-kg-arac aria-label="Araç"></select><button type="button" class="hp-kapat" data-kg-kapat aria-label="Kapat">×</button></div>
    <form class="hkg-ara" data-kg-form autocomplete="off"><input type="search" data-kg-q enterkeyhint="search" placeholder="Yer adı (ör. Karşıyaka çarşı)" aria-label="Şoförün söylediği yer"><button type="submit" data-kg-bul>Bul</button></form>
    <div class="hkg-sonuc" data-kg-sonuc></div>
    <div class="hkg-ipucu">ya da haritada o noktaya dokun</div>
    <div class="hkg-dog" role="radiogroup" aria-label="Ne kadar kesin?">${kgDogrulukHtml()}</div>
    <div class="hkg-alt"><span class="hkg-nokta" data-kg-nokta>Henüz nokta seçilmedi</span><button type="button" class="hkg-kaydet" data-kg-kaydet disabled>Kaydet</button></div>
  </div>`);
  S.kap.appendChild(p);
  L.DomEvent.disableClickPropagation(p); L.DomEvent.disableScrollPropagation(p);
  const q = s => p.querySelector(s);
  S.kgP = { p, arac: q('[data-kg-arac]'), q: q('[data-kg-q]'), bul: q('[data-kg-bul]'), sonuc: q('[data-kg-sonuc]'), nokta: q('[data-kg-nokta]'), kaydet: q('[data-kg-kaydet]') };
  q('[data-kg-kapat]').addEventListener('click', kgKapat);
  q('[data-kg-form]').addEventListener('submit', e => { e.preventDefault(); kgAra(); });
  S.kgP.arac.addEventListener('change', () => { if (S?.kg) S.kg.aracId = Number(S.kgP.arac.value); });
  S.kgP.q.addEventListener('input', () => { if (S?.kg) S.kg.metinElle = true; });
  S.kgP.kaydet.addEventListener('click', kgKaydet);
  p.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); kgKapat(); } });
  p.addEventListener('click', e => {
    const d = e.target.closest('[data-kg-dog]'); if (d) { kgDogrulukYap(Number(d.dataset.kgDog)); return; }
    const s = e.target.closest('[data-kg-i]');
    if (s && S.kg?.sonuclar) { const r = S.kg.sonuclar[Number(s.dataset.kgI)]; if (r) kgNokta(r.lat, r.lon, { ad: r.ad, dogruluk: r.dogruluk, yakinlas: true }); }
  });
}
function konumGirAc(aracId) {
  if (!S || !konumGirebilir()) return;
  if (!S.kgP) kgKur();
  const araclar = [...store.araclar.values()].sort((a, b) => fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr', { numeric: true }));
  if (!araclar.length) { toast('Kayıtlı araç yok', { tur: 'hata' }); return; }
  const secili = store.araclar.has(aracId) ? aracId : araclar[0].id;
  S.kgP.arac.innerHTML = araclar.map(a => `<option value="${a.id}"${a.id === secili ? ' selected' : ''}>${esc(fmt.plaka(a.plaka))}${a.sofor_ad ? ' · ' + esc(soforKisa(a.sofor_ad)) : ''}</option>`).join('');
  S.kg = { aracId: secili, nokta: null, ad: '', dogruluk: 800, sonuclar: null, metinElle: false };
  S.kgP.q.value = ''; S.kgP.sonuc.innerHTML = ''; S.kgP.nokta.textContent = 'Henüz nokta seçilmedi'; S.kgP.kaydet.disabled = true;
  kgDogrulukYap(800);
  S.kgP.p.hidden = false; S.kap.classList.add('kg-acik');
  S.map.closePopup();
  if (!matchMedia('(max-width: 760px)').matches) S.kgP.q.focus();   // telefonda klavye kendiliğinden açılmasın
}
function kgKapat() {
  if (!S) return;
  S.kg = null;
  if (S.kgP) S.kgP.p.hidden = true;
  S.kap.classList.remove('kg-acik');
  for (const k of ['kgOnizleme', 'kgMerkez']) if (S[k]) { S.map.removeLayer(S[k]); S[k] = null; }
}
function kgDogrulukYap(m) {
  if (!S?.kg) return;
  S.kg.dogruluk = m;
  S.kgP.p.querySelectorAll('[data-kg-dog]').forEach(b => { const on = Number(b.dataset.kgDog) === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  if (S.kgOnizleme) S.kgOnizleme.setRadius(m);
}
// seçilen nokta: önizleme dairesi (kesik) + merkez noktası; aramadan geldiyse doğruluk sonucun türünden
function kgNokta(lat, lon, { ad = '', dogruluk = null, yakinlas = false } = {}) {
  if (!S?.kg) return;
  S.kg.nokta = { lat, lon }; S.kg.ad = ad;
  if (dogruluk) kgDogrulukYap(dogruluk);
  const ll = [lat, lon];
  if (!S.kgOnizleme) {
    S.kgOnizleme = L.circle(ll, { radius: S.kg.dogruluk, className: 'harita-daire k-sozlu onizleme', interactive: false }).addTo(S.map);
    S.kgMerkez = L.circleMarker(ll, { radius: 6, className: 'harita-kg-merkez', interactive: false }).addTo(S.map);
  } else { S.kgOnizleme.setLatLng(ll); S.kgOnizleme.setRadius(S.kg.dogruluk); S.kgMerkez.setLatLng(ll); }
  if (yakinlas) S.map.fitBounds(S.kgOnizleme.getBounds(), { paddingTopLeft: [40, 60], paddingBottomRight: [40, 60], maxZoom: 15, animate: true });
  S.kgP.nokta.textContent = ad ? `Seçilen: ${ad}` : `Haritada işaretlenen nokta (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  S.kgP.kaydet.disabled = false;
}
const YER_AT = new Set(['izmir', 'turkiye', 'ege bolgesi']);
const kisaYer = s => [...new Set(String(s || '').split(',').map(x => x.trim()).filter(x => x && !YER_AT.has(trArama(x)) && !/^\d{5}$/.test(x)))].slice(0, 3).join(', ');
// Nominatim place_rank (İzmir'de ölçüldü): ilçe sınırı 12 -> ilçe düzeyi; mahalle / OSB 16 -> semt; cadde, istasyon, bina 26-30 -> tam yer
const rankDogruluk = r => (!Number.isFinite(Number(r)) ? 800 : Number(r) <= 14 ? 2500 : Number(r) >= 26 ? 300 : 800);
async function kgAra() {
  if (!S?.kg) return;
  const metin = S.kgP.q.value.trim();
  if (metin.length < 2) { S.kgP.sonuc.innerHTML = '<div class="hkg-bos">En az 2 harf yaz.</div>'; return; }
  const gecen = Date.now() - (S.kgSonArama || 0);
  if (gecen < 1100) return;   // Nominatim kuralı: saniyede en çok bir istek
  S.kgSonArama = Date.now();
  const sn = S; sn.kgP.bul.disabled = true; sn.kgP.sonuc.innerHTML = '<div class="hkg-bos">Aranıyor…</div>';
  try {
    const u = `${YER_ARA_URL}?${new URLSearchParams({ q: metin, format: 'jsonv2', countrycodes: 'tr', 'accept-language': 'tr', limit: '6', viewbox: IZMIR_KUTU, bounded: '1' })}`;
    const r = await fetch(u, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`yer araması yanıt vermedi (${r.status})`);
    const j = await r.json();
    if (S !== sn || !sn.kg) return;
    const liste = (Array.isArray(j) ? j : []).map(x => ({ lat: Number(x.lat), lon: Number(x.lon), ad: kisaYer(x.display_name) || metin, dogruluk: rankDogruluk(x.place_rank) }))
      .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    sn.kg.sonuclar = liste;
    sn.kgP.sonuc.innerHTML = liste.length
      ? liste.map((x, i) => `<button type="button" class="hkg-s" data-kg-i="${i}"><span>${esc(x.ad)}</span><small>±${esc(metreYaz(x.dogruluk))}</small></button>`).join('')
      : '<div class="hkg-bos">İzmir içinde bulunamadı. Haritada o noktaya dokunabilirsin.</div>';
    if (liste.length === 1) kgNokta(liste[0].lat, liste[0].lon, { ad: liste[0].ad, dogruluk: liste[0].dogruluk, yakinlas: true });
  } catch (e) {
    if (S === sn && sn.kg) sn.kgP.sonuc.innerHTML = `<div class="hkg-bos">Yer araması şu an çalışmıyor (${esc(String(e?.message || e))}). Haritada o noktaya dokunabilirsin.</div>`;
  } finally { if (S === sn && sn.kgP) setTimeout(() => { if (S === sn) sn.kgP.bul.disabled = false; }, 1100); }
}
async function kgKaydet() {
  const kg = S?.kg; if (!kg?.nokta) return;
  const aracId = Number(S.kgP.arac.value); const a = store.araclar.get(aracId);
  if (!a) { toast('Araç bulunamadı', { tur: 'hata' }); return; }
  const metin = (S.kgP.q.value.trim() || kg.ad || '').slice(0, 200) || null;
  const kaynak = kg.dogruluk >= 2500 ? 'ilce' : 'sozlu';
  const onceki = a; const sn = S;
  sn.kgP.kaydet.disabled = true;
  try {
    await konumGonder(aracId, Number(kg.nokta.lat.toFixed(6)), Number(kg.nokta.lon.toFixed(6)), kg.dogruluk, kaynak, metin);
    toast(`${fmt.plaka(a.plaka)} · tahmini konum girildi (±${metreYaz(kg.dogruluk)})`);
    if (S !== sn) return;
    kgKapat();
    if (S.takip !== aracId) { S.odakArac = aracId; S.seciliRota = null; }
    esitle(); aracKartiGoster(aracId);
  } catch (e) {
    store.araclar.set(aracId, onceki); bus.emit('arac', { id: aracId });   // iyimser güncellemeyi geri al
    if (S === sn && sn.kgP) sn.kgP.kaydet.disabled = false;
    const m = String(e?.message || e);
    toast(/row-level security|permission denied/i.test(m) ? 'Konum yazılamadı: bu işlem için yetkin yok' : `Konum yazılamadı: ${m}`, { tur: 'hata' });
  }
}

// ---------------------------------------------------------------- ekran
export default {
  async render(kok, param) {
    stilEkle();
    L = window.L;
    if (!L) {
      kok.innerHTML = '<div class="kart"><div class="kart-govde"><div class="bos">Harita kütüphanesi yüklenemedi. İnternet bağlantısını kontrol edip sayfayı yenile.</div></div></div>';
      return;
    }
    let sekme = 'araclar'; try { if (localStorage.getItem(SEKME_ANAHTAR) === 'rotalar') sekme = 'rotalar'; } catch {}
    kok.innerHTML = `
    <div class="harita-sayfa">
      <aside class="harita-panel">
        <div class="harita-panel-ust">
          <button type="button" class="hs-sekme" role="tab" data-sekme="araclar">ARAÇLAR <span data-say-arac></span></button>
          <button type="button" class="hs-sekme" role="tab" data-sekme="rotalar">ROTALAR <span data-say-rota></span></button>
          <button type="button" class="hs-tumu" data-tumu-goster hidden>Tümünü göster</button>
        </div>
        <div class="harita-ara-satir"><input class="harita-ara" data-harita-ara type="search" autocomplete="off"></div>
        <div class="harita-liste" data-liste></div>
      </aside>
      <section class="harita-kap">
        <div class="harita-harita" data-harita></div>
        <div class="harita-ust-sag">
          <div class="hc-takip" data-takip-serit hidden></div>
          <a class="hc-trafik" data-trafik target="_blank" rel="noopener" href="#"><span class="hc-nokta" aria-hidden="true"></span>Trafik
            <span class="hc-balon" role="tooltip">Canlı trafik için Google Maps yeni sekmede açılır<em data-trafik-acik></em></span></a>
        </div>
        <div class="harita-lejant" data-lejant></div>
      </section>
    </div>`;
    const q = s => kok.querySelector(s);
    S = {
      kok, sekme, arama: '', liste: q('[data-liste]'), sayRota: q('[data-say-rota]'), sayArac: q('[data-say-arac]'), tumuBtn: q('[data-tumu-goster]'),
      ara: q('[data-harita-ara]'), takipSerit: q('[data-takip-serit]'), trafik: q('[data-trafik]'), lejant: q('[data-lejant]'),
      pinler: new Map(), aracM: new Map(), izler: new Map(), rotalar: [], rotaMap: new Map(),
      seciliRota: null, odakArac: null, takip: null, seciliKisi: null, sure: null, sureBekle: false,
      panelHtml: null, lejantHtml: null, trafikImza: null, takipHtml: null, varisHtml: '', yakinlasiyor: false, kalanCizgi: null, kalanImza: '',
      kap: q('.harita-kap'), daireler: new Map(), yaklasanVar: false, kg: null, kgP: null, kgOnizleme: null, kgMerkez: null, kgSonArama: 0,
    };

    // harita + karo
    const map = L.map(q('[data-harita]'), { zoomControl: false, attributionControl: false, minZoom: 8, maxZoom: 19, worldCopyJump: false });
    S.map = map;
    const alt = altlik();
    S.karoUrl = alt.url;
    S.karo = L.tileLayer(alt.url, { maxZoom: 19, attribution: alt.atif, className: alt.suzgec ? 'harita-karo harita-karo-suzgec' : 'harita-karo', crossOrigin: false }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' }).addTo(map);
    const Kontrol = L.Control.extend({ onAdd() { const e = this.options.eleman; L.DomEvent.disableClickPropagation(e); L.DomEvent.disableScrollPropagation(e); return e; } });
    L.control.zoom({ position: 'topright', zoomInTitle: 'Yakınlaş', zoomOutTitle: 'Uzaklaş' }).addTo(map);
    const araKontrol = el(`<div class="hk-kontrol leaflet-bar">
      <a href="#" role="button" data-tumu title="Tüm durakları, araçları ve Fuar'ı göster" aria-label="Tümünü göster">⤢</a>
      <a href="#" role="button" data-fuar title="Fuar İzmir'e git" aria-label="Fuar İzmir'e git">⚑</a>
    </div>`);
    new Kontrol({ position: 'topright', eleman: araKontrol }).addTo(map);
    S.katman = { daire: L.layerGroup().addTo(map), rota: L.layerGroup().addTo(map), iz: L.layerGroup().addTo(map), pin: L.layerGroup().addTo(map), arac: L.layerGroup().addTo(map) };

    // ilk görünüm (işaretler eklenmeden önce: Leaflet görünüm kurulmadan katman çizmez)
    if (sonGorunum) map.setView(sonGorunum.merkez, sonGorunum.zoom, { animate: false });
    else tumunuGoster(false, { cekirdek: true });
    S.sigdi = !!sonGorunum || firmaListesi().some(konumlu);
    varisKur();

    // olaylar
    map.on('dragstart', () => { if (S?.takip) { S.takip = null; esitle(); toast('Haritayı kaydırdın, takip bırakıldı'); } });
    map.on('zoomstart', () => { if (!S) return; S.yakinlasiyor = true; S.aracM.forEach(k => k.m.getElement()?.classList.remove('kayiyor')); });
    map.on('zoomend', () => { if (S) S.yakinlasiyor = false; });
    map.on('moveend', () => { if (S && !S.seciliKisi && !hedefArac() && !S.seciliRota) trafikCiz(); });
    map.on('click', e => { if (S?.kg) kgNokta(e.latlng.lat, e.latlng.lng); });   // Konum gir açıkken haritaya dokunmak noktayı seçer
    const kap = q('.harita-kap');
    kap.addEventListener('click', e => {
      if (!S) return;
      const ks = e.target.closest('[data-karsila]');
      if (ks) { e.preventDefault(); const id = Number(ks.dataset.karsila); ks.disabled = true; karsiladim(id).then(() => toast(`${firmaAdi(store.firmalar.get(id))} · karşıladın`), hata => { ks.disabled = false; toast(String(hata?.message || hata), { tur: 'hata' }); }); return; }
      const kart = e.target.closest('[data-kart]'); if (kart) { e.preventDefault(); kisiKartiAc(Number(kart.dataset.kart)); return; }
      const kg = e.target.closest('[data-konum-gir]'); if (kg) { e.preventDefault(); konumGirAc(Number(kg.dataset.konumGir)); return; }
      if (e.target.closest('[data-pop-kapat]')) { map.closePopup(); return; }
      if (e.target.closest('[data-takip-birak]')) { takipBirak(); return; }
      const lj = e.target.closest('[data-lj]');
      if (lj) { const d = lj.dataset.lj; if (gizliDurumlar.has(d)) gizliDurumlar.delete(d); else gizliDurumlar.add(d); esitle(); return; }
      if (e.target.closest('[data-tumu]')) { e.preventDefault(); takipBirak(); tumunuGoster(); return; }
      if (e.target.closest('[data-fuar]')) { e.preventDefault(); takipBirak(); const v = varis(); map.setView([v.lat, v.lon], 15, { animate: true }); S.varisM?.openPopup(); return; }
    });
    S.kok.querySelector('.harita-panel-ust').addEventListener('click', e => {
      const b = e.target.closest('[data-sekme]'); if (b && b.dataset.sekme !== S.sekme) { sekmeYap(b.dataset.sekme); return; }
      if (e.target.closest('[data-tumu-goster]')) tumunuGosterDugmesi();
    });
    S.ara.addEventListener('input', () => { S.arama = S.ara.value; panelCiz(); });
    S.liste.addEventListener('click', e => {
      if (!S) return;
      if (e.target.closest('a[href]')) return;
      const tk = e.target.closest('[data-takip]'); if (tk) { e.stopPropagation(); if (!tk.disabled) takipDegistir(Number(tk.dataset.takip)); return; }
      const ak = e.target.closest('[data-arac-kart]'); if (ak) { location.hash = '#araclar/' + ak.dataset.aracKart; return; }
      const kg = e.target.closest('[data-konum-gir]'); if (kg) { e.stopPropagation(); konumGirAc(Number(kg.dataset.konumGir)); return; }
      const d = e.target.closest('[data-durak]'); if (d) { kisiOdak(Number(d.dataset.durak)); return; }
      const r = e.target.closest('[data-rota]'); if (r) { rotaSec(r.dataset.rota); return; }
      const a = e.target.closest('[data-arac]'); if (a) aracOdak(Number(a.dataset.arac));
    });
    S.liste.addEventListener('dblclick', e => { const d = e.target.closest('[data-durak]'); if (d) kisiKartiAc(Number(d.dataset.durak)); });
    S.liste.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
    });
    // Esc: açık çekmece/modal/palet yoksa seçimi kaldır (yakalama evresinde, ortak Esc'den önce bakar)
    S.escDinle = e => {
      if (e.key !== 'Escape' || !S || document.querySelector('[data-modal], .palet, .cekmece')) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && document.activeElement !== S.ara) return;
      if (S.kok.querySelector('.leaflet-popup')) { S.map.closePopup(); return; }   // önce açık popup kapanır
      if (S.kg) { kgKapat(); return; }
      if (S.seciliRota || S.odakArac || S.takip) { odagiTemizle(); esitle(); }
    };
    document.addEventListener('keydown', S.escDinle, true);
    // tema değişince karo değişir (harita yeniden kurulmaz)
    S.temaGozcu = new MutationObserver(() => altlikEsitle());
    S.temaGozcu.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-tema'] });
    // kap boyutu değişince (pencere, çevrimdışı şeridi) haritayı yeniden ölç
    let boyutBekliyor = false;
    S.boyutGozcu = new ResizeObserver(() => { if (boyutBekliyor) return; boyutBekliyor = true; requestAnimationFrame(() => { boyutBekliyor = false; S?.map.invalidateSize({ pan: false }); }); });
    S.boyutGozcu.observe(q('[data-harita]'));

    // önceki seçimleri geri yükle, çiz, sonra bağlantı parametresi
    if (hafiza.rota && firmaListesi().some(f => f.rota_kod === hafiza.rota)) S.seciliRota = hafiza.rota;
    if (hafiza.arac && store.araclar.has(hafiza.arac)) { S.odakArac = hafiza.arac; S.seciliRota = null; }
    if (hafiza.takip && hafiza.takip === hafiza.arac && aracKonumlu(store.araclar.get(hafiza.takip))) S.takip = hafiza.takip;
    sekmeYap(sekme);
    esitle();
    if (S.takip) { const a = store.araclar.get(S.takip); map.setView([Number(a.son_lat), Number(a.son_lon)], map.getZoom(), { animate: false }); }
    paramUygula(param);
    requestAnimationFrame(() => S?.map.invalidateSize({ pan: false }));
    // tahmini konum daireleri (ve konum yaşı yazıları) 15 sn'de bir yeniden hesaplanır: sayfa yenilemeden büyür
    S.daireZaman = setInterval(() => { if (S) esitle(); }, DAIRE_ARALIK_MS);
  },

  yenile() {
    // olay adından bağımsız: yenileme kare başına bir kez gelir ve aynı karedeki başka olaylar birleşir;
    // bu yüzden her çağrıda ucuz bir fark eşitlemesi yapılır (63 pin, ~40 rota, birkaç araç).
    if (S) esitle();
  },

  temizle() {
    if (!S) return;
    const m = S.map;
    try { sonGorunum = { merkez: m.getCenter(), zoom: m.getZoom() }; } catch {}
    S.aracM.forEach(k => clearTimeout(k.kayZaman));
    clearInterval(S.daireZaman);
    S.temaGozcu?.disconnect(); S.boyutGozcu?.disconnect();
    document.removeEventListener('keydown', S.escDinle, true);
    S = null;                                  // popupclose gibi olaylar temizlik sırasında boşa düşsün
    try { m.remove(); } catch (e) { console.warn('harita kaldırılamadı', e); }
  },
};

function paramUygula(param) {
  if (!param) return;
  let m;
  if ((m = /^arac-(\d+)$/.exec(param))) {
    const id = Number(m[1]); if (!store.araclar.has(id)) return;
    sekmeYap('araclar');
    if (aracKonumlu(store.araclar.get(id))) takipDegistir(id); else aracOdak(id);
  } else if ((m = /^rota-(.+)$/.exec(param))) {
    if (firmaListesi().some(f => f.rota_kod === m[1])) rotaSec(m[1], { toggle: false });
  } else if ((m = /^(?:firma-)?(\d+)$/.exec(param))) {
    const id = Number(m[1]); if (S.pinler.has(id)) kisiOdak(id);
  }
}

// ---------------------------------------------------------------- ekran stili (tasarım: SM Harita.dc.html)
function stilEkle() {
  if (document.querySelector('style[data-ekran="harita"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'harita';
  s.textContent = `
.harita-sayfa { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 14px; margin: -4px 0; line-height: normal; height: calc(100vh - var(--ust-h) - 32px); height: calc(100dvh - var(--ust-h) - 32px); min-height: 520px; }
.harita-sayfa [hidden] { display: none !important; }
.harita-panel { min-height: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; }
.harita-panel-ust { flex: none; display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.hs-sekme { height: 28px; padding: 0 10px; border-radius: 7px; border: 0; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 800; letter-spacing: .1em; white-space: nowrap; background: transparent; color: var(--ink-3); }
.hs-sekme:hover { color: var(--ink); }
.hs-sekme.aktif { background: var(--surface-3); color: var(--ink); }
.hs-sekme span { opacity: .6; font-variant-numeric: tabular-nums; }
.hs-tumu { margin-left: auto; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.hs-tumu:hover { background: var(--hover); }
.harita-ara-satir { flex: none; padding: 8px 8px 0; }
.harita-ara { width: 100%; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font: 500 13px/1 var(--font); outline: none; }
.harita-ara:focus { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); background: var(--surface); }
.harita-ara::placeholder { color: var(--ink-3); }
.harita-liste { flex: 1; min-height: 0; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain; }
.harita-liste > * { flex: none; }
.harita-liste .bos { padding: 28px 12px; }
:root[data-theme="dark"] .harita-liste { color-scheme: dark; }
.hk-bilgi { padding: 10px 12px; border-radius: 10px; background: var(--surface-2); border: 1px dashed var(--line-2); color: var(--ink-2); font-size: 12px; font-weight: 600; line-height: 1.45; }

.hk-plaka { display: inline-flex; align-items: stretch; height: 22px; border: 1.5px solid #111; border-radius: 4px; background: #fff; overflow: hidden; flex: none; }
.hk-plaka i { width: 8px; background: #1F4FA8; }
.hk-plaka b { padding: 0 6px; display: flex; align-items: center; font-size: 12.5px; font-weight: 800; letter-spacing: .05em; color: #111; white-space: nowrap; font-variant-numeric: tabular-nums; }
.hk-arac { display: flex; flex-direction: column; gap: 7px; padding: 10px 11px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); cursor: pointer; }
.hk-arac:hover { background: var(--hover); }
.hk-arac.sec { background: var(--red-soft); border: 1.5px solid var(--red); padding: 9.5px 10.5px; }
.hk-arac.eski { opacity: .7; }
.hk-a1 { display: flex; align-items: center; gap: 8px; }
.hk-sofor { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.hk-vst { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; line-height: 1; box-sizing: border-box; font-variant-numeric: tabular-nums; flex: none; }
.vst-hazir { background: var(--green-soft); color: var(--green); border: 1.5px solid var(--green-soft); }
.vst-yolda { background: var(--amber-soft); color: var(--amber-ink); border: 1.5px solid var(--amber-soft); }
.vst-fuarda { background: var(--violet-soft); color: var(--violet); border: 1.5px solid var(--violet-soft); }
.vst-mola { background: var(--gray-soft); color: var(--ink-2); border: 1.5px solid var(--gray-soft); }
.vst-arizali { background: var(--amber); color: #1a1200; border: 1.5px solid var(--amber); }
.hk-a2 { font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hk-a3 { display: flex; align-items: center; gap: 8px; }
.hk-sira { flex: 1; min-width: 0; font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hk-sira b { color: var(--ink); }
.hk-ping { font-size: 12px; font-weight: 600; color: var(--ink-3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.hk-ping.eski { color: var(--amber-ink); }
.hk-sure { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; padding: 6px 8px; border-radius: 7px; background: var(--surface-2); border: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.hk-sure div { display: grid; gap: 1px; min-width: 0; }
.hk-sure span { font-size: 10.5px; font-weight: 600; color: var(--ink-3); }
.hk-sure b { font-size: 12.5px; font-weight: 800; color: var(--ink); white-space: nowrap; }
.hk-a4 { display: flex; gap: 6px; }
.hk-takip { flex: 1; height: 30px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.hk-takip:hover:not(:disabled) { background: var(--hover); }
.hk-takip.acik { border-color: var(--red); background: var(--red); color: #fff; }
.hk-takip:disabled { opacity: .45; cursor: not-allowed; }
.hk-kart { height: 30px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.hk-kart:hover { background: var(--hover); }
.hk-tel { height: 30px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line-2); color: var(--ink); font-size: 12px; font-weight: 700; display: flex; align-items: center; background: var(--surface); }
.hk-tel:hover { background: var(--hover); color: var(--ink); }
.hk-tel.yok { opacity: .35; }

.hk-rota { display: flex; flex-direction: column; gap: 7px; padding: 11px 12px; border-radius: 10px; cursor: pointer; text-align: left; font-family: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); width: 100%; }
.hk-rota:hover { background: var(--hover); }
.hk-rota.sec { background: var(--red-soft); border: 1.5px solid var(--red); padding: 10.5px 11.5px; }
.hk-r1 { display: flex; align-items: baseline; gap: 8px; width: 100%; }
.hk-rno { font-size: 14px; font-weight: 800; white-space: nowrap; }
.hk-ril { font-size: 13px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.hk-rsay { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.hk-r2 { display: flex; gap: 10px; width: 100%; font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
.hk-r2 span { overflow: hidden; text-overflow: ellipsis; }
.hk-bar { width: 100%; height: 6px; border-radius: 99px; background: var(--surface-3); overflow: hidden; display: flex; }
.hk-duraklar { display: flex; flex-direction: column; gap: 1px; margin: -2px 0 2px 14px; padding-left: 10px; border-left: 2px solid var(--red-line); }
.hk-durak { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: 8px; cursor: pointer; outline: none; }
.hk-durak:hover, .hk-durak.sec { background: var(--surface-3); }
.hk-durak:focus-visible { box-shadow: 0 0 0 2px var(--red); }
.hk-dno { flex: none; width: 20px; height: 20px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 900; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
.hk-dad { flex: 1; min-width: 0; display: grid; }
.hk-dad b { font-size: 12.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hk-dad span { font-size: 11px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hk-dsag { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.hk-dsaat { font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }

.hr { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; font-variant-numeric: tabular-nums; }
.hr-bekliyor { background: var(--gray-soft); color: var(--ink-2); border: 1.5px solid var(--gray-soft); }
.hr-arandi { background: var(--blue-soft); color: var(--blue); border: 1.5px solid var(--blue-soft); }
.hr-yolda { background: var(--amber-soft); color: var(--amber-ink); border: 1.5px solid var(--amber-soft); }
.hr-fuarda { background: var(--violet-soft); color: var(--violet); border: 1.5px solid var(--violet-soft); }
.hr-oy_kullandi { background: var(--green); color: #fff; border: 1.5px solid var(--green); }
.hr-gec { background: var(--amber-soft); color: var(--amber-ink); border: 1.5px solid var(--amber); animation: smPulse 1.6s ease-in-out infinite; }

.harita-kap { position: relative; isolation: isolate; min-height: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--map); box-shadow: var(--shadow); }
.harita-harita { position: absolute; inset: 0; z-index: 0; background: var(--map); font-family: var(--font); }
.harita-harita.leaflet-container { font: 13px/1.4 var(--font); }
.harita-karo-suzgec { filter: saturate(.35) contrast(.95); }
:root[data-theme="dark"] .harita-karo-suzgec { filter: invert(.92) hue-rotate(180deg) saturate(.5) brightness(.9); }
.harita-harita .leaflet-control-attribution { background: color-mix(in srgb, var(--surface) 82%, transparent); color: var(--ink-3); font-size: 10px; border-radius: 6px; margin: 0 8px 6px 0 !important; padding: 1px 6px; }
.harita-harita .leaflet-control-attribution a { color: var(--ink-2); }
.harita-harita .leaflet-top.leaflet-right { top: 58px; }
.harita-harita .leaflet-top.leaflet-right .leaflet-control { margin: 0 12px 8px 0; }
.harita-harita .leaflet-bar { border: 1px solid var(--line-2); border-radius: 9px; overflow: hidden; box-shadow: var(--shadow); background-clip: padding-box; }
.harita-harita .leaflet-bar a { background: var(--surface); color: var(--ink); border-bottom-color: var(--line); width: 34px; height: 34px; line-height: 34px; font-size: 18px; text-align: center; font-weight: 700; }
.harita-harita .leaflet-bar a:hover { background: var(--hover); }
.harita-harita .leaflet-bar a.leaflet-disabled { color: var(--ink-3); background: var(--surface-2); }

.harita-ust-sag { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 8; align-items: flex-start; max-width: calc(100% - 24px); }
.hc-takip { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 12px; border-radius: 9px; background: var(--red); color: #fff; font-size: 12.5px; font-weight: 800; box-shadow: var(--shadow); white-space: nowrap; min-width: 0; }
.hc-takip em { font-style: normal; font-weight: 600; font-size: 12px; opacity: .92; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.hc-takip button { flex: none; height: 24px; padding: 0 8px; border-radius: 6px; border: 0; background: rgba(255, 255, 255, .2); color: #fff; font-family: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.hc-takip button:hover { background: rgba(255, 255, 255, .32); }
.hc-trafik { position: relative; flex: none; height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink) !important; font-size: 12.5px; font-weight: 800; cursor: pointer; box-shadow: var(--shadow); text-decoration: none; }
.hc-trafik:hover { background: var(--hover); }
.hc-nokta { width: 26px; height: 6px; border-radius: 99px; background: linear-gradient(90deg, #34C46A 0 33%, #EAB308 33% 66%, #E3213F 66%); opacity: .5; transition: opacity .12s; }
.hc-trafik:hover .hc-nokta, .hc-trafik:focus-visible .hc-nokta { opacity: 1; }
.hc-balon { position: absolute; top: calc(100% + 8px); right: 0; width: max-content; max-width: 280px; padding: 8px 10px; border-radius: 8px; background: var(--ink); color: var(--surface); font-size: 12px; font-weight: 700; line-height: 1.35; white-space: normal; box-shadow: var(--shadow); opacity: 0; transform: translateY(-4px); transition: opacity .12s, transform .12s; pointer-events: none; z-index: 5; }
.hc-balon em { display: block; font-style: normal; font-weight: 500; opacity: .75; margin-top: 3px; }
.hc-trafik:hover .hc-balon, .hc-trafik:focus-visible .hc-balon { opacity: 1; transform: none; }

.harita-lejant { position: absolute; left: 12px; bottom: 28px; z-index: 8; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; max-width: calc(100% - 24px); padding: 8px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
.hl { display: flex; align-items: center; gap: 5px; padding: 0; border: 0; background: none; font: 500 11.5px/1.2 var(--font); color: var(--ink-2); white-space: nowrap; cursor: pointer; }
.hl.sabit { cursor: default; }
button.hl:hover { color: var(--ink); }
.hl.kapali { opacity: .45; text-decoration: line-through; }
.hl-nokta { width: 10px; height: 10px; border-radius: 99px; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--line-2); box-sizing: content-box; flex: none; }
.hl-arac { width: 12px; height: 12px; border-radius: 4px; background: #17171a; box-shadow: 0 0 0 1px var(--line-2); }
.hl-not { width: 10px; height: 10px; border-radius: 99px; background: var(--amber); }

.hp-kap, .ha-kap, .hv-kap { background: none; border: 0; }
.g-bekliyor { --pc: var(--ink-3); } .g-arandi { --pc: var(--blue); } .g-yolda { --pc: var(--amber); } .g-fuarda { --pc: var(--violet); } .g-oy_kullandi { --pc: var(--green); }
.hpin { position: absolute; left: 0; top: 0; width: 12px; height: 12px; transform: translate(-50%, -50%); border-radius: 99px; background: var(--pc, var(--ink-3)); border: 2px solid #fff; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fff; line-height: 1; font-variant-numeric: tabular-nums; box-shadow: 0 1px 4px rgba(0, 0, 0, .35); transition: width .15s, height .15s, opacity .15s; cursor: pointer; }
.hpin::before { content: ''; position: absolute; inset: -6px; border-radius: 50%; }
.hpin span { position: relative; }
.hpin.on { width: 18px; height: 18px; }
.hpin.b { width: 22px; height: 22px; }
.hpin.bit { opacity: .55; }
.hpin.gec { border: 2.5px solid var(--amber); animation: smPulse 1.6s ease-in-out infinite; }
.hpin .w { display: none; position: absolute; top: -7px; right: -7px; width: 12px; height: 12px; border-radius: 99px; background: var(--amber); color: #1a1200; font-size: 9px; font-weight: 900; font-style: normal; align-items: center; justify-content: center; border: 1.5px solid #fff; box-sizing: border-box; }
.hpin.uyari .w { display: flex; }

.ha-kap.kayiyor { transition: transform 1s cubic-bezier(.25, .7, .3, 1); }
.harita-arac { position: absolute; left: 0; top: 0; width: 0; height: 0; --ac: var(--green); cursor: pointer; }
.harita-arac.st-hazir { --ac: var(--green); } .harita-arac.st-yolda { --ac: var(--amber); } .harita-arac.st-fuarda { --ac: var(--violet); } .harita-arac.st-mola { --ac: var(--ink-3); } .harita-arac.st-arizali { --ac: #8a5a00; }
.harita-arac.eski { opacity: .45; }
.ha-ikon { position: absolute; left: -15px; top: -15px; width: 30px; height: 30px; border-radius: 9px; background: #17171a; border: 2.5px solid #fff; box-shadow: 0 0 0 3px var(--ac), 0 4px 10px rgba(0, 0, 0, .35); box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
.harita-arac.odak .ha-ikon { border-color: var(--red); }
.ha-ok { color: #fff; font-size: 12px; line-height: 1; }
.ha-ok.yon-yok { font-size: 8px; opacity: .8; }
.ha-etiket { position: absolute; left: 0; bottom: 21px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--line-2); border-radius: 6px; padding: 2px 5px 2px 3px; box-shadow: var(--shadow); white-space: nowrap; }
.ha-plaka { display: inline-flex; align-items: stretch; height: 18px; border: 1px solid #111; border-radius: 3px; background: #fff; overflow: hidden; }
.ha-plaka i { width: 5px; background: #1F4FA8; }
.ha-plaka b { padding: 0 4px; display: flex; align-items: center; font-size: 9.5px; font-weight: 800; color: #111; font-variant-numeric: tabular-nums; }
.ha-sofor { font-size: 10.5px; font-weight: 700; color: var(--ink); }
.ha-yas { position: absolute; left: 0; top: 21px; transform: translateX(-50%); font-size: 10px; font-weight: 700; color: var(--ink-2); background: var(--surface); border-radius: 4px; padding: 1px 4px; white-space: nowrap; box-shadow: var(--shadow); font-variant-numeric: tabular-nums; }
.harita-arac.eski .ha-yas { color: var(--amber-ink); }
.harita-arac.etiketsiz .ha-etiket, .harita-arac.etiketsiz .ha-yas { display: none; }

.harita-varis { position: absolute; left: -15px; top: -15px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
.hv-ikon { flex: none; width: 30px; height: 30px; border-radius: 8px; background: #17171a; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, .3); }
.hv-etiket { display: flex; flex-direction: column; line-height: 1.15; background: var(--surface); border: 1px solid var(--line-2); border-radius: 7px; padding: 4px 8px; box-shadow: var(--shadow); }
.hv-etiket b { font-size: 12px; font-weight: 900; letter-spacing: .04em; white-space: nowrap; color: var(--ink); }
.hv-etiket span { font-size: 10.5px; color: var(--ink-3); white-space: nowrap; }

.harita-kalan { stroke: var(--red); stroke-opacity: .9; stroke-width: 2.5px; stroke-dasharray: 6 5; fill: none; }
.harita-iz { stroke: #17171a; stroke-opacity: .35; stroke-width: 2.5px; fill: none; }
:root[data-theme="dark"] .harita-iz { stroke: #F3F3F4; }
.harita-iz.odak { stroke: var(--red); stroke-opacity: .9; stroke-width: 3.5px; }

.harita-ipucu.leaflet-tooltip { background: var(--ink); color: var(--surface); border: 0; border-radius: 7px; padding: 5px 9px; font: 700 12px/1.3 var(--font); box-shadow: var(--shadow); }
.harita-ipucu.leaflet-tooltip span { display: block; font-weight: 500; font-size: 11px; opacity: .75; }
.harita-ipucu.leaflet-tooltip-top::before { border-top-color: var(--ink); }
.harita-popup .leaflet-popup-content-wrapper { background: var(--surface); color: var(--ink); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: var(--shadow-lg); padding: 12px; animation: smIn .15s ease-out; }
.harita-popup .leaflet-popup-tip { background: var(--surface); box-shadow: none; border: 1px solid var(--line-2); }
.harita-popup .leaflet-popup-content { margin: 0; font: 13px/1.4 var(--font); }
.hp { display: flex; flex-direction: column; gap: 9px; }
.hp-ust { display: flex; align-items: flex-start; gap: 8px; }
.hp-baslik { flex: 1; min-width: 0; }
.hp-ad { font-size: 15px; font-weight: 800; }
.hp-firma { font-size: 12px; color: var(--ink-2); line-height: 1.35; margin-top: 2px; }
.hp-kapat { flex: none; width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); cursor: pointer; font-size: 15px; line-height: 1; }
.hp-kapat:hover { background: var(--hover); }
.hp-rozet { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.hp-saat { font-size: 12px; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.hp-not { font-size: 12px; line-height: 1.35; padding: 6px 8px; border-radius: 7px; color: var(--ink); }
.hp-not span { color: var(--ink-3); }
.hp-saha { background: var(--amber-soft); }
.hp-saha b { color: var(--amber-ink); }
.hp-karsi { background: var(--surface-2); border: 1px solid var(--line); }
.hp-karsi b { color: var(--ink); }
.hp-karsi-yok { color: var(--ink-2); font-weight: 600; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; }
.hp-karsila { margin-left: auto; height: 26px; padding: 0 10px; border-radius: 7px; border: 0; background: var(--red); color: #fff; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.hp-karsila:disabled { opacity: .5; }
.hp-alma { background: var(--red-soft); }
.hp-alma b { color: var(--red); }
.hp-eylem { display: flex; gap: 6px; }
.hp-kart { flex: 1; height: 34px; border-radius: 8px; border: 0; background: var(--ink); color: var(--surface); font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.hp-bag { flex: none; height: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); color: var(--ink) !important; font-size: 12.5px; font-weight: 700; display: flex; align-items: center; background: var(--surface); text-decoration: none; }
a.hp-bag:hover { background: var(--hover); }
.hp-bag.yok { opacity: .35; }
.hp-sayilar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.hp-sayilar div { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 7px 8px; display: grid; }
.hp-sayilar b { font-size: 20px; font-weight: 900; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.hp-sayilar span { font-size: 11px; font-weight: 700; color: var(--ink-3); }
.hp-zayif { color: var(--ink-3); font-size: 12px; font-weight: 600; }

/* tahmini konum dairesi: renk token'dan (72 kırmızı, 26-27 turkuaz); sözlü/ilçe kesik çizgi + %12 dolgu, GPS ince */
.harita-daire { stroke: var(--red); fill: var(--red); stroke-width: 2px; stroke-opacity: .9; fill-opacity: .12; stroke-dasharray: 12 8; }
.harita-daire.k-gps { stroke-width: 1px; stroke-dasharray: none; stroke-opacity: .6; fill-opacity: .1; }
.harita-daire.tavan { fill-opacity: .05; stroke-opacity: .45; }
.harita-daire.odak { stroke-width: 2.5px; stroke-opacity: 1; }
.harita-daire.yakin { stroke: var(--marka-parlak); fill: var(--marka-parlak); stroke-width: 3px; stroke-opacity: 1; fill-opacity: .2; animation: hdNabiz 1.6s ease-in-out infinite; }
.harita-daire.onizleme { stroke-width: 2px; stroke-opacity: 1; fill-opacity: .16; }
.harita-kg-merkez { stroke: #fff; stroke-width: 2px; fill: var(--red); fill-opacity: 1; }
@keyframes hdNabiz { 0%, 100% { stroke-opacity: 1; } 50% { stroke-opacity: .35; } }
.harita-arac.yakin .ha-ikon { animation: haNabiz 1.6s ease-in-out infinite; box-shadow: 0 0 0 3px var(--marka-parlak), 0 0 0 5px color-mix(in srgb, var(--marka-parlak) 45%, transparent), 0 4px 10px rgba(0, 0, 0, .35); }
@keyframes haNabiz {
  0%, 100% { box-shadow: 0 0 0 3px var(--marka-parlak), 0 0 0 5px color-mix(in srgb, var(--marka-parlak) 45%, transparent), 0 4px 10px rgba(0, 0, 0, .35); }
  50% { box-shadow: 0 0 0 3px var(--marka-parlak), 0 0 0 12px color-mix(in srgb, var(--marka-parlak) 0%, transparent), 0 4px 10px rgba(0, 0, 0, .35); }
}
.harita-arac.yakin .ha-yas { color: var(--ink); background: color-mix(in srgb, var(--marka-parlak) 30%, var(--surface)); }
.kg-acik .harita-daire { pointer-events: none !important; }
.harita-kap.kg-acik .leaflet-container, .harita-kap.kg-acik .leaflet-grab { cursor: crosshair; }
.hl-daire { width: 12px; height: 12px; border-radius: 99px; border: 1.5px dashed var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); box-sizing: border-box; flex: none; }
.hl-daire.yakin { border: 2px solid var(--marka-parlak); background: color-mix(in srgb, var(--marka-parlak) 28%, transparent); }
.hk-tahmin { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 11.5px; font-weight: 600; color: var(--ink-2); }
.hk-tahmin > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hk-tahmin b { color: var(--ink); }
.hk-tahmin-ic { flex: none; width: 11px; height: 11px; border-radius: 99px; border: 1.5px dashed var(--red); background: var(--red-soft); box-sizing: border-box; }
.hk-tahmin.yakin .hk-tahmin-ic { border: 2px solid var(--marka-parlak); background: color-mix(in srgb, var(--marka-parlak) 28%, transparent); }
.hd-ana { font-size: 12.5px; font-weight: 700; line-height: 1.4; color: var(--ink); }
.hd-metin { background: var(--red-soft); font-weight: 600; }
.hd-yakin { background: color-mix(in srgb, var(--marka-parlak) 16%, var(--surface)); border: 1px solid var(--marka-parlak); }

/* Konum gir paneli (Admin / araç yöneticisi): haritanın sol üstünde, harita dokunulabilir kalır */
.hkg { position: absolute; top: 12px; left: 12px; z-index: 9; width: 340px; max-width: calc(100% - 24px); box-sizing: border-box; display: flex; flex-direction: column; gap: 9px; padding: 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-2); box-shadow: var(--shadow-lg); color: var(--ink); font: 13px/1.4 var(--font); animation: smIn .15s ease-out; }
.hkg-ust { display: flex; align-items: center; gap: 8px; }
.hkg-ust b { font-size: 14px; font-weight: 900; white-space: nowrap; }
.hkg-arac { flex: 1; min-width: 0; height: 30px; padding: 0 6px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink); font: 700 12.5px/1 var(--font); }
.hkg-ara { display: flex; gap: 6px; margin: 0; }
.hkg-ara input { flex: 1; min-width: 0; height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink); font: 500 15px/1 var(--font); outline: none; }
.hkg-ara input:focus { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); background: var(--surface); }
.hkg-ara input::placeholder { color: var(--ink-3); font-size: 13px; }
.hkg-ara button { flex: none; height: 36px; padding: 0 14px; border-radius: 8px; border: 0; background: var(--ink); color: var(--surface); font: 800 13px/1 var(--font); cursor: pointer; }
.hkg-ara button:disabled { opacity: .5; cursor: progress; }
.hkg-sonuc { display: flex; flex-direction: column; gap: 4px; max-height: 168px; overflow: auto; overscroll-behavior: contain; }
.hkg-sonuc:empty { display: none; }
.hkg-s { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font: 600 12.5px/1.3 var(--font); text-align: left; cursor: pointer; }
.hkg-s:hover { background: var(--hover); border-color: var(--line-2); }
.hkg-s span { flex: 1; min-width: 0; }
.hkg-s small, .hkg-dog-b small { font-size: 11px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }
.hkg-bos { padding: 2px; font-size: 12px; font-weight: 600; color: var(--ink-3); }
.hkg-ipucu { font-size: 12px; font-weight: 600; color: var(--ink-3); text-align: center; }
.hkg-dog { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.hkg-dog-b { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font: 700 12.5px/1.2 var(--font); cursor: pointer; }
.hkg-dog-b:hover { background: var(--hover); }
.hkg-dog-b.on { border: 1.5px solid var(--red); background: var(--red-soft); padding: 5.5px 3.5px; }
.hkg-dog-b.on small { color: var(--ink-2); }
.hkg-alt { display: flex; align-items: center; gap: 8px; }
.hkg-nokta { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hkg-kaydet { flex: none; height: 36px; padding: 0 18px; border-radius: 8px; border: 0; background: var(--red); color: var(--on-red); font: 800 13px/1 var(--font); cursor: pointer; }
.hkg-kaydet:disabled { opacity: .45; cursor: not-allowed; }
.hk-a4 > button { white-space: nowrap; }

@media (max-width: 1180px) { .hc-takip em { display: none; } }
@media (max-width: 900px) {
  .harita-sayfa { grid-template-columns: 300px minmax(0, 1fr); height: calc(100vh - var(--ust-h) - 28px); height: calc(100dvh - var(--ust-h) - 28px); }
}
@media (max-width: 760px) {
  .harita-sayfa { grid-template-columns: 1fr; grid-template-rows: 62vh auto; height: auto; }
  .harita-kap { order: -1; }
  .harita-liste { max-height: 60vh; }
  .harita-lejant { max-width: calc(100% - 24px); }
  .hkg { top: 8px; left: 8px; right: 8px; width: auto; max-width: none; }
  .kg-acik .harita-ust-sag { display: none; }
}`;
  document.head.appendChild(s);
}
