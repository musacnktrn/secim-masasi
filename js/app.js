// 72. Komite · Seçim Masası · UYGULAMA KABUĞU (ATLAS, 2026-09-30)
// Açılış, oturum, yönlendirme (#masa, #kisiler …), üst çubuk (SM Ustbar), rol bazlı menü, bildirim paneli (zil),
// bağlantı göstergesi, ekranların canlı yenilenmesi. Görünüm Claude Design teslimine göre; işlev korunur.
import { store, bus, sb, esc, trBaslik, fmt, simdi, profilYukle, veriYukle, canliBaglan, cikis, ROL_AD, okunmamisBildirim, cevapsizBildirimler, bildirimCevapla, bildirimGoruldu } from './core.js';
import { $, el, bas, paletAc, toast, hataGoster, cekmeceKapat, kisiKartiAc } from './ui.js';

// Ekranlar: yol -> modül yolu + izinli roller + menü
export const EKRANLAR = {
  masa:      { dosya: './ekranlar/masa.js',      ad: 'Masa',      roller: ['yonetici', 'kurul', 'masa'] },
  kisiler:   { dosya: './ekranlar/kisiler.js',   ad: 'Kişiler',   roller: ['yonetici', 'kurul', 'masa', 'rapor'] },
  harita:    { dosya: './ekranlar/harita.js',    ad: 'Harita',    roller: ['yonetici', 'kurul', 'masa', 'rapor'] },
  araclar:   { dosya: './ekranlar/araclar.js',   ad: 'Araçlar',   roller: ['yonetici', 'kurul', 'masa'] },
  dashboard: { dosya: './ekranlar/dashboard.js', ad: 'Dashboard', roller: ['yonetici', 'kurul', 'masa', 'rapor'] },
  yonetim:   { dosya: './ekranlar/yonetim.js',   ad: 'Admin',     roller: ['yonetici'] },
  saha:      { dosya: './ekranlar/saha.js',      ad: 'Saha',      roller: ['yonetici', 'kurul', 'masa', 'sofor'], mobil: true },
  rapor:     { dosya: './ekranlar/rapor.js',     ad: 'Rapor',     roller: ['yonetici', 'kurul', 'masa', 'rapor', 'sofor', 'sorumlu'], mobil: true },
  sorumlu:   { dosya: './ekranlar/sorumlu.js',   ad: 'Araç sorumlusu', roller: ['yonetici', 'kurul', 'masa', 'sorumlu'], mobil: true },
  bildirimler: { dosya: './ekranlar/bildirimler.js', ad: 'Bildirimler', roller: ['yonetici', 'kurul', 'masa', 'rapor', 'sofor', 'sorumlu'], mobil: true },
};
const MENU = ['masa', 'kisiler', 'harita', 'araclar', 'dashboard', 'yonetim'];
const dar = () => matchMedia('(max-width: 759px)').matches;   // innerWidth taşan içerikle büyüyebiliyor; medya sorgusu cihaz genişliğine bakar
// Telefon gezinmesi (2026-10-01): dar ekranda (≤900 px) ve ana ekrana eklenmiş uygulamada üst menü yerine
// sol üstte ☰ (yan çekmece) + ana ekran dışında "‹ Geri". Mobil kabuklu ekranlar (saha, rapor, bildirimler) her genişlikte bu çubuğu alır.
const mqDar = matchMedia('(max-width: 900px)');
const kurulu = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
const mobilNav = () => mqDar.matches || kurulu();
function varsayilanYol() {
  const r = store.ben?.rol;
  if (r === 'sofor') return 'saha';
  if (r === 'sorumlu') return 'sorumlu';
  if (r === 'kurul') return dar() ? 'saha' : 'masa';   // Yönetim kurulu = masa düzeyi
  if (r === 'rapor') return dar() ? 'rapor' : 'dashboard';
  return dar() ? 'saha' : 'masa';
}
const KISAYOL = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl K';

