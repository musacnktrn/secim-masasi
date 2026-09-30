// 72. Komite · Seçim Masası · ADMIN PANELİ (SM Yonetim tasarımı, ATLAS 2026-09-30)
// Yalnız admin (rol 'yonetici'), masaüstü. Sol dikey sekmeler: Kullanıcılar · Onay bekleyenler · Görev dağılımı · ATLAS işlem günlüğü · Ayarlar · WhatsApp bildirimleri · Veri.
// Yazma yalnız core.js işlevleriyle (yonetim, profilleriYenile, istekKarar, ayarYaz, durumYap, sinifYap, aracAta, sorumluAta, aracSorumluAta, firmaAlanYaz).
// Ek okuma: wa_gruplar (grup listesi) ve store'a sığmayan eski ATLAS olayları.
import {
  store, bus, sb, esc, fmt, trBaslik, trArama, SINIFLAR, SINIF_AD, DURUM_AD, ROL_AD,
  firmaListesi, sayac, hedefSayi, olayMetni, firmaAdi, ulasim, aracOf, simdi, simdiDk, dakika, ekip, referanslar,
  ayarYaz, yonetim, profilleriYenile, istekKarar, durumYap, sinifYap, aracAta, sorumluAta, aracSorumluAta, firmaAlanYaz, yoneticiMi,
} from '../core.js';
import { bas, toast, hataGoster, modal, modalKapat, onayla, kisiKartiAc } from '../ui.js';

// ================================================================ sabitler
const SEKMELER = [
  { k: 'kullanicilar', ad: 'Kullanıcılar' },
  { k: 'onay', ad: 'Onay bekleyenler' },
  { k: 'gorev', ad: 'Görev dağılımı' },
  { k: 'gunluk', ad: 'ATLAS işlem günlüğü' },
  { k: 'ayarlar', ad: 'Ayarlar' },
  { k: 'whatsapp', ad: 'WhatsApp bildirimleri' },
  { k: 'veri', ad: 'Veri' },
];
const ROL_SIRA = { yonetici: 0, kurul: 1, masa: 2, sorumlu: 3, sofor: 4, rapor: 5, bot: 6 };
const ROL_SECENEK = ['masa', 'kurul', 'rapor', 'sofor', 'sorumlu', 'yonetici'];
const ROL_ACIKLAMA = {
  masa: 'Masa, kişiler, harita, işaretleme',
  kurul: 'Masa düzeyinde görür ve işaretler; ayar ve kullanıcı yönetimi yok',
  rapor: 'Yalnız telefon raporu, salt okunur',
  sofor: 'Yalnız kendi aracı ve yolcuları',
  sorumlu: 'Sorumlu olduğu kişiler ve araçlar',
  yonetici: 'Tüm ekranlar + Admin paneli',
};
const RISK_AD = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const ISTEK_AD = { onay_bekliyor: 'Onay bekliyor', onaylandi: 'Onaylandı · yapılıyor', yapiliyor: 'Yapılıyor', yapildi: '✓ Yapıldı', reddedildi: 'Reddedildi', hata: 'Hata' };
const ISTEK_SIRA = { onay_bekliyor: 0, onaylandi: 1, yapiliyor: 1, hata: 2, yapildi: 2, reddedildi: 3 };
const ULASIM_AD = { servis: 'Servis', kendi: 'Kendi gelecek', yok: '' };
const DEGISIKLIK_ALAN = { durum: 'durum', oy_sinifi: 'sınıf', arac_id: 'araç', notlar: 'not', kendi_geldi: 'kendi geldi', tasima_saati: 'taşıma saati', durum_arac: 'araç durumu', sorumlu_id: 'sorumlu' };
const WA_VARSAYILAN = {
  grup_jid: null, grup_ad: null,
  olaylar: { oy_kullandi: true, fuarda: false, geciken: false, saat_basi: true },
  mod: 'anlik',
  sablon: '✅ {saat} {yetkili} ({firma}) oy kullandı · Referans: {referans} · {kullanan}/{hedef}',
};
const WA_OLAYLAR = [
  ['oy_kullandi', 'Oy kullandı', 'Her oy işaretinde'],
  ['fuarda', 'Fuara geldi', 'Kişi fuar alanına ulaştığında'],
  ['geciken', 'Geciken alım', 'Saati 10 dk geçen alımlar'],
  ['saat_basi', 'Saat başı özet', 'Her saat başı kullanan / hedef özeti'],
];
const WA_MODLAR = [['anlik', 'Anlık'], ['toplu10', '10 dk toplu'], ['saat_basi', 'Saat başı']];
const WA_MOD_AD = Object.fromEntries(WA_MODLAR);
const WA_DEGISKENLER = [
  ['saat', 'İşaret saati'], ['yetkili', 'Yetkili ad soyad'], ['firma', 'Firma ünvanı'], ['referans', 'Referans'],
  ['kullanan', 'Bizim listeden oy kullanan'], ['hedef', 'Hedef'], ['ilce', 'İlçe'],
];
const WA_DURUM_AD = { bekliyor: 'Sırada', sirada: 'Sırada', gonderiliyor: 'Gidiyor', gonderildi: '✓ iletildi', gitti: '✓ iletildi', hata: 'Hata', atlandi: 'Atlandı', toplu: 'Toplu' };

// ================================================================ ekran durumu
let kok = null, sekme = 'kullanicilar', kapat = [], bekleyen = new Set(), planli = false, kaydediyor = false;
// Kaydedilmemiş ayar taslakları (ekrandan çıkıp dönünce kaybolmaz). 'ayar' = tarih/yer/masa telefonu/çizelge/hedef birlikte.
const taslak = { ayar: null, whatsapp: null };
const taban = {}, cakisma = {};

