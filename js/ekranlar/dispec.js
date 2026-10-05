// Seçim Masası · ARAÇ YÖNETİCİSİ ekranı (#dispec) · 26-27 (ATLAS, 2026-10-05)
// Rol 'arac_yoneticisi'nin ana ekranı; Admin de görür. Yalnız görev defteri olan seçimde açılır (komite.js > dispec: 72'de yok).
// ÜÇ SÜTUN (telefonda sekmeli): MÜSAİT ARAÇLAR · GÖREVDE · ALINACAK KİŞİLER. Üstte sayılar: boş araç, görevde, bekleyen alım,
// ortalama atama süresi (talep > atama). Altında ATLAS akışı (ajan_olaylari).
// TEK DOKUNUŞ ATAMA: kişiyi seç > en yakın 3 boş araç önerilir (kuş uçuşu mesafe; aracın konumu tahminiyse o merkezden) >
//   biri seçilir > gorevler'e TEK atama yazılır (core.alimAta > alim_ata RPC; tek şoför kuralı veritabanında da zorunlu) >
//   ajan_olaylari'na 'arac_asistani' satırı. "Başkasına ata" eskisini iptal edip yenisini açar: iki şoför aynı anda aynı işte olmaz.
// Kabul gelmeyen görev 3 dk sonra sarı, 6 dk sonra kırmızı ve en yakın boş araçla "yeniden ata" önerisi.
// 30 dk'dan uzun boş kalan araç öne çıkar ve en yakın bekleyen kişi önerilir (1 Ekim dersi D12).
// Canlı: görevler ve ajan olayları ayrı kanaldan (core.gorevCanliBaglan), araçlar ve kişiler ana kanaldan; 15 sn'de bir süreler tazelenir.
// Hazır parçalar yeniden kullanılır: araclar.js (aracOzet, yolcuHaritasi, aracsizlar, konumBilgi, mesafeKm, kisaFirma),
// core.js (gecikme, kalanSure, aracDurumYap, durumYap, alimAta, gorevDurumYap, ajanOlayYaz, alimTalebiAc).
// Demo (?demo=1): ekranlar/dispec-demo.js aynı işlevleri bellekte yürütür; hiçbir istek gitmez.
import {
  store, esc, fmt, trBaslik, dakika, simdi, simdiDk, VARIS, ARAC_DURUMLARI,
  firmaListesi, firmaAdi, gecikme, aramaEslesir, kalanSure, durumYap, aracDurumYap,
  GOREV_AKTIF, gorevListesi, aracAktifGorev, firmaAcikGorev, gorevYukle, gorevCanliBaglan, gorevMotoruAl,
  alimAta, gorevDurumYap, ajanOlayYaz, alimTalebiAc,
} from '../core.js';
import { plakaHtml, rozetAracDurum, toast, hataGoster, onayla, kisiKartiAc, modal, modalKapat } from '../ui.js';
import { anahtar, DEMO } from '../komite.js';
import { mesafeKm, aracOzet, yolcuHaritasi, aracsizlar, konumBilgi, kisaFirma } from './araclar.js';

// ---------------------------------------------------------------- sabitler
const KABUL_SARI_DK = 3, KABUL_KIRMIZI_DK = 6;   // Musa 2026-10-05: kabul gelmezse 3 dk sarı, 6 dk kırmızı + yeniden ata
const BOSTA_UYARI_DK = 30;                        // 1 Ekim (D12): 30 dk'dan uzun boş kalan araç öneriyle öne çıkar
const ONERI_SAYI = 3;                             // kişi seçilince önerilen en yakın boş araç sayısı
const TAMAM = ['fuarda', 'oy_kullandi'];          // kişi oy yerinde: alınacaklardan düşer
const DISI = ['mola', 'arizali'];                 // hizmet dışı araç: atanamaz
const ONCELIK = { ret: 0, talep: 1, gecikti: 2, servis: 3 };
const SEKMELER = [{ k: 'musait', ad: 'Müsait' }, { k: 'gorevde', ad: 'Görevde' }, { k: 'alinacak', ad: 'Alınacak' }];
const SEKME_ANAHTAR = anahtar('secim-dispec-sekme');
const AJAN_AD = { secmen_takip: 'ATLAS · seçmen takip', sofor_takip: 'ATLAS · şoför takip', karsilama: 'ATLAS · karşılama', referans: 'ATLAS · referans', arac_asistani: 'ATLAS · araç asistanı', atlas: 'ATLAS' };
const GD_AD = { atandi: 'Kabul bekleniyor', kabul: 'Kabul etti', yolda: 'Yolda' };

// ---------------------------------------------------------------- ekran durumu
let kok = null;
let sekme = 'alinacak';
try { const s = localStorage.getItem(SEKME_ANAHTAR); if (SEKMELER.some(x => x.k === s)) sekme = s; } catch {}
let secili = null;            // atama paneli açık kişi (firma id)
let yenidenIcin = null;       // "Başkasına ata" paneli açık görev id
let arama = '';
let notMetni = '';
let islem = false;            // atama sürerken ikinci dokunuş yok sayılır
let bekleyenCizim = false;    // not kutusuna yazarken yeniden çizim ertelenir
let akisAcik = false, digerAcik = false;
let gorulenTalep = null;      // "Yeni araç talebi" uyarısı için bilinen açık görevler
let cizimIstendi = false;
const yol = new Map();        // `${aracId}:${firmaId}` -> { dk, km } (OSRM yol süresi; canlıda öneri satırları için)
const yolIstek = new Set();

// ---------------------------------------------------------------- küçük yardımcılar
const $ = s => kok?.querySelector(s);
const kayma = () => simdi().getTime() - Date.now();    // ?saat= provasında saatler uygulama saatiyle yazılsın
const saat = ts => (ts ? fmt.saat(new Date(new Date(ts).getTime() + kayma())) : '');
const gecenDk = ts => (ts ? Math.max(0, (Date.now() - new Date(ts).getTime()) / 60000) : null);
function sure(dk) {
  dk = Math.max(0, Math.round(dk || 0)); if (dk < 60) return `${dk} dk`;
  const s = Math.floor(dk / 60), d = dk % 60; return d ? `${s} sa ${d} dk` : `${s} sa`;
}
const kmYaz = km => (km == null ? '' : km < 1 ? `${Math.max(100, Math.round(km * 10) * 100)} m` : `${km.toLocaleString('tr-TR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`);
const metreYaz = m => (m >= 1000 ? kmYaz(m / 1000) : `${Math.round(m / 10) * 10} m`);
const varis = () => { const v = store.ayarlar.secim?.varis; return v && Number.isFinite(+v.lat) && Number.isFinite(+v.lon) ? { lat: +v.lat, lon: +v.lon } : { lat: VARIS.lat, lon: VARIS.lon }; };
const yerAd = () => String(store.ayarlar.secim?.yer || VARIS.ad).split(',')[0].trim();
const bitis = () => fmt.saatKisa(store.ayarlar.zaman?.bit || '17:00');
const kapanisaDk = () => (dakika(bitis()) ?? 1020) - simdiDk();
const kisiAnahtari = f => (f ? f.kisi_anahtar || 'f' + f.id : '');
const soforAd = a => trBaslik(a?.sofor_ad || '') || 'Şoför girilmedi';
const olusturanAd = o => AJAN_AD[o] || trBaslik(o || '') || 'Bilinmiyor';
const ilceAd = f => trBaslik(f?.ilce || '');
const ilkNumara = t => String(t || '').split(/[/,;]|\s-\s|\s{2,}/).map(x => x.replace(/\D/g, '')).find(d => d.length >= 10 && d.length <= 12) || '';
const bos = (baslik, alt) => `<div class="dsp-bos"><b>${esc(baslik)}</b><span>${esc(alt)}</span></div>`;
// kuş uçuşu km'den kaba yol süresi (OSRM sonucu gelene kadar ya da demoda): yol = 1,3 × kuş uçuşu; şehir içi 30, çevre 45, otoyol 65 km/sa
function tahminiDk(km) {
  if (km == null) return null;
  const y = km * 1.3, hiz = y <= 15 ? 30 : y <= 40 ? 45 : 65;
  return Math.max(1, Math.round((y / hiz) * 60) + 2);
}

