// 72. Komite · Seçim Masası · ARAÇ SORUMLUSU (telefon ekranı, ~390px) · Claude Design "SM Sorumlu" tasarımı (ATLAS, 2026-09-30)
// Sorumlu olduğu araçlar yatay sekmeler (plaka + şoför + durum). Seçili araçta şoför geri sayım şeridi (son adım + saat,
// kalan süre), yolcu kartları ve 3x2 durum düğmeleri (Arandı · Yolda · Aldık · Fuarda · Oy kullandı · Sorun).
// Araçsız ama sorumlusu ben olan kişiler "Bana atananlar" sekmesinde. Altta "ATLAS'a yaz" ve "Masayı ara".
// Mobil kabuk: alt sekme çubuğunu (Araçlarım · Bildirimler · Rapor) bu ekran kendisi çizer.
import {
  store, esc, fmt, trBaslik, dakika, gecikme, firmaListesi, firmaAdi, cikis, ROL_AD, GERI_SAYIM,
  okunmamisBildirim, kalanSure, aracKonum, firmaKonum, notEkle, firmaAlanYaz,
  karsiladim, referansBenMi, isaretleyebilirMi, oyBekliyor,
} from '../core.js';
import { toast, hataGoster, onayla, isaretle, kisiKartiAc } from '../ui.js';
import { anahtar, logoHtml } from '../komite.js';

// ---------------------------------------------------------------- sabitler
const ETA_ARALIK = 45000;   // kalan süre en çok 45 sn'de bir yenilenir
const TERCIH = anahtar('sorumlu-sekme');
const BANA = 'bana';
const siralayici = new Intl.Collator('tr', { sensitivity: 'base' });
const SORUN_ACIK = 'Sorun işaretlendi (araç sorumlusu)';
const SORUN_KAPALI = 'Sorun giderildi (araç sorumlusu)';

// Düğmeler: tasarımdaki sıra ve renkler
const DUGMELER = [
  { k: 'arandi', ad: 'Arandı', renk: 'var(--blue)', yazi: '#fff' },
  { k: 'yolda', ad: 'Yolda', renk: 'var(--amber)', yazi: '#fff' },
  { k: 'aldik', ad: 'Aldık', renk: 'var(--ink)', yazi: 'var(--surface)' },
  { k: 'fuarda', ad: 'Fuarda', renk: 'var(--violet)', yazi: '#fff' },
  { k: 'oy', ad: 'Oy kullandı', renk: 'var(--green)', yazi: '#fff' },
  { k: 'sorun', ad: 'Sorun', renk: 'var(--amber)', yazi: '#1a1200' },
];
const GUN = {
  bekliyor: { ad: 'Bekliyor', s: 'bekliyor' }, arandi: { ad: 'Arandı', s: 'arandi' }, yolda: { ad: 'Yolda', s: 'yolda' },
  fuarda: { ad: 'Fuarda', s: 'fuarda' }, oy_kullandi: { ad: 'Oy kullandı', s: 'oy' },
};

// ---------------------------------------------------------------- ikonlar
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IKON = {
  arac: svg('<path d="M5 17V6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5V17M5 12h14M3 17h18M7.5 20v-3M16.5 20v-3"/><path d="M8 14.5h.01M16 14.5h.01" stroke-width="3"/>'),
  zil: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  rapor: svg('<path d="M4 20V11M10 20V4M16 20v-8M21 20H3"/>'),
  cikis: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
};

// ---------------------------------------------------------------- durum
let kok = null, seciliSekme = null, mesgul = new Set();
const eta = { anahtar: '', dur: null, t: 0, yukleniyor: false };
const imza = new WeakMap();

const yonetimRolu = () => ['yonetici', 'kurul', 'masa'].includes(store.ben?.rol);
const kisaAd = ad => { const p = trBaslik(String(ad || '').trim()).split(/\s+/).filter(Boolean); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : (p[0] || '-'); };
const buyukIlk = s => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);

// ---------------------------------------------------------------- veri
function benimAraclarim() {
  const tum = [...store.araclar.values()].sort((a, b) => a.id - b.id);
  return yonetimRolu() ? tum : tum.filter(a => a.sorumlu_id === store.ben?.id);
}
const yolcuSira = (x, y) => (dakika(x.tasima_saati) ?? 9999) - (dakika(y.tasima_saati) ?? 9999)
  || (x.arac_sira ?? 999) - (y.arac_sira ?? 999) || (x.rota_sira ?? 999) - (y.rota_sira ?? 999)
  || siralayici.compare(firmaAdi(x), firmaAdi(y));