// ---------------------------------------------------------------- tema
// tema: tasarımdaki [data-theme="light"|"dark"]; eski [data-tema] da eşlenir (ekran dosyaları hangisini okursa)
let tema = 'acik'; try { tema = localStorage.getItem('secim-tema') || 'acik'; } catch {}
function temaUygula(t) { document.documentElement.dataset.tema = t; document.documentElement.dataset.theme = t === 'koyu' ? 'dark' : 'light'; }
temaUygula(tema);
function temaDugmeCiz() {
  const d = $('.tema-dugme'); if (!d) return;
  const koyu = document.documentElement.dataset.tema === 'koyu';
  d.innerHTML = `<span class="tema-ikon">${koyu ? '☀' : '☾'}</span><span class="tema-yazi"> ${koyu ? 'Açık' : 'Komuta'}</span>`;
  d.title = koyu ? 'Açık temaya geç' : 'Komuta (koyu) temaya geç';
}
function temaDegistir() {
  const t = document.documentElement.dataset.tema === 'koyu' ? 'acik' : 'koyu'; temaUygula(t);
  try { localStorage.setItem('secim-tema', t); } catch {}
  temaDugmeCiz(); bus.emit('tema', { tema: t });
}

// ---------------------------------------------------------------- kabuk
let aktif = null, aktifYol = null, yenileBekliyor = false, asistanModul = null;
const onaySayisi = () => store.istekler.filter(i => i.durum === 'onay_bekliyor').length;
const onayRozeti = () => { const n = onaySayisi(); return n ? ` <span class="rozet-sayi">${n}</span>` : ''; };
const ZIL_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>';
// ---- telefon gezinmesi: üst çubuk + yan çekmece + geri yığını
const IK = p => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const MB_OGE = [
  { yol: 'saha', ad: 'Liste', alt: 'Telefonda hızlı işaretleme', ikon: IK('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>') },
  { yol: 'sorumlu', ad: 'Araç listem', alt: 'Sorumlu olduğun araçlar', ikon: IK('<rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>'), yalniz: ['sorumlu'] },
  { yol: 'masa', ad: 'Masa', alt: 'Tam masa görünümü ve akış', ikon: IK('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>') },
  { yol: 'kisiler', ad: 'Kişiler', alt: 'Tüm liste, filtre, arama', ikon: IK('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>') },
  { yol: 'harita', ad: 'Harita', alt: 'Araçlar ve duraklar', ikon: IK('<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>') },
  { yol: 'araclar', ad: 'Araçlar', alt: 'Araç listesi ve durumları', ikon: IK('<rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>') },
  { yol: 'dashboard', ad: 'Dashboard', alt: 'Sayılar ve hedef', ikon: IK('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>') },
  { yol: 'rapor', ad: 'Rapor', alt: 'Canlı rapor', ikon: IK('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>') },
  { yol: 'bildirimler', ad: 'Bildirimler', alt: 'Gelen bildirimler', ikon: IK('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>') },
  { yol: 'yonetim', ad: 'Admin', alt: 'Kullanıcılar, ayarlar, onaylar', ikon: IK('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>') },
];
const mbAd = yol => MB_OGE.find(o => o.yol === yol)?.ad || EKRANLAR[yol]?.ad || '';
const mbOgeler = () => MB_OGE.filter(o => EKRANLAR[o.yol]?.roller.includes(store.ben?.rol) && (!o.yalniz || o.yalniz.includes(store.ben?.rol)));
let yigin = [], geriGidiyor = false, aktifAnahtar = '';
const MENU_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
function mbUstHtml(yol) {
  const ana = yol === varsayilanYol();
  return `<header class="mb-ust" data-mb-ust>
    <button type="button" class="mb-dugme mb-menu" data-mb-menu aria-label="Menüyü aç" aria-expanded="false">${MENU_SVG}</button>
    ${ana ? '' : '<button type="button" class="mb-geri" data-mb-geri aria-label="Geri">‹ Geri</button>'}
    <div class="mb-baslik">${esc(mbAd(yol))}</div>
    <div class="mb-sag">
      <span class="baglanti mb-baglanti" id="baglanti" role="status"></span>
      <button type="button" class="mb-dugme" data-ara aria-label="Kişi ara"><span class="mb-ara">⌕</span></button>
      ${yol === 'bildirimler' ? '' : `<button type="button" class="mb-dugme mb-zil" data-mb-zil aria-label="Bildirimler">${ZIL_SVG}</button>`}
    </div>
  </header>`;
}
function mbCekmeceHtml() {
  const bil = okunmamisBildirim(), onay = onaySayisi();
  const rozet = n => n ? `<b class="mb-c-rozet">${n > 99 ? '99+' : n}</b>` : '';
  const koyu = document.documentElement.dataset.tema === 'koyu';
  const rolAd = ROL_AD[store.ben.rol] || store.ben.rol;
  return `<div class="mb-arka" data-mb-arka></div>
  <nav class="mb-cekmece" role="dialog" aria-modal="true" aria-label="Menü" tabindex="-1">
    <div class="mb-c-ust">
      <div class="mb-c-marka"><span class="mb-c-logo">72. KOMİTE <span class="logo-cubuk">|</span> GENÇ ENERJİ</span><span class="kirmizi-liste">KIRMIZI LİSTE</span></div>
      <button type="button" class="mb-dugme" data-mb-kapat aria-label="Menüyü kapat">✕</button>
    </div>
    <div class="mb-c-kim"><span class="avatar">${esc(bas(store.ben.ad_soyad))}</span><div><div class="mb-c-ad">${esc(store.ben.ad_soyad)}</div><div class="mb-c-rol">${esc(rolAd)}</div></div></div>
    <div class="mb-c-liste">${mbOgeler().map(o => `<a href="#${o.yol}" class="mb-c-oge${o.yol === aktifYol ? ' aktif' : ''}"${o.yol === aktifYol ? ' aria-current="page"' : ''}>
      <span class="mb-c-ikon">${o.ikon}</span><span class="mb-c-yazi"><b>${esc(o.ad)}</b><small>${esc(o.alt)}</small></span>${o.yol === 'bildirimler' ? rozet(bil) : o.yol === 'yonetim' ? rozet(onay) : ''}</a>`).join('')}
    </div>
    <div class="mb-c-alt">
      <button type="button" class="mb-c-alt-dugme atlas" data-mb-atlas>ATLAS'a yaz</button>
      <button type="button" class="mb-c-alt-dugme" data-mb-tema>${koyu ? '☀ Açık tema' : '☾ Koyu tema'}</button>
      <button type="button" class="mb-c-alt-dugme cikis" data-mb-cikis>Çıkış yap</button>
    </div>
  </nav>`;
}
function mbCekmeceAc() {
  panelleriKapat();
  const kap = el(`<div class="mb-katman">${mbCekmeceHtml()}</div>`);
  $('#katman').append(kap);
  $('[data-mb-menu]')?.setAttribute('aria-expanded', 'true');
  kap.addEventListener('click', e => {
    if (e.target.closest('[data-mb-arka],[data-mb-kapat]')) return panelleriKapat();
    const a = e.target.closest('a.mb-c-oge');
    if (a) { if (a.classList.contains('aktif')) { e.preventDefault(); } panelleriKapat(); return; }
    if (e.target.closest('[data-mb-atlas]')) { panelleriKapat(); document.querySelector('.atlas-dugme')?.click(); return; }
    if (e.target.closest('[data-mb-tema]')) { temaDegistir(); panelleriKapat(); return; }
    if (e.target.closest('[data-mb-cikis]')) { panelleriKapat(); cikis(); }
  });
  kap.querySelector('.mb-cekmece')?.focus({ preventScroll: true });   // klavyede Tab menüden başlar; dokunmatikte halka çıkmaz
}
function mbGeri() {
  const onceki = yigin.pop() || varsayilanYol();
  geriGidiyor = true;
  if ('#' + onceki === location.hash) { geriGidiyor = false; git(); } else location.hash = '#' + onceki;
}
function mbZilCiz() {
  const z = $('[data-mb-zil]'); if (!z) return;
  const n = okunmamisBildirim();
  let r = z.querySelector('.zil-rozet');
  if (n) { if (!r) { r = document.createElement('span'); r.className = 'zil-rozet'; z.appendChild(r); } r.textContent = n > 99 ? '99+' : String(n); }
  else if (r) r.remove();
}

