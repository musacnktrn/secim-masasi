// Seçim Masası · ARAÇ YÖNETİCİSİ DEMOSU (ATLAS, 2026-10-05) · yalnız ?demo=1 ve KOMITE.dispec olan seçimde (26-27)
// js/demo.js'in sahte verisinin (5 rotalı araç, 12 durak; Supabase orada boşa bağlanır) ÜSTÜNE araç yöneticisi ekranı için
// örnek görev defteri ekler: boş araçlar (farklı konum yaşı ve kaynağı), görevdeki araçlar (kabul bekleyen 4 ve 7 dk, kabul etmiş,
// yolda), bekleyen kişiler (acil araç talebi, masa talebi, şoför reddi, servis saati geçmiş), ajan olayları.
// Görev işlemleri (atama, iptal, başkasına ata, tamamlandı) BELLEKTE, veritabanındaki kurallarla aynı mantıkla yürür
// (tek şoför kuralı, zaman damgaları, firmalar.arac_id eşitlemesi; bkz. secim-2627/sema/10-2627-ekler.sql gorev_ata / alim_ata).
// Hiçbir istek gitmez, hiçbir şey kaydedilmez; sayfa yenilenince her şey başa döner.
// Canlılık: atanan görevi "şoför" 7 sn sonra kabul eder, 20 sn sonra yolcuyu alır; 40 sn sonra ATLAS yeni bir araç talebi açar;
// yoldaki araç 20 sn'de bir Fuar'a doğru ilerler. Kişi, firma ve plakaların hepsi uydurmadır ("Örnek ...").
// ?rol=ay ile ekran araç yöneticisi gözüyle açılır (varsayılan: demo.js'in Admin kullanıcısı).
import { store, bus, konumGonder, gorevMotoruKur, GOREV_AKTIF, VARIS } from '../core.js';

const DK = 60000;
const iso = dk => new Date(Date.now() - dk * DK).toISOString();
const simdiIso = () => new Date().toISOString();
let kuruldu = false;
let gorevSira = 100, olaySira = 100;

