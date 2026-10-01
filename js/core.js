// 72. Komite · Seçim Masası · VERİ ÇEKİRDEĞİ (ATLAS, 2026-09-30)
// Tek doğruluk kaynağı Supabase; istemci her şeyi `store`a yükler, canlı değişiklikleri realtime ile alır,
// yazma işlemleri iyimser (anında ekrana yansır), bağlantı yoksa sıraya girer ve bağlantı gelince gönderilir.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPA_URL = 'https://xpxaerxrnzxtrvcchvzj.supabase.co';
export const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweGFlcnhybnp4dHJ2Y2NodnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MjEyNjEsImV4cCI6MjEwNjI5NzI2MX0.U9KtlFEYOQ55saDUlwYF2yKssjB-VYrKiH2jaB4_HyY';
export const sb = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'secim-masasi-oturum' } });

// ---------------------------------------------------------------- sabitler
export const DURUMLAR = [
  { k: 'bekliyor', ad: 'Bekliyor', kisa: 'Bekliyor' },
  { k: 'arandi', ad: 'Arandı', kisa: 'Arandı' },
  { k: 'yolda', ad: 'Yolda', kisa: 'Yolda' },
  { k: 'fuarda', ad: 'Fuarda', kisa: 'Fuarda' },
  { k: 'oy_kullandi', ad: 'Oy kullandı', kisa: 'Oy ✓' },
];
export const DURUM_AD = Object.fromEntries(DURUMLAR.map(d => [d.k, d.ad]));
export const SINIFLAR = [
  { k: 'bizde', ad: 'Kesin bizde' },
  { k: 'yolda', ad: 'İlzam yolda' },
  { k: 'belirsiz', ad: 'Belirsiz' },
  { k: 'karsi', ad: 'Karşı' },
  { k: 'oy_yok', ad: 'Oy kullanmıyor' },
];
export const SINIF_AD = Object.fromEntries(SINIFLAR.map(s => [s.k, s.ad]));
export const ARAC_DURUMLARI = [
  { k: 'hazir', ad: 'Hazır' }, { k: 'yolda', ad: 'Yolda' }, { k: 'fuarda', ad: 'Fuarda' }, { k: 'mola', ad: 'Mola' }, { k: 'arizali', ad: 'Arızalı' },
];
export const ARAC_DURUM_AD = Object.fromEntries(ARAC_DURUMLARI.map(s => [s.k, s.ad]));
// 'yonetici' = ADMIN (Musa; kullanıcı, ayar, onay, ATLAS tam yetki). 'kurul' = YÖNETİM KURULU üyeleri (masa düzeyi). Referans bir rol DEĞİL: tablodaki REFERANS sütunu, arabayı ayarlayan kişi.
export const ROL_AD = { yonetici: 'Admin', kurul: 'Yönetim kurulu', masa: 'Masa', rapor: 'Rapor', sofor: 'Şoför', sorumlu: 'Araç sorumlusu', bot: 'Bot' };
export const VARIS = { ad: 'Fuar İzmir, Gaziemir', lat: 38.3472178, lon: 27.1196579 };

// ---------------------------------------------------------------- olay yolu
const dinleyiciler = {};
export const bus = {
  on(ad, fn) { (dinleyiciler[ad] ||= new Set()).add(fn); return () => dinleyiciler[ad].delete(fn); },
  emit(ad, veri) { (dinleyiciler[ad] || []).forEach(fn => { try { fn(veri); } catch (e) { console.error(ad, e); } }); (dinleyiciler['*'] || []).forEach(fn => { try { fn(ad, veri); } catch (e) { console.error(e); } }); },
};
// Olay adları: 'firma' {id} · 'firmalar' · 'arac' {id} · 'araclar' · 'olay' {olay} · 'ayar' {anahtar} · 'asistan' · 'istek' · 'profil' · 'baglanti' {cevrimici, kuyruk} · 'hazir'

// ---------------------------------------------------------------- depo
export const store = {
  ben: null,                 // { id, ad_soyad, rol }
  firmalar: new Map(),       // id -> satır
  araclar: new Map(),        // id -> satır
  profiller: new Map(),      // id -> satır
  olaylar: [],               // en yeni başta, en çok 800
  ayarlar: {},               // anahtar -> deger
  topluluk: [],
  asistan: [],               // asistan_mesajlar, eskiden yeniye
  istekler: [],              // asistan_istekler, en yeni başta
  bildirimler: [],           // bana gelen bildirimler (yönetici hepsini okuyabilir ama zil yalnız kendininkini sayar), en yeni başta
  cevrimici: navigator.onLine,
  canli: false,
  kuyruk: [],
};
export const benRol = () => store.ben?.rol;
export const yoneticiMi = () => store.ben?.rol === 'yonetici';
export const yazabilirMi = () => ['yonetici', 'kurul', 'masa'].includes(store.ben?.rol);
// şoför kendi aracının yolcularını, araç sorumlusu sorumlu olduğu kişileri ve araçlarının yolcularını işaretleyebilir (sunucu RLS de denetler)
export function isaretleyebilirMi(f) {
  const r = store.ben?.rol; if (r === 'yonetici' || r === 'kurul' || r === 'masa') return true; if (!f) return false;
  const a = f.arac_id ? store.araclar.get(f.arac_id) : null;
  if (r === 'sofor') return !!a && a.sofor_kullanici === store.ben.id;
  if (r === 'sorumlu') return f.sorumlu_id === store.ben.id || (!!a && a.sorumlu_id === store.ben.id);
  return false;
}