function kabukHtml(yol, mobil) {
  const mb = mobil || mobilNav();
  document.body.classList.toggle('mb-acik', mb);
  if (mobil) return `${mbUstHtml(yol)}<div class="mobil-kabuk"><div id="ekran"></div></div>`;
  if (mb) return `<div class="kabuk mb-kabuk">${mbUstHtml(yol)}<div id="cevrimdisi"></div><main class="icerik" id="ekran"></main></div>`;
  const menu = MENU.filter(y => EKRANLAR[y].roller.includes(store.ben.rol))
    .map(y => `<a href="#${y}" class="${y === yol ? 'aktif' : ''}">${esc(EKRANLAR[y].ad)}${y === 'yonetim' ? onayRozeti() : ''}</a>`).join('');
  const rolAd = ROL_AD[store.ben.rol] || store.ben.rol;
  return `
  <div class="kabuk">
    <header class="ust">
      <a class="logo" href="#${varsayilanYol()}">
        <span class="logo-satir"><span class="logo-yazi">72. KOMİTE <span class="logo-cubuk">|</span> GENÇ ENERJİ</span><span class="kirmizi-liste">KIRMIZI LİSTE</span></span>
        <span class="logo-alt">İTO 72. Komite</span>
      </a>
      <nav class="nav">${menu}</nav>
      <div class="ust-sag">
        <button type="button" class="ust-ara" data-ara title="Hızlı arama (${KISAYOL} ya da /)"><span class="ara-ikon">⌕</span><span class="ara-yazi">Kişi ara…</span><span class="kbd">${KISAYOL}</span></button>
        <button type="button" class="zil" data-zil title="Bildirimler" aria-label="Bildirimler">${ZIL_SVG}</button>
        <span class="baglanti" id="baglanti" role="status"></span>
        <div class="saat-blok"><div class="saat-buyuk" id="saat">--:--:--</div><div class="saat-alt" id="saat-alt"></div></div>
        <button type="button" class="avatar" data-kullanici title="${esc(store.ben.ad_soyad)} · ${esc(rolAd)}" aria-label="Kullanıcı menüsü">${esc(bas(store.ben.ad_soyad))}</button>
        <button type="button" class="tema-dugme" data-tema-degistir></button>
      </div>
    </header>
    <div id="cevrimdisi"></div>
    <main class="icerik" id="ekran"></main>
  </div>`;
}

