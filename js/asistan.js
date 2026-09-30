// 72. Komite · Seçim Masası · ATLAS ASİSTANI (Claude Design "SM Atlas" + "SM AtlasTel" birebir, ATLAS 2026-09-30)
// Masaüstünde sağdan açılan 400 px panel, telefonda tam ekran. Sağ altta 64 px kırmızı ATLAS düğmesi (okunmamış rozeti; panel açıkken gizli).
// Rol bazlı hazır soru kartları, bağlama göre çipler, mesaj kartları: cevap · ATLAS İŞLEDİ (+ Geri al) · ONAYA GÖNDERİLDİ · PLAN (Uygula / İptal) · YAPILDI · bilgi · çevrimdışı.
// Veri akışı değişmedi: asistanGonder, store.asistan, store.istekler, bus 'asistan' / 'istek'. window 'atlas-sor' olayı: paneli açar, soru doluysa gönderir.
// app.js her ekran değişiminde kur() çağırır: kur() idempotenttir, düğmeyi ve paneli <body>'ye bir kez ekler.
import {
  store, bus, esc, fmt, trKucuk, trBaslik, DURUM_AD, SINIF_AD, ARAC_DURUM_AD, ROL_AD,
  yoneticiMi, yazabilirMi, benRol, asistanGonder, istekKarar, durumYap, firmaAdi, gecikme,
} from './core.js';
import { el, toast, hataGoster, kisiKartiAc, onayla } from './ui.js';

// ---------------------------------------------------------------- sabitler (tasarımdaki SM.atlas.ROLE_Q / ROLE_LABEL)
const BEKLEME_MS = 60000;              // bu süre içinde cevap gelmezse "meşgul, mesajın sırada" notu
const LISTE_KISA = 6, LISTE_UZUN = 150; // cevap kartındaki firma listesi: kapalı / açık satır sınırı
const ROLE_Q = {
  masa: ['Şu an kaç kişi oy kullandı?', 'Kim hâlâ gelmedi?', 'Geciken alım var mı?', 'Hangi referans geride?', 'Araçlar nerede?'],
  sorumlu: ['Sıradaki durağım kim?', 'Yolcum nerede, aradınız mı?', 'Fuar girişi nereden?', 'Bir sorun bildir'],
  rapor: ['Son 1 saatte kaç kişi geldi?', 'Hedefe ne kadar kaldı?'],
};
// Admin: gerçek Claude Code ajanıyla konuşur (Mac'te admin_ajan.py). Taslak örnekler gönderilmez, kutuya yazılır (Admin düzenler).
const ADMIN_TASLAK = [
  '35 ABC 123 beyaz Doblo, şoför Ali Veli 0532 000 00 00, 4 kişilik: ekle',
  'Masaya şu paneli ekle: ',
];
ROLE_Q.yonetici = ['Şu an kaç kişi oy kullandı?', 'Kim hâlâ gelmedi?', ...ADMIN_TASLAK, 'Son 1 saatte kimler geldi, saat saat?'];
const taslakMi = q => ADMIN_TASLAK.includes(q);
const ANA_ROL = { yonetici: 'yonetici', kurul: 'masa', masa: 'masa', sorumlu: 'sorumlu', sofor: 'sorumlu', rapor: 'rapor' };
const ROL_ETIKET = {
  masa: 'Masa · soru ve bilgi', yonetici: 'Admin · tam yetki', kurul: 'Yönetim kurulu · soru ve bilgi',
  sorumlu: 'Araç sorumlusu · saha', sofor: 'Şoför · saha', rapor: 'Rapor · salt okunur',
};
const ROL_IPUCU = {
  masa: 'Masadan soru sorabilir, gelişme bildirebilirsin. İş talepleri Admin\'e onaya gider.',
  yonetici: 'Benimle Claude Code\'da konuştuğun gibi konuşabilirsin: veriyi okur ve değiştiririm, araç ve hesap açarım, panele ekran eklerim. Ekleme, silme, toplu değişiklik ve kod değişikliğinden önce planı söyler, "evet" beklerim. Çalışırken "dur" yazarsan dururum.',
  sorumlu: 'Araçların ve yolcuların için hızlı sorular.',
  rapor: 'Salt okunur: sayılar ve ilerleme.',
};
// istek durumu -> tasarımdaki APST rozeti (sınıf, etiket)
const ISTEK_ROZET = {
  onay_bekliyor: ['bekliyor', 'Onay bekliyor'], onaylandi: ['yapiliyor', 'Onaylandı · yapılıyor'], yapiliyor: ['yapiliyor', 'Onaylandı · yapılıyor'],
  yapildi: ['yapildi', '✓ Yapıldı'], reddedildi: ['reddedildi', 'Reddedildi'], hata: ['hata', 'Hata'],
};
const PLAN_DURUM = { onaylandi: 'Uygulanıyor…', yapiliyor: 'Uygulanıyor…', yapildi: '✓ Uygulandı', reddedildi: 'İptal edildi', hata: 'Uygulanamadı' };
const RISK_AD = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const ALAN_AD = {
  durum: 'Gün durumu', oy_bildirimi: 'Oy bildirimi', oy_sinifi: 'Oy sınıfı', arac_id: 'Araç', notlar: 'Not', kendi_geldi: 'Kendi geldi', kendisi_gelecek: 'Kendisi gelecek',
  tasima_saati: 'Taşıma saati', alma_notu: 'Alma notu', servis: 'Servis', cep: 'Cep', cep2: '2. cep', adres: 'Adres', ek_not: 'Ek not',
  arac_sira: 'Araç sırası', sofor_ad: 'Şoför', sofor_tel: 'Şoför telefonu', plaka: 'Plaka', kapasite: 'Kapasite', evrak_uyari: 'Evrak uyarısı',
};
const TURLER = new Set(['cevap', 'islendi', 'onaya_gitti', 'plan', 'yapildi', 'hata']);

// ---------------------------------------------------------------- durum
let kuruldu = false, dugme = null, panel = null, girdi = null;
let acik = false, benId = null, hepsiMod = false, sonGorulen = 0, onayAcik = false, yeniImlec = 0;
let ilkCizim = true, sonCizilen = 0, veriBagimli = false, zamanlayici = null, onizlemeZaman = null;
let giden = [], gonderiliyor = false, cipListe = [];
const bilinenMesaj = new Set(), bilinenIstek = new Set();
const yerelZaman = new Map();       // bu cihazdan gönderilen mesaj id -> gönderim anı (saat kaymasına karşı)
const acikListeler = new Set();     // "+N kişi daha" açılmış mesajlar
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
const ilkAd = ad => trBaslik(String(ad || '').trim().split(/\s+/)[0] || '');
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
// Türkçe tamlayan eki (tasarımdaki gen): "Ayşe K.'nın", "Test Masa'nın", "Test Sofor'un"
const UNLU = 'aıoueiöü';
function tamlayan(w) {
  w = String(w || '').trim(); if (!w) return '';
  if (/\.$/.test(w)) return `${w}'nın`;
  const k = trKucuk(w); let son = ''; for (let i = k.length - 1; i >= 0; i--) if (UNLU.includes(k[i])) { son = k[i]; break; }
  const ek = { a: 'ın', ı: 'ın', o: 'un', u: 'un', e: 'in', i: 'in', ö: 'ün', ü: 'ün' }[son] || 'in';
  return `${w}'${UNLU.includes(k[k.length - 1]) ? 'n' : ''}${ek}`;
}
const kisaAd = b => { const w = String(b || '').trim().split(/\s+/).filter(Boolean); return w.length > 1 ? `${trBaslik(w[0])} ${trBaslik(w[w.length - 1]).charAt(0)}.` : trBaslik(w[0] || ''); };
const firmaKisa = f => trBaslik(String(f?.unvan || '').replace(' — ', ' ').split(/\s+/).slice(0, 2).join(' '));
const zaman = m => fmt.saat(m.zaman);
const sureMetni = sn => { sn = Math.max(0, Math.round(Number(sn) || 0)); const d = Math.floor(sn / 60); return d ? `${d} dk${sn % 60 ? ' ' + (sn % 60) + ' sn' : ''}` : `${sn} sn`; };
// Admin ajanının çalışan kartı (veri.ajan + veri.calisiyor, durum 'isleniyor') ve "Sıradayım" cevabı
const ajanCalisiyor = m => m && m.yon === 'atlas' && m.durum === 'isleniyor' && veriOf(m).ajan && veriOf(m).calisiyor;
// ATLAS'ın düz metni: kaçışlanır, yalnız **kalın** ve `satır içi kod` (Admin ajanı dosya/komut adları) desteklenir
const metinHtml = t => esc(t || '').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code class="asistan-kod">$1</code>');
const onaylayici = () => [...store.profiller.values()].find(p => p.rol === 'yonetici' && p.aktif)?.ad_soyad || 'Admin';

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
// "↺ Yeni": imleçten eski mesajlar bu pencerede gizlenir (kayıtlar silinmez); cevabı beklenen mesaj her zaman görünür
const gorunen = () => (tumMod() ? sirali() : benimKonusma()).filter(m => Number(m.id) > yeniImlec || bekliyorMu(m));
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
  if (!id) { giden = []; yeniImlec = 0; return; }
  const kayit = ls.al(`atlas-son-gorulen-${id}`, null);
  if (kayit === null) {   // bu cihazda ilk açılış: geçmişi okunmuş say
    sonGorulen = benimKonusma().filter(m => m.yon === 'atlas').reduce((a, m) => Math.max(a, Number(m.id)), 0);
    ls.yaz(`atlas-son-gorulen-${id}`, sonGorulen);
  } else sonGorulen = Number(kayit) || 0;
  store.asistan.forEach(m => bilinenMesaj.add(m.id));
  store.istekler.forEach(i => bilinenIstek.add(i.id));
  hepsiMod = ls.al('atlas-tum-konusmalar', false) === true;
  yeniImlec = Number(ls.al(`atlas-yeni-${id}`, 0)) || 0;
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