const aracYolculari = a => firmaListesi().filter(f => f.arac_id === a.id).sort(yolcuSira);
// Sorumlusu ben olan ve sekmelerdeki araçlarımın yolcusu olmayan kişiler
function banaAtananlar(araclar) {
  const kume = new Set(araclar.map(a => a.id));
  return firmaListesi().filter(f => f.sorumlu_id === store.ben?.id && !(f.arac_id && kume.has(f.arac_id))).sort(yolcuSira);
}

// "Aldık" izi: durum 'yolda' ve son "araca alındı" notu durum değişiminden sonra düşülmüş (saha.js ile aynı kural)
function aractaMi(f) {
  if (f.durum !== 'yolda' || !f.notlar) return false;
  const satirlar = String(f.notlar).split('\n').filter(s => /araca alındı\s*$/i.test(s));
  if (!satirlar.length) return false;
  const m = satirlar[satirlar.length - 1].match(/^\[(\d{1,2}):(\d{2})/);
  if (!m || !f.durum_zamani) return true;
  const d = new Date(f.durum_zamani);
  return Number(m[1]) * 60 + Number(m[2]) >= d.getHours() * 60 + d.getMinutes();
}
function sorunVar(f) {
  const s = String(f.notlar || '').split('\n');
  for (let i = s.length - 1; i >= 0; i--) {
    if (/Sorun giderildi/.test(s[i])) return false;
    if (/Sorun (işaretlendi|bildirildi)/.test(s[i])) return true;
  }
  return false;
}
function secili(f) {
  switch (f.durum) {
    case 'arandi': return 'arandi';
    case 'yolda': return aractaMi(f) ? 'aldik' : 'yolda';
    case 'fuarda': return 'fuarda';
    case 'oy_kullandi': return 'oy';
    default: return null;
  }
}
// Şoförün son geri sayım adımı (araca atanmış kişilerin en yenisi) ve şu an durağı olan kişi
function sonGeriSayim(ys) {
  const l = ys.filter(f => f.geri_sayim && f.geri_sayim_zamani).sort((a, b) => new Date(b.geri_sayim_zamani) - new Date(a.geri_sayim_zamani));
  return l[0] || null;
}
const durakKisi = ys => {
  const l = ys.filter(f => f.geri_sayim && f.geri_sayim !== 'birakti' && f.durum !== 'fuarda' && f.durum !== 'oy_kullandi').sort((a, b) => new Date(b.geri_sayim_zamani || 0) - new Date(a.geri_sayim_zamani || 0));
  return l[0] || null;
};

// ---------------------------------------------------------------- kalan süre (OSRM, trafiksiz)
async function etaYenile(a, hedefKisi) {
  if (!a || !hedefKisi || eta.yukleniyor) return;
  const bas = aracKonum(a), hedef = firmaKonum(hedefKisi);
  const anahtar = [a.id, hedefKisi.id, bas ? bas.lat.toFixed(3) : '-', bas ? bas.lon.toFixed(3) : '-'].join('|');
  if (eta.anahtar === anahtar && Date.now() - eta.t < ETA_ARALIK) return;
  eta.yukleniyor = true;
  let dur = null;
  try { if (bas && hedef) dur = await kalanSure(bas, hedef); } catch {}
  Object.assign(eta, { anahtar, dur, t: Date.now(), yukleniyor: false });
  if (kok) ciz();
}

// ---------------------------------------------------------------- çizim yardımcıları
function yerlestir(secici, html) {
  const e = kok?.querySelector(secici); if (!e || imza.get(e) === html) return;
  const top = e.scrollTop, sekmeler = e.querySelector('.sorumlu-sekmeler'), sol = sekmeler ? sekmeler.scrollLeft : 0;
  e.innerHTML = html; imza.set(e, html);
  e.scrollTop = top;
  const yeni = e.querySelector('.sorumlu-sekmeler'); if (yeni && sol) yeni.scrollLeft = sol;
}
function durumRozet(d) {
  return `<span class="sorumlu-st k-${esc(d || 'yok')}">${d === 'arizali' ? '✕ ' : ''}${esc({ hazir: 'Hazır', yolda: 'Yolda', fuarda: 'Fuarda', mola: 'Mola', arizali: 'Arızalı' }[d] || 'Durum yok')}</span>`;
}
function plakaKutu(p) {
  return `<span class="sorumlu-plaka"><i></i><b>${esc(fmt.plaka(p))}</b></span>`;
}

function sekmelerHtml(araclar, bana) {
  const arac = araclar.map(a => {
    const on = seciliSekme === String(a.id);
    return `<button type="button" class="sorumlu-sekme${on ? ' aktif' : ''}" data-sekme="${a.id}" aria-pressed="${on}">
      ${plakaKutu(a.plaka)}
      <span class="sorumlu-sekme-alt"><span class="sorumlu-sekme-sofor">${esc(kisaAd(a.sofor_ad))}</span>${durumRozet(a.durum)}</span>
    </button>`;
  });
  if (bana.length) {
    const on = seciliSekme === BANA; const bek = bana.filter(f => f.durum !== 'oy_kullandi').length;
    arac.push(`<button type="button" class="sorumlu-sekme${on ? ' aktif' : ''}" data-sekme="${BANA}" aria-pressed="${on}">
      <span class="sorumlu-bana-et">BANA ATANANLAR</span>
      <span class="sorumlu-sekme-alt"><span class="sorumlu-sekme-sofor">${bana.length} kişi</span><span class="sorumlu-st k-bana">${bek} bekliyor</span></span>
    </button>`);
  }
  return arac.join('');
}

function ustHtml(araclar, bana) {
  const rol = ROL_AD[store.ben.rol] || store.ben.rol;
  const n = araclar.length;
  return `
    <div class="sorumlu-marka">
      <div class="sorumlu-logo">${logoHtml('i')}</div>
      <div class="sorumlu-canli ${store.cevrimici ? (store.canli ? 'ok' : 'bag') : 'yok'}"><i></i>${!store.cevrimici ? `Çevrimdışı${store.kuyruk.length ? ` · ${store.kuyruk.length} sırada` : ''}` : store.canli ? 'Canlı' : 'Bağlanıyor…'}</div>
      <button type="button" class="sorumlu-cikis" data-cikis aria-label="Çıkış">${IKON.cikis}</button>
    </div>
    <div class="sorumlu-kim"><div class="sorumlu-ad">${esc(store.ben.ad_soyad)}</div><div class="sorumlu-rol">${esc(rol)} · ${n} araç</div></div>
    <div class="sorumlu-sekmeler">${sekmelerHtml(araclar, bana)}</div>`;
}

// şerit: şoför geri sayımı (araç) ya da sorumlu kişiler özeti (bana atananlar)
function seritHtml(a, ys) {
  if (!a) return `
    <div class="sorumlu-serit">
      <div class="sorumlu-serit-sol"><div class="sorumlu-serit-et">ARAÇSIZ KİŞİLER · SEN SORUMLUSUN</div><div class="sorumlu-serit-ana">${ys.length} kişi</div></div>
      <div class="sorumlu-serit-sag"><div class="sorumlu-serit-ana">${ys.filter(f => f.durum !== 'oy_kullandi').length} bekliyor</div><div class="sorumlu-serit-alt">${ys.filter(f => f.durum === 'oy_kullandi').length} oy kullandı</div></div>
    </div>`;
  const son = sonGeriSayim(ys);
  const adim = son ? GERI_SAYIM.find(g => g.k === son.geri_sayim) : null;
  const cd = adim ? `${buyukIlk(adim.ad.toLocaleLowerCase('tr'))} · ${fmt.saat(son.geri_sayim_zamani)}` : 'Henüz geri sayım yok';
  const kap = Number(a.kapasite) || 0; const dolu = ys.filter(f => secili(f) === 'aldik').length;
  const d = eta.anahtar && eta.dur ? eta.dur : null;
  const etaYazi = d ? `~${d.dk} dk · ${String(d.km).replace('.', ',')} km` : '-';
  return `
    <div class="sorumlu-serit">
      <div class="sorumlu-serit-sol"><div class="sorumlu-serit-et">ŞOFÖR · ${esc(trBaslik(String(a.sofor_ad || '').trim()) || '-')}</div><div class="sorumlu-serit-ana">${esc(cd)}</div></div>
      <div class="sorumlu-serit-sag"><div class="sorumlu-serit-ana num">${esc(etaYazi)}</div><div class="sorumlu-serit-alt">${dolu}${kap ? `/${kap}` : ''} yolcu araçta</div></div>
    </div>`;
}

// Karşılama: referans (kişiyi tanıyan yönetim kurulu üyesi) ya da başkası karşılar; kim karşıladıysa o yazılır
function karsilamaHtml(f) {
  if (f.karsilayan) {
    const z = f.karsilama_zamani ? ` · ${fmt.saat(f.karsilama_zamani)}` : '';
    return `<div class="sorumlu-karsi"><span>Karşılayan: <b>${esc(trBaslik(f.karsilayan))}</b>${esc(z)}</span></div>`;
  }
  if (!['yolda', 'fuarda'].includes(f.durum) || !isaretleyebilirMi(f)) return '';
  const ben = referansBenMi(f);
  return `<div class="sorumlu-karsi yok"><span>Henüz karşılanmadı${!ben && f.referans ? ` · referans: ${esc(trBaslik(f.referans))}` : ''}</span><button type="button" class="sorumlu-karsila" data-karsila="${f.id}">${ben ? 'Karşıladım' : 'Ben karşıladım'}</button></div>`;
}

function kartHtml(f, cdKisi) {
  const g = gecikme(f); const sec = secili(f); const sorun = sorunVar(f); const cdMi = cdKisi && cdKisi.id === f.id;
  const gun = GUN[f.durum] || GUN.bekliyor;
  const saat = fmt.saatKisa(f.tasima_saati) || 'Saat ?';
  const tel = f.cep || f.cep2; const link = tel ? fmt.telLink(tel) : '';
  const alt = [f.unvan ? esc(f.unvan) : '', f.ilce ? esc(trBaslik(f.ilce)) : ''].filter(Boolean).join(' · ');
  const telHtml = tel ? (link ? `<a href="${esc(link)}" class="sorumlu-tel">${esc(fmt.tel(tel))}</a>` : esc(String(tel))) : '';
  const btn = DUGMELER.map(b => {
    const on = b.k === 'sorun' ? sorun : b.k === sec;
    return `<button type="button" class="sorumlu-dugme${on ? ' secili' : ''} d-${b.k}" data-isaret="${b.k}" data-id="${f.id}" aria-pressed="${on}" style="--c:${b.renk};--y:${b.yazi}">${esc(b.ad)}</button>`;
  }).join('');
  return `
  <article class="sorumlu-kart${sorun ? ' sorun' : ''}${cdMi ? ' cd' : ''}${f.durum === 'fuarda' ? ' fuarda' : ''}">
    <div class="sorumlu-kart-ust">
      <div class="sorumlu-saat">${esc(saat)}</div>
      ${g ? `<span class="sorumlu-gecikti" title="${g} dk gecikti">◷ GECİKTİ</span>` : ''}
      ${cdMi ? '<span class="sorumlu-cd">● şoför yolda</span>' : ''}
      <div class="sorumlu-kart-sag">${oyBekliyor(f) ? `<span class="sorumlu-gun g-oy-bekliyor">Oy bildirildi · onay</span>` : `<span class="sorumlu-gun g-${gun.s}">${f.durum === 'oy_kullandi' ? '✓ ' : ''}${esc(gun.ad)}</span>`}</div>
    </div>
    <div class="sorumlu-kimlik" data-kisi="${f.id}">
      <div class="sorumlu-kisi">${esc(firmaAdi(f))}</div>
      <div class="sorumlu-firma">${alt}${telHtml ? `${alt ? ' · ' : ''}${telHtml}` : ''}</div>
    </div>
    ${karsilamaHtml(f)}
    <div class="sorumlu-izgara">${btn}</div>
  </article>`;
}

function govdeHtml(a, ys) {
  const bekleyen = ys.filter(f => f.durum !== 'oy_kullandi');
  const oy = ys.length - bekleyen.length;
  if (!bekleyen.length) return `
    <div class="sorumlu-bos">${ys.length ? `Bu araçta bekleyen yolcu yok.<small>${oy} kişi oy kullandı.</small>` : (a ? 'Bu araca henüz yolcu atanmadı.' : 'Sana atanmış araçsız kişi yok.')}</div>`;
  const cd = a ? durakKisi(ys) : null;
  return bekleyen.map(f => kartHtml(f, cd)).join('') + (oy ? `<div class="sorumlu-oy-not">${oy} kişi oy kullandı</div>` : '');
}

function bosEkranHtml() {
  return `
  <div class="sorumlu-bos-ekran">
    <div class="sorumlu-bos-ikon">${IKON.arac}</div>
    <h2>Sana henüz araç atanmadı</h2>
    <p>Masa ekibi sana bir araç ya da yolcu atadığında burada kendiliğinden belirir. Sayfayı kapatmana gerek yok.</p>
  </div>`;
}

function altHtml() {
  const tel = store.ayarlar?.secim?.masa_tel; const link = tel ? fmt.telLink(tel) : '';
  return `
    <button type="button" class="sorumlu-atlas${link ? '' : ' tek'}" data-atlas>ATLAS'a yaz</button>
    ${link ? `<a class="sorumlu-ara" href="${esc(link)}">📞 Masayı ara</a>` : ''}`;
}
function sekmeCubuguHtml() {
  const n = okunmamisBildirim();
  return `
    <a href="#sorumlu" class="aktif" aria-current="page" data-yukari>${IKON.arac}<span>Araçlarım</span></a>
    <a href="#bildirimler">${IKON.zil}<span>Bildirimler</span>${n ? `<b class="sorumlu-rozet">${n > 99 ? '99+' : n}</b>` : ''}</a>
    <a href="#rapor">${IKON.rapor}<span>Rapor</span></a>`;
}

// ---------------------------------------------------------------- çizim
function sekmeSec(araclar, bana) {
  const gecerli = k => (k === BANA ? bana.length > 0 : araclar.some(a => String(a.id) === k));
  if (seciliSekme && gecerli(seciliSekme)) return;
  let k = null;
  try { k = localStorage.getItem(`${TERCIH}-${store.ben?.id}`); } catch {}
  seciliSekme = k && gecerli(k) ? k : araclar.length ? String(araclar[0].id) : bana.length ? BANA : null;
}
function ciz() {
  if (!kok || !store.ben) return;
  const araclar = benimAraclarim(); const bana = banaAtananlar(araclar);
  sekmeSec(araclar, bana);
  const bos = !araclar.length && !bana.length;
  kok.querySelector('.sorumlu')?.classList.toggle('bos', bos);
  yerlestir('[data-ust]', ustHtml(araclar, bana));
  yerlestir('[data-alt]', altHtml());
  yerlestir('[data-sekmeler]', sekmeCubuguHtml());
  if (bos) { yerlestir('[data-serit]', ''); yerlestir('[data-govde]', bosEkranHtml()); return; }
  const a = seciliSekme === BANA ? null : store.araclar.get(Number(seciliSekme));
  const ys = a ? aracYolculari(a) : bana;
  yerlestir('[data-serit]', seritHtml(a, ys));
  yerlestir('[data-govde]', govdeHtml(a, ys));
  if (a) { const d = durakKisi(ys) || ys.find(f => f.durum !== 'oy_kullandi' && f.durum !== 'fuarda'); etaYenile(a, d); }
}

// ---------------------------------------------------------------- eylemler
async function isaretEylem(id, k) {
  const f = store.firmalar.get(id); if (!f) return;
  const anahtar = `${id}:${k}`; if (mesgul.has(id)) return;
  if (k === 'sorun') return sorunDegistir(f);
  const su = secili(f);
  if (su === k) return toast(`Zaten "${DUGMELER.find(b => b.k === k).ad}"`);
  if (k === 'yolda' && su === 'aldik') return toast('Araca alındı olarak işaretli. Yanlışsa Geri al ile düzelt.');
  mesgul.add(id);
  try {
    if (k === 'arandi') await isaretle(id, 'arandi', { kendi: false });
    else if (k === 'yolda') await isaretle(id, 'yolda', { kendi: false });
    else if (k === 'fuarda') await isaretle(id, 'fuarda', { kendi: false });
    else if (k === 'oy') await isaretle(id, 'oy_kullandi', { kendi: false });
    else if (k === 'aldik') {
      if (f.durum !== 'yolda') await isaretle(id, 'yolda', { kendi: false });
      // isaretle işaretlemeyi başarıyla yaptıysa (2 oylu sorusu, yetki) "araca alındı" izini bırak
      if (store.firmalar.get(id)?.durum === 'yolda') await notEkle(id, 'araca alındı');
    }
  } catch (e) { hataGoster(e); } finally { mesgul.delete(id); void anahtar; }
}
async function sorunDegistir(f) {
  const eskiNotlar = f.notlar ?? null; const acik = sorunVar(f);
  mesgul.add(f.id);
  try {
    await notEkle(f.id, acik ? SORUN_KAPALI : SORUN_ACIK);
    toast(`${firmaAdi(f)} · ${acik ? 'sorun giderildi' : 'sorun işaretlendi'}`, { geriAl: () => firmaAlanYaz(f.id, { notlar: eskiNotlar }) });
  } catch (e) { hataGoster(e); } finally { mesgul.delete(f.id); }
}
async function karsilaEylem(id, dugme) {
  const f = store.firmalar.get(id); if (!f || f.karsilayan || mesgul.has(id)) return;
  mesgul.add(id); if (dugme) dugme.disabled = true;
  try { const geriAl = await karsiladim(id); toast(`${firmaAdi(f)} · ${trBaslik(store.ben?.ad_soyad || '')} karşıladı`, { geriAl }); }
  catch (e) { if (dugme) dugme.disabled = false; hataGoster(e); } finally { mesgul.delete(id); }
}
function atlasAc() {
  window.dispatchEvent(new CustomEvent('atlas-sor', { detail: '' }));
  // asistan modülü olayı dinlemiyorsa pencereyi doğrudan aç
  if (!document.documentElement.classList.contains('asistan-acik')) import('../asistan.js').then(m => m.default.ac?.('')).catch(() => {});
}
async function cikisSor() {
  if (!await onayla('Çıkış yapılsın mı? Tekrar girmek için PIN gerekir.', { evet: 'Çıkış yap', tehlike: true })) return;
  cikis();
}
function sekmeGec(k) {
  seciliSekme = k; eta.anahtar = ''; eta.dur = null;
  try { localStorage.setItem(`${TERCIH}-${store.ben?.id}`, k); } catch {}
  ciz();
  kok?.querySelector('[data-govde]')?.scrollTo({ top: 0 });
  kok?.querySelector('.sorumlu-sekme.aktif')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function tikla(e) {
  const h = e.target.closest('[data-isaret],[data-sekme],[data-karsila],[data-kisi],[data-atlas],[data-cikis],[data-yukari]');
  if (!h || !kok?.contains(h)) return;
  const d = h.dataset;
  if (d.isaret) return isaretEylem(Number(d.id), d.isaret);
  if (d.sekme) return sekmeGec(d.sekme);
  if (d.karsila) return karsilaEylem(Number(d.karsila), h);
  if (d.kisi) { e.preventDefault(); return kisiKartiAc(Number(d.kisi)); }
  if ('atlas' in d) return atlasAc();
  if ('cikis' in d) return cikisSor();
  if ('yukari' in d) { e.preventDefault(); kok.querySelector('[data-govde]')?.scrollTo({ top: 0, behavior: 'smooth' }); }
}

// ================================================================ modül
export default {
  async render(k, param) {
    this.temizle();
    kok = k; stilEkle(); document.body.classList.add('sorumlu-acik');
    seciliSekme = param && (param === BANA || store.araclar.has(Number(param))) ? String(param) : null;
    eta.anahtar = ''; eta.dur = null; eta.yukleniyor = false; mesgul = new Set();
    kok.innerHTML = `
    <div class="sorumlu">
      <header class="sorumlu-ust" data-ust></header>
      <div class="sorumlu-serit-kap" data-serit></div>
      <div class="sorumlu-govde" data-govde></div>
      <div class="sorumlu-alt" data-alt></div>
      <nav class="alt-sekme sorumlu-sekmeler-alt" data-sekmeler aria-label="Sekmeler"></nav>
    </div>`;
    kok.addEventListener('click', tikla);
    ciz();
  },
  yenile() { ciz(); },
  temizle() {
    document.body.classList.remove('sorumlu-acik');
    if (kok) kok.removeEventListener('click', tikla);
    kok = null; mesgul.clear();
  },
};

// ================================================================ stil (Claude Design "SM Sorumlu")
function stilEkle() {
  if (document.head.querySelector('style[data-ekran="sorumlu"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'sorumlu';
  s.textContent = `
body.sorumlu-acik{background:var(--bg);overflow:hidden}
body.sorumlu-acik .mobil-kabuk{padding-bottom:0;min-height:0;max-width:520px}
body.sorumlu-acik #toastlar{bottom:calc(150px + env(safe-area-inset-bottom))}
body.sorumlu-acik:has(.alt-sekme) #toastlar{bottom:calc(150px + env(safe-area-inset-bottom))}
body.sorumlu-acik .atlas-dugme{display:none!important}
.sorumlu{height:100vh;height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font-family:var(--font);-webkit-tap-highlight-color:transparent}
.sorumlu svg{display:block}
.sorumlu button{font-family:inherit}
.sorumlu-ust{flex:none;padding:calc(14px + env(safe-area-inset-top)) 14px 0;background:var(--surface);border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.sorumlu-marka{display:flex;align-items:center;gap:8px;min-height:20px}
.sorumlu-logo{font-size:12px;font-weight:900;white-space:nowrap}
.sorumlu-logo i{font-style:normal;color:var(--red)}
.sorumlu-canli{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--green);white-space:nowrap}
.sorumlu-canli i{width:7px;height:7px;border-radius:99px;background:var(--green)}
.sorumlu-canli.bag,.sorumlu-canli.yok{color:var(--amber-ink)}
.sorumlu-canli.bag i,.sorumlu-canli.yok i{background:var(--amber);animation:smBlink 1.2s infinite}
.sorumlu-cikis{width:36px;height:36px;margin:-8px -8px -8px 0;border:0;border-radius:10px;background:transparent;color:var(--ink-3);display:grid;place-items:center;cursor:pointer;touch-action:manipulation}
.sorumlu-cikis:active{background:var(--surface-3)}
.sorumlu-cikis svg{width:18px;height:18px}
.sorumlu-kim{display:flex;flex-direction:column;gap:1px}
.sorumlu-ad{font-size:22px;font-weight:900;letter-spacing:-.02em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sorumlu-rol{font-size:12.5px;color:var(--ink-2);white-space:nowrap}
.sorumlu-sekmeler{flex:none;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;margin:0 -14px;padding:2px 14px 10px;scrollbar-width:none}
.sorumlu-sekmeler::-webkit-scrollbar{display:none}
.sorumlu-sekmeler:empty{display:none}
.sorumlu-sekme{flex:none;width:150px;min-height:64px;box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:8px 9px;border-radius:11px;cursor:pointer;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);text-align:left;touch-action:manipulation}
.sorumlu-sekme.aktif{background:var(--red-soft);border:2px solid var(--red);padding:7px 8px}
.sorumlu-plaka{display:inline-flex;align-items:stretch;height:20px;border:1.2px solid #111;border-radius:3px;background:#fff;overflow:hidden}
.sorumlu-plaka i{width:6px;background:#1F4FA8}
.sorumlu-plaka b{padding:0 5px;display:flex;align-items:center;font-size:11px;font-weight:800;color:#111;white-space:nowrap;font-variant-numeric:tabular-nums}
.sorumlu-bana-et{display:flex;align-items:center;height:20px;font-size:11px;font-weight:900;letter-spacing:.08em;color:var(--red);white-space:nowrap}
.sorumlu-sekme-alt{display:flex;align-items:center;gap:5px;width:100%;min-width:0}
.sorumlu-sekme-sofor{font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.sorumlu-st{margin-left:auto;flex:none;display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;font-size:10px;font-weight:700;letter-spacing:.03em;white-space:nowrap;line-height:1}
.sorumlu-st.k-hazir{background:var(--green-soft);color:var(--green)}
.sorumlu-st.k-yolda,.sorumlu-st.k-bana{background:var(--amber-soft);color:var(--amber-ink)}
.sorumlu-st.k-fuarda{background:var(--violet-soft);color:var(--violet)}
.sorumlu-st.k-mola,.sorumlu-st.k-yok{background:var(--gray-soft);color:var(--ink-2)}
.sorumlu-st.k-arizali{background:var(--amber);color:#1a1200}

.sorumlu-serit-kap{flex:none;padding:10px 12px 0}
.sorumlu-serit-kap:empty{display:none}
.sorumlu-serit{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--ink);color:var(--surface)}
.sorumlu-serit-sol{display:flex;flex-direction:column;gap:2px;min-width:0}
.sorumlu-serit-et{font-size:10.5px;font-weight:800;letter-spacing:.1em;opacity:.7;white-space:nowrap}
.sorumlu-serit-ana{font-size:16px;font-weight:900;white-space:nowrap}
.sorumlu-serit-ana.num{font-variant-numeric:tabular-nums}
.sorumlu-serit-sag{margin-left:auto;text-align:right;line-height:1.2;flex:none}
.sorumlu-serit-alt{font-size:11px;opacity:.7;white-space:nowrap}

.sorumlu-govde{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 12px 14px;display:flex;flex-direction:column;gap:10px}
.sorumlu-kart{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow);flex:none}
.sorumlu-kart.cd{border:2px solid var(--red);padding:11px}
.sorumlu-kart.sorun{border:2px solid var(--amber);padding:11px}
.sorumlu-kart.fuarda{opacity:.6}
.sorumlu-kart-ust{display:flex;align-items:center;gap:8px}
.sorumlu-saat{font-size:22px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sorumlu-kart-sag{margin-left:auto}
.sorumlu-gecikti{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;background:var(--amber-soft);color:var(--amber-ink);border:1.5px solid var(--amber);font-size:11px;font-weight:700;letter-spacing:.03em;white-space:nowrap;box-sizing:border-box;line-height:1;animation:smPulse 1.6s ease-in-out infinite}
.sorumlu-cd{font-size:11px;font-weight:800;color:var(--red);white-space:nowrap}
.sorumlu-gun{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.03em;white-space:nowrap;box-sizing:border-box;line-height:1}
.sorumlu-gun.g-bekliyor{background:var(--gray-soft);color:var(--ink-2)}
.sorumlu-gun.g-oy-bekliyor{background:var(--amber-soft);color:var(--amber-ink)}
.sorumlu-gun.g-arandi{background:var(--blue-soft);color:var(--blue)}
.sorumlu-gun.g-yolda{background:var(--amber-soft);color:var(--amber-ink)}
.sorumlu-gun.g-fuarda{background:var(--violet-soft);color:var(--violet)}
.sorumlu-gun.g-oy{background:var(--green);color:#fff}
.sorumlu-kimlik{display:flex;flex-direction:column;gap:2px;cursor:pointer}
.sorumlu-kisi{font-size:18px;font-weight:800;line-height:1.2}
.sorumlu-firma{font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sorumlu-tel{color:var(--ink-2);text-decoration:none;font-variant-numeric:tabular-nums}
.sorumlu-karsi{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 10px;border-radius:9px;background:var(--violet-soft);color:var(--violet);font-size:12px;font-weight:700}
.sorumlu-karsi b{font-weight:800}
.sorumlu-karsi.yok{background:var(--surface-2);color:var(--ink-2);border:1px dashed var(--line-2);padding:4px 4px 4px 10px}
.sorumlu-karsi.yok span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sorumlu-karsila{flex:none;height:32px;padding:0 12px;border-radius:8px;border:0;background:var(--red);color:var(--on-red,#fff);font-size:12.5px;font-weight:800;cursor:pointer;touch-action:manipulation}
.sorumlu-karsila:disabled{opacity:.5}
.sorumlu-izgara{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.sorumlu-dugme{height:52px;border-radius:11px;cursor:pointer;font-size:14px;font-weight:800;padding:0 2px;background:var(--surface);color:var(--ink);border:1.5px solid var(--line-2);touch-action:manipulation;transition:transform .06s}
.sorumlu-dugme:active{transform:scale(.97)}
.sorumlu-dugme.d-sorun{color:var(--amber-ink);border-color:var(--amber)}
.sorumlu-dugme.secili{background:var(--c);color:var(--y);border-color:var(--c)}
.sorumlu-oy-not{text-align:center;font-size:12.5px;font-weight:600;color:var(--ink-3);padding:2px 0}
.sorumlu-bos{padding:30px;text-align:center;font-size:14px;color:var(--ink-3)}
.sorumlu-bos small{display:block;margin-top:4px;font-size:12.5px}
.sorumlu-bos-ekran{text-align:center;padding:64px 20px}
.sorumlu-bos-ikon{width:76px;height:76px;border-radius:50%;background:var(--surface-3);color:var(--ink-3);display:grid;place-items:center;margin:0 auto 16px}
.sorumlu-bos-ikon svg{width:36px;height:36px}
.sorumlu-bos-ekran h2{margin:0 0 6px;font-size:20px;font-weight:900;letter-spacing:-.01em}
.sorumlu-bos-ekran p{margin:0 auto;max-width:310px;font-size:15px;color:var(--ink-3);line-height:1.45}

.sorumlu-alt{flex:none;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 12px;background:var(--surface);border-top:1px solid var(--line)}
.sorumlu-alt:empty{display:none}
.sorumlu-atlas{height:50px;border-radius:12px;border:0;background:var(--marka);color:#fff;font-size:15px;font-weight:800;cursor:pointer;touch-action:manipulation}
.sorumlu-atlas.tek{grid-column:span 2}
.sorumlu-ara{height:50px;border-radius:12px;border:1.5px solid var(--line-2);color:var(--ink);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;text-decoration:none;touch-action:manipulation}
.sorumlu.bos .sorumlu-alt{display:grid}

/* alt sekme çubuğu: Araçlarım · Bildirimler · Rapor */
.alt-sekme.sorumlu-sekmeler-alt{position:static;flex:none;display:grid;grid-template-columns:repeat(3,1fr);gap:0;justify-content:normal;padding:6px 10px calc(6px + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--line)}
.sorumlu-sekmeler-alt a{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:50px;padding:0;border-radius:12px;font-size:11.5px;font-weight:700;color:var(--ink-3);touch-action:manipulation;text-decoration:none}
.sorumlu-sekmeler-alt a:active{background:var(--surface-3)}
.sorumlu-sekmeler-alt a.aktif{color:var(--red)}
.sorumlu-sekmeler-alt svg{width:22px;height:22px}
.sorumlu-rozet{position:absolute;top:0;left:calc(50% + 4px);min-width:20px;height:20px;box-sizing:border-box;padding:0 5px;border-radius:99px;background:var(--amber);color:#1a1200;border:2px solid var(--surface);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;line-height:1}
@media (prefers-reduced-motion: reduce){.sorumlu-gecikti,.sorumlu-canli i{animation:none!important}.sorumlu-dugme:active{transform:none}}
`;
  document.head.appendChild(s);
}