// ---- bağlantı göstergesi (SM Ustbar "Canlı" / "Çevrimdışı · N işaret sırada" + SM Durumlar amber şerit)
let sonEsitleme = new Date(), kopukMuydu = false, kopukEnFazla = 0;
function baglantiCiz() {
  const b = $('#baglanti'), s = $('#cevrimdisi');
  const cevrimdisi = !store.cevrimici, kuyruk = store.kuyruk.length, baglaniyor = store.cevrimici && !store.canli;
  if (store.cevrimici && store.canli) sonEsitleme = new Date();
  if (b) {
    const yazi = cevrimdisi ? `Çevrimdışı${kuyruk ? ` · ${kuyruk} işaret sırada` : ''}` : baglaniyor ? 'Bağlanıyor…' : kuyruk ? `Gönderiliyor · ${kuyruk} işaret` : 'Canlı';
    b.classList.toggle('kopuk', cevrimdisi || baglaniyor || kuyruk > 0);
    b.innerHTML = `<span class="baglanti-nokta"></span>${esc(yazi)}`;
  }
  if (s) {
    if (cevrimdisi) s.innerHTML = `<div class="cevrimdisi-serit"><span>${kuyruk ? `Çevrimdışı · işaretler bu cihazda sırada (${kuyruk}). Bağlantı gelince otomatik gönderilecek.` : 'Çevrimdışı · yapacağın işaretler bu cihazda sıraya alınır, bağlantı gelince otomatik gönderilir.'}</span><span class="son">Son eşitleme ${esc(fmt.saat(sonEsitleme))}</span></div>`;
    else if (kuyruk) s.innerHTML = `<div class="cevrimdisi-serit"><span>${kuyruk} işaret gönderiliyor…</span><span class="son">Son eşitleme ${esc(fmt.saat(sonEsitleme))}</span></div>`;
    else s.innerHTML = '';
  }
}
// bağlantı gelince: "Bağlantı geri geldi · N işaret gönderildi"
function geriGeldiKontrol() {
  const k = store.kuyruk.length;
  if (!store.cevrimici) { kopukMuydu = true; kopukEnFazla = Math.max(kopukEnFazla, k); return; }
  if (!kopukMuydu) return;
  if (k > 0) { kopukEnFazla = Math.max(kopukEnFazla, k); return; }
  toast(`Bağlantı geri geldi${kopukEnFazla ? ` · ${kopukEnFazla} işaret gönderildi` : ''}`, { tur: 'basari' });
  kopukMuydu = false; kopukEnFazla = 0;
}

