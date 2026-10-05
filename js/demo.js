// Seçim Masası · DEMO (ATLAS, 2026-10-05)
// Adres: ./?k=2627&demo=1#harita  (yalnız 72 dışındaki seçimde, komite.js > DEMO).
// Veritabanı OLMADAN gösterim: sahte 5 araç (farklı yaşta GPS / sözlü / ilçe konumu) + 12 sahte durak.
// GÜVENLİK: Supabase istemcisinin okuma/yazma/RPC/edge/realtime/auth çağrıları burada boşa bağlanır; hiçbir istek
// veritabanına gitmez, hiçbir şey kaydedilmez. Çevrimdışı işaret sırası da diske yazılmaz (gerçek sıra varsa bozulmaz).
// Kişi, firma ve plakaların hepsi uydurmadır ("Örnek ..."), gerçek kişiyle ilgisi yoktur.
import { store, bus, sb, konumGonder, VARIS, simdi } from './core.js';
import { anahtar } from './komite.js';

const DK = 60000;

// ---------------------------------------------------------------- Supabase'i boşa bağla
// Sorgu zinciri (select/eq/order/insert/update...) her adımda kendini döndürür; beklenince boş sonuç verir.
function bosSorgu(tekil = false) {
  const sonuc = { data: tekil ? null : [], error: null, count: 0, status: 200 };
  const p = new Proxy(function () {}, {
    get(_, ad) {
      if (ad === 'then') return (ok, red) => Promise.resolve(sonuc).then(ok, red);
      if (ad === 'single' || ad === 'maybeSingle') return () => bosSorgu(true);
      return () => p;
    },
    apply() { return p; },
  });
  return p;
}
function supabaseKapat() {
  const kanal = { on() { return kanal; }, subscribe() { return kanal; }, unsubscribe() { return Promise.resolve('ok'); } };
  sb.from = () => bosSorgu();
  sb.rpc = () => bosSorgu(true);
  sb.channel = () => kanal;
  sb.removeChannel = () => Promise.resolve('ok');
  try { sb.functions.invoke = async () => ({ data: { hata: 'Demo modunda bu işlem yapılmaz' }, error: null }); } catch {}
  try {
    sb.auth.signOut = async () => ({ error: null });
    sb.auth.getUser = async () => ({ data: { user: null }, error: null });
    sb.auth.signInWithPassword = async () => ({ data: null, error: { message: 'Demo modunda giriş yapılmaz' } });
  } catch {}
}
// çevrimdışı işaret sırası: demo işleri hiçbir koşulda diske yazılmaz (sonra gerçek veritabanına gitmesin)
function kuyrukKoru() {
  const KUYRUK = anahtar('secim-masasi-kuyruk');
  store.kuyruk = [];
  try {
    const asil = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === KUYRUK) return undefined; return asil.call(this, k, v); };
  } catch {}
}

// ---------------------------------------------------------------- sahte veri
const iso = msOnce => new Date(Date.now() - msOnce).toISOString();
// taşıma saati: uygulama saatinden (demoda ?saat= taklidi, yoksa 11:20) dk sonra ("HH:MM:00")
function saatSonra(dk) {
  const d = new Date(simdi().getTime() + dk * DK);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}
