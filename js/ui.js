// 72. Komite · Seçim Masası · ORTAK ARAYÜZ BİLEŞENLERİ (ATLAS, 2026-09-30)
// Rozetler, toast + geri al, çekmece, modal, onay kutusu, Cmd+K hızlı arama ve KİŞİ KARTI (her ekrandan açılır).
import {
  store, bus, esc, fmt, trBaslik, DURUMLAR, DURUM_AD, SINIFLAR, SINIF_AD, ARAC_DURUM_AD, gecikme, kisiGrubu, ulasim, aracOf,
  durumYap, sinifYap, notEkle, aracAta, yazabilirMi, aramaEslesir, firmaListesi, firmaAdi, kaynakMetni, olayMetni,
} from './core.js';

// ---------------------------------------------------------------- küçük yardımcılar
export const $ = (s, k = document) => k.querySelector(s);
export const $$ = (s, k = document) => [...k.querySelectorAll(s)];
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const bas = s => (String(s || '').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2)).toLocaleUpperCase('tr');

// ---------------------------------------------------------------- rozetler
export const rozetSinif = s => `<span class="rozet s-${esc(s)}">${esc(SINIF_AD[s] || s)}</span>`;
export const rozetDurum = f => f.kendi_geldi && f.durum === 'oy_kullandi'
  ? `<span class="rozet d-oy_kullandi">Kendi geldi · oy</span>`
  : `<span class="rozet d-${esc(f.durum)}">${esc(DURUM_AD[f.durum] || f.durum)}</span>`;
export const rozetAracDurum = d => `<span class="rozet a-${esc(d)}">${esc(ARAC_DURUM_AD[d] || d)}</span>`;
export const plakaHtml = (p, buyuk = false) => p ? `<span class="plaka${buyuk ? ' buyuk' : ''}"><span>${esc(fmt.plaka(p))}</span></span>` : '';
export function uyariRozetleri(f, { hepsi = true } = {}) {
  const r = [];
  const g = gecikme(f); if (g) r.push(`<span class="rozet u-gecikti" title="Saati geçti">${g} dk gecikti</span>`);
  if (f.evrak_uyari) r.push(`<span class="rozet u-evrak" title="${esc(f.evrak_uyari)}">Evrak</span>`);
  if (f.kisi_oy_sayisi > 1) r.push(`<span class="rozet u-2oy" title="Aynı kişi ${f.kisi_oy_sayisi} firmayla oy kullanıyor">${f.kisi_oy_sayisi} OY</span>`);
  if (hepsi && f.toplulukta) r.push(`<span class="rozet u-topluluk" title="WhatsApp topluluğunda">Toplulukta</span>`);
  if (hepsi) { const u = ulasim(f); r.push(u === 'servis' ? `<span class="rozet u-servis">Servis${f.tasima_saati ? ' ' + fmt.saatKisa(f.tasima_saati) : ''}</span>` : u === 'kendi' ? `<span class="rozet u-kendi">Kendi gelecek</span>` : (f.oy_sinifi === 'bizde' ? `<span class="rozet u-ulasimyok">Ulaşım yok</span>` : '')); }
  return r.join(' ');
}
export function halka(yuzde, etiket) { return `<div class="halka" style="--p:${Math.max(0, Math.min(100, yuzde))}" data-deger="${esc(etiket ?? yuzde + '%')}"></div>`; }
export function cubuk(yuzde, sinif = '') { return `<div class="cubuk ${sinif}"><i style="width:${Math.max(0, Math.min(100, yuzde))}%"></i></div>`; }
export function kaynakCip(o) {
  const atlas = o.kaynak === 'asistan';
  return `<span class="kaynak-cip${atlas ? ' atlas' : ''}" title="${esc(o.kaynak_metin || '')}">${esc(kaynakMetni(o))}</span>`;
}

// ---------------------------------------------------------------- toast
export function toast(metin, { tur = '', geriAl = null, sure = 5000 } = {}) {
  const t = el(`<div class="toast ${tur}"><span>${esc(metin)}</span>${geriAl ? '<button data-geri>Geri al</button>' : ''}</div>`);
  $('#toastlar').appendChild(t);
  const kaldir = () => t.remove();
  if (geriAl) t.querySelector('[data-geri]').onclick = async () => { kaldir(); try { await geriAl(); toast('Geri alındı'); } catch (e) { toast(e.message, { tur: 'hata' }); } };
  setTimeout(kaldir, sure);
}
export const hataGoster = e => toast(e?.message || String(e), { tur: 'hata', sure: 7000 });