// ---- canlı saat (26/800) + tarih satırı
let tarihAnahtar = '', tarihMetin = '';
function tarihEtiketi() {
  const s = store.ayarlar?.secim || {};
  const anahtar = `${s.tarih}|${s.yer}`;
  if (anahtar === tarihAnahtar) return tarihMetin;
  let gun = '1 Ekim Perşembe';
  try { if (s.tarih) gun = new Date(`${s.tarih}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }); } catch {}
  const yer = String(s.yer || 'Fuar İzmir, Gaziemir').split(',')[0].trim();
  tarihAnahtar = anahtar; tarihMetin = `${gun} · ${yer}`;
  return tarihMetin;
}
function saatCiz() {
  const s = $('#saat'); if (!s) return;
  s.textContent = simdi().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const a = $('#saat-alt'); if (a) { const t = tarihEtiketi(); if (a.textContent !== t) a.textContent = t; }
}
setInterval(saatCiz, 1000);

// ---- zil + bildirim paneli (SM Ustbar zil, kabuktaki masaüstü panel)
let panelOkunmamis = new Set(), panelImza = '';
function zilCiz() {
  mbZilCiz();
  const z = $('[data-zil]'); if (!z) return;
  const n = okunmamisBildirim();
  let r = z.querySelector('.zil-rozet');
  if (n) { if (!r) { r = document.createElement('span'); r.className = 'zil-rozet'; z.appendChild(r); } r.textContent = n > 99 ? '99+' : String(n); }
  else if (r) r.remove();
  z.title = n ? `Bildirimler · ${n} yeni` : 'Bildirimler';
  z.classList.toggle('acik', !!$('.zil-panel'));
}
const cevapSinifi = c => /^(Aldık|Tamam|Gördüm|Karşıladım)$/i.test(c) ? 'ana' : /^Fuarda/i.test(c) ? 'fuarda' : /^Sorun/i.test(c) ? 'sorun' : '';
function bildirimSatiri(b, cevapsiz) {
  const cevaplandi = !!b.cevap;
  const sec = cevaplandi ? [] : (Array.isArray(b.secenekler) ? b.secenekler : []);
  const kaynak = b.tur === 'hatirlatma' ? 'Hatırlatma' : b.tur === 'geri_sayim' ? 'Şoför' : b.tur === 'referans' ? 'Referans' : b.tur === 'oy_onay' ? 'Oy onayı' : 'Bilgi';
  // REFERANS bildirimi: kişiyi kim karşıladıysa altında görünür ("Karşılayan: Ad · saat")
  const fk = b.tur === 'referans' && b.firma_id ? store.firmalar.get(b.firma_id) : null;
  const karsilayan = fk?.karsilayan ? `<div class="zil-karsilayan">Karşılayan: ${esc(trBaslik(fk.karsilayan))}${fk.karsilama_zamani ? ` · ${esc(fmt.saat(fk.karsilama_zamani))}` : ''}</div>` : '';
  const ikinci = b.metin && b.metin !== 'Cevaplamak için dokun' ? `<div class="zil-alt-metin">${esc(b.metin)}</div>` : '';
  const durum = cevaplandi ? 'cevaplandi' : cevapsiz ? 'cevapsiz' : panelOkunmamis.has(b.id) ? 'okunmamis' : '';
  return `<div class="zil-satir ${durum}" data-b="${b.id}">
    <div class="zil-satir-ust"><div class="zil-marka">72</div><div class="zil-ad">72. Komite</div>${cevapsiz && !cevaplandi ? '<span class="zil-cevapsiz-rozet">CEVAPSIZ</span>' : ''}<div class="zil-zaman">${esc(fmt.saat(b.zaman))} · ${kaynak}</div></div>
    <button type="button" class="zil-metin" data-ac="${b.id}">${esc(b.baslik || b.metin || 'Bildirim')}</button>${ikinci}
    ${sec.length ? `<div class="zil-cevaplar" style="grid-template-columns:repeat(${Math.min(4, Math.max(2, sec.length))},minmax(0,1fr))">${sec.map(c => `<button type="button" class="${cevapSinifi(c)}" data-cevap="${b.id}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    ${karsilayan}
    ${cevaplandi ? `<div class="zil-cevap-ok">✓ ${esc(b.cevap)}${b.cevap_zamani ? ` · ${esc(fmt.saat(b.cevap_zamani))}` : ''}</div>` : ''}
  </div>`;
}
function zilPanelCiz(zorla = true) {
  const p = $('.zil-panel'); if (!p) return;
  const liste = store.bildirimler.slice(0, 60);
  const cevapsiz = new Set(cevapsizBildirimler().map(b => b.id));
  const imza = liste.map(b => `${b.id}:${b.cevap || ''}:${b.gorulme ? 1 : 0}:${cevapsiz.has(b.id) ? 1 : 0}`).join('|') + `#${panelOkunmamis.size}`;
  if (!zorla && imza === panelImza) return;
  panelImza = imza;
  const bekleyen = store.bildirimler.filter(b => !b.cevap && b.secenekler?.length).length;
  const kaydir = p.querySelector('.zil-liste')?.scrollTop || 0;
  p.innerHTML = `<div class="zil-ust"><b>Bildirimler</b><span class="zil-say">${bekleyen} cevap bekliyor</span><button type="button" data-hepsi>Tümü okundu</button></div>
    <div class="zil-liste">${liste.length ? liste.map(b => bildirimSatiri(b, cevapsiz.has(b.id))).join('') : '<div class="zil-bos">Henüz bildirim yok.</div>'}</div>`;
  const l = p.querySelector('.zil-liste'); if (l) l.scrollTop = kaydir;
}
function zilPanelAc() {
  panelleriKapat();
  const z = $('[data-zil]'); if (!z) return;
  panelOkunmamis = new Set(store.bildirimler.filter(b => !b.gorulme && !b.cevap).map(b => b.id));
  const arka = el('<div class="zil-arka" data-zil-arka></div>');
  const p = el('<div class="zil-panel" data-zil-panel role="dialog" aria-label="Bildirimler"></div>');
  arka.addEventListener('click', panelleriKapat);
  $('#katman').append(arka, p);
  p.style.right = `${Math.max(12, window.innerWidth - z.getBoundingClientRect().right - 16)}px`;
  p.addEventListener('click', panelTikla);
  zilPanelCiz(); zilCiz();
  bildirimGoruldu([...panelOkunmamis]).catch(() => {});   // açılınca görüldü: gönderene "görüldü" düşer
}
async function panelTikla(e) {
  if (e.target.closest('[data-hepsi]')) {
    panelOkunmamis.clear();
    try { await bildirimGoruldu(store.bildirimler.map(b => b.id)); } catch (er) { hataGoster(er); }
    zilPanelCiz(); zilCiz(); return;
  }
  const c = e.target.closest('[data-cevap]');
  if (c) {
    const grup = c.closest('.zil-cevaplar'); grup?.querySelectorAll('button').forEach(x => { x.disabled = true; });
    try { await bildirimCevapla(Number(c.dataset.cevap), c.dataset.c); toast(`${c.dataset.c} · cevap gönderildi`); }
    catch (er) { grup?.querySelectorAll('button').forEach(x => { x.disabled = false; }); hataGoster(er); }
    return;
  }
  const a = e.target.closest('[data-ac]');
  if (a) {
    const b = store.bildirimler.find(x => x.id === Number(a.dataset.ac)); panelleriKapat(); if (!b) return;
    if (b.firma_id) kisiKartiAc(b.firma_id);
    else if (b.arac_id && EKRANLAR.araclar.roller.includes(store.ben?.rol)) location.hash = `#araclar/${b.arac_id}`;
  }
}
// avatar menüsü: tasarımda çıkış düğmesi yok, işlev kaybolmasın diye avatarın altına küçük menü
function menuAc() {
  panelleriKapat();
  const a = $('[data-kullanici]'); if (!a) return;
  const arka = el('<div class="zil-arka" data-menu-arka></div>');
  const m = el(`<div class="kullanici-menu" role="menu"><div class="km-ust"><div class="km-ad">${esc(store.ben.ad_soyad)}</div><div class="km-rol">${esc(ROL_AD[store.ben.rol] || store.ben.rol)}</div></div><button type="button" data-cikis-yap role="menuitem">Çıkış yap</button></div>`);
  arka.addEventListener('click', panelleriKapat);
  m.querySelector('[data-cikis-yap]').addEventListener('click', () => { panelleriKapat(); cikis(); });
  $('#katman').append(arka, m);
  m.style.right = `${Math.max(12, window.innerWidth - a.getBoundingClientRect().right)}px`;
}
function panelleriKapat() {
  document.querySelectorAll('.zil-panel, .zil-arka, .kullanici-menu, .mb-katman').forEach(x => x.remove());
  $('[data-mb-menu]')?.setAttribute('aria-expanded', 'false');
  $('[data-zil]')?.classList.remove('acik');
}
// katmanlar sırayla kapanır: modal / palet / çekmece açıksa onlar önce (ui.js), yoksa panel
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || $('[data-modal]') || $('.palet') || $('.cekmece')) return;
  if ($('.zil-panel') || $('.kullanici-menu') || $('.mb-katman')) { e.stopPropagation(); panelleriKapat(); }
}, true);

