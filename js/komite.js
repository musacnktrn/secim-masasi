// Seçim Masası · KOMİTE YAPILANDIRMASI (ATLAS, 2026-10-05)
// Tek kod iki seçime hizmet eder: adresteki ?k=72 ya da ?k=2627 hangi seçimin açılacağını belirler.
// ?k yoksa kökte giriş merkezi (iki kart) açılır ve hiçbir veritabanına bağlanılmaz (js/kapi.js).
// Seçime özgü her metin, renk, depolama anahtarı ve Supabase adresi BURADAN okunur; ekran dosyalarına sabit yazılmaz.
// 72'nin değerleri 1 Ekim seçim günündeki koddan (4db6f1e) birebir alındı: ekrandaki çıktı, tarayıcı depolama
// anahtarları (oturumlar korunur) ve Supabase adresi aynı kalır.
// Bu dosya core.js'i içe AKTARMAZ (giriş merkezi Supabase istemcisi kurulmadan çizilebilsin diye).

export const SURUM = 'v9';            // sw.js CACHE ('secim-v9') ile birlikte artırılır; ekranın köşesinde "v9 · 2627" görünür

// ---------------------------------------------------------------- 26-27 Supabase projesi
// Musa projeyi açınca YALNIZ bu iki satır doldurulur (Project Settings > API: Project URL ve anon / publishable anahtar).
// Dolana kadar 26-27 giriş ekranı "Veritabanı kurulumu sürüyor" der, hiçbir yere bağlanmaz.
export const KURULUM_BEKLIYOR = 'KURULUM_BEKLIYOR';
const SUPA_2627_URL = KURULUM_BEKLIYOR;
const SUPA_2627_ANON = KURULUM_BEKLIYOR;

const REF_72 = 'xpxaerxrnzxtrvcchvzj';   // 72. Komite projesi: 72 dışındaki seçim bu adrese ASLA bağlanmaz

export const KOMITELER = {
  '72': {
    k: '72',
    ad: '72. Komite',
    kisaAd: '72. Komite',
    kurum: 'İZTO',
    tarih: '2026-10-01', saat: '09:00-17:00', yer: 'Fuar İzmir',
    tema: 'kirmizi', renk: '#C8102E',
    onek: 'secim',                         // depolama anahtarları 1 Ekim'deki gibi ('secim-masasi-oturum' ...)
    kanal: 'secim-masasi',                 // realtime kanal adı
    parolaEk: '-72k',                      // auth parolası 'pin-' + PIN + parolaEk (72'nin 33 hesabı bununla açıldı; DEĞİŞMEZ)
    supaUrl: `https://${REF_72}.supabase.co`,
    supaAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweGFlcnhybnp4dHJ2Y2NodnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MjEyNjEsImV4cCI6MjEwNjI5NzI2MX0.U9KtlFEYOQ55saDUlwYF2yKssjB-VYrKiH2jaB4_HyY',
    manifest: 'manifest.webmanifest',
    ikon: { 180: 'img/ikon-180.png', 192: 'img/ikon-192.png', 512: 'img/ikon-512.png' },
    // görünen metinler
    baslik: '72. Komite · Seçim Masası',    // sekme başlığı
    uygulamaAdi: 'Seçim Masası',            // iPhone ana ekran adı
    logo: '72. KOMİTE', marka: 'GENÇ ENERJİ', liste: 'KIRMIZI LİSTE',
    slogan: 'Enerjimiz sektörden, gücümüz gençlikten',
    logoAlt: 'İTO 72. Komite',
    aciklama: 'İzmir Ticaret Odası 72. Komite · İklimlendirme, Mekanik ve Doğalgaz Grubu',
    kisaTarih: '1 Ekim · Fuar İzmir',
    uzunTarih: '1 Ekim 2026 Perşembe', uzunYer: 'Fuar İzmir (Gaziemir)', uzunSaat: '',
    gun: '1 Ekim Perşembe', varsayilanYer: 'Fuar İzmir, Gaziemir',   // ayarlar.secim boşsa üst çubuktaki tarih satırı
    simge: '72', zilAd: '72. Komite',
    hubAlt: '1 Ekim 2026 · tamamlandı',
    ilzamListesi: true,                     // numaralı ilzam listesi var: numarasız kartta "İLZAM BELGESİ YOK", 1-3 hane arama = ilzam no
    dispec: false,                          // araç yöneticisi ekranı (#dispec) yok: 72'de menüde görünmez, adresle de açılmaz
  },
  '2627': {
    k: '2627',
    ad: '26-27 Çimento, Kireç, Beton ve Diğer Mineral Ürünler Sanayi',
    kisaAd: '26-27 Çimento, Kireç, Beton',
    kurum: 'İZTO',
    tarih: '2026-10-06', saat: '09:00-17:00', yer: 'Fuar İzmir',
    tema: 'turkuaz', renk: '#087F8C',
    onek: 'secim2627',
    kanal: 'secim2627-masasi',
    parolaEk: '-2627k',                    // 26-27 projesinde giris_pin, edge yonetim ve hesap_ac.py ile aynı ek (secim-2627/sema)
    supaUrl: SUPA_2627_URL,
    supaAnon: SUPA_2627_ANON,
    manifest: 'manifest-2627.webmanifest',
    ikon: { 180: 'img/ikon-2627-180.png', 192: 'img/ikon-2627-192.png', 512: 'img/ikon-2627-512.png' },
    baslik: '26-27 Çimento, Kireç, Beton · Seçim Masası',
    uygulamaAdi: '26-27 Seçim',
    logo: '26-27 ÇİMENTO, KİREÇ, BETON',
    marka: '', liste: '', slogan: '',       // Musa'dan gelmedi: boş alan arayüzde gizlenir
    logoAlt: 'İZTO 26-27 Meslek Grubu',
    aciklama: 'İzmir Ticaret Odası · 26-27 Çimento, Kireç, Beton ve Diğer Mineral Ürünler Sanayi Meslek Grubu',
    kisaTarih: '6 Ekim · 09:00-17:00 · Fuar İzmir',
    uzunTarih: '6 Ekim 2026 Salı', uzunYer: 'Fuar İzmir (Gaziemir)', uzunSaat: 'Oy saati 09:00-17:00',
    gun: '6 Ekim Salı', varsayilanYer: 'Fuar İzmir, Gaziemir',
    simge: '26-27', zilAd: '26-27 Çimento',
    hubAlt: '6 Ekim 2026 · 09:00-17:00 · Fuar İzmir',
    ilzamListesi: false,                    // ilzam listesi yok: rozet gizli, 1-3 hane normal arama
    dispec: true,                           // araç yöneticisi ekranı (#dispec, rol 'arac_yoneticisi'): görev defteri (gorevler) bu seçimde var
    konumGir: true,                         // Harita: Admin ve araç yöneticisi şoförün sözlü konumunu girer (arac_konumlari.konum_metni bu projede var)
  },
};
export const HUB_SIRA = ['72', '2627'];

