// 72. Komite · Seçim Masası · ATLAS ASİSTAN PENCERESİ (ATLAS, 2026-09-30)
// Sağ altta kırmızı ATLAS düğmesi + sağdan açılan sohbet paneli (telefonda tam ekran).
// Masa, rapor ve şoför ATLAS'a soru sorar, sahadan gelişme bildirir; ATLAS'ın cevapları kart olarak canlı gelir
// (cevap · işlendi · onaya gitti · plan · yapıldı · hata). Yönetici onay bekleyen istekleri buradan uygular ya da reddeder.
// app.js her ekran değişiminde kur() çağırır: kur() idempotenttir, düğmeyi ve paneli <body>'ye bir kez ekler.
import {
  store, bus, esc, fmt, trKucuk, trBaslik, DURUM_AD, SINIF_AD, ARAC_DURUM_AD, ROL_AD,
  yoneticiMi, yazabilirMi, benRol, asistanGonder, istekKarar, durumYap, firmaAdi, firmaListesi, gecikme,
} from './core.js';
import { el, toast, hataGoster, kisiKartiAc, onayla, rozetDurum, plakaHtml } from './ui.js';

// ---------------------------------------------------------------- sabitler
const BEKLEME_MS = 60000;              // bu süre içinde cevap gelmezse "meşgul" notu
const LISTE_KISA = 6, LISTE_UZUN = 150; // cevap kartındaki firma listesi: kapalı / açık satır sınırı
const ISTEK_DURUM = { onay_bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', yapiliyor: 'Yapılıyor', yapildi: 'Yapıldı', hata: 'Hata' };
const RISK_AD = { dusuk: 'Düşük risk', orta: 'Orta risk', yuksek: 'Yüksek risk' };
const ALAN_AD = {
  durum: 'Durum', oy_sinifi: 'Oy sınıfı', arac_id: 'Araç', notlar: 'Not', kendi_geldi: 'Kendi geldi', kendisi_gelecek: 'Kendisi gelecek',
  tasima_saati: 'Taşıma saati', alma_notu: 'Alma notu', servis: 'Servis', cep: 'Cep', cep2: '2. cep', adres: 'Adres', ek_not: 'Ek not',
  arac_sira: 'Araç sırası', sofor_ad: 'Şoför', sofor_tel: 'Şoför telefonu', plaka: 'Plaka', kapasite: 'Kapasite', evrak_uyari: 'Evrak uyarısı',
};
const TURLER = new Set(['cevap', 'islendi', 'onaya_gitti', 'plan', 'yapildi', 'hata']);
const CIPLER = [
  { ad: 'Kim kaldı?', gonder: 'Kim kaldı?' },
  { ad: 'Geciken alımlar', gonder: 'Geciken alımlar' },
  { ad: 'Araçlar nerede?', gonder: 'Araçlar nerede?' },
  { ad: 'Gelişme bildir', yaz: 'Gelişme: ' },
];
const SVG_GONDER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const SVG_TEL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

// ---------------------------------------------------------------- durum
let kuruldu = false, dugme = null, panel = null, girdi = null, gonderBtn = null;
let acik = false, benId = null, hepsiMod = false, sonGorulen = 0, onayKatli = false;
let ilkCizim = true, sonCizilen = 0, veriBagimli = false, zamanlayici = null, onizlemeZaman = null;
let giden = [], gonderiliyor = false;
const bilinenMesaj = new Set(), bilinenIstek = new Set();
const yerelZaman = new Map();       // bu cihazdan gönderilen mesaj id -> gönderim anı (saat kaymasına karşı)
const acikListeler = new Set();     // "Tümünü göster" açılmış mesajlar
const kararBekleyen = new Set(), geriBekleyen = new Set();

// ---------------------------------------------------------------- küçük yardımcılar
const dar = () => window.innerWidth < 760;
const numara = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
const diziAl = x => Array.isArray(x) ? x : [];
const kisalt = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const sonSatir = s => String(s ?? '').split('\n').map(x => x.trim()).filter(Boolean).pop() || '';
const evetMi = v => v === true || v === 1 || ['true', 't', '1', 'evet'].includes(trKucuk(v));
const durumParcala = s => { const p = String(s ?? '').split('+'); return { durum: p[0], kendi: p.includes('kendi') }; };
const profilAd = id => store.profiller.get(id)?.ad_soyad || '';
const mesajBul = id => { const n = numara(id); return n === null ? null : store.asistan.find(m => Number(m.id) === n) || null; };
const istekBul = id => { const n = numara(id); return n === null ? null : store.istekler.find(i => Number(i.id) === n) || null; };
const bekliyorMu = m => m.yon !== 'atlas' && (m.durum === 'yeni' || m.durum === 'isleniyor');
const yas = m => Math.max(0, Date.now() - (yerelZaman.get(m.id) ?? new Date(m.zaman).getTime()));
// Bekleyen mesajın "sessizlik" süresi: mesajdan ya da ondan sonra gelen son ATLAS mesajından bu yana geçen süre
function sessizlik(m, liste) {
  let son = null;
  for (const x of liste) if (x.yon === 'atlas' && Number(x.id) > Number(m.id)) son = x;
  return son ? Math.min(yas(m), Math.max(0, Date.now() - new Date(son.zaman).getTime())) : yas(m);
}
const agHatasi = e => !navigator.onLine || /fetch|network|NetworkError|Load failed|timeout/i.test(String(e?.message || e));
function veriOf(m) {
  let v = m?.veri;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  return v && typeof v === 'object' ? v : {};
}
const ls = {
  al(k, v0) { try { const v = localStorage.getItem(k); return v === null ? v0 : JSON.parse(v); } catch { return v0; } },
  yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// Türkçe tamlayan eki: "Musa Cankurtaran'ın", "Test Masa'nın", "Test Sofor'un"
function iyelik(ad) {
  const s = String(ad || '').trim(); if (!s) return '';
  const k = trKucuk(s), unlu = 'aıoueiöü';
  let son = ''; for (let i = k.length - 1; i >= 0; i--) if (unlu.includes(k[i])) { son = k[i]; break; }
  const ek = { a: 'ın', ı: 'ın', o: 'un', u: 'un', e: 'in', i: 'in', ö: 'ün', ü: 'ün' }[son] || 'in';
  return `${s}'${unlu.includes(k[k.length - 1]) ? 'n' : ''}${ek}`;
}
function gunEtiketi(ts) {
  const d = new Date(ts); if (Number.isNaN(d.getTime())) return '';
  const fark = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 86400000);
  if (fark === 0) return 'Bugün'; if (fark === 1) return 'Dün';
  return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
}
// ATLAS'ın düz metni: kaçışlanır, yalnız **kalın** desteklenir
const metinHtml = t => esc(t || '').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');

// ---------------------------------------------------------------- konuşma seçimi
const sirali = () => [...store.asistan].filter(m => m && m.id != null).sort((a, b) => Number(a.id) - Number(b.id));
// Kendi konuşmam: benim yazdıklarım + bana gelen ATLAS cevapları (kullanici_id bana ait ya da cevap_id benim mesajıma bağlı)
function benimKonusma(liste = sirali()) {
  const id = store.ben?.id; if (!id) return [];
  const benimler = liste.filter(m => m.yon !== 'atlas' && m.kullanici_id === id);
  const benimIds = new Set(benimler.map(m => Number(m.id)));
  const bagli = new Set(benimler.map(m => numara(m.cevap_id)).filter(x => x !== null));
  return liste.filter(m => m.kullanici_id === id || (m.yon === 'atlas' && (benimIds.has(numara(m.cevap_id)) || bagli.has(Number(m.id)))));
}
const tumMod = () => hepsiMod && yoneticiMi();
const gorunen = () => tumMod() ? sirali() : benimKonusma();
// ATLAS mesajının kaynağı olan kullanıcı mesajı
function kaynakMesaj(m, liste) {
  const v = veriOf(m);
  for (const aday of [m.cevap_id, v.mesaj_id, v.kaynak_mesaj_id]) { const k = mesajBul(aday); if (k && k.yon !== 'atlas') return k; }
  const ters = store.asistan.find(x => x.yon !== 'atlas' && numara(x.cevap_id) === Number(m.id)); if (ters) return ters;
  let son = null;
  for (const x of liste) { if (Number(x.id) >= Number(m.id)) break; if (x.yon !== 'atlas' && x.kullanici_id === m.kullanici_id) son = x; }
  return son;
}

// ---------------------------------------------------------------- kullanıcıya göre hazırlık (okunmadı, sıra, anahtar)
function benHazirla() {
  const id = store.ben?.id || null; if (id === benId) return;
  benId = id; bilinenMesaj.clear(); bilinenIstek.clear(); yerelZaman.clear(); acikListeler.clear();
  if (!id) { giden = []; return; }
  const kayit = ls.al(`atlas-son-gorulen-${id}`, null);
  if (kayit === null) {   // bu cihazda ilk açılış: geçmişi okunmuş say
    sonGorulen = benimKonusma().filter(m => m.yon === 'atlas').reduce((a, m) => Math.max(a, Number(m.id)), 0);
    ls.yaz(`atlas-son-gorulen-${id}`, sonGorulen);
  } else sonGorulen = Number(kayit) || 0;
  store.asistan.forEach(m => bilinenMesaj.add(m.id));
  store.istekler.forEach(i => bilinenIstek.add(i.id));
  hepsiMod = ls.al('atlas-tum-konusmalar', false) === true;
  giden = diziAl(ls.al(`atlas-giden-${id}`, [])).filter(g => g && g.metin);
}
function okunmamis() {
  if (!store.ben) return { atlas: 0, onay: 0 };
  const atlas = benimKonusma().filter(m => m.yon === 'atlas' && Number(m.id) > sonGorulen).length;
  const onay = yoneticiMi() ? store.istekler.filter(i => i.durum === 'onay_bekliyor').length : 0;
  return { atlas, onay };
}
function gorulduIsaretle() {
  if (!acik || document.hidden || !store.ben) return;
  const enSon = benimKonusma().filter(m => m.yon === 'atlas').reduce((a, m) => Math.max(a, Number(m.id)), sonGorulen);
  if (enSon > sonGorulen) { sonGorulen = enSon; ls.yaz(`atlas-son-gorulen-${store.ben.id}`, sonGorulen); }
}

// ---------------------------------------------------------------- düğme
function dugmeKur() {
  if (dugme && document.body.contains(dugme)) return;
  dugme = el('<button type="button" class="atlas-dugme" aria-label="ATLAS asistanını aç"><span class="asistan-dugme-yazi">ATLAS</span></button>');
  dugme.addEventListener('click', () => (acik ? kapat() : ac()));
  document.body.appendChild(dugme);
}
function dugmeCiz() {
  if (!dugme) return;
  const { atlas, onay } = okunmamis(); const n = atlas + onay;
  let r = dugme.querySelector('.rozet-sayi');
  if (n) { if (!r) { r = document.createElement('span'); r.className = 'rozet-sayi'; dugme.appendChild(r); } r.textContent = n > 99 ? '99+' : String(n); }
  else r?.remove();
  const parca = [atlas ? `${atlas} okunmamış cevap` : '', onay ? `${onay} onay bekleyen istek` : ''].filter(Boolean);
  dugme.title = `ATLAS · Seçim Asistanı${parca.length ? ' · ' + parca.join(', ') : ''}`;
  dugme.setAttribute('aria-label', dugme.title);
  dugme.classList.toggle('asistan-bekliyor', !!store.ben && (benimKonusma().some(bekliyorMu) || giden.length > 0));
}
function nabiz() { if (!dugme) return; dugme.classList.remove('asistan-nabiz'); void dugme.offsetWidth; dugme.classList.add('asistan-nabiz'); }
function gorunurlukGuncelle() {
  const girisli = !!store.ben && !/^#giris/.test(location.hash);
  if (!girisli) { if (acik) kapat(); onizlemeKapat(); }
  dugme?.classList.toggle('gizli', !girisli || acik);
}

// ---------------------------------------------------------------- önizleme balonu (panel kapalıyken gelen cevap)
function onizlemeGoster(baslik, metin) {
  if (!dugme || dugme.classList.contains('gizli') || !metin) return;
  onizlemeKapat();
  const r = dugme.getBoundingClientRect();
  const o = el(`<div class="asistan-onizleme" role="status"><div class="asistan-onizleme-ust">${esc(baslik)}</div><div class="asistan-onizleme-metin">${esc(metin)}</div></div>`);
  o.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
  o.style.bottom = Math.max(12, window.innerHeight - r.top + 10) + 'px';
  o.addEventListener('click', () => { onizlemeKapat(); ac(); });
  document.body.appendChild(o);
  onizlemeZaman = setTimeout(onizlemeKapat, 9000);
}
function onizlemeKapat() { clearTimeout(onizlemeZaman); document.querySelectorAll('.asistan-onizleme').forEach(x => x.remove()); }
function atlasOzet(m) {
  const v = veriOf(m); const t = String(m.metin || '').replace(/\*\*/g, '').trim();
  const on = { islendi: 'İşlendi', onaya_gitti: 'Onaya gönderildi', plan: 'Onayını bekleyen plan', yapildi: 'Yapıldı', hata: 'Hata' }[m.tur];
  const deg = diziAl(v.degisiklikler).length;
  const s = t || (deg ? `${deg} değişiklik` : '');
  return kisalt(on ? (s ? `${on}: ${s}` : on) : s, 160);
}

// ---------------------------------------------------------------- panel iskeleti (bir kez kurulur, yalnız liste yeniden çizilir)
function panelKur() {
  if (panel && document.body.contains(panel)) return;
  panel = el(`
  <aside class="asistan-panel" role="dialog" aria-label="ATLAS Seçim Asistanı" aria-hidden="true">
    <header class="asistan-ust">
      <div class="asistan-logo" aria-hidden="true">ATLAS</div>
      <div class="asistan-ust-orta">
        <div class="asistan-baslik">ATLAS · Seçim Asistanı</div>
        <div class="asistan-yetki" data-yetki></div>
      </div>
      <button type="button" class="btn btn-hayalet btn-ikon" data-kapat title="Kapat (Esc)" aria-label="Kapat">✕</button>
    </header>
    <div class="asistan-serit" data-serit></div>
    <div class="asistan-onay" data-onay></div>
    <div class="asistan-govde">
      <div class="asistan-liste" data-liste aria-live="polite"></div>
      <button type="button" class="asistan-yeni gizli" data-yeni>Yeni mesaj ↓</button>
    </div>
    <div class="asistan-giris">
      <div class="asistan-cipler">${CIPLER.map((c, i) => `<button type="button" class="cip" data-cip="${i}">${esc(c.ad)}</button>`).join('')}</div>
      <form class="asistan-kutu" data-form>
        <textarea rows="1" maxlength="2000" data-girdi aria-label="ATLAS'a mesaj"></textarea>
        <button type="submit" class="asistan-gonder" data-gonder title="Gönder (Enter)" aria-label="Gönder" disabled>${SVG_GONDER}</button>
      </form>
      <div class="asistan-ipucu">Enter gönderir · Shift+Enter alt satır</div>
    </div>
  </aside>`);
  document.body.appendChild(panel);
  girdi = panel.querySelector('[data-girdi]');
  gonderBtn = panel.querySelector('[data-gonder]');
  const liste = panel.querySelector('[data-liste]');

  panel.querySelector('[data-form]').addEventListener('submit', e => { e.preventDefault(); gonder(); });
  girdi.addEventListener('input', boyutla);
  girdi.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); gonder(); }
  });
  liste.addEventListener('scroll', () => { if (liste.scrollHeight - liste.scrollTop - liste.clientHeight < 60) yeniPill(false); }, { passive: true });
  panel.addEventListener('keydown', e => {
    const f = e.target.closest?.('.asistan-firma');
    if (f && (e.key === 'Enter' || e.key === ' ') && e.target === f) { e.preventDefault(); kisiKartiAc(Number(f.dataset.kisi)); }
  });
  panel.addEventListener('click', tikla);
}
function tikla(e) {
  const t = e.target;
  if (t.closest('a[href^="tel:"]')) return;                         // arama bağlantısı kendi işini yapar
  if (t.closest('[data-kapat]')) return kapat();
  const kisi = t.closest('[data-kisi]'); if (kisi) { e.preventDefault(); return kisiKartiAc(Number(kisi.dataset.kisi)); }
  const k = t.closest('[data-karar]'); if (k) return karar(Number(k.dataset.istek), k.dataset.karar === '1');
  const g = t.closest('[data-geri]'); if (g) return geriAl(Number(g.dataset.geri));
  const la = t.closest('[data-liste-ac]'); if (la) { const id = Number(la.dataset.listeAc); acikListeler.has(id) ? acikListeler.delete(id) : acikListeler.add(id); return planla(); }
  const c = t.closest('[data-cip]'); if (c) return cip(CIPLER[Number(c.dataset.cip)]);
  const o = t.closest('[data-ornek]'); if (o) return kutuyaYaz(o.dataset.ornek);
  if (t.closest('[data-hepsi]')) { hepsiMod = !hepsiMod; ls.yaz('atlas-tum-konusmalar', hepsiMod); ilkCizim = true; return planla(true); }
  if (t.closest('[data-onay-katla]')) { onayKatli = !onayKatli; return planla(); }
  const git = t.closest('[data-git]'); if (git) return mesajaGit(Number(git.dataset.git));
  const sil = t.closest('[data-giden-sil]'); if (sil) { giden = giden.filter(x => x.yid !== sil.dataset.gidenSil); gidenKaydet(); return planla(); }
  if (t.closest('[data-yeni]')) { const l = panel.querySelector('[data-liste]'); l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' }); yeniPill(false); }
}
function boyutla() {
  if (!girdi) return;
  girdi.style.height = 'auto';
  girdi.style.height = Math.min(girdi.scrollHeight, 132) + 'px';
  gonderBtn.disabled = !girdi.value.trim();
}
function kutuyaYaz(metin) {
  girdi.value = metin; boyutla();
  girdi.focus(); girdi.setSelectionRange(girdi.value.length, girdi.value.length);
}
function cip(c) {
  if (!c) return;
  if (c.gonder) return gonder(c.gonder);
  const mevcut = girdi.value.trim();
  kutuyaYaz(!mevcut ? c.yaz : (/^gelişme\s*:/i.test(mevcut) ? girdi.value : c.yaz + mevcut));
}
function yeniPill(goster) { panel?.querySelector('[data-yeni]')?.classList.toggle('gizli', !goster); }
function mesajaGit(id) {
  const s = panel.querySelector(`[data-mid="${id}"]`); if (!s) return;
  s.scrollIntoView({ block: 'center', behavior: 'smooth' });
  s.classList.remove('parla'); void s.offsetWidth; s.classList.add('parla');
}

// ---------------------------------------------------------------- aç / kapat
function ac(metin) {
  if (!store.ben) return;
  if (!kuruldu) kur();
  panelKur();
  acik = true; ilkCizim = true;
  panel.classList.add('acik'); panel.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('asistan-acik');
  onizlemeKapat();
  girdi.placeholder = dar() ? "ATLAS'a yaz…" : "ATLAS'a yaz… soru sor ya da gelişme bildir";
  if (typeof metin === 'string' && metin) girdi.value = metin;
  boyutla();
  ciz({ alta: true });
  gorunurlukGuncelle();
  if (!dar() || (typeof metin === 'string' && metin)) setTimeout(() => { if (acik) { girdi.focus(); girdi.setSelectionRange(girdi.value.length, girdi.value.length); } }, 90);
}
function kapat() {
  if (!panel) return;
  const odak = panel.contains(document.activeElement);
  acik = false;
  panel.classList.remove('acik'); panel.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('asistan-acik');
  clearTimeout(zamanlayici); zamanlayici = null;
  gorunurlukGuncelle(); dugmeCiz();
  if (odak && dugme && !dugme.classList.contains('gizli')) dugme.focus({ preventScroll: true });
}
function escYakala(e) {
  if (e.key !== 'Escape' || !acik) return;
  // önce üstteki katman (modal, hızlı arama, kişi kartı) kapansın; ui.js onları kapatır
  if (document.querySelector('#katman [data-modal], .palet, #katman [data-cekmece]')) return;
  e.preventDefault(); kapat();
}

// ---------------------------------------------------------------- gönderme (çevrimdışıyken sıraya alır)
async function gonder(ozelMetin) {
  if (!store.ben) return;
  const kutudan = typeof ozelMetin !== 'string';
  const metin = String(kutudan ? girdi.value : ozelMetin).trim();
  if (!metin) return;
  if (kutudan) { girdi.value = ''; boyutla(); }
  if (!navigator.onLine) { sirayaAl(metin); return; }
  try {
    const m = await asistanGonder(metin);
    if (m?.id != null) { yerelZaman.set(m.id, Date.now()); bilinenMesaj.add(m.id); }
    planla(true);
  } catch (e) {
    if (agHatasi(e)) { sirayaAl(metin); return; }
    hataGoster(e);
    if (kutudan && !girdi.value.trim()) { girdi.value = metin; boyutla(); }
  }
}
function gidenKaydet() { if (store.ben) ls.yaz(`atlas-giden-${store.ben.id}`, giden); }
function sirayaAl(metin) {
  giden.push({ yid: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), metin, zaman: new Date().toISOString() });
  gidenKaydet();
  toast('İnternet yok. Mesajın sıraya alındı, bağlantı gelince ATLAS\'a gidecek.');
  planla(true);
}
async function gidenBosalt() {
  if (gonderiliyor || !giden.length || !navigator.onLine || !store.ben) return;
  gonderiliyor = true;
  try {
    while (giden.length) {
      const g = giden[0];
      try {
        const m = await asistanGonder(g.metin);
        if (m?.id != null) { yerelZaman.set(m.id, Date.now()); bilinenMesaj.add(m.id); }
        giden.shift(); gidenKaydet();
      } catch (e) {
        if (agHatasi(e)) break;
        hataGoster(e); giden.shift(); gidenKaydet();
      }
    }
  } finally { gonderiliyor = false; planla(); }
}

