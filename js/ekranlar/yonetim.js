// 72. Komite · Seçim Masası · YÖNETİM PANELİ (ATLAS, 2026-09-30)
// Yalnız yönetici, masaüstü. Sol dikey menü: Kullanıcılar · Onay bekleyenler · ATLAS işlem günlüğü · Ayarlar · WhatsApp bildirimleri · Veri.
// Yazma yalnız core.js işlevleriyle (yonetim, profilleriYenile, istekKarar, ayarYaz, durumYap).
// Ek okuma: wa_gruplar (grup listesi) ve store'a sığmayan eski ATLAS olayları.
import {
  store, bus, sb, esc, fmt, trBaslik, trArama, SINIFLAR, SINIF_AD, DURUMLAR, DURUM_AD, ROL_AD,
  firmaListesi, sayac, hedefSayi, olayMetni, firmaAdi, ulasim, aracOf, simdi, simdiDk, dakika,
  ayarYaz, yonetim, profilleriYenile, istekKarar, durumYap, yoneticiMi,
} from '../core.js';
import { bas, toast, hataGoster, modal, modalKapat, onayla, kisiKartiAc, rozetSinif } from '../ui.js';

// ================================================================ ikonlar (çizgi ikon, currentColor)
const IK = {
  kullanici: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  onay: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  gunluk: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  ayar: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  mesaj: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  veri: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  kopya: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  indir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  yukle: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  anahtar: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M11.4 11.6L21 2"/><path d="M16 7l3 3"/><path d="M19 4l2 2"/>',
  cop: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  yenile: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  gonder: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  ekle: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  tamam: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  uyari: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  bilgi: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  saat: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  hedef: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  takvim: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  zil: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  grup: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  tablo: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
};
const ikon = (ad, sinif = '') => `<svg class="yon-i ${sinif}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IK[ad] || ''}</svg>`;

// ================================================================ sabitler
const SEKMELER = [
  { k: 'kullanicilar', ad: 'Kullanıcılar', ikon: 'kullanici' },
  { k: 'onay', ad: 'Onay bekleyenler', ikon: 'onay' },
  { k: 'gunluk', ad: 'ATLAS işlem günlüğü', ikon: 'gunluk' },
  { k: 'ayarlar', ad: 'Ayarlar', ikon: 'ayar' },
  { k: 'whatsapp', ad: 'WhatsApp bildirimleri', ikon: 'mesaj' },
  { k: 'veri', ad: 'Veri', ikon: 'veri' },
];
const ROL_SIRA = { yonetici: 0, masa: 1, rapor: 2, sofor: 3, bot: 4 };
const ROL_SECENEK = ['masa', 'rapor', 'sofor', 'yonetici'];
const ROL_ACIKLAMA = { masa: 'Her şeyi görür ve işaretler', rapor: 'Telefondan salt okur', sofor: 'Yalnız kendi aracı', yonetici: 'Her şey, kullanıcılar dahil' };
const RISK_AD = { dusuk: 'Düşük risk', orta: 'Orta risk', yuksek: 'Yüksek risk' };
const ISTEK_AD = { onay_bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', yapiliyor: 'Yapılıyor', yapildi: 'Yapıldı', hata: 'Hata' };
const ULASIM_AD = { servis: 'Servis', kendi: 'Kendi gelecek', yok: '' };
const WA_VARSAYILAN = {
  grup_jid: null, grup_ad: null,
  olaylar: { oy_kullandi: true, fuarda: false, geciken: false, saat_basi: true },
  mod: 'anlik',
  sablon: '✅ {saat} {yetkili} ({firma}) oy kullandı · Referans: {referans} · {kullanan}/{hedef}',
};
const WA_OLAYLAR = [
  ['oy_kullandi', 'Oy kullandı', 'Biri "oy kullandı" olarak işaretlenince'],
  ['fuarda', 'Fuara ulaştı', 'Kişi fuar alanına geldi diye işaretlenince'],
  ['geciken', 'Geciken servis', 'Taşıma saati 5 dakikadan fazla geçen ve alınmamış kişi olunca'],
  ['saat_basi', 'Saat başı özet', 'Her saat başı kullanan / hedef özeti'],
];
const WA_MODLAR = [
  ['anlik', 'Anlık', 'Her olay hemen, ayrı mesaj olarak gider'],
  ['toplu10', 'Toplu (10 dk)', '10 dakikada bir, birikenler tek mesajda'],
  ['saat_basi', 'Saat başı', 'Yalnız saat başlarında tek özet mesajı'],
];
const WA_MOD_AD = Object.fromEntries(WA_MODLAR.map(([k, ad]) => [k, ad]));
const WA_DEGISKENLER = [
  ['saat', 'İşaret saati'], ['yetkili', 'Yetkili ad soyad'], ['firma', 'Firma ünvanı'], ['referans', 'Referans'],
  ['kullanan', 'Bizim listeden oy kullanan'], ['hedef', 'Hedef'], ['ilce', 'İlçe'],
];
const WA_DURUM_AD = { bekliyor: 'Sırada', sirada: 'Sırada', gonderiliyor: 'Gidiyor', gonderildi: 'Gitti', gitti: 'Gitti', hata: 'Hata', atlandi: 'Atlandı', toplu: 'Toplu' };

// ================================================================ ekran durumu
let kok = null, sekme = 'kullanicilar', kapat = [], bekleyen = new Set(), planli = false;
// Kaydedilmemiş ayar taslakları (ekrandan çıkıp dönünce kaybolmaz)
const taslak = { zaman: null, hedef: null, whatsapp: null };
const taban = {}, cakisma = {};

// Realtime DELETE olayı store'a kimliksiz boş satır bırakabiliyor: yalnız gerçek satırlar
const istekListesi = () => store.istekler.filter(i => i && i.id != null);
const bekleyenSay = () => istekListesi().filter(i => i.durum === 'onay_bekliyor').length;
const bolumEl = () => kok?.querySelector('.yon-bolum');
const zamanMs = t => (t ? new Date(t).getTime() : 0);
const kararli = v => JSON.stringify(v ?? null, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(a => [a, x[a]])) : x));
const uygulamaAdresi = () => location.origin + location.pathname;
const waPaylas = metin => fmt.waLink('', metin) || `https://wa.me/?text=${encodeURIComponent(metin)}`;
function goreliUzun(ts) {
  if (!ts) return '';
  if (Date.now() - zamanMs(ts) < 86400000) return fmt.goreli(ts);
  const d = new Date(ts); return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${fmt.saat(d)}`;
}
async function kopyala(metin) {
  try { await navigator.clipboard.writeText(metin); }
  catch {
    const t = document.createElement('textarea'); t.value = metin; t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } finally { t.remove(); }
  }
  toast('Kopyalandı', { tur: 'basari', sure: 2500 });
}
function odakKaydet(kap) {
  const a = document.activeElement;
  if (!kap || !a || !kap.contains(a) || !a.dataset?.odak) return null;
  let s = null, e = null; try { s = a.selectionStart; e = a.selectionEnd; } catch {}
  return { k: a.dataset.odak, s, e };
}
function odakGeri(kap, o) {
  if (!o || !kap) return;
  const a = [...kap.querySelectorAll('[data-odak]')].find(x => x.dataset.odak === o.k);
  if (!a) return; a.focus({ preventScroll: true });
  try { if (o.s != null) a.setSelectionRange(o.s, o.e); } catch {}
}
const pinHtml = pin => `<div class="yon-pin" aria-label="PIN ${esc(pin)}">${[...String(pin)].map(d => `<span>${esc(d)}</span>`).join('')}</div>`;
function girisMetni(ad, pin, rol, yeniMi) {
  const ilk = trBaslik(String(ad || '').split(' ')[0]);
  const aciklama = ROL_ACIKLAMA[rol] ? ` (${ROL_ACIKLAMA[rol].charAt(0).toLocaleLowerCase('tr')}${ROL_ACIKLAMA[rol].slice(1)})` : '';
  return [
    yeniMi ? `Merhaba ${ilk}, 72. Komite Seçim Masası hesabın hazır.` : `Merhaba ${ilk}, Seçim Masası PIN'in yenilendi. Eski PIN artık çalışmaz.`,
    '',
    `Adres: ${uygulamaAdresi()}`,
    `Ad soyad: ${ad}`,
    `PIN: ${pin}`,
    `Yetki: ${ROL_AD[rol] || rol}${aciklama}`,
    '',
    'Girişte ad soyadını yaz, sonra 4 haneli PIN\'i gir. PIN\'i kimseyle paylaşma.',
    'Telefonda açınca paylaş menüsünden "Ana Ekrana Ekle" dersen uygulama gibi açılır.',
  ].join('\n');
}

// ---------------------------------------------------------------- ayar taslakları
function taslakBaslat(k, deger) {
  if (!taslak[k]) {
    taslak[k] = structuredClone(deger); taban[k] = kararli(store.ayarlar[k]); cakisma[k] = false;
    menuCiz(); kaydetSatirGuncelle(k);
  }
  return taslak[k];
}
function taslakBirak(k) { taslak[k] = null; taban[k] = null; cakisma[k] = false; menuCiz(); }
function ayarDegisti(k) {
  if (taslak[k] && kararli(store.ayarlar[k]) !== taban[k]) { cakisma[k] = true; cakismaGuncelle(k); }
}
async function ayarKaydet(k, deger) {
  taban[k] = kararli(deger);   // kendi kaydımız "başkası değiştirdi" sayılmasın
  await ayarYaz(k, deger);
  taslakBirak(k);
}
function cakismaHtml(k) {
  return cakisma[k] && taslak[k]
    ? `<div class="yon-degisti">${ikon('uyari')}<span>Bu ayar başka bir oturumda değişti. Kaydedersen onun üzerine yazılır.</span><button class="btn btn-kucuk" data-taslak-at="${k}">Yeni hali göster</button></div>`
    : '';
}
function cakismaGuncelle(k) { const c = kok?.querySelector(`[data-cakisma="${k}"]`); if (c) c.innerHTML = cakismaHtml(k); }
function kaydetSatirIc(k) {
  const kirli = !!taslak[k];
  return `<span class="durum ${kirli ? 'kirli' : ''}">${kirli ? 'Kaydedilmemiş değişiklik var' : 'Kayıtlı, herkese uygulanıyor'}</span>
    ${kirli ? `<button class="btn btn-hayalet btn-kucuk" data-vazgec="${k}">Vazgeç</button>` : ''}
    <button class="btn btn-koyu ${k === 'whatsapp' ? '' : 'btn-kucuk'}" data-kaydet="${k}" ${kirli ? '' : 'disabled'}>Kaydet</button>`;
}
function kaydetSatirGuncelle(k) { const s = kok?.querySelector(`[data-kaydet-satir="${k}"]`); if (s) s.innerHTML = kaydetSatirIc(k); }
function hataYaz(sec, metin) { const h = kok?.querySelector(sec); if (h) h.textContent = metin; }

// ================================================================ 1) KULLANICILAR
const yeni = { ad: '', rol: 'masa', arac: '', sonuc: null, mesgul: false, hata: '' };
const islemde = new Set();