// Realtime DELETE olayı store'a kimliksiz boş satır bırakabiliyor: yalnız gerçek satırlar
const istekListesi = () => store.istekler.filter(i => i && i.id != null);
const bekleyenSay = () => istekListesi().filter(i => i.durum === 'onay_bekliyor').length;
const bolumEl = () => kok?.querySelector('.yon-bolum');
const zamanMs = t => (t ? new Date(t).getTime() : 0);
const kararli = v => JSON.stringify(v ?? null, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(a => [a, x[a]])) : x));
const uygulamaAdresi = () => location.origin + location.pathname;
const waPaylas = metin => fmt.waLink('', metin) || `https://wa.me/?text=${encodeURIComponent(metin)}`;
const bizListe = f => f.oy_sinifi === 'bizde' || f.oy_sinifi === 'yolda';
function goreliUzun(ts) {
  if (!ts) return '';
  if (Date.now() - zamanMs(ts) < 86400000) return fmt.goreli(ts);
  const d = new Date(ts); return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${fmt.saat(d)}`;
}
function sonGirisMetni(ts) {
  if (!ts) return '-';
  const d = new Date(ts), b = new Date();
  return d.toDateString() === b.toDateString() ? fmt.saat(d) : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
/** "Ayşe" -> "Ayşe'ye", "Selin" -> "Selin'e" (yönelme eki) */
function dat(ad) {
  const s = trBaslik(String(ad || '').trim().split(/\s+/)[0] || ''); if (!s) return '';
  const h = s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşüâîû]/g, ''), unlu = 'aeıioöuüâîû';
  let son = ''; for (const c of h) if (unlu.includes(c)) son = c;
  const kalin = 'aıouâû'.includes(son), sonUnlu = unlu.includes(h.slice(-1));
  return `${s}'${sonUnlu ? 'y' : ''}${kalin ? 'a' : 'e'}`;
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
const baslikSatiri = (baslik, alt = '') => `<div class="yon-bolum-baslik"><h2>${esc(baslik)}</h2>${alt ? `<span class="alt">${alt}</span>` : ''}</div>`;
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
function hataYaz(sec, metin) { const h = kok?.querySelector(sec); if (h) h.textContent = metin; }
const anahtarHtml = (acik, veri, etiket = '') => `<button type="button" class="anahtar ${acik ? 'acik' : ''}" ${veri} role="switch" aria-checked="${!!acik}" ${etiket ? `aria-label="${esc(etiket)}"` : ''}></button>`;

// ---------------------------------------------------------------- ayar taslakları
const tabanOf = k => (k === 'ayar' ? kararli({ secim: store.ayarlar.secim, zaman: store.ayarlar.zaman, hedef: store.ayarlar.hedef }) : kararli(store.ayarlar[k]));
function taslakBaslat(k, deger) {
  if (!taslak[k]) {
    taslak[k] = structuredClone(deger); taban[k] = tabanOf(k); cakisma[k] = false;
    menuCiz(); kaydetSatirGuncelle(k);
  }
  return taslak[k];
}
function taslakBirak(k) { taslak[k] = null; taban[k] = null; cakisma[k] = false; menuCiz(); }
function ayarDegisti(anahtar) {
  if (kaydediyor) return;
  const k = ['secim', 'zaman', 'hedef'].includes(anahtar) ? 'ayar' : anahtar;
  if (taslak[k] && tabanOf(k) !== taban[k]) { cakisma[k] = true; cakismaGuncelle(k); }
}
function cakismaHtml(k) {
  return cakisma[k] && taslak[k]
    ? `<div class="yon-degisti"><span>Bu ayar başka bir oturumda değişti. Kaydedersen onun üzerine yazılır.</span><button class="btn btn-kucuk" data-taslak-at="${k}">Yeni hali göster</button></div>`
    : '';
}
function cakismaGuncelle(k) { const c = kok?.querySelector(`[data-cakisma="${k}"]`); if (c) c.innerHTML = cakismaHtml(k); }
function kaydetSatirIc(k) {
  const kirli = !!taslak[k];
  return `<span class="durum ${kirli ? 'kirli' : ''}">${kirli ? 'Kaydedilmemiş değişiklik var' : 'Kayıtlı, herkese uygulanıyor'}</span>
    ${kirli ? `<button class="btn btn-hayalet btn-kucuk" data-vazgec="${k}">Vazgeç</button>` : ''}
    <button class="btn btn-koyu" data-kaydet="${k}" ${kirli ? '' : 'disabled'}>Kaydet</button>`;
}
function kaydetSatirGuncelle(k) { const s = kok?.querySelector(`[data-kaydet-satir="${k}"]`); if (s) s.innerHTML = kaydetSatirIc(k); }

// ================================================================ 1) KULLANICILAR
const yeni = { ad: '', rol: 'masa', arac: '', sonuc: null, mesgul: false, hata: '' };
const pinler = new Map();   // PIN kasası (pin_kasasi tablosu, yalnız Admin okur) + bu oturumda üretilenler
let pinGoster = false, pinYuklendi = false;
async function pinKasasiYukle() {
  const { data, error } = await sb.from('pin_kasasi').select('kullanici_id, pin');
  if (!error) { (data || []).forEach(x => pinler.set(x.kullanici_id, x.pin)); pinYuklendi = true; }
}
function pinKaydet(id, pin) {   // yeni/sıfırlanan PIN'i kasaya yaz (yalnız Admin'in RLS izni var)
  if (!id || !pin) return; pinler.set(id, pin);
  sb.from('pin_kasasi').upsert({ kullanici_id: id, pin, zaman: new Date().toISOString() }).then(({ error }) => { if (error) console.warn('PIN kasası', error.message); });
}
const islemde = new Set();

const rolRozet = rol => `<span class="yon-rol r-${esc(rol)}">${esc(ROL_AD[rol] || rol)}</span>`;

// Yönetim kurulu üyesi = kişiyi tanıyan REFERANS. Kullanıcı adı tablodaki REFERANS yazımıyla eşleşir (büyük/küçük harf ve Türkçe karakter farkı önemsiz).
function refAlt(p) {
  const ad = trArama(p.ad_soyad || '');
  const l = firmaListesi().filter(f => [f.referans, f.referans2].some(r => r && trArama(r) === ad));
  if (!l.length) return 'Referans listesinde yok';
  const kars = l.filter(f => f.karsilayan && trArama(f.karsilayan) === ad).length;
  return `Referans: ${fmt.sayi(l.length)} kişi${kars ? ` · ${fmt.sayi(kars)} karşıladı` : ''}`;
}
function kullaniciSatir(p) {
  const ben = p.id === store.ben?.id, bot = p.rol === 'bot', is = islemde.has(p.id);
  const aracYaz = alan => [...store.araclar.values()].filter(a => a[alan] === p.id).map(a => fmt.plaka(a.plaka));
  const alt = bot ? 'Sistem hesabı (bildirim ve ATLAS)'
    : p.rol === 'sofor' ? (aracYaz('sofor_kullanici').length ? `Araç: ${aracYaz('sofor_kullanici').join(', ')}` : 'Araç bağlı değil')
      : p.rol === 'sorumlu' && aracYaz('sorumlu_id').length ? `Araç: ${aracYaz('sorumlu_id').join(', ')}` : p.rol === 'kurul' ? refAlt(p) : '';
  const pin = pinGoster ? pinler.get(p.id) : null;
  const islem = bot ? '<span class="yon-zayif">İşlem yapılamaz</span>' : `
    ${is ? '<span class="yon-donen" title="İşleniyor"></span>' : ''}
    <button class="yon-mini" data-islem="pin" ${is ? 'disabled' : ''}>PIN sıfırla</button>
    <button class="yon-mini soluk" data-islem="aktiflik" ${ben || is ? 'disabled' : ''} ${ben ? 'title="Kendini pasifleştiremezsin"' : ''}>${p.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
    <button class="yon-mini ikon" data-islem="duzenle" ${is ? 'disabled' : ''} title="Rol ve silme" aria-label="Rol ve silme">⋯</button>`;
  return `<div class="yon-satir yon-kul ${bot ? 'bot' : ''} ${p.aktif ? '' : 'pasif'}" data-kid="${esc(p.id)}">
    <div class="yon-kisi"><div class="yon-avatar">${esc(bas(p.ad_soyad))}</div><div style="min-width:0"><div class="yon-ad">${esc(p.ad_soyad)}${ben ? '<span class="yon-sen">sen</span>' : ''}</div>${alt ? `<div class="yon-alt">${esc(alt)}</div>` : ''}</div></div>
    <div>${rolRozet(p.rol)}</div>
    <div class="yon-pin-kucuk ${pin ? 'acik' : ''}" ${pin ? '' : `title="${pinGoster ? 'Bu kişinin PIN kaydı yok. PIN sıfırla ile yenisini üret.' : 'Görmek için üstteki PIN göster düğmesi'}"`}>${pin ? esc(pin) : '••••'}</div>
    <div>${bot ? '' : anahtarHtml(p.aktif, `data-islem="aktiflik" ${ben || is ? 'disabled' : ''}`, p.aktif ? 'Aktif' : 'Pasif')}</div>
    <div class="yon-son">${esc(sonGirisMetni(p.son_giris))}</div>
    <div class="yon-islem">${islem}</div>
  </div>`;
}
function tabloCiz() {
  const kap = kok?.querySelector('[data-k-tablo]'); if (!kap) return;
  const liste = [...store.profiller.values()].sort((a, b) => (Number(b.aktif) - Number(a.aktif)) || ((ROL_SIRA[a.rol] ?? 9) - (ROL_SIRA[b.rol] ?? 9)) || String(a.ad_soyad).localeCompare(String(b.ad_soyad), 'tr'));
  const insan = liste.filter(p => p.rol !== 'bot');
  const oz = kok.querySelector('[data-k-ozet]'); if (oz) oz.textContent = `${insan.filter(p => p.aktif).length} aktif · ${insan.length} toplam`;
  kap.innerHTML = liste.length
    ? `<div class="yon-kaydir"><div class="yon-tablo-ic"><div class="yon-satir yon-kul yon-baslik-satir"><div>AD SOYAD</div><div>ROL</div><div><button type="button" class="yon-mini" data-pin-goster style="padding:2px 8px">${pinGoster ? 'PIN gizle' : 'PIN göster'}</button></div><div>AKTİF</div><div>SON GİRİŞ</div><div></div></div>${liste.map(kullaniciSatir).join('')}</div></div>`
    : '<div class="bos">Henüz kullanıcı yok. Sağdaki formdan ilk üyeyi oluştur.</div>';
}
function yeniCiz() {
  const kap = kok?.querySelector('[data-yeni]'); if (!kap) return;
  const r = yeni.sonuc, metin = r ? girisMetni(r.ad_soyad, r.pin, r.rol, true) : '';
  const araclar = [...store.araclar.values()].sort((a, b) => fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr'));
  const aracAlan = yeni.rol === 'sofor' ? 'sofor_kullanici' : yeni.rol === 'sorumlu' ? 'sorumlu_id' : null;
  kap.innerHTML = `
    <div class="yon-etiket-kirmizi">HIZLI ÜYE OLUŞTUR</div>
    <div class="yon-aciklama">PIN otomatik üretilir, tek tıkla paylaşılır.</div>
    <div class="yon-alan">
      <label class="yon-lbl" for="yon-yeni-ad">Ad soyad</label>
      <input id="yon-yeni-ad" class="yon-girdi buyuk" data-yeni-ad data-odak="yeni-ad" value="${esc(yeni.ad)}" placeholder="ör. Tuğba Keskin" autocomplete="off" autocapitalize="words" ${yeni.mesgul ? 'disabled' : ''}>
    </div>
    <div class="yon-alan">
      <div class="yon-lbl">Rol</div>
      <div class="yon-seg uc">${ROL_SECENEK.map(k => `<button type="button" class="${yeni.rol === k ? 'aktif' : ''}" data-yeni-rol="${k}">${esc(ROL_AD[k])}</button>`).join('')}</div>
      <div class="yon-ipucu">${esc(ROL_ACIKLAMA[yeni.rol])}</div>
    </div>
    ${aracAlan ? `<div class="yon-alan"><label class="yon-lbl">Aracı <span class="yon-zayif">(isteğe bağlı)</span></label>
      <select class="yon-girdi" data-yeni-arac>
        <option value="">Sonra bağlanacak</option>
        ${araclar.map(a => { const bagli = a[aracAlan] ? store.profiller.get(a[aracAlan]) : null; return `<option value="${a.id}" ${String(a.id) === String(yeni.arac) ? 'selected' : ''}>${esc(fmt.plaka(a.plaka))}${a.sofor_ad ? ' · ' + esc(trBaslik(a.sofor_ad)) : ''}${bagli ? ` (şu an: ${esc(bagli.ad_soyad)})` : ''}</option>`; }).join('')}
      </select></div>` : ''}
    <div class="yon-pin-kutu ${r ? 'dolu' : ''}">
      <div><div class="yon-mikro">PIN${r ? ` · ${esc(trBaslik(r.ad_soyad))}` : ''}</div><div class="yon-pin-buyuk">${r ? esc(r.pin) : '····'}</div></div>
      <button type="button" class="yon-mini buyuk" data-yeni-yenipin ${r && !yeni.mesgul ? '' : 'disabled'} title="${r ? 'Bu üye için yeni PIN üret' : 'PIN üyeyi oluşturunca üretilir'}">↻ Yeni PIN</button>
    </div>
    ${r ? '<div class="yon-uyari-satir">PIN yalnız şimdi görünür. Başka üye eklemeden önce gönder ya da kopyala.</div>' : '<div class="yon-ipucu">PIN, üye oluşturulunca sunucuda üretilir ve burada görünür.</div>'}
    <div class="yon-ikili">
      <button type="button" class="yon-dugme" data-yeni-kopyala ${r ? '' : 'disabled'}>Kopyala</button>
      <a class="yon-dugme ${r ? '' : 'pasif'}" ${r ? `target="_blank" rel="noopener" href="${esc(waPaylas(metin))}"` : 'aria-disabled="true"'}>WhatsApp'la gönder</a>
    </div>
    <div class="yon-hata" data-yeni-hata>${esc(yeni.hata)}</div>
    <button type="button" class="yon-ana-dugme" data-yeni-olustur ${yeni.mesgul ? 'disabled' : ''}>${yeni.mesgul ? 'Oluşturuluyor…' : 'Üyeyi oluştur'}</button>`;
}
async function uyeOlustur() {
  if (yeni.mesgul) return;
  const ad = trBaslik(yeni.ad.trim().replace(/\s+/g, ' '));
  const hata = m => { yeni.hata = m; hataYaz('[data-yeni-hata]', m); kok?.querySelector('[data-yeni-ad]')?.focus(); };
  if (ad.split(' ').length < 2 || ad.length < 5) return hata('Ad ve soyadı birlikte yaz');
  if ([...store.profiller.values()].some(p => trArama(p.ad_soyad) === trArama(ad))) return hata('Bu ad soyadla bir hesap zaten var. Girişte ad kullanıldığı için her ad tek olmalı.');
  if (yeni.rol === 'yonetici' && !(await onayla(`${ad} Admin olsun mu? Kullanıcıları, ayarları ve ATLAS onaylarını yönetebilir.`, { evet: 'Admin yap' }))) return;
  yeni.mesgul = true; yeni.hata = ''; yeniCiz();
  try {
    const govde = { ad_soyad: ad, rol: yeni.rol };
    if ((yeni.rol === 'sofor' || yeni.rol === 'sorumlu') && yeni.arac) govde.arac_id = Number(yeni.arac);
    const r = await yonetim('olustur', govde);
    if (!r?.pin) throw new Error('PIN alınamadı, listeden "PIN sıfırla" ile yeniden üret');
    yeni.sonuc = { id: r.id, ad_soyad: r.ad_soyad || ad, rol: r.rol || yeni.rol, pin: r.pin };
    if (r.id) pinKaydet(r.id, r.pin);
    yeni.ad = ''; yeni.arac = '';
    toast(`${yeni.sonuc.ad_soyad} eklendi · ${ROL_AD[yeni.sonuc.rol]}`, { tur: 'basari' });
    profilleriYenile().catch(e => console.warn('profiller', e));
  } catch (e) { yeni.hata = e.message || String(e); }
  finally { yeni.mesgul = false; yeniCiz(); tabloCiz(); }
}
async function sonUyeYeniPin() {
  const r = yeni.sonuc; if (!r?.id || yeni.mesgul) return;
  if (!(await onayla(`${r.ad_soyad} için yeni PIN üretilsin mi? Eski PIN hemen geçersiz olur.`, { evet: 'Yeni PIN üret' }))) return;
  yeni.mesgul = true; yeniCiz();
  try { const s = await yonetim('pin_sifirla', { id: r.id }); r.pin = s.pin; pinKaydet(r.id, s.pin); }
  catch (e) { hataGoster(e); }
  finally { yeni.mesgul = false; yeniCiz(); tabloCiz(); }
}
function pinModal(p, pin) {
  const metin = girisMetni(p.ad_soyad, pin, p.rol, false);
  const m = modal(`Yeni PIN · ${p.ad_soyad}`, `
    <div class="yon-pin-kutu dolu" style="margin-top:0"><div><div class="yon-mikro">PIN</div><div class="yon-pin-buyuk">${esc(pin)}</div></div></div>
    <div class="yon-uyari-satir" style="margin-top:12px">Bu PIN yalnız şimdi görünür. Eski PIN artık çalışmaz.</div>
    <div class="yon-lbl" style="margin-top:14px">Gönderilecek metin</div>
    <pre class="yon-metin">${esc(metin)}</pre>`,
  `<button class="btn" data-kopyala>Kopyala</button><a class="btn btn-yesil" target="_blank" rel="noopener" href="${esc(waPaylas(metin))}">WhatsApp'la gönder</a><button class="btn btn-koyu" data-kapat>Tamam</button>`);
  // PIN bir daha gösterilmez: arka plana yanlışlıkla tıklamak kapatmasın
  m.addEventListener('click', e => { if (e.target === m) e.stopImmediatePropagation(); }, true);
  m.querySelector('[data-kopyala]').onclick = () => kopyala(metin);
}
function duzenleModal(p) {
  let rol = p.rol; const ben = p.id === store.ben?.id;
  const m = modal(p.ad_soyad, `
    <div class="yon-lbl">Rol</div>
    <div class="yon-seg uc" data-d-rol>${ROL_SECENEK.map(k => `<button type="button" class="${rol === k ? 'aktif' : ''}" data-r="${k}" ${ben ? 'disabled' : ''}>${esc(ROL_AD[k])}</button>`).join('')}</div>
    <div class="yon-ipucu" data-d-ipucu>${ben ? 'Kendi rolünü değiştiremezsin.' : esc(ROL_ACIKLAMA[rol])}</div>`,
  `<button class="btn btn-kirmizi" style="margin-right:auto" data-sil ${ben ? 'disabled title="Kendini silemezsin"' : ''}>Kullanıcıyı sil</button><button class="btn" data-kapat>Vazgeç</button><button class="btn btn-koyu" data-kaydet ${ben ? 'disabled' : ''}>Rolü kaydet</button>`);
  m.querySelector('[data-d-rol]').onclick = e => {
    const b = e.target.closest('[data-r]'); if (!b || b.disabled) return; rol = b.dataset.r;
    m.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('aktif', x === b)); m.querySelector('[data-d-ipucu]').textContent = ROL_ACIKLAMA[rol];
  };
  m.querySelector('[data-kaydet]').onclick = () => { modalKapat(); if (rol !== p.rol) kullaniciIslem('rol', p.id, rol); };
  m.querySelector('[data-sil]').onclick = () => { modalKapat(); kullaniciIslem('sil', p.id); };
}
async function kullaniciIslem(islem, id, deger) {
  const p = store.profiller.get(id); if (!p || p.rol === 'bot' || islemde.has(id)) return;
  const ad = p.ad_soyad;
  let basladi = false;
  try {
    if (islem === 'duzenle') return duzenleModal(p);
    if (islem === 'pin') {
      if (!(await onayla(`${ad} için yeni PIN üretilsin mi? Eski PIN hemen geçersiz olur.`, { evet: 'Yeni PIN üret' }))) return;
      islemde.add(id); basladi = true; tabloCiz();
      const r = await yonetim('pin_sifirla', { id });
      pinKaydet(id, r.pin); pinModal(p, r.pin);
    } else if (islem === 'aktiflik') {
      const aktif = !p.aktif;
      if (!aktif && !(await onayla(`${ad} pasifleştirilsin mi? Bir daha giriş yapamaz; istediğinde yeniden aktifleştirebilirsin.`, { evet: 'Pasifleştir', tehlike: true }))) return;
      islemde.add(id); basladi = true; tabloCiz();
      await yonetim('aktiflik', { id, aktif }); await profilleriYenile();
      toast(aktif ? `${ad} aktifleştirildi` : `${ad} pasifleştirildi`, { tur: 'basari' });
    } else if (islem === 'rol') {
      if (deger === p.rol) return;
      if (deger === 'yonetici' && !(await onayla(`${ad} Admin olsun mu? Kullanıcıları, ayarları ve ATLAS onaylarını yönetebilir.`, { evet: 'Admin yap' }))) return;
      islemde.add(id); basladi = true; tabloCiz();
      await yonetim('rol', { id, rol: deger }); await profilleriYenile();
      toast(`${ad} artık ${ROL_AD[deger]}`, { tur: 'basari' });
    } else if (islem === 'sil') {
      if (!(await onayla(`${ad} kalıcı olarak silinsin mi? Hesabı ve PIN'i yok olur, bu geri alınamaz.`, { evet: 'Kalıcı olarak sil', tehlike: true }))) return;
      islemde.add(id); basladi = true; tabloCiz();
      await yonetim('sil', { id }); store.profiller.delete(id); pinler.delete(id); await profilleriYenile();
      toast(`${ad} silindi`);
    }
  } catch (e) { hataGoster(e); }
  finally { islemde.delete(id); if (basladi) tabloCiz(); }
}
const kullanicilar = {
  kur(b) {
    b.addEventListener('click', async e => {
      if (e.target.closest('[data-pin-goster]')) {
        pinGoster = !pinGoster;
        if (pinGoster && !pinYuklendi) await pinKasasiYukle();
        tabloCiz(); return;
      }
      const t = e.target.closest('[data-islem],[data-yeni-olustur],[data-yeni-kopyala],[data-yeni-rol],[data-yeni-yenipin]'); if (!t || t.disabled) return;
      if (t.dataset.islem) kullaniciIslem(t.dataset.islem, t.closest('[data-kid]')?.dataset.kid);
      else if ('yeniOlustur' in t.dataset) uyeOlustur();
      else if ('yeniYenipin' in t.dataset) sonUyeYeniPin();
      else if ('yeniKopyala' in t.dataset && yeni.sonuc) kopyala(girisMetni(yeni.sonuc.ad_soyad, yeni.sonuc.pin, yeni.sonuc.rol, true));
      else if (t.dataset.yeniRol) { yeni.rol = t.dataset.yeniRol; yeni.arac = ''; yeniCiz(); }
    });
    b.addEventListener('change', e => { if (e.target.matches('[data-yeni-arac]')) yeni.arac = e.target.value; });
    b.addEventListener('input', e => {
      if (!e.target.matches('[data-yeni-ad]')) return;
      yeni.ad = e.target.value;
      if (yeni.hata) { yeni.hata = ''; hataYaz('[data-yeni-hata]', ''); }
    });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-yeni-ad]')) { e.preventDefault(); uyeOlustur(); } });
  },
  ciz(b) {
    b.innerHTML = `
      <div class="yon-kul-duzen">
        <div class="yon-kart">
          <div class="yon-kart-ust"><b>Kullanıcılar</b><span class="alt" data-k-ozet></span></div>
          <div data-k-tablo></div>
        </div>
        <div class="yon-kart yon-yeni" data-yeni></div>
      </div>`;
    tabloCiz(); yeniCiz();
  },
  yenile(s) {
    if (['profil', 'arac', 'araclar', 'saat', 'hazir'].some(x => s.has(x))) tabloCiz();
    if ((yeni.rol === 'sofor' || yeni.rol === 'sorumlu') && ['arac', 'araclar', 'profil'].some(x => s.has(x)) && !kok?.querySelector('[data-yeni]')?.contains(document.activeElement)) yeniCiz();
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
  const deger = v => {
    if (v == null || v === '') return 'boş';
    if (d.alan === 'durum') { const [k, kendi] = String(v).split('+'); return (DURUM_AD[k] || k) + (kendi ? ' (kendi)' : ''); }
    if (d.alan === 'oy_sinifi') return SINIF_AD[v] || v;
    if (d.alan === 'arac_id') { const x = store.araclar.get(Number(v)); return x ? fmt.plaka(x.plaka) : String(v); }
    if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
    return String(v);
  };
  if (d.alan === 'notlar') return `${kim} · not: ${String(d.yeni || '').split('\n').pop()}`;
  return `${kim} · ${DEGISIKLIK_ALAN[d.alan] || d.alan}: ${deger(d.eski)} → ${deger(d.yeni)}`;
}
function etkiMetni(i, deg) {
  if (!deg.length) return 'Kayıt sayısı plan uygulanınca belli olur';
  const kisi = new Set(deg.filter(d => d.firma_id != null).map(d => d.firma_id)).size, arac = new Set(deg.filter(d => d.arac_id != null).map(d => d.arac_id)).size;
  const alanlar = [...new Set(deg.map(d => DEGISIKLIK_ALAN[d.alan] || String(d.alan || '').replace(/_/g, ' ')))];
  return `${[kisi ? `${kisi} kişi` : '', arac ? `${arac} araç` : ''].filter(Boolean).join(' · ') || `${deg.length} kayıt`} · ${alanlar.join(', ')}`;
}
const planAdimlari = plan => String(plan || '').split(/\n+/).map(s => s.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
const durumSinif = d => (d === 'onay_bekliyor' ? 'bek' : d === 'yapildi' ? 'ok' : d === 'reddedildi' ? 'red' : d === 'hata' ? 'hata' : 'yap');

function istekKart(i) {
  const p = store.profiller.get(i.isteyen_id), rol = p?.rol, is = kararda.has(i.id);
  const ad = i.isteyen_ad || p?.ad_soyad || 'Bilinmeyen';
  const deg = istekDegisiklikleri(i), adimlar = planAdimlari(i.plan);
  const bekliyor = i.durum === 'onay_bekliyor', yapiliyor = i.durum === 'onaylandi' || i.durum === 'yapiliyor';
  const onayZaman = i.onay_zamani ? fmt.saat(i.onay_zamani) : '';
  return `<article class="yon-istek ${bekliyor ? 'bekliyor' : ''} ${i.durum === 'reddedildi' ? 'red' : ''}" data-istek="${i.id}">
    <header class="yon-istek-ust">
      <div class="yon-avatar orta">${esc(bas(ad))}</div>
      <div class="yon-istek-kim"><div class="yon-istek-ad">${esc(ad)}</div><div class="yon-alt">${rol ? esc(ROL_AD[rol] || rol) + ' · ' : ''}${esc(fmt.saat(i.zaman))} · ${esc(fmt.goreli(i.zaman))} · #${esc(i.id)}</div></div>
      <div class="yon-istek-sag">${i.risk ? `<span class="yon-rozet risk-${esc(i.risk)}">Risk: ${esc(RISK_AD[i.risk] || i.risk)}</span>` : ''}<span class="yon-rozet ist-${durumSinif(i.durum)}">${esc(ISTEK_AD[i.durum] || i.durum)}</span></div>
    </header>
    <div class="yon-istek-metin">“${esc(i.metin || '')}”</div>
    <div class="yon-istek-iki">
      <div class="yon-istek-kol">
        <div class="yon-mikro">ATLAS PLANI</div>
        ${adimlar.length ? adimlar.map((s, n) => `<div class="yon-adim"><span>${n + 1}</span><span>${esc(s)}</span></div>`).join('') : '<div class="yon-zayif">Plan yazılmamış</div>'}
        ${deg.length ? `<ul class="yon-degisiklik">${deg.slice(0, 8).map(d => `<li${d.firma_id ? ` data-firma="${esc(d.firma_id)}" title="Kişi kartını aç"` : ''}>${esc(degisiklikMetni(d))}</li>`).join('')}${deg.length > 8 ? `<li class="yon-zayif">ve ${deg.length - 8} kayıt daha</li>` : ''}</ul>` : ''}
      </div>
      <div class="yon-istek-kol">
        <div class="yon-mikro">ETKİ ALANI</div>
        <div class="yon-etki">${esc(etkiMetni(i, deg))}</div>
      </div>
    </div>
    ${bekliyor ? `<div class="yon-karar">
      <input class="yon-girdi karar" name="onay-notu" data-not="${i.id}" data-odak="not-${i.id}" placeholder="İsteğe bağlı not…" value="${esc(notTaslak.get(i.id) || '')}" ${is ? 'disabled' : ''}>
      <button class="yon-dugme karar" data-karar="red" ${is ? 'disabled' : ''}>Reddet</button>
      <button class="yon-dugme karar yesil" data-karar="onay" ${is ? 'disabled' : ''}>${is ? 'Kaydediliyor…' : '✓ Onayla'}</button>
    </div>` : ''}
    ${yapiliyor ? `<div class="yon-yapiliyor"><div>Yapılıyor…</div><i></i></div>${i.onaylayan ? `<div class="yon-alt">${esc(i.onaylayan)} onayladı${onayZaman ? ' · ' + esc(onayZaman) : ''}${i.onay_notu ? ' · Not: ' + esc(i.onay_notu) : ''}</div>` : ''}` : ''}
    ${i.durum === 'yapildi' ? `<div class="yon-yapildi"><div>✓ ${esc(i.sonuc || 'Yapıldı')}</div><span>${i.onaylayan ? esc(i.onaylayan) + ' onayladı' : ''}${onayZaman ? ' · ' + esc(onayZaman) : ''}${i.onay_notu ? ' · Not: ' + esc(i.onay_notu) : ''}</span></div>` : ''}
    ${i.durum === 'reddedildi' ? `<div class="yon-reddedildi">${esc(i.onaylayan || 'Admin')} reddetti${i.onay_notu ? ': ' + esc(i.onay_notu) : ''}</div>` : ''}
    ${i.durum === 'hata' ? `<div class="yon-hatali">Hata: ${esc(i.sonuc || 'İstek uygulanamadı')}</div>` : ''}
  </article>`;
}
async function karar(id, onayMi) {
  const i = istekListesi().find(x => x.id === id);
  if (!i || i.durum !== 'onay_bekliyor') return toast('Bu istek artık onay beklemiyor');
  const not = (notTaslak.get(id) || '').trim();
  if (onayMi && i.risk === 'yuksek' && !(await onayla('Bu istek yüksek riskli. ATLAS planı olduğu gibi uygulayacak. Onaylıyor musun?', { evet: 'Evet, onayla', tehlike: true }))) return;
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
    const hepsi = istekListesi().slice().sort((a, c) => (ISTEK_SIRA[a.durum] ?? 2) - (ISTEK_SIRA[c.durum] ?? 2) || zamanMs(c.zaman) - zamanMs(a.zaman));
    const n = bekleyenSay();
    const gorunen = gecmisHepsi ? hepsi : hepsi.filter((i, idx) => i.durum === 'onay_bekliyor' || idx < 30);
    b.innerHTML = `
      <div class="yon-onay">
        <div class="yon-bolum-baslik"><h2>Onay bekleyenler</h2><span class="alt">${n} bekliyor · ATLAS'a gelen iş talepleri</span></div>
        ${gorunen.length ? gorunen.map(istekKart).join('') : `<div class="yon-kart"><div class="bos yon-bos"><b>Onay bekleyen istek yok</b><div>ATLAS onay isteyen bir iş getirdiğinde burada kart olarak çıkar, üst menüde sayı görünür.</div></div></div>`}
        ${hepsi.length > gorunen.length ? `<button class="btn yon-daha" data-gecmis-hepsi>Daha eski istekler (${hepsi.length - gorunen.length})</button>` : ''}
      </div>`;
    odakGeri(b, odak);
  },
  yenile(s) { if (['istek', 'asistan', 'profil', 'saat', 'hazir'].some(x => s.has(x))) onay.ciz(bolumEl()); },
};

// ================================================================ 3) GÖREV DAĞILIMI
const gorev = { ref: '', refTo: '', veh: '', vehTo: '' };
const refKisileri = ref => firmaListesi().filter(f => f.referans === ref && bizListe(f));
function atananlar() {
  const idler = new Set();
  firmaListesi().forEach(f => { if (f.sorumlu_id) idler.add(f.sorumlu_id); });
  store.araclar.forEach(a => { if (a.sorumlu_id) idler.add(a.sorumlu_id); });
  const liste = new Map(ekip().filter(p => p.rol !== 'rapor' && p.rol !== 'kurul').map(p => [p.id, p]));   // kurul (referans) yalnız zaten ataması varsa listelenir
  idler.forEach(id => { const p = store.profiller.get(id); if (p && p.rol !== 'bot') liste.set(id, p); });
  return [...liste.values()].sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, 'tr'));
}
// Referans (yönetim kurulu) şoför ya da araç sorumlusu yapılmaz; yalnız mevcut ataması varsa tabloda görünür, yeni atama seçeneği olmaz.
const atanabilirler = () => atananlar().filter(m => m.rol !== 'kurul');
const uyeSecenek = (secili) => `<option value="">Sorumlu seç…</option>${atanabilirler().map(m => `<option value="${esc(m.id)}" ${m.id === secili ? 'selected' : ''}>${esc(trBaslik(m.ad_soyad))} · ${esc(ROL_AD[m.rol] || m.rol)}</option>`).join('')}`;
function gorevYukle() {
  const refler = referanslar().filter(r => refKisileri(r).length);
  if (!refler.includes(gorev.ref)) gorev.ref = refler[0] || '';
  const araclar = [...store.araclar.values()];
  if (!araclar.some(a => String(a.id) === String(gorev.veh))) gorev.veh = araclar[0] ? String(araclar[0].id) : '';
  const atanabilirMi = id => store.profiller.has(id) && store.profiller.get(id).rol !== 'kurul';
  if (gorev.refTo && !atanabilirMi(gorev.refTo)) gorev.refTo = '';
  if (gorev.vehTo && !atanabilirMi(gorev.vehTo)) gorev.vehTo = '';
  return { refler, araclar };
}
function gorevUstHtml() {
  const { refler, araclar } = gorevYukle();
  const aracSirali = araclar.slice().sort((a, b) => fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr'));
  return `<div class="yon-iki-kart">
    <div class="yon-kart yon-pad">
      <div class="yon-etiket-kirmizi">TOPLU ATAMA · REFERANSA GÖRE</div>
      <div class="yon-ok-izgara">
        <select class="yon-girdi buyuk" name="g-ref" data-g-ref aria-label="Referans">${refler.length ? refler.map(r => `<option value="${esc(r)}" ${r === gorev.ref ? 'selected' : ''}>${esc(trBaslik(r))} · ${refKisileri(r).length} kişi</option>`).join('') : '<option value="">Referans yok</option>'}</select>
        <div class="yon-ok">→</div>
        <select class="yon-girdi buyuk" name="g-ref-sorumlu" data-g-ref-to aria-label="Sorumlu">${uyeSecenek(gorev.refTo)}</select>
      </div>
      <div class="yon-onizleme" data-g-ref-onizle></div>
      <button class="yon-ana-dugme sol" data-g-ref-ata>Toplu ata</button>
    </div>
    <div class="yon-kart yon-pad">
      <div class="yon-etiket-kirmizi">TOPLU ATAMA · ARACA GÖRE</div>
      <div class="yon-ok-izgara">
        <select class="yon-girdi buyuk" name="g-arac" data-g-veh aria-label="Araç">${aracSirali.length ? aracSirali.map(a => `<option value="${a.id}" ${String(a.id) === String(gorev.veh) ? 'selected' : ''}>${esc(fmt.plaka(a.plaka))}${a.sofor_ad ? ' · ' + esc(trBaslik(a.sofor_ad)) : ''}${a.sorumlu_id ? '' : ' · sorumlusuz'}</option>`).join('') : '<option value="">Araç yok</option>'}</select>
        <div class="yon-ok">→</div>
        <select class="yon-girdi buyuk" name="g-arac-sorumlu" data-g-veh-to aria-label="Sorumlu">${uyeSecenek(gorev.vehTo)}</select>
      </div>
      <div class="yon-onizleme" data-g-veh-onizle></div>
      <button class="yon-ana-dugme sol" data-g-veh-ata>Toplu ata</button>
    </div>
  </div>`;
}
function gorevOnizle() {
  const b = bolumEl(); if (!b) return;
  const kisiler = gorev.ref ? refKisileri(gorev.ref) : [], uye = gorev.refTo ? store.profiller.get(gorev.refTo) : null;
  const r = b.querySelector('[data-g-ref-onizle]');
  if (r) r.textContent = uye ? `“${trBaslik(gorev.ref)} kişilerini ${dat(uye.ad_soyad)} ver” · ${kisiler.length} kişi` : `Önce sorumluyu seç · ${kisiler.length} kişi`;
  const a = store.araclar.get(Number(gorev.veh)), yolcu = a ? firmaListesi().filter(f => f.arac_id === a.id) : [], uv = gorev.vehTo ? store.profiller.get(gorev.vehTo) : null;
  const v = b.querySelector('[data-g-veh-onizle]');
  if (v) v.textContent = a ? `${fmt.plaka(a.plaka)} + ${yolcu.length} yolcu → ${uv ? trBaslik(uv.ad_soyad) : 'sorumlu seç'} · araç ve yolcuları birlikte` : 'Araç yok';
  const rb = b.querySelector('[data-g-ref-ata]'); if (rb) rb.disabled = !(uye && kisiler.length);
  const vb = b.querySelector('[data-g-veh-ata]'); if (vb) vb.disabled = !(uv && a);
}
function gorevUyeSatir(m) {
  const kisiler = firmaListesi().filter(f => f.sorumlu_id === m.id), araclar = [...store.araclar.values()].filter(a => a.sorumlu_id === m.id);
  const bitti = kisiler.filter(f => f.durum === 'oy_kullandi' || f.durum === 'fuarda').length, bekleyen = kisiler.length - bitti;
  const yuzde = kisiler.length ? Math.round((bitti / kisiler.length) * 100) : 0;
  return `<div class="yon-satir yon-gd">
    <div class="yon-kisi"><div class="yon-avatar koyu">${esc(bas(m.ad_soyad))}</div><div class="yon-ad">${esc(trBaslik(m.ad_soyad))}</div></div>
    <div class="yon-sol-yazi">${esc(ROL_AD[m.rol] || m.rol)}</div>
    <div class="yon-sayi">${kisiler.length}</div>
    <div class="yon-sayi">${araclar.length}</div>
    <div class="yon-tab-sayi">${bekleyen}</div>
    <div class="yon-plakalar" title="${esc(araclar.map(a => fmt.plaka(a.plaka)).join(' · '))}">${araclar.length ? esc(araclar.map(a => fmt.plaka(a.plaka)).join(' · ')) : '-'}</div>
    <div class="yon-ilerleme"><div class="yon-cubuk"><i style="width:${yuzde}%"></i></div><span>${bitti}/${kisiler.length}</span></div>
  </div>`;
}
function gorevTablo() {
  const kap = bolumEl()?.querySelector('[data-g-tablo]'); if (!kap) return;
  const uyeler = atananlar().map(m => ({ m, n: firmaListesi().filter(f => f.sorumlu_id === m.id).length })).sort((a, b) => b.n - a.n || a.m.ad_soyad.localeCompare(b.m.ad_soyad, 'tr')).map(x => x.m);
  const sizKisi = firmaListesi().filter(f => bizListe(f) && !f.sorumlu_id).length, sizArac = [...store.araclar.values()].filter(a => !a.sorumlu_id).length;
  kap.innerHTML = `
    <div class="yon-kart-ust"><b>Görev dağılımı</b><span class="yon-uyari-yazi">${sizKisi} kişi ve ${sizArac} araç sorumlusuz</span></div>
    <div class="yon-kaydir"><div class="yon-tablo-ic wide">
      <div class="yon-satir yon-gd yon-baslik-satir"><div>SORUMLU</div><div>ROL</div><div>KİŞİ</div><div>ARAÇ</div><div>BEKLEYEN</div><div>ARAÇLAR</div><div>İLERLEME</div></div>
      ${uyeler.length ? uyeler.map(gorevUyeSatir).join('') : '<div class="bos">Atanabilecek ekip üyesi yok. Kullanıcılar sekmesinden üye ekle.</div>'}
    </div></div>`;
}
async function refTopluAta() {
  const uye = store.profiller.get(gorev.refTo), kisiler = refKisileri(gorev.ref); if (!uye || !kisiler.length) return;
  try {
    const geriAl = await sorumluAta(kisiler.map(f => f.id), uye.id, { metin: `Toplu atama: ${trBaslik(gorev.ref)} kişileri` });
    toast(`${kisiler.length} kişi ${dat(uye.ad_soyad)} verildi (${trBaslik(gorev.ref)})`, { tur: 'basari', geriAl, sure: 8000, geriAlMetin: 'Atama geri alındı' });
  } catch (e) { hataGoster(e); }
}
async function aracTopluAta() {
  const uye = store.profiller.get(gorev.vehTo), a = store.araclar.get(Number(gorev.veh)); if (!uye || !a) return;
  const yolcu = firmaListesi().filter(f => f.arac_id === a.id), onceki = a.sorumlu_id ?? null;
  try {
    await aracSorumluAta(a.id, uye.id);
    const geriKisi = yolcu.length ? await sorumluAta(yolcu.map(f => f.id), uye.id, { metin: `Toplu atama: ${fmt.plaka(a.plaka)} yolcuları` }) : null;
    toast(`${fmt.plaka(a.plaka)} ve ${yolcu.length} yolcu ${dat(uye.ad_soyad)} verildi`, {
      tur: 'basari', sure: 8000, geriAlMetin: 'Atama geri alındı',
      geriAl: async () => { if (geriKisi) await geriKisi(); await aracSorumluAta(a.id, onceki); },
    });
  } catch (e) { hataGoster(e); }
}
const gorevBolum = {
  kur(b) {
    b.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-g-ref]')) gorev.ref = t.value; else if (t.matches('[data-g-ref-to]')) gorev.refTo = t.value;
      else if (t.matches('[data-g-veh]')) gorev.veh = t.value; else if (t.matches('[data-g-veh-to]')) gorev.vehTo = t.value;
      else return;
      gorevOnizle();
    });
    b.addEventListener('click', e => {
      if (e.target.closest('[data-g-ref-ata]')) refTopluAta(); else if (e.target.closest('[data-g-veh-ata]')) aracTopluAta();
    });
  },
  ciz(b) {
    b.innerHTML = `<div class="yon-gorev"><div data-g-ust>${gorevUstHtml()}</div><div class="yon-kart" data-g-tablo></div></div>`;
    gorevOnizle(); gorevTablo();
  },
  yenile(s) {
    if (!['firma', 'firmalar', 'arac', 'araclar', 'profil', 'hazir'].some(x => s.has(x))) return;
    const b = bolumEl(), acik = b?.querySelector('[data-g-ust]');
    if (acik && !(document.activeElement && acik.contains(document.activeElement) && document.activeElement.tagName === 'SELECT')) { acik.innerHTML = gorevUstHtml(); }
    gorevOnizle(); gorevTablo();
  },
};