// ---------------------------------------------------------------- düğme (64 px kırmızı; css/app.css .atlas-dugme)
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
        <div class="asistan-rol" data-yetki></div>
      </div>
      <button type="button" class="asistan-yeni-sohbet" data-yeni-sohbet title="Yeni sohbet">↺ Yeni</button>
      <button type="button" class="asistan-kapat" data-kapat title="Kapat (Esc)" aria-label="Kapat">×</button>
    </header>
    <div class="asistan-serit" data-serit></div>
    <div class="asistan-onay" data-onay></div>
    <div class="asistan-govde">
      <div class="asistan-liste" data-liste aria-live="polite"></div>
      <button type="button" class="asistan-yeni gizli" data-yeni>Yeni mesaj ↓</button>
    </div>
    <div class="asistan-alt-blok">
      <div data-cevrimdisi></div>
      <div class="asistan-cipler" data-cipler></div>
      <form class="asistan-form" data-form>
        <textarea rows="2" maxlength="2000" data-girdi aria-label="ATLAS'a mesaj"></textarea>
        <button type="submit" class="asistan-gonder" data-gonder>Gönder</button>
      </form>
    </div>
  </aside>`);
  document.body.appendChild(panel);
  girdi = panel.querySelector('[data-girdi]');
  const liste = panel.querySelector('[data-liste]');

  panel.querySelector('[data-form]').addEventListener('submit', e => { e.preventDefault(); gonder(); });
  girdi.addEventListener('input', boyutla);
  girdi.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); gonder(); }
    e.stopPropagation();   // kabuk kısayolları (/ ⌘K) yazarken tetiklenmesin
  });
  liste.addEventListener('scroll', () => { if (liste.scrollHeight - liste.scrollTop - liste.clientHeight < 60) yeniPill(false); }, { passive: true });
  panel.addEventListener('click', tikla);
}
function tikla(e) {
  const t = e.target;
  if (t.closest('a[href^="tel:"]')) return;                         // arama bağlantısı kendi işini yapar
  if (t.closest('[data-kapat]')) return kapat();
  if (t.closest('[data-yeni-sohbet]')) return yeniSohbet();
  const kisi = t.closest('[data-kisi]'); if (kisi) { e.preventDefault(); return kisiKartiAc(Number(kisi.dataset.kisi)); }
  const k = t.closest('[data-karar]'); if (k) return karar(Number(k.dataset.istek), k.dataset.karar === '1');
  const g = t.closest('[data-geri]'); if (g) return geriAl(Number(g.dataset.geri));
  const la = t.closest('[data-liste-ac]'); if (la) { const id = Number(la.dataset.listeAc); acikListeler.has(id) ? acikListeler.delete(id) : acikListeler.add(id); return planla(); }
  const c = t.closest('[data-cip]'); if (c) return cip(cipListe[Number(c.dataset.cip)]);
  const o = t.closest('[data-soru]'); if (o) return taslakMi(o.dataset.soru) ? kutuyaYaz(o.dataset.soru) : gonder(o.dataset.soru);
  if (t.closest('[data-ajan-dur]')) return ajanDurdur(t.closest('[data-ajan-dur]'));
  if (t.closest('[data-hepsi]')) { hepsiMod = !hepsiMod; ls.yaz('atlas-tum-konusmalar', hepsiMod); ilkCizim = true; return planla(true); }
  if (t.closest('[data-onay-ac]')) { onayAcik = !onayAcik; return planla(); }
  const git = t.closest('[data-git]'); if (git) return mesajaGit(Number(git.dataset.git));
  const sil = t.closest('[data-giden-sil]'); if (sil) { giden = giden.filter(x => x.yid !== sil.dataset.gidenSil); gidenKaydet(); return planla(); }
  if (t.closest('[data-yeni]')) { const l = panel.querySelector('[data-liste]'); l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' }); yeniPill(false); }
}
function boyutla() {
  if (!girdi) return;
  girdi.style.height = 'auto';
  girdi.style.height = Math.min(girdi.scrollHeight, 132) + 'px';
  girdi.style.overflowY = girdi.scrollHeight > 132 ? 'auto' : 'hidden';
}
function kutuyaYaz(metin) {
  girdi.value = metin; boyutla();
  girdi.focus(); girdi.setSelectionRange(girdi.value.length, girdi.value.length);
}
// çip: "Gelişme bildir" yazdırır (kutuya "Gelişme: " gelir), diğerleri doğrudan soru olarak gider
function cip(c) {
  if (!c) return;
  if (taslakMi(c)) return kutuyaYaz(c);
  if (/gelişme bildir/i.test(c)) {
    const mevcut = girdi.value.trim();
    return kutuyaYaz(!mevcut ? 'Gelişme: ' : (/^gelişme\s*:/i.test(mevcut) ? girdi.value : 'Gelişme: ' + mevcut));
  }
  gonder(c);
}
// Admin ajanı çalışırken "Durdur": sohbete "dur" yazmakla aynı (Mac'teki admin_ajan.py süreci sonlandırır)
let durGonderildi = 0;
function ajanDurdur(b) {
  if (!yoneticiMi() || Date.now() - durGonderildi < 4000) return;
  durGonderildi = Date.now();
  if (b) { b.disabled = true; b.textContent = 'Durduruluyor…'; }
  gonder('dur');
}
function yeniPill(goster) { panel?.querySelector('[data-yeni]')?.classList.toggle('gizli', !goster); }
function mesajaGit(id) {
  const s = panel.querySelector(`[data-mid="${id}"]`); if (!s) return;
  s.scrollIntoView({ block: 'center', behavior: 'smooth' });
  s.classList.remove('parla'); void s.offsetWidth; s.classList.add('parla');
}
// tasarımdaki "↺ Yeni": yeni sohbet (eski mesajlar kayıtta kalır, bu pencerede gizlenir)
function yeniSohbet() {
  if (!store.ben) return;
  const enSon = (tumMod() ? sirali() : benimKonusma()).filter(m => !bekliyorMu(m)).reduce((a, m) => Math.max(a, Number(m.id)), yeniImlec);
  yeniImlec = enSon; ls.yaz(`atlas-yeni-${store.ben.id}`, yeniImlec);
  acikListeler.clear(); ilkCizim = true; planla(true);
  if (!dar()) girdi?.focus();
}

// ---------------------------------------------------------------- aç / kapat
// ac(metin): paneli açar. metin doluysa: "Ad: " gibi ikiye nokta ile bitiyorsa kutuya yazılır (kullanıcı tamamlar), değilse soru olarak hemen gönderilir.
function ac(metin) {
  if (!store.ben) return;
  if (!kuruldu) kur();
  panelKur();
  const soru = typeof metin === 'string' ? metin.trim() : '';
  const yazilacak = soru && /:$/.test(soru) ? metin.replace(/^\s+/, '') : '';
  acik = true; ilkCizim = true;
  panel.classList.add('acik'); panel.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('asistan-acik');
  onizlemeKapat();
  girdi.placeholder = yoneticiMi() ? 'Soru sor, gelişme yaz ya da komut ver…' : 'Soru sor ya da gelişme yaz…';
  if (yazilacak) girdi.value = yazilacak;
  boyutla();
  ciz({ alta: true });
  gorunurlukGuncelle();
  if (!dar() || yazilacak) setTimeout(() => { if (acik) { girdi.focus(); girdi.setSelectionRange(girdi.value.length, girdi.value.length); } }, 90);
  if (soru && !yazilacak) gonder(soru);
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
  // önce üstteki katman (modal, hızlı arama, kişi kartı, bildirim paneli) kapansın; ui.js / app.js onları kapatır
  if (document.querySelector('#katman [data-modal], .palet, #katman [data-cekmece], .cekmece, .zil-panel, .kullanici-menu')) return;
  e.preventDefault(); kapat();
}

// ---------------------------------------------------------------- gönderme (çevrimdışıyken sıraya alır)
async function gonder(ozelMetin) {
  if (!store.ben) return;
  const kutudan = typeof ozelMetin !== 'string';
  const metin = String(kutudan ? (girdi?.value ?? '') : ozelMetin).trim();
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
    if (kutudan && girdi && !girdi.value.trim()) { girdi.value = metin; boyutla(); }
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

// ---------------------------------------------------------------- onay kararı (admin): Uygula / İptal
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

// ---------------------------------------------------------------- çizim: rozetler ve değerler
const istekRozet = d => { const r = ISTEK_ROZET[d]; return r ? `<span class="asistan-b ap-${r[0]}">${esc(r[1])}</span>` : ''; };
const riskRozet = r => r ? `<span class="asistan-b rk-${esc(r)}">Risk: ${esc(RISK_AD[r] || r)}</span>` : '';
const alanAd = (alan, tip) => tip === 'arac' && alan === 'durum' ? 'Araç durumu' : (ALAN_AD[alan] || String(alan || '').replace(/_/g, ' '));

function degerMetin(alan, v, tip) {
  if (v === null || v === undefined || v === '') return '';
  if (alan === 'durum') {
    if (tip === 'arac') return ARAC_DURUM_AD[v] || String(v);
    const p = durumParcala(v); return (DURUM_AD[p.durum] || p.durum) + (p.kendi ? ' · kendi geldi' : '');
  }
  if (alan === 'oy_sinifi') return SINIF_AD[v] || String(v);
  if (alan === 'arac_id') { const a = store.araclar.get(numara(v)); return a ? fmt.plaka(a.plaka) : `Araç #${v}`; }
  if (typeof v === 'boolean' || alan === 'kendi_geldi' || alan === 'kendisi_gelecek') return evetMi(v) ? 'Evet' : 'Hayır';
  if (alan === 'tasima_saati') return fmt.saatKisa(v);
  return kisalt(typeof v === 'object' ? JSON.stringify(v) : String(v), 120);
}
// "işlenen değişiklik" satırı: varlık, alan: eski → yeni
function degHtml(d) {
  if (!d || typeof d !== 'object') return '';
  const fid = numara(d.firma_id), aid = numara(d.arac_id);
  const tip = fid !== null ? 'firma' : 'arac';
  const f = fid !== null ? store.firmalar.get(fid) : null;
  const a = aid !== null ? store.araclar.get(aid) : null;
  let kim;
  if (tip === 'firma') kim = f ? `<span class="asistan-deg-kim" data-kisi="${f.id}" role="button" tabindex="0">${esc(firmaAdi(f))} · ${esc(firmaKisa(f))}</span>` : `<span class="asistan-deg-kim">Firma #${esc(fid)}</span>`;
  else kim = `<span class="asistan-deg-kim">${a ? esc(fmt.plaka(a.plaka)) + (a.sofor_ad ? ' · ' + esc(trBaslik(a.sofor_ad)) : '') : aid !== null ? 'Araç #' + esc(aid) : 'Kayıt'}</span>`;
  let satir;
  if (d.alan === 'notlar') satir = `<span class="asistan-deg-alan">Not:</span><span class="asistan-deg-yeni">${esc(kisalt(sonSatir(d.yeni).replace(/^\[[^\]]*\]\s*/, ''), 160))}</span>`;
  else {
    const eski = degerMetin(d.alan, d.eski, tip), yeni = degerMetin(d.alan, d.yeni, tip);
    satir = `<span class="asistan-deg-alan">${esc(alanAd(d.alan, tip))}:</span>`
      + (eski ? `<span class="asistan-deg-eski">${esc(eski)}</span>` : '<span class="asistan-deg-eski bos">boş</span>')
      + `<span class="asistan-deg-ok">→</span><span class="asistan-deg-yeni">${yeni ? esc(yeni) : 'boş'}</span>`;
  }
  return `<div class="asistan-deg">${kim}<div class="asistan-deg-satir">${satir}</div></div>`;
}
function degisikliklerHtml(v) {
  const d = diziAl(v.degisiklikler).filter(x => x && typeof x === 'object');
  if (!d.length) return '';
  veriBagimli = true;
  return `<div class="asistan-degler">${d.slice(0, LISTE_UZUN).map(degHtml).join('')}${d.length > LISTE_UZUN ? `<div class="asistan-devam">+${d.length - LISTE_UZUN} değişiklik daha</div>` : ''}</div>`;
}
// cevap kartındaki kişi listesi: her satır Kişi Kartı'nı açar
function kisiSatiriHtml(f) {
  const g = gecikme(f);
  const durum = f.durum === 'oy_kullandi' ? 'Oy kullandı' : (DURUM_AD[f.durum] || f.durum);
  const karsi = f.karsilayan ? `Karşılayan: ${trBaslik(f.karsilayan)}${f.karsilama_zamani ? ' · ' + fmt.saat(f.karsilama_zamani) : ''}` : '';
  const parca = [g && f.tasima_saati ? fmt.saatKisa(f.tasima_saati) : '', firmaKisa(f), durum, g ? `${g} dk gecikti` : '', f.referans ? 'Ref: ' + trBaslik(f.referans) : '', karsi].filter(Boolean);
  return `<button type="button" class="asistan-li" data-kisi="${f.id}"><span class="asistan-li-ad">${esc(firmaAdi(f))} <span class="asistan-li-ok">›</span></span><span class="asistan-li-alt">${esc(parca.join(' · '))}</span></button>`;
}
function kisiListesiHtml(ids, mid) {
  const firmalar = diziAl(ids).map(x => store.firmalar.get(numara(x && typeof x === 'object' ? (x.id ?? x.firma_id) : x))).filter(Boolean);
  if (!firmalar.length) return '';
  veriBagimli = true;
  const genis = acikListeler.has(Number(mid));
  const gos = firmalar.slice(0, genis ? LISTE_UZUN : LISTE_KISA);
  const kalan = firmalar.length - gos.length;
  return `<div class="asistan-liste-kutu">${gos.map(kisiSatiriHtml).join('')}</div>`
    + (firmalar.length > LISTE_KISA
      ? `<button type="button" class="asistan-devam ac" data-liste-ac="${Number(mid)}">${genis ? 'Daha az göster' : `+${fmt.sayi(kalan)} kişi daha`}</button>` : '')
    + (genis && firmalar.length > LISTE_UZUN ? `<div class="asistan-devam">İlk ${LISTE_UZUN} kişi gösteriliyor</div>` : '');
}
// veri.tablo {cols, rows}: mini tablo (ATLAS ileride tablo yollarsa)
function tabloHtml(v) {
  const t = v.tablo; if (!t || !Array.isArray(t.cols) || !Array.isArray(t.rows) || !t.cols.length) return '';
  const sut = t.cols.length === 5 ? '86px 62px 58px minmax(0,1fr) 60px' : `repeat(${t.cols.length}, minmax(0,1fr))`;
  const satir = h => `<div class="asistan-tablo-satir" style="grid-template-columns:${sut}">${diziAl(h).map(c => `<div>${esc(c)}</div>`).join('')}</div>`;
  return `<div class="asistan-tablo"><div class="asistan-tablo-satir bas" style="grid-template-columns:${sut}">${t.cols.map(c => `<div>${esc(c)}</div>`).join('')}</div>${t.rows.map(satir).join('')}</div>`;
}
function kaynakSatiri(k) {
  if (!k) return '<span class="asistan-kaynak"></span>';
  const ad = k.kullanici_ad || profilAd(k.kullanici_id) || 'Kullanıcı';
  return `<span class="asistan-kaynak" data-git="${Number(k.id)}" title="${esc(kisalt(k.metin, 300))}">Kaynak: ${esc(tamlayan(kisaAd(ad)))} ${esc(fmt.saat(k.zaman))} mesajı</span>`;
}
function geriAlDugmesi(m, v) {
  if (!geriIzni()) return '';
  const liste = geriAlinabilir(v); if (!liste.length) return '';
  veriBagimli = true;
  const hepsiEski = liste.every(d => store.firmalar.get(numara(d.firma_id))?.durum === durumParcala(d.eski).durum);
  if (hepsiEski) return '<div class="asistan-geri-tamam">Geri alındı</div>';
  const bekle = geriBekleyen.has(Number(m.id));
  return `<button type="button" class="asistan-geri" data-geri="${Number(m.id)}" ${bekle ? 'disabled' : ''}>${bekle ? 'Geri alınıyor…' : '↶ Geri al'}</button>`;
}
const geriAlindiMi = v => { const l = geriAlinabilir(v); return !!l.length && l.every(d => store.firmalar.get(numara(d.firma_id))?.durum === durumParcala(d.eski).durum); };