function kullaniciSatir(p) {
  const ben = p.id === store.ben?.id, bot = p.rol === 'bot', is = islemde.has(p.id);
  const soforArac = p.rol === 'sofor' ? [...store.araclar.values()].filter(a => a.sofor_kullanici === p.id) : [];
  const alt = bot ? 'Sistem hesabı (bildirim ve ATLAS)'
    : p.rol === 'sofor' ? (soforArac.length ? `Araç: ${soforArac.map(a => fmt.plaka(a.plaka)).join(', ')}` : 'Araç bağlı değil') : '';
  const islem = bot ? '<span class="zayif">İşlem yapılamaz</span>' : `
    ${is ? '<span class="yon-donen" title="İşleniyor"></span>' : ''}
    <button class="btn btn-kucuk" data-islem="pin" ${is ? 'disabled' : ''} title="Yeni PIN üret">${ikon('anahtar')} PIN sıfırla</button>
    <select class="girdi yon-rol-sec" data-rol-sec ${ben || is ? 'disabled' : ''} title="${ben ? 'Kendi rolünü değiştiremezsin' : 'Rolü değiştir'}" aria-label="Rol">${ROL_SECENEK.map(r => `<option value="${r}" ${r === p.rol ? 'selected' : ''}>${esc(ROL_AD[r])}</option>`).join('')}</select>
    <button class="btn btn-kucuk" data-islem="aktiflik" ${ben || is ? 'disabled' : ''} ${ben ? 'title="Kendini pasifleştiremezsin"' : ''}>${p.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
    <button class="btn btn-kucuk btn-hayalet btn-ikon yon-sil" data-islem="sil" ${ben || is ? 'disabled' : ''} title="${ben ? 'Kendini silemezsin' : 'Kullanıcıyı sil'}" aria-label="Sil">${ikon('cop')}</button>`;
  return `<tr data-kid="${esc(p.id)}" class="${bot ? 'yon-bot' : ''} ${p.aktif ? '' : 'yon-pasif'}">
    <td><div class="yon-kisi"><div class="avatar ${bot ? 'bot' : ''}">${esc(bas(p.ad_soyad))}</div><div style="min-width:0"><div class="kalin">${esc(p.ad_soyad)}${ben ? '<span class="yon-sen">sen</span>' : ''}</div>${alt ? `<div class="zayif">${esc(alt)}</div>` : ''}</div></div></td>
    <td><span class="rozet yon-rol r-${esc(p.rol)}">${esc(ROL_AD[p.rol] || p.rol)}</span></td>
    <td>${p.aktif ? '<span class="yon-nokta acik">Aktif</span>' : '<span class="yon-nokta">Pasif</span>'}</td>
    <td class="zayif" title="${p.son_giris ? esc(new Date(p.son_giris).toLocaleString('tr-TR')) : ''}">${p.son_giris ? esc(goreliUzun(p.son_giris)) : 'Hiç girmedi'}</td>
    <td><div class="yon-islem">${islem}</div></td>
  </tr>`;
}
function tabloCiz(zorla = false) {
  const kap = kok?.querySelector('[data-k-tablo]'); if (!kap) return;
  if (!zorla && kap.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;  // açık rol menüsünü bozma
  const liste = [...store.profiller.values()].sort((a, b) => (Number(b.aktif) - Number(a.aktif)) || ((ROL_SIRA[a.rol] ?? 9) - (ROL_SIRA[b.rol] ?? 9)) || String(a.ad_soyad).localeCompare(String(b.ad_soyad), 'tr'));
  const insan = liste.filter(p => p.rol !== 'bot');
  const oz = kok.querySelector('[data-k-ozet]'); if (oz) oz.textContent = `${insan.length} kişi · ${insan.filter(p => p.aktif).length} aktif`;
  kap.innerHTML = liste.length
    ? `<div class="tablo-kap yon-tablo"><table class="tablo"><thead><tr><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th>Son giriş</th><th style="text-align:right">İşlemler</th></tr></thead><tbody>${liste.map(kullaniciSatir).join('')}</tbody></table></div>`
    : '<div class="bos">Henüz kullanıcı yok. Sağdaki formdan ilk üyeyi oluştur.</div>';
}
function yeniCiz() {
  const kap = kok?.querySelector('[data-yeni]'); if (!kap) return;
  if (yeni.sonuc) {
    const r = yeni.sonuc, metin = girisMetni(r.ad_soyad, r.pin, r.rol, true);
    kap.innerHTML = `<div class="kart-baslik">${ikon('tamam')} Üye hazır</div>
    <div class="kart-govde">
      <div class="yon-hazir-kim"><div class="avatar">${esc(bas(r.ad_soyad))}</div><div><div class="kalin" style="font-size:15px">${esc(r.ad_soyad)}</div><span class="rozet yon-rol r-${esc(r.rol)}">${esc(ROL_AD[r.rol] || r.rol)}</span></div></div>
      ${pinHtml(r.pin)}
      <div class="yon-not-kucuk yon-vurgu">${ikon('uyari')}<span>PIN yalnız şimdi görünür. Bu kartı kapatmadan önce gönder ya da kopyala.</span></div>
      <div class="etiket" style="margin-top:14px">Giriş bilgisi</div>
      <pre class="yon-metin">${esc(metin)}</pre>
      <div class="yon-dugmeler">
        <button class="btn" data-yeni-kopyala>${ikon('kopya')} Kopyala</button>
        <a class="btn btn-yesil" target="_blank" rel="noopener" href="${esc(waPaylas(metin))}">${ikon('gonder')} Giriş bilgisini WhatsApp'la gönder</a>
      </div>
      <button class="btn btn-hayalet" style="width:100%;margin-top:10px" data-yeni-tekrar>${ikon('ekle')} Yeni üye ekle</button>
    </div>`;
    return;
  }
  const araclar = [...store.araclar.values()].sort((a, b) => fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr'));
  kap.innerHTML = `<div class="kart-baslik">${ikon('ekle')} Hızlı üye oluştur</div>
  <div class="kart-govde">
    <label class="etiket" for="yon-yeni-ad">Ad soyad</label>
    <input id="yon-yeni-ad" class="girdi" data-yeni-ad data-odak="yeni-ad" value="${esc(yeni.ad)}" placeholder="Ör. Ayşe Kaya" autocomplete="off" autocapitalize="words" ${yeni.mesgul ? 'disabled' : ''}>
    <div class="etiket" style="margin-top:14px">Rol</div>
    <div class="yon-secenekler">${ROL_SECENEK.map(r => `<label class="yon-secenek ${yeni.rol === r ? 'secili' : ''}"><input type="radio" name="yon-yeni-rol" value="${r}" ${yeni.rol === r ? 'checked' : ''}><b>${esc(ROL_AD[r])}</b><span>${esc(ROL_ACIKLAMA[r])}</span></label>`).join('')}</div>
    ${yeni.rol === 'sofor' ? `
      <label class="etiket" style="margin-top:14px">Aracı <span style="font-weight:500;color:var(--metin-3)">(isteğe bağlı)</span></label>
      <select class="girdi" data-yeni-arac>
        <option value="">Sonra bağlanacak</option>
        ${araclar.map(a => { const bagli = a.sofor_kullanici ? store.profiller.get(a.sofor_kullanici) : null; return `<option value="${a.id}" ${String(a.id) === String(yeni.arac) ? 'selected' : ''}>${esc(fmt.plaka(a.plaka))}${a.sofor_ad ? ' · ' + esc(trBaslik(a.sofor_ad)) : ''}${bagli ? ` (şu an: ${esc(bagli.ad_soyad)})` : ''}</option>`; }).join('')}
      </select>` : ''}
    <div class="hata-yazi" data-yeni-hata>${esc(yeni.hata)}</div>
    <button class="btn btn-kirmizi btn-buyuk" style="width:100%" data-yeni-olustur ${yeni.mesgul ? 'disabled' : ''}>${yeni.mesgul ? 'Oluşturuluyor…' : 'Oluştur ve PIN ver'}</button>
    <div class="yon-not-kucuk" style="margin-top:12px">${ikon('bilgi')}<span>PIN otomatik üretilir ve yalnız bir kez gösterilir. Unutulursa listeden "PIN sıfırla".</span></div>
  </div>`;
}
async function uyeOlustur() {
  if (yeni.mesgul) return;
  const ad = trBaslik(yeni.ad.trim().replace(/\s+/g, ' '));
  const hata = m => { yeni.hata = m; hataYaz('[data-yeni-hata]', m); kok?.querySelector('[data-yeni-ad]')?.focus(); };
  if (ad.split(' ').length < 2 || ad.length < 5) return hata('Ad ve soyadı birlikte yaz');
  if ([...store.profiller.values()].some(p => trArama(p.ad_soyad) === trArama(ad))) return hata('Bu ad soyadla bir hesap zaten var. Girişte ad kullanıldığı için her ad tek olmalı.');
  yeni.mesgul = true; yeni.hata = ''; yeniCiz();
  try {
    const govde = { ad_soyad: ad, rol: yeni.rol };
    if (yeni.rol === 'sofor' && yeni.arac) govde.arac_id = Number(yeni.arac);
    const r = await yonetim('olustur', govde);
    if (!r?.pin) throw new Error('PIN alınamadı, listeden "PIN sıfırla" ile yeniden üret');
    yeni.sonuc = { ad_soyad: r.ad_soyad || ad, rol: r.rol || yeni.rol, pin: r.pin };
    yeni.ad = ''; yeni.arac = '';
    toast(`${yeni.sonuc.ad_soyad} oluşturuldu`, { tur: 'basari' });
    profilleriYenile().catch(e => console.warn('profiller', e));
  } catch (e) { yeni.hata = e.message || String(e); }
  finally { yeni.mesgul = false; yeniCiz(); }
}
function pinModal(p, pin) {
  const metin = girisMetni(p.ad_soyad, pin, p.rol, false);
  const m = modal(`Yeni PIN · ${p.ad_soyad}`, `
    ${pinHtml(pin)}
    <div class="yon-not-kucuk yon-vurgu" style="justify-content:center">${ikon('uyari')}<span>Bu PIN yalnız şimdi görünür. Eski PIN artık çalışmaz.</span></div>
    <div class="etiket" style="margin-top:14px">Gönderilecek metin</div>
    <pre class="yon-metin">${esc(metin)}</pre>`,
  `<button class="btn" data-kopyala>${ikon('kopya')} Kopyala</button><a class="btn btn-yesil" target="_blank" rel="noopener" href="${esc(waPaylas(metin))}">${ikon('gonder')} WhatsApp'la gönder</a><button class="btn btn-koyu" data-kapat>Tamam</button>`);
  // PIN bir daha gösterilmez: arka plana yanlışlıkla tıklamak kapatmasın
  m.addEventListener('click', e => { if (e.target === m) e.stopImmediatePropagation(); }, true);
  m.querySelector('[data-kopyala]').onclick = () => kopyala(metin);
}
async function kullaniciIslem(islem, id, elm) {
  const p = store.profiller.get(id); if (!p || p.rol === 'bot' || islemde.has(id)) return;
  const ad = p.ad_soyad;
  let basladi = false;
  try {
    if (islem === 'pin') {
      if (!(await onayla(`${ad} için yeni PIN üretilsin mi? Eski PIN hemen geçersiz olur.`, { evet: 'Yeni PIN üret' }))) return;
      islemde.add(id); basladi = true; tabloCiz(true);
      const r = await yonetim('pin_sifirla', { id });
      pinModal(p, r.pin);
    } else if (islem === 'aktiflik') {
      const aktif = !p.aktif;
      if (!aktif && !(await onayla(`${ad} pasifleştirilsin mi? Bir daha giriş yapamaz; istediğinde yeniden aktifleştirebilirsin.`, { evet: 'Pasifleştir', tehlike: true }))) return;
      islemde.add(id); basladi = true; tabloCiz(true);
      await yonetim('aktiflik', { id, aktif }); await profilleriYenile();
      toast(aktif ? `${ad} aktifleştirildi` : `${ad} pasifleştirildi`, { tur: 'basari' });
    } else if (islem === 'rol') {
      const rol = elm.value; elm.value = p.rol;   // onaylanana kadar eski rol görünsün
      if (rol === p.rol) return;
      if (rol === 'yonetici' && !(await onayla(`${ad} yönetici olsun mu? Kullanıcıları, ayarları ve ATLAS onaylarını yönetebilir.`, { evet: 'Yönetici yap' }))) return;
      islemde.add(id); basladi = true; tabloCiz(true);
      await yonetim('rol', { id, rol }); await profilleriYenile();
      toast(`${ad} artık ${ROL_AD[rol]}`, { tur: 'basari' });
    } else if (islem === 'sil') {
      if (!(await onayla(`${ad} kalıcı olarak silinsin mi? Hesabı ve PIN'i yok olur, bu geri alınamaz.`, { evet: 'Kalıcı olarak sil', tehlike: true }))) return;
      islemde.add(id); basladi = true; tabloCiz(true);
      await yonetim('sil', { id }); store.profiller.delete(id); await profilleriYenile();
      toast(`${ad} silindi`);
    }
  } catch (e) { hataGoster(e); }
  finally { islemde.delete(id); if (basladi || islem === 'rol') tabloCiz(true); }
}
const kullanicilar = {
  kur(b) {
    b.addEventListener('click', e => {
      const t = e.target.closest('[data-islem],[data-yeni-olustur],[data-yeni-tekrar],[data-yeni-kopyala]'); if (!t) return;
      if (t.dataset.islem) kullaniciIslem(t.dataset.islem, t.closest('[data-kid]')?.dataset.kid, t);
      else if ('yeniOlustur' in t.dataset) uyeOlustur();
      else if ('yeniTekrar' in t.dataset) { yeni.sonuc = null; yeniCiz(); kok?.querySelector('[data-yeni-ad]')?.focus(); }
      else if ('yeniKopyala' in t.dataset && yeni.sonuc) kopyala(girisMetni(yeni.sonuc.ad_soyad, yeni.sonuc.pin, yeni.sonuc.rol, true));
    });
    b.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-rol-sec]')) kullaniciIslem('rol', t.closest('[data-kid]')?.dataset.kid, t);
      else if (t.name === 'yon-yeni-rol') { yeni.rol = t.value; yeniCiz(); }
      else if (t.matches('[data-yeni-arac]')) yeni.arac = t.value;
    });
    b.addEventListener('input', e => {
      if (!e.target.matches('[data-yeni-ad]')) return;
      yeni.ad = e.target.value;
      if (yeni.hata) { yeni.hata = ''; hataYaz('[data-yeni-hata]', ''); }
    });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-yeni-ad]')) { e.preventDefault(); uyeOlustur(); } });
  },
  ciz(b) {
    b.innerHTML = `
      <div class="yon-bolum-baslik"><h2>Kullanıcılar</h2><span class="alt">Giriş ad soyad + 4 haneli PIN ile. PIN'ler saklanmaz, yalnız üretildiği an gösterilir.</span></div>
      <div class="yon-iki">
        <div class="kart yon-kart-tablo"><div class="kart-baslik">${ikon('kullanici')} Ekip <span class="alt" data-k-ozet></span></div><div data-k-tablo></div></div>
        <div class="kart yon-yeni" data-yeni></div>
      </div>`;
    tabloCiz(true); yeniCiz();
  },
  yenile(s) {
    if (['profil', 'arac', 'araclar', 'saat', 'hazir'].some(x => s.has(x))) tabloCiz(false);
    if (yeni.rol === 'sofor' && !yeni.sonuc && ['arac', 'araclar', 'profil'].some(x => s.has(x)) && !kok?.querySelector('[data-yeni]')?.contains(document.activeElement)) yeniCiz();
  },
};