// ================================================================ 4) ATLAS İŞLEM GÜNLÜĞÜ
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
  if (k.tur === 'istek') { const i = k.istek; return [i.metin, i.plan, i.sonuc, i.isteyen_ad, i.onaylayan, i.onay_notu, ISTEK_AD[i.durum]].join(' '); }
  return [k.metin, k.kim, ...k.olaylar.map(o => { const f = o.firma_id ? store.firmalar.get(o.firma_id) : null; return `${olayMetni(o)} ${f?.unvan || ''} ${f?.referans || ''}`; })].join(' ');
}
// Geri alma: durum, sınıf, araç ve sorumlu değişiklikleri; yalnız kişinin şu anki hali hâlâ ATLAS'ın yaptığı haldeyse
const durumParcala = v => { const [durum, kendi] = String(v ?? '').split('+'); return { durum, kendi: kendi === 'kendi' }; };
const bosMu = v => v === null || v === undefined || v === '';
function olayDurumu(o) {
  const f = o.firma_id ? store.firmalar.get(o.firma_id) : null; if (!f || bosMu(o.eski) && o.tur !== 'arac' && o.tur !== 'sorumlu') return 'yok';
  let simdiki, yeniD, eskiD;
  if (o.tur === 'durum') { simdiki = f.durum; yeniD = durumParcala(o.yeni).durum; eskiD = durumParcala(o.eski).durum; }
  else if (o.tur === 'oy_sinifi') { simdiki = f.oy_sinifi; yeniD = o.yeni; eskiD = o.eski; }
  else if (o.tur === 'arac') { simdiki = String(f.arac_id ?? ''); yeniD = String(o.yeni ?? ''); eskiD = String(o.eski ?? ''); }
  else if (o.tur === 'sorumlu') { simdiki = String(f.sorumlu_id ?? ''); yeniD = String(o.yeni ?? ''); eskiD = String(o.eski ?? ''); }
  else return 'yok';
  if (yeniD === eskiD) return 'yok';
  return simdiki === yeniD ? 'alinabilir' : simdiki === eskiD ? 'alindi' : 'yok';
}
async function olayGeriAl(o) {
  const id = o.firma_id, meta = 'ATLAS işlemi geri alındı (günlük)';
  if (o.tur === 'durum') { const e = durumParcala(o.eski), y = durumParcala(o.yeni); return durumYap(id, e.durum, { kendi: e.kendi ? true : y.kendi ? false : null, kaynak: 'el', metin: meta }); }
  if (o.tur === 'oy_sinifi') return sinifYap(id, o.eski, { kaynak: 'el', metin: meta });
  if (o.tur === 'arac') return aracAta(id, bosMu(o.eski) ? null : Number(o.eski), { kaynak: 'el', metin: meta });
  if (o.tur === 'sorumlu') return sorumluAta(id, bosMu(o.eski) ? null : o.eski, { kaynak: 'el', metin: meta });
  return null;
}
async function kayitGeriAl(anahtar) {
  const k = gunlukKayitlari().find(x => x.anahtar === anahtar); if (!k || k.tur !== 'olay') return;
  const liste = k.olaylar.filter(o => olayDurumu(o) === 'alinabilir'); if (!liste.length) return;
  if (liste.length > 1 && !(await onayla(`ATLAS'ın yaptığı ${liste.length} değişiklik eski haline dönsün mü?`, { evet: 'Geri al' }))) return;
  const geriler = [];
  try {
    for (const o of liste) { if (olayDurumu(o) !== 'alinabilir') continue; const g = await olayGeriAl(o); if (g) geriler.push(g); }
    toast(geriler.length > 1 ? `${geriler.length} değişiklik eski haline döndü` : 'Eski haline döndü', { tur: 'basari', geriAl: async () => { for (const g of [...geriler].reverse()) await g(); }, sure: 8000 });
  } catch (e) { hataGoster(e); }
  gunlukListe();
}
const TUR_ETIKET = { bilgi: ['Bilgi işlendi', 'bilgi'], onay: ['Onaylı iş', 'onay'], komut: ['Admin komutu', 'komut'], red: ['Reddedildi', 'red'], bek: ['Onay bekliyor', 'bek'], hata: ['Hata', 'hata'] };
const turRozet = t => { const [ad, sinif] = TUR_ETIKET[t]; return `<span class="yon-rozet tur-${sinif}">${ad}</span>`; };
function gunlukOlay(k, yazan) {
  const n = k.olaylar.length, acik = gunluk.acik.has(k.anahtar), gorunen = acik ? k.olaylar : k.olaylar.slice(0, 2);
  const kimYazdi = yazan.get(k.metin.trim()) || k.kim;
  const durumlar = k.olaylar.map(olayDurumu), geriAlinabilir = durumlar.includes('alinabilir'), geriAlindi = !geriAlinabilir && durumlar.includes('alindi');
  return `<div class="yon-satir yon-log">
    <div class="yon-saat" title="${esc(fmt.goreli(k.zaman))}">${esc(fmt.saat(k.zaman))}</div>
    <div class="yon-log-kim">${esc(kimYazdi || 'ATLAS')}</div>
    <div class="yon-log-onay">Doğrudan işlendi</div>
    <div class="yon-log-istek">${k.metin ? `“${esc(k.metin)}”` : '<span class="yon-zayif">Kaynak mesaj kaydedilmemiş</span>'}</div>
    <div class="yon-log-deg"><ul>${gorunen.map(o => `<li${o.firma_id ? ` data-firma="${esc(o.firma_id)}" title="Kişi kartını aç"` : ''}>${esc(olayMetni(o))}</li>`).join('')}</ul>${n > 2 ? `<button class="yon-baglanti" data-gac="${k.anahtar}">${acik ? 'Daha az göster' : `${n - 2} değişiklik daha`}</button>` : ''}</div>
    <div>${turRozet('bilgi')}</div>
    <div class="yon-log-sag">${geriAlinabilir ? `<button class="yon-mini" data-geri="${k.anahtar}">Geri al</button>` : geriAlindi ? '<span class="yon-zayif">geri alındı</span>' : ''}</div>
  </div>`;
}
function gunlukIstek(k) {
  const i = k.istek, p = store.profiller.get(i.isteyen_id);
  const tur = i.durum === 'onay_bekliyor' ? 'bek' : i.durum === 'reddedildi' ? 'red' : i.durum === 'hata' ? 'hata' : p?.rol === 'yonetici' ? 'komut' : 'onay';
  return `<div class="yon-satir yon-log">
    <div class="yon-saat" title="${esc(fmt.goreli(k.zaman))}">${esc(fmt.saat(k.zaman))}</div>
    <div class="yon-log-kim">${esc(i.isteyen_ad || p?.ad_soyad || '')}</div>
    <div class="yon-log-onay">${esc(i.onaylayan || '-')}</div>
    <div class="yon-log-istek">“${esc(i.metin || '')}”</div>
    <div class="yon-log-deg">${i.sonuc ? esc(i.sonuc) : i.onay_notu ? `Not: ${esc(i.onay_notu)}` : i.plan ? esc(planAdimlari(i.plan)[0] || '') : '-'}</div>
    <div>${turRozet(tur)}</div>
    <div class="yon-log-sag">${i.durum === 'onay_bekliyor' ? '<button class="yon-mini" data-git-onay>Onaya git</button>' : ''}</div>
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
  kap.innerHTML = `<div class="yon-kaydir"><div class="yon-tablo-ic wide">
    <div class="yon-satir yon-log yon-baslik-satir"><div>SAAT</div><div>İSTEYEN</div><div>ONAYLAYAN</div><div>İSTEK</div><div>DEĞİŞİKLİK</div><div>TÜR</div><div></div></div>
    ${gorunen.length ? gorunen.map(k => (k.tur === 'olay' ? gunlukOlay(k, yazan) : gunlukIstek(k))).join('')
    : `<div class="bos yon-bos"><b>${q ? 'Aramaya uyan kayıt yok' : 'ATLAS henüz bir değişiklik yapmadı'}</b><div>${q ? 'Başka bir kelime dene.' : 'ATLAS\'a yazılan mesajlarla yapılan her işaret, kaynak mesajıyla birlikte burada görünür.'}</div></div>`}
    ${liste.length > gorunen.length ? `<button class="btn yon-daha" data-gdaha>Daha eski kayıtlar (${liste.length - gorunen.length})</button>` : ''}
  </div></div>${!gunluk.yuklendi ? '<div class="yon-yukleniyor">Eski kayıtlar yükleniyor…</div>' : ''}`;
}
const gunlukBolum = {
  kur(b) {
    b.addEventListener('click', e => {
      const f = e.target.closest('[data-gfiltre]'); if (f) { gunluk.filtre = f.dataset.gfiltre; gunluk.sinir = 60; return gunlukListe(); }
      if (e.target.closest('[data-gdaha]')) { gunluk.sinir += 60; return gunlukListe(); }
      const ac = e.target.closest('[data-gac]'); if (ac) { const k = ac.dataset.gac; gunluk.acik.has(k) ? gunluk.acik.delete(k) : gunluk.acik.add(k); return gunlukListe(); }
      const g = e.target.closest('[data-geri]'); if (g) return kayitGeriAl(g.dataset.geri);
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
      <div class="yon-kart">
        <div class="yon-kart-ust"><b>ATLAS işlem günlüğü</b><span class="alt">ATLAS'ın yaptığı her şey, zaman sırasıyla</span>
          <div class="yon-kart-sag"><div class="cipler" data-g-cipler></div><input class="yon-girdi ara" type="search" name="gunluk-ara" data-gara placeholder="Günlükte ara: ad, firma, mesaj" value="${esc(gunluk.ara)}"></div></div>
        <div data-g-liste></div>
      </div>`;
    gunlukListe();
    if (!gunluk.yuklendi && !gunluk.yukleniyor) gunlukYukle();
  },
  yenile(s) { if (['olay', 'istek', 'asistan', 'firma', 'firmalar', 'saat', 'hazir'].some(x => s.has(x))) gunlukListe(); },
};