// ---------------------------------------------------------------- onay kararı (yönetici)
async function karar(id, onay) {
  if (!yoneticiMi() || !id || kararBekleyen.has(id)) return;
  const ist = istekBul(id);
  if (onay && ist?.risk === 'yuksek' && !(await onayla('ATLAS bu planı yüksek riskli olarak işaretledi. Yine de uygulansın mı?', { evet: 'Evet, uygula', tehlike: true }))) return;
  kararBekleyen.add(id); planla();
  try {
    await istekKarar(id, onay);
    toast(onay ? 'Onaylandı. ATLAS uygulamaya geçiyor.' : 'Vazgeçildi, istek reddedildi.', { tur: onay ? 'basari' : '' });
  } catch (e) { hataGoster(e); }
  finally { kararBekleyen.delete(id); planla(); }
}

// ---------------------------------------------------------------- ATLAS işlemini geri al (yalnız durum değişiklikleri)
const geriIzni = () => yazabilirMi() || benRol() === 'sofor';
function geriAlinabilir(v) {
  return diziAl(v.degisiklikler).filter(d => d && d.alan === 'durum' && numara(d.firma_id) !== null
    && d.eski !== null && d.eski !== undefined && d.eski !== '' && store.firmalar.has(numara(d.firma_id)));
}
async function geriAl(mid) {
  const m = mesajBul(mid); if (!m || geriBekleyen.has(mid) || !geriIzni()) return;
  const v = veriOf(m); const liste = geriAlinabilir(v); if (!liste.length) return;
  const ilk = store.firmalar.get(numara(liste[0].firma_id));
  const sonradan = liste.filter(d => { const f = store.firmalar.get(numara(d.firma_id)); const y = durumParcala(d.yeni).durum, e = durumParcala(d.eski).durum; return f && f.durum !== y && f.durum !== e; });
  if (liste.length > 1 || sonradan.length) {
    let soru = liste.length > 1 ? `ATLAS'ın yaptığı ${liste.length} durum değişikliği eski haline dönsün mü?` : `${firmaAdi(ilk)} eski durumuna (${DURUM_AD[durumParcala(liste[0].eski).durum] || liste[0].eski}) dönsün mü?`;
    if (sonradan.length) soru += ` Dikkat: ${sonradan.length} kayıt ATLAS'tan sonra elle değişmiş, onların da üzerine yazılacak.`;
    if (!(await onayla(soru, { evet: 'Geri al', tehlike: sonradan.length > 0 }))) return;
  }
  geriBekleyen.add(mid); planla();
  const geriler = [];
  try {
    for (const d of liste) {
      const id = numara(d.firma_id); const e = durumParcala(d.eski); const y = durumParcala(d.yeni);
      const kd = diziAl(v.degisiklikler).find(x => x && x.alan === 'kendi_geldi' && numara(x.firma_id) === id);
      const kendi = kd ? evetMi(kd.eski) : e.kendi ? true : y.kendi ? false : null;
      geriler.push(await durumYap(id, e.durum, { kendi, kaynak: 'el', metin: `ATLAS işlemi geri alındı (mesaj ${m.id})` }));
    }
    toast(liste.length > 1 ? `${liste.length} değişiklik eski haline döndü` : `${firmaAdi(ilk)} eski durumuna döndü`, {
      geriAl: async () => { for (const g of [...geriler].reverse()) await g(); },
    });
  } catch (e) { hataGoster(e); }
  finally { geriBekleyen.delete(mid); planla(); }
}

