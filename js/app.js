// 72. Komite · Seçim Masası · UYGULAMA KABUĞU (ATLAS, 2026-09-30)
// Açılış, oturum, yönlendirme (#masa, #kisiler …), üst çubuk, rol bazlı menü, ekranların canlı yenilenmesi.
import { store, bus, sb, esc, fmt, simdi, profilYukle, veriYukle, canliBaglan, cikis, ROL_AD } from './core.js';
import { $, el, bas, paletAc, toast, cekmeceKapat } from './ui.js';

// Ekranlar: yol -> modül yolu + izinli roller + menü
export const EKRANLAR = {
  masa:      { dosya: './ekranlar/masa.js',      ad: 'Masa',      roller: ['yonetici', 'masa'] },
  kisiler:   { dosya: './ekranlar/kisiler.js',   ad: 'Kişiler',   roller: ['yonetici', 'masa', 'rapor'] },
  harita:    { dosya: './ekranlar/harita.js',    ad: 'Harita',    roller: ['yonetici', 'masa', 'rapor'] },
  araclar:   { dosya: './ekranlar/araclar.js',   ad: 'Araçlar',   roller: ['yonetici', 'masa'] },
  dashboard: { dosya: './ekranlar/dashboard.js', ad: 'Dashboard', roller: ['yonetici', 'masa', 'rapor'] },
  yonetim:   { dosya: './ekranlar/yonetim.js',   ad: 'Yönetim',   roller: ['yonetici'] },
  saha:      { dosya: './ekranlar/saha.js',      ad: 'Saha',      roller: ['yonetici', 'masa', 'sofor'], mobil: true },
  rapor:     { dosya: './ekranlar/rapor.js',     ad: 'Rapor',     roller: ['yonetici', 'masa', 'rapor', 'sofor'], mobil: true },
};
const MENU = ['masa', 'kisiler', 'harita', 'araclar', 'dashboard', 'yonetim'];
const dar = () => window.innerWidth < 760;
function varsayilanYol() {
  const r = store.ben?.rol;
  if (r === 'sofor') return 'saha';
  if (r === 'rapor') return dar() ? 'rapor' : 'dashboard';
  return dar() ? 'saha' : 'masa';
}

// ---------------------------------------------------------------- tema
const tema = localStorage.getItem('secim-tema') || 'acik';
document.documentElement.dataset.tema = tema;
function temaDegistir() { const t = document.documentElement.dataset.tema === 'koyu' ? 'acik' : 'koyu'; document.documentElement.dataset.tema = t; try { localStorage.setItem('secim-tema', t); } catch {} }

// ---------------------------------------------------------------- kabuk
let aktif = null, aktifYol = null, yenileBekliyor = false, asistanModul = null;
function kabukHtml(yol, mobil) {
  if (mobil) return `<div class="mobil-kabuk"><div id="ekran"></div></div>`;
  const onay = store.istekler.filter(i => i.durum === 'onay_bekliyor').length;
  const menu = MENU.filter(y => EKRANLAR[y].roller.includes(store.ben.rol))
    .map(y => `<a href="#${y}" class="${y === yol ? 'aktif' : ''}">${esc(EKRANLAR[y].ad)}${y === 'yonetim' && onay ? ` <span class="rozet-sayi">${onay}</span>` : ''}</a>`).join('');
  return `
  <div class="kabuk">
    <div id="cevrimdisi"></div>
    <header class="ust">
      <a class="logo" href="#${varsayilanYol()}"><span class="logo-yazi"><b>72. KOMİTE</b><i>|</i>GENÇ ENERJİ</span><span class="kirmizi-liste">KIRMIZI LİSTE</span></a>
      <nav class="nav">${menu}</nav>
      <div class="ust-sag">
        <button class="btn btn-kucuk" data-ara title="Hızlı arama (⌘K ya da /)">🔍 Ara <span class="kbd">⌘K</span></button>
        <span class="baglanti" id="baglanti">Canlı</span>
        <span class="saat-buyuk" id="saat">--:--</span>
        <button class="btn btn-hayalet btn-ikon" data-tema title="Açık / koyu tema">◐</button>
        <div class="kullanici" title="${esc(ROL_AD[store.ben.rol])}"><div class="avatar">${esc(bas(store.ben.ad_soyad))}</div><span>${esc(store.ben.ad_soyad)}</span></div>
        <button class="btn btn-hayalet btn-kucuk" data-cikis title="Çıkış">Çıkış</button>
      </div>
    </header>
    <main class="icerik" id="ekran"></main>
  </div>`;
}
function baglantiCiz() {
  const b = $('#baglanti'), s = $('#cevrimdisi'); if (!b) return;
  const kopuk = !store.cevrimici || !store.canli;
  b.classList.toggle('kopuk', kopuk);
  b.textContent = !store.cevrimici ? 'Çevrimdışı' : !store.canli ? 'Bağlanıyor…' : 'Canlı';
  if (s) s.innerHTML = (!store.cevrimici || store.kuyruk.length) ? `<div class="cevrimdisi-serit">${!store.cevrimici ? 'İnternet yok. ' : ''}${store.kuyruk.length ? `${store.kuyruk.length} işaret sırada, bağlantı gelince gönderilecek.` : 'İşaretlerin kaydedilip bağlantı gelince gönderilecek.'}</div>` : '';
}
function saatCiz() { const s = $('#saat'); if (s) s.textContent = simdi().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }
setInterval(saatCiz, 1000);