// yeni bildirim: zil + panel canlı güncellenir, kısa toast (mobil kabukta da çalışır)
function bildirimOlayi(v) {
  zilCiz();
  if ($('.zil-panel')) zilPanelCiz();
  const b = v?.bildirim;
  if (!v?.yeni || !b || b.cevap || !store.ben) return;
  if ($('.zil-panel')) { bildirimGoruldu([b.id]).catch(() => {}); return; }   // panel açıkken zaten görüyor
  if (aktifYol === 'bildirimler') return;                                       // liste ekranındayken tekrar toast gerekmez
  toast(b.baslik || b.metin || 'Yeni bildirim', { tur: 'bildirim', nokta: 'yolda', sure: 6000 });
  const t = $('#toastlar')?.lastElementChild;
  t?.addEventListener('click', ev => {
    if (ev.target.closest('button')) return; t.remove();
    if ($('[data-zil]')) zilPanelAc(); else location.hash = '#bildirimler';
  });
}

async function git() {
  panelleriKapat();
  const [yol0, param] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!store.ben) { if (yol0 !== 'giris') location.hash = '#giris'; return girisGoster(); }
  let yol = yol0 || varsayilanYol();
  if (!EKRANLAR[yol] || !EKRANLAR[yol].roller.includes(store.ben.rol)) { yol = varsayilanYol(); history.replaceState(null, '', '#' + yol); }
  const tanim = EKRANLAR[yol];
  // geri yığını: başka ekrana geçerken önceki ekran yığına girer ("‹ Geri" ile dönülür); aynı ekranda parametre değişimi girmez
  const anahtar = yol + (param ? '/' + param : '');
  if (geriGidiyor) geriGidiyor = false;
  else if (aktifAnahtar && aktifAnahtar.split('/')[0] !== yol) { yigin.push(aktifAnahtar); if (yigin.length > 30) yigin.shift(); }
  aktifAnahtar = anahtar;
  try { aktif?.temizle?.(); } catch {}
  cekmeceKapat();
  const kok = $('#uygulama');
  kok.innerHTML = kabukHtml(yol, tanim.mobil);
  kabukBagla(); baglantiCiz(); saatCiz(); zilCiz(); temaDugmeCiz();
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
  const mb = $('[data-mb-ust]');
  if (mb) {
    $('[data-mb-menu]', mb)?.addEventListener('click', () => ($('.mb-katman') ? panelleriKapat() : mbCekmeceAc()));
    $('[data-mb-geri]', mb)?.addEventListener('click', mbGeri);
    $('[data-ara]', mb)?.addEventListener('click', () => paletAc());
    $('[data-mb-zil]', mb)?.addEventListener('click', () => { location.hash = '#bildirimler'; });
    return;
  }
  const ust = $('.ust'); if (!ust) return;   // mobil kabukta üst çubuk yok (ekranlar kendi başlığını çizer)
  $('[data-ara]', ust)?.addEventListener('click', () => paletAc());
  $('[data-zil]', ust)?.addEventListener('click', () => ($('.zil-panel') ? panelleriKapat() : zilPanelAc()));
  $('[data-kullanici]', ust)?.addEventListener('click', () => ($('.kullanici-menu') ? panelleriKapat() : menuAc()));
  $('[data-tema-degistir]', ust)?.addEventListener('click', temaDegistir);
}
async function asistanYukle() {
  try { asistanModul ||= (await import('./asistan.js')).default; asistanModul.kur?.(); } catch (e) { console.warn('asistan yüklenemedi', e); }
}