// ---------------------------------------------------------------- çizim: parçalar
const istekRozet = d => d ? `<span class="asistan-ist ist-${esc(d)}">${esc(ISTEK_DURUM[d] || d)}</span>` : '';
const riskRozet = r => r ? `<span class="asistan-risk r-${esc(r)}">${esc(RISK_AD[r] || r)}</span>` : '';
const alanAd = (alan, tip) => tip === 'arac' && alan === 'durum' ? 'Araç durumu' : (ALAN_AD[alan] || String(alan || '').replace(/_/g, ' '));

function degerHtml(alan, v, tip) {
  if (v === null || v === undefined || v === '') return `<span class="asistan-deger asistan-deger-bos">${alan === 'arac_id' ? 'araç yok' : 'boş'}</span>`;
  if (tip === 'firma' && alan === 'durum') { const p = durumParcala(v); return `<span class="rozet d-${esc(p.durum)}">${esc(DURUM_AD[p.durum] || p.durum)}${p.kendi ? ' · kendi' : ''}</span>`; }
  if (tip === 'arac' && alan === 'durum') return `<span class="rozet a-${esc(v)}">${esc(ARAC_DURUM_AD[v] || v)}</span>`;
  if (alan === 'oy_sinifi') return `<span class="rozet s-${esc(v)}">${esc(SINIF_AD[v] || v)}</span>`;
  if (alan === 'arac_id') { const a = store.araclar.get(numara(v)); return a ? plakaHtml(a.plaka) : `<span class="asistan-deger">Araç #${esc(v)}</span>`; }
  if (typeof v === 'boolean' || alan === 'kendi_geldi' || alan === 'kendisi_gelecek') return `<span class="asistan-deger">${evetMi(v) ? 'Evet' : 'Hayır'}</span>`;
  if (alan === 'tasima_saati') return `<span class="asistan-deger">${esc(fmt.saatKisa(v))}</span>`;
  return `<span class="asistan-deger">${esc(kisalt(typeof v === 'object' ? JSON.stringify(v) : String(v), 120))}</span>`;
}
function degHtml(d) {
  if (!d || typeof d !== 'object') return '';
  const fid = numara(d.firma_id), aid = numara(d.arac_id);
  const tip = fid !== null ? 'firma' : 'arac';
  const f = fid !== null ? store.firmalar.get(fid) : null;
  const a = aid !== null ? store.araclar.get(aid) : null;
  const kim = tip === 'firma'
    ? (f ? `<a href="#" class="asistan-deg-kim" data-kisi="${f.id}">${esc(firmaAdi(f))}</a><span class="asistan-deg-unvan">${esc(f.unvan || '')}</span>` : `<span class="asistan-deg-kim">Firma #${esc(fid)}</span>`)
    : (a ? `${plakaHtml(a.plaka)}${a.sofor_ad ? `<span class="asistan-deg-unvan">${esc(trBaslik(a.sofor_ad))}</span>` : ''}` : `<span class="asistan-deg-kim">${aid !== null ? 'Araç #' + esc(aid) : 'Kayıt'}</span>`);
  const deger = d.alan === 'notlar'
    ? `<span class="asistan-deger">${esc(kisalt(sonSatir(d.yeni), 160))}</span>`
    : `<span class="asistan-eski">${degerHtml(d.alan, d.eski, tip)}</span><span class="asistan-ok">→</span>${degerHtml(d.alan, d.yeni, tip)}`;
  let simdi = '';
  if (tip === 'firma' && d.alan === 'durum' && f) {
    const y = durumParcala(d.yeni).durum, e = durumParcala(d.eski).durum;
    if (f.durum !== y) simdi = `<span class="asistan-simdi${f.durum === e ? ' donmus' : ''}">${f.durum === e ? 'eski haline döndü' : 'şu an: ' + esc(DURUM_AD[f.durum] || f.durum)}</span>`;
  }
  return `<div class="asistan-deg"><div class="asistan-deg-ust">${kim}</div><div class="asistan-deg-alt"><span class="asistan-deg-alan">${esc(alanAd(d.alan, tip))}</span>${deger}${simdi}</div></div>`;
}
function degisikliklerHtml(v) {
  const d = diziAl(v.degisiklikler).filter(x => x && typeof x === 'object');
  if (!d.length) return '';
  veriBagimli = true;
  return `<div class="asistan-degler">${d.map(degHtml).join('')}</div>`;
}
function firmaSatirHtml(f) {
  const g = gecikme(f); const telNo = f.cep || f.cep2 || ''; const tel = fmt.telLink(telNo);
  const yan = [f.tasima_saati ? 'Servis ' + fmt.saatKisa(f.tasima_saati) : '', f.ilce ? trBaslik(f.ilce) : '', f.unvan].filter(Boolean).join(' · ');
  return `<div class="asistan-firma" role="button" tabindex="0" data-kisi="${f.id}">`
    + `<div class="asistan-firma-sol"><div class="asistan-firma-ad">${esc(firmaAdi(f))}</div><div class="asistan-firma-yan">${esc(yan)}</div></div>`
    + `<div class="asistan-firma-sag">${g ? `<span class="rozet u-gecikti">${g} dk</span>` : ''}${rozetDurum(f)}`
    + `${tel ? `<a class="asistan-tel" href="${tel}" title="Ara: ${esc(fmt.tel(telNo))}" aria-label="Ara">${SVG_TEL}</a>` : ''}</div></div>`;
}
function firmaListeHtml(ids, mid) {
  const firmalar = diziAl(ids).map(x => store.firmalar.get(numara(x && typeof x === 'object' ? (x.id ?? x.firma_id) : x))).filter(Boolean);
  if (!firmalar.length) return '';
  veriBagimli = true;
  const genis = acikListeler.has(Number(mid));
  const gos = firmalar.slice(0, genis ? LISTE_UZUN : LISTE_KISA);
  const oy = firmalar.filter(f => f.durum === 'oy_kullandi').length;
  return `<div class="asistan-firmalar"><div class="asistan-firmalar-ust"><span>${fmt.sayi(firmalar.length)} firma</span>${oy ? `<span>${fmt.sayi(oy)} oy kullandı</span>` : ''}</div>`
    + gos.map(firmaSatirHtml).join('')
    + (firmalar.length > LISTE_KISA ? `<button type="button" class="asistan-firmalar-alt" data-liste-ac="${Number(mid)}">${genis ? 'Daha az göster' : `Tümünü göster (${fmt.sayi(firmalar.length)})`}</button>` : '')
    + (genis && firmalar.length > LISTE_UZUN ? `<div class="asistan-firmalar-not">İlk ${LISTE_UZUN} firma gösteriliyor</div>` : '')
    + '</div>';
}
function kaynakSatiri(k) {
  if (!k) return '';
  const ad = k.kullanici_ad || profilAd(k.kullanici_id) || 'Kullanıcı';
  return `<div class="asistan-kaynak" data-git="${Number(k.id)}" title="${esc(kisalt(k.metin, 300))}">Kaynak: ${esc(iyelik(ad))} ${esc(fmt.saat(k.zaman))} mesajı</div>`;
}
// Aynı istek için birden çok kart varsa (onaya gitti + plan + yapıldı) ayrıntı yalnız son onay kartında, sonuç yalnız kapanış kartında görünür
let istekBaglam = { sonKart: new Map(), kapanan: new Set() };
function istekBaglamKur(liste) {
  const sonKart = new Map(), kapanan = new Set();
  for (const m of liste) {
    if (m.yon !== 'atlas') continue;
    const id = numara(veriOf(m).istek_id); if (id === null) continue;
    if (m.tur === 'onaya_gitti' || m.tur === 'plan') sonKart.set(id, Number(m.id));
    if (m.tur === 'yapildi' || m.tur === 'hata') kapanan.add(id);
  }
  istekBaglam = { sonKart, kapanan };
}
function istekIzHtml(ist, istekId, mid = null) {
  const n = numara(istekId);
  if (mid !== null && n !== null && istekBaglam.sonKart.has(n) && istekBaglam.sonKart.get(n) !== Number(mid)) return '';
  if (!ist) return numara(istekId) !== null ? `<div class="asistan-iz">${yoneticiMi() ? 'İstek kaydı henüz gelmedi.' : 'Musa\'nın onayı bekleniyor.'}</div>` : '';
  const s = [];
  if (ist.durum === 'onay_bekliyor') s.push(yoneticiMi() ? 'Onayını bekliyor.' : 'Musa\'nın onayı bekleniyor.');
  if (ist.onaylayan && ist.durum !== 'onay_bekliyor') s.push(`${ist.durum === 'reddedildi' ? 'Reddeden' : 'Onaylayan'}: ${ist.onaylayan}${ist.onay_zamani ? ' · ' + fmt.saat(ist.onay_zamani) : ''}`);
  if (ist.onay_notu) s.push(`Not: ${ist.onay_notu}`);
  if (ist.sonuc && !istekBaglam.kapanan.has(Number(ist.id))) s.push(`Sonuç: ${ist.sonuc}`);
  return s.length ? `<div class="asistan-iz">${s.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : '';
}
function geriAlHtml(m, v) {
  if (!geriIzni()) return '';
  const liste = geriAlinabilir(v); if (!liste.length) return '';
  veriBagimli = true;
  const hepsiEski = liste.every(d => store.firmalar.get(numara(d.firma_id))?.durum === durumParcala(d.eski).durum);
  if (hepsiEski) return '<div class="asistan-kart-eylem"><span class="asistan-geri-tamam">↺ Eski haline döndü</span></div>';
  const bekle = geriBekleyen.has(Number(m.id));
  return `<div class="asistan-kart-eylem"><button type="button" class="btn btn-kucuk" data-geri="${Number(m.id)}" ${bekle ? 'disabled' : ''}>${bekle ? 'Geri alınıyor…' : '↺ Geri al'}</button><span class="asistan-kucuk">${liste.length > 1 ? `${liste.length} durum eski haline döner` : 'Durum eski haline döner'}</span></div>`;
}
function kararDugmeleri(id) {
  const b = kararBekleyen.has(Number(id)) ? 'disabled' : '';
  return `<div class="asistan-kart-eylem"><button type="button" class="btn btn-yesil btn-kucuk" data-karar="1" data-istek="${Number(id)}" ${b}>Uygula</button><button type="button" class="btn btn-kucuk" data-karar="0" data-istek="${Number(id)}" ${b}>Vazgeç</button></div>`;
}

// ---------------------------------------------------------------- çizim: mesajlar
function kullaniciHtml(m, tum) {
  const benim = m.kullanici_id === store.ben.id;
  const kim = tum && !benim ? `<div class="asistan-kim">${esc(m.kullanici_ad || profilAd(m.kullanici_id) || 'Kullanıcı')}${m.rol ? ` · ${esc(ROL_AD[m.rol] || m.rol)}` : ''}</div>` : '';
  const d = { yeni: 'Gönderildi', isleniyor: 'ATLAS okudu', tamam: '✓ Yanıtlandı', hata: 'İşlenemedi' }[m.durum] || '';
  return `<div class="asistan-satir ben${benim ? '' : ' baska'}" data-mid="${Number(m.id)}">${kim}`
    + `<div class="asistan-balon"><div class="asistan-metin">${metinHtml(m.metin)}</div></div>`
    + `<div class="asistan-alt"><span>${esc(fmt.saat(m.zaman))}</span>${d ? `<span class="asistan-d d-${esc(m.durum)}">${d}</span>` : ''}</div></div>`;
}
function atlasHtml(m, liste, tum) {
  const v = veriOf(m); const tur = TURLER.has(m.tur) ? m.tur : 'cevap';
  const metin = m.metin ? `<div class="asistan-metin">${metinHtml(m.metin)}</div>` : '';
  let ic = '';
  if (tur === 'islendi') {
    const n = diziAl(v.degisiklikler).length;
    ic = `<div class="asistan-etiket">ATLAS İŞLEDİ${n > 1 ? ` · ${n} DEĞİŞİKLİK` : ''}</div>${metin}${degisikliklerHtml(v)}${firmaListeHtml(v.liste, m.id)}${kaynakSatiri(kaynakMesaj(m, liste))}${geriAlHtml(m, v)}`;
  } else if (tur === 'onaya_gitti') {
    const ist = istekBul(v.istek_id);
    ic = `<div class="asistan-etiket">ONAYA GÖNDERİLDİ ${istekRozet(ist?.durum || (numara(v.istek_id) !== null ? 'onay_bekliyor' : ''))}</div>${metin}${istekIzHtml(ist, v.istek_id, m.id)}`;
  } else if (tur === 'plan') {
    const ist = istekBul(v.istek_id);
    if (!yoneticiMi()) {
      ic = `<div class="asistan-etiket">PLAN HAZIRLANDI ${istekRozet(ist?.durum || 'onay_bekliyor')}</div><div class="asistan-metin">${ist && ist.durum !== 'onay_bekliyor' ? 'İsteğin için hazırlanan plan Musa\'ya gitti.' : 'İsteğin için bir plan hazırlandı. Musa onaylayınca uygulanacak.'}</div>${istekIzHtml(ist, v.istek_id, m.id)}`;
    } else {
      const ekPlan = ist?.plan && ist.plan.trim() !== String(m.metin || '').trim() ? `<div class="asistan-metin asistan-plan">${metinHtml(ist.plan)}</div>` : '';
      const ana = m.metin ? `<div class="asistan-metin asistan-plan">${metinHtml(m.metin)}</div>` : '';
      ic = `<div class="asistan-etiket">PLAN ${riskRozet(ist?.risk || v.risk)} ${istekRozet(ist?.durum)}</div>`
        + (ist ? `<div class="asistan-istek-kim">${esc(ist.isteyen_ad || 'Bir kullanıcı')} istedi · ${esc(fmt.saat(ist.zaman))}</div>${ist.metin ? `<div class="alinti">${esc(ist.metin)}</div>` : ''}` : '')
        + ana + ekPlan
        + (ist && ist.durum === 'onay_bekliyor' ? kararDugmeleri(ist.id) : istekIzHtml(ist, v.istek_id, m.id));
    }
  } else if (tur === 'yapildi' || tur === 'hata') {
    const ist = istekBul(v.istek_id);
    ic = `<div class="asistan-etiket">${tur === 'yapildi' ? 'YAPILDI' : 'HATA'}</div>${metin}${degisikliklerHtml(v)}${firmaListeHtml(v.liste, m.id)}`
      + (ist?.sonuc && ist.sonuc.trim() !== String(m.metin || '').trim() ? `<div class="asistan-iz"><div>${esc('Sonuç: ' + ist.sonuc)}</div></div>` : '')
      + (tur === 'yapildi' && yoneticiMi() ? geriAlHtml(m, v) : '');
  } else {
    ic = `${metin}${firmaListeHtml(v.liste, m.id)}`;
  }
  const genis = tur !== 'cevap' || diziAl(v.liste).length > 0;
  const hedef = tum && m.kullanici_id && m.kullanici_id !== store.ben.id ? (profilAd(m.kullanici_id) || m.kullanici_ad || '') : '';
  return `<div class="asistan-satir atlas" data-mid="${Number(m.id)}"><div class="asistan-balon t-${tur}${genis ? ' genis' : ''}">${ic || '<div class="asistan-metin">…</div>'}</div>`
    + `<div class="asistan-alt"><span class="asistan-atlas-ad">ATLAS</span>${hedef ? `<span>→ ${esc(hedef)}</span>` : ''}<span>${esc(fmt.saat(m.zaman))}</span></div></div>`;
}
function gidenHtml(g) {
  return `<div class="asistan-satir ben sirada"><div class="asistan-balon"><div class="asistan-metin">${metinHtml(g.metin)}</div></div>`
    + `<div class="asistan-alt"><span>${esc(fmt.saat(g.zaman))}</span><span class="asistan-d d-sirada">Sırada · internet gelince gidecek</span><button type="button" class="asistan-link" data-giden-sil="${esc(g.yid)}">Sil</button></div></div>`;
}
function yaziyorHtml(liste) {
  const bekleyen = liste.filter(m => m.kullanici_id === store.ben.id && bekliyorMu(m));
  if (!bekleyen.length) return '';
  const enYasli = Math.max(...bekleyen.map(m => sessizlik(m, liste)));
  if (enYasli >= BEKLEME_MS) {
    return `<div class="asistan-mesgul"><b>ATLAS şu an meşgul ya da çevrimdışı, ${bekleyen.length > 1 ? 'mesajların' : 'mesajın'} sırada.</b><span>Cevap gelince burada görünecek; bu pencereyi kapatabilirsin.</span></div>`;
  }
  return '<div class="asistan-yaziyor"><span class="asistan-noktalar"><i></i><i></i><i></i></span>ATLAS yazıyor…</div>';
}
function ornekSorular() {
  const o = [];
  const say = new Map();
  firmaListesi().forEach(f => { if (f.oy_sinifi === 'bizde' && f.referans) say.set(f.referans, (say.get(f.referans) || 0) + 1); });
  const ref = [...say.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (ref) o.push({ yazi: `${trBaslik(ref)} referanslılardan kim oy kullanmadı?` });
  const rotalar = [...new Set(firmaListesi().map(f => f.rota_kod).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  if (rotalar.length) o.push({ yazi: `${trBaslik(rotalar[0])} ne durumda?` });
  o.push({ yazi: 'Gelişme: …', deger: 'Gelişme: ' });
  return o;
}
function bosHtml() {
  const ad = String(store.ben.ad_soyad || '').trim().split(/\s+/)[0] || '';
  const acik_ = yoneticiMi()
    ? 'Masanın tamamı önümde. Sor ya da yaptır; toplu işlerde önce planı sana gösteririm, sen onaylarsın.'
    : 'Listeyi, araçları ve sahayı anlık bilirim. Bir şey sor ya da sahadan gelen gelişmeyi yaz. Büyük işler Musa\'nın onayına gider.';
  return `<div class="asistan-bos"><div class="asistan-bos-logo" aria-hidden="true">ATLAS</div><h3>Merhaba${ad ? ' ' + esc(ad) : ''}, ben ATLAS.</h3><p>${esc(acik_)}</p>`
    + `<div class="asistan-bos-etiket">Örnek</div><div class="asistan-ornekler">${ornekSorular().map(x => `<button type="button" class="asistan-ornek" data-ornek="${esc(x.deger ?? x.yazi)}">${esc(x.yazi)}</button>`).join('')}</div></div>`;
}
function listeIcerik(liste) {
  const tum = tumMod();
  istekBaglamKur(liste);
  let html = '', gun = '';
  for (const m of liste) {
    const g = gunEtiketi(m.zaman);
    if (g && g !== gun) { gun = g; html += `<div class="asistan-gun">${esc(g)}</div>`; }
    try { html += m.yon === 'atlas' ? atlasHtml(m, liste, tum) : kullaniciHtml(m, tum); }
    catch (e) { console.error('asistan mesajı çizilemedi', m, e); }
  }
  html += giden.map(gidenHtml).join('');
  html += yaziyorHtml(liste);
  return html || bosHtml();
}

// ---------------------------------------------------------------- çizim: üst, şerit, onay bloğu, liste
function ustCiz() {
  const y = panel.querySelector('[data-yetki]');
  const yeni = yoneticiMi() ? '<b>Yönetici</b> · tam yetki' : 'Soru sorabilir, gelişme bildirebilirsin; işler Musa\'nın onayına gider';
  if (y.innerHTML !== yeni) { y.innerHTML = yeni; y.classList.toggle('tam', yoneticiMi()); }
}
function seritCiz() {
  const s = panel.querySelector('[data-serit]'); const p = [];
  if (!store.cevrimici) p.push('<div class="asistan-serit-satir uyari">İnternet yok. Yazdıkların sıraya girer, bağlantı gelince gönderilir.</div>');
  else if (giden.length) p.push(`<div class="asistan-serit-satir uyari">${giden.length} mesaj sırada, gönderiliyor…</div>`);
  if (yoneticiMi()) {
    const kisi = new Set(store.asistan.filter(m => m.yon !== 'atlas' && m.kullanici_id && m.kullanici_id !== store.ben.id).map(m => m.kullanici_id)).size;
    p.push(`<div class="asistan-serit-satir"><button type="button" class="anahtar${hepsiMod ? ' acik' : ''}" data-hepsi role="switch" aria-checked="${hepsiMod}" aria-label="Tüm konuşmalar"></button>`
      + `<span class="asistan-serit-ad" data-hepsi>Tüm konuşmalar</span><span class="asistan-serit-say">${kisi ? `${kisi} kişi daha yazdı` : 'başka yazan yok'}</span></div>`);
  }
  const html = p.join('');
  if (s.innerHTML !== html) s.innerHTML = html;
}
function onayCiz() {
  const k = panel.querySelector('[data-onay]');
  const bekleyen = yoneticiMi() ? store.istekler.filter(i => i.durum === 'onay_bekliyor').sort((a, b) => Number(a.id) - Number(b.id)) : [];
  if (!bekleyen.length) { k.innerHTML = ''; return; }
  const kaydir = k.querySelector('.asistan-onay-liste')?.scrollTop || 0;
  k.innerHTML = `<div class="asistan-onay-ust" data-onay-katla role="button" tabindex="0"><span>ONAY BEKLİYOR</span><span class="rozet-sayi">${bekleyen.length}</span><span class="asistan-katla">${onayKatli ? 'Göster' : 'Gizle'}</span></div>`
    + (onayKatli ? '' : `<div class="asistan-onay-liste">${bekleyen.map(i => `<div class="asistan-istek">`
      + `<div class="asistan-istek-ust"><b>${esc(i.isteyen_ad || 'Bir kullanıcı')}</b><span>${esc(fmt.saat(i.zaman))}</span>${riskRozet(i.risk)}</div>`
      + (i.metin ? `<div class="asistan-istek-metin">${esc(i.metin)}</div>` : '')
      + (i.plan ? `<div class="asistan-metin asistan-plan">${metinHtml(i.plan)}</div>` : '<div class="asistan-iz"><div>ATLAS henüz plan yazmadı.</div></div>')
      + kararDugmeleri(i.id) + '</div>').join('')}</div>`);
  const l = k.querySelector('.asistan-onay-liste'); if (l) l.scrollTop = kaydir;
}
function ciz({ alta = false } = {}) {
  if (!store.ben) { dugmeCiz(); return; }
  if (!panel || !acik) { dugmeCiz(); return; }
  ustCiz(); seritCiz(); onayCiz();
  const kap = panel.querySelector('[data-liste]');
  const alttaydi = kap.scrollHeight - kap.scrollTop - kap.clientHeight < 90;
  const liste = gorunen();
  const enSon = liste.reduce((a, m) => Math.max(a, Number(m.id)), 0);
  veriBagimli = false;
  kap.innerHTML = listeIcerik(liste);
  if (alta || alttaydi || ilkCizim) { kap.scrollTop = kap.scrollHeight; yeniPill(false); }
  else if (enSon > sonCizilen) yeniPill(true);
  sonCizilen = Math.max(sonCizilen, enSon); ilkCizim = false;
  // "meşgul" notu için 60 sn sınırında yeniden çiz
  clearTimeout(zamanlayici); zamanlayici = null;
  const bekleyen = liste.filter(m => m.kullanici_id === store.ben.id && bekliyorMu(m));
  if (bekleyen.length) { const kalan = BEKLEME_MS - Math.max(...bekleyen.map(m => sessizlik(m, liste))); if (kalan > 0) zamanlayici = setTimeout(() => planla(), kalan + 250); }
  gorulduIsaretle(); dugmeCiz();
}
let cizimSirada = false, cizimAlta = false;
function planla(alta = false) {
  cizimAlta = cizimAlta || alta;
  if (cizimSirada) return;
  cizimSirada = true;
  requestAnimationFrame(() => {
    cizimSirada = false; const a = cizimAlta; cizimAlta = false;
    try { ciz({ alta: a }); } catch (e) { console.error('asistan çizim', e); }
  });
}

// ---------------------------------------------------------------- canlı olaylar
function yeniMesaj(m) {
  if (!m || m.id == null || !store.ben) return;
  const yeni = !bilinenMesaj.has(m.id); bilinenMesaj.add(m.id);
  if (!yeni || m.yon !== 'atlas' || Number(m.id) <= sonGorulen) return;
  if (!benimKonusma().some(x => Number(x.id) === Number(m.id))) return;
  if (acik && !document.hidden) return;
  nabiz(); onizlemeGoster('ATLAS', atlasOzet(m));
}
function yeniIstek(i) {
  if (!i || i.id == null || !store.ben) return;
  const yeni = !bilinenIstek.has(i.id); bilinenIstek.add(i.id);
  if (!yeni || !yoneticiMi() || i.durum !== 'onay_bekliyor') return;
  if (acik && !document.hidden) return;
  nabiz(); onizlemeGoster('ONAY BEKLİYOR', kisalt(`${i.isteyen_ad || 'Bir kullanıcı'}: ${i.metin || 'yeni istek'}`, 160));
}
function dinleyicileriKur() {
  bus.on('asistan', v => { yeniMesaj(v?.mesaj); planla(); });
  bus.on('istek', v => { yeniIstek(v?.istek); planla(); });
  bus.on('baglanti', () => { if (navigator.onLine) gidenBosalt(); if (acik) planla(); });
  ['firma', 'firmalar', 'arac', 'araclar'].forEach(ad => bus.on(ad, () => { if (acik && veriBagimli) planla(); }));
  bus.on('profil', () => { if (acik && tumMod()) planla(); });
  bus.on('hazir', () => { benId = null; benHazirla(); planla(); });
  window.addEventListener('hashchange', gorunurlukGuncelle);
  window.addEventListener('online', () => gidenBosalt());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (acik) planla(); else dugmeCiz(); } });
  document.addEventListener('keydown', escYakala, true);
  setInterval(() => { if (giden.length) gidenBosalt(); }, 10000);
}

// ---------------------------------------------------------------- stil (bir kez)
function stilEkle() {
  if (document.querySelector('style[data-ekran="asistan"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'asistan';
  s.textContent = `
.atlas-dugme { transition: transform .15s ease, background .12s; -webkit-tap-highlight-color: transparent; }
.atlas-dugme:active { transform: scale(.95); }
.atlas-dugme .asistan-dugme-yazi { pointer-events: none; }
.atlas-dugme.asistan-nabiz { animation: asistan-nabiz 1.1s ease-out 3; }
@keyframes asistan-nabiz { 0% { box-shadow: var(--golge-2), 0 0 0 0 rgba(200,16,46,.55); } 100% { box-shadow: var(--golge-2), 0 0 0 18px rgba(200,16,46,0); } }
.atlas-dugme.asistan-bekliyor::before { content: ''; position: absolute; inset: -5px; border-radius: 50%; border: 2px solid transparent; border-top-color: var(--kirmizi); border-right-color: var(--kirmizi); animation: asistan-don 1s linear infinite; pointer-events: none; }
@keyframes asistan-don { to { transform: rotate(360deg); } }

.asistan-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 100vw; z-index: 85; display: flex; flex-direction: column; background: var(--yuzey); border-left: 1px solid var(--cizgi); box-shadow: var(--golge-3); transform: translateX(calc(100% + 32px)); visibility: hidden; transition: transform .24s cubic-bezier(.2,.8,.2,1), visibility 0s linear .24s; }
.asistan-panel.acik { transform: none; visibility: visible; transition: transform .24s cubic-bezier(.2,.8,.2,1), visibility 0s; }
body:has(.kabuk > .ust) .asistan-panel { top: var(--ust-h); }
.asistan-ust { display: flex; align-items: center; gap: 12px; padding: 14px 12px 12px 16px; border-bottom: 1px solid var(--cizgi); }
.asistan-logo { width: 38px; height: 38px; border-radius: 50%; background: var(--kirmizi); color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 9.5px; letter-spacing: .06em; flex: none; box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.asistan-ust-orta { flex: 1; min-width: 0; }
.asistan-baslik { font-weight: 900; font-size: 15px; letter-spacing: -.005em; }
.asistan-yetki { font-size: 12px; font-weight: 600; color: var(--metin-3); margin-top: 1px; line-height: 1.35; }
.asistan-yetki.tam b { color: var(--kirmizi); font-weight: 800; }
.asistan-serit:empty { display: none; }
.asistan-serit { border-bottom: 1px solid var(--cizgi); background: var(--yuzey-2); }
.asistan-serit-satir { display: flex; align-items: center; gap: 10px; padding: 8px 16px; font-size: 12px; font-weight: 700; color: var(--metin-2); }
.asistan-serit-satir + .asistan-serit-satir { border-top: 1px solid var(--cizgi); }
.asistan-serit-satir.uyari { background: var(--turuncu-acik); color: var(--turuncu); }
.asistan-serit-ad { cursor: pointer; user-select: none; }
.asistan-serit-say { margin-left: auto; color: var(--metin-3); font-weight: 600; }

.asistan-onay:empty { display: none; }
.asistan-onay { display: flex; flex-direction: column; max-height: 44%; border-bottom: 1px solid var(--cizgi); background: var(--amber-acik); }
.asistan-onay-ust { display: flex; align-items: center; gap: 8px; padding: 9px 16px; font-size: 11px; font-weight: 900; letter-spacing: .1em; color: var(--amber); cursor: pointer; user-select: none; }
.asistan-onay-ust .rozet-sayi { background: var(--amber); letter-spacing: 0; }
.asistan-katla { margin-left: auto; letter-spacing: 0; font-weight: 700; font-size: 12px; color: var(--metin-2); }
.asistan-onay-liste { overflow: auto; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; }
.asistan-istek { background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: 12px; padding: 10px 12px; box-shadow: var(--golge-1); font-size: 13px; }
.asistan-istek-ust { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--metin-3); font-weight: 600; }
.asistan-istek-ust b { color: var(--metin); font-weight: 800; font-size: 13px; }
.asistan-istek-metin { margin-top: 6px; font-weight: 700; white-space: pre-wrap; overflow-wrap: anywhere; }
.asistan-istek-kim { font-size: 12px; font-weight: 700; color: var(--metin-3); margin: 2px 0 2px; }