// ---------------------------------------------------------------- yardımcılar
export const trKucuk = s => String(s ?? '').replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr');
export const trArama = s => trKucuk(s).replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\s+/g, ' ').trim();
export function trBaslik(s) {
  return String(s ?? '').split(/(\s+|\()/).map(w => { const k = trKucuk(w); return k ? k.charAt(0).toLocaleUpperCase('tr') + k.slice(1) : w; }).join('');
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = {
  tel(d) { d = String(d ?? '').replace(/\D/g, ''); if (d.length === 12 && d.startsWith('90')) d = d.slice(2); if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d.length === 10 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : String(d || ''); },
  telLink(d) { d = String(d ?? '').replace(/\D/g, ''); if (d.startsWith('90') && d.length === 12) d = d.slice(2); if (d.startsWith('0')) d = d.slice(1); return d.length === 10 ? `tel:+90${d}` : ''; },
  waLink(d, metin = '') { d = String(d ?? '').replace(/\D/g, ''); if (d.startsWith('90') && d.length === 12) d = d.slice(2); if (d.startsWith('0')) d = d.slice(1); return d.length === 10 ? `https://wa.me/90${d}${metin ? '?text=' + encodeURIComponent(metin) : ''}` : ''; },
  mapsLink(adres) { return 'https://www.google.com/maps/dir/?api=1&' + new URLSearchParams({ destination: String(adres || '').replace(/İÇ KAPI NO\s*:?\s*\S+/gi, '').trim(), travelmode: 'driving' }); },
  rotaLink(adresler) { return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(VARIS.ad + ', İzmir') + '&waypoints=' + adresler.map(a => encodeURIComponent(String(a).replace(/İÇ KAPI NO\s*:?\s*\S+/gi, '').trim())).join('%7C') + '&travelmode=driving'; },
  saat(ts) { if (!ts) return ''; const d = ts instanceof Date ? ts : new Date(ts); return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); },
  goreli(ts) { if (!ts) return ''; const s = Math.round((Date.now() - new Date(ts)) / 1000); if (s < 45) return 'az önce'; if (s < 3600) return `${Math.round(s / 60)} dk önce`; if (s < 86400) return `${Math.floor(s / 3600)} sa önce`; return fmt.saat(ts); },
  sayi(n) { return Number(n || 0).toLocaleString('tr-TR'); },
  yuzde(a, b) { return b ? Math.round((a / b) * 100) : 0; },
  saatKisa(t) { return t ? String(t).slice(0, 5) : ''; },   // '09:15:00' -> '09:15'
  plaka(p) { const s = String(p || '').toLocaleUpperCase('tr').replace(/\s+/g, ''); const m = s.match(/^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,4})$/); return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p || '').toLocaleUpperCase('tr'); },
};
export const dakika = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const simdiDk = () => { const d = simdi(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
// Prova için saat taklidi: adres çubuğuna ?saat=10:30 eklenirse o saatten ilerler
const _prova = new URLSearchParams(location.search).get('saat');
const _provaBas = Date.now();
export function simdi() {
  if (!_prova) return new Date();
  const [h, m] = _prova.split(':').map(Number); const d = new Date(); d.setHours(h, m || 0, 0, 0);
  return new Date(d.getTime() + (Date.now() - _provaBas));
}

// ---------------------------------------------------------------- türetilmiş değerler
export const firmaListesi = () => [...store.firmalar.values()];
export const hedefSayi = () => store.ayarlar.hedef?.elle ?? firmaListesi().filter(f => f.oy_sinifi === 'bizde').length;
export const oyKullandiMi = f => f.durum === 'oy_kullandi';
export function sayac() {
  const hepsi = firmaListesi(); const biz = hepsi.filter(f => f.oy_sinifi === 'bizde');
  const say = (liste, d) => liste.filter(f => f.durum === d).length;
  const oy = hepsi.filter(oyKullandiMi).length;
  return {
    hedef: hedefSayi(), toplam: hepsi.length, bizde: biz.length,
    oy_kullandi: oy, oy_bizde: biz.filter(oyKullandiMi).length,
    fuarda: say(hepsi, 'fuarda'), yolda: say(hepsi, 'yolda'), arandi: say(hepsi, 'arandi'), bekliyor: say(hepsi, 'bekliyor'),
    kendi_geldi: hepsi.filter(f => f.kendi_geldi).length,
    kalan: Math.max(0, hedefSayi() - biz.filter(oyKullandiMi).length),
    geciken: hepsi.filter(f => gecikme(f) > 0).length,
  };
}
// saati belli ama gelmemiş: kaç dakika gecikti (0 = gecikme yok)
export function gecikme(f, dk = simdiDk()) {
  if (!f.tasima_saati || !['bekliyor', 'arandi'].includes(f.durum)) return 0;   // tasarım kuralı: saat + 10 dk geçti ve Bekliyor/Arandı
  const g = dk - dakika(f.tasima_saati); return g > 10 ? Math.round(g) : 0;
}
export const evrakVar = f => !!f.evrak_uyari;
export const kisiGrubu = f => f.kisi_anahtar ? firmaListesi().filter(x => x.kisi_anahtar === f.kisi_anahtar) : [f];
export const ulasim = f => f.servis ? 'servis' : f.kendisi_gelecek ? 'kendi' : 'yok';
export const firmaAdi = f => trBaslik(f?.yetkili || f?.unvan || '');
export const aracOf = f => f?.arac_id ? store.araclar.get(f.arac_id) : null;
export function aramaEslesir(f, q) {
  if (!q) return true;
  const qq = String(q).trim(); if (/^\d{1,3}$/.test(qq)) return String(f.ilzam_no ?? '') === qq;   // 1-3 hane = ilzam belgesi no (Musa 2026-10-01)
  const t = trArama(q);
  const alanlar = [f.unvan, f.yetkili, f.yetkili2, f.referans, f.referans2, f.ilce, f.adres, f.cep, f.cep2, f.sabit_tel, f.ticari_sicil, f.oda_sicil, f.notlar];
  const hay = trArama(alanlar.join(' ')); const rakam = t.replace(/\D/g, '');
  return t.split(' ').every(p => hay.includes(p)) || (rakam.length >= 4 && alanlar.join(' ').replace(/\D/g, '').includes(rakam));
}
export const referanslar = () => [...new Set(firmaListesi().map(f => f.referans).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
export const ilceler = () => [...new Set(firmaListesi().map(f => f.ilce).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));

// ---------------------------------------------------------------- giriş
// Giriş: PIN kimliği belirler (Musa kararı 2026-09-30); ad isteğe bağlı, yalnız aynı PIN'i iki kişi kullanıyorsa gerekir.
// PIN'in sahibini bul (giriş YAPMAZ): {eposta, ad, rol, kaynak:'pin'|'ad'}. Ekran "bu sen misin?" onayı için kullanır.
export async function pinSahibi(pin, ad = null) {
  const { data, error } = await sb.rpc('giris_pin', { p_pin: pin, p_ad: ad || null });
  if (error) throw new Error('Bağlantı hatası, tekrar dene');
  if (data?.hata === 'yavas') throw new Error('Çok fazla hatalı deneme. Adını da yazıp tekrar dene ya da birkaç dakika bekle');
  if (data?.hata === 'coklu') throw new Error('Bu PIN birden fazla kişide. Adını da yazıp tekrar dene');
  if (!data?.eposta) throw new Error('PIN hatalı');
  return data;
}
// pinSahibi'nden gelen kişiyle oturum aç (parolayı auth doğrular)
export async function pinleGir(eposta, pin) {
  const { error } = await sb.auth.signInWithPassword({ email: eposta, password: `pin-${pin}-72k` });
  if (error) throw new Error('PIN hatalı');
  await profilYukle();
  sb.rpc('giris_kaydet').then(() => {});
  return store.ben;
}
export async function girisYap(ad, pin) {
  const ara = async (pAd) => (await pinSahibi(pin, pAd)).eposta;
  const dene = async eposta => !(await sb.auth.signInWithPassword({ email: eposta, password: `pin-${pin}-72k` })).error;
  let tamam = await dene(await ara(ad));
  if (!tamam && ad) tamam = await dene(await ara(null));   // ad başka birine denk geldiyse yalnız PIN'le bir kez daha dene
  if (!tamam) throw new Error('PIN hatalı');
  await profilYukle();
  sb.rpc('giris_kaydet').then(() => {});
  return store.ben;
}
export async function cikis() { try { await sb.auth.signOut(); } catch {} store.ben = null; location.hash = '#giris'; location.reload(); }
export async function profilYukle() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { store.ben = null; return null; }
  const { data } = await sb.from('profiller').select('id, ad_soyad, rol, aktif').eq('id', user.id).maybeSingle();
  store.ben = data && data.aktif ? data : null;
  if (!store.ben) await sb.auth.signOut();
  return store.ben;
}

// ---------------------------------------------------------------- yükleme
async function hepsiniCek(tablo, sec = '*', sirala = null, sinir = 5000) {
  let q = sb.from(tablo).select(sec).limit(sinir); if (sirala) q = q.order(sirala.alan, { ascending: sirala.artan });
  const { data, error } = await q; if (error) throw error; return data || [];
}
export async function veriYukle() {
  const [firmalar, araclar, profiller, olaylar, ayarlar, topluluk] = await Promise.all([
    hepsiniCek('firmalar'), hepsiniCek('araclar'), hepsiniCek('profiller', 'id, ad_soyad, rol, aktif, son_giris'),
    hepsiniCek('olaylar', '*', { alan: 'zaman', artan: false }, 800), hepsiniCek('ayarlar'), hepsiniCek('topluluk'),
  ]);
  store.firmalar = new Map(firmalar.map(f => [f.id, f]));
  store.araclar = new Map(araclar.map(a => [a.id, a]));
  store.profiller = new Map(profiller.map(p => [p.id, p]));
  store.olaylar = olaylar;
  store.ayarlar = Object.fromEntries(ayarlar.map(a => [a.anahtar, a.deger]));
  store.topluluk = topluluk;
  await asistanYukle();
  await bildirimYukle();
  bus.emit('hazir');
}
export async function bildirimYukle() {
  try { const { data } = await sb.from('bildirimler').select('*').eq('alici_id', store.ben?.id).order('zaman', { ascending: false }).limit(200); store.bildirimler = data || []; }
  catch (e) { console.warn('bildirimler', e); }
}
export async function asistanYukle() {
  const [m, i] = await Promise.all([
    hepsiniCek('asistan_mesajlar', '*', { alan: 'zaman', artan: false }, 300),
    yoneticiMi() || true ? hepsiniCek('asistan_istekler', '*', { alan: 'zaman', artan: false }, 200) : [],
  ]);
  store.asistan = m.reverse(); store.istekler = i;
}
// bağlantı koptuktan sonra kaçırılanları tamamla
async function tazele() {
  try {
    const son = firmaListesi().reduce((m, f) => (f.guncelleme > m ? f.guncelleme : m), '1970');
    const { data } = await sb.from('firmalar').select('*').gt('guncelleme', son).limit(2000);
    (data || []).forEach(f => { store.firmalar.set(f.id, f); });
    if (data?.length) bus.emit('firmalar');
    const { data: o } = await sb.from('olaylar').select('*').order('zaman', { ascending: false }).limit(100);
    if (o) { const var_ = new Set(store.olaylar.map(x => x.id)); const yeni = o.filter(x => !var_.has(x.id)); if (yeni.length) { store.olaylar = [...yeni, ...store.olaylar].sort((a, b) => b.id - a.id).slice(0, 800); bus.emit('olay', {}); } }
    const { data: a } = await sb.from('araclar').select('*'); if (a) { store.araclar = new Map(a.map(x => [x.id, x])); bus.emit('araclar'); }
    await asistanYukle(); await bildirimYukle(); bus.emit('asistan'); bus.emit('istek'); bus.emit('bildirim', {});
  } catch (e) { console.warn('tazele', e); }
}

// ---------------------------------------------------------------- canlı
let kanal = null;
export function canliBaglan() {
  if (kanal) return;
  kanal = sb.channel('secim-masasi')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'firmalar' }, p => {
      if (p.eventType === 'DELETE') store.firmalar.delete(p.old.id); else store.firmalar.set(p.new.id, p.new);
      bus.emit('firma', { id: p.new?.id ?? p.old?.id });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'araclar' }, p => {
      if (p.eventType === 'DELETE') store.araclar.delete(p.old.id); else store.araclar.set(p.new.id, p.new);
      bus.emit('arac', { id: p.new?.id ?? p.old?.id });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'olaylar' }, p => {
      if (!store.olaylar.some(o => o.id === p.new.id)) { store.olaylar.unshift(p.new); store.olaylar.length = Math.min(store.olaylar.length, 800); }
      bus.emit('olay', { olay: p.new });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ayarlar' }, p => {
      if (p.new?.anahtar) store.ayarlar[p.new.anahtar] = p.new.deger; bus.emit('ayar', { anahtar: p.new?.anahtar });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asistan_mesajlar' }, p => {
      const i = store.asistan.findIndex(m => m.id === p.new?.id);
      if (i >= 0) store.asistan[i] = p.new; else if (p.new) store.asistan.push(p.new);
      bus.emit('asistan', { mesaj: p.new });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asistan_istekler' }, p => {
      const i = store.istekler.findIndex(m => m.id === p.new?.id);
      if (i >= 0) store.istekler[i] = p.new; else if (p.new) store.istekler.unshift(p.new);
      bus.emit('istek', { istek: p.new });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bildirimler' }, p => {
      if (!p.new || p.new.alici_id !== store.ben?.id) return;
      const i = store.bildirimler.findIndex(b => b.id === p.new.id);
      if (i >= 0) store.bildirimler[i] = p.new; else store.bildirimler.unshift(p.new);
      bus.emit('bildirim', { bildirim: p.new, yeni: i < 0 });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiller' }, p => {
      if (p.new?.id) store.profiller.set(p.new.id, p.new); bus.emit('profil', {});
    })
    .subscribe(durum => {
      const once = store.canli; store.canli = durum === 'SUBSCRIBED';
      if (store.canli && !once) tazele();
      bus.emit('baglanti', { cevrimici: store.cevrimici, canli: store.canli, kuyruk: store.kuyruk.length });
    });
  window.addEventListener('online', () => { store.cevrimici = true; kuyruguBosalt(); tazele(); bus.emit('baglanti', { cevrimici: true, canli: store.canli, kuyruk: store.kuyruk.length }); });
  window.addEventListener('offline', () => { store.cevrimici = false; bus.emit('baglanti', { cevrimici: false, canli: store.canli, kuyruk: store.kuyruk.length }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tazele(); });
  setInterval(kuyruguBosalt, 5000);
  setInterval(() => bus.emit('saat', {}), 15000);   // zaman çizelgesi ve "geciken" hesapları için
}

// ---------------------------------------------------------------- yazma: sıra (çevrimdışı dayanıklılık)
const KUYRUK_ANAHTAR = 'secim-masasi-kuyruk';
try { store.kuyruk = JSON.parse(localStorage.getItem(KUYRUK_ANAHTAR) || '[]'); } catch { store.kuyruk = []; }
const kuyrukKaydet = () => { try { localStorage.setItem(KUYRUK_ANAHTAR, JSON.stringify(store.kuyruk)); } catch {} };
async function uygula(is) {
  if (is.tur === 'firma') { const { error } = await sb.from('firmalar').update(is.alanlar).in('id', is.ids); if (error) throw error; }
  else if (is.tur === 'arac_guncelle') { const { error } = await sb.from('araclar').update(is.alanlar).eq('id', is.id); if (error) throw error; }
  else if (is.tur === 'konum') { const { error } = await sb.from('arac_konumlari').insert(is.satir); if (error) throw error; }
}
const agHatasiMi = e => !navigator.onLine || /fetch|network|Failed to fetch|NetworkError|timeout/i.test(String(e?.message || e));
async function yaz(is) {
  if (store.kuyruk.length || !navigator.onLine) { store.kuyruk.push(is); kuyrukKaydet(); bus.emit('baglanti', { cevrimici: navigator.onLine, canli: store.canli, kuyruk: store.kuyruk.length }); return; }
  try { await uygula(is); }
  catch (e) {
    if (agHatasiMi(e)) { store.kuyruk.push(is); kuyrukKaydet(); bus.emit('baglanti', { cevrimici: false, canli: store.canli, kuyruk: store.kuyruk.length }); return; }
    throw e;
  }
}
let bosaltiliyor = false;
export async function kuyruguBosalt() {
  if (bosaltiliyor || !store.kuyruk.length || !navigator.onLine) return;
  bosaltiliyor = true;
  try {
    while (store.kuyruk.length) {
      try { await uygula(store.kuyruk[0]); store.kuyruk.shift(); kuyrukKaydet(); }
      catch (e) { if (agHatasiMi(e)) break; console.error('kuyruk işi atıldı', e, store.kuyruk[0]); store.kuyruk.shift(); kuyrukKaydet(); }
    }
  } finally { bosaltiliyor = false; bus.emit('baglanti', { cevrimici: navigator.onLine, canli: store.canli, kuyruk: store.kuyruk.length }); }
}

// ---------------------------------------------------------------- yazma: işlemler
const kaynakAlan = (kaynak, metin) => ({ son_kaynak: kaynak || 'el', son_kaynak_metin: metin || null, kaynak_id: crypto.randomUUID() });
function iyimser(ids, alanlar) {
  const onceki = ids.map(id => ({ id, ...pick(store.firmalar.get(id), Object.keys(alanlar)) }));
  ids.forEach(id => { const f = store.firmalar.get(id); if (f) store.firmalar.set(id, { ...f, ...alanlar, ...(alanlar.durum ? { durum_kim: store.ben?.ad_soyad, durum_zamani: new Date().toISOString() } : {}) }); });
  bus.emit('firmalar'); return onceki;
}
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o && k in o).map(k => [k, o[k]]));