async function git() {
  const [yol0, param] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!store.ben) { if (yol0 !== 'giris') location.hash = '#giris'; return girisGoster(); }
  let yol = yol0 || varsayilanYol();
  if (!EKRANLAR[yol] || !EKRANLAR[yol].roller.includes(store.ben.rol)) { yol = varsayilanYol(); history.replaceState(null, '', '#' + yol); }
  const tanim = EKRANLAR[yol];
  try { aktif?.temizle?.(); } catch {}
  cekmeceKapat();
  const kok = $('#uygulama');
  kok.innerHTML = kabukHtml(yol, tanim.mobil);
  kabukBagla(); baglantiCiz(); saatCiz();
  aktifYol = yol;
  const hedef = $('#ekran');
  try {
    const m = await import(tanim.dosya);
    if (aktifYol !== yol) return;
    aktif = m.default;
    hedef.innerHTML = '';
    await aktif.render(hedef, param);
  } catch (e) {
    console.error(e);
    hedef.innerHTML = `<div class="kart"><div class="kart-govde"><div class="bos">Bu ekran yüklenemedi: ${esc(e.message)}</div></div></div>`;
  }
  asistanYukle();
}
function kabukBagla() {
  $('[data-ara]')?.addEventListener('click', () => paletAc());
  $('[data-tema]')?.addEventListener('click', temaDegistir);
  $('[data-cikis]')?.addEventListener('click', () => cikis());
}
async function asistanYukle() {
  try { asistanModul ||= (await import('./asistan.js')).default; asistanModul.kur?.(); } catch (e) { console.warn('asistan yüklenemedi', e); }
}

// canlı yenileme: ekranın yenile() fonksiyonu kare başına en çok bir kez çağrılır
bus.on('*', ad => {
  if (ad === 'baglanti') baglantiCiz();
  if (ad === 'istek') { const n = store.istekler.filter(i => i.durum === 'onay_bekliyor').length; const a = document.querySelector('.nav a[href="#yonetim"]'); if (a) a.innerHTML = `Yönetim${n ? ` <span class="rozet-sayi">${n}</span>` : ''}`; }
  if (!aktif?.yenile || yenileBekliyor) return;
  yenileBekliyor = true;
  requestAnimationFrame(() => { yenileBekliyor = false; try { aktif.yenile(ad); } catch (e) { console.error('yenile', e); } });
});

// ---------------------------------------------------------------- giriş
async function girisGoster() {
  aktif = null;
  const m = await import('./ekranlar/giris.js');
  await m.default.render($('#uygulama'), async () => { await acilis(); location.hash = '#' + varsayilanYol(); });
}

// ---------------------------------------------------------------- açılış
let acildi = false;
async function acilis() {
  if (acildi) return; acildi = true;
  try { await veriYukle(); }
  catch (e) { console.error(e); toast('Veri yüklenemedi: ' + e.message, { tur: 'hata', sure: 10000 }); }
  canliBaglan();
}
window.addEventListener('hashchange', git);
(async () => {
  try { await profilYukle(); } catch (e) { console.warn(e); }
  if (store.ben) await acilis();
  git();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
window.__secim = { store, bus };   // test ve hata ayıklama için (konsoldan store'a bakılabilir)
sb.auth.onAuthStateChange((olay) => { if (olay === 'SIGNED_OUT' && store.ben) { store.ben = null; location.hash = '#giris'; } });