function araclar() {
  const ortak = { kapasite: 4, marka: 'Örnek', model: 'Minibüs', renk: 'Beyaz', sofor_tel: null, sofor_kullanici: null, sorumlu_id: null, notlar: '', eta_dk: null, eta_zaman: null };
  return [
    // GPS, 1 dk önce, Bornova'dan yolda: küçük ince daire (demo boyunca 30 sn'de bir yeni GPS gelir, daire küçük kalır)
    { ...ortak, id: 9101, plaka: '35DM101', durum: 'yolda', sofor_ad: 'Ahmet Örnek', son_lat: 38.4648, son_lon: 27.2205, son_konum_zamani: iso(1 * DK), son_konum_kaynak: 'telefon', konum_kaynak: 'telefon', son_dogruluk: 15, konum_metni: null },
    // şoför söyledi, 6 dk önce: kesik çizgili, 800 m + 6 × 500 m
    { ...ortak, id: 9102, plaka: '35DM202', durum: 'yolda', sofor_ad: 'Mehmet Örnek', son_lat: 38.4561, son_lon: 27.1108, son_konum_zamani: iso(6 * DK), son_konum_kaynak: 'sozlu', konum_kaynak: 'sozlu', son_dogruluk: 800, konum_metni: 'Karşıyaka çarşı' },
    // yalnız ilçe biliniyor, 3 dk önce: 2,5 km + 3 × 500 m
    { ...ortak, id: 9103, plaka: '35DM303', durum: 'yolda', sofor_ad: 'Hasan Örnek', son_lat: 38.1572, son_lon: 27.3618, son_konum_zamani: iso(3 * DK), son_konum_kaynak: 'ilce', konum_kaynak: 'ilce', son_dogruluk: 2500, konum_metni: 'Torbalı' },
    // GPS, Fuar'a 3 km'den yakın ve tahmini varış 4 dk: parlak vurgu
    { ...ortak, id: 9104, plaka: '35DM404', durum: 'yolda', sofor_ad: 'Mustafa Örnek', son_lat: 38.3695, son_lon: 27.1340, son_konum_zamani: iso(0.5 * DK), son_konum_kaynak: 'telefon', konum_kaynak: 'telefon', son_dogruluk: 12, konum_metni: null, eta_dk: 4, eta_zaman: new Date(Date.now() + 4 * DK).toISOString() },
    // şoför söyledi, 14 dk önce: üst sınıra (6 km) ulaşmış, soluk
    { ...ortak, id: 9105, plaka: '35DM505', durum: 'yolda', sofor_ad: 'Ali Örnek', son_lat: 38.4362, son_lon: 27.3560, son_konum_zamani: iso(14 * DK), son_konum_kaynak: 'sozlu', konum_kaynak: 'sozlu', son_dogruluk: 800, konum_metni: 'Kemalpaşa OSB girişi' },
  ];
}
function firmalar() {
  const ortak = { oy_sinifi: 'bizde', listede: true, servis: true, kendisi_gelecek: false, kendi_geldi: false, cep: null, cep2: null, sabit_tel: null, referans: 'Örnek Referans', notlar: '', alma_notu: null, kisi_anahtar: null, sorumlu_id: null, karsilayan: null, ilzam_no: null, guncelleme: iso(0) };
  const s = (id, unvan, yetkili, ilce, lat, lon, durum, ek = {}) => ({ ...ortak, id, unvan, yetkili, ilce, adres: `${ilce} / İZMİR (örnek adres)`, lat, lon, durum, tasima_saati: null, arac_id: null, arac_sira: null, rota_kod: null, ...ek });
  return [
    s(9001, 'Örnek Beton A.Ş.', 'Örnek Kişi 1', 'BORNOVA', 38.4612, 27.2281, 'yolda', { arac_id: 9101, arac_sira: 1, tasima_saati: saatSonra(-12), rota_kod: 'Demo · Rota 1' }),
    s(9002, 'Örnek Prefabrik Ltd. Şti.', 'Örnek Kişi 2', 'BORNOVA', 38.4552, 27.2093, 'arandi', { arac_id: 9101, arac_sira: 2, tasima_saati: saatSonra(8), rota_kod: 'Demo · Rota 1' }),
    s(9003, 'Örnek Kireç San. Tic.', 'Örnek Kişi 3', 'BUCA', 38.3884, 27.1752, 'bekliyor', { arac_id: 9101, arac_sira: 3, tasima_saati: saatSonra(22), rota_kod: 'Demo · Rota 1' }),
    s(9004, 'Örnek Seramik Ltd. Şti.', 'Örnek Kişi 4', 'KARŞIYAKA', 38.4602, 27.0996, 'arandi', { arac_id: 9102, arac_sira: 1, tasima_saati: saatSonra(5), rota_kod: 'Demo · Rota 2' }),
    s(9005, 'Örnek Cam San. A.Ş.', 'Örnek Kişi 5', 'ÇİĞLİ', 38.4951, 27.0702, 'bekliyor', { arac_id: 9102, arac_sira: 2, tasima_saati: saatSonra(25), rota_kod: 'Demo · Rota 2' }),
    s(9006, 'Örnek Parke Ltd. Şti.', 'Örnek Kişi 6', 'TORBALI', 38.1651, 27.3549, 'yolda', { arac_id: 9103, arac_sira: 1, tasima_saati: saatSonra(-20), rota_kod: 'Demo · Rota 3' }),
    s(9007, 'Örnek Katkı A.Ş.', 'Örnek Kişi 7', 'TORBALI', 38.1498, 27.3702, 'bekliyor', { arac_id: 9103, arac_sira: 2, tasima_saati: saatSonra(15), rota_kod: 'Demo · Rota 3' }),
    s(9008, 'Örnek Toprak San. Ltd.', 'Örnek Kişi 8', 'KEMALPAŞA', 38.4297, 27.3903, 'arandi', { arac_id: 9105, arac_sira: 1, tasima_saati: saatSonra(10), rota_kod: 'Demo · Rota 4' }),
    s(9009, 'Örnek Hazır Beton Ltd.', 'Örnek Kişi 9', 'GAZİEMİR', 38.3302, 27.1398, 'fuarda', { arac_id: 9104, arac_sira: 1, tasima_saati: saatSonra(-30), rota_kod: 'Demo · Rota 5' }),
    s(9010, 'Örnek Agrega San. A.Ş.', 'Örnek Kişi 10', 'MENEMEN', 38.6049, 27.0703, 'bekliyor', { tasima_saati: saatSonra(40) }),
    s(9011, 'Örnek Yapı Kimyasalları Ltd.', 'Örnek Kişi 11', 'KONAK', 38.4189, 27.1287, 'oy_kullandi', { servis: false, kendisi_gelecek: true, kendi_geldi: true }),
    s(9012, 'Örnek Tuğla San. Ltd. Şti.', 'Örnek Kişi 12', 'KARABAĞLAR', 38.3801, 27.1151, 'bekliyor', { tasima_saati: saatSonra(35) }),
  ];
}

