// 72. Komite · Seçim Masası · HARİTA (ATLAS, 2026-09-30)
// Servis durakları (gün durumuna göre renkli pin), rota çizgileri, Fuar İzmir varış işareti ve canlı araçlar.
// Canlı olaylarda harita baştan kurulmaz: pin, çizgi ve araç ikonları yerinde güncellenir (titreme yok).
// Başka ekrandan bağlantı: #harita/firma-<id> (pini açar) · #harita/arac-<id> (araca kilitlenir) · #harita/rota-<rota_kod>
import {
  store, esc, fmt, trBaslik, trArama, DURUMLAR, DURUM_AD, VARIS, gecikme, firmaAdi, firmaListesi,
  aracKonumlari, sayac, yazabilirMi,
} from '../core.js';
import { el, rozetDurum, rozetSinif, rozetAracDurum, plakaHtml, uyariRozetleri, kisiKartiAc, toast } from '../ui.js';

// ---------------------------------------------------------------- sabitler
// ALTLIK: CARTO Positron / dark_all istendi, ancak 2026-09-30 itibarıyla basemaps.cartocdn.com her karoda
// "API KEY REQUIRED" görseli döndürüyor (curl ile doğrulandı). Anahtar gelene kadar altlık OpenStreetMap:
// CSS süzgeciyle açık gri (Positron benzeri), koyu temada koyu gri yapılır. Anahtarlı bir karo adresi alınırsa
// ayarlar.harita.karo_url (ve isteğe bağlı karo_url_koyu) yazılması yeter; harita onu süzgeçsiz kullanır.
const OSM_KARO = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATIF = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları';
const ESKI_DK = 10;              // bu kadar dakikadır konum gelmeyen araç soluk + "konum eski"
const IZ_DK = 60;                // seçili aracın izi: son 60 dakika
const IZ_TAZELE_MS = 120000;     // iz 2 dakikada bir veritabanından tazelenir (60 dk penceresi kayar)
const IZMIR = [38.42, 27.14];
const ULASTI = ['fuarda', 'oy_kullandi'];
const ALINDI = ['yolda', 'fuarda', 'oy_kullandi'];
const SEKME_ANAHTAR = 'secim-harita-sekme';
const ARAC_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16.5V7.5A2.5 2.5 0 0 1 5.5 5h9.2a2 2 0 0 1 1.5.7l4.3 5a2 2 0 0 1 .5 1.3v4.5a1 1 0 0 1-1 1h-1.2"/><path d="M3 11h18"/><path d="M9.5 17.5h5"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/></svg>';
const SANDIK_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12.5h17V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M7.5 12.5V4.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v8"/><path d="m9.8 8.2 1.7 1.7 3-3.2"/><path d="M8 16.5h8"/></svg>';

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
const koyuMu = () => document.documentElement.dataset.tema === 'koyu';
const konumYasiDk = a => (a?.son_konum_zamani ? (Date.now() - new Date(a.son_konum_zamani).getTime()) / 60000 : Infinity);
const eskiMi = a => konumYasiDk(a) > ESKI_DK;
const temizAdres = a => String(a || '').replace(/İÇ KAPI NO\s*:?\s*\S+/gi, '').trim();
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
  const kap = S.karo.getContainer();
  kap?.classList.toggle('harita-karo-suzgec', a.suzgec);
  if (a.url !== S.karoUrl) { S.karoUrl = a.url; S.karo.setUrl(a.url); }
}
function rotaParca(kod) {
  const i = String(kod).indexOf(' · ');
  return i > 0 ? { ref: trBaslik(kod.slice(0, i)), ad: kod.slice(i + 3) } : { ref: '', ad: String(kod) };
}
const rotaAd = kod => { const p = rotaParca(kod); return p.ref ? `${p.ref} · ${p.ad}` : p.ad; };
const siraKarsilastir = (a, b) => (a.rota_sira ?? 999) - (b.rota_sira ?? 999) || String(a.tasima_saati || '').localeCompare(String(b.tasima_saati || '')) || a.id - b.id;
const rotaDuraklari = kod => firmaListesi().filter(f => f.rota_kod === kod).sort(siraKarsilastir);
const aracDuraklari = id => firmaListesi().filter(f => f.arac_id === id)
  .sort((a, b) => (a.arac_sira ?? 999) - (b.arac_sira ?? 999) || String(a.tasima_saati || '').localeCompare(String(b.tasima_saati || '')) || siraKarsilastir(a, b));
const telVar = t => !!(t && fmt.telLink(t));

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
      ulasan: duraklar.filter(f => ULASTI.includes(f.durum)).length,
      yolda: duraklar.filter(f => f.durum === 'yolda').length,
      geciken: duraklar.filter(f => gecikme(f) > 0).length,
      arac: aracId ? store.araclar.get(aracId) : null,
      arama: trArama([kod, ilceHam, ...duraklar.flatMap(f => [f.yetkili, f.unvan, f.ilce])].join(' ')),
    });
  }
  return liste.sort((a, b) => (a.ilkSaat ? 0 : 1) - (b.ilkSaat ? 0 : 1)
    || String(a.ilkSaat || '').localeCompare(String(b.ilkSaat || ''))
    || a.kod.localeCompare(b.kod, 'tr', { numeric: true }));
}

// ---------------------------------------------------------------- popup ve ipucu içerikleri
function ipucuHtml(id) {
  const f = store.firmalar.get(id); if (!f) return '';
  return `<b>${esc(firmaAdi(f))}</b>${f.tasima_saati ? ` · ${esc(fmt.saatKisa(f.tasima_saati))}` : ''}<span>${esc(DURUM_AD[f.durum] || f.durum)}${gecikme(f) ? ` · ${gecikme(f)} dk gecikti` : ''}</span>`;
}
function kisiPopupHtml(id) {
  const f = store.firmalar.get(id); if (!f) return '<div class="harita-pop">Kayıt bulunamadı</div>';
  const arac = f.arac_id ? store.araclar.get(f.arac_id) : null;
  const tel = [f.cep, f.cep2].find(telVar);
  const uyari = uyariRozetleri(f, { hepsi: false });
  const durumSaat = f.durum !== 'bekliyor' && f.durum_zamani ? `<span class="harita-pop-zayif">${esc(fmt.saat(f.durum_zamani))}</span>` : '';
  return `<div class="harita-pop">
    <div class="harita-pop-rozetler">${rozetSinif(f.oy_sinifi)} ${rozetDurum(f)} ${durumSaat}</div>
    ${uyari ? `<div class="harita-pop-rozetler">${uyari}</div>` : ''}
    <div class="harita-pop-ad">${esc(firmaAdi(f) || '(yetkili yok)')}</div>
    <div class="harita-pop-firma">${esc(f.unvan || '')}</div>
    <dl class="harita-pop-bilgi">
      <dt>Alma saati</dt><dd>${f.tasima_saati ? `<b class="rakam">${esc(fmt.saatKisa(f.tasima_saati))}</b>` : '<span class="harita-pop-zayif">Saat belirsiz</span>'}</dd>
      ${f.rota_kod ? `<dt>Rota</dt><dd>${esc(rotaAd(f.rota_kod))}${f.rota_sira ? ` · ${esc(f.rota_sira)}. durak` : ''}</dd>` : ''}
      ${f.ilce ? `<dt>İlçe</dt><dd>${esc(trBaslik(f.ilce))}</dd>` : ''}
      ${arac ? `<dt>Araç</dt><dd>${plakaHtml(arac.plaka)}</dd>` : ''}
    </dl>
    ${f.alma_notu ? `<div class="harita-pop-not">${esc(f.alma_notu)}</div>` : ''}
    <div class="harita-pop-eylem">
      <button type="button" class="btn btn-koyu btn-kucuk" data-kart="${f.id}">Kartı aç</button>
      ${tel ? `<a class="btn btn-kucuk" href="${fmt.telLink(tel)}">Ara</a>` : ''}
    </div>
  </div>`;
}
function aracPopupHtml(id) {
  const a = store.araclar.get(id); if (!a) return '<div class="harita-pop">Araç bulunamadı</div>';
  const d = aracDuraklari(id); const alinan = d.filter(f => ALINDI.includes(f.durum)).length;
  const eski = eskiMi(a); const takipte = S?.takip === id;
  const arabaBilgi = [a.marka, a.model, a.renk].filter(Boolean).join(' · ');
  return `<div class="harita-pop">
    <div class="harita-pop-rozetler">${plakaHtml(a.plaka)} ${rozetAracDurum(a.durum)}</div>
    <div class="harita-pop-ad">${esc(trBaslik(a.sofor_ad || 'Şoför atanmadı'))}</div>
    ${arabaBilgi ? `<div class="harita-pop-firma">${esc(arabaBilgi)}</div>` : ''}
    <dl class="harita-pop-bilgi">
      <dt>Son konum</dt><dd class="${eski ? 'harita-yazi-eski' : ''}">${esc(fmt.goreli(a.son_konum_zamani) || 'yok')}${eski ? ' · konum eski' : ''}</dd>
      ${d.length ? `<dt>Duraklar</dt><dd>${d.length} durak · ${alinan} alındı</dd>` : ''}
    </dl>
    <div class="harita-pop-eylem">
      <button type="button" class="btn btn-kucuk ${takipte ? 'btn-kirmizi' : 'btn-koyu'}" data-takip="${a.id}">${takipte ? 'Takibi bırak' : 'Takip et'}</button>
      ${telVar(a.sofor_tel) ? `<a class="btn btn-kucuk" href="${fmt.telLink(a.sofor_tel)}">Şoförü ara</a>` : ''}
    </div>
  </div>`;
}
function varisPopupHtml() {
  const v = varis(); const s = sayac(); const z = store.ayarlar.zaman || {};
  const duraklar = firmaListesi().filter(konumlu);
  const ulasan = duraklar.filter(f => ULASTI.includes(f.durum)).length;
  return `<div class="harita-pop">
    <div class="harita-pop-rozetler"><span class="rozet s-bizde">OY YERİ</span></div>
    <div class="harita-pop-ad">${esc(v.ad)}</div>
    <div class="harita-pop-firma">${z.bas && z.bit ? `Oy verme ${esc(z.bas)}-${esc(z.bit)}` : 'Seçim günü varış noktası'}</div>
    <div class="harita-pop-sayilar">
      <div><b>${fmt.sayi(s.fuarda)}</b><span>Fuarda</span></div>
      <div><b>${fmt.sayi(s.oy_kullandi)}</b><span>Oy kullandı</span></div>
      <div><b>${fmt.sayi(s.yolda)}</b><span>Yolda</span></div>
    </div>
    ${duraklar.length ? `<div class="harita-pop-zayif">Servis durakları: ${ulasan}/${duraklar.length} fuara ulaştı</div>` : ''}
    <div class="harita-pop-eylem"><a class="btn btn-kucuk" target="_blank" rel="noopener" href="${fmt.mapsLink(v.ad + ', İzmir')}">Yol tarifi</a></div>
  </div>`;
}
// açık popup'ın içeriğini yerinde değiştir (popup.update() haritayı kaydırabildiği için kullanılmaz)
function popupIcerik(isaret, html) {
  const ic = isaret.getPopup()?.getElement()?.querySelector('.leaflet-popup-content');
  if (ic) ic.innerHTML = html;
}