// Gün durumunu değiştir. ids: tek id ya da dizi. { kendi: true } = kendi geldi. Döner: geriAl() fonksiyonu.
// OY KURALI (Musa 2026-09-30): "oy kullandı" yalnız masa onayıyla sayılır. Masa/Admin dışındakiler oy işaretlerse
// durum değişmez, "oy bildirimi" (oy_bildiren) kaydedilir; masa Onayla/Reddet der. Sunucu tetikleyicisi de aynı kuralı zorlar.
export const oyOnaylayabilirMi = () => ['yonetici', 'masa'].includes(store.ben?.rol);
export const oyBekliyor = f => !!f?.oy_bildiren && f.durum !== 'oy_kullandi';
export async function oyBildir(ids) {
  ids = [].concat(ids); const kim = store.ben?.ad_soyad || null;
  const onceki = iyimser(ids, { oy_bildiren: kim, oy_bildirim_zamani: new Date().toISOString() });
  await yaz({ tur: 'firma', ids, alanlar: { oy_bildiren: kim, ...kaynakAlan('el', null) } });
  return async () => { for (const o of onceki) { iyimser([o.id], { oy_bildiren: o.oy_bildiren ?? null, oy_bildirim_zamani: o.oy_bildirim_zamani ?? null }); await yaz({ tur: 'firma', ids: [o.id], alanlar: { oy_bildiren: o.oy_bildiren ?? null, ...kaynakAlan('el', 'oy bildirimi geri alındı') } }); } };
}
export async function oyOnayla(id) { return durumYap([id], 'oy_kullandi', { metin: `Masa onayı · bildiren ${store.firmalar.get(id)?.oy_bildiren || '?'}` }); }
export async function oyReddet(id) {
  const f = store.firmalar.get(id); if (!f) return; const eski = f.oy_bildiren;
  iyimser([id], { oy_bildiren: null, oy_bildirim_zamani: null });
  await yaz({ tur: 'firma', ids: [id], alanlar: { oy_bildiren: null, ...kaynakAlan('el', 'masa oy bildirimini reddetti') } });
  return async () => { iyimser([id], { oy_bildiren: eski }); await yaz({ tur: 'firma', ids: [id], alanlar: { oy_bildiren: eski, ...kaynakAlan('el', 'ret geri alındı') } }); };
}
export async function durumYap(ids, durum, { kendi = null, kaynak = 'el', metin = null } = {}) {
  ids = [].concat(ids);
  if (durum === 'oy_kullandi' && !oyOnaylayabilirMi() && store.ben?.rol !== 'bot') return oyBildir(ids.filter(i => store.firmalar.get(i)?.durum !== 'oy_kullandi'));
  const alanlar = { durum, ...(kendi !== null ? { kendi_geldi: !!kendi } : {}) };
  const onceki = iyimser(ids, alanlar);
  await yaz({ tur: 'firma', ids, alanlar: { ...alanlar, ...kaynakAlan(kaynak, metin) } });
  return async () => {
    for (const o of onceki) { const { id, ...eski } = o; iyimser([id], eski); await yaz({ tur: 'firma', ids: [id], alanlar: { ...eski, ...kaynakAlan('el', 'geri alındı') } }); }
  };
}
export async function sinifYap(id, sinif, { kaynak = 'el', metin = null } = {}) {
  const onceki = iyimser([id], { oy_sinifi: sinif });
  await yaz({ tur: 'firma', ids: [id], alanlar: { oy_sinifi: sinif, ...kaynakAlan(kaynak, metin) } });
  return async () => { iyimser([id], { oy_sinifi: onceki[0].oy_sinifi }); await yaz({ tur: 'firma', ids: [id], alanlar: { oy_sinifi: onceki[0].oy_sinifi, ...kaynakAlan('el', 'geri alındı') } }); };
}
// Not ekler (mevcut notların sonuna "[saat Ad] metin" satırı)
export async function notEkle(id, metin, { kaynak = 'el', kaynakMetin = null } = {}) {
  const f = store.firmalar.get(id); if (!f || !metin?.trim()) return;
  const satir = `[${fmt.saat(new Date())} ${store.ben?.ad_soyad || ''}] ${metin.trim()}`;
  const yeni = f.notlar ? `${f.notlar}\n${satir}` : satir;
  iyimser([id], { notlar: yeni });
  await yaz({ tur: 'firma', ids: [id], alanlar: { notlar: yeni, ...kaynakAlan(kaynak, kaynakMetin) } });
}
export async function aracAta(ids, aracId, { kaynak = 'el', metin = null } = {}) {
  ids = [].concat(ids);
  const onceki = iyimser(ids, { arac_id: aracId });
  await yaz({ tur: 'firma', ids, alanlar: { arac_id: aracId, ...kaynakAlan(kaynak, metin) } });
  return async () => { for (const o of onceki) { iyimser([o.id], { arac_id: o.arac_id ?? null }); await yaz({ tur: 'firma', ids: [o.id], alanlar: { arac_id: o.arac_id ?? null, ...kaynakAlan('el', 'geri alındı') } }); } };
}
// ---------------------------------------------------------------- görev dağılımı ve şoför geri sayımı
export const ekip = () => [...store.profiller.values()].filter(p => p.aktif && p.rol !== 'bot' && !/\bbot(u)?\b/i.test(p.ad_soyad)).sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, 'tr'));
export async function sorumluAta(ids, kullaniciId, { kaynak = 'el', metin = null } = {}) {
  ids = [].concat(ids);
  const onceki = iyimser(ids, { sorumlu_id: kullaniciId });
  await yaz({ tur: 'firma', ids, alanlar: { sorumlu_id: kullaniciId, ...kaynakAlan(kaynak, metin) } });
  return async () => { for (const o of onceki) { iyimser([o.id], { sorumlu_id: o.sorumlu_id ?? null }); await yaz({ tur: 'firma', ids: [o.id], alanlar: { sorumlu_id: o.sorumlu_id ?? null, ...kaynakAlan('el', 'geri alındı') } }); } };
}
export async function aracSorumluAta(aracId, kullaniciId) {
  const a = store.araclar.get(aracId); if (a) { store.araclar.set(aracId, { ...a, sorumlu_id: kullaniciId }); bus.emit('arac', { id: aracId }); }
  await yaz({ tur: 'arac_guncelle', id: aracId, alanlar: { sorumlu_id: kullaniciId } });
}
// Şoför geri sayımı: 10dk → 5dk → kapida → aldim → yolda → birakti. Sunucu sorumlulara bildirim atar, 5 dk sonra hatırlatır.
export const GERI_SAYIM = [
  { k: '10dk', ad: '10 DK KALDI' }, { k: '5dk', ad: '5 DK KALDI' }, { k: 'kapida', ad: 'KAPIDAYIM' },
  { k: 'aldim', ad: 'ALDIM', durum: 'yolda' }, { k: 'yolda', ad: 'YOLA ÇIKTIK', durum: 'yolda' }, { k: 'birakti', ad: 'FUARA BIRAKTIM', durum: 'fuarda' },
];
export const geriSayimSonraki = f => { const i = GERI_SAYIM.findIndex(g => g.k === f.geri_sayim); return GERI_SAYIM[i + 1] || null; };
export async function geriSayimYap(firmaId, adim, { kaynak = 'el', metin = null } = {}) {
  const g = GERI_SAYIM.find(x => x.k === adim); const f = store.firmalar.get(firmaId); if (!g || !f) return;
  // durum yalnız ileri gider: oy kullanmışı fuarda'ya, fuardakini yolda'ya düşürmez
  const SIRA = ['bekliyor', 'arandi', 'yolda', 'fuarda', 'oy_kullandi'];
  const alanlar = { geri_sayim: adim, ...(g.durum && SIRA.indexOf(g.durum) > SIRA.indexOf(f.durum) ? { durum: g.durum } : {}) };
  const onceki = iyimser([firmaId], { ...alanlar, geri_sayim_zamani: new Date().toISOString() });
  await yaz({ tur: 'firma', ids: [firmaId], alanlar: { ...alanlar, ...kaynakAlan(kaynak, metin) } });
  return async () => { const { id, ...eski } = onceki[0]; iyimser([id], eski); await yaz({ tur: 'firma', ids: [id], alanlar: { ...eski, ...kaynakAlan('el', 'geri alındı') } }); };
}
// ---------------------------------------------------------------- bildirimler
export const okunmamisBildirim = () => store.bildirimler.filter(b => !b.gorulme && !b.cevap).length;
export const cevapsizBildirimler = () => store.bildirimler.filter(b => !b.cevap && b.secenekler?.length > 1 && Date.now() - new Date(b.zaman) > 10 * 60000);
const CEVAP_DURUM = { 'Aldık': 'yolda', 'Yolda': 'yolda', 'Fuarda': 'fuarda', 'Fuarda ✓': 'fuarda', 'Oy kullandı': 'oy_kullandi', 'Başkası karşıladı': 'fuarda' };
export async function bildirimCevapla(id, cevap) {
  const b = store.bildirimler.find(x => x.id === id);
  const alan = { cevap, gorulme: b?.gorulme || new Date().toISOString() };
  if (b) { Object.assign(b, alan, { cevap_zamani: new Date().toISOString() }); bus.emit('bildirim', {}); }
  const { error } = await sb.from('bildirimler').update(alan).eq('id', id); if (error) throw hataCevir(error);
  if (b?.firma_id) {
    const d = CEVAP_DURUM[cevap]; const f = store.firmalar.get(b.firma_id);
    if (d && f && f.durum !== d && !(f.durum === 'oy_kullandi')) await durumYap([b.firma_id], d, { kaynak: 'el', metin: `Bildirim cevabı: ${cevap}` });
    if (cevap === 'Sorun var') await notEkle(b.firma_id, 'Sorun bildirildi (bildirim cevabı)');
    if (cevap === 'Karşıladım') await karsiladim(b.firma_id);
    if (b.tur === 'oy_onay' && cevap === 'Onayla' && f?.durum !== 'oy_kullandi') await oyOnayla(b.firma_id);
    if (b.tur === 'oy_onay' && cevap === 'Reddet' && f?.oy_bildiren) await oyReddet(b.firma_id);
  }
}
// REFERANS = kişiyi tanıyan yönetim kurulu üyesi; araç fuara gelince karşılar. Başkası da karşılayabilir: kim karşıladıysa o yazılır.
export const referansBenMi = f => !!store.ben && [f?.referans, f?.referans2].some(r => r && trArama(r) === trArama(store.ben.ad_soyad));
export async function karsiladim(id, kim = store.ben?.ad_soyad) {
  const f = store.firmalar.get(id); if (!f) return;
  const eski = { karsilayan: f.karsilayan ?? null, karsilama_zamani: f.karsilama_zamani ?? null, durum: f.durum };
  iyimser([id], { karsilayan: kim, karsilama_zamani: new Date().toISOString() });
  await yaz({ tur: 'firma', ids: [id], alanlar: { karsilayan: kim, ...kaynakAlan('el', null) } });
  const durumDegisti = !['fuarda', 'oy_kullandi'].includes(f.durum);
  if (durumDegisti) await durumYap([id], 'fuarda', { metin: `${kim} karşıladı` });
  // geri al: karşılayanı ve (değiştiyse) durumu eski haline getirir
  return async () => {
    const alanlar = { karsilayan: eski.karsilayan, karsilama_zamani: eski.karsilama_zamani, ...(durumDegisti ? { durum: eski.durum } : {}) };
    iyimser([id], alanlar); await yaz({ tur: 'firma', ids: [id], alanlar: { ...alanlar, ...kaynakAlan('el', 'karşılama geri alındı') } });
  };
}
export async function bildirimGoruldu(ids) {
  ids = [].concat(ids).filter(id => { const b = store.bildirimler.find(x => x.id === id); return b && !b.gorulme; });
  if (!ids.length) return; const z = new Date().toISOString();
  ids.forEach(id => { const b = store.bildirimler.find(x => x.id === id); if (b) b.gorulme = z; }); bus.emit('bildirim', {});
  await sb.from('bildirimler').update({ gorulme: z }).in('id', ids);
}
// iPhone/Android telefon bildirimi (web push). iPhone'da önce Ana Ekrana Ekle şart.
export const pushDestekli = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushIzni = () => (window.Notification ? Notification.permission : 'desteklenmiyor');
const b64uBayt = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const p = t + '='.repeat((4 - (t.length % 4)) % 4); return Uint8Array.from(atob(p), c => c.charCodeAt(0)); };
export async function pushAc() {
  if (!pushDestekli()) throw new Error('Bu tarayıcı bildirimi desteklemiyor. iPhone\'da önce Ana Ekrana Ekle ile uygulamayı kur.');
  const izin = await Notification.requestPermission(); if (izin !== 'granted') throw new Error('Bildirim izni verilmedi');
  const kayit = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
  const { data, error } = await sb.functions.invoke('push', { body: { islem: 'anahtar' } }); if (error || !data?.anahtar) throw new Error('Bildirim anahtarı alınamadı');
  let abone = await kayit.pushManager.getSubscription();
  if (!abone) abone = await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBayt(data.anahtar) });
  const j = abone.toJSON();
  const { error: e2 } = await sb.from('push_abonelikleri').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, cihaz: navigator.userAgent.slice(0, 180) }, { onConflict: 'endpoint' });
  if (e2) throw hataCevir(e2);
  return true;
}
export async function pushTest() { const { data, error } = await sb.functions.invoke('push', { body: { islem: 'test' } }); if (error || data?.hata) throw new Error(data?.hata || 'Test bildirimi gönderilemedi'); return data; }
// ---------------------------------------------------------------- kalan süre (OSRM, trafiksiz tahmin; 60 sn önbellek)
const _sure = new Map();
export async function kalanSure(a, b) {
  if (!a?.lat || !b?.lat) return null;
  const anah = [a.lat, a.lon, b.lat, b.lon].map(x => Number(x).toFixed(3)).join(',');
  const o = _sure.get(anah); if (o && Date.now() - o.t < 60000) return o.v;
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
    const j = await r.json(); const x = j.routes?.[0]; if (!x) return null;
    const v = { dk: Math.max(1, Math.round(x.duration / 60)), km: Math.round(x.distance / 100) / 10 };
    _sure.set(anah, { t: Date.now(), v }); return v;
  } catch { return null; }
}
export const aracKonum = a => (a?.son_lat ? { lat: a.son_lat, lon: a.son_lon } : null);
export const firmaKonum = f => (f?.lat ? { lat: f.lat, lon: f.lon } : null);