// ================================================================ 2) ONAY BEKLEYENLER
const notTaslak = new Map(), kararda = new Set();
let gecmisHepsi = false;

function istekDegisiklikleri(i) {
  const m = store.asistan.find(x => x.veri?.istek_id != null && Number(x.veri.istek_id) === Number(i.id) && Array.isArray(x.veri?.degisiklikler) && x.veri.degisiklikler.length);
  return m ? m.veri.degisiklikler : [];
}
function degisiklikMetni(d) {
  const f = d.firma_id ? store.firmalar.get(Number(d.firma_id)) : null, a = d.arac_id ? store.araclar.get(Number(d.arac_id)) : null;
  const kim = f ? firmaAdi(f) : a ? fmt.plaka(a.plaka) : d.firma_id ? `Firma #${d.firma_id}` : d.arac_id ? `Araç #${d.arac_id}` : '';
  const ALAN = { durum: 'durum', oy_sinifi: 'sınıf', arac_id: 'araç', notlar: 'not', kendi_geldi: 'kendi geldi', tasima_saati: 'taşıma saati', durum_arac: 'araç durumu' };
  const deger = v => {
    if (v == null || v === '') return 'boş';
    if (d.alan === 'durum') { const [k, kendi] = String(v).split('+'); return (DURUM_AD[k] || k) + (kendi ? ' (kendi)' : ''); }
    if (d.alan === 'oy_sinifi') return SINIF_AD[v] || v;
    if (d.alan === 'arac_id') { const x = store.araclar.get(Number(v)); return x ? fmt.plaka(x.plaka) : String(v); }
    if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
    return String(v);
  };
  if (d.alan === 'notlar') return `${kim} · not: ${String(d.yeni || '').split('\n').pop()}`;
  return `${kim} · ${ALAN[d.alan] || d.alan}: ${deger(d.eski)} → ${deger(d.yeni)}`;
}
function istekKart(i) {
  const p = store.profiller.get(i.isteyen_id), rol = p?.rol, is = kararda.has(i.id);
  const ad = i.isteyen_ad || p?.ad_soyad || 'Bilinmeyen';
  const deg = istekDegisiklikleri(i);
  return `<article class="yon-istek risk-${esc(i.risk || 'yok')}" data-istek="${i.id}">
    <header class="yon-istek-ust">
      <div class="avatar">${esc(bas(ad))}</div>
      <div style="min-width:0"><div class="kalin">${esc(ad)}</div><div class="zayif">${rol ? esc(ROL_AD[rol] || rol) + ' · ' : ''}${esc(fmt.saat(i.zaman))} · ${esc(fmt.goreli(i.zaman))}</div></div>
      <div class="yon-istek-sag">${i.risk ? `<span class="rozet yon-risk ${esc(i.risk)}">${esc(RISK_AD[i.risk] || i.risk)}</span>` : ''}<span class="zayif">#${esc(i.id)}</span></div>
    </header>
    <div class="yon-istek-govde">
      <div class="bolum-baslik">İstek</div>
      <div class="yon-istek-metin">${esc(i.metin || '')}</div>
      ${i.plan ? `<div class="bolum-baslik yon-atlas-baslik">ATLAS'ın planı</div><div class="yon-plan">${esc(i.plan)}</div>` : ''}
      ${deg.length ? `<div class="bolum-baslik">Değişecek ${deg.length} kayıt</div><ul class="yon-degisiklik">${deg.slice(0, 12).map(d => `<li${d.firma_id ? ` data-firma="${esc(d.firma_id)}"` : ''}>${esc(degisiklikMetni(d))}</li>`).join('')}${deg.length > 12 ? `<li class="zayif">ve ${deg.length - 12} kayıt daha</li>` : ''}</ul>` : ''}
      <input class="girdi" data-not="${i.id}" data-odak="not-${i.id}" placeholder="Not (isteğe bağlı; reddedersen nedenini yaz)" value="${esc(notTaslak.get(i.id) || '')}" ${is ? 'disabled' : ''}>
      <div class="yon-karar">
        <button class="btn btn-buyuk yon-reddet" data-karar="red" ${is ? 'disabled' : ''}>Reddet</button>
        <button class="btn btn-buyuk btn-yesil" data-karar="onay" ${is ? 'disabled' : ''}>${is ? 'Kaydediliyor…' : `${ikon('tamam')} Onayla`}</button>
      </div>
    </div>
  </article>`;
}
function kararSatiri(i) {
  if (!i.onaylayan) return '';
  return `<div class="zayif">${i.durum === 'reddedildi' ? 'Reddeden' : 'Onaylayan'}: ${esc(i.onaylayan)}${i.onay_zamani ? ' · ' + esc(fmt.saat(i.onay_zamani)) : ''}${i.onay_notu ? ` · Not: ${esc(i.onay_notu)}` : ''}</div>`;
}
function gecmisSatir(i) {
  return `<div class="yon-gecmis">
    <div class="yon-gecmis-ust"><span class="rozet yon-ist ${esc(i.durum)}">${esc(ISTEK_AD[i.durum] || i.durum)}</span>${i.risk ? `<span class="rozet yon-risk ${esc(i.risk)}">${esc(RISK_AD[i.risk] || i.risk)}</span>` : ''}<span class="kalin">${esc(i.isteyen_ad || '')}</span><span class="zayif">${esc(fmt.saat(i.zaman))}</span><span class="zayif" style="margin-left:auto">#${esc(i.id)}</span></div>
    <div class="yon-gecmis-metin">${esc(i.metin || '')}</div>
    ${kararSatiri(i)}
    ${i.sonuc ? `<div class="yon-sonuc ${i.durum === 'hata' ? 'hata' : ''}">${esc(i.sonuc)}</div>` : ''}
  </div>`;
}
function redNedeni(i) {
  return new Promise(res => {
    let bitti = false;
    const son = v => { if (bitti) return; bitti = true; gozcu.disconnect(); modalKapat(); res(v); };
    const m = modal('İsteği reddet', `
      <div class="alinti" style="margin:0 0 12px">${esc(i.metin || '')}</div>
      <label class="etiket" for="yon-red-neden">Neden? (isteğe bağlı, kayda geçer)</label>
      <textarea id="yon-red-neden" class="girdi" data-neden rows="3" placeholder="Ör. Önce referansıyla konuşalım"></textarea>`,
    '<button class="btn" data-h>Vazgeç</button><button class="btn btn-koyu" data-e>Reddet</button>');
    const gozcu = new MutationObserver(() => { if (!m.isConnected) son(null); });   // ✕, Esc ya da arka plan = vazgeç
    gozcu.observe(document.getElementById('katman'), { childList: true });
    m.querySelector('[data-neden]').focus();
    m.querySelector('[data-h]').onclick = () => son(null);
    m.querySelector('[data-e]').onclick = () => son(m.querySelector('[data-neden]').value.trim());
  });
}
async function karar(id, onayMi) {
  const i = istekListesi().find(x => x.id === id);
  if (!i || i.durum !== 'onay_bekliyor') return toast('Bu istek artık onay beklemiyor');
  let not = (notTaslak.get(id) || '').trim();
  if (onayMi && i.risk === 'yuksek' && !(await onayla('Bu istek yüksek riskli. ATLAS planı olduğu gibi uygulayacak. Onaylıyor musun?', { evet: 'Evet, onayla', tehlike: true }))) return;
  if (!onayMi && !not) { const r = await redNedeni(i); if (r === null) return; not = r; }
  kararda.add(id); if (sekme === 'onay') onay.ciz(bolumEl());
  try {
    await istekKarar(id, onayMi, not);
    notTaslak.delete(id);
    toast(onayMi ? `İstek #${id} onaylandı, ATLAS uyguluyor` : `İstek #${id} reddedildi`, { tur: onayMi ? 'basari' : '' });
  } catch (e) { hataGoster(e); }
  finally { kararda.delete(id); if (sekme === 'onay') onay.ciz(bolumEl()); menuCiz(); }
}
const onay = {
  kur(b) {
    b.addEventListener('input', e => { if (e.target.matches('[data-not]')) notTaslak.set(Number(e.target.dataset.not), e.target.value); });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-not]')) e.preventDefault(); });
    b.addEventListener('click', e => {
      const k = e.target.closest('[data-karar]');
      if (k) return karar(Number(k.closest('[data-istek]').dataset.istek), k.dataset.karar === 'onay');
      const f = e.target.closest('[data-firma]'); if (f) return kisiKartiAc(Number(f.dataset.firma));
      if (e.target.closest('[data-gecmis-hepsi]')) { gecmisHepsi = true; onay.ciz(b); }
    });
  },
  ciz(b) {
    if (!b) return;
    const odak = odakKaydet(b);
    const bekleyenler = istekListesi().filter(i => i.durum === 'onay_bekliyor');
    const gecmis = istekListesi().filter(i => i.durum !== 'onay_bekliyor');
    const gorunen = gecmisHepsi ? gecmis : gecmis.slice(0, 30);
    b.innerHTML = `
      <div class="yon-bolum-baslik"><h2>Onay bekleyenler</h2><span class="alt">ATLAS onay gerektiren bir iş isteyince burada bekler; sen onaylamadan uygulanmaz.</span></div>
      ${bekleyenler.length ? `<div class="yon-istekler">${bekleyenler.map(istekKart).join('')}</div>`
      : `<div class="kart"><div class="bos yon-bos">${ikon('onay', 'buyuk')}<div class="kalin" style="color:var(--metin)">Onay bekleyen istek yok</div><div>ATLAS onay isteyen bir iş getirdiğinde burada kart olarak çıkar, üst menüde sayı görünür.</div></div></div>`}
      <div class="yon-bolum-baslik" style="margin-top:26px"><h3>Geçmiş istekler</h3><span class="alt">${gecmis.length} istek</span></div>
      ${gecmis.length ? `<div class="kart yon-gecmis-liste">${gorunen.map(gecmisSatir).join('')}${gecmis.length > gorunen.length ? `<button class="btn btn-hayalet yon-daha" data-gecmis-hepsi>Tümünü göster (${gecmis.length})</button>` : ''}</div>`
      : '<div class="kart"><div class="bos">Henüz karar verilmiş istek yok.</div></div>'}`;
    odakGeri(b, odak);
  },
  yenile(s) { if (['istek', 'asistan', 'profil', 'saat', 'hazir'].some(x => s.has(x))) onay.ciz(bolumEl()); },
};

// ================================================================ 3) ATLAS İŞLEM GÜNLÜĞÜ
const gunluk = { ek: new Map(), yuklendi: false, yukleniyor: false, filtre: 'hepsi', ara: '', sinir: 60, acik: new Set(), zamanlayici: null };