// plan metnini adımlara böl: ilk paragraf numaralı adımlar (1) ... 2) ...), sonraki paragraflar ayrıntı (ör. WhatsApp'a gidecek metin)
function planParcala(plan) {
  const par = String(plan || '').trim().split(/\n\s*\n/);
  const ilk = par.shift() || '';
  let adimlar = ilk.split(/(?:^|\s)\d{1,2}[.)]\s+(?=\S)/).map(s => s.trim()).filter(Boolean);
  if (adimlar.length <= 1) {
    const satirlar = ilk.split('\n').map(s => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
    if (satirlar.length > 1) adimlar = satirlar;
  }
  return { adimlar, ek: par.map(s => s.trim()).filter(Boolean) };
}
function etkiMetni(v) {
  const d = diziAl(v.degisiklikler).filter(x => x && typeof x === 'object'); const is_ = v.is && typeof v.is === 'object' ? v.is : {};
  if (d.length) { const kayit = new Set(d.map(x => (x.firma_id != null ? 'f' + x.firma_id : 'a' + x.arac_id))).size; return `${fmt.sayi(kayit)} kayıt · ${fmt.sayi(d.length)} değişiklik`; }
  if (is_.tip === 'whatsapp_mesaj') return `1 alıcı${is_.alici_ad ? ' · ' + is_.alici_ad : ''}${is_.ek_liste ? ' · güncel liste eklenir' : ''}`;
  if (is_.tip === 'kod') return 'Ana ATLAS oturumuna iletilir, otomatik uygulanmaz';
  return '';
}
// Aynı istek için birden çok kart varsa (onaya gitti + plan + yapıldı) sonuç yalnız kapanış kartında görünür
let istekBaglam = { kapanan: new Set() };
function istekBaglamKur(liste) {
  const kapanan = new Set();
  for (const m of liste) { if (m.yon !== 'atlas') continue; const id = numara(veriOf(m).istek_id); if (id !== null && (m.tur === 'yapildi' || m.tur === 'hata')) kapanan.add(id); }
  istekBaglam = { kapanan };
}
function karsiKararlar(id) {
  const b = kararBekleyen.has(Number(id)) ? 'disabled' : '';
  return `<div class="asistan-plan-dugmeler"><button type="button" class="asistan-uygula" data-karar="1" data-istek="${Number(id)}" ${b}>Uygula</button><button type="button" class="asistan-iptal" data-karar="0" data-istek="${Number(id)}" ${b}>İptal</button></div>`;
}