export async function firmaAlanYaz(id, alanlar, { kaynak = 'el', metin = null } = {}) {
  iyimser([id], alanlar); await yaz({ tur: 'firma', ids: [id], alanlar: { ...alanlar, ...kaynakAlan(kaynak, metin) } });
}
export async function aracKaydet(arac) {
  const satir = { ...arac, plaka: fmt.plaka(arac.plaka) }; delete satir.id;
  if (arac.id) { const { data, error } = await sb.from('araclar').update(satir).eq('id', arac.id).select().single(); if (error) throw hataCevir(error); store.araclar.set(data.id, data); bus.emit('arac', { id: data.id }); return data; }
  const { data, error } = await sb.from('araclar').insert(satir).select().single(); if (error) throw hataCevir(error);
  store.araclar.set(data.id, data); bus.emit('arac', { id: data.id }); return data;
}
export async function aracSil(id) { const { error } = await sb.from('araclar').delete().eq('id', id); if (error) throw hataCevir(error); store.araclar.delete(id); bus.emit('araclar'); }
export async function aracDurumYap(id, durum) {
  const a = store.araclar.get(id); if (a) { store.araclar.set(id, { ...a, durum }); bus.emit('arac', { id }); }
  await yaz({ tur: 'arac_guncelle', id, alanlar: { durum } });
}
export async function konumGonder(aracId, lat, lon, dogruluk = null, kaynak = 'telefon') {
  const a = store.araclar.get(aracId); if (a) { store.araclar.set(aracId, { ...a, son_lat: lat, son_lon: lon, son_konum_zamani: new Date().toISOString(), son_konum_kaynak: kaynak }); bus.emit('arac', { id: aracId }); }
  await yaz({ tur: 'konum', satir: { arac_id: aracId, lat, lon, dogruluk, kaynak } });
}
export async function aracKonumlari(aracId, dakikaGeri = 60) {
  const { data } = await sb.from('arac_konumlari').select('lat, lon, zaman').eq('arac_id', aracId).gte('zaman', new Date(Date.now() - dakikaGeri * 60000).toISOString()).order('zaman');
  return data || [];
}
export async function ayarYaz(anahtar, deger) {
  store.ayarlar[anahtar] = deger; bus.emit('ayar', { anahtar });
  const { error } = await sb.from('ayarlar').upsert({ anahtar, deger, guncelleme: new Date().toISOString() }); if (error) throw hataCevir(error);
}
// Kullanıcı yönetimi (edge function, yalnız yönetici)
export async function yonetim(islem, govde = {}) {
  const { data, error } = await sb.functions.invoke('yonetim', { body: { islem, ...govde } });
  if (error) { let m = error.message; try { m = (await error.context.json()).hata || m; } catch {} throw new Error(m); }
  if (data?.hata) throw new Error(data.hata);
  return data;
}
export async function profilleriYenile() { const p = await hepsiniCek('profiller', 'id, ad_soyad, rol, aktif, son_giris'); store.profiller = new Map(p.map(x => [x.id, x])); bus.emit('profil', {}); }
// Asistan
export async function asistanGonder(metin) {
  const { data, error } = await sb.from('asistan_mesajlar').insert({ yon: 'kullanici', metin: metin.trim() }).select().single();
  if (error) throw hataCevir(error);
  if (!store.asistan.some(m => m.id === data.id)) store.asistan.push(data); bus.emit('asistan', { mesaj: data }); return data;
}
export async function istekKarar(id, onay, not = '') {
  const alan = { durum: onay ? 'onaylandi' : 'reddedildi', onaylayan: store.ben?.ad_soyad, onay_zamani: new Date().toISOString(), onay_notu: not || null };
  const { error } = await sb.from('asistan_istekler').update(alan).eq('id', id); if (error) throw hataCevir(error);
  const i = store.istekler.findIndex(x => x.id === id); if (i >= 0) store.istekler[i] = { ...store.istekler[i], ...alan }; bus.emit('istek', {});
}
function hataCevir(e) {
  const m = String(e?.message || e);
  if (/duplicate key|araclar_plaka_tekil/.test(m)) return new Error('Bu plaka zaten kayıtlı');
  if (/row-level security|permission denied/.test(m)) return new Error('Bu işlem için yetkin yok');
  return new Error(m);
}