// ---------------------------------------------------------------- etkin komite
// ?k=72 · ?k=2627 (ya da ?k=26-27). Geçersiz ya da yoksa null: giriş merkezi açılır.
export function aktifKomite(arama = location.search) {
  const ham = new URLSearchParams(arama).get('k');
  if (!ham) return null;
  const k = String(ham).replace(/\D/g, '');
  return KOMITELER[k] ? k : null;
}
export const KOMITE_K = aktifKomite();
// ?demo=1: sahte veriyle gösterim (js/demo.js). Yalnız 72 dışındaki seçimde açılır; veritabanına hiç bağlanılmaz, hiçbir şey yazılmaz.
const _arama = new URLSearchParams(location.search);
export const DEMO = !!KOMITE_K && KOMITE_K !== '72' && _arama.get('demo') === '1';
// Uygulama modülleri yalnız ?k varken yüklenir (kapi.js); yine de k'siz yüklenirse 1 Ekim'deki gibi 72 davranır.
// Demoda Supabase adresi bilerek boş bırakılır ve depolama öneki ayrıdır ('secim2627demo'): demoda yapılan bir işaret
// çevrimdışı sıraya düşse bile gerçek seçimin sırasına, oturumuna ya da veritabanına (anahtar yazıldıktan sonra da) asla karışmaz.
const _temel = KOMITELER[KOMITE_K || '72'];
export const KOMITE = DEMO
  ? { ..._temel, onek: `${_temel.onek}demo`, kanal: `${_temel.kanal}-demo`, supaUrl: KURULUM_BEKLIYOR, supaAnon: KURULUM_BEKLIYOR }
  : _temel;
// Demoda saat taklidi verilmediyse oy gününün ortası (11:20) kullanılır: "17:00'ye kalan" gibi süreler gerçek bir gün gibi görünsün.
// core.js saat taklidini (?saat=) yüklenirken okur; bu satır ondan önce çalışır (kapi.js > komite.js > app.js > core.js).
if (DEMO && !_arama.get('saat')) {
  _arama.set('saat', '11:20');
  try { history.replaceState(history.state, '', `${location.pathname}?${_arama}${location.hash}`); } catch {}
}

// Tarayıcı depolama anahtarı: 72'de değişmez, 26-27'de 'secim2627' önekli (aynı alan adında iki seçimin oturumu,
// çevrimdışı işaret sırası ve tercihleri karışmasın). 'secim-tema' -> 'secim2627-tema', 'rapor-sekme' -> 'secim2627-rapor-sekme'.
export function anahtar(ad) {
  if (KOMITE.onek === 'secim') return ad;
  return ad.startsWith('secim-') ? KOMITE.onek + ad.slice(5) : `${KOMITE.onek}-${ad}`;
}