// ================================================================ 5) AYARLAR
const zamanMevcut = () => ({ bas: store.ayarlar.zaman?.bas || '09:00', bit: store.ayarlar.zaman?.bit || '17:00' });
const bizdeSay = () => firmaListesi().filter(f => f.oy_sinifi === 'bizde').length;
function ayarMevcut() {
  const s = store.ayarlar.secim || {}, z = zamanMevcut(), h = store.ayarlar.hedef || {};
  return { tarih: s.tarih || '', yer: s.yer || '', masa_tel: s.masa_tel || '', bas: z.bas, bit: z.bit, oto: h.elle == null, sayi: h.elle != null ? String(h.elle) : '' };
}
const ayarDeger = () => taslak.ayar || ayarMevcut();
function saatSecenekleri(secili) {
  const sa = []; for (let h = 6; h <= 22; h++) sa.push(`${String(h).padStart(2, '0')}:00`);
  if (secili && !sa.includes(secili)) sa.push(secili);
  return sa.sort().map(v => `<option value="${v}" ${v === secili ? 'selected' : ''}>${v}</option>`).join('');
}
function ayarCiz() {
  const kap = kok?.querySelector('[data-a-kart]'); if (!kap) return;
  const a = ayarDeger();
  kap.innerHTML = `
    <div class="yon-kart-baslik">Seçim ayarları</div>
    <div data-cakisma="ayar">${cakismaHtml('ayar')}</div>
    <div class="yon-iki-alan">
      <div class="yon-alan"><label class="yon-lbl" for="yon-a-tarih">Seçim tarihi</label><input id="yon-a-tarih" type="date" class="yon-girdi buyuk" data-a="tarih" data-odak="a-tarih" value="${esc(a.tarih)}"></div>
      <div class="yon-alan"><label class="yon-lbl" for="yon-a-yer">Yer</label><input id="yon-a-yer" class="yon-girdi buyuk" data-a="yer" data-odak="a-yer" value="${esc(a.yer)}" placeholder="Fuar İzmir, Gaziemir"></div>
    </div>
    <div class="yon-iki-alan">
      <div class="yon-alan"><label class="yon-lbl" for="yon-a-tel">Masa telefonu</label><input id="yon-a-tel" type="tel" inputmode="tel" class="yon-girdi buyuk" data-a="masa_tel" data-odak="a-tel" value="${esc(a.masa_tel)}" placeholder="0532 000 00 00" autocomplete="off"></div>
      <div class="yon-ipucu yon-alta">Şoför ve araç sorumlusu telefonlarındaki "Masayı ara" düğmesi bu numarayı arar.</div>
    </div>
    <div class="yon-alan">
      <div class="yon-lbl">Zaman çizelgesi saat aralığı</div>
      <div class="yon-saat-satir">
        <select class="yon-girdi buyuk saat" name="saat-bas" data-a="bas" data-odak="a-bas" aria-label="Başlangıç saati">${saatSecenekleri(a.bas)}</select>
        <div class="yon-ok">-</div>
        <select class="yon-girdi buyuk saat" name="saat-bit" data-a="bit" data-odak="a-bit" aria-label="Bitiş saati">${saatSecenekleri(a.bit)}</select>
        <div class="yon-ipucu">Masa ekranındaki çizelge kaydedince anında güncellenir.</div>
      </div>
    </div>
    <div class="yon-hedef-kutu">
      <div class="yon-hedef-ust">
        <div><b>Hedef</b><div class="yon-ipucu">Otomatik: “kesin bizde” sayısı (<span data-oto-say>${bizdeSay()}</span>)</div></div>
        <div class="yon-otomatik">Otomatik ${anahtarHtml(a.oto, 'data-a-oto', 'Hedef otomatik')}</div>
      </div>
      <div class="yon-hedef-alt">
        <input type="number" inputmode="numeric" class="yon-girdi hedef" name="hedef-sayi" data-a="sayi" data-odak="a-sayi" min="1" max="9999" step="1" value="${esc(a.oto ? String(bizdeSay()) : a.sayi)}" ${a.oto ? 'disabled' : ''} aria-label="Hedef sayısı">
        <div class="yon-aciklama" style="margin:0">oy · tüm ekranlarda ilerleme bu sayıya göre</div>
      </div>
    </div>
    <div class="yon-hata" data-ayar-hata></div>
    <div class="yon-kaydet-satir" data-kaydet-satir="ayar">${kaydetSatirIc('ayar')}</div>
    <div class="yon-ipucu">Prova için adresin sonuna <code>?saat=10:30</code> eklenirse (ör. <code>${esc(uygulamaAdresi())}?saat=10:30#masa</code>) uygulama o saatten işler.</div>`;
}
function ayarDogrula(a) {
  if (!(dakika(a.bas) < dakika(a.bit))) return 'Bitiş saati başlangıçtan sonra olmalı';
  if (!a.oto) { const n = Number(a.sayi); if (!Number.isInteger(n) || n < 1 || n > 9999) return 'Hedef 1 ile 9999 arasında bir tam sayı olmalı'; }
  if (a.masa_tel.trim()) { const d = a.masa_tel.replace(/\D/g, ''); if (!fmt.telLink(a.masa_tel) && d.length < 7) return 'Masa telefonu geçerli görünmüyor'; }
  return '';
}
async function ayarKaydetTik(k) {
  if (k === 'whatsapp') return waKaydet();
  const a = taslak.ayar; if (!a) return;
  const hata = ayarDogrula(a); hataYaz('[data-ayar-hata]', hata); if (hata) return;
  const tel = a.masa_tel.trim() ? (fmt.telLink(a.masa_tel) ? fmt.tel(a.masa_tel) : a.masa_tel.trim()) : '';
  const yeniSecim = { ...(store.ayarlar.secim || {}), tarih: a.tarih || null, yer: a.yer.trim(), masa_tel: tel || null };
  const yeniZaman = { ...(store.ayarlar.zaman || {}), bas: a.bas, bit: a.bit };
  const yeniHedef = { ...(store.ayarlar.hedef || {}), elle: a.oto ? null : Number(a.sayi) };
  const btn = kok?.querySelector('[data-kaydet="ayar"]'); if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor…'; }
  kaydediyor = true;
  try {
    if (kararli(yeniSecim) !== kararli(store.ayarlar.secim)) await ayarYaz('secim', yeniSecim);
    if (kararli(yeniZaman) !== kararli(store.ayarlar.zaman)) await ayarYaz('zaman', yeniZaman);
    if (kararli(yeniHedef) !== kararli(store.ayarlar.hedef)) await ayarYaz('hedef', yeniHedef);
    taslakBirak('ayar');
    toast('Kaydedildi, herkese uygulandı', { tur: 'basari' });
  } catch (e) { hataGoster(e); }
  finally { kaydediyor = false; }
  bolumCiz();
}
const ayarlarBolum = {
  kur(b) {
    b.addEventListener('input', e => {
      const t = e.target, alan = t.dataset?.a; if (!alan || alan === 'oto') return;
      const a = taslakBaslat('ayar', ayarMevcut()); a[alan] = t.value; hataYaz('[data-ayar-hata]', '');
    });
    b.addEventListener('change', e => {
      const t = e.target, alan = t.dataset?.a; if (!alan || t.tagName !== 'SELECT') return;
      const a = taslakBaslat('ayar', ayarMevcut()); a[alan] = t.value; hataYaz('[data-ayar-hata]', '');
    });
    b.addEventListener('click', e => {
      if (!e.target.closest('[data-a-oto]')) return;
      const a = taslakBaslat('ayar', ayarMevcut()); a.oto = !a.oto; if (!a.oto && !a.sayi) a.sayi = String(bizdeSay());
      hataYaz('[data-ayar-hata]', ''); ayarCiz();
      if (!a.oto) kok?.querySelector('[data-a="sayi"]')?.focus();
    });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-a="sayi"]')) { e.preventDefault(); ayarKaydetTik('ayar'); } });
  },
  ciz(b) { b.innerHTML = `<div class="yon-ayar"><div class="yon-kart yon-ayar-kart" data-a-kart></div></div>`; ayarCiz(); },
  yenile(s) {
    if (s.has('ayar') || s.has('hazir')) { const b = bolumEl(), odak = odakKaydet(b); ayarCiz(); odakGeri(b, odak); }
    else if (['firma', 'firmalar'].some(x => s.has(x))) {
      kok?.querySelectorAll('[data-oto-say]').forEach(x => { x.textContent = bizdeSay(); });
      const a = ayarDeger(), inp = kok?.querySelector('[data-a="sayi"]'); if (a.oto && inp) inp.value = String(bizdeSay());
    }
  },
};