// ---------------------------------------------------------------- katman: çekmece, modal, onay
export function cekmeceAc(icerikHtml, { kapaninca } = {}) {
  cekmeceKapat();
  const arka = el('<div class="cekmece-arka" data-cekmece></div>');
  const c = el(`<aside class="cekmece" data-cekmece role="dialog">${icerikHtml}</aside>`);
  arka.onclick = cekmeceKapat;
  $('#katman').append(arka, c);
  c._kapaninca = kapaninca;
  return c;
}
export function cekmeceKapat() { $$('[data-cekmece]', $('#katman')).forEach(x => { x._kapaninca?.(); x.remove(); }); }
export function modal(baslik, govdeHtml, altHtml = '') {
  modalKapat();
  const m = el(`<div class="modal-arka" data-modal><div class="modal" role="dialog"><div class="modal-ust">${esc(baslik)}<button class="btn btn-hayalet btn-kucuk" style="margin-left:auto" data-kapat>✕</button></div><div class="modal-govde">${govdeHtml}</div>${altHtml ? `<div class="modal-alt">${altHtml}</div>` : ''}</div></div>`);
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-kapat]')) modalKapat(); });
  $('#katman').append(m); return m;
}
export function modalKapat() { $$('[data-modal]', $('#katman')).forEach(x => x.remove()); }
export function onayla(metin, { evet = 'Evet', hayir = 'Vazgeç', tehlike = false } = {}) {
  return new Promise(res => {
    const m = modal('Onay', `<p style="margin:0;font-weight:600">${esc(metin)}</p>`, `<button class="btn" data-h>${esc(hayir)}</button><button class="btn ${tehlike ? 'btn-kirmizi' : 'btn-koyu'}" data-e>${esc(evet)}</button>`);
    m.querySelector('[data-h]').onclick = () => { modalKapat(); res(false); };
    m.querySelector('[data-e]').onclick = () => { modalKapat(); res(true); };
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('[data-modal]')) modalKapat(); else if ($('.palet')) paletKapat(); else cekmeceKapat(); } });

// ---------------------------------------------------------------- işaretleme (ortak): 2 oylu kişide tüm firmalarını sorar
export async function isaretle(id, durum, { kendi = null } = {}) {
  if (!yazabilirMi() && store.ben?.rol !== 'sofor') return toast('İşaretleme yetkin yok', { tur: 'hata' });
  const f = store.firmalar.get(id); if (!f) return;
  let ids = [id];
  const grup = kisiGrubu(f);
  if (grup.length > 1 && ['oy_kullandi', 'fuarda', 'yolda'].includes(durum)) {
    const hepsi = await onayla(`${firmaAdi(f)} ${grup.length} firmayla oy kullanıyor. Hepsini "${DURUM_AD[durum]}" yapayım mı?`, { evet: `Evet, ${grup.length} firma`, hayir: 'Yalnız bu firma' });
    if (hepsi) ids = grup.map(x => x.id);
  }
  try {
    const geriAl = await durumYap(ids, durum, { kendi });
    toast(`${firmaAdi(f)} · ${kendi ? 'kendi geldi, ' : ''}${DURUM_AD[durum].toLocaleLowerCase('tr')}${ids.length > 1 ? ` (${ids.length} firma)` : ''}`, { geriAl });
  } catch (e) { hataGoster(e); }
}