// ---------------------------------------------------------------- veritabanı ayarı denetimi
// null = hazır. Aksi halde neden: 'bekliyor' (anahtar henüz yazılmadı) · 'hatali' · 'yanlis-proje' · 'anahtar-uyusmuyor'
function jwtRef(anah) {
  try { const p = String(anah).split('.'); if (p.length !== 3) return null; return JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))).ref || null; } catch { return null; }
}
export function veritabaniSorunu(c = KOMITE) {
  if (!c.supaUrl || c.supaUrl === KURULUM_BEKLIYOR || !c.supaAnon || c.supaAnon === KURULUM_BEKLIYOR) return 'bekliyor';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(c.supaUrl)) return 'hatali';
  if (c.k !== '72' && (c.supaUrl.includes(REF_72) || jwtRef(c.supaAnon) === REF_72)) return 'yanlis-proje';
  const ref = jwtRef(c.supaAnon); if (ref && !c.supaUrl.includes(ref)) return 'anahtar-uyusmuyor';
  return null;
}
export const KOMITE_SORUN = veritabaniSorunu();
export const SORUN_METNI = {
  bekliyor: 'Giriş, kurulum bitince açılacak. Sonra bu sayfayı yenilemen yeterli.',
  hatali: 'Veritabanı adresi hatalı yazılmış. ATLAS düzeltene kadar giriş kapalı.',
  'yanlis-proje': 'Bu seçim 72. Komite veritabanına bağlanmaya çalışıyor. Güvenlik için giriş kapalı.',
  'anahtar-uyusmuyor': 'Veritabanı anahtarı adresle uyuşmuyor. ATLAS düzeltene kadar giriş kapalı.',
};

// ---------------------------------------------------------------- görünüm yardımcıları
const kacis = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Logo satırı: "72. KOMİTE <ayraç>|</ayraç> GENÇ ENERJİ". Marka boşsa yalnız logo. ayrac: 'span' | 'i'; sinif: ayraç sınıfı.
export function logoHtml(ayrac = 'span', sinif = '') {
  const s = sinif ? ` class="${sinif}"` : '';
  return KOMITE.marka ? `${kacis(KOMITE.logo)} <${ayrac}${s}>|</${ayrac}> ${kacis(KOMITE.marka)}` : kacis(KOMITE.logo);
}
// Bu seçimin uygulama adresi (giriş mesajlarına yazılan link): kök + ?k=..., yoksa link giriş merkezine düşer.
export function komiteLinki(taban = location.origin + location.pathname) {
  try { const u = new URL(taban, location.href); if (!u.searchParams.get('k')) u.searchParams.set('k', KOMITE.k); return u.href; }
  catch { return taban; }
}
export const surumMetni = (k = KOMITE_K) => (k ? `${SURUM} · ${k}${DEMO ? ' · demo' : ''}` : SURUM);

// Açılışta: <html data-komite>, sekme başlığı, tema rengi, manifest ve ikon bağlantıları bu seçime göre.
// 72'de hepsi index.html'deki değerlerle aynıdır (değişiklik olmaz).
function baglantiAyarla(rel, href) {
  let l = document.head.querySelector(`link[rel="${rel}"]`);
  if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); }
  if (l.getAttribute('href') !== href) l.setAttribute('href', href);
}
function metaAyarla(ad, deger) {
  let m = document.head.querySelector(`meta[name="${ad}"]`);
  if (!m) { m = document.createElement('meta'); m.name = ad; document.head.appendChild(m); }
  if (m.getAttribute('content') !== deger) m.setAttribute('content', deger);
}
export function komiteUygula(k = KOMITE_K) {
  const h = document.documentElement;
  if (!k) {   // giriş merkezi: turkuaz, nötr başlık
    h.dataset.komite = 'hub';
    document.title = 'Seçim Masası';
    metaAyarla('theme-color', KOMITELER['2627'].renk);
    return;
  }
  const c = KOMITELER[k];
  h.dataset.komite = k;
  if (document.title !== c.baslik) document.title = c.baslik;
  metaAyarla('theme-color', c.renk);
  metaAyarla('apple-mobile-web-app-title', c.uygulamaAdi);
  baglantiAyarla('manifest', c.manifest);
  baglantiAyarla('icon', c.ikon[192]);
  baglantiAyarla('apple-touch-icon', c.ikon[180]);
}
// Ekranın sol alt köşesinde küçük sürüm etiketi (sahada hangi sürümün yüklendiği anlaşılsın)
export function surumEtiketiEkle(k = KOMITE_K) {
  if (document.querySelector('.surum-etiketi')) return;
  const d = document.createElement('div');
  d.className = 'surum-etiketi'; d.setAttribute('aria-hidden', 'true'); d.textContent = surumMetni(k);
  document.body.appendChild(d);
}