// ---------------------------------------------------------------- işaretler: pin, araç, varış
function pinKur(f) {
  const id = f.id;
  const m = L.marker([Number(f.lat), Number(f.lon)], {
    icon: L.divIcon({ className: 'harita-pin-kap', html: '<div class="harita-pin"><b></b></div>', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -8], tooltipAnchor: [0, -10] }),
    riseOnHover: true,
  });
  const p = { m, z: 0, popupHtml: '' };
  m.bindTooltip(() => ipucuHtml(id), { direction: 'top', className: 'harita-ipucu', opacity: 1 });
  m.bindPopup(() => (p.popupHtml = kisiPopupHtml(id)), { className: 'harita-popup', minWidth: 250, maxWidth: 310, autoPanPaddingTopLeft: [24, 64], autoPanPaddingBottomRight: [24, 48] });
  m.on('popupopen', () => { if (!S) return; m.closeTooltip(); S.seciliKisi = id; S.sonSecim = 'kisi'; esitle(); });
  m.on('popupclose', () => { if (!S) return; if (S.seciliKisi === id) { S.seciliKisi = null; if (S.sonSecim === 'kisi') S.sonSecim = S.seciliRota ? 'rota' : S.seciliArac ? 'arac' : null; } esitle(); });
  return p;
}
function aracKur(a) {
  const id = a.id;
  const m = L.marker([Number(a.son_lat), Number(a.son_lon)], {
    icon: L.divIcon({ className: 'harita-arac-kap', html: `<div class="harita-arac"><span class="harita-arac-rozet">${ARAC_SVG}</span><span class="harita-arac-etiket"><b></b><i></i><em></em></span></div>`, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16] }),
    zIndexOffset: 1000,
  });
  const k = { m, popupHtml: '', zaman: null };
  m.bindPopup(() => (k.popupHtml = aracPopupHtml(id)), { className: 'harita-popup', minWidth: 240, maxWidth: 300, autoPanPaddingTopLeft: [24, 64], autoPanPaddingBottomRight: [24, 48] });
  m.on('click', () => { if (S && S.seciliArac !== id) aracSec(id, { yakinlas: false }); });
  m.on('popupopen', () => { if (S) { S.sonSecim = 'arac'; trafikCiz(); } });
  S.katman.arac.addLayer(m);
  return k;
}
function aracIkonGuncelle(k, a) {
  const d = k.m.getElement()?.firstElementChild; if (!d) return;
  const eski = eskiMi(a);
  const cls = `harita-arac harita-a-${a.durum || 'hazir'}${eski ? ' eski' : ''}${S.seciliArac === a.id ? ' sec' : ''}${S.takip === a.id ? ' takip' : ''}`;
  if (d.className !== cls) d.className = cls;
  const [b, i, em] = d.querySelectorAll('.harita-arac-etiket > *');
  const plaka = fmt.plaka(a.plaka), sofor = trBaslik(a.sofor_ad || 'Şoför atanmadı'), not = eski ? `konum eski · ${fmt.goreli(a.son_konum_zamani)}` : '';
  if (b.textContent !== plaka) b.textContent = plaka;
  if (i.textContent !== sofor) i.textContent = sofor;
  if (em.textContent !== not) em.textContent = not;
  const z = S.seciliArac === a.id ? 3000 : 1000;
  if (k.z !== z) { k.z = z; k.m.setZIndexOffset(z); }
}
// araç yeni konuma kayarak gider (yalnız bu an için geçiş; yakınlaştırmada geçiş kapalı)
function aracKaydir(k, ll) {
  const e = k.m.getElement();
  if (e && !S.yakinlasiyor) { e.classList.add('kayiyor'); clearTimeout(k.kayZaman); k.kayZaman = setTimeout(() => e.classList.remove('kayiyor'), 1100); }
  k.m.setLatLng(ll);
}
function varisKur() {
  const v = varis();
  S.varisM = L.marker([v.lat, v.lon], {
    icon: L.divIcon({ className: 'harita-varis-kap', html: `<div class="harita-varis"><div class="harita-varis-ikon">${SANDIK_SVG}</div><div class="harita-varis-etiket">FUAR İZMİR<span>Oy yeri · Gaziemir</span></div></div>`, iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -26] }),
    zIndexOffset: 5000, riseOnHover: false,
  }).addTo(S.map);
  S.varisM.bindPopup(() => (S.varisHtml = varisPopupHtml()), { className: 'harita-popup', minWidth: 240, maxWidth: 280 });
}