// canlı yenileme: ekranın yenile() fonksiyonu kare başına en çok bir kez çağrılır
bus.on('*', (ad, veri) => {
  if (ad === 'baglanti') { baglantiCiz(); geriGeldiKontrol(); }
  else if (ad !== 'saat' && store.cevrimici && store.canli) sonEsitleme = new Date();
  if (ad === 'istek') { const a = document.querySelector('.nav a[href="#yonetim"]'); if (a) a.innerHTML = `${esc(EKRANLAR.yonetim.ad)}${onayRozeti()}`; }
  if (ad === 'bildirim') bildirimOlayi(veri);
  if (ad === 'saat' && $('.zil-panel')) zilPanelCiz(false);   // "cevapsız" süreye bağlı: yalnız değişince çiz
  if (ad === 'ayar') saatCiz();
  if (!aktif?.yenile || yenileBekliyor) return;
  yenileBekliyor = true;
  requestAnimationFrame(() => { yenileBekliyor = false; try { aktif.yenile(ad); } catch (e) { console.error('yenile', e); } });
});

// ---------------------------------------------------------------- giriş
async function girisGoster() {
  aktif = null; aktifYol = null;
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
// genişlik 900 px sınırını geçince kabuk (üst menü / ☰) yeniden kurulur
mqDar.addEventListener?.('change', () => { if (store.ben && aktifYol && !EKRANLAR[aktifYol]?.mobil) git(); });
(async () => {
  try { await profilYukle(); } catch (e) { console.warn(e); }
  if (store.ben) await acilis();
  git();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
// bildirime dokununca servis çalışanı açık pencereye {tur:'git', url} yollar: ilgili ekrana yönlendir
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const v = e.data; if (!v || v.tur !== 'git' || !v.url) return;
    try {
      const u = new URL(v.url, location.href);
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname) { if (u.hash) location.hash = u.hash; } else location.href = u.href;
    } catch {}
  });
}
window.__secim = { store, bus };   // test ve hata ayıklama için (konsoldan store'a bakılabilir)
sb.auth.onAuthStateChange((olay) => { if (olay === 'SIGNED_OUT' && store.ben) { store.ben = null; location.hash = '#giris'; } });
