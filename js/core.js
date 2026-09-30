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
export const ROL_AD = { yonetici: 'Yönetici', masa: 'Masa', rapor: 'Rapor', sofor: 'Şoför', bot: 'Bot' };
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
  cevrimici: navigator.onLine,
  canli: false,
  kuyruk: [],
};
export const benRol = () => store.ben?.rol;
export const yoneticiMi = () => store.ben?.rol === 'yonetici';
export const yazabilirMi = () => ['yonetici', 'masa'].includes(store.ben?.rol);

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
  if (!f.tasima_saati || ['yolda', 'fuarda', 'oy_kullandi'].includes(f.durum)) return 0;
  const g = dk - dakika(f.tasima_saati); return g > 5 ? Math.round(g) : 0;
}
export const evrakVar = f => !!f.evrak_uyari;
export const kisiGrubu = f => f.kisi_anahtar ? firmaListesi().filter(x => x.kisi_anahtar === f.kisi_anahtar) : [f];
export const ulasim = f => f.servis ? 'servis' : f.kendisi_gelecek ? 'kendi' : 'yok';
export const firmaAdi = f => trBaslik(f?.yetkili || f?.unvan || '');
export const aracOf = f => f?.arac_id ? store.araclar.get(f.arac_id) : null;
export function aramaEslesir(f, q) {
  if (!q) return true; const t = trArama(q);
  const alanlar = [f.unvan, f.yetkili, f.yetkili2, f.referans, f.referans2, f.ilce, f.adres, f.cep, f.cep2, f.sabit_tel, f.ticari_sicil, f.oda_sicil, f.notlar];
  const hay = trArama(alanlar.join(' ')); const rakam = t.replace(/\D/g, '');
  return t.split(' ').every(p => hay.includes(p)) || (rakam.length >= 4 && alanlar.join(' ').replace(/\D/g, '').includes(rakam));
}
export const referanslar = () => [...new Set(firmaListesi().map(f => f.referans).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
export const ilceler = () => [...new Set(firmaListesi().map(f => f.ilce).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));

// ---------------------------------------------------------------- giriş
export async function girisYap(ad, pin) {
  const { data: eposta, error } = await sb.rpc('giris_eposta', { p_ad: ad });
  if (error) throw new Error('Bağlantı hatası, tekrar dene');
  if (!eposta) throw new Error('Bu ad soyadla kullanıcı bulunamadı');
  const { error: e2 } = await sb.auth.signInWithPassword({ email: eposta, password: `pin-${pin}-72k` });
  if (e2) throw new Error('PIN hatalı');
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
  bus.emit('hazir');
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
    await asistanYukle(); bus.emit('asistan'); bus.emit('istek');
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
  ids.forEach(id => { const f = store.firmalar.get(id); if (f) store.firmalar.set(id, { ...f, ...alanlar, durum_kim: store.ben?.ad_soyad, durum_zamani: alanlar.durum ? new Date().toISOString() : f.durum_zamani }); });
  bus.emit('firmalar'); return onceki;
}
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o && k in o).map(k => [k, o[k]]));

// Gün durumunu değiştir. ids: tek id ya da dizi. { kendi: true } = kendi geldi. Döner: geriAl() fonksiyonu.
export async function durumYap(ids, durum, { kendi = null, kaynak = 'el', metin = null } = {}) {
  ids = [].concat(ids);
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