// ---------------------------------------------------------------- çizim: mesaj kartları
function kullaniciHtml(m, tum) {
  const benim = m.kullanici_id === store.ben.id;
  const kim = m.kullanici_ad || profilAd(m.kullanici_id) || 'Kullanıcı';
  const ust = tum && !benim ? `<div class="asistan-kim">${esc(kim)}${m.rol ? ` · ${esc(ROL_AD[m.rol] || m.rol)}` : ''}</div>` : '';
  const hata = m.durum === 'hata' ? '<span class="asistan-hata-not"> · İşlenemedi</span>' : '';
  return `<div class="asistan-m" data-mid="${Number(m.id)}"><div class="asistan-k${benim ? '' : ' baska'}">${ust}`
    + `<div class="asistan-k-balon">${esc(m.metin)}</div>`
    + `<div class="asistan-k-alt">${esc(zaman(m))} · ${esc(ilkAd(kim))}${hata}</div></div></div>`;
}
const bilgiMi = (m, v) => !diziAl(v.liste).length && /bilgi olarak kaydett|kayıtta değişiklik yapmadım|gelişmeler akışına eklendi/i.test(String(m.metin || ''));

function atlasHtml(m, liste, tum) {
  const v = veriOf(m); const tur = TURLER.has(m.tur) ? m.tur : 'cevap';
  const zm = esc(zaman(m));
  const hedef = tum && m.kullanici_id && m.kullanici_id !== store.ben.id ? (profilAd(m.kullanici_id) || m.kullanici_ad || '') : '';
  const ajanEk = v.ajan && !v.calisiyor && v.sure_sn != null ? ` · ${esc(sureMetni(v.sure_sn))}${v.arac_sayisi ? ` · ${esc(v.arac_sayisi)} adım` : ''}` : '';
  const alt = `<div class="asistan-c-alt">ATLAS${hedef ? ' → ' + esc(hedef) : ''} · ${zm}${ajanEk}</div>`;
  const sar = ic => `<div class="asistan-m" data-mid="${Number(m.id)}">${ic}</div>`;

  if (v.ajan && v.calisiyor && m.durum === 'isleniyor') {   // Admin ajanı çalışıyor: canlı adım + Durdur
    const adimlar = diziAl(v.adimlar).filter(a => a && a.a).slice(-4);
    const gecen = v.baslangic ? sureMetni((Date.now() - new Date(v.baslangic).getTime()) / 1000) : '';
    const benim = m.kullanici_id === store.ben.id && yoneticiMi();
    const durBekle = Date.now() - durGonderildi < 4000;
    return sar(`<div class="asistan-ajan"><div class="asistan-kart-ust"><span class="asistan-ajan-et"><span class="asistan-ajan-don" aria-hidden="true"></span>ÇALIŞIYOR</span>`
      + `<span class="asistan-kart-zaman">${esc(gecen)}${v.arac_sayisi ? ` · ${esc(v.arac_sayisi)} adım` : ''}</span></div>`
      + `<div class="asistan-c-metin">${metinHtml(m.metin || 'Üzerinde çalışıyorum…')}</div>`
      + (v.adim ? `<div class="asistan-ajan-adim">${esc(kisalt(v.adim, 220))}</div>` : '')
      + (adimlar.length > 1 ? `<div class="asistan-ajan-gecmis">${adimlar.slice(0, -1).map(a => `<div><span>${esc(a.z || '')}</span>${esc(kisalt(a.a, 140))}</div>`).join('')}</div>` : '')
      + (benim ? `<div class="asistan-kart-alt"><span class="asistan-kaynak">İstersen "dur" yazabilirsin.</span><button type="button" class="asistan-dur" data-ajan-dur ${durBekle ? 'disabled' : ''}>${durBekle ? 'Durduruluyor…' : '■ Durdur'}</button></div>` : '')
      + '</div>');
  }
  if (tur === 'islendi') {                       // Bilgi -> ATLAS İŞLEDİ
    const geriAlindi = geriAlindiMi(v);
    const ek = /uygulanmayan|yapmadım/i.test(String(m.metin || '')) ? `<div class="asistan-islendi-not">${metinHtml(m.metin)}</div>` : '';
    return sar(`<div class="asistan-islendi${geriAlindi ? ' geri' : ''}"><div class="asistan-kart-ust"><span class="asistan-pil">✓ ATLAS İŞLEDİ</span><span class="asistan-kart-zaman">${zm}</span></div>`
      + `${ek}${degisikliklerHtml(v)}`
      + `<div class="asistan-kart-alt">${kaynakSatiri(kaynakMesaj(m, liste))}${geriAlDugmesi(m, v)}</div></div>`);
  }
  if (tur === 'onaya_gitti' || (tur === 'plan' && !yoneticiMi())) {   // İş talebi -> ONAYA GÖNDERİLDİ
    const ist = istekBul(v.istek_id);
    const durum = ist?.durum || 'onay_bekliyor';
    const kaynak = kaynakMesaj(m, liste);
    const istek = kaynak?.metin || ist?.metin || '';
    const karar_ = ist?.onaylayan && durum !== 'onay_bekliyor' ? `${durum === 'reddedildi' ? 'Reddeden' : 'Onaylayan'}: ${ist.onaylayan}` : `Onaylayacak: ${onaylayici()}`;
    return sar(`<div class="asistan-onaya"><div class="asistan-kart-ust"><span class="asistan-onaya-et">ONAYA GÖNDERİLDİ</span><span class="asistan-onaya-durum">${istekRozet(durum)}</span></div>`
      + `<div class="asistan-c-metin">${metinHtml(m.metin) || 'İsteğin onaya gönderildi.'}</div>`
      + (istek ? `<div class="asistan-istek-kutu">İstek: “${esc(kisalt(istek, 400))}”</div>` : '')
      + (ist?.onay_notu ? `<div class="asistan-istek-kutu">Not: ${esc(ist.onay_notu)}</div>` : '')
      + `<div class="asistan-onaya-alt"><span>${esc(karar_)}</span><span class="son">${zm}</span></div></div>`);
  }
  if (tur === 'plan') {                          // Admin komutu -> PLAN
    const ist = istekBul(v.istek_id);
    const p = planParcala(ist?.plan || m.metin);
    const etki = etkiMetni(v);
    const durum = ist?.durum;
    let alt2;
    if (durum === 'onay_bekliyor') alt2 = karsiKararlar(ist.id);
    else alt2 = `<div class="asistan-plan-durum">${esc(PLAN_DURUM[durum] || (ist ? '' : 'İstek kaydı bekleniyor…'))}</div>`;
    return sar(`<div class="asistan-plan"><div class="asistan-kart-ust"><span class="asistan-plan-et">PLAN</span>${riskRozet(ist?.risk || v.risk)}<span class="asistan-kart-zaman">${zm}</span></div>`
      + (m.metin && p.adimlar.join(' ').trim() !== String(m.metin).trim() ? `<div class="asistan-c-metin">${metinHtml(m.metin)}</div>` : '')
      + `<div class="asistan-adimlar">${p.adimlar.map((s, i) => `<div class="asistan-adim"><span class="n">${i + 1}</span><span>${esc(s)}</span></div>`).join('')}</div>`
      + (p.ek.length ? `<div class="asistan-plan-ek">${p.ek.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : '')
      + (etki ? `<div class="asistan-etki">Etki: <b>${esc(etki)}</b></div>` : '')
      + alt2 + '</div>');
  }
  if (tur === 'yapildi') {                       // YAPILDI
    const ist = istekBul(v.istek_id);
    const sonuc = m.metin || ist?.sonuc || '';
    const geri = yoneticiMi() ? geriAlDugmesi(m, v) : '';
    return sar(`<div class="asistan-yapildi"><div class="asistan-kart-ust"><span class="asistan-yapildi-et">✓ YAPILDI</span><span class="asistan-kart-zaman">${zm}</span></div>`
      + `<div class="asistan-yapildi-metin">${metinHtml(sonuc)}</div>${geri ? `<div class="asistan-kart-alt">${geri}</div>` : ''}</div>`);
  }
  if (tur === 'hata') {
    return sar(`<div class="asistan-hata"><div class="asistan-kart-ust"><span class="asistan-hata-et">⚠ HATA</span><span class="asistan-kart-zaman">${zm}</span></div>`
      + `<div class="asistan-yapildi-metin">${metinHtml(m.metin) || 'İşlem tamamlanamadı.'}</div></div>`);
  }
  if (bilgiMi(m, v)) return sar(`<div class="asistan-bilgi">ⓘ ${metinHtml(m.metin)}</div>`);   // bilgi notu
  // Soru -> cevap (liste / mini tablo)
  const liste_ = kisiListesiHtml(v.liste, m.id), tablo = tabloHtml(v);
  return sar(`<div class="asistan-c"><div class="asistan-c-govde">`
    + (m.metin ? `<div class="asistan-c-metin">${metinHtml(m.metin)}</div>` : '') + liste_ + tablo
    + `</div>${alt}</div>`);
}
function gidenHtml(g) {
  return `<div class="asistan-m sirada"><div class="asistan-k"><div class="asistan-k-balon">${esc(g.metin)}</div>`
    + `<div class="asistan-k-alt">${esc(fmt.saat(g.zaman))} · ${esc(ilkAd(store.ben.ad_soyad))} · <button type="button" class="asistan-link" data-giden-sil="${esc(g.yid)}">Sil</button></div></div></div>`
    + '<div class="asistan-cevrimdisi">◌ ATLAS şu an çevrimdışı, mesajın sırada. Bağlantı gelince işlenecek.</div>';
}
function yaziyorHtml(liste) {
  // Admin ajanı: çalışan kart ya da "Sıradayım" cevabı olan mesaj için "yazıyor / meşgul" notu gösterilmez (ilerleme kartta görünür)
  const ajanCevapli = new Set(liste.filter(m => m.yon === 'atlas' && (ajanCalisiyor(m) || veriOf(m).sirada)).map(m => numara(m.cevap_id)));
  const bekleyen = liste.filter(m => m.kullanici_id === store.ben.id && bekliyorMu(m) && !ajanCevapli.has(Number(m.id)));
  if (!bekleyen.length) return '';
  const enYasli = Math.max(...bekleyen.map(m => sessizlik(m, liste)));
  if (enYasli >= BEKLEME_MS) return `<div class="asistan-cevrimdisi">◌ ATLAS şu an meşgul ya da çevrimdışı, ${bekleyen.length > 1 ? 'mesajların' : 'mesajın'} sırada. Cevap gelince burada görünecek; bu pencereyi kapatabilirsin.</div>`;
  return '<div class="asistan-yaziyor"><span class="asistan-noktalar"><i></i><i></i><i></i></span>ATLAS yazıyor…</div>';
}
function bosHtml() {
  const rol = ANA_ROL[store.ben.rol] || 'masa';
  const kartlar = (ROLE_Q[rol] || ROLE_Q.masa).map(q => `<button type="button" class="asistan-ornek" data-soru="${esc(q)}"><span>${esc(q)}</span><span class="ok">›</span></button>`).join('');
  return `<div class="asistan-bos"><div class="asistan-bos-baslik">Merhaba ${esc(ilkAd(store.ben.ad_soyad))}, ne sormak istersin?</div>`
    + `<div class="asistan-bos-ipucu">${esc(ROL_IPUCU[rol] || '')}</div><div class="asistan-ornekler">${kartlar}</div></div>`;
}
function listeIcerik(liste) {
  const tum = tumMod();
  istekBaglamKur(liste);
  let html = '';
  for (const m of liste) {
    try { html += m.yon === 'atlas' ? atlasHtml(m, liste, tum) : kullaniciHtml(m, tum); }
    catch (e) { console.error('asistan mesajı çizilemedi', m, e); }
  }
  html += giden.map(gidenHtml).join('');
  html += yaziyorHtml(liste);
  return html || bosHtml();
}

// ---------------------------------------------------------------- çizim: üst, şerit, onay bloğu, çipler, liste
function ustCiz() {
  const y = panel.querySelector('[data-yetki]'); const rol = store.ben.rol;
  const yeni = `<i></i>${esc(ROL_ETIKET[rol] || ROL_AD[rol] || rol)}`;
  if (y.innerHTML !== yeni) y.innerHTML = yeni;
  y.classList.toggle('tam', yoneticiMi());
}
// yalnız Admin: tüm kullanıcıların konuşmalarını gör (işlev korunur; tasarımın dışında ince bir şerit)
function seritCiz() {
  const s = panel.querySelector('[data-serit]');
  let html = '';
  if (yoneticiMi()) {
    const kisi = new Set(store.asistan.filter(m => m.yon !== 'atlas' && m.kullanici_id && m.kullanici_id !== store.ben.id).map(m => m.kullanici_id)).size;
    html = `<div class="asistan-serit-satir"><button type="button" class="anahtar${hepsiMod ? ' acik' : ''}" data-hepsi role="switch" aria-checked="${hepsiMod}" aria-label="Tüm konuşmalar"></button>`
      + `<span class="asistan-serit-ad" data-hepsi>Tüm konuşmalar</span><span class="asistan-serit-say">${kisi ? `${kisi} kişi daha yazdı` : 'başka yazan yok'}</span></div>`;
  }
  if (s.innerHTML !== html) s.innerHTML = html;
}
// Admin: başkalarının onay bekleyen istekleri (varsayılan kapalı; Admin ekranındaki onay listesiyle aynı kayıtlar)
function onayCiz() {
  const k = panel.querySelector('[data-onay]');
  const bekleyen = yoneticiMi() ? store.istekler.filter(i => i.durum === 'onay_bekliyor').sort((a, b) => Number(a.id) - Number(b.id)) : [];
  if (!bekleyen.length) { k.innerHTML = ''; return; }
  const kaydir = k.querySelector('.asistan-onay-liste')?.scrollTop || 0;
  k.innerHTML = `<button type="button" class="asistan-onay-ust" data-onay-ac aria-expanded="${onayAcik}"><span>ONAY BEKLİYOR</span><span class="rozet-sayi">${bekleyen.length}</span><span class="son">${onayAcik ? 'Gizle' : 'Göster ›'}</span></button>`
    + (onayAcik ? `<div class="asistan-onay-liste">${bekleyen.map(i => `<div class="asistan-istek">`
      + `<div class="asistan-istek-ust"><b>${esc(i.isteyen_ad || 'Bir kullanıcı')}</b><span>${esc(fmt.saat(i.zaman))}</span>${riskRozet(i.risk)}</div>`
      + (i.metin ? `<div class="asistan-istek-metin">${esc(i.metin)}</div>` : '')
      + (i.plan ? `<div class="asistan-istek-plan">${esc(i.plan)}</div>` : '<div class="asistan-istek-plan">ATLAS henüz plan yazmadı.</div>')
      + karsiKararlar(i.id) + '</div>').join('')}</div>` : '');
  const l = k.querySelector('.asistan-onay-liste'); if (l) l.scrollTop = kaydir;
}
// tasarımdaki A.chipsFor: rol soruları + bağlam (son mesaja göre), son sorulan tekrarlanmaz, en çok 4
function cipleriBul(liste) {
  const rol = ANA_ROL[store.ben.rol] || 'masa';
  const temel = ROLE_Q[rol] || ROLE_Q.masa;
  const benim = liste.filter(m => m.yon !== 'atlas');
  const sonK = benim[benim.length - 1]; const sonA = liste[liste.length - 1];
  let ctx = [];
  if (sonA && sonA.yon === 'atlas' && sonA.tur === 'islendi') ctx = ['Başka gelişme bildir'];
  if (sonA && sonA.yon === 'atlas' && sonA.tur === 'cevap' && diziAl(veriOf(sonA).liste).length > 1) ctx = ['Geciken alım var mı?'];
  if (rol === 'sorumlu') ctx = ctx.concat(['Sıradaki durağım kim?']);
  return [...new Set(ctx.concat(temel).filter(q => !sonK || q !== sonK.metin))].slice(0, 4);
}
function cipCiz(liste) {
  const k = panel.querySelector('[data-cipler]');
  cipListe = cipleriBul(liste);
  const html = cipListe.map((c, i) => `<button type="button" class="asistan-cip" data-cip="${i}">${esc(c)}</button>`).join('');
  if (k.innerHTML !== html) k.innerHTML = html;
}
function cevrimdisiCiz() {
  const k = panel.querySelector('[data-cevrimdisi]');
  const yazi = !store.cevrimici || !navigator.onLine ? 'ATLAS şu an çevrimdışı, mesajın sırada.' : giden.length ? `${giden.length} mesaj sırada, gönderiliyor…` : '';
  const html = yazi ? `<div class="asistan-cevrimdisi-serit">${esc(yazi)}</div>` : '';
  if (k.innerHTML !== html) k.innerHTML = html;
}
function ciz({ alta = false } = {}) {
  if (!store.ben) { dugmeCiz(); return; }
  if (!panel || !acik) { dugmeCiz(); return; }
  ustCiz(); seritCiz(); onayCiz(); cevrimdisiCiz();
  const kap = panel.querySelector('[data-liste]');
  const alttaydi = kap.scrollHeight - kap.scrollTop - kap.clientHeight < 90;
  const liste = gorunen();
  const enSon = liste.reduce((a, m) => Math.max(a, Number(m.id)), 0);
  cipCiz(liste);
  veriBagimli = false;
  kap.innerHTML = listeIcerik(liste);
  if (alta || alttaydi || ilkCizim) { kap.scrollTop = kap.scrollHeight; yeniPill(false); }
  else if (enSon > sonCizilen) yeniPill(true);
  sonCizilen = Math.max(sonCizilen, enSon); ilkCizim = false;
  // "meşgul" notu için 60 sn sınırında yeniden çiz
  clearTimeout(zamanlayici); zamanlayici = null;
  const bekleyen = liste.filter(m => m.kullanici_id === store.ben.id && bekliyorMu(m));
  if (liste.some(ajanCalisiyor)) zamanlayici = setTimeout(() => planla(), 5000);   // çalışan kartın geçen süresi
  else if (bekleyen.length) { const kalan = BEKLEME_MS - Math.max(...bekleyen.map(m => sessizlik(m, liste))); if (kalan > 0) zamanlayici = setTimeout(() => planla(), kalan + 250); }
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
  bus.on('profil', () => { if (acik) planla(); });
  bus.on('hazir', () => { benId = null; benHazirla(); planla(); });
  // ui.js atlasSor() ve ekranlardaki "ATLAS'a yaz": paneli aç; detail doluysa o soruyu gönder (boşsa yalnız aç; "Ad: " gibi ise kutuya yaz)
  window.addEventListener('atlas-sor', e => ac(typeof e.detail === 'string' ? e.detail : ''));
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
.atlas-dugme { transition: transform .15s ease; -webkit-tap-highlight-color: transparent; }
.atlas-dugme:active { transform: scale(.95); }
.atlas-dugme .asistan-dugme-yazi { pointer-events: none; }
.atlas-dugme.asistan-nabiz { animation: asistan-nabiz 1.1s ease-out 3; }
@keyframes asistan-nabiz { 0% { box-shadow: 0 10px 28px rgba(200,16,46,.4), 0 0 0 4px rgba(200,16,46,.12), 0 0 0 0 rgba(200,16,46,.55); } 100% { box-shadow: 0 10px 28px rgba(200,16,46,.4), 0 0 0 4px rgba(200,16,46,.12), 0 0 0 18px rgba(200,16,46,0); } }
.atlas-dugme.asistan-bekliyor::before { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid transparent; border-top-color: var(--red); border-right-color: var(--red); animation: asistan-don 1s linear infinite; pointer-events: none; }
@keyframes asistan-don { to { transform: rotate(360deg); } }

/* panel: sağ 400 px (SM Atlas variant=panel), telefonda tam ekran (SM AtlasTel) */
.asistan-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 100vw; z-index: 85; display: none; flex-direction: column; background: var(--surface); color: var(--ink); font-family: 'Inter', sans-serif; border-left: 1px solid var(--line); box-shadow: var(--shadow-lg); box-sizing: border-box; }
.asistan-panel.acik { display: flex; animation: smIn .18s ease-out; }
.asistan-panel button { font-family: inherit; }
.asistan-ust { flex: none; display: flex; align-items: center; gap: 10px; padding: 14px 14px 12px; border-bottom: 1px solid var(--line); background: var(--surface); }
.asistan-logo { flex: none; width: 38px; height: 38px; border-radius: 99px; background: var(--red); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; letter-spacing: .06em; }
.asistan-ust-orta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.asistan-baslik { font-size: 15px; font-weight: 800; white-space: nowrap; }
.asistan-rol { align-self: flex-start; display: flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 5px; border: 1px solid var(--line-2); background: var(--surface-3); color: var(--ink-2); font-size: 11px; font-weight: 700; white-space: nowrap; }
.asistan-rol i { width: 6px; height: 6px; border-radius: 99px; background: var(--ink-3); }
.asistan-rol.tam { background: var(--ink); color: var(--surface); }
.asistan-rol.tam i { background: var(--red); }
.asistan-yeni-sohbet { flex: none; height: 34px; padding: 0 10px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink-2); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.asistan-kapat { flex: none; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 17px; cursor: pointer; }
.asistan-yeni-sohbet:hover, .asistan-kapat:hover { background: var(--hover); }

.asistan-serit:empty, .asistan-onay:empty, [data-cevrimdisi]:empty { display: none; }
.asistan-serit { flex: none; border-bottom: 1px solid var(--line); background: var(--surface); }
.asistan-serit-satir { display: flex; align-items: center; gap: 10px; padding: 7px 14px; font-size: 12px; font-weight: 600; color: var(--ink-2); }
.asistan-serit-satir .anahtar { width: 34px; height: 20px; }
.asistan-serit-satir .anahtar::after { width: 16px; height: 16px; }
.asistan-serit-satir .anahtar.acik::after { left: 16px; }
.asistan-serit-ad { cursor: pointer; user-select: none; font-weight: 700; }
.asistan-serit-say { margin-left: auto; color: var(--ink-3); }

.asistan-onay { flex: none; display: flex; flex-direction: column; max-height: 46%; border-bottom: 1px solid var(--line); background: var(--amber-soft); }
.asistan-onay-ust { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 14px; border: 0; background: transparent; font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--amber-ink); cursor: pointer; text-align: left; }
.asistan-onay-ust .rozet-sayi { background: var(--amber); color: #1a1200; letter-spacing: 0; }
.asistan-onay-ust .son { margin-left: auto; letter-spacing: 0; font-weight: 700; font-size: 12px; color: var(--ink-2); }
.asistan-onay-liste { overflow: auto; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; }
.asistan-istek { background: var(--surface); border: 1.5px dashed var(--amber); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.asistan-istek-ust { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.asistan-istek-ust b { color: var(--ink); font-weight: 800; font-size: 13px; }
.asistan-istek-metin { font-weight: 700; font-size: 13.5px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.asistan-istek-plan { font-size: 12px; line-height: 1.4; color: var(--ink-2); padding: 6px 9px; border-radius: 8px; background: var(--surface-2); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 120px; overflow: auto; }

/* sohbet alanı */
.asistan-govde { position: relative; flex: 1; min-height: 0; background: var(--surface-2); }
.asistan-liste { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 14px 14px 8px; display: flex; flex-direction: column; gap: 12px; }
.asistan-m { display: flex; flex-direction: column; gap: 4px; flex: none; min-width: 0; }
.asistan-m.parla > * { animation: asistan-parla 1.8s ease-out; }
@keyframes asistan-parla { 0%, 35% { box-shadow: 0 0 0 3px var(--red-line); } 100% { box-shadow: 0 0 0 0 transparent; } }

/* kullanıcı mesajı */
.asistan-k { align-self: flex-end; max-width: 84%; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.asistan-k-balon { background: var(--ink); color: var(--surface); border-radius: 14px 14px 4px 14px; padding: 9px 12px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.asistan-k-alt { font-size: 10.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.asistan-kim { font-size: 11px; font-weight: 800; color: var(--ink-3); margin-right: 4px; }
.asistan-k.baska .asistan-k-balon { background: var(--surface-3); color: var(--ink); border: 1px solid var(--line-2); }
.asistan-m.sirada .asistan-k-balon { opacity: .6; }
.asistan-hata-not { color: var(--amber-ink); font-weight: 700; }
.asistan-link { border: 0; background: none; padding: 0; font: inherit; font-weight: 800; color: var(--ink-2); text-decoration: underline; cursor: pointer; }

/* soru -> cevap */
.asistan-c { align-self: flex-start; max-width: 92%; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.asistan-c-govde { background: var(--surface); border: 1px solid var(--line); border-radius: 14px 14px 14px 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.asistan-c-metin { font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.asistan-c-alt { font-size: 10.5px; color: var(--ink-3); }
.asistan-liste-kutu { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.asistan-li { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 7px 10px; border: 0; border-bottom: 1px solid var(--line); background: var(--surface); cursor: pointer; text-align: left; color: var(--ink); width: 100%; }
.asistan-li:hover { background: var(--hover); }
.asistan-li-ad { font-size: 13px; font-weight: 700; }
.asistan-li-ok { color: var(--red); }
.asistan-li-alt { font-size: 11.5px; color: var(--ink-3); overflow-wrap: anywhere; }
.asistan-devam { font-size: 12px; color: var(--ink-3); border: 0; background: none; padding: 0; text-align: left; }
.asistan-devam.ac { cursor: pointer; font-weight: 600; }
.asistan-devam.ac:hover { color: var(--ink); text-decoration: underline; }
.asistan-tablo { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; font-size: 11.5px; }
.asistan-tablo-satir { display: grid; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--line); }
.asistan-tablo-satir.bas { border-top: 0; background: var(--surface-3); font-weight: 700; color: var(--ink-3); }
.asistan-tablo-satir > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* rozet tabanı (tasarımdaki B) */
.asistan-b { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; border: 1.5px solid transparent; font-variant-numeric: tabular-nums; }
.ap-bekliyor { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber); }
.ap-yapiliyor { background: var(--blue-soft); color: var(--blue); border-color: var(--blue-soft); }
.ap-yapildi { background: var(--green); color: #fff; border-color: var(--green); }
.ap-reddedildi { background: var(--karsi); color: var(--karsi-ink); border-color: var(--karsi); }
.ap-hata { background: var(--amber); color: #1a1200; border-color: var(--amber); }
.rk-dusuk { background: var(--green-soft); color: var(--green); border-color: var(--green-soft); }
.rk-orta { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber-soft); }
.rk-yuksek { background: var(--red-soft); color: var(--red); border-color: var(--red-soft); }

/* kart ortakları */
.asistan-kart-ust { display: flex; align-items: center; gap: 8px; }
.asistan-kart-zaman { margin-left: auto; font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.asistan-kart-alt { display: flex; align-items: center; gap: 8px; }

/* bilgi -> ATLAS İŞLEDİ */
.asistan-islendi { align-self: flex-start; width: 92%; box-sizing: border-box; background: var(--surface); border: 1.5px solid var(--ink); border-radius: 12px; padding: 11px 12px; display: flex; flex-direction: column; gap: 9px; }
.asistan-islendi.geri { opacity: .55; }
.asistan-pil { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; background: var(--ink); color: var(--surface); border-radius: 5px; padding: 3px 7px; white-space: nowrap; }
.asistan-islendi-not { font-size: 12.5px; color: var(--ink-2); line-height: 1.4; white-space: pre-wrap; }
.asistan-degler { display: flex; flex-direction: column; gap: 7px; }
.asistan-deg { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); min-width: 0; }
.asistan-deg-kim { font-size: 12px; font-weight: 800; overflow-wrap: anywhere; }
.asistan-deg-kim[data-kisi] { cursor: pointer; }
.asistan-deg-kim[data-kisi]:hover { text-decoration: underline; }
.asistan-deg-satir { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 12.5px; }
.asistan-deg-alan, .asistan-deg-ok { color: var(--ink-3); }
.asistan-deg-eski { color: var(--ink-3); text-decoration: line-through; }
.asistan-deg-eski.bos { text-decoration: none; font-style: italic; }
.asistan-deg-yeni { font-weight: 800; overflow-wrap: anywhere; }
.asistan-kaynak { font-size: 11.5px; color: var(--ink-2); min-width: 0; }
.asistan-kaynak[data-git] { cursor: pointer; }
.asistan-kaynak[data-git]:hover { text-decoration: underline; }
.asistan-geri { margin-left: auto; flex: none; height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 700; cursor: pointer; }
.asistan-geri:hover:not(:disabled) { background: var(--hover); }
.asistan-geri:disabled { opacity: .5; cursor: default; }
.asistan-geri-tamam { margin-left: auto; flex: none; font-size: 12px; font-weight: 700; color: var(--ink-3); }

/* iş talebi -> ONAYA GÖNDERİLDİ */
.asistan-onaya { align-self: flex-start; width: 92%; box-sizing: border-box; background: var(--surface); border: 1.5px dashed var(--amber); border-radius: 12px; padding: 11px 12px; display: flex; flex-direction: column; gap: 8px; }
.asistan-onaya-et { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--amber-ink); white-space: nowrap; }
.asistan-onaya-durum { margin-left: auto; }
.asistan-istek-kutu { font-size: 12px; color: var(--ink-2); line-height: 1.4; padding: 6px 9px; border-radius: 8px; background: var(--surface-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.asistan-onaya-alt { display: flex; gap: 10px; font-size: 11.5px; color: var(--ink-3); }
.asistan-onaya-alt .son { margin-left: auto; }

/* yönetici komutu -> PLAN */
.asistan-plan { align-self: flex-start; width: 92%; box-sizing: border-box; background: var(--surface); border: 1.5px solid var(--ink); border-radius: 12px; padding: 11px 12px; display: flex; flex-direction: column; gap: 9px; }
.asistan-plan-et { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; white-space: nowrap; }
.asistan-adimlar { display: flex; flex-direction: column; gap: 5px; }
.asistan-adim { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 6px; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.asistan-adim .n { font-weight: 800; color: var(--ink-3); }
.asistan-plan-ek { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 1.4; color: var(--ink-2); padding: 6px 9px; border-radius: 8px; background: var(--surface-2); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow: auto; }
.asistan-etki { font-size: 12px; color: var(--ink-2); }
.asistan-etki b { color: var(--ink); }
.asistan-plan-dugmeler { display: flex; gap: 8px; }
.asistan-uygula { flex: 1; height: 40px; border-radius: 9px; border: 0; background: var(--red); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; }
.asistan-uygula:hover:not(:disabled) { background: var(--red-d); }
.asistan-iptal { flex: none; height: 40px; padding: 0 14px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 700; cursor: pointer; }
.asistan-iptal:hover:not(:disabled) { background: var(--hover); }
.asistan-uygula:disabled, .asistan-iptal:disabled { opacity: .5; cursor: default; }
.asistan-plan-durum { font-size: 12.5px; font-weight: 700; color: var(--ink-2); }
.asistan-plan-durum:empty { display: none; }

/* YAPILDI */
.asistan-yapildi { align-self: flex-start; width: 92%; box-sizing: border-box; background: var(--green-soft); border: 1.5px solid var(--green); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
.asistan-yapildi-et { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--green); white-space: nowrap; }
.asistan-yapildi-metin { font-size: 13.5px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.asistan-hata { align-self: flex-start; width: 92%; box-sizing: border-box; background: var(--amber-soft); border: 1.5px solid var(--amber); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
.asistan-hata-et { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--amber-ink); white-space: nowrap; }

/* Admin ajanı çalışıyor (canlı adım + Durdur) */
.asistan-ajan { align-self: flex-start; width: 92%; box-sizing: border-box; background: var(--surface); border: 1.5px solid var(--blue); border-radius: 12px; padding: 11px 12px; display: flex; flex-direction: column; gap: 8px; }
.asistan-ajan-et { display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--blue); white-space: nowrap; }
.asistan-ajan-don { width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--blue-soft); border-top-color: var(--blue); animation: asistan-don .9s linear infinite; }
.asistan-ajan-adim { font-size: 12.5px; font-weight: 600; color: var(--ink); padding: 6px 9px; border-radius: 8px; background: var(--blue-soft); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.asistan-ajan-gecmis { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; color: var(--ink-3); overflow-wrap: anywhere; }
.asistan-ajan-gecmis span { font-variant-numeric: tabular-nums; margin-right: 6px; }
.asistan-dur { margin-left: auto; flex: none; height: 28px; padding: 0 11px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--red); font-size: 12px; font-weight: 800; cursor: pointer; }
.asistan-dur:hover:not(:disabled) { background: var(--red-soft); }
.asistan-dur:disabled { opacity: .55; cursor: default; }
.asistan-kod { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; padding: 1px 5px; border-radius: 5px; background: var(--surface-3); border: 1px solid var(--line); overflow-wrap: anywhere; }

/* bilgi notu, çevrimdışı, yazıyor */
.asistan-bilgi { align-self: flex-start; max-width: 92%; font-size: 12.5px; color: var(--ink-2); padding: 8px 11px; border-radius: 10px; border: 1px dashed var(--line-2); background: var(--surface); white-space: pre-wrap; overflow-wrap: anywhere; }
.asistan-cevrimdisi { align-self: flex-start; max-width: 92%; font-size: 12.5px; font-weight: 600; color: var(--amber-ink); padding: 8px 11px; border-radius: 10px; border: 1.5px solid var(--amber); background: var(--amber-soft); flex: none; }
.asistan-yaziyor { align-self: flex-start; flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); font-size: 12.5px; color: var(--ink-2); }
.asistan-noktalar { display: flex; gap: 3px; }
.asistan-noktalar i { width: 6px; height: 6px; border-radius: 99px; background: var(--ink-3); animation: smBlink 1s infinite; }
.asistan-noktalar i:nth-child(2) { animation-delay: .2s; }
.asistan-noktalar i:nth-child(3) { animation-delay: .4s; }

/* boş durum: role göre hazır soru kartları */
.asistan-bos { display: flex; flex-direction: column; gap: 10px; padding: 8px 2px; flex: none; }
.asistan-bos-baslik { font-size: 20px; font-weight: 900; letter-spacing: -.01em; line-height: 1.2; }
.asistan-bos-ipucu { font-size: 13px; color: var(--ink-2); line-height: 1.45; }
.asistan-ornekler { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.asistan-ornek { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 14.5px; font-weight: 700; text-align: left; cursor: pointer; box-shadow: var(--shadow); }
.asistan-ornek span:first-child { flex: 1; }
.asistan-ornek .ok { color: var(--red); font-size: 16px; }
.asistan-ornek:hover { border-color: var(--line-2); background: var(--hover); }

.asistan-yeni { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 2; height: 30px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--red); color: #fff; font-weight: 800; font-size: 12px; box-shadow: var(--shadow); cursor: pointer; }

/* alt blok: çevrimdışı şerit, çipler, yazı kutusu */
.asistan-alt-blok { flex: none; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--line); background: var(--surface); }
.asistan-cevrimdisi-serit { font-size: 12px; font-weight: 700; color: var(--amber-ink); background: var(--amber-soft); border: 1px solid var(--amber); border-radius: 8px; padding: 6px 10px; }
.asistan-cipler { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.asistan-cipler::-webkit-scrollbar { display: none; }
.asistan-cip { flex: none; height: 30px; padding: 0 11px; border-radius: 99px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.asistan-cip:hover { background: var(--hover); }
.asistan-form { display: flex; gap: 8px; align-items: flex-end; margin: 0; }
.asistan-form textarea { flex: 1; min-width: 0; box-sizing: border-box; resize: none; padding: 10px 12px; border-radius: 11px; border: 1.5px solid var(--line-2); background: var(--surface-2); color: var(--ink); font-size: 14px; line-height: 1.4; outline: none; max-height: 132px; font-family: inherit; }
.asistan-form textarea:focus { border-color: var(--red); }
.asistan-gonder { flex: none; height: 46px; padding: 0 14px; border-radius: 11px; border: 0; background: var(--red); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; }
.asistan-gonder:hover { background: var(--red-d); }

/* panel kapalıyken gelen cevabın balonu */
.asistan-onizleme { position: fixed; z-index: 81; width: min(320px, calc(100vw - 28px)); background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 14px 14px 4px 14px; box-shadow: var(--shadow); padding: 10px 14px; cursor: pointer; animation: smIn .22s ease-out; }
.asistan-onizleme-ust { font-size: 10.5px; font-weight: 900; letter-spacing: .1em; color: var(--red); margin-bottom: 3px; }
.asistan-onizleme-metin { font-size: 13px; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

@media (max-width: 760px) {
  .asistan-panel { width: 100vw; border-left: 0; box-shadow: none; }
  .asistan-ust { padding-top: calc(14px + env(safe-area-inset-top)); }
  .asistan-alt-blok { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
  .asistan-form textarea { font-size: 16px; }
  html.asistan-acik, html.asistan-acik body { overflow: hidden; }
}
@media (prefers-reduced-motion: reduce) {
  .asistan-panel.acik { animation: none; }
  .atlas-dugme.asistan-bekliyor::before, .asistan-noktalar i, .atlas-dugme.asistan-nabiz, .asistan-ajan-don { animation: none; }
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