// ---------------------------------------------------------------- konum
// Tahmini konum dairesinin yarıçapı (metre): veritabanındaki tahmini_yaricap_m() ile AYNI formül (10-2627-ekler.sql):
// max(doğruluk, 30 m) + 400 m × son konumdan beri geçen dk; doğruluk yoksa 1,5 km; üst sınır 5 km. Duran araçta büyümez.
function yaricapM(a) {
  if (!a?.son_konum_zamani) return null;
  const d = a.son_dogruluk != null ? Number(a.son_dogruluk) : null;
  const hiz = ['fuarda', 'mola', 'arizali'].includes(a.durum) ? 0 : 400;
  return Math.round(Math.min(Math.max(5000, d || 0), Math.max(d ?? 1500, 30) + hiz * gecenDk(a.son_konum_zamani)));
}
function kaynakBilgi(a) {
  const k = String(a.konum_kaynak || a.son_konum_kaynak || 'telefon').toLocaleLowerCase('tr');
  if (k === 'telefon' || k === 'gps') return { ad: 'GPS', tahmini: false };
  if (k === 'elle') return { ad: 'haritada işaretlendi', tahmini: true };
  if (k === 'ilce') return { ad: 'tahmini (ilçe)', tahmini: true };
  return { ad: 'tahmini', tahmini: true };   // sözlü: şoför söyledi
}
function aracYeri(a) {
  if (a.son_lat != null && a.son_lon != null) return { lat: +a.son_lat, lon: +a.son_lon };
  if (a.durum === 'fuarda') return { ...varis(), fuar: true };
  return null;
}
// ilçe merkezleri: elimizdeki kişilerin konumlarının ortalaması (kodda sabit koordinat yok)
let ilceOnbellek = { imza: '', liste: [] };
function ilceMerkezleri() {
  const imza = `${store.firmalar.size}`;
  if (ilceOnbellek.imza === imza) return ilceOnbellek.liste;
  const m = new Map();
  for (const f of store.firmalar.values()) {
    if (!f.ilce || f.lat == null || f.lon == null) continue;
    const k = ilceAd(f); const x = m.get(k) || { ad: k, lat: 0, lon: 0, n: 0 };
    x.lat += +f.lat; x.lon += +f.lon; x.n++; m.set(k, x);
  }
  ilceOnbellek = { imza, liste: [...m.values()].map(x => ({ ad: x.ad, lat: x.lat / x.n, lon: x.lon / x.n })) };
  return ilceOnbellek.liste;
}
function yakinIlce(lat, lon) {
  let en = null, d = Infinity;
  for (const c of ilceMerkezleri()) { const x = mesafeKm(lat, lon, c.lat, c.lon); if (x < d) { d = x; en = c; } }
  return en && d <= 7 ? en.ad : '';
}
// kişinin konumu: adresin koordinatı, yoksa aynı ilçedeki kişilerin ortası (tahmini)
function firmaYeri(f) {
  if (f.lat != null && f.lon != null) return { lat: +f.lat, lon: +f.lon, tahmini: false };
  const c = f.ilce && ilceMerkezleri().find(x => x.ad === ilceAd(f));
  return c ? { lat: c.lat, lon: c.lon, tahmini: true } : null;
}
// "12 dk önce · Bornova çarşı · tahmini · ±5 km"
function konumSatiri(a, y) {
  if (!y) return { metin: 'Konum yok', sinif: 'yok' };
  if (y.fuar) return { metin: `${yerAd()} · araç durumu`, sinif: '' };
  const b = konumBilgi(a), k = kaynakBilgi(a), r = yaricapM(a), v = varis();
  const yer = mesafeKm(y.lat, y.lon, v.lat, v.lon) < 1 ? yerAd() : a.konum_metni ? trBaslik(a.konum_metni) : (yakinIlce(y.lat, y.lon) ? `${yakinIlce(y.lat, y.lon)} yakını` : '');
  return { metin: [b.metin, yer, k.ad, r != null ? `±${metreYaz(r)}` : ''].filter(Boolean).join(' · '), sinif: b.eski ? 'eski' : '' };
}
function konumKisa(x) {
  if (!x.yer) return 'konum yok';
  if (x.yer.fuar) return yerAd();
  const k = kaynakBilgi(x.a); return `${konumBilgi(x.a).metin}${k.tahmini ? ' · tahmini' : ''}`;
}
function fuaraDk(a, y, etaKullan = false) {
  if (etaKullan && a?.eta_zaman) { const d = (new Date(a.eta_zaman).getTime() - Date.now()) / 60000; if (d > -10) return { dk: Math.max(0, Math.round(d)), kaynak: 'eta' }; }
  if (!y) return null;
  if (y.fuar) return { dk: 0, fuarda: true };
  const v = varis(); const km = mesafeKm(y.lat, y.lon, v.lat, v.lon);
  return km < 1 ? { dk: 0, fuarda: true } : { dk: tahminiDk(km), kaynak: 'tahmini' };
}

// ---------------------------------------------------------------- veri: araçlar, görevler, alınacaklar
function sonBirakis(a) {
  let t = 0;
  for (const g of store.gorevler.values()) if (g.arac_id === a.id && g.durum === 'tamam' && g.tamam_zaman) t = Math.max(t, Date.parse(g.tamam_zaman));
  for (const o of store.olaylar) {
    if (o.tur !== 'geri_sayim' || o.yeni !== 'birakti') continue;
    if ((o.arac_id ?? store.firmalar.get(o.firma_id)?.arac_id) === a.id) t = Math.max(t, Date.parse(o.zaman));
  }
  return t || null;
}
function araclariHazirla() {
  const harita = yolcuHaritasi();
  return [...store.araclar.values()].map(a => {
    const o = aracOzet(a, harita);
    const g = aracAktifGorev(a.id);
    const disi = DISI.includes(a.durum);
    // müsait: hizmette, alım görevi yok, araçta yolcu yok, bekleyen durağı yok (durumu Hazır, Yolda ya da Fuarda olabilir)
    const musait = !disi && !g && o.occ === 0 && o.bekleyen.length === 0;
    const birakis = sonBirakis(a);
    return { a, o, g, disi, musait, bos: Math.max(0, o.kap - o.occ), yer: aracYeri(a), birakis, bosta: musait && birakis ? gecenDk(birakis) : null };
  });
}
function gorevdekiler() {
  const SIRA = { atandi: 0, kabul: 1, yolda: 2 };
  return gorevListesi().filter(g => g.tur === 'alim' && GOREV_AKTIF.includes(g.durum)).map(g => {
    const bekle = g.durum === 'atandi' && !g.kabul_zaman ? gecenDk(g.atandi_zaman) : null;
    const sev = bekle == null ? 0 : bekle >= KABUL_KIRMIZI_DK ? 2 : bekle >= KABUL_SARI_DK ? 1 : 0;
    return { g, f: store.firmalar.get(g.firma_id), a: store.araclar.get(g.arac_id), bekle, sev };
  }).sort((x, y) => y.sev - x.sev || SIRA[x.g.durum] - SIRA[y.g.durum] || (gecenDk(y.g.atandi_zaman) || 0) - (gecenDk(x.g.atandi_zaman) || 0));
}
// alınması gereken kişiler: açık araç talebi (ajan ya da masa), şoförün reddettiği iş, servisle gelecek ama aracı olmayan
// (araclar.js aracsizlar), taşıma saati geçmiş ve aracı yok (core.gecikme). Aynı kişi tek kart; görevdeki kişi listeye girmez.
function alinacaklar() {
  const aktifKisi = new Set(gorevListesi().filter(g => g.tur === 'alim' && GOREV_AKTIF.includes(g.durum)).map(g => kisiAnahtari(store.firmalar.get(g.firma_id))));
  const sonAlim = new Map();
  for (const g of gorevListesi()) if (g.tur === 'alim' && g.firma_id != null) { const o = sonAlim.get(g.firma_id); if (!o || g.id > o.id) sonAlim.set(g.firma_id, g); }
  const m = new Map();
  const ekle = (f, tur, g = null) => {
    if (!f || f.listede === false || TAMAM.includes(f.durum)) return;
    const k = kisiAnahtari(f); if (aktifKisi.has(k)) return;
    const x = m.get(k);
    if (!x || ONCELIK[tur] < ONCELIK[x.tur]) m.set(k, { f, tur, g: g || x?.g || null });
  };
  for (const g of sonAlim.values()) {
    if (g.durum === 'acik') ekle(store.firmalar.get(g.firma_id), 'talep', g);
    else if (g.durum === 'reddedildi') ekle(store.firmalar.get(g.firma_id), 'ret', g);
  }
  // iptal edilen ya da tamamlanan alımın kişisi servis/saat listesinden yeniden düşmez (araç yöneticisi kararı geçerli)
  const kapandi = f => ['iptal', 'tamam'].includes(sonAlim.get(f.id)?.durum);
  const r = aracsizlar();
  for (const f of [...r.gruplar.flatMap(x => x.firmalar), ...r.tekler]) if (!kapandi(f)) ekle(f, gecikme(f) > 0 ? 'gecikti' : 'servis');
  for (const f of firmaListesi()) if (gecikme(f) > 0 && !(f.arac_id && store.araclar.has(f.arac_id)) && !kapandi(f)) ekle(f, 'gecikti');
  const kapanis = kapanisaDk(), v = varis();
  return [...m.values()].map(x => {
    const fy = firmaYeri(x.f);
    const fuar = fy ? tahminiDk(mesafeKm(fy.lat, fy.lon, v.lat, v.lon)) : null;
    const bekle = x.g?.durum === 'acik' ? gecenDk(x.g.olusturma) : x.g?.durum === 'reddedildi' ? gecenDk(x.g.son_guncelleme) : null;
    return { ...x, fy, fuar, pay: kapanis - (fuar ?? 0), gec: gecikme(x.f), bekle, acil: x.g?.aciliyet === 'acil' };
  }).sort((p, q) => (p.tur === 'ret' ? 0 : 1) - (q.tur === 'ret' ? 0 : 1) || (q.acil ? 1 : 0) - (p.acil ? 1 : 0)
    || q.gec - p.gec || (q.bekle ?? -1) - (p.bekle ?? -1) || p.pay - q.pay
    || (dakika(p.f.tasima_saati) ?? 9999) - (dakika(q.f.tasima_saati) ?? 9999) || firmaAdi(p.f).localeCompare(firmaAdi(q.f), 'tr'));
}
function atamaSureleri() {
  const al = gorevListesi().filter(g => g.tur === 'alim');
  const dk = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  // aynı dokunuşta açılıp atanan görev (bekleme 0) ortalamayı düşürmesin: 10 sn'den kısa bekleme sayılmaz
  const atama = al.filter(g => g.olusturma && g.atandi_zaman).map(g => dk(g.olusturma, g.atandi_zaman)).filter(d => d >= 1 / 6 && d < 240);
  const kabul = al.filter(g => g.atandi_zaman && g.kabul_zaman).map(g => dk(g.atandi_zaman, g.kabul_zaman)).filter(d => d >= 0 && d < 120);
  const ort = l => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
  return { atama: ort(atama), kabul: ort(kabul), n: atama.length };
}
const dkYaz = d => (d == null ? '-' : d < 1 ? `${Math.max(1, Math.round(d * 60))} sn` : `${Math.round(d)} dk`);
// en yakın boş araçlar (kişiye göre); kişinin konumu yoksa en uzun boşta kalanlar önce
function onerilenler(f, A, haric = null) {
  const fy = firmaYeri(f);
  const l = A.filter(x => x.musait && x.a.id !== haric).map(x => {
    const km = fy && x.yer ? mesafeKm(x.yer.lat, x.yer.lon, fy.lat, fy.lon) : null;
    const y = yol.get(`${x.a.id}:${f.id}`);
    return { ...x, km, dk: y?.dk ?? tahminiDk(km), yolSuresi: !!y };
  }).sort((p, q) => (p.km ?? 1e9) - (q.km ?? 1e9) || (q.bosta ?? -1) - (p.bosta ?? -1) || q.bos - p.bos);
  return { fy, liste: l };
}
// canlıda öneri satırlarının yol süresi (OSRM, trafiksiz; core.kalanSure 60 sn önbellekli). Demoda dış istek yok.
function yolSuresiIste(f, liste) {
  if (DEMO || gorevMotoruAl()) return;
  const fy = firmaYeri(f); if (!fy) return;
  for (const x of liste) {
    const k = `${x.a.id}:${f.id}`;
    if (!x.yer || yol.has(k) || yolIstek.has(k)) continue;
    yolIstek.add(k);
    kalanSure({ lat: x.yer.lat, lon: x.yer.lon }, { lat: fy.lat, lon: fy.lon }).then(v => { yolIstek.delete(k); if (v) { yol.set(k, v); planla(); } });
  }
}
function enYakinBekleyen(x, K) {
  if (!x.yer) return null;
  let en = null;
  for (const k of K) { if (!k.fy) continue; const km = mesafeKm(x.yer.lat, x.yer.lon, k.fy.lat, k.fy.lon); if (!en || km < en.km) en = { f: k.f, km }; }
  return en;
}