async function gunlukYukle() {
  gunluk.yukleniyor = true;
  try {
    const { data, error } = await sb.from('olaylar').select('*').eq('kaynak', 'asistan').order('zaman', { ascending: false }).limit(1500);
    if (error) throw error;
    (data || []).forEach(o => gunluk.ek.set(o.id, o));
  } catch (e) { console.warn('ATLAS günlüğü eski kayıtlar', e); }
  finally { gunluk.yukleniyor = false; gunluk.yuklendi = true; if (sekme === 'gunluk') gunlukListe(); }
}
function gunlukKayitlari() {
  const olaylar = new Map(gunluk.ek);
  for (const o of store.olaylar) if (o.kaynak === 'asistan') olaylar.set(o.id, o);
  const sirali = [...olaylar.values()].sort((a, b) => zamanMs(b.zaman) - zamanMs(a.zaman) || b.id - a.id);
  const kayit = [];
  // Aynı mesajdan (aynı kaynak_metin) 3 dakika içinde yapılan değişiklikler tek satırda toplanır
  for (const o of sirali) {
    const son = kayit[kayit.length - 1], metin = o.kaynak_metin || '';
    if (son && son.tur === 'olay' && son.metin === metin && son.kim === (o.kim_ad || '') && zamanMs(son.enEski) - zamanMs(o.zaman) < 180000) { son.olaylar.push(o); son.enEski = o.zaman; }
    else kayit.push({ tur: 'olay', anahtar: 'o' + o.id, zaman: o.zaman, enEski: o.zaman, metin, kim: o.kim_ad || '', olaylar: [o] });
  }
  for (const i of istekListesi()) kayit.push({ tur: 'istek', anahtar: 'i' + i.id, zaman: i.onay_zamani || i.zaman, istek: i });
  return kayit.sort((a, b) => zamanMs(b.zaman) - zamanMs(a.zaman));
}
function kayitMetni(k) {
  if (k.tur === 'istek') { const i = k.istek; return [i.metin, i.plan, i.sonuc, i.isteyen_ad, i.onay_notu, ISTEK_AD[i.durum]].join(' '); }
  return [k.metin, k.kim, ...k.olaylar.map(o => { const f = o.firma_id ? store.firmalar.get(o.firma_id) : null; return `${olayMetni(o)} ${f?.unvan || ''} ${f?.referans || ''}`; })].join(' ');
}
function gunlukOlay(k, yazan) {
  const n = k.olaylar.length, acik = gunluk.acik.has(k.anahtar), gorunen = acik ? k.olaylar : k.olaylar.slice(0, 6);
  const kimYazdi = yazan.get(k.metin.trim());
  return `<div class="yon-log">
    <div class="yon-log-saat">${esc(fmt.saat(k.zaman))}<span>${esc(fmt.goreli(k.zaman))}</span></div>
    <div class="yon-log-govde">
      <div class="yon-log-ust"><span class="kaynak-cip atlas">ATLAS</span><b>${n} değişiklik</b>${kimYazdi ? `<span class="zayif">Mesajı yazan: ${esc(kimYazdi)}</span>` : k.kim ? `<span class="zayif">Hesap: ${esc(k.kim)}</span>` : ''}</div>
      ${k.metin ? `<div class="alinti">${esc(k.metin)}</div>` : '<div class="zayif" style="font-size:12px">Kaynak mesaj kaydedilmemiş</div>'}
      <ul class="yon-log-liste">${gorunen.map(o => `<li${o.firma_id ? ` data-firma="${esc(o.firma_id)}" title="Kişi kartını aç"` : ''}>${esc(olayMetni(o))}</li>`).join('')}</ul>
      ${n > 6 ? `<button class="btn btn-hayalet btn-kucuk" data-gac="${k.anahtar}">${acik ? 'Daha az göster' : `${n - 6} değişiklik daha`}</button>` : ''}
    </div>
  </div>`;
}
function gunlukIstek(k) {
  const i = k.istek;
  return `<div class="yon-log">
    <div class="yon-log-saat">${esc(fmt.saat(k.zaman))}<span>${esc(fmt.goreli(k.zaman))}</span></div>
    <div class="yon-log-govde">
      <div class="yon-log-ust"><span class="rozet yon-ist ${esc(i.durum)}">${esc(ISTEK_AD[i.durum] || i.durum)}</span><b>İstek #${esc(i.id)}</b><span class="zayif">${esc(i.isteyen_ad || '')}</span>${i.risk ? `<span class="rozet yon-risk ${esc(i.risk)}">${esc(RISK_AD[i.risk] || i.risk)}</span>` : ''}${i.durum === 'onay_bekliyor' ? '<button class="btn btn-kucuk" data-git-onay>Onaya git</button>' : ''}</div>
      <div class="alinti">${esc(i.metin || '')}</div>
      <div style="margin-top:6px">${kararSatiri(i)}</div>
      ${i.sonuc ? `<div class="yon-sonuc ${i.durum === 'hata' ? 'hata' : ''}">${esc(i.sonuc)}</div>` : ''}
    </div>
  </div>`;
}
function gunlukListe() {
  const b = bolumEl(), kap = b?.querySelector('[data-g-liste]'); if (!kap) return;
  const hepsi = gunlukKayitlari();
  const yazan = new Map(); store.asistan.forEach(m => { if (m.yon === 'kullanici' && m.metin) yazan.set(m.metin.trim(), m.kullanici_ad); });
  const sayi = { hepsi: hepsi.length, olay: hepsi.filter(k => k.tur === 'olay').length, istek: hepsi.filter(k => k.tur === 'istek').length };
  const cip = b.querySelector('[data-g-cipler]');
  if (cip) cip.innerHTML = [['hepsi', 'Hepsi'], ['olay', 'Değişiklikler'], ['istek', 'İstekler']].map(([k, ad]) => `<button class="cip ${gunluk.filtre === k ? 'aktif' : ''}" data-gfiltre="${k}">${ad} <span class="say">${sayi[k]}</span></button>`).join('');
  let liste = gunluk.filtre === 'hepsi' ? hepsi : hepsi.filter(k => k.tur === gunluk.filtre);
  const q = trArama(gunluk.ara);
  if (q) { const parca = q.split(' '); liste = liste.filter(k => { const t = trArama(kayitMetni(k)); return parca.every(p => t.includes(p)); }); }
  const gorunen = liste.slice(0, gunluk.sinir);
  kap.innerHTML = gorunen.length
    ? gorunen.map(k => (k.tur === 'olay' ? gunlukOlay(k, yazan) : gunlukIstek(k))).join('') + (liste.length > gorunen.length ? `<button class="btn btn-hayalet yon-daha" data-gdaha>Daha eski kayıtlar (${liste.length - gorunen.length})</button>` : '')
    : `<div class="bos yon-bos">${ikon('gunluk', 'buyuk')}<div class="kalin" style="color:var(--metin)">${q ? 'Aramaya uyan kayıt yok' : 'ATLAS henüz bir değişiklik yapmadı'}</div><div>${q ? 'Başka bir kelime dene.' : 'ATLAS\'a yazılan mesajlarla yapılan her işaret, kaynak mesajıyla birlikte burada görünür.'}</div></div>`;
  if (!gunluk.yuklendi) kap.insertAdjacentHTML('beforeend', '<div class="yon-yukleniyor">Eski kayıtlar yükleniyor…</div>');
}
const gunlukBolum = {
  kur(b) {
    b.addEventListener('click', e => {
      const f = e.target.closest('[data-gfiltre]'); if (f) { gunluk.filtre = f.dataset.gfiltre; gunluk.sinir = 60; return gunlukListe(); }
      if (e.target.closest('[data-gdaha]')) { gunluk.sinir += 60; return gunlukListe(); }
      const ac = e.target.closest('[data-gac]'); if (ac) { const k = ac.dataset.gac; gunluk.acik.has(k) ? gunluk.acik.delete(k) : gunluk.acik.add(k); return gunlukListe(); }
      if (e.target.closest('[data-git-onay]')) return sekmeAc('onay');
      const fi = e.target.closest('[data-firma]'); if (fi) kisiKartiAc(Number(fi.dataset.firma));
    });
    b.addEventListener('input', e => {
      if (!e.target.matches('[data-gara]')) return;
      gunluk.ara = e.target.value; clearTimeout(gunluk.zamanlayici);
      gunluk.zamanlayici = setTimeout(() => { gunluk.sinir = 60; gunlukListe(); }, 140);
    });
  },
  ciz(b) {
    b.innerHTML = `
      <div class="yon-bolum-baslik"><h2>ATLAS işlem günlüğü</h2><span class="alt">ATLAS'ın mesajlardan yaptığı her değişiklik ve istek sonuçları, en yeni üstte. Her satırda kaynak mesaj alıntılanır.</span></div>
      <div class="yon-arac-cubugu"><div class="cipler" data-g-cipler></div><input class="girdi yon-ara" type="search" data-gara placeholder="Günlükte ara: ad, firma, mesaj" value="${esc(gunluk.ara)}"></div>
      <div class="kart yon-log-kart" data-g-liste></div>`;
    gunlukListe();
    if (!gunluk.yuklendi && !gunluk.yukleniyor) gunlukYukle();
  },
  yenile(s) { if (['olay', 'istek', 'asistan', 'saat', 'hazir'].some(x => s.has(x))) gunlukListe(); },
};

// ================================================================ 4) AYARLAR
const zamanMevcut = () => ({ bas: store.ayarlar.zaman?.bas || '09:00', bit: store.ayarlar.zaman?.bit || '17:00' });
const hedefMevcut = () => ({ mod: store.ayarlar.hedef?.elle != null ? 'elle' : 'oto', sayi: store.ayarlar.hedef?.elle != null ? String(store.ayarlar.hedef.elle) : '' });
const bizdeSay = () => firmaListesi().filter(f => f.oy_sinifi === 'bizde').length;