// ---------------------------------------------------------------- örnek araçlar (id 92xx; demo.js'in 91xx araçlarına dokunulmaz)
function araclar() {
  const ortak = { kapasite: 4, marka: 'Örnek', model: 'Minibüs', renk: 'Beyaz', sofor_tel: null, sofor_kullanici: null, sorumlu_id: null, notlar: '', eta_dk: null, eta_zaman: null, son_dogruluk: null, konum_kaynak: null, son_konum_kaynak: null, konum_metni: null, son_lat: null, son_lon: null, son_konum_zamani: null };
  const gps = (lat, lon, dk, d = 15) => ({ son_lat: lat, son_lon: lon, son_konum_zamani: iso(dk), son_konum_kaynak: 'telefon', konum_kaynak: 'telefon', son_dogruluk: d });
  const sozlu = (lat, lon, dk, d, metin) => ({ son_lat: lat, son_lon: lon, son_konum_zamani: iso(dk), son_konum_kaynak: 'sozlu', konum_kaynak: 'sozlu', son_dogruluk: d, konum_metni: metin });
  return [
    // BOŞ: Fuar otoparkında, 46 dk önce bıraktı (30 dk'dan uzun boşta: öneriyle öne çıkar)
    { ...ortak, id: 9201, plaka: '35DM611', durum: 'hazir', sofor_ad: 'Kadir Örnek', ...gps(38.3484, 27.1213, 2) },
    // BOŞ: şoför "Bornova çarşıdayım" dedi, 12 dk önce (tahmini konum)
    { ...ortak, id: 9202, plaka: '35DM622', durum: 'hazir', sofor_ad: 'Burak Örnek', ...sozlu(38.4627, 27.2172, 12, 600, 'Bornova çarşı') },
    // BOŞ: Çiğli'de, GPS 4 dk önce, 6 kişilik
    { ...ortak, id: 9203, plaka: '35DM633', durum: 'hazir', kapasite: 6, sofor_ad: 'Serdar Örnek', ...gps(38.4962, 27.0641, 4, 30) },
    // GÖREVDE · yolda: Aliağa'dan yolcuyla Fuar'a geliyor
    { ...ortak, id: 9204, plaka: '35DM644', durum: 'yolda', sofor_ad: 'Tamer Örnek', ...gps(38.5480, 27.0520, 1, 12), eta_dk: 28, eta_zaman: new Date(Date.now() + 28 * DK).toISOString() },
    // GÖREVDE · 4 dk önce atandı, kabul yok (sarı)
    { ...ortak, id: 9205, plaka: '35DM655', durum: 'hazir', sofor_ad: 'Yusuf Örnek', ...gps(38.4594, 27.1183, 3, 20) },
    // GÖREVDE · 7 dk önce atandı, kabul yok (kırmızı: yeniden ata önerisi)
    { ...ortak, id: 9206, plaka: '35DM666', durum: 'hazir', sofor_ad: 'Kemal Örnek', ...sozlu(38.4331, 27.2598, 9, 1500, 'Pınarbaşı') },
    // GÖREVDE · kabul etti, yolcuya gidiyor
    { ...ortak, id: 9207, plaka: '35DM677', durum: 'yolda', kapasite: 7, sofor_ad: 'Can Örnek', ...gps(38.3903, 27.1604, 1, 18) },
    // MOLA: yalnız ilçe biliniyor; az önce bir işi "yetişemem" diye reddetti
    { ...ortak, id: 9208, plaka: '35DM688', durum: 'mola', sofor_ad: 'Murat Örnek', son_lat: 38.6051, son_lon: 27.0702, son_konum_zamani: iso(20), son_konum_kaynak: 'ilce', konum_kaynak: 'ilce', son_dogruluk: 2500, konum_metni: 'Menemen' },
    // BOŞ: Torbalı'da, şoför 25 dk önce söyledi (daire büyüdü)
    { ...ortak, id: 9209, plaka: '35DM699', durum: 'hazir', sofor_ad: 'Emre Örnek', ...sozlu(38.2291, 27.2835, 25, 1500, 'Torbalı Ayrancılar') },
    // BOŞ: konum hiç gelmedi
    { ...ortak, id: 9210, plaka: '35DM700', durum: 'hazir', sofor_ad: 'Barış Örnek' },
  ];
}