// ---------------------------------------------------------------- çizim
function iskeletHtml() {
  return `<div class="dsp" data-sekme="${sekme}">
    ${DEMO ? '<div class="dsp-demo"><b>DEMO</b><span>Örnek veriyle gösterim. Atama, iptal ve yeniden atama yalnız bu ekranda denenir; veritabanına yazılmaz, kimseye mesaj gitmez.</span></div>' : ''}
    <div data-r="ust"></div>
    <div data-r="durum"></div>
    <div class="dsp-sekmeler segment" role="tablist" data-r="sekmeler"></div>
    <div class="dsp-izgara">
      <section class="dsp-sutun" data-sutun="musait" aria-label="Müsait araçlar">
        <header class="dsp-sutun-ust"><h2>Müsait araçlar</h2><span class="say" data-say="musait"></span><span class="dsp-ipucu">en uzun boşta kalan üstte</span></header>
        <div class="dsp-liste" data-r="musait"></div>
      </section>
      <section class="dsp-sutun" data-sutun="gorevde" aria-label="Görevdeki araçlar">
        <header class="dsp-sutun-ust"><h2>Görevde</h2><span class="say" data-say="gorevde"></span><span class="dsp-ipucu">kabul ${KABUL_SARI_DK} dk'da sarı, ${KABUL_KIRMIZI_DK} dk'da kırmızı</span></header>
        <div class="dsp-liste" data-r="gorevde"></div>
      </section>
      <section class="dsp-sutun" data-sutun="alinacak" aria-label="Alınacak kişiler">
        <header class="dsp-sutun-ust"><h2>Alınacak kişiler</h2><span class="say" data-say="alinacak"></span><span class="dsp-ipucu">en acil üstte</span></header>
        <div class="dsp-ara"><input class="girdi" type="search" data-dsp-ara placeholder="Listede olmayan kişiyi ara, araç ata…" autocomplete="off" enterkeyhint="search" value="${esc(arama)}"></div>
        <div class="dsp-liste" data-r="alinacak"></div>
      </section>
    </div>
  </div>`;
}
function ustHtml(A, G, K) {
  const bosArac = A.filter(x => x.musait).length, disi = A.filter(x => x.disi).length;
  const kabulBek = G.filter(x => x.g.durum === 'atandi').length, gec = G.filter(x => x.sev > 0).length;
  const oncelikli = K.filter(x => x.tur === 'ret' || x.acil).length;
  const s = atamaSureleri();
  const kalan = kapanisaDk();
  const z = store.ayarlar.zaman || {}, sc = store.ayarlar.secim || {};
  let gun = ''; try { if (sc.tarih) gun = new Date(`${sc.tarih}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }); } catch {}
  const alt = [gun, `oy ${fmt.saatKisa(z.bas || '09:00')}-${bitis()}`, kalan > 0 ? `kapanışa ${sure(kalan)}` : 'oy saati bitti'].filter(Boolean).join(' · ');
  return `<div class="dsp-ust">
    <div class="dsp-baslik"><h1>Araç yöneticisi</h1><div class="alt">${esc(alt)}</div></div>
    <div class="dsp-sayilar">
      <div class="dsp-sayi yesil"><span>Boş araç</span><b>${bosArac}</b><small>${A.length} araçtan${disi ? ` · ${disi} mola/arızalı` : ''}</small></div>
      <div class="dsp-sayi${gec ? ' uyari' : ''}"><span>Görevde</span><b>${G.length}</b><small>${kabulBek ? `${kabulBek} kabul bekliyor${gec ? ` · ${gec} gecikti` : ''}` : G.length ? 'hepsi kabul etti' : 'görev yok'}</small></div>
      <div class="dsp-sayi vurgu"><span>Bekleyen alım</span><b>${K.length}</b><small>${oncelikli ? `${oncelikli} acil ya da reddedildi` : K.length ? 'sırada' : 'kimse beklemiyor'}</small></div>
      <div class="dsp-sayi"><span>Ort. atama süresi</span><b>${dkYaz(s.atama)}</b><small>talep > atama${s.kabul != null ? ` · kabul ${dkYaz(s.kabul)}` : ''}</small></div>
    </div>
  </div>${akisHtml()}`;
}
function akisHtml() {
  const l = store.ajanOlaylari.slice(0, 8); if (!l.length) return '';
  const o = l[0];
  return `<details class="dsp-akis" data-akis${akisAcik ? ' open' : ''}>
    <summary><span class="dsp-akis-etk">ATLAS akışı</span><span class="dsp-akis-son o-${esc(o.onem)}">${esc(saat(o.zaman))} · ${esc(AJAN_AD[o.ajan] || o.ajan)} · ${esc(o.ozet)}</span><span class="dsp-akis-ok" aria-hidden="true">▾</span></summary>
    <ol>${l.map(x => `<li class="o-${esc(x.onem)}"><time>${esc(saat(x.zaman))}</time><span class="aj">${esc(AJAN_AD[x.ajan] || x.ajan)}</span><span class="oz">${esc(x.ozet)}</span></li>`).join('')}</ol>
  </details>`;
}
function durumHtml() {
  if (gorevMotoruAl()) return '';
  if (store.gorevDurum === 'hata') return `<div class="dsp-uyari kirmizi">Görev defteri okunamadı (${esc(store.gorevHata)}). Sayfayı yenile; atama yine de denenebilir, veritabanı tek şoför kuralını korur.</div>`;
  if (store.gorevDurum !== 'hazir') return '<div class="dsp-yukleniyor">Görev defteri yükleniyor…</div>';
  return '';
}
const telDugme = (tel, etiket = 'Ara') => { const l = fmt.telLink(ilkNumara(tel)); return l ? `<a class="btn btn-kucuk" href="${l}">${esc(etiket)}</a>` : ''; };
function durumSecici(a) {
  return `<select class="dsp-durum-sec" data-arac-durum="${a.id}" aria-label="${esc(fmt.plaka(a.plaka))} durumu">${ARAC_DURUMLARI.map(d => `<option value="${d.k}"${d.k === a.durum ? ' selected' : ''}>${esc(d.ad)}</option>`).join('')}</select>`;
}

// ---- sütun 1: müsait araçlar
function musaitHtml(A, K) {
  const l = A.filter(x => x.musait).sort((p, q) => (q.bosta ?? -1) - (p.bosta ?? -1) || (p.yer ? 0 : 1) - (q.yer ? 0 : 1) || fmt.plaka(p.a.plaka).localeCompare(fmt.plaka(q.a.plaka), 'tr', { numeric: true }));
  const disi = A.filter(x => x.disi);
  return (l.length ? l.map(x => musaitKart(x, K)).join('') : bos('Şu an boş araç yok', 'Görevdeki bir araç işi bitirince burada görünür.'))
    + (disi.length ? `<div class="dsp-ek-liste"><div class="dsp-ek-etk">Hizmet dışı (${disi.length})</div>${disi.map(x => `<div class="dsp-ek-satir">${plakaHtml(x.a.plaka)}<span class="ad">${esc(soforAd(x.a))}</span>${durumSecici(x.a)}</div>`).join('')}</div>` : '');
}
function musaitKart(x, K) {
  const { a } = x;
  const k = konumSatiri(a, x.yer), f = fuaraDk(a, x.yer);
  const uzun = x.bosta != null && x.bosta >= BOSTA_UYARI_DK;
  const yakin = K.length ? enYakinBekleyen(x, K) : null;
  const oneri = yakin ? `<span class="dsp-oneri-yazi">En yakın bekleyen: <b>${esc(firmaAdi(yakin.f))}</b> · ${esc(kmYaz(yakin.km))}</span><button type="button" class="btn btn-kucuk${uzun ? ' btn-kirmizi' : ''}" data-hizli-ata="${yakin.f.id}" data-arac-id="${a.id}">Ata</button>` : '';
  return `<article class="dsp-kart dsp-arac${uzun ? ' bosta-uzun' : ''}" data-arac="${a.id}">
    <div class="dsp-kart-ust">${plakaHtml(a.plaka)}<span class="ad">${esc(soforAd(a))}</span><span class="sag">${rozetAracDurum(a.durum)}</span></div>
    <div class="dsp-satir dsp-konum ${k.sinif}" title="Tahmini konum dairesi yarıçapı: veritabanıyla aynı formül (dakikada 400 m büyür, yeni konumla küçülür)">${esc(k.metin)}</div>
    <div class="dsp-olcu">
      <div><b>${x.bos}</b><span>boş koltuk</span></div>
      <div><b>${x.birakis ? esc(saat(x.birakis)) : '-'}</b><span>son bırakış</span></div>
      <div><b>${f ? (f.fuarda ? 'Burada' : `~${f.dk} dk`) : '-'}</b><span>${f?.fuarda ? esc(yerAd()) : 'fuara tahmini'}</span></div>
    </div>
    ${uzun ? `<div class="dsp-uyari amber"><b>Boşta ${esc(sure(x.bosta))}</b>${oneri || '<span>Bekleyen kişi yok.</span>'}</div>` : oneri ? `<div class="dsp-oneri-mini">${oneri}</div>` : ''}
    <div class="dsp-dugmeler">${telDugme(a.sofor_tel)}<a class="btn btn-kucuk" href="#harita/arac-${a.id}">Haritada</a>${durumSecici(a)}</div>
  </article>`;
}

// ---- sütun 2: görevde
function gorevdeHtml(G, A) {
  const mesgul = A.filter(x => !x.musait && !x.disi && !x.g);   // rotalı (görevsiz) dolu araçlar: 1 Ekim düzeni
  return (G.length ? G.map(x => gorevKart(x, A)).join('') : bos('Görevde araç yok', 'Alınacak bir kişiye araç atayınca burada görünür.'))
    + (mesgul.length ? `<div class="dsp-ek-liste"><div class="dsp-ek-etk">Rotadaki araçlar (görev defteri dışı, ${mesgul.length})</div>${mesgul.map(x => `<a class="dsp-ek-satir" href="#araclar/${x.a.id}">${plakaHtml(x.a.plaka)}<span class="ad">${esc(soforAd(x.a))}</span><span class="ek">${x.o.occ}/${x.o.kap} araçta · ${x.o.bekleyen.length} durak</span></a>`).join('')}</div>` : '');
}
function waDugme(g, f, a) {
  const tel = ilkNumara(a?.sofor_tel); if (!tel || !f) return '';
  const kisiTel = ilkNumara(f.cep) || ilkNumara(f.cep2) || ilkNumara(f.sabit_tel);
  const metin = `Merhaba ${trBaslik(String(a.sofor_ad || '').split(/\s+/)[0])}, yeni alım görevi: ${firmaAdi(f)} (${kisaFirma(f.unvan)})${f.ilce ? ', ' + ilceAd(f) : ''}.`
    + `${f.adres ? ` Adres: ${f.adres}.` : ''}${kisiTel ? ` Tel: ${fmt.tel(kisiTel)}.` : ''}${g.notlar ? ` Not: ${g.notlar}.` : ''} Kabul edince "tamam" yazar mısın?`;
  const l = fmt.waLink(tel, metin); return l ? `<a class="btn btn-kucuk" href="${l}" target="_blank" rel="noopener">WhatsApp</a>` : '';
}
function gorevKart({ g, f, a, bekle, sev }, A) {
  if (!f) return '';
  const y = a ? aracYeri(a) : null;
  const eta = g.durum === 'yolda' ? fuaraDk(a, y, true) : null;
  const zaman = [`Atandı ${saat(g.atandi_zaman)}`, g.kabul_zaman ? `kabul ${saat(g.kabul_zaman)}` : '', g.yolda_zaman ? `yolcu alındı ${saat(g.yolda_zaman)}` : ''].filter(Boolean).join(' · ');
  let uyari = '';
  if (sev === 2) {
    const alt = onerilenler(f, A, g.arac_id).liste[0];
    uyari = `<div class="dsp-uyari kirmizi"><b>${Math.floor(bekle)} dk oldu, kabul gelmedi.</b><span>Şoförü ara ya da yeniden ata.</span>
      ${alt ? `<button type="button" class="btn btn-kucuk dsp-alarm-btn" data-yeniden-oneri="${g.id}" data-arac-id="${alt.a.id}">Yeniden ata: ${esc(fmt.plaka(alt.a.plaka))}${alt.km != null ? ` · ${esc(kmYaz(alt.km))}` : ''}</button>` : ''}</div>`;
  } else if (sev === 1) {
    uyari = `<div class="dsp-uyari sari"><b>${Math.floor(bekle)} dk oldu, kabul gelmedi.</b><span>Şoförü ara.</span></div>`;
  }
  return `<article class="dsp-kart dsp-gorev sev-${sev}" data-gorev="${g.id}">
    <div class="dsp-kart-ust">${a ? plakaHtml(a.plaka) : ''}<span class="ad">${esc(a ? soforAd(a) : trBaslik(g.atanan_ad || '') || 'Atanan kişi')}</span><span class="sag"><span class="dsp-gd gd-${g.durum}">${esc(GD_AD[g.durum] || g.durum)}</span></span></div>
    <div class="dsp-yolcu"><button type="button" class="dsp-kisi-ad" data-kart="${f.id}">${esc(firmaAdi(f))}</button><span>${esc([kisaFirma(f.unvan), f.referans ? 'Ref. ' + trBaslik(f.referans) : ''].filter(Boolean).join(' · '))}</span></div>
    <div class="dsp-yol"><span>${esc(ilceAd(f) || 'Kişinin yeri')}</span><i aria-hidden="true">›</i><span>${esc(String(g.nereye || yerAd()).split(',')[0])}</span>${eta ? `<span class="dsp-eta">${eta.fuarda ? 'vardı' : `~${eta.dk} dk`}${eta.kaynak === 'eta' ? '' : ' tahmini'}</span>` : ''}</div>
    <div class="dsp-zaman">${esc(zaman)} · <b>${esc(sure(gecenDk(g.atandi_zaman)))}</b> geçti</div>
    ${g.notlar ? `<div class="dsp-not-satir">“${esc(g.notlar)}”</div>` : ''}
    ${uyari}
    <div class="dsp-dugmeler">
      <button type="button" class="btn btn-kucuk btn-yesil-acik" data-tamam="${g.id}">Tamamlandı</button>
      <button type="button" class="btn btn-kucuk" data-baskasi="${g.id}" aria-expanded="${yenidenIcin === g.id}">Başkasına ata</button>
      <button type="button" class="btn btn-kucuk dsp-iptal" data-iptal="${g.id}">İptal</button>
      ${a ? telDugme(a.sofor_tel) : ''}${waDugme(g, f, a)}
    </div>
    ${yenidenIcin === g.id ? oneriPanelHtml(f, A, g) : ''}
  </article>`;
}

// ---- sütun 3: alınacak kişiler
function alinacakHtml(K, A) {
  if (arama.trim()) return aramaHtml(A);
  if (!K.length) return bos('Bekleyen alım yok', 'Araç talebi gelince, şoför bir işi reddedince ya da servis saati geçince burada görünür.');
  return K.map(x => kisiKart(x, A)).join('');
}
function kalanHtml(x) {
  const kalan = kapanisaDk();
  if (kalan <= 0) return '<span class="dsp-kalan kritik">Oy saati bitti</span>';
  const sinif = x.pay < 60 ? 'kritik' : x.pay < 120 ? 'dikkat' : '';
  return `<span class="dsp-kalan ${sinif}" title="Oy kapanışı ${esc(bitis())}${x.fuar ? `; kişiden oy yerine yol ~${x.fuar} dk (tahmini)` : ''}">kapanışa ${esc(sure(kalan))}</span>`;
}
function kisiKart(x, A) {
  const { f, tur, g, gec, bekle, acil } = x;
  const et = [];
  if (tur === 'ret') et.push('<span class="dsp-etiket ret">ŞOFÖR REDDETTİ</span>');
  if (acil) et.push('<span class="dsp-etiket acil">ACİL</span>');
  if (tur === 'talep') et.push('<span class="dsp-etiket talep">ARAÇ TALEBİ</span>');
  if (gec > 0) et.push(`<span class="dsp-etiket gecikti">${gec} dk gecikti</span>`);
  else if (f.tasima_saati) et.push(`<span class="dsp-etiket duz">Servis ${esc(fmt.saatKisa(f.tasima_saati))}</span>`);
  else if (tur === 'servis') et.push('<span class="dsp-etiket duz">Servis · saat yok</span>');
  if (f.kisi_oy_sayisi > 1) et.push(`<span class="dsp-etiket duz">${f.kisi_oy_sayisi} OY</span>`);
  const kaynak = tur === 'ret' ? `${esc(trBaslik(g?.atanan_ad || '') || 'Şoför')} reddetti${g?.sebep ? `: “${esc(g.sebep)}”` : ''} · ${esc(sure(bekle))} önce`
    : tur === 'talep' ? `${esc(olusturanAd(g?.olusturan))} · ${esc(saat(g?.olusturma))} · <b>${esc(sure(bekle))}</b> bekliyor`
    : gec > 0 ? `Servis saati ${esc(fmt.saatKisa(f.tasima_saati))}, aracı yok` : 'Servisle gelecek, aracı yok';
  const yetismez = x.fuar != null && kapanisaDk() > 0 && x.pay < 15;
  return `<article class="dsp-kart dsp-kisi${secili === f.id ? ' secili' : ''}${tur === 'ret' || acil ? ' oncelik' : ''}" data-kisi="${f.id}">
    <div class="dsp-kart-ust"><button type="button" class="dsp-kisi-ad buyuk" data-kart="${f.id}">${esc(firmaAdi(f))}</button><span class="sag">${kalanHtml(x)}</span></div>
    <div class="dsp-alt">${esc([kisaFirma(f.unvan), ilceAd(f) || 'ilçe yok', f.referans ? 'Ref. ' + trBaslik(f.referans) : ''].filter(Boolean).join(' · '))}</div>
    ${et.length ? `<div class="dsp-etiketler">${et.join('')}</div>` : ''}
    <div class="dsp-satir">${kaynak}</div>
    ${g?.notlar ? `<div class="dsp-not-satir">“${esc(g.notlar)}”</div>` : ''}
    ${yetismez ? `<div class="dsp-uyari kirmizi">Kişiden oy yerine ~${x.fuar} dk: kapanışa yetişmeyebilir.</div>` : ''}
    ${secili === f.id ? oneriPanelHtml(f, A) : `<button type="button" class="btn btn-kirmizi dsp-ata-btn" data-sec="${f.id}">Araç ata</button>`}
  </article>`;
}
function aramaHtml(A) {
  const l = firmaListesi().filter(f => f.listede !== false && aramaEslesir(f, arama.trim()))
    .sort((a, b) => firmaAdi(a).localeCompare(firmaAdi(b), 'tr')).slice(0, 8);
  if (!l.length) return bos('Kimse bulunamadı', 'Ad, firma, ilçe ya da telefonla ara.');
  return `<div class="dsp-ara-baslik">Arama sonuçları · ${l.length}</div>` + l.map(f => {
    const g = firmaAcikGorev(f.id), a = g?.arac_id ? store.araclar.get(g.arac_id) : null;
    const gorevde = g && GOREV_AKTIF.includes(g.durum);
    const durum = TAMAM.includes(f.durum) ? `<span class="dsp-etiket duz">${f.durum === 'oy_kullandi' ? 'Oy kullandı' : 'Fuarda'}</span>`
      : gorevde ? `<span class="dsp-etiket talep">Görevde${a ? ' · ' + esc(fmt.plaka(a.plaka)) : ''}</span>` : g ? '<span class="dsp-etiket talep">Araç talebi var</span>' : '';
    const atanabilir = !TAMAM.includes(f.durum) && !gorevde;
    return `<article class="dsp-kart dsp-kisi${secili === f.id ? ' secili' : ''}" data-kisi="${f.id}">
      <div class="dsp-kart-ust"><button type="button" class="dsp-kisi-ad buyuk" data-kart="${f.id}">${esc(firmaAdi(f))}</button><span class="sag">${durum}</span></div>
      <div class="dsp-alt">${esc([kisaFirma(f.unvan), ilceAd(f) || 'ilçe yok', f.referans ? 'Ref. ' + trBaslik(f.referans) : ''].filter(Boolean).join(' · '))}</div>
      ${atanabilir ? (secili === f.id ? oneriPanelHtml(f, A) : `<button type="button" class="btn btn-kirmizi dsp-ata-btn" data-sec="${f.id}">Araç ata</button>`) : ''}
    </article>`;
  }).join('');
}
// öneri paneli: kişiye en yakın boş araçlar. gorev verilirse "Başkasına ata" kipi (o görevin aracı listede yok)
function oneriPanelHtml(f, A, gorev = null) {
  const { fy, liste } = onerilenler(f, A, gorev?.arac_id ?? null);
  const ilk = liste.slice(0, ONERI_SAYI), diger = liste.slice(ONERI_SAYI);
  yolSuresiIste(f, ilk);
  const nitelik = gorev ? `data-yeniden-ata` : 'data-ata';
  const satir = (x, i) => {
    const tahmini = x.yer && !x.yer.fuar && kaynakBilgi(x.a).tahmini;
    return `<button type="button" class="dsp-oneri-satir${i === 0 ? ' ilk' : ''}" ${nitelik}="${x.a.id}"${gorev ? ` data-gorev-id="${gorev.id}"` : ''}>
      <span class="sira">${i + 1}</span>
      <span class="arac"><span class="arac-ust">${plakaHtml(x.a.plaka)}<span class="ad">${esc(soforAd(x.a))}</span></span><small>${x.bos} boş koltuk · ${esc(konumKisa(x))}</small></span>
      <span class="uzak"><b>${x.km != null ? esc(kmYaz(x.km)) : 'konum yok'}</b><small>${x.dk ? `~${x.dk} dk${x.yolSuresi ? ' yol' : ''}` : ''}${tahmini ? `${x.dk ? ' · ' : ''}tahmini` : ''}</small></span>
      <span class="git">Ata ›</span>
    </button>`;
  };
  const nereden = fy ? (fy.tahmini ? `${ilceAd(f)} ilçesindeki kişilerin ortasına göre (adresin konumu yok)` : 'kişinin adresine göre, kuş uçuşu') : 'kişinin konumu yok: en uzun boşta kalan araçlar önce';
  const eski = gorev ? store.araclar.get(gorev.arac_id) : null;
  return `<div class="dsp-oneri" data-oneri>
    <div class="dsp-oneri-ust"><b>${gorev ? 'Başka araca ver' : 'En yakın boş araçlar'}</b><span>${esc(nereden)}</span></div>
    ${ilk.length ? ilk.map(satir).join('') : '<div class="dsp-bos-kucuk">Şu an boş araç yok. Görevdeki bir araç işi bitirince burada görünür.</div>'}
    ${diger.length ? `<details class="dsp-diger" data-diger${digerAcik ? ' open' : ''}><summary>Diğer boş araçlar (${diger.length})</summary>${diger.map((x, i) => satir(x, i + ONERI_SAYI)).join('')}</details>` : ''}
    ${gorev ? `<div class="dsp-oneri-not">Eski görev iptal edilir, yenisi açılır: iki şoför aynı anda bu işte olmaz.${eski ? ` Eski şoföre (${esc(soforAd(eski))}) haber ver.` : ''}</div>`
      : `<label class="dsp-not"><span>Not (isteğe bağlı)</span><input class="girdi" data-not maxlength="160" value="${esc(notMetni)}" placeholder="Nereden alınacak, kapı, kat…"></label>`}
    <div class="dsp-oneri-alt"><button type="button" class="btn btn-kucuk" data-vazgec>Vazgeç</button></div>
  </div>`;
}

function ciz() {
  cizimIstendi = false;
  if (!kok || !kok.isConnected) return;
  if (yaziyor()) { bekleyenCizim = true; return; }
  bekleyenCizim = false;
  const A = araclariHazirla(), G = gorevdekiler(), K = alinacaklar();
  // seçili kişi listeden çıktıysa (başka biri atadı) panel kapanır; görev bittiyse "başkasına ata" paneli kapanır
  if (secili != null && !arama.trim() && !K.some(x => x.f.id === secili)) secili = null;
  if (yenidenIcin != null && !G.some(x => x.g.id === yenidenIcin)) yenidenIcin = null;
  const kap = kok.querySelector('.dsp');
  kap.dataset.sekme = sekme;
  $('[data-r="ust"]').innerHTML = ustHtml(A, G, K);
  $('[data-r="durum"]').innerHTML = durumHtml();
  const say = { musait: A.filter(x => x.musait).length, gorevde: G.length, alinacak: K.length };
  $('[data-r="sekmeler"]').innerHTML = SEKMELER.map(s => `<button type="button" role="tab" aria-selected="${sekme === s.k}" class="${sekme === s.k ? 'aktif' : ''}" data-sekme-sec="${s.k}">${esc(s.ad)}<span class="dsp-sekme-say${s.k === 'alinacak' && say.alinacak ? ' vurgu' : ''}">${say[s.k]}</span></button>`).join('');
  for (const k of Object.keys(say)) { const e = $(`[data-say="${k}"]`); if (e) e.textContent = String(say[k]); }
  $('[data-r="musait"]').innerHTML = musaitHtml(A, K);
  $('[data-r="gorevde"]').innerHTML = gorevdeHtml(G, A);
  $('[data-r="alinacak"]').innerHTML = alinacakHtml(K, A);
}
function planla() { if (cizimIstendi) return; cizimIstendi = true; requestAnimationFrame(ciz); }
const yaziyor = () => !!(kok && document.activeElement?.matches?.('[data-not]') && kok.contains(document.activeElement));
function gorunurYap(sec) { requestAnimationFrame(() => { const e = kok?.querySelector(sec); if (e) e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }); }

// ---------------------------------------------------------------- işlemler
// TEK DOKUNUŞ ATAMA: gorevler'e tek atama (kişinin açık talebi varsa o görev, yoksa yenisi) + ajan akışına satır
async function ata(firmaId, aracId) {
  if (islem) return; islem = true;
  const f = store.firmalar.get(firmaId), a = store.araclar.get(aracId);
  try {
    const acik = firmaAcikGorev(firmaId);
    const g = await alimAta(firmaId, aracId, { aciliyet: acik?.aciliyet || null, not: notMetni.trim() || null });
    secili = null; notMetni = ''; arama = ''; const ara = $('[data-dsp-ara]'); if (ara) ara.value = '';
    ajanOlayYaz({ eylem: 'gorev_atadi', hedef: `sofor: ${soforAd(a)}`, ozet: `Alım görevi #${g.id} araca verildi${f?.ilce ? ' · ' + ilceAd(f) : ''} (araç yöneticisi)`,
      firma_id: firmaId, arac_id: aracId, gorev_id: g.id, veri: { plaka: a?.plaka, kisi: firmaAdi(f), atayan: store.ben?.ad_soyad } }).catch(() => {});
    toast(`${firmaAdi(f)} > ${fmt.plaka(a?.plaka)} · ${soforAd(a)}`, {
      tur: 'basari', sure: 7000, geriAlMetin: 'Atama geri alındı, kişi yeniden bekleyenlerde',
      geriAl: () => gorevDurumYap(g.id, 'acik', { sebep: 'atama geri alındı' }),
    });
  } catch (e) { hataGoster(e); }
  finally { islem = false; ciz(); }
}
// BAŞKASINA ATA: eskisini iptal et, yenisini aç. Yeni araç önce denetlenir; yeni atama olmazsa kişi açık talep olarak listeye döner.
async function baskasinaAta(gorevId, yeniAracId, { sor = false } = {}) {
  if (islem) return;
  const g = store.gorevler.get(gorevId); if (!g) return;
  const f = store.firmalar.get(g.firma_id), eski = store.araclar.get(g.arac_id), yeni = store.araclar.get(yeniAracId);
  if (!f || !yeni) return;
  if (DISI.includes(yeni.durum)) return hataGoster(new Error(`${fmt.plaka(yeni.plaka)} şu an hizmet dışı`));
  const mesgul = aracAktifGorev(yeniAracId); if (mesgul) return hataGoster(new Error(`${fmt.plaka(yeni.plaka)} şu an başka bir alımda (görev #${mesgul.id})`));
  if (sor && !(await onayla(`${firmaAdi(f)} alımı ${eski ? fmt.plaka(eski.plaka) : 'eski araçtan'} alınıp ${fmt.plaka(yeni.plaka)} aracına verilsin mi? Eski şoföre haber vermeyi unutma.`, { evet: 'Evet, yeniden ata' }))) return;
  islem = true;
  try {
    await gorevDurumYap(gorevId, 'iptal', { sebep: `başka araca verildi: ${fmt.plaka(yeni.plaka)}` });
    let yeniG;
    try { yeniG = await alimAta(g.firma_id, yeniAracId, { aciliyet: g.aciliyet, not: g.notlar }); }
    catch (e) {
      await alimTalebiAc(g.firma_id, { aciliyet: g.aciliyet, not: g.notlar, sebep: 'yeniden atama yapılamadı' }).catch(() => {});
      throw new Error(`Eski görev iptal edildi ama yeni atama yapılamadı (${e.message}). Kişi bekleyenler listesine döndü.`);
    }
    yenidenIcin = null;
    ajanOlayYaz({ eylem: 'gorev_yeniden_atadi', onem: 'dikkat', hedef: `sofor: ${soforAd(yeni)}`, ozet: `Alım görevi #${gorevId} başka araca verildi (yeni görev #${yeniG.id})${f.ilce ? ' · ' + ilceAd(f) : ''}`,
      firma_id: f.id, arac_id: yeniAracId, gorev_id: yeniG.id, veri: { eski_plaka: eski?.plaka, yeni_plaka: yeni.plaka, atayan: store.ben?.ad_soyad } }).catch(() => {});
    eskiSoforeHaber(f, eski, yeni);
  } catch (e) { hataGoster(e); }
  finally { islem = false; ciz(); }
}
// tek şoför kuralının insan tarafı: işi elinden alınan şoföre haber verilir (D16). Telefon varsa Ara / WhatsApp, yoksa yalnız uyarı.
function eskiSoforeHaber(f, eski, yeni) {
  const tel = ilkNumara(eski?.sofor_tel);
  const metin = `${firmaAdi(f)} > ${fmt.plaka(yeni.plaka)} · ${soforAd(yeni)}`;
  if (!tel) { toast(`${metin}. Eski şoföre (${soforAd(eski)}) haber ver.`, { tur: 'basari', sure: 8000 }); return; }
  const wa = fmt.waLink(tel, `Merhaba ${trBaslik(String(eski.sofor_ad || '').split(/\s+/)[0])}, ${firmaAdi(f)} alımını başka araca verdik, gitmene gerek yok. Teşekkürler.`);
  const m = modal('Eski şoföre haber ver', `<p style="margin:0 0 6px;font-weight:700">${esc(metin)}</p><p style="margin:0;color:var(--ink-2)">${esc(soforAd(eski))} bu işe gitmesin: şimdi ara ya da yaz.</p>`,
    `<button type="button" class="btn" data-kapat>Kapat</button><a class="btn" href="${fmt.telLink(tel)}">Ara</a>${wa ? `<a class="btn btn-koyu" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`);
  m.querySelectorAll('a').forEach(x => x.addEventListener('click', () => setTimeout(modalKapat, 300)));
}
async function tamamla(gorevId) {
  const g = store.gorevler.get(gorevId); if (!g) return;
  const f = store.firmalar.get(g.firma_id);
  if (!(await onayla(`${firmaAdi(f) || 'Kişi'} oy yerine (${yerAd()}) bırakıldı mı? Görev kapanır, araç boşa çıkar.`, { evet: 'Evet, tamamlandı' }))) return;
  try {
    await gorevDurumYap(gorevId, 'tamam', { sebep: 'araç yöneticisi kapattı' });
    if (f && ['bekliyor', 'arandi', 'yolda'].includes(f.durum)) await durumYap([f.id], 'fuarda', { metin: 'Araç yöneticisi: alım tamamlandı' });
    ajanOlayYaz({ eylem: 'gorev_tamam', ozet: `Alım görevi #${gorevId} tamamlandı${f?.ilce ? ' · ' + ilceAd(f) : ''}`, firma_id: g.firma_id, arac_id: g.arac_id, gorev_id: gorevId }).catch(() => {});
    toast(`${firmaAdi(f)} · alım tamamlandı`, { tur: 'basari' });
  } catch (e) { hataGoster(e); }
  ciz();
}
async function iptalEt(gorevId) {
  const g = store.gorevler.get(gorevId); if (!g) return;
  const f = store.firmalar.get(g.firma_id);
  if (!(await onayla(`${firmaAdi(f) || 'Kişi'} alımı iptal edilsin mi? Şoför bu işten çıkar, kişi bekleyenler listesinden de düşer.`, { evet: 'Evet, iptal et', tehlike: true }))) return;
  try {
    await gorevDurumYap(gorevId, 'iptal', { sebep: 'araç yöneticisi iptal etti' });
    if (yenidenIcin === gorevId) yenidenIcin = null;
    ajanOlayYaz({ eylem: 'gorev_iptal', onem: 'dikkat', ozet: `Alım görevi #${gorevId} iptal edildi${f?.ilce ? ' · ' + ilceAd(f) : ''}`, firma_id: g.firma_id, arac_id: g.arac_id, gorev_id: gorevId }).catch(() => {});
    toast(`${firmaAdi(f)} · alım iptal edildi`, { geriAl: () => gorevDurumYap(gorevId, 'acik', { sebep: 'iptal geri alındı' }), geriAlMetin: 'İptal geri alındı, kişi bekleyenlerde' });
  } catch (e) { hataGoster(e); }
  ciz();
}
async function aracDurumDegistir(id, durum) {
  const a = store.araclar.get(id); if (!a || a.durum === durum) return;
  if (DISI.includes(durum) && aracAktifGorev(id)) {
    if (!(await onayla(`${fmt.plaka(a.plaka)} şu an bir alımda. Durumu yine de "${ARAC_DURUMLARI.find(d => d.k === durum)?.ad}" yapılsın mı? Görevi ayrıca başka araca ver.`, { evet: 'Evet, değiştir' }))) return ciz();
  }
  try { await aracDurumYap(id, durum); toast(`${fmt.plaka(a.plaka)} · ${ARAC_DURUMLARI.find(d => d.k === durum)?.ad || durum}`); }
  catch (e) { hataGoster(e); }
}
// yeni araç talebi (ajan ya da masa açtı): kısa uyarı. Kendi açtığım ve ilk yüklemedekiler uyarı vermez.
function yeniTalepKontrol() {
  if (!gorevMotoruAl() && store.gorevDurum !== 'hazir') return;
  const acik = gorevListesi().filter(g => g.tur === 'alim' && g.durum === 'acik');
  if (!gorulenTalep) { gorulenTalep = new Set(acik.map(g => g.id)); return; }
  for (const g of acik) {
    if (gorulenTalep.has(g.id)) continue;
    gorulenTalep.add(g.id);
    if (g.olusturan_id && g.olusturan_id === store.ben?.id) continue;
    const f = store.firmalar.get(g.firma_id); if (!f) continue;
    toast(`Yeni araç talebi: ${firmaAdi(f)}${f.ilce ? ' · ' + ilceAd(f) : ''} (${olusturanAd(g.olusturan)})`, { tur: 'bildirim', nokta: 'yolda', sure: 8000 });
  }
}