.asistan-govde { position: relative; flex: 1; min-height: 0; background: var(--zemin); }
.asistan-liste { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 14px 14px 8px; display: flex; flex-direction: column; }
.asistan-liste > :first-child { margin-top: auto; }
.asistan-gun { align-self: center; font-size: 11px; font-weight: 800; color: var(--metin-3); background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: 999px; padding: 3px 10px; margin: 4px 0 12px; }
.asistan-satir { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 10px; max-width: 100%; flex: none; }
.asistan-satir.ben { align-items: flex-end; }
.asistan-kim { font-size: 11px; font-weight: 800; color: var(--metin-3); margin: 0 6px 3px; }
.asistan-balon { max-width: 86%; padding: 9px 13px; border-radius: 18px; font-size: 13.5px; line-height: 1.45; overflow-wrap: anywhere; min-width: 0; }
.asistan-balon.genis { width: 94%; max-width: 94%; }
.asistan-metin { white-space: pre-wrap; }
.asistan-metin + .asistan-metin { margin-top: 6px; }
.asistan-satir.ben .asistan-balon { background: var(--koyu); color: #fff; border-bottom-right-radius: 6px; }
[data-tema="koyu"] .asistan-satir.ben .asistan-balon { background: #3A3D44; }
.asistan-satir.ben.baska .asistan-balon { background: var(--yuzey-3); color: var(--metin); border: 1px solid var(--cizgi-2); }
.asistan-satir.ben.sirada .asistan-balon { opacity: .6; }
.asistan-satir.atlas .asistan-balon { background: var(--yuzey); color: var(--metin); border: 1px solid var(--cizgi); border-bottom-left-radius: 6px; box-shadow: var(--golge-1); }
.asistan-balon.t-islendi { border-left: 3px solid var(--kirmizi) !important; }
.asistan-balon.t-onaya_gitti { border-left: 3px solid var(--amber) !important; }
.asistan-balon.t-plan { border-left: 3px solid var(--mor) !important; }
.asistan-balon.t-yapildi { border-left: 3px solid var(--yesil) !important; }
.asistan-balon.t-hata { border-left: 3px solid var(--turuncu) !important; background: var(--turuncu-acik) !important; }
.asistan-satir.parla .asistan-balon { animation: asistan-parla 1.8s ease-out; }
@keyframes asistan-parla { 0%, 35% { box-shadow: 0 0 0 3px var(--kirmizi-cizgi); } 100% { box-shadow: 0 0 0 0 transparent; } }
.asistan-alt { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; font-weight: 600; color: var(--metin-3); margin: 3px 6px 0; }
.asistan-atlas-ad { color: var(--kirmizi); font-weight: 900; letter-spacing: .05em; }
.asistan-d.d-isleniyor { color: var(--mavi); }
.asistan-d.d-tamam { color: var(--yesil); }
.asistan-d.d-hata, .asistan-d.d-sirada { color: var(--turuncu); }
.asistan-link { border: 0; background: none; padding: 0; font: inherit; font-weight: 800; color: var(--metin-2); text-decoration: underline; cursor: pointer; }

.asistan-etiket { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--kirmizi); margin-bottom: 6px; }
.t-onaya_gitti .asistan-etiket { color: var(--amber); }
.t-plan .asistan-etiket { color: var(--mor); }
.t-yapildi .asistan-etiket { color: var(--yesil); }
.t-hata .asistan-etiket { color: var(--turuncu); }
.asistan-ist, .asistan-risk { display: inline-flex; align-items: center; height: 19px; padding: 0 7px; border-radius: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .02em; background: var(--gri-acik); color: var(--metin-2); }
.ist-onay_bekliyor { background: var(--amber-acik); color: var(--amber); }
.ist-onaylandi { background: var(--mavi-acik); color: var(--mavi); }
.ist-yapiliyor { background: var(--mor-acik); color: var(--mor); }
.ist-yapildi { background: var(--yesil-acik); color: var(--yesil); }
.ist-hata { background: var(--turuncu-acik); color: var(--turuncu); }
.r-dusuk { background: var(--yesil-acik); color: var(--yesil); }
.r-orta { background: var(--amber-acik); color: var(--amber); }
.r-yuksek { background: var(--kirmizi); color: #fff; }
.asistan-plan { background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: 10px; padding: 8px 10px; margin-top: 6px; font-size: 13px; }
.asistan-iz { margin-top: 8px; font-size: 12px; font-weight: 600; color: var(--metin-2); display: flex; flex-direction: column; gap: 2px; }
.asistan-balon .alinti { white-space: pre-wrap; }

.asistan-degler { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.asistan-deg { background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: 10px; padding: 7px 10px; }
.asistan-deg-ust { display: flex; align-items: center; gap: 8px; min-width: 0; }
.asistan-deg-kim { font-weight: 800; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: none; max-width: 60%; }
a.asistan-deg-kim:hover { text-decoration: underline; }
.asistan-deg-unvan { font-size: 11.5px; color: var(--metin-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.asistan-deg-alt { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 5px; font-size: 12px; }
.asistan-deg-alan { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--metin-3); margin-right: 2px; }
.asistan-deger { font-weight: 700; }
.asistan-deger-bos { color: var(--metin-3); font-weight: 600 !important; font-style: italic; }
.asistan-eski { opacity: .55; display: inline-flex; }
.asistan-ok { color: var(--metin-3); font-weight: 900; }
.asistan-simdi { font-size: 11px; font-weight: 800; color: var(--turuncu); }
.asistan-simdi.donmus { color: var(--metin-3); }
.asistan-kaynak { margin-top: 8px; font-size: 11.5px; font-weight: 700; color: var(--metin-3); cursor: pointer; display: inline-block; }
.asistan-kaynak:hover { color: var(--metin); text-decoration: underline; }
.asistan-kart-eylem { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.asistan-kucuk { font-size: 11.5px; font-weight: 600; color: var(--metin-3); }
.asistan-geri-tamam { font-size: 12px; font-weight: 800; color: var(--metin-3); }

.asistan-firmalar { margin-top: 8px; border: 1px solid var(--cizgi); border-radius: 12px; overflow: hidden; background: var(--yuzey); }
.asistan-firmalar-ust { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--metin-3); background: var(--yuzey-2); border-bottom: 1px solid var(--cizgi); }
.asistan-firma { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--cizgi); cursor: pointer; outline: none; }
.asistan-firma:last-of-type { border-bottom: 0; }
.asistan-firma:hover, .asistan-firma:focus-visible { background: var(--kirmizi-acik); }
.asistan-firma-sol { flex: 1; min-width: 0; }
.asistan-firma-ad { font-weight: 800; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asistan-firma-yan { font-size: 11.5px; color: var(--metin-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asistan-firma-sag { display: flex; align-items: center; gap: 5px; flex: none; }
.asistan-tel { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--cizgi-2); background: var(--yuzey); color: var(--metin-2); }
.asistan-tel:hover { background: var(--yesil-acik); color: var(--yesil); border-color: var(--yesil); }
.asistan-firmalar-alt { display: block; width: 100%; border: 0; border-top: 1px solid var(--cizgi); background: var(--yuzey-2); padding: 8px; font-weight: 800; font-size: 12px; color: var(--metin-2); cursor: pointer; }
.asistan-firmalar-alt:hover { color: var(--kirmizi); }
.asistan-firmalar-not { padding: 6px 10px; font-size: 11px; color: var(--metin-3); text-align: center; }

.asistan-yaziyor { align-self: flex-start; display: inline-flex; align-items: center; gap: 9px; padding: 9px 14px; margin-bottom: 10px; border-radius: 18px; border-bottom-left-radius: 6px; background: var(--yuzey); border: 1px solid var(--cizgi); font-size: 12.5px; font-weight: 700; color: var(--metin-2); box-shadow: var(--golge-1); flex: none; }
.asistan-noktalar { display: inline-flex; gap: 3px; }
.asistan-noktalar i { width: 6px; height: 6px; border-radius: 50%; background: var(--kirmizi); animation: asistan-nokta 1.2s infinite ease-in-out; }
.asistan-noktalar i:nth-child(2) { animation-delay: .15s; }
.asistan-noktalar i:nth-child(3) { animation-delay: .3s; }
@keyframes asistan-nokta { 0%, 60%, 100% { transform: translateY(0); opacity: .35; } 30% { transform: translateY(-4px); opacity: 1; } }
.asistan-mesgul { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; margin-bottom: 10px; border-radius: 12px; border: 1px solid var(--amber); background: var(--amber-acik); color: var(--metin); font-size: 12.5px; flex: none; }
.asistan-mesgul b { color: var(--amber); font-weight: 800; }
.asistan-mesgul span { color: var(--metin-2); font-weight: 600; }

.asistan-bos { margin: auto 0; padding: 16px 6px 8px; text-align: center; }
.asistan-bos-logo { width: 56px; height: 56px; margin: 0 auto; border-radius: 50%; background: var(--kirmizi); color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 12px; letter-spacing: .06em; box-shadow: 0 0 0 6px var(--kirmizi-acik); }
.asistan-bos h3 { margin: 16px 0 6px; font-size: 17px; font-weight: 900; letter-spacing: -.01em; }
.asistan-bos p { margin: 0 auto 16px; max-width: 310px; color: var(--metin-2); font-size: 13px; }
.asistan-bos-etiket { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--metin-3); text-transform: uppercase; margin-bottom: 6px; }
.asistan-ornekler { display: flex; flex-direction: column; gap: 6px; max-width: 320px; margin: 0 auto; }
.asistan-ornek { text-align: left; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--cizgi-2); background: var(--yuzey); font-size: 13px; font-weight: 600; cursor: pointer; }
.asistan-ornek:hover { border-color: var(--kirmizi); background: var(--kirmizi-acik); }

.asistan-yeni { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 2; height: 30px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--kirmizi); color: #fff; font-weight: 800; font-size: 12px; box-shadow: var(--golge-2); cursor: pointer; }
.asistan-giris { border-top: 1px solid var(--cizgi); background: var(--yuzey); padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); }
.asistan-cipler { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.asistan-cipler::-webkit-scrollbar { display: none; }
.asistan-cipler .cip { flex: none; height: 28px; padding: 0 11px; }
.asistan-cipler .cip:hover { border-color: var(--kirmizi); color: var(--kirmizi); }
.asistan-kutu { display: flex; align-items: flex-end; gap: 8px; border: 1px solid var(--cizgi-2); border-radius: 16px; background: var(--yuzey); padding: 5px 5px 5px 14px; transition: border-color .12s, box-shadow .12s; }
.asistan-kutu:focus-within { border-color: var(--kirmizi); box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.asistan-kutu textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; font-size: 14px; line-height: 20px; padding: 7px 0; max-height: 132px; overflow-y: auto; }
.asistan-gonder { flex: none; width: 34px; height: 34px; border-radius: 11px; border: 0; background: var(--kirmizi); color: #fff; display: grid; place-items: center; cursor: pointer; transition: background .12s, opacity .12s; }
.asistan-gonder:hover:not(:disabled) { background: var(--kirmizi-koyu); }
.asistan-gonder:disabled { opacity: .3; cursor: default; }
.asistan-ipucu { margin-top: 6px; font-size: 11px; font-weight: 600; color: var(--metin-3); text-align: right; }

.asistan-onizleme { position: fixed; z-index: 81; width: min(320px, calc(100vw - 28px)); background: var(--yuzey); color: var(--metin); border: 1px solid var(--cizgi); border-radius: 16px; border-bottom-right-radius: 6px; box-shadow: var(--golge-2); padding: 10px 14px; cursor: pointer; animation: asistan-yukari .22s cubic-bezier(.2,.8,.2,1); }
.asistan-onizleme-ust { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--kirmizi); margin-bottom: 3px; }
.asistan-onizleme-metin { font-size: 13px; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
@keyframes asistan-yukari { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

@media (max-width: 760px) {
  .asistan-panel, body:has(.kabuk > .ust) .asistan-panel { top: 0; width: 100vw; border-left: 0; box-shadow: none; }
  .asistan-ust { padding-top: calc(12px + env(safe-area-inset-top)); }
  .asistan-balon { max-width: 88%; font-size: 14.5px; }
  .asistan-kutu textarea { font-size: 16px; }
  .asistan-ipucu { display: none; }
  .asistan-cipler { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px 8px; padding: 0 12px; -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent); mask-image: linear-gradient(90deg, #000 88%, transparent); }
  html.asistan-acik, html.asistan-acik body { overflow: hidden; }
}
@media (prefers-reduced-motion: reduce) {
  .asistan-panel, .asistan-panel.acik { transition: none; }
  .atlas-dugme.asistan-bekliyor::before, .asistan-noktalar i, .atlas-dugme.asistan-nabiz { animation: none; }
}
@media print { .asistan-panel, .asistan-onizleme { display: none !important; } }
`;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- giriş noktası
function kur() {
  if (!kuruldu) { kuruldu = true; stilEkle(); dinleyicileriKur(); }
  benHazirla();
  dugmeKur();
  gorunurlukGuncelle();
  if (acik) planla(); else dugmeCiz();
  if (giden.length) gidenBosalt();
}

export default { kur, ac, kapat };