// ---------------------------------------------------------------- örnek kişiler (id 93xx)
function firmalar() {
  const ortak = { oy_sinifi: 'bizde', listede: true, servis: false, kendisi_gelecek: false, kendi_geldi: false, cep: null, cep2: null, sabit_tel: null, notlar: '', alma_notu: null, kisi_anahtar: null, kisi_oy_sayisi: 1, sorumlu_id: null, karsilayan: null, ilzam_no: null, evrak_uyari: null, toplulukta: false, geri_sayim: null, oy_bildiren: null, tasima_saati: null, arac_id: null, arac_sira: null, rota_kod: null, guncelleme: iso(0) };
  const s = (id, unvan, yetkili, ilce, lat, lon, durum, ek = {}) => ({ ...ortak, id, unvan, yetkili, ilce, adres: `${ilce} / İZMİR (örnek adres)`, lat, lon, durum, referans: 'Örnek Referans', ...ek });
  const saat = dk => { const d = new Date(Date.now() + dk * DK + kayma()); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`; };
  return [
    // ALINACAK
    s(9301, 'Örnek Hazır Beton Ltd. Şti.', 'Örnek Kişi 21', 'KEMALPAŞA', 38.4183, 27.4049, 'arandi', { referans: 'Örnek Referans 2' }),
    s(9302, 'Örnek Prefabrik Yapı A.Ş.', 'Örnek Kişi 22', 'TORBALI', 38.1702, 27.3501, 'bekliyor'),
    s(9303, 'Örnek Kireç Sanayi', 'Örnek Kişi 23', 'MENEMEN', 38.6003, 27.0802, 'arandi', { referans: 'Örnek Referans 3' }),
    s(9304, 'Örnek Seramik San. Tic.', 'Örnek Kişi 24', 'BORNOVA', 38.4702, 27.2298, 'bekliyor', { servis: true, tasima_saati: saat(-35) }),
    s(9305, 'Örnek Parke Ltd. Şti.', 'Örnek Kişi 25', 'ÇİĞLİ', 38.5011, 27.0352, 'bekliyor', { servis: true }),
    s(9306, 'Örnek Mermer Granit A.Ş.', 'Örnek Kişi 26', 'KARŞIYAKA', 38.4622, 27.1021, 'arandi', { referans: 'Örnek Referans 2' }),   // 40 sn sonra ATLAS talep açar
    // GÖREVDE
    s(9310, 'Örnek Beton Elemanları A.Ş.', 'Örnek Kişi 30', 'ALİAĞA', 38.8002, 26.9719, 'yolda', { arac_id: 9204, geri_sayim: 'aldim' }),
    s(9311, 'Örnek Yapı Katkıları Ltd.', 'Örnek Kişi 31', 'BORNOVA', 38.4551, 27.2249, 'bekliyor', { arac_id: 9205 }),
    s(9312, 'Örnek Toprak Ürünleri San.', 'Örnek Kişi 32', 'KEMALPAŞA', 38.4352, 27.3898, 'arandi', { arac_id: 9206, referans: 'Örnek Referans 3' }),
    s(9313, 'Örnek Mermer Ltd. Şti.', 'Örnek Kişi 33', 'BUCA', 38.3851, 27.1799, 'bekliyor', { arac_id: 9207 }),
    // BİTEN
    s(9320, 'Örnek Agrega San. Ltd.', 'Örnek Kişi 40', 'GAZİEMİR', 38.3301, 27.1402, 'oy_kullandi', { arac_id: 9201 }),
    s(9321, 'Örnek Cam Sanayi A.Ş.', 'Örnek Kişi 41', 'ÇİĞLİ', 38.4952, 27.0699, 'fuarda', { arac_id: 9203 }),
    s(9322, 'Örnek Tuğla Ltd. Şti.', 'Örnek Kişi 42', 'KONAK', 38.4191, 27.1289, 'oy_kullandi', { arac_id: 9202 }),
  ];
}
// ?saat= provası: taşıma saatleri uygulama saatine göre yazılsın (komite.js demoda 11:20 verir)
let _kayma = 0;
const kayma = () => _kayma;

// ---------------------------------------------------------------- örnek görev defteri
function gorevler() {
  const ortak = { tur: 'alim', atanan_profil: null, atanan_tel: null, aciliyet: 'normal', nereden: null, nereye: 'Fuar İzmir, Gaziemir', notlar: null, sebep: null, olusturan_id: null, kaynak_mesaj: null, atandi_zaman: null, kabul_zaman: null, yolda_zaman: null, tamam_zaman: null };
  const g = (id, firma_id, arac_id, atanan_ad, durum, olusturan, z, ek = {}) => ({
    ...ortak, id, firma_id, arac_id, atanan_ad, durum, olusturan,
    olusturma: iso(z.o), atandi_zaman: z.a != null ? iso(z.a) : null, kabul_zaman: z.k != null ? iso(z.k) : null,
    yolda_zaman: z.y != null ? iso(z.y) : null, tamam_zaman: z.t != null ? iso(z.t) : null, son_guncelleme: iso(Math.min(...Object.values(z))), ...ek,
  });
  return [
    g(1, 9320, 9201, 'Kadir Örnek', 'tamam', 'secmen_takip', { o: 62, a: 58, k: 57, y: 50, t: 46 }),
    g(2, 9321, 9203, 'Serdar Örnek', 'tamam', 'secmen_takip', { o: 60, a: 55, k: 54, y: 45, t: 38 }),
    g(3, 9322, 9202, 'Burak Örnek', 'tamam', 'Demo Masa', { o: 44, a: 40, k: 39, y: 33, t: 25 }),
    g(4, 9310, 9204, 'Tamer Örnek', 'yolda', 'secmen_takip', { o: 30, a: 27, k: 26, y: 18 }),
    g(5, 9311, 9205, 'Yusuf Örnek', 'atandi', 'Demo Masa', { o: 9, a: 4 }),
    g(6, 9312, 9206, 'Kemal Örnek', 'atandi', 'secmen_takip', { o: 12, a: 7 }, { notlar: 'Fabrika kapısında bekliyor' }),
    g(7, 9313, 9207, 'Can Örnek', 'kabul', 'secmen_takip', { o: 8, a: 5, k: 2 }),
    g(8, 9303, 9208, 'Murat Örnek', 'reddedildi', 'secmen_takip', { o: 14, a: 11, r: 5 }, { sebep: 'yetişemem' }),
    g(9, 9301, null, null, 'acik', 'secmen_takip', { o: 9 }, { aciliyet: 'acil', notlar: 'Kendisi aradı, aracı yok' }),
    g(10, 9302, null, null, 'acik', 'Demo Masa', { o: 3 }),
  ];
}
function ajanOlaylari() {
  const o = (id, dk, ajan, eylem, ozet, onem = 'bilgi', ek = {}) => ({ id, zaman: iso(dk), ajan, hedef: null, eylem, ozet, firma_id: null, arac_id: null, gorev_id: null, onem, kaynak_mesaj: null, veri: null, ...ek });
  return [
    o(6, 1, 'karsilama', 'karsilama_istedi', 'Kapıya karşılama istendi · Aliağa yolcusu, ~28 dk', 'bilgi', { gorev_id: 4 }),
    o(5, 2, 'sofor_takip', 'gorev_kabul', 'Şoför alım görevini kabul etti · Buca', 'bilgi', { gorev_id: 7 }),
    o(4, 5, 'sofor_takip', 'uyari', 'Şoför "yetişemem" yazdı · görev araç yöneticisine döndü · Menemen', 'kritik', { gorev_id: 8 }),
    o(3, 9, 'secmen_takip', 'gorev_acti', 'Acil araç talebi açıldı · Kemalpaşa', 'dikkat', { gorev_id: 9 }),
    o(2, 12, 'sofor_takip', 'konum_isledi', 'Şoför konum yazdı: Bornova çarşı', 'bilgi'),
    o(1, 14, 'secmen_takip', 'gorev_acti', 'Araç talebi açıldı · Menemen', 'bilgi', { gorev_id: 8 }),
  ];
}

// ---------------------------------------------------------------- bellek motoru (core.js alimAta / gorevDurumYap / ajanOlayYaz / alimTalebiAc bunu çağırır)
const yaz = g => { store.gorevler.set(g.id, g); bus.emit('gorev', { id: g.id }); return g; };
function firmaArac(firmaId, aracId, eskiArac = null) {
  const f = store.firmalar.get(firmaId); if (!f) return;
  if (aracId != null ? f.arac_id === aracId : f.arac_id !== eskiArac) return;
  store.firmalar.set(firmaId, { ...f, arac_id: aracId }); bus.emit('firma', { id: firmaId });
}
const acikGorev = firmaId => [...store.gorevler.values()].filter(x => x.firma_id === firmaId && x.tur === 'alim' && ['acik', ...GOREV_AKTIF].includes(x.durum)).sort((a, b) => b.id - a.id)[0] || null;
const motor = {
  demo: true,
  async alimTalebiAc(firmaId, { aciliyet = 'normal', not = null, sebep = null, olusturan = null, ajan = false } = {}) {
    const var_ = acikGorev(firmaId); if (var_) return var_;
    const t = simdiIso();
    return yaz({ id: ++gorevSira, tur: 'alim', firma_id: firmaId, arac_id: null, atanan_profil: null, atanan_ad: null, atanan_tel: null, durum: 'acik',
      aciliyet: aciliyet || 'normal', nereden: null, nereye: store.ayarlar.secim?.yer || null, notlar: not, sebep,
      olusturan: olusturan || store.ben?.ad_soyad || 'Demo', olusturan_id: ajan ? null : store.ben?.id || null, kaynak_mesaj: null,
      olusturma: t, atandi_zaman: null, kabul_zaman: null, yolda_zaman: null, tamam_zaman: null, son_guncelleme: t });
  },
  async alimAta(firmaId, aracId, { zorla = false, aciliyet = null, not = null } = {}) {
    let g = acikGorev(firmaId) || await motor.alimTalebiAc(firmaId, { aciliyet, not });
    if (aciliyet || not) g = { ...g, aciliyet: aciliyet || g.aciliyet, notlar: not || g.notlar };
    const mesgul = [...store.gorevler.values()].find(x => x.tur === 'alim' && x.arac_id === aracId && GOREV_AKTIF.includes(x.durum) && x.id !== g.id);
    if (mesgul) throw new Error(`Tek şoför kuralı: bu araç şu an görev ${mesgul.id} üzerinde; önce o görev bitmeli`);
    if (GOREV_AKTIF.includes(g.durum)) {
      if (g.arac_id === aracId) return g;
      if (!zorla) throw new Error(`Tek şoför kuralı: görev ${g.id} zaten atanmış`);
      firmaArac(firmaId, null, g.arac_id);
    }
    const a = store.araclar.get(aracId); const t = simdiIso();
    const yeni = yaz({ ...g, arac_id: aracId, atanan_ad: a?.sofor_ad || null, atanan_tel: a?.sofor_tel || null, atanan_profil: a?.sofor_kullanici || null,
      durum: 'atandi', atandi_zaman: t, kabul_zaman: null, yolda_zaman: null, tamam_zaman: null, son_guncelleme: t });
    firmaArac(firmaId, aracId);
    soforBenzet(yeni.id, aracId);
    return yeni;
  },
  async gorevDurumYap(id, durum, { sebep = null } = {}) {
    const g = store.gorevler.get(id); if (!g) throw new Error('Görev bulunamadı');
    const t = simdiIso(); const y = { ...g, durum, son_guncelleme: t, ...(sebep ? { sebep } : {}) };
    if (durum === 'acik') Object.assign(y, { arac_id: null, atanan_ad: null, atanan_tel: null, atanan_profil: null, atandi_zaman: null, kabul_zaman: null, yolda_zaman: null, tamam_zaman: null });
    if (durum === 'kabul') y.kabul_zaman = t;
    if (durum === 'yolda') { y.yolda_zaman = t; y.kabul_zaman = y.kabul_zaman || t; }
    if (durum === 'tamam') y.tamam_zaman = t;
    yaz(y);
    if (g.tur === 'alim' && g.arac_id && ['acik', 'iptal', 'reddedildi'].includes(durum)) firmaArac(g.firma_id, null, g.arac_id);
    return y;
  },
  async ajanOlayYaz(o) {
    const s = { id: ++olaySira, zaman: simdiIso(), hedef: null, firma_id: null, arac_id: null, gorev_id: null, kaynak_mesaj: null, veri: null, onem: 'bilgi', ...o };
    store.ajanOlaylari.unshift(s); store.ajanOlaylari.length = Math.min(store.ajanOlaylari.length, 200);
    bus.emit('ajan_olay', { olay: s }); return s;
  },
};

// ---------------------------------------------------------------- canlılık
const ilce = id => { const f = store.firmalar.get(store.gorevler.get(id)?.firma_id); return f?.ilce ? f.ilce.charAt(0) + f.ilce.slice(1).toLocaleLowerCase('tr') : ''; };
// yeni atanan görevi "şoför" kabul eder, sonra yolcuyu alır (yalnız görev hâlâ aynı araçtaysa)
function soforBenzet(gorevId, aracId) {
  setTimeout(() => {
    const g = store.gorevler.get(gorevId); if (!g || g.durum !== 'atandi' || g.arac_id !== aracId) return;
    motor.gorevDurumYap(gorevId, 'kabul');
    motor.ajanOlayYaz({ ajan: 'sofor_takip', eylem: 'gorev_kabul', ozet: `Şoför alım görevini kabul etti${ilce(gorevId) ? ' · ' + ilce(gorevId) : ''}`, gorev_id: gorevId, arac_id: aracId });
  }, 7000);
  setTimeout(() => {
    const g = store.gorevler.get(gorevId); if (!g || g.durum !== 'kabul' || g.arac_id !== aracId) return;
    const a = store.araclar.get(aracId); if (a) { store.araclar.set(aracId, { ...a, durum: 'yolda' }); bus.emit('arac', { id: aracId }); }
    const f = store.firmalar.get(g.firma_id);
    if (f) { store.firmalar.set(f.id, { ...f, durum: 'yolda', geri_sayim: 'aldim', geri_sayim_zamani: simdiIso() }); bus.emit('firma', { id: f.id }); }
    motor.gorevDurumYap(gorevId, 'yolda');
    motor.ajanOlayYaz({ ajan: 'sofor_takip', eylem: 'yolcu_alindi', ozet: `Şoför yolcuyu aldı, Fuar'a geliyor${ilce(gorevId) ? ' · ' + ilce(gorevId) : ''}`, gorev_id: gorevId, arac_id: aracId });
  }, 20000);
}
// yoldaki araç (35DM644) Fuar'a doğru ilerler, tahmini varış azalır
function yolAdim() {
  const a = store.araclar.get(9204); if (!a || a.son_lat == null) return;
  const v = store.ayarlar.secim?.varis || VARIS;
  const lat = a.son_lat + (Number(v.lat) - a.son_lat) * 0.08, lon = a.son_lon + (Number(v.lon) - a.son_lon) * 0.08;
  konumGonder(9204, Number(lat.toFixed(6)), Number(lon.toFixed(6)), 12, 'telefon').catch(() => {});
  const b = store.araclar.get(9204); const eta = Math.max(1, (b.eta_dk || 28) - 1);
  store.araclar.set(9204, { ...b, eta_dk: eta, eta_zaman: new Date(Date.now() + eta * DK).toISOString() }); bus.emit('arac', { id: 9204 });
}
// ATLAS (seçmen takip) yeni bir araç talebi açar: ekranda "Yeni araç talebi" uyarısı
async function yeniTalep() {
  const g = await motor.alimTalebiAc(9306, { olusturan: 'secmen_takip', ajan: true, not: 'Referansı aradı: aracı yok, bekliyor' });
  motor.ajanOlayYaz({ ajan: 'secmen_takip', eylem: 'gorev_acti', ozet: 'Araç talebi açıldı · Karşıyaka', onem: 'dikkat', gorev_id: g.id, firma_id: 9306 });
}