// ---------------------------------------------------------------- olaylar
function bagla() {
  kok.addEventListener('click', e => {
    const t = e.target;
    const sk = t.closest('[data-sekme-sec]');
    if (sk) { sekme = sk.dataset.sekmeSec; try { localStorage.setItem(SEKME_ANAHTAR, sekme); } catch {} ciz(); window.scrollTo({ top: 0 }); return; }
    const kart = t.closest('[data-kart]'); if (kart) return kisiKartiAc(Number(kart.dataset.kart));
    const sec = t.closest('[data-sec]');
    if (sec) { const id = Number(sec.dataset.sec); secili = secili === id ? null : id; yenidenIcin = null; notMetni = ''; digerAcik = false; ciz(); gorunurYap('.dsp-kisi.secili [data-oneri]'); return; }
    if (t.closest('[data-vazgec]')) { secili = null; yenidenIcin = null; notMetni = ''; return ciz(); }
    const at = t.closest('[data-ata]'); if (at) { if (secili != null) ata(secili, Number(at.dataset.ata)); return; }
    const ha = t.closest('[data-hizli-ata]'); if (ha) return ata(Number(ha.dataset.hizliAta), Number(ha.dataset.aracId));
    const ya = t.closest('[data-yeniden-ata]'); if (ya) return baskasinaAta(Number(ya.dataset.gorevId), Number(ya.dataset.yenidenAta));
    const yo = t.closest('[data-yeniden-oneri]'); if (yo) return baskasinaAta(Number(yo.dataset.yenidenOneri), Number(yo.dataset.aracId), { sor: true });
    const bk = t.closest('[data-baskasi]');
    if (bk) { const id = Number(bk.dataset.baskasi); yenidenIcin = yenidenIcin === id ? null : id; secili = null; digerAcik = false; ciz(); if (yenidenIcin) gorunurYap(`[data-gorev="${id}"] [data-oneri]`); return; }
    const tm = t.closest('[data-tamam]'); if (tm) return tamamla(Number(tm.dataset.tamam));
    const ip = t.closest('[data-iptal]'); if (ip) return iptalEt(Number(ip.dataset.iptal));
  });
  kok.addEventListener('change', e => { const s = e.target.closest('[data-arac-durum]'); if (s) aracDurumDegistir(Number(s.dataset.aracDurum), s.value); });
  kok.addEventListener('input', e => {
    if (e.target.matches('[data-not]')) { notMetni = e.target.value; return; }
    if (e.target.matches('[data-dsp-ara]')) { arama = e.target.value; secili = null; planla(); }
  });
  kok.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches('[data-dsp-ara]') && arama) { e.stopPropagation(); e.target.value = ''; arama = ''; ciz(); } });
  kok.addEventListener('focusout', e => { if (e.target.matches?.('[data-not]')) setTimeout(() => { if (bekleyenCizim && !yaziyor()) ciz(); }, 0); });
  // details açık/kapalı durumu yeniden çizimde korunur (toggle olayı kabarmaz: yakalama evresinde dinlenir)
  kok.addEventListener('toggle', e => { if (e.target.matches?.('[data-akis]')) akisAcik = e.target.open; else if (e.target.matches?.('[data-diger]')) digerAcik = e.target.open; }, true);
}