// ---------------------------------------------------------------- KİŞİ KARTI
let acikKisi = null;
export function kisiKartiAc(id) {
  acikKisi = id;
  const c = cekmeceAc(kisiKartiHtml(id), { kapaninca: () => { acikKisi = null; } });
  kisiKartiBagla(c, id);
}
bus.on('firma', ({ id }) => { if (acikKisi === id) kisiKartiYenile(); });
bus.on('firmalar', () => { if (acikKisi) kisiKartiYenile(); });
bus.on('olay', ({ olay }) => { if (acikKisi && (!olay || olay.firma_id === acikKisi)) kisiKartiYenile(); });
function kisiKartiYenile() {
  const c = $('.cekmece'); if (!c || !acikKisi) return;
  const kaydir = c.querySelector('.cekmece-govde')?.scrollTop || 0;
  const taslak = c.querySelector('[data-not-girdi]')?.value || '';
  c.innerHTML = kisiKartiHtml(acikKisi); kisiKartiBagla(c, acikKisi);
  const g = c.querySelector('.cekmece-govde'); if (g) g.scrollTop = kaydir;
  const n = c.querySelector('[data-not-girdi]'); if (n) n.value = taslak;
}
function satir(etiket, deger) { return deger ? `<dt>${esc(etiket)}</dt><dd>${deger}</dd>` : ''; }
function telHtml(d, ad) { return d ? `<a href="${fmt.telLink(d)}" class="kalin">${esc(fmt.tel(d))}</a>${ad ? ` <span class="zayif">${esc(ad)}</span>` : ''}` : ''; }
export function kisiKartiHtml(id) {
  const f = store.firmalar.get(id); if (!f) return '<div class="bos">Kayıt bulunamadı</div>';
  const yaz = yazabilirMi() || store.ben?.rol === 'sofor';
  const sira = DURUMLAR.map(d => d.k); const simdiI = sira.indexOf(f.durum);
  const adimlar = DURUMLAR.map((d, i) => `<button class="adim ${i < simdiI ? 'gecti' : ''} ${i === simdiI ? 'simdi d-' + d.k : ''}" data-durum="${d.k}" ${yaz ? '' : 'disabled'}>${esc(d.ad)}</button>`).join('');
  const grup = kisiGrubu(f).filter(x => x.id !== f.id);
  const arac = aracOf(f);
  const olaylar = store.olaylar.filter(o => o.firma_id === id).slice(0, 30);
  const telefon = f.cep || f.cep2 || f.sabit_tel;
  return `
  <div class="cekmece-ust">
    <div style="flex:1;min-width:0">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${rozetSinif(f.oy_sinifi)} ${rozetDurum(f)} ${uyariRozetleri(f)}</div>
      <h2>${esc(trBaslik(f.yetkili || '(yetkili yok)'))}</h2>
      <div class="firma-ad">${esc(f.unvan)} · ${esc(f.tur || '')}</div>
    </div>
    <button class="btn btn-hayalet btn-ikon" data-kapat-cekmece title="Kapat (Esc)">✕</button>
  </div>
  <div class="cekmece-govde">
    ${f.evrak_uyari ? `<div class="uyari-kutu"><span>⚠</span><div>EVRAK UYARISI<div style="font-weight:600">${esc(f.evrak_uyari)}</div></div></div>` : ''}
    ${grup.length ? `<div class="uyari-kutu turuncu"><span>2×</span><div>Bu kişi ${grup.length + 1} firmayla oy kullanıyor<div style="font-weight:600">${grup.map(x => `<a href="#" data-kisi="${x.id}" style="text-decoration:underline">${esc(x.unvan)}</a> ${rozetDurum(x)}`).join('<br>')}</div></div></div>` : ''}
    ${f.alma_notu ? `<div class="uyari-kutu kirmizi"><span>📍</span><div>ALMA NOTU<div style="font-weight:600">${esc(f.alma_notu)}</div></div></div>` : ''}
    <div class="bolum-baslik">Gün içi durum</div>
    <div class="adimlar">${adimlar}</div>
    <div class="eylemler">
      ${yaz ? `<button class="btn btn-yesil" data-kendi>✓ Kendi geldi, oy kullandı</button>` : ''}
      ${telefon ? `<a class="btn" href="${fmt.telLink(telefon)}">📞 Ara</a>` : ''}
      ${f.cep || f.cep2 ? `<a class="btn" target="_blank" href="${fmt.waLink(f.cep || f.cep2)}">WhatsApp</a>` : ''}
      ${f.adres ? `<a class="btn" target="_blank" href="${fmt.mapsLink(f.adres)}">📍 Yol tarifi</a>` : ''}
    </div>
    <div class="bolum-baslik">İletişim</div>
    <dl class="bilgi-izgara">
      ${satir('1. yetkili', telHtml(f.cep, trBaslik(f.yetkili)) || esc(trBaslik(f.yetkili || '')))}
      ${satir('2. yetkili', (f.yetkili2 || f.cep2) ? telHtml(f.cep2, trBaslik(f.yetkili2 || '')) || esc(trBaslik(f.yetkili2)) : '')}
      ${satir('Sabit telefon', f.sabit_tel ? String(f.sabit_tel).split(/\s*[-/]\s*/).map(t => telHtml(t)).join(' · ') : '')}
      ${satir('Adres', f.adres ? `${esc(f.adres)}` : '')}
      ${satir('İlçe', esc(f.ilce || ''))}
    </dl>
    <div class="bolum-baslik" style="margin-top:16px">Seçim</div>
    <dl class="bilgi-izgara">
      ${satir('Oy sınıfı', yazabilirMi() ? `<select class="girdi" style="height:32px;width:auto" data-sinif>${SINIFLAR.map(s => `<option value="${s.k}" ${s.k === f.oy_sinifi ? 'selected' : ''}>${esc(s.ad)}</option>`).join('')}</select>` : rozetSinif(f.oy_sinifi))}
      ${satir('İlzam', esc(f.ilzam || '—'))}
      ${satir('Referans', esc(f.referans || '—') + (f.referans2 ? ` · 2. referans: ${esc(f.referans2)}` : ''))}
      ${satir('Evrak', [f.yetki ? 'Yetki' : '', f.zayi ? 'Zayi' : '', f.sicil_notu ? esc(f.sicil_notu) : ''].filter(Boolean).join(' · ') || '—')}
      ${satir('Açıklama', esc(f.aciklama || ''))}
      ${satir('Ek not', esc(f.ek_not || ''))}
      ${satir('Topluluk', f.toplulukta ? 'WhatsApp topluluğunda' : '')}
      ${satir('Sicil', esc([f.oda_sicil ? 'Oda ' + f.oda_sicil : '', f.ticari_sicil ? 'Ticari ' + f.ticari_sicil : ''].filter(Boolean).join(' · ')))}
    </dl>
    <div class="bolum-baslik" style="margin-top:16px">Ulaşım</div>
    <dl class="bilgi-izgara">
      ${satir('Tür', ulasim(f) === 'servis' ? 'Servisle alınacak' : ulasim(f) === 'kendi' ? 'Kendisi gelecek' : 'Belirtilmemiş')}
      ${satir('Taşıma saati', esc(fmt.saatKisa(f.tasima_saati) || (f.servis ? 'Saat belirsiz' : '')))}
      ${satir('Rota', esc(f.rota_kod ? `${f.rota_kod}${f.rota_sira ? ' · ' + f.rota_sira + '. durak' : ''}` : ''))}
      ${satir('Araç', arac ? `${plakaHtml(arac.plaka)} ${esc(trBaslik(arac.sofor_ad || ''))} ${arac.sofor_tel ? `<a href="${fmt.telLink(arac.sofor_tel)}">${esc(fmt.tel(arac.sofor_tel))}</a>` : ''}` : (yazabilirMi() ? '<span class="zayif">Atanmadı</span>' : ''))}
    </dl>
    ${yazabilirMi() ? `<div style="display:flex;gap:8px;margin-top:8px"><select class="girdi" data-arac style="max-width:320px"><option value="">Araç ata…</option>${[...store.araclar.values()].map(a => `<option value="${a.id}" ${a.id === f.arac_id ? 'selected' : ''}>${esc(fmt.plaka(a.plaka))} · ${esc(trBaslik(a.sofor_ad || ''))}</option>`).join('')}<option value="-1">Aracı kaldır</option></select></div>` : ''}
    <div class="bolum-baslik" style="margin-top:18px">Notlar</div>
    ${f.notlar ? `<div style="white-space:pre-wrap;font-size:13px;background:var(--yuzey-2);border-radius:10px;padding:10px 12px;margin-bottom:8px">${esc(f.notlar)}</div>` : ''}
    ${yaz ? `<div style="display:flex;gap:8px"><input class="girdi" data-not-girdi placeholder="Not ekle (ör. evrak eksik, 10 dk'da çıkıyor)"><button class="btn btn-koyu" data-not-ekle>Ekle</button></div>` : ''}
    <div class="bolum-baslik" style="margin-top:18px">İşaret geçmişi</div>
    ${olaylar.length ? `<ul class="zaman-cizgisi">${olaylar.map(o => `<li><div style="font-weight:700">${esc(olayMetni(o).split(' · ').slice(1).join(' · '))}</div><div>${kaynakCip(o)}</div>${o.kaynak_metin ? `<div class="alinti">${esc(o.kaynak_metin)}</div>` : ''}</li>`).join('')}</ul>` : '<div class="zayif" style="color:var(--metin-3)">Henüz işaret yok.</div>'}
  </div>`;
}
function kisiKartiBagla(c, id) {
  c.querySelector('[data-kapat-cekmece]')?.addEventListener('click', cekmeceKapat);
  c.querySelectorAll('[data-durum]').forEach(b => b.addEventListener('click', () => isaretle(id, b.dataset.durum, { kendi: false })));
  c.querySelector('[data-kendi]')?.addEventListener('click', () => isaretle(id, 'oy_kullandi', { kendi: true }));
  c.querySelectorAll('[data-kisi]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); kisiKartiAc(Number(a.dataset.kisi)); }));
  c.querySelector('[data-sinif]')?.addEventListener('change', async e => { try { const g = await sinifYap(id, e.target.value); toast('Oy sınıfı değişti', { geriAl: g }); } catch (er) { hataGoster(er); } });
  c.querySelector('[data-arac]')?.addEventListener('change', async e => {
    const v = Number(e.target.value); if (!v) return;
    try { const g = await aracAta([id], v === -1 ? null : v); toast(v === -1 ? 'Araç kaldırıldı' : 'Araç atandı', { geriAl: g }); } catch (er) { hataGoster(er); }
  });
  const not = c.querySelector('[data-not-girdi]');
  const ekle = async () => { if (!not.value.trim()) return; try { await notEkle(id, not.value); not.value = ''; toast('Not eklendi'); } catch (e) { hataGoster(e); } };
  c.querySelector('[data-not-ekle]')?.addEventListener('click', ekle);
  not?.addEventListener('keydown', e => { if (e.key === 'Enter') ekle(); });
}

// ---------------------------------------------------------------- Cmd+K HIZLI ARAMA (masadaki en sık iş: gelen kişiyi bul, işaretle)
let paletSecim = 0, paletSonuc = [];
export function paletAc(baslangic = '') {
  paletKapat();
  const p = el(`<div class="palet" role="dialog"><input placeholder="Ad, firma, telefon ya da referans… (Enter: kartı aç · ⌘Enter: oy kullandı)" value="${esc(baslangic)}"><div class="palet-liste"></div></div>`);
  const arka = el('<div class="cekmece-arka" data-palet-arka style="z-index:105"></div>');
  arka.onclick = paletKapat;
  $('#katman').append(arka, p);
  const inp = p.querySelector('input'); inp.focus();
  const ciz = () => {
    const q = inp.value.trim();
    paletSonuc = q.length < 2 ? [] : firmaListesi().filter(f => aramaEslesir(f, q)).sort((a, b) => (a.oy_sinifi === 'bizde' ? 0 : 1) - (b.oy_sinifi === 'bizde' ? 0 : 1)).slice(0, 12);
    paletSecim = Math.min(paletSecim, Math.max(0, paletSonuc.length - 1));
    p.querySelector('.palet-liste').innerHTML = paletSonuc.length ? paletSonuc.map((f, i) => `
      <div class="palet-satir ${i === paletSecim ? 'secili' : ''}" data-i="${i}">
        <div style="min-width:0"><div class="ana">${esc(trBaslik(f.yetkili || f.unvan))}</div><div class="yan">${esc(f.unvan)} · ${esc(f.referans || 'referans yok')} · ${esc(f.ilce || '')}</div></div>
        <div class="sag">${rozetSinif(f.oy_sinifi)} ${rozetDurum(f)} ${yazabilirMi() && f.durum !== 'oy_kullandi' ? `<button class="btn btn-yesil btn-kucuk" data-oy="${f.id}">Oy kullandı</button>` : ''}</div>
      </div>`).join('') : `<div class="bos">${q.length < 2 ? 'En az 2 harf yaz' : 'Sonuç yok'}</div>`;
  };
  inp.addEventListener('input', () => { paletSecim = 0; ciz(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { paletSecim = Math.min(paletSecim + 1, paletSonuc.length - 1); ciz(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { paletSecim = Math.max(paletSecim - 1, 0); ciz(); e.preventDefault(); }
    else if (e.key === 'Enter' && paletSonuc[paletSecim]) {
      const f = paletSonuc[paletSecim]; paletKapat();
      if ((e.metaKey || e.ctrlKey) && yazabilirMi()) isaretle(f.id, 'oy_kullandi'); else kisiKartiAc(f.id);
    }
  });
  p.querySelector('.palet-liste').addEventListener('click', e => {
    const oy = e.target.closest('[data-oy]'); if (oy) { paletKapat(); isaretle(Number(oy.dataset.oy), 'oy_kullandi'); return; }
    const s = e.target.closest('[data-i]'); if (s) { const f = paletSonuc[Number(s.dataset.i)]; paletKapat(); kisiKartiAc(f.id); }
  });
  ciz();
}
export function paletKapat() { $('.palet')?.remove(); $('[data-palet-arka]')?.remove(); }
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && store.ben) { e.preventDefault(); paletAc(); }
  else if (e.key === '/' && store.ben && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !$('.palet')) { e.preventDefault(); paletAc(); }
});