// ---------------------------------------------------------------- canlı benzetim
// 35DM101 (GPS) 30 sn'de bir Fuar'a doğru biraz ilerler ve yeni GPS konumu gönderir: dairesi küçük kalır.
// Sözlü / ilçe konumlu araçlardan yeni konum gelmez: daireleri her 15 sn'de büyür (6 km'de durur).
function gpsAdim() {
  const a = store.araclar.get(9101); if (!a) return;
  const v = store.ayarlar.secim?.varis || VARIS;
  const lat = a.son_lat + (Number(v.lat) - a.son_lat) * 0.06, lon = a.son_lon + (Number(v.lon) - a.son_lon) * 0.06;
  konumGonder(9101, Number(lat.toFixed(6)), Number(lon.toFixed(6)), 10 + Math.round(Math.random() * 15), 'telefon').catch(() => {});
}

function rozetEkle() {
  if (document.querySelector('.demo-rozet')) return;
  const st = document.createElement('style');
  st.textContent = `.demo-rozet { position: fixed; left: 50%; bottom: calc(6px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 90; padding: 3px 10px; border-radius: 99px; background: var(--amber); color: #1a1200; font: 800 11px/1.4 var(--font, system-ui); letter-spacing: .04em; white-space: nowrap; pointer-events: none; box-shadow: var(--shadow); }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.className = 'demo-rozet'; d.setAttribute('role', 'status');
  d.textContent = 'DEMO · sahte veri, kayıt yok';
  document.body.appendChild(d);
}

export function demoKur() {
  supabaseKapat();
  kuyrukKoru();
  const ben = { id: 'demo-kullanici', ad_soyad: 'Demo Kullanıcı', rol: 'yonetici', aktif: true, son_giris: iso(0) };
  store.ben = ben;
  store.profiller = new Map([[ben.id, ben]]);
  store.araclar = new Map(araclar().map(a => [a.id, a]));
  store.firmalar = new Map(firmalar().map(f => [f.id, f]));
  store.ayarlar = {
    secim: { yer: 'Fuar İzmir, Gaziemir', tarih: '2026-10-06', varis: { lat: VARIS.lat, lon: VARIS.lon } },
    zaman: { bas: '09:00', bit: '17:00' },
  };
  store.olaylar = []; store.topluluk = []; store.asistan = []; store.istekler = []; store.bildirimler = [];
  store.cevrimici = navigator.onLine;
  store.canli = true;   // "Bağlanıyor…" yazmasın; ekranın altında DEMO rozeti var
  rozetEkle();
  bus.emit('hazir');
  setInterval(() => bus.emit('saat', {}), 15000);
  setInterval(gpsAdim, 30000);
}