// ---------------------------------------------------------------- canlı eşitleme (baştan kurmadan)
function esitle() {
  if (!S) return;
  // 1) kişi pinleri
  const gorulen = new Set();
  for (const f of store.firmalar.values()) {
    if (!konumlu(f)) continue;
    gorulen.add(f.id);
    let p = S.pinler.get(f.id);
    const ll = [Number(f.lat), Number(f.lon)];
    if (!p) { p = pinKur(f); S.pinler.set(f.id, p); }
    else { const e = p.m.getLatLng(); if (e.lat !== ll[0] || e.lng !== ll[1]) p.m.setLatLng(ll); }
    const gorunur = !gizliDurumlar.has(f.durum);
    const var_ = S.katman.pin.hasLayer(p.m);
    if (gorunur && !var_) S.katman.pin.addLayer(p.m);
    else if (!gorunur && var_) S.katman.pin.removeLayer(p.m);
    if (p.m.isPopupOpen()) { const h = kisiPopupHtml(f.id); if (h !== p.popupHtml) { p.popupHtml = h; popupIcerik(p.m, h); } }
  }
  for (const [id, p] of S.pinler) if (!gorulen.has(id)) { S.katman.pin.removeLayer(p.m); S.pinler.delete(id); }
  if (S.seciliRota && !firmaListesi().some(f => f.rota_kod === S.seciliRota)) S.seciliRota = null;
  pinVurgu();
  // 2) rota çizgileri
  cizgileriEsitle();
  // 3) canlı araçlar
  const aracGorulen = new Set();
  for (const a of store.araclar.values()) {
    if (!aracKonumlu(a)) continue;
    aracGorulen.add(a.id);
    const ll = [Number(a.son_lat), Number(a.son_lon)];
    let k = S.aracM.get(a.id);
    if (!k) { k = aracKur(a); S.aracM.set(a.id, k); }
    else {
      const e = k.m.getLatLng();
      if (e.lat !== ll[0] || e.lng !== ll[1]) {
        aracKaydir(k, ll);
        if (S.takip === a.id) S.map.panTo(ll, { animate: true, duration: 0.8 });
        if (S.iz?.aracId === a.id) { S.iz.cizgi.addLatLng(ll); S.iz.sayi++; }
      }
    }
    aracIkonGuncelle(k, a);
    if (k.m.isPopupOpen()) { const h = aracPopupHtml(a.id); if (h !== k.popupHtml) { k.popupHtml = h; popupIcerik(k.m, h); } }
  }
  for (const [id, k] of S.aracM) if (!aracGorulen.has(id)) { S.katman.arac.removeLayer(k.m); S.aracM.delete(id); }
  if (S.seciliArac && !store.araclar.has(S.seciliArac)) { S.seciliArac = null; S.takip = null; izTemizle(); }
  // 4) varış (ayar değişirse yer değiştirir)
  if (S.varisM) {
    const v = varis(); const e = S.varisM.getLatLng();
    if (e.lat !== v.lat || e.lng !== v.lon) S.varisM.setLatLng([v.lat, v.lon]);
    if (S.varisM.isPopupOpen()) { const h = varisPopupHtml(); if (h !== S.varisHtml) { S.varisHtml = h; popupIcerik(S.varisM, h); } }
  }
  // 5) çevre
  altlikEsitle();
  lejantCiz(); panelCiz(); trafikCiz(); takipCiz();
  // veri ekran açıldıktan sonra geldiyse (ilk yükleme) haritayı bir kez duraklara sığdır
  if (!S.sigdi && S.pinler.size) { S.sigdi = true; tumunuGoster(false, { cekirdek: true }); }
  hafiza.rota = S.seciliRota; hafiza.arac = S.seciliArac; hafiza.takip = S.takip;
}
function vurguKumesi() {
  if (S.seciliRota) { const m = new Map(); rotaDuraklari(S.seciliRota).forEach((f, i) => m.set(f.id, f.rota_sira ?? i + 1)); return m; }
  if (S.seciliArac) { const d = aracDuraklari(S.seciliArac); if (d.length) { const m = new Map(); d.forEach((f, i) => m.set(f.id, i + 1)); return m; } }
  return null;
}
function pinVurgu() {
  const kume = vurguKumesi();
  for (const [id, p] of S.pinler) {
    const f = store.firmalar.get(id); const d = p.m.getElement()?.firstElementChild; if (!f || !d) continue;
    const sira = kume?.get(id); const gec = gecikme(f) > 0; const aktif = S.seciliKisi === id;
    const cls = `harita-pin harita-d-${f.durum}${gec ? ' gec' : ''}${sira != null ? ' sec' : kume ? ' sonuk' : ''}${aktif ? ' aktif' : ''}`;
    if (d.className !== cls) d.className = cls;
    const t = sira != null ? String(sira) : '';
    if (d.firstElementChild.textContent !== t) d.firstElementChild.textContent = t;
    const z = aktif ? 900 : sira != null ? 600 : gec ? 300 : 0;
    if (p.z !== z) { p.z = z; p.m.setZIndexOffset(z); }
  }
}
function cizgileriEsitle() {
  const v = varis(); const gruplar = new Map();
  for (const f of store.firmalar.values()) {
    if (!f.rota_kod || !konumlu(f)) continue;
    let l = gruplar.get(f.rota_kod); if (!l) gruplar.set(f.rota_kod, l = []); l.push(f);
  }
  for (const [kod, duraklar] of gruplar) {
    duraklar.sort(siraKarsilastir);
    const ll = [...duraklar.map(f => [Number(f.lat), Number(f.lon)]), [v.lat, v.lon]];
    const imza = ll.join(';');
    let c = S.cizgiler.get(kod);
    if (!c) {
      c = { l: L.polyline(ll, { className: 'harita-cizgi', color: '#7A7A78', weight: 1.5, opacity: 0.55, dashArray: '4 6', lineCap: 'round' }), imza };
      c.l.bindTooltip(() => esc(rotaAd(kod)), { sticky: true, className: 'harita-ipucu', opacity: 1 });
      c.l.on('click', () => rotaSec(kod, { toggle: false }));
      S.katman.rota.addLayer(c.l); S.cizgiler.set(kod, c);
    } else if (c.imza !== imza) { c.l.setLatLngs(ll); c.imza = imza; }
    const yol = c.l.getElement(); if (!yol) continue;
    const sec = kod === S.seciliRota;
    yol.classList.toggle('sec', sec);
    yol.classList.toggle('sonuk', !!S.seciliRota && !sec);
    yol.classList.toggle('bitti', duraklar.every(f => ULASTI.includes(f.durum)));
    if (sec && !c.onde) c.l.bringToFront();
    c.onde = sec;
  }
  for (const [kod, c] of S.cizgiler) if (!gruplar.has(kod)) { S.katman.rota.removeLayer(c.l); S.cizgiler.delete(kod); }
}

// ---------------------------------------------------------------- seçimler: rota, kişi, araç, takip
function sigdir(noktalar, animate = true) {
  if (!noktalar.length) return;
  if (noktalar.length === 1) { S.map.setView(noktalar[0], Math.max(S.map.getZoom(), 15), { animate }); return; }
  S.map.fitBounds(L.latLngBounds(noktalar), { paddingTopLeft: [40, 70], paddingBottomRight: [40, 60], maxZoom: 15, animate });
}
function tumNoktalar() {
  const n = firmaListesi().filter(f => konumlu(f) && !gizliDurumlar.has(f.durum)).map(f => [Number(f.lat), Number(f.lon)]);
  for (const a of store.araclar.values()) if (aracKonumlu(a)) n.push([Number(a.son_lat), Number(a.son_lon)]);
  const v = varis(); n.push([v.lat, v.lon]);
  return n;
}
function tumunuGoster(animate = true, { cekirdek = false } = {}) {
  let n = tumNoktalar();
  // ilk açılışta şehir çekirdeği: Fuar'a 30 km'den uzak tek tük duraklar (Çeşme, Urla) haritayı küçültmesin; "Tümü" hepsini gösterir
  if (cekirdek && n.length > 4) {
    const v = L.latLng(varis().lat, varis().lon);
    const yakin = n.filter(x => v.distanceTo(x) <= 30000);
    if (yakin.length >= n.length * 0.8) n = yakin;
  }
  if (n.length > 1) sigdir(n, animate); else S.map.setView(n[0] || IZMIR, 11, { animate });
}
function rotaSec(kod, { toggle = true, yakinlas = true } = {}) {
  if (yakinlas) S.takip = null;
  if (toggle && S.seciliRota === kod) { S.seciliRota = null; S.sonSecim = S.seciliArac ? 'arac' : null; }
  else {
    S.seciliRota = kod; S.sonSecim = 'rota';
    if (yakinlas) sigdir(rotaDuraklari(kod).filter(konumlu).map(f => [Number(f.lat), Number(f.lon)]));
  }
  if (S.seciliRota && S.sekme !== 'rotalar') sekmeYap('rotalar');
  esitle();
  if (S.seciliRota) satirGoster(S.seciliRota);
}
// seçilen rota satırı ve açılan durak listesi panelde görünür olsun (gerekirse en az kaydırmayla)
function satirGoster(kod) {
  const satir = S.liste.querySelector(`[data-rota="${CSS.escape(kod)}"]`); if (!satir) return;
  const duraklar = satir.nextElementSibling?.classList.contains('harita-duraklar') ? satir.nextElementSibling : null;
  const l = S.liste.getBoundingClientRect(), ust = satir.getBoundingClientRect().top, alt = (duraklar || satir).getBoundingClientRect().bottom;
  let d = 0;
  if (alt > l.bottom - 6) d = alt - l.bottom + 6;
  if (ust - d < l.top + 6) d = ust - l.top - 6;
  if (d) S.liste.scrollBy({ top: d, behavior: 'smooth' });
}
function kisiOdak(id) {
  const f = store.firmalar.get(id); const p = S.pinler.get(id);
  if (!f || !p) { kisiKartiAc(id); return; }
  S.takip = null;
  if (gizliDurumlar.has(f.durum)) gizliDurumlar.delete(f.durum);
  esitle();
  S.map.setView(p.m.getLatLng(), Math.max(S.map.getZoom(), 15), { animate: true });
  p.m.openPopup();
}
function aracSec(id, { takip = false, yakinlas = true } = {}) {
  const a = store.araclar.get(id); if (!a) return;
  if (S.seciliArac !== id) { S.seciliArac = id; S.takip = null; izGoster(id); }
  if (takip) S.takip = id;
  S.sonSecim = 'arac';
  if (yakinlas) {
    if (aracKonumlu(a)) S.map.setView([Number(a.son_lat), Number(a.son_lon)], Math.max(S.map.getZoom(), takip ? 15 : 14), { animate: true });
    else sigdir(aracDuraklari(id).filter(konumlu).map(f => [Number(f.lat), Number(f.lon)]));
  }
  esitle();
}
function aracBirak() {
  S.seciliArac = null; S.takip = null; izTemizle();
  if (S.sonSecim === 'arac') S.sonSecim = S.seciliRota ? 'rota' : null;
  esitle();
}
function takipDegistir(id) {
  if (S.takip === id) { S.takip = null; esitle(); return; }
  const a = store.araclar.get(id);
  if (!aracKonumlu(a)) { toast('Bu araçtan henüz konum gelmedi', { tur: 'hata' }); return; }
  aracSec(id, { takip: true });
}
function takipBirak() { if (S.takip) { S.takip = null; esitle(); } }