// ---------------------------------------------------------------- kurulum (app.js, demo.js'in demoKur'undan sonra çağırır)
export function dispecDemoKur() {
  if (kuruldu) return; kuruldu = true;
  try {
    const p = new URLSearchParams(location.search).get('saat');
    if (p) { const [h, m] = p.split(':').map(Number); const d = new Date(); d.setHours(h, m || 0, 0, 0); _kayma = d.getTime() - Date.now(); }
  } catch {}
  if (['ay', 'arac_yoneticisi'].includes(new URLSearchParams(location.search).get('rol'))) {
    const ben = { id: 'demo-arac-yoneticisi', ad_soyad: 'Demo Araç Yöneticisi', rol: 'arac_yoneticisi', aktif: true, son_giris: simdiIso() };
    store.ben = ben; store.profiller.set(ben.id, ben);
  }
  for (const a of araclar()) store.araclar.set(a.id, a);
  for (const f of firmalar()) store.firmalar.set(f.id, f);
  store.gorevler = new Map(gorevler().map(g => [g.id, g]));
  store.ajanOlaylari = ajanOlaylari();
  store.gorevDurum = 'hazir';
  store.ayarlar.hedef = store.ayarlar.hedef || { elle: 85 };
  store.ayarlar.secim = { ad: '26-27 Çimento, Kireç, Beton ve Diğer Mineral Ürünler Sanayi', ...(store.ayarlar.secim || {}) };
  gorevMotoruKur(motor);
  bus.emit('araclar'); bus.emit('firmalar'); bus.emit('gorevler');
  setInterval(yolAdim, 20000);
  setTimeout(yeniTalep, 40000);
}