// ================================================================ 6) WHATSAPP BİLDİRİMLERİ
const wa = { gruplar: null, hata: null, yukleniyor: false, ornekId: null };
const waMevcut = () => {
  const w = store.ayarlar.whatsapp || {};
  return { ...WA_VARSAYILAN, ...w, olaylar: { ...WA_VARSAYILAN.olaylar, ...(w.olaylar || {}) }, sablon: w.sablon ?? WA_VARSAYILAN.sablon };
};
const waDeger = () => taslak.whatsapp || waMevcut();
function waDuzenle(fn) { const d = taslakBaslat('whatsapp', waMevcut()); fn(d); kaydetSatirGuncelle('whatsapp'); waOnizle(); sablonBilgi(); }
const bilinmeyenDegiskenler = s => [...new Set([...String(s).matchAll(/\{([^{}\s]+)\}/g)].map(m => m[1]).filter(k => !WA_DEGISKENLER.some(([d]) => d === k)).map(k => `{${k}}`))];
async function waKaydet() {
  const d = taslak.whatsapp; if (!d) return;
  const sablon = String(d.sablon || '').trim();
  if (!sablon) { toast('Mesaj şablonu boş olamaz', { tur: 'hata' }); return; }
  const bilinmeyen = bilinmeyenDegiskenler(sablon);
  if (bilinmeyen.length && !(await onayla(`Şablonda tanınmayan değişken var: ${bilinmeyen.join(' ')}. Mesajda olduğu gibi yazılır. Yine de kaydedilsin mi?`, { evet: 'Kaydet' }))) return;
  const deger = { ...(store.ayarlar.whatsapp || {}), ...d, sablon };
  const btn = kok?.querySelector('[data-kaydet="whatsapp"]'); if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor…'; }
  kaydediyor = true;
  try {
    taban.whatsapp = kararli(deger);
    await ayarYaz('whatsapp', deger);
    taslakBirak('whatsapp');
    toast(deger.grup_jid ? 'WhatsApp ayarları kaydedildi' : 'Kaydedildi. Grup seçilmediği için mesaj gitmez.', { tur: 'basari' });
  } catch (e) { hataGoster(e); }
  finally { kaydediyor = false; }
  bolumCiz();
}
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
  else if (wa.hata) govde = `<div class="yon-uyari-kutu">Grup listesi alınamadı<div>${esc(wa.hata)}</div></div>`;
  else if (!liste.length) govde = `<div class="yon-uyari-kutu">Mac'teki bildirim bekçisi grupları henüz göndermedi<div>Bekçi çalışınca Musa'nın WhatsApp grupları buraya gelir; sonra "Listeyi yenile"ye bas.</div></div>`;
  else {
    govde = `<select class="yon-girdi buyuk" name="wa-grup" data-wa-grup-sec aria-label="Hedef grup">
      <option value="">Grup seçilmedi (mesaj gitmez)</option>
      ${listedeYok ? `<option value="${esc(d.grup_jid)}" selected>${esc(d.grup_ad || d.grup_jid)} (listede yok)</option>` : ''}
      ${liste.map(g => `<option value="${esc(g.jid)}" ${g.jid === d.grup_jid ? 'selected' : ''}>${esc(g.ad || g.jid)}</option>`).join('')}
    </select>
    <div class="yon-ipucu">${liste.length} grup${sonGuncelleme ? ` · liste ${esc(goreliUzun(sonGuncelleme))} güncellendi` : ''}</div>`;
  }
  const secili = d.grup_jid && (!liste.length || wa.hata) ? `<div class="yon-ipucu">Kayıtlı grup: <b>${esc(d.grup_ad || d.grup_jid)}</b></div>` : '';
  kap.innerHTML = `<div class="yon-lbl-satir"><div class="yon-lbl">Hedef grup</div><button class="yon-baglanti" data-wa-grup-yenile ${wa.yukleniyor ? 'disabled' : ''}>↻ ${wa.yukleniyor ? 'Yükleniyor…' : 'Listeyi yenile'}</button></div>${govde}${secili}`;
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
const waOnizleMetni = () => sablonDoldur(waDeger().sablon, ornekFirma());
function waOnizle() {
  const kap = kok?.querySelector('[data-wa-onizleme]'); if (!kap) return;
  const d = waDeger(), f = ornekFirma();
  const metin = sablonDoldur(d.sablon, f);
  const acikOlay = WA_OLAYLAR.filter(([k]) => d.olaylar?.[k]).map(([, ad]) => ad);
  kap.innerHTML = `
    <div class="yon-wa-zemin"><div class="yon-wa-balon"><div class="yon-wa-kim">Seçim Masası</div><div class="yon-wa-metin">${metin.trim() ? waBicim(metin) : '<i style="opacity:.6">Şablon boş</i>'}</div><div class="yon-wa-saat">${esc(fmt.saat(simdi()))}</div></div></div>
    <div class="yon-ipucu">${f ? `Örnek kişi: <a href="#" data-firma="${esc(f.id)}">${esc(firmaAdi(f))}</a> · ${esc(f.unvan || '')} <button class="yon-baglanti" data-wa-ornek>↻ Başka örnek</button>` : 'Örnek için firma bulunamadı'}</div>
    <div class="yon-ipucu">${!d.grup_jid ? '<span class="yon-uyari-yazi">Grup seçilmedi, hiç mesaj gitmez.</span>'
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
    ? liste.map(o => `<div class="yon-wa-son"><span class="yon-saat">${esc(fmt.saat(o.zaman))}</span><span class="yon-wa-son-metin" title="${esc(olayMetni(o))}">${esc(olayMetni(o))}</span><span class="yon-wa-d ${esc(o.wa_durum)}">${esc(WA_DURUM_AD[o.wa_durum] || o.wa_durum)}</span></div>`).join('')
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
      const md = t.closest('[data-wa-mod]'); if (md) {
        waDuzenle(d => { d.mod = md.dataset.waMod; });
        b.querySelectorAll('[data-wa-mod]').forEach(x => x.classList.toggle('aktif', x === md)); return;
      }
      if (t.closest('[data-wa-varsayilan]')) {
        waDuzenle(d => { d.sablon = WA_VARSAYILAN.sablon; });
        const ta = b.querySelector('[data-wa-sablon]'); if (ta) ta.value = WA_VARSAYILAN.sablon; return;
      }
      if (t.closest('[data-wa-ornek]')) {
        const aday = ornekAdaylari().filter(f => f.id !== wa.ornekId);
        if (aday.length) wa.ornekId = aday[Math.floor(Math.random() * aday.length)].id;
        return waOnizle();
      }
      if (t.closest('[data-wa-test]')) {
        const w = window.open(waPaylas(waOnizleMetni()), '_blank', 'noopener');
        return toast(w ? 'WhatsApp açıldı: test mesajını grubu seçip gönder' : 'Açılır pencere engellendi, izin verip tekrar dene', { tur: w ? 'basari' : 'hata' });
      }
      if (t.closest('[data-wa-grup-yenile]')) return waGrupYukle();
      const f = t.closest('[data-firma]'); if (f) { e.preventDefault(); kisiKartiAc(Number(f.dataset.firma)); }
    });
    b.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-wa-grup-sec]')) {
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
      <div class="yon-wa-duzen">
        <div class="yon-kart yon-pad-buyuk yon-wa-sol">
          <div class="yon-kart-baslik">WhatsApp bildirimleri</div>
          <div data-cakisma="whatsapp">${cakismaHtml('whatsapp')}</div>
          <div class="yon-alan" data-wa-grup></div>
          <div class="yon-alan">
            <div class="yon-lbl">Olay türleri</div>
            ${WA_OLAYLAR.map(([k, ad, ac]) => `<div class="yon-olay-satir"><div><b>${esc(ad)}</b><span>${esc(ac)}</span></div>${anahtarHtml(d.olaylar?.[k], `data-wa-olay="${k}"`, ad)}</div>`).join('')}
          </div>
          <div class="yon-alan">
            <div class="yon-lbl">Gönderim modu</div>
            <div class="yon-seg">${WA_MODLAR.map(([k, ad]) => `<button type="button" class="${d.mod === k ? 'aktif' : ''}" data-wa-mod="${k}">${esc(ad)}</button>`).join('')}</div>
          </div>
          <div class="yon-alan">
            <div class="yon-lbl-satir"><div class="yon-lbl">Mesaj şablonu</div><button class="yon-baglanti" data-wa-varsayilan>Varsayılana dön</button></div>
            <div class="yon-degiskenler">${WA_DEGISKENLER.map(([k, ad]) => `<button type="button" class="yon-cip" data-degisken="${k}" title="${esc(ad)}">{${k}}</button>`).join('')}</div>
            <textarea class="yon-girdi sablon" name="wa-sablon" data-wa-sablon data-odak="wa-sablon" rows="3" spellcheck="false" aria-label="Mesaj şablonu">${esc(d.sablon || '')}</textarea>
            <div class="yon-sablon-alt" data-wa-sablon-bilgi></div>
          </div>
          <div class="yon-kaydet-satir" data-kaydet-satir="whatsapp">${kaydetSatirIc('whatsapp')}</div>
        </div>
        <div class="yon-wa-sag">
          <div class="yon-kart yon-pad">
            <div class="yon-etiket">CANLI ÖNİZLEME</div>
            <div data-wa-onizleme></div>
            <button class="yon-koyu-dugme" data-wa-test>Test mesajı gönder</button>
          </div>
          <div class="yon-kart"><div class="yon-kart-ust"><span class="yon-etiket">SON GÖNDERİLENLER</span></div><div data-wa-son></div></div>
        </div>
      </div>`;
    waGrupCiz(); waOnizle(); sablonBilgi(); waSonCiz(); odakGeri(b, odak);
    if (wa.gruplar === null && !wa.yukleniyor) waGrupYukle();
  },
  yenile(s) {
    if (s.has('ayar') || s.has('hazir')) { if (taslak.whatsapp) cakismaGuncelle('whatsapp'); else whatsappBolum.ciz(bolumEl()); return; }
    if (['firma', 'firmalar', 'saat'].some(x => s.has(x))) waOnizle();
    if (s.has('olay')) waSonCiz();
  },
};