// seçili aracın son 60 dk izi
async function izGoster(aracId) {
  const istek = ++S.izIstek;
  let noktalar = [];
  try { noktalar = await aracKonumlari(aracId, IZ_DK); } catch (e) { console.warn('iz', e); }
  if (!S || S.izIstek !== istek || S.seciliArac !== aracId) return;
  const ll = noktalar.filter(n => sayiMi(n.lat) && sayiMi(n.lon)).map(n => [Number(n.lat), Number(n.lon)]);
  const a = store.araclar.get(aracId);
  if (aracKonumlu(a)) { const son = ll[ll.length - 1]; const s = [Number(a.son_lat), Number(a.son_lon)]; if (!son || son[0] !== s[0] || son[1] !== s[1]) ll.push(s); }
  const eskiIz = S.iz;
  const cizgi = L.polyline(ll, { className: 'harita-iz', color: '#C8102E', weight: 4, opacity: 0.85, lineJoin: 'round', lineCap: 'round', interactive: false });
  const bas = ll.length > 1 ? L.circleMarker(ll[0], { className: 'harita-iz-bas', radius: 4, weight: 2, color: '#fff', fillColor: '#C8102E', fillOpacity: 1, interactive: false }) : null;
  S.katman.iz.addLayer(cizgi); if (bas) S.katman.iz.addLayer(bas);
  S.iz = { aracId, cizgi, bas, sayi: noktalar.length };
  if (eskiIz) { S.katman.iz.removeLayer(eskiIz.cizgi); if (eskiIz.bas) S.katman.iz.removeLayer(eskiIz.bas); }
  panelCiz();
}
function izTemizle() {
  S.izIstek++;
  if (S.iz) { S.katman.iz.removeLayer(S.iz.cizgi); if (S.iz.bas) S.katman.iz.removeLayer(S.iz.bas); S.iz = null; }
}

// ---------------------------------------------------------------- trafik (Google Maps, canlı trafik)
function aracTrafikLinki(a) {
  const kalan = aracDuraklari(a.id).filter(f => !ALINDI.includes(f.durum));
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
  const arac = S.seciliArac ? store.araclar.get(S.seciliArac) : null;
  const sira = [S.sonSecim, 'kisi', 'rota', 'arac'];
  for (const tur of sira) {
    if (tur === 'kisi' && kisi) return { url: fmt.mapsLink(kisi.adres || `${kisi.lat},${kisi.lon}`), ad: firmaAdi(kisi), acik: 'Seçili kişinin adresine yol tarifi' };
    if (tur === 'rota' && S.seciliRota) {
      const d = rotaDuraklari(S.seciliRota).slice(0, 9);
      if (d.length) return { url: fmt.rotaLink([...new Set(d.map(f => f.adres || `${f.lat},${f.lon}`))]), ad: rotaParca(S.seciliRota).ad, acik: `${rotaAd(S.seciliRota)}: duraklar sırayla, varış Fuar İzmir` };
    }
    if (tur === 'arac' && arac) { const u = aracTrafikLinki(arac); if (u) return { url: u, ad: fmt.plaka(arac.plaka), acik: aracKonumlu(arac) ? `${fmt.plaka(arac.plaka)}: bulunduğu yerden Fuar İzmir'e` : `${fmt.plaka(arac.plaka)}: kalan duraklar` }; }
  }
  const c = S.map.getCenter();
  return { url: `https://www.google.com/maps/@?api=1&map_action=map&center=${c.lat.toFixed(5)},${c.lng.toFixed(5)}&zoom=${Math.round(S.map.getZoom())}&basemap=roadmap&layer=traffic`, ad: '', acik: 'Seçim yok: haritada görünen bölge açılır' };
}
function trafikCiz() {
  if (!S) return;
  const h = trafikHedefi(); const imza = h.url + '|' + h.ad;
  if (imza === S.trafikImza) return; S.trafikImza = imza;
  const a = S.cubuk.querySelector('[data-trafik]');
  a.href = h.url;
  a.querySelector('[data-trafik-ad]').textContent = h.ad;
  a.querySelector('[data-trafik-acik]').textContent = h.acik;
  a.setAttribute('aria-label', `Trafik: canlı trafik için Google Maps'te açılır. ${h.acik}`);
}