// ---------------------------------------------------------------- stil (bir kez)
function stilEkle() {
  if (document.querySelector('style[data-ekran="dispec"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'dispec';
  s.textContent = `
.dsp { --dsp-alarm:#C62828; --dsp-alarm-soft:#FDECEC; display:flex; flex-direction:column; gap:14px; padding-bottom:96px; min-width:0; }
:root[data-theme="dark"] .dsp { --dsp-alarm:#F26B6B; --dsp-alarm-soft:rgba(242,107,107,.14); }
.dsp-demo { display:flex; align-items:center; gap:10px; padding:9px 14px; border-radius:12px; background:var(--amber-soft); border:1.5px solid var(--amber); color:var(--amber-ink); font-size:13px; font-weight:600; }
.dsp-demo b { flex:none; padding:2px 7px; border-radius:6px; background:var(--amber); color:#1a1200; font-size:11px; font-weight:900; letter-spacing:.08em; }
.dsp-ust { display:flex; align-items:flex-end; gap:16px; flex-wrap:wrap; }
.dsp-baslik { min-width:0; }
.dsp-baslik h1 { margin:0; font-size:26px; font-weight:900; letter-spacing:-.02em; line-height:1.1; }
.dsp-baslik .alt { margin-top:4px; font-size:13px; font-weight:600; color:var(--ink-3); }
.dsp-sayilar { margin-left:auto; display:grid; grid-template-columns:repeat(4, minmax(132px, 1fr)); gap:10px; }
.dsp-sayi { display:flex; flex-direction:column; gap:3px; min-width:0; padding:10px 14px; border-radius:12px; background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); }
.dsp-sayi span { font-size:10.5px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-sayi b { font-size:32px; font-weight:900; letter-spacing:-.03em; line-height:1; font-variant-numeric:tabular-nums; }
.dsp-sayi small { font-size:11.5px; font-weight:600; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-sayi.yesil b { color:var(--green); }
.dsp-sayi.uyari { border-color:var(--yellow); }
.dsp-sayi.uyari small { color:var(--yellow-ink); font-weight:800; }
.dsp-sayi.vurgu { background:var(--red); border-color:var(--red-d); color:var(--on-red); }
.dsp-sayi.vurgu span, .dsp-sayi.vurgu small { color:rgba(255,255,255,.86); }
.dsp-akis { margin-top:10px; border:1px solid var(--line); border-radius:12px; background:var(--surface); box-shadow:var(--shadow); }
.dsp-akis summary { display:flex; align-items:center; gap:10px; padding:9px 14px; cursor:pointer; list-style:none; min-width:0; }
.dsp-akis summary::-webkit-details-marker { display:none; }
.dsp-akis-etk { flex:none; padding:2px 7px; border-radius:6px; background:var(--ink); color:var(--surface); font-size:10.5px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
.dsp-akis-son { flex:1; min-width:0; font-size:12.5px; font-weight:600; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-akis-ok { flex:none; color:var(--ink-3); transition:transform .15s; }
.dsp-akis[open] .dsp-akis-ok { transform:rotate(180deg); }
.dsp-akis ol { margin:0; padding:4px 14px 10px; list-style:none; display:flex; flex-direction:column; gap:4px; border-top:1px solid var(--line); }
.dsp-akis li { display:grid; grid-template-columns:44px 150px minmax(0,1fr); gap:8px; font-size:12.5px; padding-top:4px; }
.dsp-akis time { font-weight:800; font-variant-numeric:tabular-nums; }
.dsp-akis .aj { color:var(--ink-3); font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-akis .o-kritik .oz, .dsp-akis-son.o-kritik { color:var(--dsp-alarm); font-weight:700; }
.dsp-akis .o-dikkat .oz { color:var(--amber-ink); font-weight:700; }
.dsp-yukleniyor { font-size:12.5px; font-weight:700; color:var(--ink-3); }
.dsp-sekmeler { display:none; }
.dsp-izgara { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.15fr); gap:16px; align-items:start; }
.dsp-sutun { display:flex; flex-direction:column; gap:10px; min-width:0; }
.dsp-sutun-ust { display:flex; align-items:center; gap:8px; min-height:26px; padding:0 2px; }
.dsp-sutun-ust h2 { margin:0; font-size:12px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; color:var(--ink); }
.dsp-sutun-ust .say { min-width:24px; height:22px; padding:0 7px; border-radius:99px; background:var(--surface-3); font-size:12px; font-weight:800; display:grid; place-items:center; font-variant-numeric:tabular-nums; }
.dsp-sutun[data-sutun="alinacak"] .dsp-sutun-ust .say { background:var(--red); color:var(--on-red); }
.dsp-ipucu { margin-left:auto; font-size:11px; font-weight:600; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.dsp-liste { display:flex; flex-direction:column; gap:10px; min-width:0; }
.dsp-ara .girdi { height:40px; }
.dsp-ara-baslik { font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); padding:0 2px; }
.dsp-kart { display:flex; flex-direction:column; gap:8px; min-width:0; padding:12px 14px; border-radius:14px; background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); }
.dsp-kart.sev-1 { border-color:var(--yellow); box-shadow:inset 3px 0 0 var(--yellow), var(--shadow); }
.dsp-kart.sev-2 { border-color:var(--dsp-alarm); box-shadow:inset 4px 0 0 var(--dsp-alarm), var(--shadow); }
.dsp-kart.bosta-uzun { border-color:var(--amber); }
.dsp-kart.oncelik { box-shadow:inset 4px 0 0 var(--dsp-alarm), var(--shadow); }
.dsp-kart.secili { border-color:var(--red); box-shadow:0 0 0 2px var(--red-line), var(--shadow); }
.dsp-kart-ust { display:flex; align-items:center; gap:8px; min-width:0; }
.dsp-kart-ust .ad { min-width:0; font-size:14px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-kart-ust .sag { margin-left:auto; flex:none; display:flex; align-items:center; gap:6px; }
.dsp-kisi-ad { min-width:0; padding:0; border:0; background:none; color:var(--ink); font-size:14px; font-weight:800; text-align:left; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-kisi-ad.buyuk { font-size:15.5px; }
.dsp-kisi-ad:hover { text-decoration:underline; text-underline-offset:2px; }
.dsp-alt, .dsp-satir { font-size:12.5px; font-weight:600; color:var(--ink-2); min-width:0; overflow-wrap:anywhere; }
.dsp-satir b { color:var(--ink); }
.dsp-konum::before { content:'◎ '; color:var(--ink-3); }
.dsp-satir.eski { color:var(--amber-ink); }
.dsp-satir.yok { color:var(--ink-3); }
.dsp-olcu { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:6px; }
.dsp-olcu > div { min-width:0; padding:6px 8px; border-radius:9px; background:var(--surface-2); border:1px solid var(--line); }
.dsp-olcu b { display:block; font-size:16px; font-weight:900; line-height:1.15; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-olcu span { display:block; font-size:10px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-dugmeler { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.dsp-dugmeler .btn { height:32px; padding:0 11px; font-size:12.5px; }
.dsp-iptal { color:var(--dsp-alarm); }
.dsp-durum-sec { height:32px; margin-left:auto; padding:0 8px; border-radius:8px; border:1px solid var(--line-2); background:var(--surface); color:var(--ink); font-size:12.5px; font-weight:700; cursor:pointer; }
.dsp-uyari { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; padding:8px 10px; border-radius:10px; font-size:12.5px; font-weight:600; }
.dsp-uyari b { font-weight:800; }
.dsp-uyari .btn { margin-left:auto; }
.dsp-uyari.sari { background:var(--yellow-soft); color:var(--yellow-ink); border:1px solid var(--yellow); }
.dsp-uyari.kirmizi { background:var(--dsp-alarm-soft); color:var(--dsp-alarm); border:1px solid var(--dsp-alarm); }
.dsp-uyari.amber { background:var(--amber-soft); color:var(--amber-ink); border:1px solid var(--amber); }
.dsp-alarm-btn { background:var(--dsp-alarm); border-color:var(--dsp-alarm); color:#fff; font-weight:800; }
.dsp-alarm-btn:hover { background:var(--dsp-alarm); filter:brightness(.92); }
.dsp-oneri-yazi { min-width:0; color:inherit; }
.dsp-oneri-mini { display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:10px; background:var(--surface-2); border:1px dashed var(--line-2); font-size:12.5px; font-weight:600; color:var(--ink-2); }
.dsp-oneri-mini .btn { margin-left:auto; }
.dsp-gd { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:6px; font-size:11px; font-weight:800; letter-spacing:.03em; white-space:nowrap; }
.dsp-gd.gd-atandi { background:var(--gray-soft); color:var(--ink-2); }
.dsp-gd.gd-kabul { background:var(--blue-soft); color:var(--blue); }
.dsp-gd.gd-yolda { background:var(--amber-soft); color:var(--amber-ink); }
.dsp-kart.sev-1 .dsp-gd.gd-atandi { background:var(--yellow-soft); color:var(--yellow-ink); }
.dsp-kart.sev-2 .dsp-gd.gd-atandi { background:var(--dsp-alarm); color:#fff; }
.dsp-yolcu { display:flex; flex-direction:column; gap:1px; min-width:0; }
.dsp-yolcu span { font-size:12.5px; font-weight:600; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-yol { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12.5px; font-weight:700; }
.dsp-yol i { font-style:normal; color:var(--ink-3); }
.dsp-eta { padding:1px 7px; border-radius:6px; background:var(--surface-3); font-size:11.5px; font-weight:800; }
.dsp-zaman { font-size:12px; font-weight:600; color:var(--ink-3); }
.dsp-zaman b { color:var(--ink); }
.dsp-not-satir { font-size:12.5px; font-style:italic; color:var(--ink-2); border-left:3px solid var(--line-2); padding-left:8px; }
.dsp-etiketler { display:flex; flex-wrap:wrap; gap:5px; }
.dsp-etiket { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:6px; font-size:11px; font-weight:800; letter-spacing:.03em; white-space:nowrap; border:1.5px solid transparent; }
.dsp-etiket.talep { background:var(--red-soft); color:var(--red); border-color:var(--red-line); }
.dsp-etiket.acil, .dsp-etiket.ret { background:var(--dsp-alarm); color:#fff; }
.dsp-etiket.gecikti { background:var(--amber-soft); color:var(--amber-ink); border-color:var(--amber); }
.dsp-etiket.duz { background:transparent; color:var(--ink-2); border:1px solid var(--line-2); font-weight:700; }
.dsp-kalan { font-size:11.5px; font-weight:800; color:var(--ink-3); white-space:nowrap; font-variant-numeric:tabular-nums; }
.dsp-kalan.dikkat { color:var(--amber-ink); }
.dsp-kalan.kritik { color:var(--dsp-alarm); }
.dsp-ata-btn { height:40px; font-size:14px; }
.dsp-oneri { display:flex; flex-direction:column; gap:6px; padding:10px; border-radius:12px; background:var(--surface-2); border:1.5px solid var(--red); }
.dsp-oneri-ust { display:flex; flex-direction:column; gap:1px; padding:0 2px 2px; }
.dsp-oneri-ust b { font-size:13px; font-weight:900; }
.dsp-oneri-ust span { font-size:11.5px; font-weight:600; color:var(--ink-3); }
.dsp-oneri-satir { display:grid; grid-template-columns:24px minmax(0,1fr) auto auto; align-items:center; gap:10px; width:100%; min-height:56px; padding:8px 10px; border-radius:10px; border:1px solid var(--line-2); background:var(--surface); color:var(--ink); text-align:left; cursor:pointer; font:inherit; transition:border-color .12s, box-shadow .12s; }
.dsp-oneri-satir:hover { border-color:var(--red); }
.dsp-oneri-satir.ilk { border-color:var(--red); box-shadow:inset 0 0 0 1px var(--red); }
.dsp-oneri-satir:disabled { opacity:.5; cursor:wait; }
.dsp-oneri-satir .sira { width:24px; height:24px; border-radius:99px; background:var(--surface-3); display:grid; place-items:center; font-size:12px; font-weight:900; }
.dsp-oneri-satir.ilk .sira { background:var(--red); color:var(--on-red); }
.dsp-oneri-satir .arac { display:flex; flex-direction:column; gap:3px; min-width:0; }
.dsp-oneri-satir .arac-ust { display:flex; align-items:center; gap:8px; min-width:0; }
.dsp-oneri-satir .ad { min-width:0; font-size:13px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-oneri-satir small { font-size:11.5px; font-weight:600; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-oneri-satir .uzak { display:flex; flex-direction:column; align-items:flex-end; gap:1px; }
.dsp-oneri-satir .uzak b { font-size:15px; font-weight:900; white-space:nowrap; font-variant-numeric:tabular-nums; }
.dsp-oneri-satir .git { font-size:13px; font-weight:900; color:var(--red); white-space:nowrap; }
.dsp-diger summary { cursor:pointer; padding:6px 4px; font-size:12.5px; font-weight:800; color:var(--ink-2); }
.dsp-diger[open] { display:flex; flex-direction:column; gap:6px; }
.dsp-oneri-not { font-size:12px; font-weight:700; color:var(--ink-2); padding:2px; }
.dsp-not { display:flex; flex-direction:column; gap:4px; font-size:11.5px; font-weight:700; color:var(--ink-3); }
.dsp-not .girdi { height:38px; font-size:14px; }
.dsp-oneri-alt { display:flex; justify-content:flex-end; }
.dsp-bos { display:flex; flex-direction:column; align-items:center; gap:4px; padding:26px 14px; border:1.5px dashed var(--line-2); border-radius:14px; text-align:center; }
.dsp-bos b { font-size:14.5px; font-weight:800; }
.dsp-bos span { font-size:12.5px; font-weight:600; color:var(--ink-3); max-width:300px; }
.dsp-bos-kucuk { padding:10px; font-size:12.5px; font-weight:600; color:var(--ink-3); text-align:center; }
.dsp-ek-liste { display:flex; flex-direction:column; gap:6px; padding:10px 12px; border-radius:12px; background:var(--surface-2); border:1px solid var(--line); }
.dsp-ek-etk { font-size:10.5px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3); }
.dsp-ek-satir { display:flex; align-items:center; gap:8px; min-width:0; color:var(--ink); }
.dsp-ek-satir .ad { min-width:0; font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-ek-satir .ek { margin-left:auto; flex:none; font-size:11.5px; font-weight:600; color:var(--ink-3); }
.dsp-ek-satir .dsp-durum-sec { height:28px; font-size:12px; }
a.dsp-ek-satir:hover .ad { text-decoration:underline; }
.dsp-sekme-say { margin-left:6px; min-width:20px; height:20px; padding:0 6px; border-radius:99px; background:var(--surface-3); font-size:11.5px; font-weight:800; display:inline-grid; place-items:center; }
.dsp-sekme-say.vurgu { background:var(--red); color:var(--on-red); }
@media (max-width: 1280px) { .dsp-sayilar { margin-left:0; width:100%; } }
@media (max-width: 900px) {
  .dsp { gap:12px; }
  .dsp-baslik h1 { font-size:22px; }
  .dsp-sayilar { grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
  .dsp-sayi { padding:9px 12px; }
  .dsp-sayi b { font-size:26px; }
  .dsp-akis { margin-top:0; }
  .dsp-akis li { grid-template-columns:40px minmax(0,1fr); }
  .dsp-akis .aj { grid-column:2; }
  .dsp-akis .oz { grid-column:2; }
  .dsp-sekmeler { display:grid; position:sticky; top:var(--mb-h); z-index:6; box-shadow:0 6px 12px -8px rgba(0,0,0,.25); }
  .dsp-sekmeler > button { height:40px; font-size:14px; }
  .dsp-izgara { grid-template-columns:minmax(0,1fr); }
  .dsp[data-sekme="musait"] .dsp-sutun:not([data-sutun="musait"]),
  .dsp[data-sekme="gorevde"] .dsp-sutun:not([data-sutun="gorevde"]),
  .dsp[data-sekme="alinacak"] .dsp-sutun:not([data-sutun="alinacak"]) { display:none; }
  .dsp-ipucu { display:none; }
  .dsp-oneri-satir { grid-template-columns:22px minmax(0,1fr) auto; gap:8px; padding:8px; }
  .dsp-oneri-satir .git { display:none; }
  .dsp-ata-btn { height:46px; font-size:15px; }
  .dsp-dugmeler .btn { height:38px; }
  .dsp-durum-sec { height:38px; }
}
@media (max-width: 420px) {
  .dsp-demo { font-size:12px; }
  .dsp-kart { padding:11px 12px; }
}
`;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- ekran modülü
export default {
  async render(hedef) {
    stilEkle();
    kok = hedef; secili = null; yenidenIcin = null; notMetni = ''; islem = false; bekleyenCizim = false;
    kok.innerHTML = iskeletHtml();
    bagla();
    if (!gorevMotoruAl()) { gorevCanliBaglan(); if (store.gorevDurum !== 'hazir') gorevYukle(); }
    yeniTalepKontrol();
    ciz();
  },
  // app.js aynı karedeki olayları tek çağrıda birleştirir (yalnız ilk olayın adı gelir): yeni talep denetimi her çağrıda yapılır
  yenile() {
    if (!kok || !kok.isConnected) return;
    yeniTalepKontrol();
    ciz();
  },
  temizle() { kok = null; secili = null; yenidenIcin = null; notMetni = ''; },
};