// ================================================================ 7) VERİ
const isaretliMi = f => f.durum !== 'bekliyor' || !!f.kendi_geldi || !!f.karsilayan;
const kpi = (etiket, deger, alt, sinif = '') => `<div class="kpi ${sinif}"><div class="kpi-etiket">${esc(etiket)}</div><div class="kpi-deger">${fmt.sayi(deger)}</div><div class="kpi-alt">${esc(alt)}</div></div>`;
function oyVermeSurdu() {
  const tarih = store.ayarlar.secim?.tarih; if (!tarih) return false;
  const d = simdi(), bugun = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return bugun === tarih && simdiDk() >= (dakika(zamanMevcut().bas) ?? 540);
}
const tarihDosya = () => { const d = new Date(), iki = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}-${iki(d.getHours())}${iki(d.getMinutes())}`; };
function csvIndir() {
  const liste = firmaListesi().sort((a, b) => (Number(a.sn) || 1e9) - (Number(b.sn) || 1e9) || a.id - b.id);
  const tarihSaat = t => { if (!t) return ''; const x = new Date(t); return `${x.toLocaleDateString('tr-TR')} ${x.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`; };
  const telYaz = c => { const r = String(c || '').replace(/\D/g, ''); return (r.length === 10 || (r.length === 11 && r[0] === '0') || (r.length === 12 && r.startsWith('90'))) ? fmt.tel(c) : String(c || ''); };
  const basliklar = ['Sıra', 'Oda sicil', 'Ticari sicil', 'Ünvan', 'Tür', 'Yetkili', 'Cep', 'İlçe', 'Referans', '2. referans', 'Oy sınıfı', 'Durum', 'Kendi geldi', 'Durum zamanı', 'İşaretleyen', 'Karşılayan', 'Karşılama zamanı', 'Ulaşım', 'Taşıma saati', 'Araç', 'Notlar'];
  const satirlar = liste.map(f => {
    const a = aracOf(f);
    return [f.sn, f.oda_sicil, f.ticari_sicil, f.unvan, f.tur, trBaslik(f.yetkili || ''), telYaz(f.cep), trBaslik(f.ilce || ''), f.referans, f.referans2,
      SINIF_AD[f.oy_sinifi] || f.oy_sinifi, DURUM_AD[f.durum] || f.durum, f.kendi_geldi ? 'Evet' : '', tarihSaat(f.durum_zamani), f.durum_kim, f.karsilayan ? trBaslik(f.karsilayan) : '', tarihSaat(f.karsilayan ? f.karsilama_zamani : null),
      ULASIM_AD[ulasim(f)], fmt.saatKisa(f.tasima_saati), a ? fmt.plaka(a.plaka) : '', f.notlar];
  });
  // Excel formül enjeksiyonuna karşı: = + @ ile başlayan hücre metin olarak yazılır
  const hucre = v => { let s = String(v ?? ''); if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = [basliklar, ...satirlar].map(r => r.map(hucre).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `secim-raporu-${tarihDosya()}.csv`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  toast(`${fmt.sayi(liste.length)} firmalık rapor indirildi`, { tur: 'basari' });
}
// PDF rapor: yazdırma penceresi açılır, "PDF olarak kaydet" seçilir
function pdfRapor() {
  const w = window.open('', '_blank');
  if (!w) return toast('Açılır pencere engellendi, izin verip tekrar dene', { tur: 'hata' });
  const hepsi = firmaListesi(), s = sayac(), hedef = s.hedef;
  const oyVerenler = hepsi.filter(f => f.durum === 'oy_kullandi').sort((a, b) => zamanMs(a.durum_zamani) - zamanMs(b.durum_zamani));
  const gelmeyen = hepsi.filter(f => bizListe(f) && f.durum !== 'oy_kullandi').sort((a, b) => String(a.referans || '').localeCompare(String(b.referans || ''), 'tr') || String(a.yetkili || '').localeCompare(String(b.yetkili || ''), 'tr'));
  const refler = referanslar().map(r => { const l = hepsi.filter(f => f.referans === r && bizListe(f)); return { r, n: l.length, oy: l.filter(f => f.durum === 'oy_kullandi').length }; }).filter(x => x.n).sort((a, b) => b.n - a.n);
  const saatler = {}; oyVerenler.forEach(f => { if (f.durum_zamani) { const h = new Date(f.durum_zamani).getHours(); saatler[h] = (saatler[h] || 0) + 1; } });
  const enCok = Math.max(1, ...Object.values(saatler));
  const gecmis = store.olaylar.filter(o => o.tur === 'durum').slice().reverse();
  const td = (...c) => `<tr>${c.map(x => `<td>${esc(x ?? '')}</td>`).join('')}</tr>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Seçim raporu ${esc(tarihDosya())}</title><style>
    body{font:12px/1.45 Inter,system-ui,sans-serif;color:#1a1a1a;margin:24px}h1{font-size:20px;margin:0 0 2px}h1 span{color:#C8102E}h2{font-size:14px;margin:22px 0 6px;padding-bottom:4px;border-bottom:2px solid #C8102E}
    .alt{color:#666;margin-bottom:12px}.ozet{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.ozet div{border:1px solid #ddd;border-radius:8px;padding:8px 10px}.ozet b{display:block;font-size:22px}
    table{width:100%;border-collapse:collapse;margin-top:4px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e5e5e5;font-size:11px}th{background:#f4f4f5;font-size:10px;letter-spacing:.05em}
    .bar{display:flex;align-items:center;gap:8px;margin:2px 0}.bar i{display:block;height:10px;background:#15803D;border-radius:5px}.bar span{width:44px}
    @media print{body{margin:12mm}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>
    <h1>72. KOMİTE <span>|</span> GENÇ ENERJİ · Seçim raporu</h1><div class="alt">${esc(store.ayarlar.secim?.yer || '')} · hazırlandı ${esc(new Date().toLocaleString('tr-TR'))}</div>
    <div class="ozet"><div><b>${fmt.sayi(s.oy_bizde)}</b>bizim listeden oy kullanan</div><div><b>${fmt.sayi(hedef)}</b>hedef</div><div><b>${fmt.sayi(s.kalan)}</b>kalan</div><div><b>${fmt.sayi(s.oy_kullandi)}</b>toplam oy kullandı</div><div><b>${fmt.sayi(s.kendi_geldi)}</b>kendi gelen</div></div>
    <h2>Referans tablosu</h2><table><thead><tr><th>Referans</th><th>Listedeki</th><th>Oy kullanan</th><th>Oran</th></tr></thead><tbody>${refler.map(x => td(trBaslik(x.r), x.n, x.oy, `%${fmt.yuzde(x.oy, x.n)}`)).join('')}</tbody></table>
    <h2>Saatlik geliş</h2>${Object.keys(saatler).length ? Object.entries(saatler).sort((a, b) => a[0] - b[0]).map(([h, n]) => `<div class="bar"><span>${String(h).padStart(2, '0')}:00</span><i style="width:${Math.round((n / enCok) * 320)}px"></i><b>${n}</b></div>`).join('') : '<div class="alt">Henüz oy kullanan yok.</div>'}
    <h2>Gelenler (${oyVerenler.length})</h2><table><thead><tr><th>Saat</th><th>Yetkili</th><th>Firma</th><th>Referans</th><th>Karşılayan</th><th>İlçe</th><th>Sınıf</th></tr></thead><tbody>${oyVerenler.map(f => td(fmt.saat(f.durum_zamani), firmaAdi(f), f.unvan, trBaslik(f.referans || ''), f.karsilayan ? `${trBaslik(f.karsilayan)}${f.karsilama_zamani ? ' · ' + fmt.saat(f.karsilama_zamani) : ''}` : '', trBaslik(f.ilce || ''), SINIF_AD[f.oy_sinifi] || '')).join('')}</tbody></table>
    <h2>Gelmeyenler, bizim liste (${gelmeyen.length})</h2><table><thead><tr><th>Yetkili</th><th>Firma</th><th>Cep</th><th>Referans</th><th>İlçe</th><th>Durum</th></tr></thead><tbody>${gelmeyen.map(f => td(firmaAdi(f), f.unvan, fmt.tel(f.cep), trBaslik(f.referans || ''), trBaslik(f.ilce || ''), (DURUM_AD[f.durum] || f.durum) + (f.karsilayan ? ` · karşılayan ${trBaslik(f.karsilayan)}` : ''))).join('')}</tbody></table>
    <h2>İşaret geçmişi (son ${gecmis.length} durum kaydı)</h2><table><thead><tr><th>Saat</th><th>Kayıt</th><th>İşaretleyen</th></tr></thead><tbody>${gecmis.map(o => td(fmt.saat(o.zaman), olayMetni(o), o.kaynak === 'asistan' ? 'ATLAS' : (o.kim_ad || ''))).join('')}</tbody></table>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}
function provaTemizligi() {
  const ilk = firmaListesi().filter(isaretliMi);
  if (!ilk.length) return toast('Sıfırlanacak işaret yok');
  const oy = ilk.filter(f => f.durum === 'oy_kullandi').length, kendi = ilk.filter(f => f.kendi_geldi).length, kars = ilk.filter(f => f.karsilayan).length;
  const m = modal('Prova temizliği', `
    ${oyVermeSurdu() ? `<div class="yon-uyari-kutu kirmizi"><b>Oy verme saatindesin</b><div>Bu işlem provayı değil, GERÇEK seçim işaretlerini siler.</div></div>` : ''}
    <p style="margin:0 0 10px;font-weight:700;line-height:1.5">${fmt.sayi(ilk.length)} firmanın gün durumu "Bekliyor" olacak${oy ? `; ${fmt.sayi(oy)} "oy kullandı" işareti silinecek` : ''}${kendi ? `; ${fmt.sayi(kendi)} "kendi geldi" işareti kalkacak` : ''}${kars ? `; ${fmt.sayi(kars)} "karşılayan" kaydı silinecek` : ''}.</p>
    <p class="yon-aciklama">Oy sınıfları, notlar ve araç atamaları korunur. Hemen ardından çıkan bildirimdeki "Geri al" ile 20 saniye içinde dönebilirsin.</p>
    <label class="yon-lbl" for="yon-sifirla">Onaylamak için SIFIRLA yaz</label>
    <input id="yon-sifirla" class="yon-girdi" data-sifirla-yazi autocomplete="off" placeholder="SIFIRLA">`,
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
      const karsilananlar = ids.map(id => store.firmalar.get(id)).filter(f => f?.karsilayan).map(f => ({ id: f.id, kim: f.karsilayan }));
      const geriDurum = await durumYap(ids, 'bekliyor', { kendi: false, metin: 'Prova temizliği (toplu sıfırlama)' });
      for (const k of karsilananlar) await firmaAlanYaz(k.id, { karsilayan: null, karsilama_zamani: null }, { metin: 'Prova temizliği (karşılayan silindi)' });
      const geriAl = async () => { await geriDurum(); for (const k of karsilananlar) await firmaAlanYaz(k.id, { karsilayan: k.kim }, { metin: 'geri alındı' }); };
      toast(`${fmt.sayi(ids.length)} firma sıfırlandı`, { tur: 'basari', geriAl, sure: 20000 });
    } catch (e) { hataGoster(e); }
  });
}

// ---------------------------------------------------------------- Excel içe aktarma (yalnız eşleşen firmaların iletişim alanları güncellenir)
const XLSX_ADRES = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs';
const bas_ = s => trArama(s).replace(/[^a-z0-9]/g, '');
// [alan, gösterilen ad, tanınan başlıklar, güncellenebilir mi]
const EXCEL_ALAN = [
  ['oda_sicil', 'Oda sicil no', ['odasicil', 'odasicilno', 'odasicilnumarasi', 'odasicilno'], false],
  ['ticari_sicil', 'Ticari sicil no', ['ticarisicil', 'ticarisicilno', 'ticaretsicil', 'ticaretsicilno', 'ticarisicilnumarasi'], false],
  ['unvan', 'Firma ünvanı', ['unvan', 'firmaunvani', 'firmaadi', 'firma', 'ticariunvan', 'unvani'], false],
  ['yetkili', '1. yetkili ad soyad', ['yetkili', 'yetkili1', '1yetkili', 'yetkiliadsoyad', 'yetkiliadisoyadi', '1yetkiliadsoyad'], true],
  ['cep', '1. yetkili cep', ['cep', 'cep1', 'ceptel', 'ceptelefonu', 'yetkilicep', '1yetkilicep', 'gsm', 'yetkiliceptelefonu'], true],
  ['yetkili2', '2. yetkili ad soyad', ['yetkili2', '2yetkili', '2yetkiliadsoyad', 'ikinciyetkili'], true],
  ['cep2', '2. yetkili cep', ['cep2', '2cep', '2yetkilicep', 'ceptel2', 'yetkilicep2'], true],
  ['referans', 'Referans', ['referans', 'referans1', 'ref'], true],
  ['ilce', 'İlçe', ['ilce'], true],
  ['adres', 'Adres', ['adres'], true],
  ['sabit_tel', 'Sabit telefon', ['sabittel', 'sabittelefon', 'telefon', 'tel'], true],
];
const tel10 = v => { let d = String(v ?? '').replace(/\D/g, ''); if (d.length === 12 && d.startsWith('90')) d = d.slice(2); if (d.length === 11 && d.startsWith('0')) d = d.slice(1); return d; };
const sicilNorm = v => String(v ?? '').trim().replace(/\.0+$/, '').replace(/^0+/, '');
function excelDeger(alan, v) {
  let s = String(v ?? '').replace(/\s+/g, ' ').trim(); if (!s) return '';
  if (alan === 'cep' || alan === 'cep2') { const d = tel10(s); return d.length === 10 ? d : s; }
  if (['yetkili', 'yetkili2', 'ilce'].includes(alan)) return s.toLocaleUpperCase('tr');
  return s;
}
const mevcutDeger = (alan, f) => { const v = f[alan]; return alan === 'cep' || alan === 'cep2' ? (tel10(v).length === 10 ? tel10(v) : String(v ?? '').trim()) : ['yetkili', 'yetkili2', 'ilce'].includes(alan) ? String(v ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr') : String(v ?? '').replace(/\s+/g, ' ').trim(); };
const excel = { ad: '', satir: 0, sonuc: null, hata: '', yukleniyor: false, surukle: false, uygulaniyor: false };

async function excelOku(dosya) {
  excel.hata = ''; excel.sonuc = null; excel.ad = dosya.name; excel.yukleniyor = true; excelCiz();
  try {
    const XLSX = await import(XLSX_ADRES);
    const kitap = XLSX.read(await dosya.arrayBuffer(), { type: 'array', cellDates: false });
    const sayfa = kitap.Sheets[kitap.SheetNames[0]];
    const satirlar = XLSX.utils.sheet_to_json(sayfa, { defval: '', raw: false, blankrows: false });
    if (!satirlar.length) throw new Error('Dosyada satır bulunamadı. İlk satır sütun başlıkları olmalı.');
    const basliklar = Object.keys(satirlar[0]);
    const esle = new Map(), taninmayan = [];
    for (const b of basliklar) {
      const n = bas_(b), e = EXCEL_ALAN.find(([alan, , takma]) => !esle.has(alan) && (n === bas_(alan) || takma.includes(n)));
      if (e) esle.set(e[0], b); else taninmayan.push(b);
    }
    const anahtar = ['oda_sicil', 'ticari_sicil', 'unvan'].filter(a => esle.has(a));
    if (!anahtar.length) throw new Error('Firmaları eşleştirmek için Oda sicil, Ticari sicil ya da Firma ünvanı sütunu gerekli.');
    const firmalar = firmaListesi();
    const dizin = {
      oda_sicil: new Map(firmalar.filter(f => sicilNorm(f.oda_sicil)).map(f => [sicilNorm(f.oda_sicil), f])),
      ticari_sicil: new Map(firmalar.filter(f => sicilNorm(f.ticari_sicil)).map(f => [sicilNorm(f.ticari_sicil), f])),
      unvan: new Map(firmalar.filter(f => f.unvan).map(f => [bas_(f.unvan), f])),
    };
    const bul = r => {
      for (const a of anahtar) {
        const ham = r[esle.get(a)]; const k = a === 'unvan' ? bas_(ham) : sicilNorm(ham);
        if (k && dizin[a].has(k)) return dizin[a].get(k);
      }
      return null;
    };
    let yeniSayi = 0, ayniSayi = 0; const degisiklikler = [], alanSayilari = {}; const gorulen = new Set();
    for (const r of satirlar) {
      const f = bul(r);
      if (!f) { yeniSayi++; continue; }
      if (gorulen.has(f.id)) continue; gorulen.add(f.id);
      const alanlar = {}, eski = {};
      for (const [alan, , , guncellenir] of EXCEL_ALAN) {
        if (!guncellenir || !esle.has(alan)) continue;
        const yeniV = excelDeger(alan, r[esle.get(alan)]);
        if (yeniV && yeniV !== mevcutDeger(alan, f)) { alanlar[alan] = yeniV; eski[alan] = f[alan] ?? null; alanSayilari[alan] = (alanSayilari[alan] || 0) + 1; }
      }
      if (Object.keys(alanlar).length) degisiklikler.push({ id: f.id, alanlar, eski }); else ayniSayi++;
    }
    excel.satir = satirlar.length;
    excel.sonuc = { yeni: yeniSayi, guncellenen: degisiklikler.length, ayni: ayniSayi, silinen: 0, degisiklikler, alanSayilari, taninmayan,
      eslesen: EXCEL_ALAN.filter(([alan]) => esle.has(alan)).map(([alan, ad]) => ({ col: esle.get(alan), ad, ornek: String(satirlar[0][esle.get(alan)] ?? '').slice(0, 24), guncellenir: EXCEL_ALAN.find(x => x[0] === alan)[3], sayi: alanSayilari[alan] || 0 })) };
  } catch (e) { excel.hata = e.message || String(e); excel.sonuc = null; }
  finally { excel.yukleniyor = false; excelCiz(); }
}
async function excelUygula() {
  const sn = excel.sonuc; if (!sn || !sn.degisiklikler.length || excel.uygulaniyor) return;
  const alanToplam = Object.values(sn.alanSayilari).reduce((a, b) => a + b, 0);
  if (!(await onayla(`${fmt.sayi(sn.guncellenen)} firmanın ${fmt.sayi(alanToplam)} alanı Excel'deki değerlerle güncellenecek. Oy durumu, sınıf ve notlara dokunulmaz.${sn.yeni ? ` ${fmt.sayi(sn.yeni)} yeni satır eklenmez.` : ''}`, { evet: 'İçe aktar' }))) return;
  excel.uygulaniyor = true; excelCiz();
  const yapilan = [];
  try {
    for (const d of sn.degisiklikler) { await firmaAlanYaz(d.id, d.alanlar, { kaynak: 'excel', metin: `Excel aktarımı: ${excel.ad}` }); yapilan.push(d); }
    excel.sonuc = null; excel.ad = ''; excel.satir = 0;
    toast(`${fmt.sayi(yapilan.length)} firma güncellendi`, { tur: 'basari', sure: 15000, geriAlMetin: 'Excel aktarımı geri alındı', geriAl: async () => { for (const d of yapilan) await firmaAlanYaz(d.id, d.eski, { kaynak: 'el', metin: 'Excel aktarımı geri alındı' }); } });
  } catch (e) { hataGoster(e); if (yapilan.length) toast(`${yapilan.length} firma güncellendi, sonrası durdu`, { tur: 'hata' }); }
  finally { excel.uygulaniyor = false; excelCiz(); }
}
function excelCiz() {
  const kap = kok?.querySelector('[data-excel]'); if (!kap) return;
  const sn = excel.sonuc;
  kap.innerHTML = `
    <div class="yon-kart-baslik">Excel yükle</div>
    <div class="yon-birak ${excel.surukle ? 'surukle' : ''}" data-birak role="button" tabindex="0">
      <div class="yon-birak-ikon">⤒</div>
      <div class="yon-birak-baslik">${excel.yukleniyor ? 'Dosya okunuyor…' : 'Excel dosyasını buraya bırak'}</div>
      <div class="yon-ipucu" style="margin:0">.xlsx · firma listesi · ilk satır sütun başlıkları</div>
      <input type="file" hidden name="excel-dosya" data-excel-dosya accept=".xlsx,.xls,.csv">
    </div>
    ${excel.hata ? `<div class="yon-uyari-kutu">${esc(excel.hata)}</div>` : ''}
    ${sn ? `<div class="yon-excel-sonuc">
      <div class="yon-excel-dosya"><b>${esc(excel.ad)}</b><span>${fmt.sayi(excel.satir)} satır</span></div>
      <div class="yon-excel-say"><div class="yesil">${fmt.sayi(sn.yeni)} yeni</div><div class="mavi">${fmt.sayi(sn.guncellenen)} güncellenen</div><div class="gri">${fmt.sayi(sn.silinen)} silinen</div></div>
      <div class="yon-eslesme">
        <div class="yon-eslesme-satir bas"><div>EXCEL SÜTUNU</div><div></div><div>ALAN</div><div>ÖRNEK</div></div>
        ${sn.eslesen.map(m => `<div class="yon-eslesme-satir"><div class="mono">${esc(m.col)}</div><div class="yon-ok">→</div><div><b>${esc(m.ad)}</b>${m.guncellenir ? `<span class="yon-zayif"> · ${m.sayi} değişecek</span>` : '<span class="yon-zayif"> · eşleştirme anahtarı</span>'}</div><div class="eslesti">✓ eşleşti</div></div>`).join('')}
      </div>
      ${sn.taninmayan.length ? `<div class="yon-ipucu">Tanınmayan ${sn.taninmayan.length} sütun yok sayıldı: ${esc(sn.taninmayan.slice(0, 8).join(', '))}${sn.taninmayan.length > 8 ? '…' : ''}</div>` : ''}
      ${sn.yeni ? `<div class="yon-ipucu">${fmt.sayi(sn.yeni)} satır listede bulunamadı. Yeni firma eklemek için dosyayı ATLAS'a gönder; burada yalnız mevcut firmaların iletişim bilgileri güncellenir.</div>` : ''}
      <button class="yon-ana-dugme sol" data-excel-uygula ${sn.guncellenen && !excel.uygulaniyor ? '' : 'disabled'}>${excel.uygulaniyor ? 'Aktarılıyor…' : sn.guncellenen ? `İçe aktar · ${fmt.sayi(sn.guncellenen)} değişiklik` : 'Güncellenecek bir şey yok'}</button>
    </div>` : ''}`;
}
function toplulukHtml() {
  const t = store.topluluk, toplam = t.length, eslesen = t.filter(x => x.firma_id != null).length;
  const firmaSayi = firmaListesi().filter(f => f.toplulukta).length;
  return `<div class="yon-etiket">WHATSAPP TOPLULUĞU EŞLEŞTİRME</div>
    <div class="yon-buyuk-sayi"><b>${fmt.sayi(firmaSayi)}</b><span>kişi toplulukta · ${fmt.sayi(toplam)} üye</span></div>
    <div class="yon-cubuk kalin"><i style="width:${fmt.yuzde(eslesen, toplam)}%"></i></div>
    <div class="yon-topluluk-satirlar"><div>✓ ${fmt.sayi(eslesen)} telefon numarasıyla eşleşti</div><div>◌ ${fmt.sayi(Math.max(0, toplam - eslesen))} üye listede bulunamadı</div></div>`;
}
const veriBolum = {
  kur(b) {
    b.addEventListener('click', e => {
      if (e.target.closest('[data-csv]')) return csvIndir();
      if (e.target.closest('[data-pdf]')) return pdfRapor();
      if (e.target.closest('[data-prova]')) return provaTemizligi();
      if (e.target.closest('[data-excel-uygula]')) return excelUygula();
      if (e.target.closest('[data-birak]') && !e.target.closest('input')) b.querySelector('[data-excel-dosya]')?.click();
    });
    b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-birak]')) { e.preventDefault(); b.querySelector('[data-excel-dosya]')?.click(); } });
    b.addEventListener('change', e => { if (e.target.matches('[data-excel-dosya]') && e.target.files[0]) excelOku(e.target.files[0]); });
    b.addEventListener('dragover', e => { if (!e.target.closest('[data-birak]')) return; e.preventDefault(); if (!excel.surukle) { excel.surukle = true; e.target.closest('[data-birak]').classList.add('surukle'); } });
    b.addEventListener('dragleave', e => { const z = e.target.closest('[data-birak]'); if (z && !z.contains(e.relatedTarget)) { excel.surukle = false; z.classList.remove('surukle'); } });
    b.addEventListener('drop', e => { const z = e.target.closest('[data-birak]'); if (!z) return; e.preventDefault(); excel.surukle = false; z.classList.remove('surukle'); const d = e.dataTransfer?.files?.[0]; if (d) excelOku(d); });
  },
  ciz(b) {
    if (!b) return;
    const hepsi = firmaListesi(), s = sayac(), toplam = hepsi.length;
    const insan = [...store.profiller.values()].filter(p => p.rol !== 'bot');
    const araclar = [...store.araclar.values()];
    const turlar = Object.entries(hepsi.reduce((m, f) => { const t = f.tur || 'Belirsiz'; m[t] = (m[t] || 0) + 1; return m; }, {})).sort((a, c) => c[1] - a[1]);
    const isaretli = hepsi.filter(isaretliMi).length;
    const sonExcel = store.olaylar.find(o => o.kaynak === 'excel');
    b.innerHTML = `
      <div class="kpi-serit">
        ${kpi('Firma', toplam, turlar.map(([t, n]) => `${fmt.sayi(n)} ${String(t).toLocaleLowerCase('tr')}`).join(' · '))}
        ${kpi('Kesin bizde', s.bizde, `Hedef ${fmt.sayi(s.hedef)}`, 'vurgu')}
        ${kpi('Topluluk üyesi', store.topluluk.length, `${fmt.sayi(hepsi.filter(f => f.toplulukta).length)} firma toplulukta`)}
        ${kpi('Araç', araclar.length, `${fmt.sayi(araclar.filter(a => a.sofor_kullanici).length)} şoför hesabı bağlı`)}
        ${kpi('Kullanıcı', insan.length, `${fmt.sayi(insan.filter(p => p.aktif).length)} aktif`)}
      </div>
      <div class="yon-veri-duzen">
        <div class="yon-kart yon-pad-buyuk yon-excel" data-excel></div>
        <div class="yon-veri-sag">
          <div class="yon-kart yon-pad">${toplulukHtml()}</div>
          <div class="yon-kart yon-pad">
            <div class="yon-etiket">SEÇİM SONRASI RAPOR</div>
            <div class="yon-aciklama" style="margin:0">Gelen/gelmeyen listesi, referans tablosu, saatlik grafik ve tüm işaret geçmişi tek PDF'te.</div>
            <button class="yon-dugme" data-pdf>↓ Rapor indir (PDF)</button>
            <button class="yon-baglanti" data-csv>Excel için CSV indir (${fmt.sayi(toplam)} firma)</button>
            ${sonExcel ? `<div class="yon-ipucu">Son Excel aktarımı: ${esc(goreliUzun(sonExcel.zaman))}${sonExcel.kim_ad ? ` · ${esc(sonExcel.kim_ad)}` : ''}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="yon-kart yon-tehlike"><div class="yon-kart-baslik">Prova temizliği</div>
        <div class="yon-tehlike-govde">
          <div><p>Seçim sabahı provadan sonra tüm gün durumlarını sıfırlar: her firma "Bekliyor" olur, "kendi geldi" işaretleri kalkar. Oy sınıfı, not ve araç atamaları korunur.</p>
            <div class="yon-zayif">Şu an işaretli: <b style="color:var(--ink)">${fmt.sayi(isaretli)}</b> firma${oyVermeSurdu() ? ' · <b style="color:var(--red)">oy verme saatindesin</b>' : ''}</div></div>
          <button class="btn btn-kirmizi" data-prova ${isaretli ? '' : 'disabled'}>${isaretli ? `${fmt.sayi(isaretli)} firmayı sıfırla` : 'Sıfırlanacak işaret yok'}</button>
        </div></div>`;
    excelCiz();
  },
  yenile(s) {
    if (excel.yukleniyor || excel.uygulaniyor) return;
    if (['firma', 'firmalar', 'arac', 'araclar', 'profil', 'ayar', 'olay', 'hazir'].some(x => s.has(x))) {
      const b = bolumEl(); if (!b) return;
      // yükleme alanına dokunma: yalnız üst özet, topluluk ve tehlike kartı yenilenir
      const eski = { sonuc: excel.sonuc, ad: excel.ad, satir: excel.satir, hata: excel.hata };
      veriBolum.ciz(b); Object.assign(excel, eski); excelCiz();
    }
  },
};

// ================================================================ kabuk
const BOLUM = { kullanicilar, onay, gorev: gorevBolum, gunluk: gunlukBolum, ayarlar: ayarlarBolum, whatsapp: whatsappBolum, veri: veriBolum };

function menuCiz() {
  const m = kok?.querySelector('[data-menu]'); if (!m) return;
  const onaySay = bekleyenSay(), kisi = [...store.profiller.values()].filter(p => p.rol !== 'bot').length;
  const taslakVar = { ayarlar: !!taslak.ayar, whatsapp: !!taslak.whatsapp };
  m.innerHTML = SEKMELER.map(s => `<button type="button" class="${s.k === sekme ? 'aktif' : ''}" data-sekme="${s.k}" ${s.k === sekme ? 'aria-current="page"' : ''}><span>${esc(s.ad)}</span>${
    s.k === 'onay' && onaySay ? `<span class="meta bek">● ${onaySay}</span>`
      : s.k === 'kullanicilar' ? `<span class="meta">${kisi}</span>`
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
    try { BOLUM[sekme].yenile?.(s); } catch (e) { console.error('admin yenile', e); }
  });
}

export default {
  async render(k, param) {
    stilEkle();
    kok = k;
    if (!yoneticiMi()) { k.innerHTML = '<div class="kart"><div class="bos">Bu bölüm yalnız admin içindir.</div></div>'; kok = null; return; }
    sekme = BOLUM[param] ? param : (bekleyenSay() ? 'onay' : 'kullanicilar');
    k.innerHTML = `
    <div class="yon">
      <div class="yon-duzen">
        <nav class="yon-nav" aria-label="Admin bölümleri">
          <div class="yon-nav-baslik"><div class="yon-h">Admin</div><div class="yon-etiket-kutu">YALNIZ ADMIN</div></div>
          <div class="yon-menu" data-menu></div>
        </nav>
        <section class="yon-icerik" data-icerik></section>
      </div>
    </div>`;
    k.querySelector('[data-menu]').addEventListener('click', e => { const b = e.target.closest('[data-sekme]'); if (b) sekmeAc(b.dataset.sekme); });
    // Ortak yazma işlemleri (kaydet / vazgeç / taslağı at): ayarlar ve WhatsApp bölümlerinde aynı
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
.yon-duzen { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 16px; align-items: start; }
.yon-nav { position: sticky; top: calc(var(--ust-h) + 16px); display: flex; flex-direction: column; gap: 4px; }
.yon-nav-baslik { display: flex; align-items: center; gap: 8px; padding: 6px 10px 12px; }
.yon-h { font-size: 20px; font-weight: 900; letter-spacing: -.02em; }
.yon-etiket-kutu { font-size: 10px; font-weight: 800; letter-spacing: .08em; color: var(--ink-3); border: 1px solid var(--line-2); border-radius: 5px; padding: 2px 6px; white-space: nowrap; }
.yon-menu { display: flex; flex-direction: column; gap: 4px; }
.yon-menu button { display: flex; align-items: center; height: 40px; padding: 0 12px; border-radius: 9px; border: 0; cursor: pointer; font-size: 14px; font-weight: 600; text-align: left; background: transparent; color: var(--ink-2); white-space: nowrap; }
.yon-menu button:hover { background: var(--hover); color: var(--ink); }
.yon-menu button.aktif { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
.yon-menu .meta { margin-left: auto; font-size: 12px; color: var(--ink-3); font-weight: 600; }
.yon-menu .meta.bek { color: var(--amber-ink); font-weight: 800; }
.yon-taslak-nokta { margin-left: auto; width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px var(--amber-soft); }
.yon-icerik { min-width: 0; }
.yon code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; background: var(--surface-3); padding: 1px 5px; border-radius: 4px; word-break: break-all; }

/* ortak parçalar */
.yon-kart { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
.yon-pad { padding: 18px; display: flex; flex-direction: column; gap: 10px; overflow: visible; }
.yon-pad-buyuk { padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow: visible; }
.yon-kart-ust { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.yon-kart-ust b { font-size: 15px; font-weight: 800; white-space: nowrap; }
.yon-kart-ust .alt { font-size: 13px; color: var(--ink-3); }
.yon-kart-sag { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.yon-kart-baslik { font-size: 15px; font-weight: 800; }
[data-cakisma]:empty { display: none; }
.yon-bolum-baslik { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.yon-bolum-baslik h2 { margin: 0; font-size: 18px; font-weight: 900; white-space: nowrap; }
.yon-bolum-baslik .alt { font-size: 13px; color: var(--ink-3); }
.yon-etiket-kirmizi { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: var(--red); white-space: nowrap; }
.yon-etiket { font-size: 11px; font-weight: 800; letter-spacing: .1em; white-space: nowrap; }
.yon-mikro { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; color: var(--ink-3); white-space: nowrap; }
.yon-lbl { font-size: 12px; font-weight: 700; color: var(--ink-2); display: block; }
.yon-lbl-satir { display: flex; align-items: center; margin-bottom: 6px; }
.yon-lbl-satir .yon-baglanti { margin-left: auto; }
.yon-alan { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.yon-iki-alan { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.yon-ipucu { font-size: 12px; color: var(--ink-3); line-height: 1.45; }
.yon-ipucu.yon-alta { align-self: end; padding-bottom: 12px; }
.yon-aciklama { font-size: 13px; color: var(--ink-2); line-height: 1.5; }
.yon-zayif { color: var(--ink-3); font-weight: 500; }
.yon-alt { font-size: 12px; color: var(--ink-3); line-height: 1.3; }
.yon-uyari-yazi { font-size: 13px; color: var(--amber-ink); font-weight: 700; }
.yon-hata { min-height: 0; font-size: 12.5px; font-weight: 700; color: var(--red); }
.yon-hata:empty { display: none; }
.yon-uyari-satir { font-size: 12.5px; font-weight: 700; color: var(--amber-ink); }
.yon-uyari-kutu { padding: 10px 14px; border-radius: 10px; background: var(--amber-soft); border: 1.5px solid var(--amber); color: var(--amber-ink); font-size: 13px; font-weight: 700; line-height: 1.45; }
.yon-uyari-kutu > div { font-weight: 500; }
.yon-uyari-kutu.kirmizi { background: var(--red-soft); border-color: var(--red); color: var(--red); margin-bottom: 12px; }
.yon-degisti { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 12px; background: var(--amber-soft); color: var(--amber-ink); border-radius: 10px; font-weight: 700; font-size: 12.5px; }
.yon-degisti span { flex: 1; }
.yon-yukleniyor { padding: 10px 16px; font-size: 12px; color: var(--ink-3); font-weight: 600; }
.yon-bos { display: grid; justify-items: center; gap: 4px; line-height: 1.5; }
.yon-bos b { color: var(--ink); }
.yon-daha { width: 100%; height: 42px; color: var(--ink-2); border-radius: 10px; margin-top: 8px; }
.yon-baglanti { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--ink-2); cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 2px; text-align: left; }
.yon-baglanti:hover { color: var(--ink); }
.yon-baglanti:disabled { opacity: .5; cursor: default; }
.yon-kaydir { overflow-x: auto; }
.yon-tablo-ic { min-width: 700px; }
.yon-tablo-ic.wide { min-width: 900px; }
.yon-satir { line-height: 1.25; display: grid; gap: 12px; align-items: center; padding: 10px 18px; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.yon-satir:last-child { border-bottom: 0; }
.yon-baslik-satir { padding-top: 9px; padding-bottom: 9px; background: var(--surface-2); font-size: 11px; font-weight: 700; letter-spacing: .07em; color: var(--ink-3); white-space: nowrap; }
.yon-avatar { width: 30px; height: 30px; flex: none; border-radius: 99px; background: var(--surface-3); color: var(--ink-2); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }
.yon-avatar.koyu { background: var(--ink); color: var(--surface); }
.yon-avatar.orta { width: 34px; height: 34px; font-size: 12px; }
.yon-kisi { display: flex; align-items: center; gap: 10px; min-width: 0; }
.yon-ad { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.yon-sen { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; background: var(--surface-3); color: var(--ink-3); border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: 1px; }
.yon-saat { font-size: 12px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.yon-rozet { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; border: 1.5px solid transparent; line-height: 1; }
.yon-mini { height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.yon-mini:hover:not(:disabled) { background: var(--hover); }
.yon-mini:disabled { opacity: .45; cursor: not-allowed; }
.yon-mini.soluk { color: var(--ink-2); }
.yon-mini.ikon { width: 30px; padding: 0; font-size: 15px; line-height: 1; }
.yon-mini.buyuk { height: 34px; padding: 0 12px; border-radius: 9px; font-size: 12.5px; }
.yon-donen { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line-2); border-top-color: var(--red); animation: yon-don .7s linear infinite; flex: none; }
@keyframes yon-don { to { transform: rotate(360deg); } }
.yon-girdi { width: 100%; height: 44px; box-sizing: border-box; padding: 0 12px; border-radius: 10px; border: 1.5px solid var(--line-2); background: var(--surface-2); color: var(--ink); font-size: 14px; font-weight: 600; outline: none; min-width: 0; }
.yon-girdi.buyuk { font-size: 15px; }
.yon-girdi:focus { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.yon-girdi:disabled { opacity: .7; }
.yon-girdi.ara { width: 260px; height: 34px; font-size: 13px; font-weight: 500; }
textarea.yon-girdi { height: auto; padding: 12px; line-height: 1.5; resize: none; font-weight: 500; }
.yon-dugme { display: flex; align-items: center; justify-content: center; height: 42px; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13.5px; font-weight: 700; cursor: pointer; padding: 0 12px; white-space: nowrap; text-decoration: none; }
.yon-dugme:hover:not(:disabled):not(.pasif) { background: var(--hover); }
.yon-dugme:disabled, .yon-dugme.pasif { opacity: .5; cursor: not-allowed; pointer-events: none; }
.yon-ana-dugme { height: 48px; border-radius: 11px; border: 0; background: var(--red); color: #fff; font-size: 15px; font-weight: 800; cursor: pointer; }
.yon-ana-dugme:hover:not(:disabled) { background: var(--red-d); }
.yon-ana-dugme:disabled { opacity: .5; cursor: not-allowed; }
.yon-ana-dugme.sol { align-self: flex-start; height: 44px; padding: 0 18px; font-size: 14px; white-space: nowrap; }
.yon-koyu-dugme { height: 44px; border-radius: 10px; border: 0; background: var(--ink); color: var(--surface); font-size: 14px; font-weight: 800; cursor: pointer; }
.yon-koyu-dugme:hover { filter: brightness(1.15); }
.yon-ikili { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.yon-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 3px; border-radius: 10px; background: var(--surface-3); gap: 2px; }
.yon-seg.uc { grid-auto-flow: row; grid-template-columns: repeat(3, 1fr); }
.yon-seg button { height: 36px; border-radius: 8px; border: 0; cursor: pointer; font-size: 12.5px; font-weight: 700; background: transparent; color: var(--ink-2); padding: 0 4px; white-space: nowrap; }
.yon-seg button.aktif { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
.yon-seg button:disabled { cursor: not-allowed; opacity: .6; }
.yon-cubuk { height: 6px; border-radius: 99px; background: var(--surface-3); overflow: hidden; flex: 1; }
.yon-cubuk.kalin { height: 10px; flex: none; }
.yon-cubuk i { display: block; height: 100%; background: var(--green); border-radius: 99px; transition: width .4s; }
.yon-ok { text-align: center; color: var(--ink-3); }
.yon-metin { margin: 0; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; font: 500 12.5px/1.55 var(--font); white-space: pre-wrap; word-break: break-word; color: var(--ink-2); max-height: 220px; overflow: auto; }
.yon-kaydet-satir { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.yon-kaydet-satir .durum { margin-right: auto; font-size: 12.5px; font-weight: 700; color: var(--ink-3); }
.yon-kaydet-satir .durum.kirli { color: var(--amber-ink); }

/* kullanıcılar */
.yon-kul-duzen { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
.yon-kul { grid-template-columns: minmax(150px, 1fr) 112px 48px 46px 46px 204px; gap: 10px; padding-left: 16px; padding-right: 14px; }
.yon-kul .yon-alt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.yon-kul.pasif > *:not(:last-child) { opacity: .55; }
.yon-kul.bot { color: var(--ink-3); }
.yon-rol { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; border: 1.5px solid transparent; }
.yon-rol.r-yonetici { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.yon-rol.r-kurul { background: var(--red-soft); color: var(--red); border-color: var(--red-line); }
.yon-rol.r-masa { background: transparent; color: var(--ink); border-color: var(--ink); }
.yon-rol.r-sofor { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber-soft); }
.yon-rol.r-sorumlu { background: var(--blue-soft); color: var(--blue); border-color: var(--blue-soft); }
.yon-rol.r-rapor, .yon-rol.r-bot { background: var(--gray-soft); color: var(--ink-2); border-color: var(--gray-soft); }
.yon-pin-kucuk { font-family: ui-monospace, Menlo, monospace; font-size: 13px; font-weight: 700; letter-spacing: .06em; white-space: nowrap; color: var(--ink-3); }
.yon-pin-kucuk.acik { color: var(--ink); }
.yon-son { font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.yon-islem { display: flex; gap: 5px; justify-content: flex-end; align-items: center; }
.yon-yeni { position: sticky; top: calc(var(--ust-h) + 16px); padding: 18px; display: flex; flex-direction: column; gap: 14px; overflow: visible; }
.yon-pin-kutu { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; border: 1.5px dashed var(--line-2); }
.yon-pin-kutu.dolu { border-style: solid; border-color: var(--red-line); background: var(--surface-2); }
.yon-pin-kutu > button { margin-left: auto; }
.yon-pin-buyuk { font-size: 34px; font-weight: 900; letter-spacing: .3em; font-variant-numeric: tabular-nums; line-height: 1.1; }
.yon-pin-kutu:not(.dolu) .yon-pin-buyuk { color: var(--ink-3); }
.yon-yeni .yon-aciklama { margin-top: -8px; }

/* onay */
.yon-onay { max-width: 980px; display: flex; flex-direction: column; gap: 12px; }
.yon-istek { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.yon-istek.bekliyor { border: 1.5px solid var(--amber); }
.yon-istek.red { opacity: .7; }
.yon-istek-ust { display: flex; align-items: center; gap: 10px; }
.yon-istek-kim { min-width: 0; line-height: 1.25; }
.yon-istek-ad { font-size: 14.5px; font-weight: 800; white-space: nowrap; }
.yon-istek-sag { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.risk-dusuk { background: var(--green-soft); color: var(--green); border-color: var(--green-soft); }
.risk-orta { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber-soft); }
.risk-yuksek { background: var(--red-soft); color: var(--red); border-color: var(--red-line); }
.ist-bek { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber); }
.ist-yap { background: var(--blue-soft); color: var(--blue); border-color: var(--blue-soft); }
.ist-ok { background: var(--green); color: #fff; border-color: var(--green); }
.ist-red { background: var(--karsi); color: var(--karsi-ink); border-color: var(--karsi); }
.ist-hata { background: var(--amber); color: #1a1200; border-color: var(--amber); }
.yon-istek-metin { font-size: 16px; font-weight: 600; line-height: 1.45; padding: 10px 14px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--line); white-space: pre-wrap; word-break: break-word; }
.yon-istek-iki { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 16px; }
.yon-istek-kol { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.yon-adim { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 6px; font-size: 13.5px; line-height: 1.4; }
.yon-adim span:first-child { font-weight: 800; color: var(--ink-3); }
.yon-etki { font-size: 13.5px; font-weight: 700; line-height: 1.4; }
.yon-degisiklik { margin: 6px 0 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.yon-degisiklik li { padding: 6px 12px; font-size: 12.5px; font-weight: 600; border-bottom: 1px solid var(--line); }
.yon-degisiklik li:last-child { border-bottom: 0; }
.yon-degisiklik li[data-firma] { cursor: pointer; }
.yon-degisiklik li[data-firma]:hover { background: var(--surface-2); }
.yon-karar { display: flex; gap: 10px; align-items: center; }
.yon-girdi.karar { flex: 1; height: 48px; font-size: 14px; font-weight: 500; }
.yon-dugme.karar { height: 48px; padding: 0 22px; font-size: 15px; font-weight: 800; border: 1.5px solid var(--line-2); }
.yon-dugme.karar.yesil { padding: 0 30px; background: var(--green); border-color: var(--green); color: #fff; }
.yon-dugme.karar.yesil:hover:not(:disabled) { background: var(--green); filter: brightness(.92); }
.yon-yapiliyor { display: flex; flex-direction: column; gap: 6px; }
.yon-yapiliyor > div { font-size: 13.5px; font-weight: 700; color: var(--blue); }
.yon-yapiliyor i { display: block; height: 6px; border-radius: 99px; background: linear-gradient(90deg, var(--blue-soft) 0, var(--blue) 50%, var(--blue-soft) 100%); background-size: 400px 100%; animation: smShimmer 1s linear infinite; }
.yon-yapildi { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: var(--green-soft); border: 1.5px solid var(--green); }
.yon-yapildi div { font-size: 14px; font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
.yon-yapildi span { margin-left: auto; font-size: 12px; color: var(--ink-2); text-align: right; }
.yon-reddedildi { font-size: 13.5px; font-weight: 600; color: var(--ink-2); padding: 10px 14px; border-radius: 10px; background: var(--surface-3); }
.yon-hatali { font-size: 13.5px; font-weight: 700; color: var(--amber-ink); padding: 10px 14px; border-radius: 10px; background: var(--amber-soft); border: 1.5px solid var(--amber); overflow-wrap: anywhere; }

/* görev dağılımı */
.yon-gorev { display: flex; flex-direction: column; gap: 16px; }
.yon-iki-kart { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.yon-ok-izgara { display: grid; grid-template-columns: 1fr 24px 1fr; gap: 8px; align-items: center; }
.yon-onizleme { font-size: 13px; color: var(--ink-2); min-height: 18px; }
.yon-gd { grid-template-columns: minmax(0, 1fr) 130px 70px 70px 90px minmax(0, 1fr) 140px; }
.yon-sol-yazi { color: var(--ink-2); white-space: nowrap; }
.yon-sayi { font-weight: 800; font-variant-numeric: tabular-nums; }
.yon-tab-sayi { font-variant-numeric: tabular-nums; }
.yon-plakalar { font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.yon-ilerleme { display: flex; align-items: center; gap: 8px; }
.yon-ilerleme span { font-size: 11.5px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* günlük */
.yon-log { grid-template-columns: 52px 130px 150px minmax(0, 1fr) minmax(0, 1.2fr) 120px 80px; align-items: start; padding: 11px 18px; font-size: 13px; }
.yon-log.yon-baslik-satir { align-items: center; font-size: 11px; }
.yon-log-kim { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.yon-log-onay { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.yon-log-istek { line-height: 1.35; overflow-wrap: anywhere; }
.yon-log-deg { color: var(--ink-2); line-height: 1.35; overflow-wrap: anywhere; }
.yon-log-deg ul { list-style: none; margin: 0 0 4px; padding: 0; }
.yon-log-deg li { padding: 1px 0; }
.yon-log-deg li[data-firma] { cursor: pointer; }
.yon-log-deg li[data-firma]:hover { color: var(--ink); text-decoration: underline; }
.yon-log-sag { display: flex; justify-content: flex-end; }
.tur-bilgi { background: var(--surface-3); color: var(--ink-2); border-color: var(--surface-3); }
.tur-onay { background: var(--green-soft); color: var(--green); border-color: var(--green-soft); }
.tur-komut { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.tur-red { background: var(--karsi); color: var(--karsi-ink); border-color: var(--karsi); }
.tur-bek { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber); }
.tur-hata { background: var(--amber); color: #1a1200; border-color: var(--amber); }

/* ayarlar */
.yon-ayar-kart { max-width: 760px; padding: 22px; display: flex; flex-direction: column; gap: 20px; overflow: visible; }
.yon-saat-satir { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.yon-girdi.saat { width: auto; min-width: 120px; font-weight: 700; }
.yon-hedef-kutu { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line); }
.yon-hedef-ust { display: flex; align-items: center; gap: 10px; }
.yon-hedef-ust b { font-size: 14px; font-weight: 800; }
.yon-otomatik { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
.yon-hedef-alt { display: flex; align-items: center; gap: 12px; }
.yon-girdi.hedef { width: 140px; height: 52px; padding: 0 14px; font-size: 26px; font-weight: 900; background: var(--surface); }

/* whatsapp */
.yon-wa-duzen { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; align-items: start; }
.yon-wa-sol { gap: 18px; }
.yon-wa-sag { display: flex; flex-direction: column; gap: 16px; position: sticky; top: calc(var(--ust-h) + 16px); }
.yon-olay-satir { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
.yon-olay-satir > div { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.yon-olay-satir b { font-size: 14px; font-weight: 700; }
.yon-olay-satir span { font-size: 12.5px; color: var(--ink-3); }
.yon-degiskenler { display: flex; flex-wrap: wrap; gap: 6px; }
.yon-cip { height: 26px; padding: 0 9px; border-radius: 99px; border: 1px solid var(--line-2); background: var(--surface); font-family: ui-monospace, Menlo, monospace; font-size: 12px; cursor: pointer; color: var(--ink-2); }
.yon-cip:hover { background: var(--hover); color: var(--ink); }
.yon-sablon-alt { display: flex; gap: 10px; justify-content: space-between; font-size: 12px; color: var(--ink-3); }
.yon-wa-zemin { padding: 16px; border-radius: 12px; background: var(--surface-3); display: flex; flex-direction: column; gap: 8px; }
.yon-wa-balon { align-self: flex-start; max-width: 92%; background: var(--surface); border-radius: 4px 12px 12px 12px; padding: 9px 12px; box-shadow: 0 1px 1px rgba(0, 0, 0, .08); display: flex; flex-direction: column; gap: 3px; }
.yon-wa-kim { font-size: 11.5px; font-weight: 800; color: var(--red); }
.yon-wa-metin { font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; }
.yon-wa-saat { align-self: flex-end; font-size: 10.5px; color: var(--ink-3); }
.yon-wa-son { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 16px; border-bottom: 1px solid var(--line); }
.yon-wa-son:last-child { border-bottom: 0; }
.yon-wa-son-metin { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.yon-wa-d { font-size: 11px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }
.yon-wa-d.gonderildi, .yon-wa-d.gitti { color: var(--green); }
.yon-wa-d.hata { color: var(--amber-ink); }
.yon-wa-sag .yon-kart-ust { padding: 12px 16px; }
.yon-wa-sag .yon-ipucu a { font-weight: 700; color: var(--ink); text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 2px; }

/* veri */
.yon-veri-duzen { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; align-items: start; margin-bottom: 16px; }
.yon-veri-sag { display: flex; flex-direction: column; gap: 16px; }
.yon-birak { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 34px 20px; border-radius: 12px; cursor: pointer; border: 2px dashed var(--line-2); background: var(--surface-2); text-align: center; }
.yon-birak.surukle { border-color: var(--red); background: var(--red-soft); }
.yon-birak:focus-visible { outline: 2px solid var(--blue); }
.yon-birak-ikon { width: 48px; height: 48px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-2); display: flex; align-items: center; justify-content: center; font-size: 22px; }
.yon-birak-baslik { font-size: 15px; font-weight: 700; }
.yon-excel-sonuc { display: flex; flex-direction: column; gap: 12px; }
.yon-excel-dosya { display: flex; align-items: center; gap: 10px; }
.yon-excel-dosya b { font-size: 13.5px; }
.yon-excel-dosya span { font-size: 12.5px; color: var(--ink-3); }
.yon-excel-say { display: flex; gap: 8px; flex-wrap: wrap; }
.yon-excel-say div { padding: 10px 14px; border-radius: 10px; font-size: 15px; font-weight: 800; }
.yon-excel-say .yesil { background: var(--green-soft); color: var(--green); }
.yon-excel-say .mavi { background: var(--blue-soft); color: var(--blue); }
.yon-excel-say .gri { background: var(--surface-3); color: var(--ink-2); }
.yon-eslesme { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.yon-eslesme-satir { display: grid; grid-template-columns: 1fr 24px 1.4fr 90px; gap: 10px; align-items: center; padding: 8px 14px; border-top: 1px solid var(--line); font-size: 13px; }
.yon-eslesme-satir.bas { border-top: 0; background: var(--surface-2); font-size: 11px; font-weight: 700; letter-spacing: .07em; color: var(--ink-3); white-space: nowrap; }
.yon-eslesme-satir .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
.yon-eslesme-satir .eslesti { color: var(--green); font-weight: 700; font-size: 12px; }
.yon-buyuk-sayi { display: flex; align-items: baseline; gap: 8px; }
.yon-buyuk-sayi b { font-size: 34px; font-weight: 900; font-variant-numeric: tabular-nums; }
.yon-buyuk-sayi span { font-size: 13px; color: var(--ink-2); }
.yon-topluluk-satirlar { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--ink-2); }
.yon-tehlike { border-color: var(--red-line); }
.yon-tehlike .yon-kart-baslik { padding: 14px 18px; color: var(--red); border-bottom: 1px solid var(--red-line); }
.yon-tehlike-govde { display: flex; gap: 20px; align-items: center; justify-content: space-between; padding: 16px 18px; }
.yon-tehlike-govde p { margin: 0 0 6px; color: var(--ink-2); line-height: 1.5; max-width: 680px; }

@media (max-width: 1360px) { .yon-kul-duzen { grid-template-columns: 1fr; } .yon-yeni { position: static; } }
@media (max-width: 1240px) { .yon-wa-duzen, .yon-veri-duzen { grid-template-columns: 1fr; } .yon-wa-sag { position: static; } }
@media (max-width: 1100px) { .yon-iki-kart { grid-template-columns: 1fr; } }
@media (max-width: 900px) {
  .yon-duzen { grid-template-columns: minmax(0, 1fr); }   /* 1fr = minmax(auto,1fr): geniş tablo telefonda sayfayı 877 px'e yayıyordu */
  .yon-nav { position: static; }
  .yon-menu { flex-direction: row; overflow-x: auto; scrollbar-width: none; }
  .yon-iki-alan, .yon-istek-iki { grid-template-columns: 1fr; }
  .yon-tehlike-govde { flex-direction: column; align-items: stretch; }
}
`;