// ---------------------------------------------------------------- sol panel, lejant, takip şeridi
function panelCiz() {
  if (!S) return;
  const q = trArama(S.arama);
  const rotalar = rotalariTopla();
  const araclar = [...store.araclar.values()];
  const html = S.sekme === 'araclar' ? aracPaneli(araclar, q) : rotaPaneli(rotalar, q);
  if (html !== S.panelHtml) { const y = S.liste.scrollTop; S.liste.innerHTML = html; S.liste.scrollTop = y; S.panelHtml = html; }
  const durak = firmaListesi().filter(konumlu); const ulasan = durak.filter(f => ULASTI.includes(f.durum)).length;
  const canli = araclar.filter(a => aracKonumlu(a) && !eskiMi(a)).length;
  const ozet = `${durak.length} servis durağı · ${rotalar.length} rota · fuara ulaşan <b>${ulasan}/${durak.length}</b>`;
  if (S.ozet.innerHTML !== ozet) S.ozet.innerHTML = ozet;
  const sr = String(rotalar.length), sa = araclar.length ? `${canli}/${araclar.length}` : '0';
  if (S.sayRota.textContent !== sr) S.sayRota.textContent = sr;
  if (S.sayArac.textContent !== sa) S.sayArac.textContent = sa;
  S.sayArac.title = 'Canlı konum veren / toplam araç';
}
function rotaPaneli(rotalar, q) {
  if (!rotalar.length) return '<div class="bos">Rotası olan servis durağı yok.</div>';
  const liste = q ? rotalar.filter(r => q.split(' ').every(p => r.arama.includes(p))) : rotalar;
  if (!liste.length) return '<div class="bos">Aramaya uyan rota yok.</div>';
  return liste.map(rotaSatir).join('');
}
function rotaSatir(r) {
  const sec = S.seciliRota === r.kod; const n = r.duraklar.length;
  const altlar = [r.geciken ? `<span class="rozet u-gecikti">${r.geciken} geciken</span>` : '', r.yolda ? `<span class="rozet d-yolda">${r.yolda} yolda</span>` : '', r.arac ? plakaHtml(r.arac.plaka) : ''].filter(Boolean).join('');
  return `<div class="harita-satir${sec ? ' sec' : ''}${r.ulasan === n ? ' bitti' : ''}" data-rota="${esc(r.kod)}" role="button" tabindex="0" aria-expanded="${sec}">
    <div class="harita-satir-ust">
      <span class="harita-saat${r.ilkSaat ? '' : ' yok'}">${r.ilkSaat ? esc(fmt.saatKisa(r.ilkSaat)) : 'saat<br>yok'}</span>
      <div class="harita-satir-ad"><b>${esc(r.ref ? `${r.ref} · ${r.ad}` : r.ad)}</b><span>${esc(r.ilceler)} · ${n} durak</span></div>
      <span class="harita-oran" title="Fuara ulaşan / durak">${r.ulasan}/${n}</span>
    </div>
    ${altlar ? `<div class="harita-satir-alt">${altlar}</div>` : ''}
    <div class="harita-bar" title="Yeşil: fuara ulaştı · amber: yolda"><i class="u" style="width:${fmt.yuzde(r.ulasan, n)}%"></i><i class="y" style="width:${fmt.yuzde(r.yolda, n)}%"></i></div>
  </div>
  ${sec ? `<div class="harita-duraklar">${r.duraklar.map(durakSatir).join('')}</div>` : ''}`;
}
function durakSatir(f) {
  const g = gecikme(f);
  return `<div class="harita-durak${S.seciliKisi === f.id ? ' sec' : ''}" data-durak="${f.id}" role="button" tabindex="0" title="Haritada göster">
    <span class="harita-durak-no harita-d-${esc(f.durum)}">${esc(f.rota_sira ?? '')}</span>
    <div class="harita-durak-ad"><b>${esc(firmaAdi(f) || f.unvan)}</b><span>${esc(f.unvan || '')}</span></div>
    <div class="harita-durak-sag">
      <span class="harita-durak-saat">${f.tasima_saati ? esc(fmt.saatKisa(f.tasima_saati)) : ''}</span>
      ${g ? `<span class="rozet u-gecikti">${g} dk</span>` : rozetDurum(f)}
    </div>
  </div>`;
}
function aracPaneli(araclar, q) {
  if (!araclar.length) return `<div class="bos">Kayıtlı araç yok.${yazabilirMi() ? '<br><a href="#araclar" class="btn btn-kucuk" style="margin-top:10px">Araç ekle</a>' : ''}</div>`;
  const sirali = araclar.slice().sort((a, b) => aracSirasi(a) - aracSirasi(b) || fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr', { numeric: true }));
  const liste = q ? sirali.filter(a => trArama(`${a.plaka} ${fmt.plaka(a.plaka)} ${a.sofor_ad || ''} ${a.marka || ''} ${a.model || ''}`).includes(q)) : sirali;
  const konumsuz = !araclar.some(aracKonumlu);
  return `${konumsuz ? '<div class="harita-bilgi">Henüz konum gönderen araç yok. Şoför telefonunda Saha ekranından konum paylaşınca araç burada canlı görünür.</div>' : ''}
    ${liste.length ? liste.map(aracSatir).join('') : '<div class="bos">Aramaya uyan araç yok.</div>'}`;
}
const aracSirasi = a => (!aracKonumlu(a) ? 2 : eskiMi(a) ? 1 : 0);
function aracSatir(a) {
  const sec = S.seciliArac === a.id, takip = S.takip === a.id;
  const konum = aracKonumlu(a), eski = konum && eskiMi(a);
  const d = aracDuraklari(a.id); const alinan = d.filter(f => ALINDI.includes(f.durum)).length;
  const konumYazi = !konum ? 'Konum yok' : eski ? `Konum eski · ${fmt.goreli(a.son_konum_zamani)}` : `Canlı · ${fmt.goreli(a.son_konum_zamani)}`;
  return `<div class="harita-satir harita-arac-satir${sec ? ' sec' : ''}" data-arac="${a.id}" role="button" tabindex="0">
    <div class="harita-satir-ust">
      ${plakaHtml(a.plaka)} ${rozetAracDurum(a.durum)}
      <button type="button" class="btn btn-kucuk ${takip ? 'btn-kirmizi' : ''}" data-takip="${a.id}" ${konum ? '' : 'disabled title="Henüz konum gelmedi"'} style="margin-left:auto">${takip ? '● Takipte' : 'Takip et'}</button>
    </div>
    <div class="harita-satir-alt"><span class="harita-sofor">${esc(trBaslik(a.sofor_ad || 'Şoför atanmadı'))}</span>${telVar(a.sofor_tel) ? `<a href="${fmt.telLink(a.sofor_tel)}">${esc(fmt.tel(a.sofor_tel))}</a>` : ''}</div>
    <div class="harita-satir-alt"><span class="harita-konum ${!konum ? 'yok' : eski ? 'eski' : 'canli'}">${esc(konumYazi)}</span>${d.length ? `<span>${d.length} durak · ${alinan} alındı</span>` : ''}</div>
    ${sec && S.iz?.aracId === a.id ? `<div class="harita-iz-bilgi">Son ${IZ_DK} dk izi haritada · ${S.iz.sayi} konum</div>` : ''}
  </div>`;
}
function lejantCiz() {
  const pinli = firmaListesi().filter(konumlu);
  const say = {}; pinli.forEach(f => { say[f.durum] = (say[f.durum] || 0) + 1; });
  const gec = pinli.filter(f => gecikme(f) > 0).length;
  const html = `${DURUMLAR.map(d => `<button type="button" class="harita-lj${gizliDurumlar.has(d.k) ? ' kapali' : ''}" data-lj="${d.k}" title="${gizliDurumlar.has(d.k) ? 'Göster' : 'Gizle'}: ${esc(d.ad)}"><i class="harita-d-${d.k}"></i>${esc(d.ad)}<b>${say[d.k] || 0}</b></button>`).join('')}
    <span class="harita-lj-ayrac"></span>
    <span class="harita-lj harita-lj-sabit${gec ? ' var' : ''}" title="Alma saati geçti, hâlâ yola çıkmadı"><i class="harita-lj-gec"></i>Geciken<b>${gec}</b></span>
    <span class="harita-lj harita-lj-sabit" title="Rota çizgisi: duraklar sırayla, son nokta Fuar İzmir"><i class="harita-lj-cizgi"></i>Rota</span>
    <span class="harita-lj harita-lj-sabit"><i class="harita-lj-arac"></i>Araç</span>`;
  if (html !== S.lejantHtml) { S.lejant.innerHTML = html; S.lejantHtml = html; }
}
function takipCiz() {
  const a = S.takip ? store.araclar.get(S.takip) : null;
  const html = a ? `<span class="harita-takip-nokta"></span>${plakaHtml(a.plaka)}<span>takip ediliyor · ${esc(trBaslik(a.sofor_ad || ''))} · ${eskiMi(a) ? 'konum eski, ' : ''}${esc(fmt.goreli(a.son_konum_zamani))}</span><button type="button" data-takip-birak>Bırak</button>` : '';
  if (html !== S.takipHtml) { S.takipSerit.innerHTML = html; S.takipSerit.hidden = !html; S.takipHtml = html; }
}
function sekmeYap(s) {
  S.sekme = s === 'araclar' ? 'araclar' : 'rotalar';
  try { localStorage.setItem(SEKME_ANAHTAR, S.sekme); } catch {}
  S.kok.querySelectorAll('[data-sekme]').forEach(b => { const a = b.dataset.sekme === S.sekme; b.classList.toggle('aktif', a); b.setAttribute('aria-selected', a); });
  S.ara.placeholder = S.sekme === 'araclar' ? 'Plaka ya da şoför ara' : 'Rota, referans, ilçe ya da kişi ara';
  S.panelHtml = null; S.liste.scrollTop = 0;
  panelCiz();
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
    let sekme = 'rotalar'; try { if (localStorage.getItem(SEKME_ANAHTAR) === 'araclar') sekme = 'araclar'; } catch {}
    kok.innerHTML = `
    <div class="harita-sayfa">
      <aside class="harita-panel">
        <div class="harita-panel-ust">
          <div class="harita-baslik"><h1>Harita</h1><div class="harita-ozet" data-ozet></div></div>
          <div class="harita-sekmeler" role="tablist">
            <button type="button" role="tab" data-sekme="rotalar">Rotalar <span class="say" data-say-rota></span></button>
            <button type="button" role="tab" data-sekme="araclar">Araçlar <span class="say" data-say-arac></span></button>
          </div>
          <input class="girdi harita-ara" data-harita-ara type="search" autocomplete="off">
        </div>
        <div class="harita-liste" data-liste></div>
      </aside>
      <section class="harita-kap">
        <div class="harita-harita" data-harita></div>
        <div class="harita-takip" data-takip-serit hidden></div>
      </section>
    </div>`;
    const q = s => kok.querySelector(s);
    S = {
      kok, sekme, arama: '', liste: q('[data-liste]'), ozet: q('[data-ozet]'), sayRota: q('[data-say-rota]'), sayArac: q('[data-say-arac]'),
      ara: q('[data-harita-ara]'), takipSerit: q('[data-takip-serit]'),
      pinler: new Map(), cizgiler: new Map(), aracM: new Map(),
      seciliRota: null, seciliArac: null, seciliKisi: null, takip: null, sonSecim: null,
      iz: null, izIstek: 0, panelHtml: null, lejantHtml: null, trafikImza: null, takipHtml: null, varisHtml: '', yakinlasiyor: false,
    };

    // harita + karo
    const map = L.map(q('[data-harita]'), { zoomControl: false, attributionControl: false, minZoom: 8, maxZoom: 19, worldCopyJump: false });
    S.map = map;
    const alt = altlik();
    S.karoUrl = alt.url;
    S.karo = L.tileLayer(alt.url, { maxZoom: 19, attribution: alt.atif, className: alt.suzgec ? 'harita-karo harita-karo-suzgec' : 'harita-karo', crossOrigin: false }).addTo(map);
    L.control.attribution({ position: 'bottomleft', prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' }).addTo(map);
    const Kontrol = L.Control.extend({ onAdd() { const e = this.options.eleman; L.DomEvent.disableClickPropagation(e); L.DomEvent.disableScrollPropagation(e); return e; } });
    S.cubuk = el(`<div class="harita-cubuk">
      <button type="button" class="harita-tus" data-tumu title="Tüm durakları, araçları ve Fuar'ı göster"><span aria-hidden="true">⤢</span> Tümü</button>
      <button type="button" class="harita-tus" data-fuar title="Fuar İzmir'e git"><span class="harita-tus-fuar" aria-hidden="true"></span> Fuar</button>
      <a class="harita-tus harita-trafik" data-trafik target="_blank" rel="noopener" href="#">
        <span class="harita-isik" aria-hidden="true"><i></i><i></i><i></i></span>Trafik<small data-trafik-ad></small><span aria-hidden="true" class="harita-dis">↗</span>
        <span class="harita-balon" role="tooltip">Canlı trafik için Google Maps'te açılır<em data-trafik-acik></em></span>
      </a>
    </div>`);
    new Kontrol({ position: 'topright', eleman: S.cubuk }).addTo(map);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Yakınlaş', zoomOutTitle: 'Uzaklaş' }).addTo(map);
    S.lejant = el('<div class="harita-lejant"></div>');
    new Kontrol({ position: 'bottomleft', eleman: S.lejant }).addTo(map);
    S.katman = { rota: L.layerGroup().addTo(map), iz: L.layerGroup().addTo(map), pin: L.layerGroup().addTo(map), arac: L.layerGroup().addTo(map) };

    // ilk görünüm (işaretler eklenmeden önce: Leaflet görünüm kurulmadan katman çizmez)
    if (sonGorunum) map.setView(sonGorunum.merkez, sonGorunum.zoom, { animate: false });
    else tumunuGoster(false, { cekirdek: true });
    S.sigdi = !!sonGorunum || firmaListesi().some(konumlu);
    varisKur();

    // olaylar
    map.on('dragstart', () => { if (S?.takip) { S.takip = null; esitle(); toast('Haritayı kaydırdın, takip bırakıldı'); } });
    map.on('zoomstart', () => { if (!S) return; S.yakinlasiyor = true; S.aracM.forEach(k => k.m.getElement()?.classList.remove('kayiyor')); });
    map.on('zoomend', () => { if (S) S.yakinlasiyor = false; });
    map.on('moveend', () => { if (S && !S.seciliKisi && !S.seciliRota && !S.seciliArac) trafikCiz(); });
    const kap = q('.harita-kap');
    kap.addEventListener('click', e => {
      if (!S) return;
      const kart = e.target.closest('[data-kart]'); if (kart) { e.preventDefault(); kisiKartiAc(Number(kart.dataset.kart)); return; }
      const tk = e.target.closest('[data-takip]'); if (tk) { e.preventDefault(); takipDegistir(Number(tk.dataset.takip)); return; }
      if (e.target.closest('[data-takip-birak]')) { takipBirak(); return; }
      const lj = e.target.closest('[data-lj]');
      if (lj) { const d = lj.dataset.lj; if (gizliDurumlar.has(d)) gizliDurumlar.delete(d); else gizliDurumlar.add(d); esitle(); return; }
      if (e.target.closest('[data-tumu]')) { takipBirak(); tumunuGoster(); return; }
      if (e.target.closest('[data-fuar]')) { takipBirak(); const v = varis(); map.setView([v.lat, v.lon], 15, { animate: true }); S.varisM?.openPopup(); return; }
    });
    S.kok.querySelector('.harita-sekmeler').addEventListener('click', e => { const b = e.target.closest('[data-sekme]'); if (b && b.dataset.sekme !== S.sekme) sekmeYap(b.dataset.sekme); });
    S.ara.addEventListener('input', () => { S.arama = S.ara.value; panelCiz(); });
    S.liste.addEventListener('click', e => {
      if (!S) return;
      if (e.target.closest('a[href]')) return;
      const tk = e.target.closest('[data-takip]'); if (tk) { e.stopPropagation(); takipDegistir(Number(tk.dataset.takip)); return; }
      const d = e.target.closest('[data-durak]'); if (d) { kisiOdak(Number(d.dataset.durak)); return; }
      const r = e.target.closest('[data-rota]'); if (r) { rotaSec(r.dataset.rota); return; }
      const a = e.target.closest('[data-arac]');
      if (a) { const id = Number(a.dataset.arac); if (S.seciliArac === id) aracBirak(); else aracSec(id); }
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
      if (S.seciliRota || S.seciliArac) { S.seciliRota = null; S.seciliArac = null; S.takip = null; S.sonSecim = null; izTemizle(); esitle(); }
    };
    document.addEventListener('keydown', S.escDinle, true);
    // tema değişince karo değişir (harita yeniden kurulmaz)
    S.temaGozcu = new MutationObserver(() => altlikEsitle());
    S.temaGozcu.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
    // kap boyutu değişince (pencere, çevrimdışı şeridi) haritayı yeniden ölç
    let boyutBekliyor = false;
    S.boyutGozcu = new ResizeObserver(() => { if (boyutBekliyor) return; boyutBekliyor = true; requestAnimationFrame(() => { boyutBekliyor = false; S?.map.invalidateSize({ pan: false }); }); });
    S.boyutGozcu.observe(q('[data-harita]'));
    S.izZaman = setInterval(() => { if (S?.seciliArac) izGoster(S.seciliArac); }, IZ_TAZELE_MS);

    // önceki seçimleri geri yükle, çiz, sonra bağlantı parametresi
    if (hafiza.rota && firmaListesi().some(f => f.rota_kod === hafiza.rota)) { S.seciliRota = hafiza.rota; S.sonSecim = 'rota'; }
    if (hafiza.arac && store.araclar.has(hafiza.arac)) {
      S.seciliArac = hafiza.arac; S.sonSecim = S.sonSecim || 'arac'; izGoster(hafiza.arac);
      if (hafiza.takip === hafiza.arac && aracKonumlu(store.araclar.get(hafiza.arac))) S.takip = hafiza.arac;
    }
    sekmeYap(sekme);
    esitle();
    if (S.takip) { const a = store.araclar.get(S.takip); map.setView([Number(a.son_lat), Number(a.son_lon)], map.getZoom(), { animate: false }); }
    paramUygula(param);
    requestAnimationFrame(() => S?.map.invalidateSize({ pan: false }));
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
    clearInterval(S.izZaman);
    S.aracM.forEach(k => clearTimeout(k.kayZaman));
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
    if (aracKonumlu(store.araclar.get(id))) aracSec(id, { takip: true }); else aracSec(id);
  } else if ((m = /^rota-(.+)$/.exec(param))) {
    if (firmaListesi().some(f => f.rota_kod === m[1])) rotaSec(m[1], { toggle: false });
  } else if ((m = /^(?:firma-)?(\d+)$/.exec(param))) {
    const id = Number(m[1]); if (S.pinler.has(id)) kisiOdak(id);
  }
}

// ---------------------------------------------------------------- ekran stili
function stilEkle() {
  if (document.querySelector('style[data-ekran="harita"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'harita';
  s.textContent = `
.harita-sayfa { display: grid; grid-template-columns: 344px minmax(0, 1fr); gap: 16px; height: calc(100vh - var(--ust-h) - 40px); height: calc(100dvh - var(--ust-h) - 40px); min-height: 520px; }
.harita-panel { display: flex; flex-direction: column; min-height: 0; background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: var(--r-2); box-shadow: var(--golge-1); overflow: hidden; }
.harita-panel-ust { padding: 14px 14px 10px; border-bottom: 1px solid var(--cizgi); display: grid; gap: 10px; }
.harita-baslik h1 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -.01em; line-height: 1.1; }
.harita-ozet { color: var(--metin-3); font-size: 12px; font-weight: 600; margin-top: 3px; font-variant-numeric: tabular-nums; }
.harita-ozet b { color: var(--yesil); font-weight: 800; }
.harita-sekmeler { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; background: var(--yuzey-3); border-radius: 10px; }
.harita-sekmeler button { height: 32px; border: 0; border-radius: 8px; background: transparent; font-weight: 700; font-size: 13px; color: var(--metin-2); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
.harita-sekmeler button:hover { color: var(--metin); }
.harita-sekmeler button.aktif { background: var(--yuzey); color: var(--metin); box-shadow: var(--golge-1); }
.harita-sekmeler .say { font-size: 11px; font-weight: 800; color: var(--metin-3); font-variant-numeric: tabular-nums; }
.harita-ara { height: 34px; }
.harita-liste { flex: 1; min-height: 0; overflow: auto; padding: 6px; overscroll-behavior: contain; }
.harita-liste .bos { padding: 28px 12px; }
:root[data-tema="koyu"] .harita-liste { color-scheme: dark; }
.harita-bilgi { margin: 4px 4px 8px; padding: 10px 12px; border-radius: 10px; background: var(--yuzey-2); border: 1px dashed var(--cizgi-2); color: var(--metin-2); font-size: 12px; font-weight: 600; line-height: 1.45; }
.harita-satir { display: grid; gap: 7px; padding: 10px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; outline: none; }
.harita-satir + .harita-satir, .harita-duraklar + .harita-satir { margin-top: 2px; }
.harita-satir:hover { background: var(--yuzey-2); border-color: var(--cizgi); }
.harita-satir:focus-visible { border-color: var(--kirmizi); box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.harita-satir.sec { background: var(--kirmizi-acik); border-color: var(--kirmizi-cizgi); }
.harita-satir-ust { display: flex; align-items: center; gap: 10px; min-width: 0; }
.harita-saat { flex: none; min-width: 46px; font-weight: 900; font-size: 16px; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.harita-saat.yok { font-size: 10px; font-weight: 800; line-height: 1.1; color: var(--metin-3); text-transform: uppercase; letter-spacing: .06em; }
.harita-satir-ad { flex: 1; min-width: 0; display: grid; }
.harita-satir-ad b { font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.harita-satir-ad span { font-size: 12px; color: var(--metin-3); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.harita-oran { flex: none; font-weight: 800; font-size: 13px; color: var(--metin-2); font-variant-numeric: tabular-nums; }
.harita-satir.bitti .harita-oran { color: var(--yesil); }
.harita-satir-alt { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; font-size: 12px; color: var(--metin-3); font-weight: 600; min-width: 0; }
.harita-satir-alt a { color: var(--metin-2); font-weight: 700; font-variant-numeric: tabular-nums; }
.harita-satir-alt a:hover { color: var(--kirmizi); }
.harita-sofor { color: var(--metin); font-weight: 800; font-size: 13px; }
.harita-bar { display: flex; height: 4px; border-radius: 999px; background: var(--gri-acik); overflow: hidden; }
.harita-bar i { display: block; height: 100%; transition: width .4s; }
.harita-bar i.u { background: var(--yesil); }
.harita-bar i.y { background: var(--amber); }
.harita-duraklar { display: grid; gap: 1px; margin: 2px 0 8px 22px; padding-left: 10px; border-left: 2px solid var(--kirmizi-cizgi); }
.harita-durak { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: 8px; cursor: pointer; outline: none; }
.harita-durak:hover, .harita-durak.sec { background: var(--yuzey-3); }
.harita-durak:focus-visible { box-shadow: 0 0 0 2px var(--kirmizi); }
.harita-durak-no { flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--pc); color: #fff; font-size: 11px; font-weight: 900; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
.harita-durak-ad { flex: 1; min-width: 0; display: grid; }
.harita-durak-ad b { font-size: 12.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.harita-durak-ad span { font-size: 11px; color: var(--metin-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.harita-durak-sag { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.harita-durak-saat { font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
.harita-konum { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
.harita-konum::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--metin-3); }
.harita-konum.canli { color: var(--yesil); }
.harita-konum.canli::before { background: var(--yesil); box-shadow: 0 0 0 3px var(--yesil-acik); animation: nabiz 1.6s infinite; }
.harita-konum.eski { color: var(--turuncu); }
.harita-konum.eski::before { background: var(--turuncu); }
.harita-iz-bilgi { font-size: 11px; font-weight: 700; color: var(--kirmizi); }
.harita-yazi-eski { color: var(--turuncu); }

.harita-kap { position: relative; isolation: isolate; min-height: 0; border-radius: var(--r-2); overflow: hidden; border: 1px solid var(--cizgi); box-shadow: var(--golge-1); background: var(--yuzey-3); }
.harita-harita { position: absolute; inset: 0; background: var(--yuzey-3); font-family: var(--font); }
.harita-harita.leaflet-container { font: 13px/1.4 var(--font); }
.harita-karo-suzgec { filter: grayscale(1) contrast(.86) brightness(1.1); }
:root[data-tema="koyu"] .harita-karo-suzgec { filter: grayscale(1) invert(1) contrast(.82) brightness(.82); }
.harita-harita .leaflet-control-attribution { background: color-mix(in srgb, var(--yuzey) 82%, transparent); color: var(--metin-3); font-size: 10px; border-radius: 6px; margin: 0 0 6px 8px !important; padding: 1px 6px; }
.harita-harita .leaflet-control-attribution a { color: var(--metin-2); }
.harita-harita .leaflet-bar { border: 1px solid var(--cizgi-2); border-radius: 10px; overflow: hidden; box-shadow: var(--golge-2); background-clip: padding-box; }
.harita-harita .leaflet-bar a { background: var(--yuzey); color: var(--metin); border-bottom-color: var(--cizgi); width: 34px; height: 34px; line-height: 34px; font-size: 18px; }
.harita-harita .leaflet-bar a:hover { background: var(--yuzey-3); }
.harita-harita .leaflet-bar a.leaflet-disabled { color: var(--metin-3); background: var(--yuzey-2); }
.harita-harita .leaflet-top.leaflet-right .leaflet-control { margin: 12px 12px 0 0; }
.harita-harita .leaflet-bottom.leaflet-left .leaflet-control { margin-left: 12px; }

.harita-cubuk { display: flex; gap: 6px; align-items: center; }
.harita-tus { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--cizgi-2); background: var(--yuzey); color: var(--metin) !important; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; box-shadow: var(--golge-2); text-decoration: none; }
.harita-tus:hover { background: var(--yuzey-3); }
.harita-tus-fuar { width: 10px; height: 10px; border-radius: 3px; background: var(--kirmizi); box-shadow: 0 0 0 2px var(--kirmizi-acik); }
.harita-trafik small { font-size: 12px; font-weight: 700; color: var(--kirmizi); max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.harita-trafik small:empty { display: none; }
.harita-dis { color: var(--metin-3); font-weight: 800; }
.harita-isik { display: inline-grid; gap: 2px; padding: 2px; border-radius: 4px; background: #1d1d1d; }
.harita-isik i { width: 5px; height: 5px; border-radius: 50%; }
.harita-isik i:nth-child(1) { background: #EF4444; } .harita-isik i:nth-child(2) { background: #F59E0B; } .harita-isik i:nth-child(3) { background: #22C55E; }
.harita-balon { position: absolute; top: calc(100% + 8px); right: 0; width: max-content; max-width: 280px; padding: 8px 10px; border-radius: 8px; background: var(--koyu); color: #fff; font-size: 12px; font-weight: 700; line-height: 1.35; white-space: normal; box-shadow: var(--golge-2); opacity: 0; transform: translateY(-4px); transition: opacity .12s, transform .12s; pointer-events: none; z-index: 5; }
.harita-balon::before { content: ''; position: absolute; top: -5px; right: 18px; width: 10px; height: 10px; background: var(--koyu); transform: rotate(45deg); }
.harita-balon em { display: block; font-style: normal; font-weight: 500; color: rgba(255, 255, 255, .72); margin-top: 3px; }
.harita-trafik:hover .harita-balon, .harita-trafik:focus-visible .harita-balon { opacity: 1; transform: none; }

.harita-lejant { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; max-width: min(760px, calc(100vw - 520px)); padding: 5px; border-radius: 12px; background: color-mix(in srgb, var(--yuzey) 94%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid var(--cizgi); box-shadow: var(--golge-2); }
.harita-lj { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px; border: 0; border-radius: 8px; background: transparent; color: var(--metin-2); font-weight: 700; font-size: 12px; cursor: pointer; white-space: nowrap; }
button.harita-lj:hover { background: var(--yuzey-3); color: var(--metin); }
.harita-lj b { font-weight: 900; color: var(--metin); font-variant-numeric: tabular-nums; }
.harita-lj > i { width: 11px; height: 11px; border-radius: 50%; background: var(--pc); box-shadow: 0 0 0 2px var(--yuzey); flex: none; }
.harita-lj.kapali { opacity: .45; }
.harita-lj.kapali > i { background: transparent; box-shadow: inset 0 0 0 2px var(--pc); }
.harita-lj.kapali b { text-decoration: line-through; }
.harita-lj-sabit { cursor: default; }
.harita-lj-sabit.var b { color: var(--turuncu); }
.harita-lj-ayrac { width: 1px; height: 18px; background: var(--cizgi-2); margin: 0 3px; }
.harita-lejant .harita-lj-gec { background: transparent; box-shadow: inset 0 0 0 2.5px var(--turuncu); }
.harita-lejant .harita-lj-cizgi { width: 18px; height: 0; border-radius: 0; border-top: 2px dashed var(--metin-3); background: none; box-shadow: none; }
.harita-lejant .harita-lj-arac { width: 12px; height: 12px; border-radius: 50%; background: var(--koyu); box-shadow: 0 0 0 2px var(--yesil); }

.harita-d-bekliyor { --pc: var(--gri); } .harita-d-arandi { --pc: var(--mavi); } .harita-d-yolda { --pc: var(--amber); } .harita-d-fuarda { --pc: var(--mor); } .harita-d-oy_kullandi { --pc: var(--yesil); }
.harita-pin-kap { background: none; border: 0; }
.harita-pin { position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--pc, var(--gri)); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, .38); display: grid; place-items: center; transition: width .15s, height .15s, margin .15s, opacity .15s, box-shadow .15s; }
.harita-pin b { display: none; color: #fff; font-size: 11px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.harita-pin-kap:hover .harita-pin { width: 18px; height: 18px; margin: -9px 0 0 -9px; }
.harita-pin.sec, .harita-pin-kap:hover .harita-pin.sec { width: 24px; height: 24px; margin: -12px 0 0 -12px; box-shadow: 0 0 0 2.5px var(--kirmizi), 0 3px 10px rgba(0, 0, 0, .35); }
.harita-pin.sec b { display: block; }
.harita-pin.sonuk { opacity: .32; }
.harita-pin.aktif, .harita-pin-kap:hover .harita-pin.aktif { width: 22px; height: 22px; margin: -11px 0 0 -11px; box-shadow: 0 0 0 3px var(--metin), 0 3px 10px rgba(0, 0, 0, .35); opacity: 1; }
.harita-pin.aktif.sec { width: 26px; height: 26px; margin: -13px 0 0 -13px; }
.harita-pin.gec::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2.5px solid var(--turuncu); animation: harita-halka 1.6s ease-in-out infinite; pointer-events: none; }
@keyframes harita-halka { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: .5; } }

.harita-arac-kap { background: none; border: 0; }
.harita-arac-kap.kayiyor { transition: transform 1s cubic-bezier(.25, .7, .3, 1); }
.harita-arac { position: absolute; inset: 0; --ac: var(--yesil); }
.harita-a-hazir { --ac: var(--yesil); } .harita-a-yolda { --ac: var(--amber); } .harita-a-fuarda { --ac: var(--mor); } .harita-a-mola { --ac: var(--gri); } .harita-a-arizali { --ac: var(--turuncu); }
.harita-arac-rozet { position: absolute; inset: 0; border-radius: 50%; background: #1f1f1f; color: #fff; display: grid; place-items: center; border: 3px solid var(--ac); box-shadow: 0 3px 10px rgba(0, 0, 0, .4); transition: background .15s; }
.harita-arac.sec .harita-arac-rozet { background: var(--kirmizi); }
.harita-arac.takip .harita-arac-rozet::after { content: ''; position: absolute; inset: -9px; border-radius: 50%; border: 2px solid var(--kirmizi); animation: harita-halka 1.4s ease-in-out infinite; }
.harita-arac-etiket { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); display: grid; line-height: 1.2; padding: 4px 8px; border-radius: 8px; background: var(--yuzey); border: 1px solid var(--cizgi-2); box-shadow: var(--golge-2); white-space: nowrap; pointer-events: auto; }
.harita-arac-etiket b { font-size: 12px; font-weight: 900; letter-spacing: .05em; color: var(--metin); font-variant-numeric: tabular-nums; }
.harita-arac-etiket i { font-style: normal; font-size: 11px; font-weight: 600; color: var(--metin-2); }
.harita-arac-etiket em { font-style: normal; font-size: 10px; font-weight: 800; color: var(--turuncu); }
.harita-arac-etiket em:empty { display: none; }
.harita-arac.eski .harita-arac-rozet { opacity: .5; filter: grayscale(.85); }
.harita-arac.eski .harita-arac-etiket b, .harita-arac.eski .harita-arac-etiket i { opacity: .6; }

.harita-varis-kap { background: none; border: 0; }
.harita-varis { position: absolute; inset: 0; }
.harita-varis::before { content: ''; position: absolute; inset: -12px; border-radius: 20px; background: rgba(200, 16, 46, .2); animation: harita-varis 2.4s ease-out infinite; pointer-events: none; }
@keyframes harita-varis { 0% { transform: scale(.7); opacity: .9; } 100% { transform: scale(1.5); opacity: 0; } }
.harita-varis-ikon { position: absolute; inset: 0; border-radius: 13px; background: var(--kirmizi); color: #fff; display: grid; place-items: center; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(200, 16, 46, .45), 0 1px 3px rgba(0, 0, 0, .3); }
.harita-varis-etiket { position: absolute; top: calc(100% + 7px); left: 50%; transform: translateX(-50%); padding: 4px 9px; border-radius: 7px; background: var(--kirmizi); color: #fff; font-weight: 900; font-size: 11px; letter-spacing: .08em; line-height: 1.2; text-align: center; white-space: nowrap; box-shadow: var(--golge-2); }
.harita-varis-etiket span { display: block; font-weight: 600; font-size: 10px; letter-spacing: 0; opacity: .85; }

.harita-cizgi { stroke: var(--metin-3); stroke-opacity: .6; stroke-width: 1.6px; stroke-dasharray: 4 6; fill: none; transition: stroke-opacity .15s; }
.harita-cizgi:hover { stroke: var(--metin); stroke-opacity: .9; }
.harita-cizgi.bitti { stroke: var(--yesil); stroke-opacity: .75; }
.harita-cizgi.sonuk { stroke-opacity: .14; }
.harita-cizgi.sec { stroke: var(--kirmizi); stroke-opacity: 1; stroke-width: 3px; stroke-dasharray: 7 6; }
.harita-iz { stroke: var(--kirmizi); stroke-opacity: .85; stroke-width: 4px; stroke-dasharray: none; fill: none; }
.harita-iz-bas { stroke: #fff; fill: var(--kirmizi); }

.harita-ipucu.leaflet-tooltip { background: var(--koyu); color: #fff; border: 0; border-radius: 7px; padding: 5px 9px; font: 700 12px/1.3 var(--font); box-shadow: var(--golge-2); }
.harita-ipucu.leaflet-tooltip span { display: block; font-weight: 500; font-size: 11px; opacity: .75; }
.harita-ipucu.leaflet-tooltip-top::before { border-top-color: var(--koyu); }
.harita-ipucu.leaflet-tooltip-bottom::before { border-bottom-color: var(--koyu); }
.harita-ipucu.leaflet-tooltip-left::before { border-left-color: var(--koyu); }
.harita-ipucu.leaflet-tooltip-right::before { border-right-color: var(--koyu); }
.harita-popup .leaflet-popup-content-wrapper { background: var(--yuzey); color: var(--metin); border: 1px solid var(--cizgi); border-radius: 14px; box-shadow: var(--golge-2); }
.harita-popup .leaflet-popup-tip { background: var(--yuzey); box-shadow: none; border: 1px solid var(--cizgi); }
.harita-popup .leaflet-popup-content { margin: 14px 16px 14px; font: 13px/1.4 var(--font); }
.harita-popup a.leaflet-popup-close-button { color: var(--metin-3); top: 6px; right: 6px; font-size: 20px; }
.harita-popup a.leaflet-popup-close-button:hover { color: var(--metin); }
.harita-pop { display: grid; gap: 7px; padding-right: 10px; }
.harita-pop-rozetler { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.harita-pop-ad { font-size: 16px; font-weight: 900; letter-spacing: -.01em; line-height: 1.2; }
.harita-pop-firma { font-size: 12px; font-weight: 600; color: var(--metin-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: -3px; }
.harita-pop-bilgi { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 2px 0 0; font-size: 12px; }
.harita-pop-bilgi dt { color: var(--metin-3); font-weight: 600; }
.harita-pop-bilgi dd { margin: 0; font-weight: 700; }
.harita-pop-bilgi b.rakam { font-size: 14px; font-weight: 900; }
.harita-pop-zayif { color: var(--metin-3); font-size: 12px; font-weight: 600; }
.harita-pop-not { border-left: 3px solid var(--kirmizi); background: var(--kirmizi-acik); padding: 6px 9px; border-radius: 0 8px 8px 0; font-size: 12px; font-weight: 700; }
.harita-pop-eylem { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 3px; }
.harita-pop a.btn { color: var(--metin); }
.harita-pop a.btn:hover { color: var(--metin); }
.harita-pop-sayilar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.harita-pop-sayilar div { background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: 10px; padding: 7px 8px; display: grid; }
.harita-pop-sayilar b { font-size: 20px; font-weight: 900; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.harita-pop-sayilar span { font-size: 11px; font-weight: 700; color: var(--metin-3); }

.harita-takip { position: absolute; top: 12px; left: 12px; z-index: 900; display: flex; align-items: center; gap: 10px; padding: 5px 5px 5px 14px; border-radius: 999px; background: var(--kirmizi); color: #fff; font-size: 13px; font-weight: 700; white-space: nowrap; box-shadow: var(--golge-2); max-width: calc(100% - 380px); overflow: hidden; }
.harita-takip[hidden] { display: none; }
.harita-takip-nokta { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: nabiz 1.2s infinite; flex: none; }
.harita-takip > span:not(.plaka):not(.harita-takip-nokta) { overflow: hidden; text-overflow: ellipsis; }
.harita-takip button { flex: none; height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, .2); color: #fff; font-weight: 800; cursor: pointer; }
.harita-takip button:hover { background: rgba(255, 255, 255, .32); }

@media (max-width: 1180px) { .harita-trafik small { display: none; } .harita-takip { max-width: calc(100% - 330px); } }
@media (max-width: 900px) {
  .harita-sayfa { grid-template-columns: 290px minmax(0, 1fr); height: calc(100vh - var(--ust-h) - 28px); height: calc(100dvh - var(--ust-h) - 28px); }
  .harita-lejant { max-width: calc(100vw - 380px); }
}
@media (max-width: 760px) {
  .harita-sayfa { grid-template-columns: 1fr; grid-template-rows: 62vh auto; height: auto; }
  .harita-kap { order: -1; }
  .harita-liste { max-height: 60vh; }
  .harita-lejant { max-width: calc(100vw - 60px); }
  .harita-takip { max-width: calc(100% - 24px); top: 60px; }
}`;
  document.head.appendChild(s);
}