// ---------------------------------------------------------------- olay yardımcıları (kaynak gösterimi)
export function olayMetni(o) {
  const f = o.firma_id ? store.firmalar.get(o.firma_id) : null; const a = o.arac_id ? store.araclar.get(o.arac_id) : null;
  const kim = f ? firmaAdi(f) : a ? fmt.plaka(a.plaka) : '';
  const yeniD = String(o.yeni || '').split('+')[0]; const kendi = String(o.yeni || '').includes('+kendi');
  if (o.tur === 'durum') return `${kim} · ${kendi && yeniD === 'oy_kullandi' ? 'kendi geldi, oy kullandı' : (DURUM_AD[yeniD] || yeniD)}`;
  if (o.tur === 'oy_sinifi') return `${kim} · sınıf: ${SINIF_AD[o.eski] || o.eski} → ${SINIF_AD[o.yeni] || o.yeni}`;
  if (o.tur === 'not') return `${kim} · not: ${String(o.yeni || '').split('\n').pop()}`;
  if (o.tur === 'arac') { const y = store.araclar.get(Number(o.yeni)); return `${kim} · araç: ${y ? fmt.plaka(y.plaka) : 'kaldırıldı'}`; }
  if (o.tur === 'arac_durum') return `${kim} · ${ARAC_DURUM_AD[o.yeni] || o.yeni}`;
  if (o.tur === 'karsilama') return `${kim} · ${o.yeni} karşıladı`;
  if (o.tur === 'sorumlu') { const p = store.profiller.get(o.yeni); return `${kim} · sorumlu: ${p ? p.ad_soyad : 'kaldırıldı'}`; }
  if (o.tur === 'geri_sayim') { const g = GERI_SAYIM.find(x => x.k === o.yeni); return `${kim} · şoför: ${g ? g.ad.toLocaleLowerCase('tr') : o.yeni}`; }
  return `${kim} · ${o.tur}`;
}
export function kaynakMetni(o) {
  const saat = fmt.saat(o.zaman);
  if (o.kaynak === 'asistan') return `ATLAS · ${o.kaynak_metin ? 'mesajdan' : 'asistan'} · ${saat}`;
  if (o.kaynak === 'excel') return `Excel aktarımı · ${saat}`;
  if (o.kaynak === 'konum') return `Konum · ${saat}`;
  if (o.kaynak === 'sistem') return `Sistem · ${saat}`;
  return `El ile · ${o.kim_ad || '?'} · ${saat}`;
}