function zamanCiz() {
  const kap = kok?.querySelector('[data-a-zaman]'); if (!kap) return;
  const z = taslak.zaman || zamanMevcut();
  kap.innerHTML = `<div class="kart-baslik">${ikon('saat')} Zaman çizelgesi aralığı</div>
  <div class="kart-govde">
    <div data-cakisma="zaman">${cakismaHtml('zaman')}</div>
    <p class="yon-aciklama">Dashboard ve rapor ekranlarındaki gün çizelgesi bu saatler arasında çizilir.</p>
    <div class="yon-saatler">
      <div><label class="etiket" for="yon-z-bas">Başlangıç</label><input id="yon-z-bas" type="time" class="girdi" data-zaman="bas" data-odak="z-bas" value="${esc(z.bas)}" step="300"></div>
      <span class="yon-saat-ok">→</span>
      <div><label class="etiket" for="yon-z-bit">Bitiş</label><input id="yon-z-bit" type="time" class="girdi" data-zaman="bit" data-odak="z-bit" value="${esc(z.bit)}" step="300"></div>
    </div>
    <div class="hata-yazi" data-zaman-hata></div>
    <div class="yon-kaydet-satir" data-kaydet-satir="zaman">${kaydetSatirIc('zaman')}</div>
    <div class="yon-not-kucuk" style="margin-top:12px">${ikon('bilgi')}<span>Prova için adresin sonuna <code>?saat=10:30</code> eklenirse (ör. <code>${esc(uygulamaAdresi())}?saat=10:30#masa</code>) uygulama o saatten işler.</span></div>
  </div>`;
}
function hedefCiz() {
  const kap = kok?.querySelector('[data-a-hedef]'); if (!kap) return;
  const h = taslak.hedef || hedefMevcut();
  kap.innerHTML = `<div class="kart-baslik">${ikon('hedef')} Hedef</div>
  <div class="kart-govde">
    <div data-cakisma="hedef">${cakismaHtml('hedef')}</div>
    <p class="yon-aciklama">Sayaçlardaki "kalan" ve yüzdeler bu sayıya göre hesaplanır.</p>
    <label class="yon-secenek yatay ${h.mod === 'oto' ? 'secili' : ''}"><input type="radio" name="yon-hedef" value="oto" ${h.mod === 'oto' ? 'checked' : ''}><div><b>Otomatik</b><span>Kesin bizde sayısı: <b data-oto-say>${bizdeSay()}</b></span></div></label>
    <label class="yon-secenek yatay ${h.mod === 'elle' ? 'secili' : ''}"><input type="radio" name="yon-hedef" value="elle" ${h.mod === 'elle' ? 'checked' : ''}><div><b>Elle</b><span>Sabit bir hedef sayısı</span></div>
      <input type="number" inputmode="numeric" class="girdi yon-hedef-sayi" data-hedef-sayi data-odak="hedef-sayi" min="1" max="9999" step="1" value="${esc(h.sayi)}" placeholder="Ör. 250" ${h.mod === 'elle' ? '' : 'disabled'} aria-label="Hedef sayısı"></label>
    <div class="yon-simdiki">Şu an geçerli hedef: <b data-gecerli-hedef>${fmt.sayi(hedefSayi())}</b></div>
    <div class="hata-yazi" data-hedef-hata></div>
    <div class="yon-kaydet-satir" data-kaydet-satir="hedef">${kaydetSatirIc('hedef')}</div>
  </div>`;
}
function secimCiz() {
  const kap = kok?.querySelector('[data-a-secim]'); if (!kap) return;
  const s = store.ayarlar.secim || {};
  const tarih = s.tarih ? new Date(`${s.tarih}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : '';
  const v = s.varis;
  kap.innerHTML = `<div class="kart-baslik">${ikon('takvim')} Seçim bilgisi <span class="alt">bilgi amaçlı</span></div>
  <div class="kart-govde">
    <dl class="bilgi-izgara">
      <dt>Tarih</dt><dd>${tarih ? esc(tarih) : '<span style="color:var(--metin-3)">Kayıtlı değil</span>'}</dd>
      <dt>Yer</dt><dd>${esc(s.yer || '') || '<span style="color:var(--metin-3)">Kayıtlı değil</span>'}</dd>
      ${v?.lat && v?.lon ? `<dt>Konum</dt><dd><a class="yon-bag" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(v.lat + ',' + v.lon)}">Haritada aç</a></dd>` : ''}
      <dt>Çizelge</dt><dd>${esc(zamanMevcut().bas)} → ${esc(zamanMevcut().bit)}</dd>
      <dt>Hedef</dt><dd><span data-gecerli-hedef>${fmt.sayi(hedefSayi())}</span> ${store.ayarlar.hedef?.elle != null ? '(elle)' : '(otomatik)'}</dd>
    </dl>
    <div class="yon-not-kucuk" style="margin-top:14px">${ikon('bilgi')}<span>Tarih ve yer seçim kurulumunda girildi. Değişmesi gerekirse ATLAS'a yaz.</span></div>
  </div>`;
}
function hedefSayilariGuncelle() {
  kok?.querySelectorAll('[data-oto-say]').forEach(x => { x.textContent = bizdeSay(); });
  kok?.querySelectorAll('[data-gecerli-hedef]').forEach(x => { x.textContent = fmt.sayi(hedefSayi()); });
}
function zamanDogrula() {
  const z = taslak.zaman; if (!z) return true;
  const ok = z.bas && z.bit && dakika(z.bas) < dakika(z.bit);
  hataYaz('[data-zaman-hata]', ok ? '' : 'Bitiş saati başlangıçtan sonra olmalı');
  return ok;
}
async function ayarKaydetTik(k) {
  let deger;
  if (k === 'zaman') {
    if (!taslak.zaman || !zamanDogrula()) return;
    deger = { ...(store.ayarlar.zaman || {}), bas: taslak.zaman.bas, bit: taslak.zaman.bit };
  } else if (k === 'hedef') {
    const h = taslak.hedef; if (!h) return;
    if (h.mod === 'oto') deger = { ...(store.ayarlar.hedef || {}), elle: null };
    else {
      const n = Number(h.sayi);
      if (!Number.isInteger(n) || n < 1 || n > 9999) { hataYaz('[data-hedef-hata]', 'Hedef 1 ile 9999 arasında bir tam sayı olmalı'); kok?.querySelector('[data-hedef-sayi]')?.focus(); return; }
      deger = { ...(store.ayarlar.hedef || {}), elle: n };
    }
  } else if (k === 'whatsapp') {
    const d = taslak.whatsapp; if (!d) return;
    const sablon = String(d.sablon || '').trim();
    if (!sablon) { toast('Mesaj şablonu boş olamaz', { tur: 'hata' }); return; }
    const bilinmeyen = bilinmeyenDegiskenler(sablon);
    if (bilinmeyen.length && !(await onayla(`Şablonda tanınmayan değişken var: ${bilinmeyen.join(' ')}. Mesajda olduğu gibi yazılır. Yine de kaydedilsin mi?`, { evet: 'Kaydet' }))) return;
    deger = { ...(store.ayarlar.whatsapp || {}), ...d, sablon };
  } else return;
  const btn = kok?.querySelector(`[data-kaydet="${k}"]`); if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor…'; }
  try {
    await ayarKaydet(k, deger);
    toast(k === 'whatsapp' ? (deger.grup_jid ? 'WhatsApp ayarları kaydedildi' : 'Kaydedildi. Grup seçilmediği için mesaj gitmez.') : 'Kaydedildi, herkese uygulandı', { tur: 'basari' });
  } catch (e) { hataGoster(e); }
  bolumCiz();
}
const ayarlarBolum = {
  kur(b) {
    b.addEventListener('input', e => {
      const t = e.target;
      if (t.matches('[data-zaman]')) { const z = taslakBaslat('zaman', zamanMevcut()); z[t.dataset.zaman] = t.value; zamanDogrula(); }
      else if (t.matches('[data-hedef-sayi]')) { const h = taslakBaslat('hedef', hedefMevcut()); h.sayi = t.value; hataYaz('[data-hedef-hata]', ''); }
    });
    b.addEventListener('change', e => {
      if (e.target.name !== 'yon-hedef') return;
      const h = taslakBaslat('hedef', hedefMevcut()); h.mod = e.target.value; hedefCiz();
      if (h.mod === 'elle') kok?.querySelector('[data-hedef-sayi]')?.focus();
    });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-hedef-sayi]')) { e.preventDefault(); ayarKaydetTik('hedef'); } });
  },
  ciz(b) {
    b.innerHTML = `
      <div class="yon-bolum-baslik"><h2>Ayarlar</h2><span class="alt">Kaydedince herkesin ekranına anında yansır.</span></div>
      <div class="yon-ayar-izgara"><div class="kart" data-a-zaman></div><div class="kart" data-a-hedef></div><div class="kart" data-a-secim></div></div>`;
    zamanCiz(); hedefCiz(); secimCiz();
  },
  yenile(s) {
    if (s.has('ayar') || s.has('hazir')) {
      const b = bolumEl(), odak = odakKaydet(b);
      zamanCiz(); hedefCiz(); secimCiz(); zamanDogrula(); odakGeri(b, odak);
    } else if (['firma', 'firmalar'].some(x => s.has(x))) hedefSayilariGuncelle();
  },
};

// ================================================================ 5) WHATSAPP BİLDİRİMLERİ
const wa = { gruplar: null, hata: null, yukleniyor: false, ornekId: null };
const waMevcut = () => {
  const w = store.ayarlar.whatsapp || {};
  return { ...WA_VARSAYILAN, ...w, olaylar: { ...WA_VARSAYILAN.olaylar, ...(w.olaylar || {}) }, sablon: w.sablon ?? WA_VARSAYILAN.sablon };
};
const waDeger = () => taslak.whatsapp || waMevcut();
function waDuzenle(fn) { const d = taslakBaslat('whatsapp', waMevcut()); fn(d); kaydetSatirGuncelle('whatsapp'); waOnizle(); sablonBilgi(); }
const bilinmeyenDegiskenler = s => [...new Set([...String(s).matchAll(/\{([^{}\s]+)\}/g)].map(m => m[1]).filter(k => !WA_DEGISKENLER.some(([d]) => d === k)).map(k => `{${k}}`))];

async function waGrupYukle() {
  wa.yukleniyor = true; wa.hata = null; waGrupCiz();
  try {
    const { data, error } = await sb.from('wa_gruplar').select('*').order('ad');
    if (error) throw error;
    wa.gruplar = (data || []).sort((a, b) => String(a.ad || '').localeCompare(String(b.ad || ''), 'tr'));
  } catch (e) { wa.hata = e.message || String(e); wa.gruplar = wa.gruplar || []; }
  finally { wa.yukleniyor = false; waGrupCiz(); }
}
function waGrupCiz() {
  const kap = kok?.querySelector('[data-wa-grup]'); if (!kap) return;
  const d = waDeger(), liste = wa.gruplar || [];
  const listedeYok = d.grup_jid && !liste.some(g => g.jid === d.grup_jid);
  const sonGuncelleme = liste.reduce((m, g) => (g.guncelleme && g.guncelleme > m ? g.guncelleme : m), '');
  let govde;
  if (wa.gruplar === null) govde = '<div class="yon-yukleniyor" style="padding:4px 0">Gruplar yükleniyor…</div>';
  else if (wa.hata) govde = `<div class="uyari-kutu turuncu"><span>${ikon('uyari')}</span><div>Grup listesi alınamadı<div style="font-weight:500">${esc(wa.hata)}</div></div></div>`;
  else if (!liste.length) govde = `<div class="uyari-kutu turuncu"><span>${ikon('uyari')}</span><div>Mac'teki bildirim bekçisi grupları henüz göndermedi<div style="font-weight:500">Bekçi çalışınca Musa'nın WhatsApp grupları buraya gelir; sonra "Listeyi yenile"ye bas.</div></div></div>`;
  else {
    govde = `<select class="girdi" data-wa-grup-sec aria-label="Hedef grup">
      <option value="">Grup seçilmedi (mesaj gitmez)</option>
      ${listedeYok ? `<option value="${esc(d.grup_jid)}" selected>${esc(d.grup_ad || d.grup_jid)} (listede yok)</option>` : ''}
      ${liste.map(g => `<option value="${esc(g.jid)}" ${g.jid === d.grup_jid ? 'selected' : ''}>${esc(g.ad || g.jid)}</option>`).join('')}
    </select>
    <div class="yon-onizleme-alt">${liste.length} grup${sonGuncelleme ? ` · liste ${esc(goreliUzun(sonGuncelleme))} güncellendi` : ''}</div>`;
  }
  const secili = d.grup_jid && (!liste.length || wa.hata)
    ? `<div class="yon-secili-grup">Kayıtlı grup: <b>${esc(d.grup_ad || d.grup_jid)}</b></div>` : '';
  kap.innerHTML = `<div class="kart-baslik">${ikon('grup')} Hedef grup <span class="sag"><button class="btn btn-hayalet btn-kucuk" data-wa-grup-yenile ${wa.yukleniyor ? 'disabled' : ''}>${ikon('yenile')} ${wa.yukleniyor ? 'Yükleniyor…' : 'Listeyi yenile'}</button></span></div><div class="kart-govde">${govde}${secili}</div>`;
}
function ornekAdaylari() {
  const hepsi = firmaListesi();
  const iyi = hepsi.filter(f => f.oy_sinifi === 'bizde' && f.yetkili && f.referans && f.ilce);
  return iyi.length ? iyi : hepsi.filter(f => f.yetkili);
}
function ornekFirma() {
  let f = wa.ornekId ? store.firmalar.get(wa.ornekId) : null;
  if (!f) {
    const aday = ornekAdaylari();
    const oy = aday.filter(x => x.durum === 'oy_kullandi').sort((a, b) => String(b.durum_zamani || '').localeCompare(String(a.durum_zamani || '')));
    f = oy[0] || aday[0] || firmaListesi()[0] || null;
    wa.ornekId = f?.id ?? null;
  }
  return f;
}
function sablonDoldur(sablon, f) {
  const s = sayac();
  const kullanan = s.oy_bizde + (f && f.oy_sinifi === 'bizde' && f.durum !== 'oy_kullandi' ? 1 : 0);   // örnek kişi az önce oy kullanmış gibi
  const d = {
    saat: fmt.saat(simdi()), yetkili: trBaslik(f?.yetkili || ''), firma: f?.unvan || '', referans: f?.referans ? trBaslik(f.referans) : 'yok',
    kullanan: fmt.sayi(kullanan), hedef: fmt.sayi(s.hedef), ilce: trBaslik(f?.ilce || ''),
  };
  return String(sablon || '').replace(/\{([^{}\s]+)\}/g, (m, k) => (k in d ? d[k] : m));
}
const waBicim = t => esc(t)
  .replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>')
  .replace(/\n/g, '<br>');
function waOnizle() {
  const kap = kok?.querySelector('[data-wa-onizleme]'); if (!kap) return;
  const d = waDeger(), f = ornekFirma();
  const metin = sablonDoldur(d.sablon, f);
  const acikOlay = WA_OLAYLAR.filter(([k]) => d.olaylar?.[k]).map(([, ad]) => ad);
  kap.innerHTML = `
    <div class="yon-wa-ekran">
      <div class="yon-wa-ust"><div class="yon-wa-avatar">${ikon('grup')}</div><div style="min-width:0"><b>${esc(d.grup_ad || 'Grup seçilmedi')}</b><span>Musa Cankurtaran'ın hesabından</span></div></div>
      <div class="yon-wa-akis"><div class="yon-wa-balon">${metin.trim() ? waBicim(metin) : '<i style="opacity:.6">Şablon boş</i>'}<span class="yon-wa-saat">${esc(fmt.saat(simdi()))} <b>✓✓</b></span></div></div>
    </div>
    <div class="yon-onizleme-alt">${f ? `Örnek kişi: <a href="#" data-firma="${esc(f.id)}">${esc(firmaAdi(f))}</a> · ${esc(f.unvan || '')}` : 'Örnek için firma bulunamadı'}</div>
    <div class="yon-onizleme-alt">${!d.grup_jid ? '<span class="yon-uyari-yazi">Grup seçilmedi, hiç mesaj gitmez.</span>'
    : !acikOlay.length ? '<span class="yon-uyari-yazi">Hiçbir olay açık değil, mesaj gitmez.</span>'
      : `Gidecek: <b>${esc(acikOlay.join(', '))}</b> · ${esc(WA_MOD_AD[d.mod] || d.mod)}`}</div>`;
}
function sablonBilgi() {
  const kap = kok?.querySelector('[data-wa-sablon-bilgi]'); if (!kap) return;
  const s = waDeger().sablon || '', bilinmeyen = bilinmeyenDegiskenler(s);
  kap.innerHTML = `<span>${bilinmeyen.length ? `<span class="yon-uyari-yazi">Tanınmayan: ${esc(bilinmeyen.join(' '))}</span>` : 'Değişkene tıkla, imlecin olduğu yere eklenir. *kalın* ve _italik_ WhatsApp biçimi çalışır.'}</span><span>${s.length} karakter</span>`;
}
function waSonCiz() {
  const kap = kok?.querySelector('[data-wa-son]'); if (!kap) return;
  const liste = store.olaylar.filter(o => o.wa_durum && o.wa_durum !== 'yok').slice(0, 8);
  kap.innerHTML = liste.length
    ? `<ul class="yon-wa-son">${liste.map(o => `<li><span class="zayif">${esc(fmt.saat(o.zaman))}</span><span class="yon-wa-son-metin" title="${esc(olayMetni(o))}">${esc(olayMetni(o))}</span><span class="rozet yon-wa-d ${esc(o.wa_durum)}">${esc(WA_DURUM_AD[o.wa_durum] || o.wa_durum)}</span></li>`).join('')}</ul>`
    : '<div class="bos" style="padding:20px 16px">Henüz bildirim kaydı yok. Bekçi mesaj gönderdikçe durumları burada görünür.</div>';
}
function degiskenEkle(v) {
  const ta = kok?.querySelector('[data-wa-sablon]'); if (!ta) return;
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
  const once = ta.value.charAt(s - 1);   // yazının ortasına yapışmasın: gerekirse önüne boşluk
  ta.setRangeText((s > 0 && once && !/[\s(/]/.test(once) ? ' ' : '') + v, s, e, 'end'); ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
const whatsappBolum = {
  kur(b) {
    b.addEventListener('click', e => {
      const t = e.target;
      const ol = t.closest('[data-wa-olay]');
      if (ol) {
        const k = ol.dataset.waOlay; waDuzenle(d => { d.olaylar = { ...d.olaylar, [k]: !d.olaylar?.[k] }; });
        const acik = !!waDeger().olaylar[k]; ol.classList.toggle('acik', acik); ol.setAttribute('aria-checked', String(acik)); return;
      }
      const dg = t.closest('[data-degisken]'); if (dg) return degiskenEkle(`{${dg.dataset.degisken}}`);
      if (t.closest('[data-wa-varsayilan]')) {
        waDuzenle(d => { d.sablon = WA_VARSAYILAN.sablon; });
        const ta = b.querySelector('[data-wa-sablon]'); if (ta) ta.value = WA_VARSAYILAN.sablon; return;
      }
      if (t.closest('[data-wa-ornek]')) {
        const aday = ornekAdaylari().filter(f => f.id !== wa.ornekId);
        if (aday.length) wa.ornekId = aday[Math.floor(Math.random() * aday.length)].id;
        return waOnizle();
      }
      if (t.closest('[data-wa-grup-yenile]')) return waGrupYukle();
      const f = t.closest('[data-firma]'); if (f) { e.preventDefault(); kisiKartiAc(Number(f.dataset.firma)); }
    });
    b.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'yon-wa-mod') {
        waDuzenle(d => { d.mod = t.value; });
        b.querySelectorAll('input[name="yon-wa-mod"]').forEach(r => r.closest('.yon-secenek')?.classList.toggle('secili', r.checked));
      } else if (t.matches('[data-wa-grup-sec]')) {
        const g = (wa.gruplar || []).find(x => x.jid === t.value);
        waDuzenle(d => { d.grup_jid = t.value || null; d.grup_ad = t.value ? (g?.ad || d.grup_ad || null) : null; });
      }
    });
    b.addEventListener('input', e => { if (e.target.matches('[data-wa-sablon]')) waDuzenle(d => { d.sablon = e.target.value; }); });
  },
  ciz(b) {
    const odak = odakKaydet(b);
    const d = waDeger();
    b.innerHTML = `
      <div class="yon-bolum-baslik"><h2>WhatsApp bildirimleri</h2><span class="alt">Seçim günü olayları seçtiğin gruba otomatik mesaj olarak gider.</span></div>
      <div class="yon-bilgi">${ikon('bilgi')}<span>Mesajlar Musa'nın WhatsApp'ından, Mac açık ve bağlıyken gider.</span></div>
      <div data-cakisma="whatsapp">${cakismaHtml('whatsapp')}</div>
      <div class="yon-wa-duzen">
        <div class="yon-wa-sol">
          <div class="kart" data-wa-grup></div>
          <div class="kart"><div class="kart-baslik">${ikon('zil')} Hangi olaylarda mesaj gitsin</div>
            <div class="kart-govde yon-anahtarlar">${WA_OLAYLAR.map(([k, ad, ac]) => `<div class="yon-anahtar-satir"><div><b>${esc(ad)}</b><span>${esc(ac)}</span></div><button type="button" class="anahtar ${d.olaylar?.[k] ? 'acik' : ''}" data-wa-olay="${k}" role="switch" aria-checked="${!!d.olaylar?.[k]}" aria-label="${esc(ad)}"></button></div>`).join('')}</div></div>
          <div class="kart"><div class="kart-baslik">${ikon('saat')} Gönderim modu</div>
            <div class="kart-govde"><div class="yon-secenekler uc">${WA_MODLAR.map(([k, ad, ac]) => `<label class="yon-secenek ${d.mod === k ? 'secili' : ''}"><input type="radio" name="yon-wa-mod" value="${k}" ${d.mod === k ? 'checked' : ''}><b>${esc(ad)}</b><span>${esc(ac)}</span></label>`).join('')}</div></div></div>
          <div class="kart"><div class="kart-baslik">${ikon('mesaj')} Mesaj şablonu <span class="sag"><button class="btn btn-hayalet btn-kucuk" data-wa-varsayilan>Varsayılana dön</button></span></div>
            <div class="kart-govde">
              <div class="yon-degiskenler">${WA_DEGISKENLER.map(([k, ad]) => `<button type="button" class="cip" data-degisken="${k}" title="${esc(ad)}">{${k}}</button>`).join('')}</div>
              <textarea class="girdi yon-sablon" data-wa-sablon data-odak="wa-sablon" rows="4" spellcheck="false" aria-label="Mesaj şablonu">${esc(d.sablon || '')}</textarea>
              <div class="yon-sablon-alt" data-wa-sablon-bilgi></div>
            </div></div>
        </div>
        <div class="yon-wa-sag">
          <div class="kart"><div class="kart-baslik">Canlı önizleme <span class="sag"><button class="btn btn-hayalet btn-kucuk" data-wa-ornek>${ikon('yenile')} Başka örnek</button></span></div><div class="kart-govde" data-wa-onizleme></div></div>
          <div class="kart"><div class="kart-baslik">Son bildirimler</div><div data-wa-son></div></div>
        </div>
      </div>
      <div class="yon-kaydet-bar" data-kaydet-satir="whatsapp">${kaydetSatirIc('whatsapp')}</div>`;
    waGrupCiz(); waOnizle(); sablonBilgi(); waSonCiz(); odakGeri(b, odak);
    if (wa.gruplar === null && !wa.yukleniyor) waGrupYukle();
  },
  yenile(s) {
    if (s.has('ayar') || s.has('hazir')) { if (taslak.whatsapp) cakismaGuncelle('whatsapp'); else whatsappBolum.ciz(bolumEl()); return; }
    if (['firma', 'firmalar', 'saat'].some(x => s.has(x))) waOnizle();
    if (s.has('olay')) waSonCiz();
  },
};

// ================================================================ 6) VERİ
const isaretliMi = f => f.durum !== 'bekliyor' || !!f.kendi_geldi;
const kpi = (etiket, deger, alt, sinif = '') => `<div class="kpi ${sinif}"><div class="kpi-etiket">${esc(etiket)}</div><div class="kpi-deger">${fmt.sayi(deger)}</div><div class="kpi-alt">${esc(alt)}</div></div>`;
function barSatir(etiketHtml, n, toplam, renk) {
  const y = fmt.yuzde(n, toplam);
  return `<div class="yon-bar-satir"><div class="yon-bar-etiket">${etiketHtml}</div><div class="yon-bar"><i class="${renk}" style="width:${n ? Math.max(1, y) : 0}%"></i></div><div class="yon-bar-sayi"><b>${fmt.sayi(n)}</b><span>%${y}</span></div></div>`;
}
function oyVermeSurdu() {
  const tarih = store.ayarlar.secim?.tarih; if (!tarih) return false;
  const d = simdi(), bugun = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return bugun === tarih && simdiDk() >= (dakika(zamanMevcut().bas) ?? 540);
}
function csvIndir() {
  const liste = firmaListesi().sort((a, b) => (Number(a.sn) || 1e9) - (Number(b.sn) || 1e9) || a.id - b.id);
  const tarihSaat = t => { if (!t) return ''; const x = new Date(t); return `${x.toLocaleDateString('tr-TR')} ${x.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`; };
  const telYaz = c => { const r = String(c || '').replace(/\D/g, ''); return (r.length === 10 || (r.length === 11 && r[0] === '0') || (r.length === 12 && r.startsWith('90'))) ? fmt.tel(c) : String(c || ''); };
  const basliklar = ['Sıra', 'Oda sicil', 'Ticari sicil', 'Ünvan', 'Tür', 'Yetkili', 'Cep', 'İlçe', 'Referans', '2. referans', 'Oy sınıfı', 'Durum', 'Kendi geldi', 'Durum zamanı', 'İşaretleyen', 'Ulaşım', 'Taşıma saati', 'Araç', 'Notlar'];
  const satirlar = liste.map(f => {
    const a = aracOf(f);
    return [f.sn, f.oda_sicil, f.ticari_sicil, f.unvan, f.tur, trBaslik(f.yetkili || ''), telYaz(f.cep), trBaslik(f.ilce || ''), f.referans, f.referans2,
      SINIF_AD[f.oy_sinifi] || f.oy_sinifi, DURUM_AD[f.durum] || f.durum, f.kendi_geldi ? 'Evet' : '', tarihSaat(f.durum_zamani), f.durum_kim,
      ULASIM_AD[ulasim(f)], fmt.saatKisa(f.tasima_saati), a ? fmt.plaka(a.plaka) : '', f.notlar];
  });
  // Excel formül enjeksiyonuna karşı: = + @ ile başlayan hücre metin olarak yazılır
  const hucre = v => { let s = String(v ?? ''); if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = [basliklar, ...satirlar].map(r => r.map(hucre).join(';')).join('\r\n');
  const d = new Date(), iki = n => String(n).padStart(2, '0');
  const ad = `secim-raporu-${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}-${iki(d.getHours())}${iki(d.getMinutes())}.csv`;
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = ad; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  toast(`${fmt.sayi(liste.length)} firmalık rapor indirildi`, { tur: 'basari' });
}
function provaTemizligi() {
  const ilk = firmaListesi().filter(isaretliMi);
  if (!ilk.length) return toast('Sıfırlanacak işaret yok');
  const oy = ilk.filter(f => f.durum === 'oy_kullandi').length, kendi = ilk.filter(f => f.kendi_geldi).length;
  const m = modal('Prova temizliği', `
    ${oyVermeSurdu() ? `<div class="uyari-kutu kirmizi" style="margin-top:0"><span>${ikon('uyari')}</span><div>Oy verme saatindesin<div style="font-weight:500">Bu işlem provayı değil, GERÇEK seçim işaretlerini siler.</div></div></div>` : ''}
    <p style="margin:0 0 10px;font-weight:700;line-height:1.5">${fmt.sayi(ilk.length)} firmanın gün durumu "Bekliyor" olacak${oy ? `; ${fmt.sayi(oy)} "oy kullandı" işareti silinecek` : ''}${kendi ? `; ${fmt.sayi(kendi)} "kendi geldi" işareti kalkacak` : ''}.</p>
    <p class="yon-aciklama">Oy sınıfları, notlar ve araç atamaları korunur. Hemen ardından çıkan bildirimdeki "Geri al" ile 20 saniye içinde dönebilirsin.</p>
    <label class="etiket" for="yon-sifirla">Onaylamak için SIFIRLA yaz</label>
    <input id="yon-sifirla" class="girdi" data-sifirla-yazi autocomplete="off" placeholder="SIFIRLA">`,
  `<button class="btn" data-kapat>Vazgeç</button><button class="btn btn-kirmizi" data-sifirla disabled>${fmt.sayi(ilk.length)} firmayı sıfırla</button>`);
  const inp = m.querySelector('[data-sifirla-yazi]'), btn = m.querySelector('[data-sifirla]');
  inp.focus();
  inp.addEventListener('input', () => { btn.disabled = trArama(inp.value) !== 'sifirla'; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
  btn.addEventListener('click', async () => {
    btn.disabled = true; modalKapat();
    const ids = firmaListesi().filter(isaretliMi).map(f => f.id);   // onay anındaki güncel liste
    if (!ids.length) return toast('Sıfırlanacak işaret kalmadı');
    try {
      const geriAl = await durumYap(ids, 'bekliyor', { kendi: false, metin: 'Prova temizliği (toplu sıfırlama)' });
      toast(`${fmt.sayi(ids.length)} firma sıfırlandı`, { tur: 'basari', geriAl, sure: 20000 });
    } catch (e) { hataGoster(e); }
  });
}
const veriBolum = {
  kur(b) {
    b.addEventListener('click', e => {
      if (e.target.closest('[data-csv]')) return csvIndir();
      if (e.target.closest('[data-prova]')) return provaTemizligi();
    });
  },
  ciz(b) {
    if (!b) return;
    const hepsi = firmaListesi(), s = sayac(), toplam = hepsi.length;
    const insan = [...store.profiller.values()].filter(p => p.rol !== 'bot');
    const araclar = [...store.araclar.values()];
    const turlar = Object.entries(hepsi.reduce((m, f) => { const t = f.tur || 'Belirsiz'; m[t] = (m[t] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
    const isaretli = hepsi.filter(isaretliMi).length;
    const sonExcel = store.olaylar.find(o => o.kaynak === 'excel');
    b.innerHTML = `
      <div class="yon-bolum-baslik"><h2>Veri</h2><span class="alt">Canlı veritabanının özeti, seçim sonrası rapor ve prova temizliği.</span></div>
      <div class="kpi-serit">
        ${kpi('Firma', toplam, turlar.map(([t, n]) => `${fmt.sayi(n)} ${trKucukIlk(t)}`).join(' · '))}
        ${kpi('Kesin bizde', s.bizde, `Hedef ${fmt.sayi(s.hedef)}`, 'vurgu')}
        ${kpi('Topluluk üyesi', store.topluluk.length, `${fmt.sayi(hepsi.filter(f => f.toplulukta).length)} firma toplulukta`)}
        ${kpi('Araç', araclar.length, `${fmt.sayi(araclar.filter(a => a.sofor_kullanici).length)} şoför hesabı bağlı`)}
        ${kpi('Kullanıcı', insan.length, `${fmt.sayi(insan.filter(p => p.aktif).length)} aktif`)}
      </div>
      <div class="yon-veri-izgara">
        <div class="kart"><div class="kart-baslik">Oy sınıfı dağılımı <span class="alt">${fmt.sayi(toplam)} firma</span></div>
          <div class="kart-govde">${SINIFLAR.map(x => barSatir(rozetSinif(x.k), hepsi.filter(f => f.oy_sinifi === x.k).length, toplam, 'b-' + x.k)).join('')}</div></div>
        <div class="kart"><div class="kart-baslik">Gün durumu <span class="alt">${fmt.sayi(isaretli)} işaretli</span></div>
          <div class="kart-govde">${DURUMLAR.map(x => barSatir(`<span class="rozet d-${x.k}">${esc(x.ad)}</span>`, hepsi.filter(f => f.durum === x.k).length, toplam, 'bd-' + x.k)).join('')}
          ${barSatir('<span class="rozet u-kendi">Kendi geldi</span>', s.kendi_geldi, toplam, 'bd-kendi')}</div></div>
      </div>
      <div class="yon-veri-izgara">
        <div class="kart"><div class="kart-baslik">${ikon('tablo')} Tablo güncellemesi</div>
          <div class="kart-govde">
            <p class="yon-aciklama" style="font-weight:600;color:var(--metin)">Yeni Excel'i ATLAS'a gönder, gün içi işaretler korunarak aktarılır.</p>
            ${sonExcel ? `<div class="yon-not-kucuk">${ikon('bilgi')}<span>Son Excel aktarımı: ${esc(goreliUzun(sonExcel.zaman))}${sonExcel.kim_ad ? ` · ${esc(sonExcel.kim_ad)}` : ''}</span></div>` : ''}
          </div></div>
        <div class="kart"><div class="kart-baslik">${ikon('indir')} Seçim sonrası rapor</div>
          <div class="kart-govde">
            <p class="yon-aciklama">Tüm ${fmt.sayi(toplam)} firma; gün durumu, durum zamanı, işaretleyen, referans, ulaşım ve notlarla. Excel'de doğrudan açılır.</p>
            <button class="btn btn-koyu" data-csv>${ikon('indir')} Raporu indir (CSV)</button>
          </div></div>
      </div>
      <div class="kart yon-tehlike"><div class="kart-baslik">${ikon('uyari')} Prova temizliği</div>
        <div class="kart-govde yon-tehlike-govde">
          <div><p>Seçim sabahı provadan sonra tüm gün durumlarını sıfırlar: her firma "Bekliyor" olur, "kendi geldi" işaretleri kalkar. Oy sınıfı, not ve araç atamaları korunur.</p>
            <div class="zayif">Şu an işaretli: <b style="color:var(--metin)">${fmt.sayi(isaretli)}</b> firma${oyVermeSurdu() ? ' · <b style="color:var(--kirmizi)">oy verme saatindesin</b>' : ''}</div></div>
          <button class="btn btn-kirmizi" data-prova ${isaretli ? '' : 'disabled'}>${isaretli ? `${fmt.sayi(isaretli)} firmayı sıfırla` : 'Sıfırlanacak işaret yok'}</button>
        </div></div>`;
  },
  yenile(s) { if (['firma', 'firmalar', 'arac', 'araclar', 'profil', 'ayar', 'olay', 'hazir'].some(x => s.has(x))) veriBolum.ciz(bolumEl()); },
};
const trKucukIlk = t => String(t).toLocaleLowerCase('tr');

// ================================================================ kabuk
const BOLUM = { kullanicilar, onay, gunluk: gunlukBolum, ayarlar: ayarlarBolum, whatsapp: whatsappBolum, veri: veriBolum };

function menuCiz() {
  const m = kok?.querySelector('[data-menu]'); if (!m) return;
  const onaySay = bekleyenSay(), kisi = [...store.profiller.values()].filter(p => p.rol !== 'bot').length;
  const taslakVar = { ayarlar: !!(taslak.zaman || taslak.hedef), whatsapp: !!taslak.whatsapp };
  m.innerHTML = SEKMELER.map((s, i) => `${i === 3 ? '<div class="yon-menu-ayrac"></div>' : ''}<button type="button" class="${s.k === sekme ? 'aktif' : ''}" data-sekme="${s.k}" ${s.k === sekme ? 'aria-current="page"' : ''}>${ikon(s.ikon)}<span>${esc(s.ad)}</span>${
    s.k === 'onay' && onaySay ? `<span class="rozet-sayi">${onaySay}</span>`
      : s.k === 'kullanicilar' ? `<span class="say">${kisi}</span>`
        : taslakVar[s.k] ? '<span class="yon-taslak-nokta" title="Kaydedilmemiş değişiklik"></span>' : ''}</button>`).join('');
}
function bolumCiz() {
  const kap = kok?.querySelector('[data-icerik]'); if (!kap) return;
  let b = bolumEl();
  if (!b || b.dataset.bolum !== sekme) {
    b = document.createElement('div'); b.className = 'yon-bolum'; b.dataset.bolum = sekme;
    kap.replaceChildren(b); BOLUM[sekme].kur(b);
  }
  BOLUM[sekme].ciz(b);
}
function sekmeAc(k) {
  if (!BOLUM[k]) return;
  if (k === sekme) { bolumCiz(); return; }
  sekme = k;
  history.replaceState(null, '', '#yonetim/' + k);
  menuCiz(); bolumCiz();
  window.scrollTo({ top: 0 });
}
function planla() {
  if (planli || !kok) return;
  planli = true;
  requestAnimationFrame(() => {
    planli = false; if (!kok) return;
    const s = new Set(bekleyen); bekleyen.clear();
    if (['istek', 'profil', 'hazir'].some(x => s.has(x))) menuCiz();
    try { BOLUM[sekme].yenile?.(s); } catch (e) { console.error('yönetim yenile', e); }
  });
}

export default {
  async render(k, param) {
    stilEkle();
    kok = k;
    if (!yoneticiMi()) { k.innerHTML = '<div class="kart"><div class="bos">Bu bölüm yalnız yönetici içindir.</div></div>'; kok = null; return; }
    sekme = BOLUM[param] ? param : (bekleyenSay() ? 'onay' : 'kullanicilar');
    k.innerHTML = `
    <div class="yon">
      <div class="sayfa-baslik"><div><h1>Yönetim</h1><div class="alt">Ekip hesapları, ATLAS onayları, bildirimler ve veri</div></div></div>
      <div class="yon-duzen">
        <nav class="yon-menu" data-menu aria-label="Yönetim bölümleri"></nav>
        <section class="yon-icerik" data-icerik></section>
      </div>
    </div>`;
    k.querySelector('[data-menu]').addEventListener('click', e => { const b = e.target.closest('[data-sekme]'); if (b) sekmeAc(b.dataset.sekme); });
    // Ortak ve bölüme özel yazma işlemleri (kaydet / vazgeç / taslağı at): tüm bölümlerde aynı
    k.querySelector('[data-icerik]').addEventListener('click', e => {
      const ks = e.target.closest('[data-kaydet]'); if (ks) { ayarKaydetTik(ks.dataset.kaydet); return; }
      const v = e.target.closest('[data-vazgec],[data-taslak-at]');
      if (v) { taslakBirak(v.dataset.vazgec || v.dataset.taslakAt); bolumCiz(); }
    });
    menuCiz(); bolumCiz();
    kapat.push(bus.on('*', (ad, veri) => {
      if (ad === 'ayar' && veri?.anahtar) ayarDegisti(veri.anahtar);
      bekleyen.add(ad); planla();
    }));
  },
  yenile(sebep) { if (sebep) bekleyen.add(sebep); planla(); },
  temizle() {
    kapat.forEach(f => { try { f(); } catch {} }); kapat = [];
    clearTimeout(gunluk.zamanlayici);
    bekleyen.clear(); kok = null; planli = false;
    gecmisHepsi = false; gunluk.sinir = 60;
  },
};

// ================================================================ stil
function stilEkle() {
  if (document.querySelector('style[data-ekran="yonetim"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'yonetim'; s.textContent = CSS; document.head.appendChild(s);
}
const CSS = `
.yon-duzen { display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 20px; align-items: start; }
.yon-menu { position: sticky; top: calc(var(--ust-h) + 20px); display: flex; flex-direction: column; gap: 2px; padding: 8px; background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: var(--r-2); box-shadow: var(--golge-1); }
.yon-menu button { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--metin-2); font-weight: 600; font-size: 13px; cursor: pointer; text-align: left; white-space: nowrap; }
.yon-menu button:hover { background: var(--yuzey-3); color: var(--metin); }
.yon-menu button.aktif { background: var(--kirmizi-acik); color: var(--kirmizi); }
.yon-menu button .say { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--metin-3); font-variant-numeric: tabular-nums; }
.yon-menu button .rozet-sayi { margin-left: auto; }
.yon-menu-ayrac { height: 1px; background: var(--cizgi); margin: 6px; }
.yon-taslak-nokta { margin-left: auto; width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px var(--amber-acik); }
.yon-i { width: 16px; height: 16px; flex: none; }
.btn .yon-i { width: 15px; height: 15px; }
.kart-baslik > .yon-i { color: var(--metin-3); }
.yon-i.buyuk { width: 34px; height: 34px; color: var(--cizgi-2); margin-bottom: 4px; }
.yon code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; background: var(--yuzey-3); padding: 1px 5px; border-radius: 4px; word-break: break-all; }
.yon-bolum-baslik { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 2px 0 14px; }
.yon-bolum-baslik h2 { margin: 0; font-size: 18px; font-weight: 900; letter-spacing: -.01em; }
.yon-bolum-baslik h3 { margin: 0; font-size: 15px; font-weight: 800; }
.yon-bolum-baslik .alt { color: var(--metin-3); font-weight: 500; font-size: 13px; }
.yon-aciklama { color: var(--metin-2); font-size: 13px; margin: 0 0 12px; line-height: 1.5; }
.yon-not-kucuk { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: var(--metin-3); font-weight: 500; line-height: 1.45; }
.yon-not-kucuk .yon-i { width: 14px; height: 14px; margin-top: 1px; }
.yon-not-kucuk.yon-vurgu { color: var(--amber); font-weight: 700; }
.yon-bos { display: grid; justify-items: center; gap: 4px; line-height: 1.5; }
.yon-daha { width: 100%; border-radius: 0 0 var(--r-2) var(--r-2); height: 42px; color: var(--metin-2); }
.yon-yukleniyor { padding: 10px 16px; font-size: 12px; color: var(--metin-3); font-weight: 600; }
.yon-bag { text-decoration: underline; text-decoration-color: var(--cizgi-2); text-underline-offset: 2px; }
.yon-uyari-yazi { color: var(--turuncu); font-weight: 700; }
.yon-donen { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--cizgi-2); border-top-color: var(--kirmizi); animation: yon-don .7s linear infinite; flex: none; }
@keyframes yon-don { to { transform: rotate(360deg); } }

/* kullanıcılar */
.yon-iki { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; align-items: start; }
.yon-kart-tablo .tablo-kap { border: 0; border-radius: 0 0 var(--r-2) var(--r-2); }
.yon-tablo .tablo tr:hover td { cursor: default; }
.yon-tablo .tablo td { padding: 10px 9px; }
.yon-tablo .tablo th { padding: 10px 9px; }
.yon-tablo .tablo td:first-child, .yon-tablo .tablo th:first-child { padding-left: 14px; }
.yon-kisi { display: flex; align-items: center; gap: 10px; }
.yon-kisi .avatar { width: 32px; height: 32px; }
.avatar.bot { background: var(--gri-acik); color: var(--metin-3); }
.yon-bot td { color: var(--metin-3); }
.yon-bot td .kalin { font-weight: 600; }
.yon-pasif td:not(:last-child) { opacity: .55; }
.yon-sen { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; background: var(--yuzey-3); color: var(--metin-3); border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: 1px; }
.yon-rol.r-yonetici { background: var(--koyu); color: #fff; }
.yon-rol.r-masa { background: var(--kirmizi-acik); color: var(--kirmizi); }
.yon-rol.r-rapor { background: var(--mavi-acik); color: var(--mavi); }
.yon-rol.r-sofor { background: var(--amber-acik); color: var(--amber); }
.yon-rol.r-bot { background: var(--gri-acik); color: var(--metin-3); }
:root[data-tema="koyu"] .yon-rol.r-yonetici { background: var(--metin); color: var(--zemin); }
.yon-nokta { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 12px; color: var(--metin-3); white-space: nowrap; }
.yon-nokta::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--cizgi-2); }
.yon-nokta.acik { color: var(--yesil); }
.yon-nokta.acik::before { background: var(--yesil); box-shadow: 0 0 0 3px var(--yesil-acik); }
.yon-islem { display: flex; gap: 5px; justify-content: flex-end; align-items: center; }
.yon-islem select.yon-rol-sec { height: 28px; width: 98px; flex: none; padding: 0 6px; font-size: 12px; font-weight: 700; border-radius: 8px; }
.yon-tablo td.zayif { white-space: nowrap; }
.yon-sil { width: 28px; color: var(--metin-3); }
.yon-sil:hover:not(:disabled) { color: var(--kirmizi); background: var(--kirmizi-acik); }
.yon-yeni { position: sticky; top: calc(var(--ust-h) + 20px); }
.yon-secenekler { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.yon-secenekler.uc { grid-template-columns: repeat(3, 1fr); }
.yon-secenek { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1.5px solid var(--cizgi-2); border-radius: 10px; cursor: pointer; background: var(--yuzey); transition: border-color .12s, background .12s; }
.yon-secenek:hover { border-color: var(--metin-3); }
.yon-secenek.secili { border-color: var(--kirmizi); background: var(--kirmizi-acik); }
.yon-secenek:focus-within { box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.yon-secenek input[type="radio"] { position: absolute; opacity: 0; pointer-events: none; }
.yon-secenek b { font-size: 13px; }
.yon-secenek span { font-size: 12px; color: var(--metin-3); font-weight: 500; line-height: 1.35; }
.yon-secenek.secili span { color: var(--metin-2); }
.yon-secenek.yatay { flex-direction: row; align-items: center; gap: 12px; margin-bottom: 8px; }
.yon-secenek.yatay > div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.yon-hazir-kim { display: flex; gap: 10px; align-items: center; }
.yon-hazir-kim .avatar { width: 40px; height: 40px; font-size: 14px; }
.yon-pin { display: flex; gap: 10px; justify-content: center; margin: 16px 0 12px; }
.yon-pin span { width: 58px; height: 72px; display: grid; place-items: center; border-radius: 14px; background: var(--yuzey-2); border: 1.5px solid var(--kirmizi-cizgi); color: var(--metin); font-size: 40px; font-weight: 900; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.yon-metin { margin: 0; padding: 10px 12px; background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: 10px; font: 500 12.5px/1.55 var(--font); white-space: pre-wrap; word-break: break-word; color: var(--metin-2); max-height: 220px; overflow: auto; }
.yon-dugmeler { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.yon-dugmeler .btn { flex: 1 1 auto; }

/* onay */
.yon-istekler { display: grid; gap: 14px; }
.yon-istek { background: var(--yuzey); border: 1px solid var(--cizgi); border-left: 4px solid var(--cizgi-2); border-radius: var(--r-3); box-shadow: var(--golge-1); overflow: hidden; }
.yon-istek.risk-dusuk { border-left-color: var(--yesil); }
.yon-istek.risk-orta { border-left-color: var(--amber); }
.yon-istek.risk-yuksek { border-color: var(--kirmizi); box-shadow: 0 0 0 3px var(--kirmizi-acik), var(--golge-1); }
.yon-istek-ust { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--cizgi); }
.yon-istek-ust .zayif, .yon-gecmis .zayif, .yon-log .zayif { color: var(--metin-3); font-size: 12px; font-weight: 500; }
.yon-istek-sag { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.yon-istek-govde { padding: 16px 18px 18px; }
.yon-istek-metin { font-size: 16px; font-weight: 600; line-height: 1.5; white-space: pre-wrap; word-break: break-word; padding: 2px 0 2px 12px; border-left: 3px solid var(--metin-3); margin-bottom: 18px; }
.yon-atlas-baslik { color: var(--kirmizi); }
.yon-plan { background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: 10px; padding: 12px 14px; white-space: pre-wrap; word-break: break-word; font-size: 13.5px; line-height: 1.55; margin-bottom: 16px; }
.yon-degisiklik { margin: 0 0 16px; padding: 0; list-style: none; border: 1px solid var(--cizgi); border-radius: 10px; overflow: hidden; }
.yon-degisiklik li { padding: 7px 12px; font-size: 13px; font-weight: 600; border-bottom: 1px solid var(--cizgi); }
.yon-degisiklik li:last-child { border-bottom: 0; }
.yon-degisiklik li[data-firma] { cursor: pointer; }
.yon-degisiklik li[data-firma]:hover { background: var(--yuzey-2); }
.yon-karar { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; margin-top: 12px; }
.yon-reddet:hover:not(:disabled) { border-color: var(--kirmizi); color: var(--kirmizi); background: var(--kirmizi-acik); }
.yon-risk.dusuk { background: var(--yesil-acik); color: var(--yesil); }
.yon-risk.orta { background: var(--amber-acik); color: var(--amber); }
.yon-risk.yuksek { background: var(--kirmizi); color: #fff; }
.yon-ist.onay_bekliyor { background: var(--amber-acik); color: var(--amber); }
.yon-ist.onaylandi { background: var(--mavi-acik); color: var(--mavi); }
.yon-ist.reddedildi { background: var(--gri-acik); color: var(--metin-2); }
.yon-ist.yapiliyor { background: var(--mor-acik); color: var(--mor); animation: nabiz 1.4s infinite; }
.yon-ist.yapildi { background: var(--yesil-acik); color: var(--yesil); }
.yon-ist.hata { background: var(--turuncu-acik); color: var(--turuncu); }
.yon-gecmis { padding: 12px 16px; border-bottom: 1px solid var(--cizgi); display: grid; gap: 5px; }
.yon-gecmis:last-child { border-bottom: 0; }
.yon-gecmis-ust { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.yon-gecmis-metin { font-size: 13px; white-space: pre-wrap; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.yon-sonuc { font-size: 13px; background: var(--yesil-acik); border-radius: 8px; padding: 6px 10px; margin-top: 6px; white-space: pre-wrap; word-break: break-word; }
.yon-sonuc::before { content: 'Sonuç: '; font-weight: 800; color: var(--yesil); }
.yon-sonuc.hata { background: var(--turuncu-acik); }
.yon-sonuc.hata::before { content: 'Hata: '; color: var(--turuncu); }

/* günlük */
.yon-arac-cubugu { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.yon-ara { max-width: 320px; margin-left: auto; }
.yon-log { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--cizgi); }
.yon-log:last-of-type { border-bottom: 0; }
.yon-log-saat { font-weight: 800; font-size: 15px; font-variant-numeric: tabular-nums; display: flex; flex-direction: column; line-height: 1.25; }
.yon-log-saat span { font-size: 11px; font-weight: 600; color: var(--metin-3); }
.yon-log-ust { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.yon-log .alinti { white-space: pre-wrap; word-break: break-word; }
.yon-log-liste { list-style: none; margin: 8px 0 4px; padding: 0; display: grid; gap: 1px; }
.yon-log-liste li { font-size: 13px; font-weight: 600; padding: 3px 8px; border-radius: 6px; }
.yon-log-liste li::before { content: ''; display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--kirmizi); margin-right: 9px; vertical-align: 2px; }
.yon-log-liste li[data-firma] { cursor: pointer; }
.yon-log-liste li[data-firma]:hover { background: var(--yuzey-3); }

/* ayarlar */
.yon-ayar-izgara { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
.yon-saatler { display: flex; align-items: flex-end; gap: 10px; }
.yon-saatler > div { flex: 1; }
.yon-saatler .girdi { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.yon-saat-ok { padding-bottom: 10px; color: var(--metin-3); font-weight: 700; }
.yon-kaydet-satir { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.yon-kaydet-satir .durum, .yon-kaydet-bar .durum { margin-right: auto; font-size: 12px; font-weight: 700; color: var(--metin-3); }
.yon-kaydet-satir .durum.kirli, .yon-kaydet-bar .durum.kirli { color: var(--amber); }
.yon-hedef-sayi { width: 120px; flex: none; font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }
.yon-simdiki { font-size: 13px; color: var(--metin-2); margin-top: 4px; }
.yon-degisti { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 12px; background: var(--amber-acik); color: var(--amber); border-radius: 10px; font-weight: 700; font-size: 12.5px; margin-bottom: 12px; }
.yon-degisti span { flex: 1; }

/* whatsapp */
.yon-bilgi { display: flex; gap: 10px; align-items: center; padding: 10px 14px; background: var(--mavi-acik); color: var(--mavi); border-radius: 10px; font-weight: 700; font-size: 13px; margin-bottom: 14px; }
.yon-wa-duzen { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
.yon-wa-sol, .yon-wa-sag { display: grid; gap: 16px; min-width: 0; }
.yon-wa-sag { position: sticky; top: calc(var(--ust-h) + 20px); }
.yon-anahtarlar { padding-top: 2px; padding-bottom: 2px; }
.yon-anahtar-satir { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--cizgi); }
.yon-anahtar-satir:last-child { border-bottom: 0; }
.yon-anahtar-satir > div { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.yon-anahtar-satir span { font-size: 12px; color: var(--metin-3); }
.yon-degiskenler { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.yon-degiskenler .cip { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; height: 26px; font-size: 12px; }
textarea.yon-sablon { font-size: 14px; line-height: 1.5; min-height: 100px; }
.yon-sablon-alt { display: flex; gap: 10px; justify-content: space-between; font-size: 12px; color: var(--metin-3); margin-top: 6px; }
.yon-secili-grup { margin-top: 10px; font-size: 13px; color: var(--metin-2); }
.yon-wa-ekran { border-radius: 14px; overflow: hidden; background: #EFEAE2; border: 1px solid var(--cizgi); }
.yon-wa-ust { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #F0F2F5; color: #111B21; }
.yon-wa-ust b { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.yon-wa-ust span { font-size: 12px; color: #667781; }
.yon-wa-avatar { width: 34px; height: 34px; border-radius: 50%; background: #DFE5E7; color: #54656F; display: grid; place-items: center; flex: none; }
.yon-wa-akis { padding: 18px 12px 16px; min-height: 110px; display: flex; flex-direction: column; justify-content: flex-end; }
.yon-wa-balon { align-self: flex-end; max-width: 92%; background: #D9FDD3; color: #111B21; border-radius: 10px 2px 10px 10px; padding: 7px 9px 8px; font-size: 14px; line-height: 1.42; box-shadow: 0 1px .5px rgba(11, 20, 26, .13); overflow-wrap: anywhere; }
.yon-wa-saat { float: right; margin: 7px 0 -4px 12px; font-size: 11px; color: #667781; white-space: nowrap; }
.yon-wa-saat b { color: #53BDEB; font-weight: 400; }
:root[data-tema="koyu"] .yon-wa-ekran { background: #0B141A; }
:root[data-tema="koyu"] .yon-wa-ust { background: #202C33; color: #E9EDEF; }
:root[data-tema="koyu"] .yon-wa-ust span, :root[data-tema="koyu"] .yon-wa-saat { color: #8696A0; }
:root[data-tema="koyu"] .yon-wa-avatar { background: #374248; color: #AEBAC1; }
:root[data-tema="koyu"] .yon-wa-balon { background: #005C4B; color: #E9EDEF; }
.yon-onizleme-alt { font-size: 12px; color: var(--metin-3); margin-top: 8px; line-height: 1.45; }
.yon-onizleme-alt a { color: var(--metin); font-weight: 700; text-decoration: underline; text-decoration-color: var(--cizgi-2); text-underline-offset: 2px; }
.yon-wa-son { list-style: none; margin: 0; padding: 0; }
.yon-wa-son li { display: flex; gap: 10px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--cizgi); font-size: 12.5px; }
.yon-wa-son li:last-child { border-bottom: 0; }
.yon-wa-son .zayif { color: var(--metin-3); font-variant-numeric: tabular-nums; }
.yon-wa-son-metin { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.yon-wa-d { background: var(--gri-acik); color: var(--metin-2); }
.yon-wa-d.gonderildi, .yon-wa-d.gitti { background: var(--yesil-acik); color: var(--yesil); }
.yon-wa-d.hata { background: var(--turuncu-acik); color: var(--turuncu); }
.yon-kaydet-bar { position: sticky; bottom: 16px; z-index: 5; display: flex; align-items: center; gap: 10px; margin: 16px 76px 0 0; padding: 10px 12px 10px 16px; background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: var(--r-2); box-shadow: var(--golge-2); }
.yon-kaydet-bar .durum { font-size: 13px; }

/* veri */
.yon-veri-izgara { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.yon-bar-satir { display: grid; grid-template-columns: 124px minmax(0, 1fr) 92px; gap: 12px; align-items: center; padding: 6px 0; }
.yon-bar { height: 10px; border-radius: 999px; background: var(--gri-acik); overflow: hidden; }
.yon-bar i { display: block; height: 100%; border-radius: 999px; background: var(--metin-3); transition: width .4s; }
.yon-bar-sayi { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.yon-bar-sayi b { font-size: 15px; font-weight: 800; }
.yon-bar-sayi span { font-size: 12px; color: var(--metin-3); margin-left: 6px; font-weight: 600; }
.yon-bar i.b-bizde { background: var(--kirmizi); }
.yon-bar i.b-yolda { background: var(--kirmizi-cizgi); }
.yon-bar i.b-belirsiz { background: var(--gri); }
.yon-bar i.b-karsi { background: var(--metin); }
.yon-bar i.b-oy_yok { background: var(--cizgi-2); }
.yon-bar i.bd-bekliyor { background: var(--gri); }
.yon-bar i.bd-arandi { background: var(--mavi); }
.yon-bar i.bd-yolda { background: var(--amber); }
.yon-bar i.bd-fuarda { background: var(--mor); }
.yon-bar i.bd-oy_kullandi { background: var(--yesil); }
.yon-bar i.bd-kendi { background: var(--metin-2); }
.yon-tehlike { border-color: var(--kirmizi-cizgi); }
.yon-tehlike .kart-baslik { color: var(--kirmizi); border-bottom-color: var(--kirmizi-cizgi); }
.yon-tehlike .kart-baslik > .yon-i { color: var(--kirmizi); }
.yon-tehlike-govde { display: flex; gap: 20px; align-items: center; justify-content: space-between; }
.yon-tehlike-govde p { margin: 0 0 6px; color: var(--metin-2); line-height: 1.5; max-width: 680px; }
.yon-tehlike-govde .zayif { color: var(--metin-3); font-size: 13px; }

@media (max-width: 1360px) { .yon-iki { grid-template-columns: 1fr; } .yon-yeni { position: static; } }
@media (max-width: 1240px) { .yon-iki, .yon-wa-duzen { grid-template-columns: 1fr; } .yon-yeni, .yon-wa-sag { position: static; } }
@media (max-width: 900px) {
  .yon-duzen { grid-template-columns: 1fr; }
  .yon-menu { position: static; flex-direction: row; overflow-x: auto; scrollbar-width: none; }
  .yon-menu-ayrac { display: none; }
  .yon-veri-izgara, .yon-secenekler.uc { grid-template-columns: 1fr; }
  .yon-tehlike-govde { flex-direction: column; align-items: stretch; }
  .yon-kaydet-bar { margin-right: 0; }
}
`;
