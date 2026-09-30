// 72. Komite · Seçim Masası · KİŞİLER (CRM listesi, masaüstü) (ATLAS, 2026-09-30)
// 675 firmanın tamamı: arama, birleşen filtreler (her çipte canlı sayı), sıralama, hızlı "oy kullandı",
// filtre durumu adres çubuğunda (#kisiler/referans=HARUN BULAN&sinif=bizde), filtrelenmiş listeyi CSV'ye aktarma.
import {
  store, bus, esc, fmt, trBaslik, trArama, DURUMLAR, SINIFLAR, SINIF_AD, DURUM_AD, yazabilirMi, sayac, gecikme, ulasim,
  aracOf, aramaEslesir, referanslar, ilceler, firmaListesi, firmaAdi, simdiDk, dakika,
} from '../core.js';
import { $, rozetSinif, rozetDurum, uyariRozetleri, plakaHtml, isaretle, kisiKartiAc, toast, hataGoster } from '../ui.js';

// ---------------------------------------------------------------- sabitler
const SAYFA = 200;                       // ilk açılışta ve her "daha fazla"da eklenen satır
const YOK = '__yok';                     // "referansı yok" / "ilçesi yok" seçeneği
const DEPO = 'secim-kisiler-gorunum';    // sekme içinde filtre hafızası (sessionStorage)
const kol = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
const SINIF_I = Object.fromEntries(SINIFLAR.map((s, i) => [s.k, i]));
const DURUM_I = Object.fromEntries(DURUMLAR.map((d, i) => [d.k, i]));
const ULASIM_I = { servis: 0, kendi: 1, yok: 2 };

const DURUM_CIP = [...DURUMLAR.map(d => ({ k: d.k, ad: d.ad })), { k: 'kendi', ad: 'Kendi geldi' }];
const ULASIM_CIP = [{ k: 'servis', ad: 'Servis' }, { k: 'kendi', ad: 'Kendi gelecek' }, { k: 'yok', ad: 'Ulaşım yok' }];
const DIGER_CIP = [{ k: 'geciken', ad: 'Geciken' }, { k: 'evrak', ad: 'Evrak uyarısı' }, { k: 'ikioy', ad: '2 OY' }, { k: 'topluluk', ad: 'Toplulukta' }];
const DIGER_TEST = {
  geciken: (f, c) => (c.gec.get(f.id) || 0) > 0,
  evrak: f => !!f.evrak_uyari,
  ikioy: f => (f.kisi_oy_sayisi || 0) > 1,
  topluluk: f => !!f.toplulukta,
};
const NOKTA = {
  sinif: { bizde: 'var(--kirmizi)', yolda: 'var(--kirmizi-cizgi)', belirsiz: 'var(--gri)', karsi: 'var(--metin)', oy_yok: 'var(--cizgi-2)' },
  durum: { bekliyor: 'var(--gri)', arandi: 'var(--mavi)', yolda: 'var(--amber)', fuarda: 'var(--mor)', oy_kullandi: 'var(--yesil)', kendi: 'var(--yesil)' },
  ulasim: { servis: 'var(--mavi)', kendi: 'var(--metin-3)', yok: 'var(--turuncu)' },
  diger: { geciken: 'var(--turuncu)', evrak: 'var(--sari)', ikioy: 'var(--metin)', topluluk: '#0F7B3F' },
};
// Filtre grupları: grup içinde seçenekler "ya da", gruplar arası "ve" ile birleşir. Diğer çipleri ayrı ayrı "ve".
const GRUPLAR = ['q', 'sinif', 'durum', 'ulasim', 'referans', 'ilce', ...DIGER_CIP.map(d => 'u:' + d.k)];
const BIT = Object.fromEntries(GRUPLAR.map((g, i) => [g, 1 << i]));

// Sıralama anahtarları (boş değerler yön ne olursa olsun en sona)
const ANAHTAR = {
  unvan: f => f.unvan || '',
  yetkili: f => f.yetkili || '',
  ilce: f => f.ilce || '',
  referans: f => f.referans || '',
  sinif: f => SINIF_I[f.oy_sinifi] ?? null,
  durum: f => DURUM_I[f.durum] ?? null,
  saat: f => (f.tasima_saati ? dakika(f.tasima_saati) : null),
  arac: f => aracOf(f)?.plaka || '',
};
const IKINCIL = {
  saat: (a, b) => ULASIM_I[ulasim(a)] - ULASIM_I[ulasim(b)],
  durum: (a, b) => String(b.durum_zamani || '').localeCompare(String(a.durum_zamani || '')),
};
const DAR = '(max-width: 760px)';       // telefon: kart görünümü, sayfa kayar
const darMi = () => !!window.matchMedia?.(DAR).matches;
const SUTUNLAR = [
  { k: 'unvan', ad: 'Firma', cls: 'kisiler-k-firma' },
  { k: 'yetkili', ad: 'Yetkili' },
  { ad: 'Cep' },
  { k: 'ilce', ad: 'İlçe' },
  { k: 'referans', ad: 'Referans' },
  { k: 'sinif', ad: 'Oy sınıfı' },
  { k: 'durum', ad: 'Gün durumu' },
  { k: 'saat', ad: 'Ulaşım', ipucu: 'Ulaşım ve taşıma saatine göre sırala' },
  { ad: 'Uyarı', cls: 'kisiler-k-uyari' },
  { k: 'arac', ad: 'Araç' },
  { ad: '', cls: 'kisiler-k-eylem' },
];

// ---------------------------------------------------------------- ekran durumu
const bosDurum = () => ({ q: '', sinif: [], durum: [], ulasim: [], diger: [], referans: '', ilce: '', sira: null });
let d = bosDurum();
let kok = null, limit = SAYFA, secili = null, son = null, cizimBekliyor = false;
let sonHtml = { govde: '', cipler: '', ozet: '', devam: '', bas: '' };
let temizlikler = [];
const kilit = new Map();                 // hızlı "oy kullandı": aynı kişiye çift tıklamayı yut (id -> zaman)

const filtreVarMi = (x = d) => !!(x.q || x.referans || x.ilce || x.sinif.length || x.durum.length || x.ulasim.length || x.diger.length);
// Referans adı: kişi adları başlık harfiyle, "İK", "63 MK" gibi kısaltmalar olduğu gibi
const refAd = r => String(r || '').split(/(\s+)/).map(w => (w.trim().length <= 2 ? w : trBaslik(w))).join('');
const ilkAd = s => trBaslik(String(s || '').trim().split(/\s+/)[0] || '');
const art = (o, k) => { o[k] = (o[k] || 0) + 1; };
// Telefon ekranda "0532 334 32 66" görünür ama veride "5323343266" durur: numara gibi yazılan aramada baştaki 0 / +90 atılır
function aramaMetni(q) {
  if (!/^[\d\s()+.\-]+$/.test(q)) return q;
  let r = q.replace(/\D/g, '');
  if (r.startsWith('90') && r.length > 10) r = r.slice(2);
  if (r.startsWith('0')) r = r.slice(1);
  return r.length >= 3 ? r : q;
}

// ---------------------------------------------------------------- hesap (tek geçişte filtre + her çipin sayısı)
function hesapla() {
  const dk = simdiDk();
  const hepsi = firmaListesi();
  const gec = new Map();
  for (const f of hepsi) { const g = gecikme(f, dk); if (g) gec.set(f.id, g); }
  const c = { gec };
  const sayim = { sinif: {}, durum: {}, ulasim: {}, referans: {}, ilce: {}, diger: {} };
  const sonuc = [];
  const aktifDiger = d.diger.filter(k => DIGER_TEST[k]);
  const q = d.q ? aramaMetni(d.q) : '';
  for (const f of hepsi) {
    let m = 0;
    const u = ulasim(f);
    if (q && !aramaEslesir(f, q)) m |= BIT.q;
    if (d.sinif.length && !d.sinif.includes(f.oy_sinifi)) m |= BIT.sinif;
    if (d.durum.length && !(d.durum.includes(f.durum) || (d.durum.includes('kendi') && f.kendi_geldi))) m |= BIT.durum;
    if (d.ulasim.length && !d.ulasim.includes(u)) m |= BIT.ulasim;
    if (d.referans && (d.referans === YOK ? !!f.referans : f.referans !== d.referans)) m |= BIT.referans;
    if (d.ilce && (d.ilce === YOK ? !!f.ilce : f.ilce !== d.ilce)) m |= BIT.ilce;
    for (const k of aktifDiger) if (!DIGER_TEST[k](f, c)) m |= BIT['u:' + k];
    if (!m) sonuc.push(f);
    // bir çipin sayısı = o çipin kendi grubu HARİÇ diğer tüm filtrelerden geçenler
    const gecer = g => (m & ~BIT[g]) === 0;
    if (gecer('sinif')) art(sayim.sinif, f.oy_sinifi);
    if (gecer('durum')) { art(sayim.durum, f.durum); if (f.kendi_geldi) art(sayim.durum, 'kendi'); }
    if (gecer('ulasim')) art(sayim.ulasim, u);
    if (gecer('referans')) art(sayim.referans, f.referans || YOK);
    if (gecer('ilce')) art(sayim.ilce, f.ilce || YOK);
    for (const x of DIGER_CIP) if (gecer('u:' + x.k) && DIGER_TEST[x.k](f, c)) art(sayim.diger, x.k);
  }
  sirala(sonuc);
  return { sonuc, sayim, gec, toplam: hepsi.length };
}
function sirala(liste) {
  const alan = d.sira?.alan, yon = d.sira?.yon === 'azalan' ? -1 : 1, k = ANAHTAR[alan];
  liste.sort((a, b) => {
    if (k) {
      const x = k(a), y = k(b), bx = x === '' || x == null, by = y === '' || y == null;
      if (bx !== by) return bx ? 1 : -1;
      if (!bx) { const r = typeof x === 'number' ? x - y : kol.compare(x, y); if (r) return r * yon; }
      const t = IKINCIL[alan]?.(a, b); if (t) return t;
    }
    return (a.sn ?? 1e9) - (b.sn ?? 1e9) || a.id - b.id;
  });
}

// ---------------------------------------------------------------- adres çubuğu (hash) ve sekme hafızası
// Değerdeki & = / + % # , karakterleri iki kez kaçışlanır: app.js hash'i bir kez çözer, URLSearchParams bir kez daha.
const hashKacis = v => String(v).replace(/[%&=/+#,]/g, ch => '%25' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
function paramYaz(x = d) {
  const p = [];
  if (x.referans) p.push(['referans', x.referans === YOK ? 'yok' : x.referans]);
  if (x.ilce) p.push(['ilce', x.ilce === YOK ? 'yok' : x.ilce]);
  if (x.sinif.length) p.push(['sinif', x.sinif.join(',')]);
  if (x.durum.length) p.push(['durum', x.durum.join(',')]);
  if (x.ulasim.length) p.push(['ulasim', x.ulasim.join(',')]);
  if (x.diger.length) p.push(['uyari', x.diger.join(',')]);
  if (x.sira) p.push(['sira', `${x.sira.alan}.${x.sira.yon}`]);
  if (x.q) p.push(['q', x.q]);
  return p.map(([k, v]) => `${k}=${k === 'referans' || k === 'ilce' || k === 'q' ? hashKacis(v) : v}`).join('&');
}
function paramOku(param) {
  const x = bosDurum();
  param = String(param || '').trim();
  if (!param) return null;
  if (/^(hepsi|tumu|tümü|temiz)$/i.test(param)) return x;
  const refBul = v => { const t = trArama(v); return referanslar().find(r => trArama(r) === t); };
  const ilceBul = v => { const t = trArama(v); return ilceler().find(r => trArama(r) === t); };
  if (!param.includes('=')) {           // #kisiler/HARUN BULAN  →  referans, yoksa ilçe, yoksa arama
    const r = refBul(param); if (r) { x.referans = r; return x; }
    const i = ilceBul(param); if (i) { x.ilce = i; return x; }
    x.q = param; return x;
  }
  const p = new URLSearchParams(param);
  const liste = (anahtarlar, izin, esle = {}) => {
    const ham = anahtarlar.map(k => p.get(k)).find(Boolean) || '';
    return [...new Set(ham.split(',').map(s => trArama(s)).map(s => esle[s] || s).filter(s => izin.includes(s)))];
  };
  x.sinif = liste(['sinif'], SINIFLAR.map(s => s.k), { kesin: 'bizde', 'kesin bizde': 'bizde', 'oy yok': 'oy_yok' });
  x.durum = liste(['durum'], DURUM_CIP.map(s => s.k), { 'oy kullandi': 'oy_kullandi', oy: 'oy_kullandi' });
  x.ulasim = liste(['ulasim'], ULASIM_CIP.map(s => s.k));
  x.diger = liste(['uyari', 'diger'], DIGER_CIP.map(s => s.k), { '2oy': 'ikioy', '2 oy': 'ikioy', gecikti: 'geciken' });
  const ref = p.get('referans');
  if (ref) x.referans = /^(yok|referanssiz)$/i.test(trArama(ref)) ? YOK : (refBul(ref) || ref.toLocaleUpperCase('tr'));
  const ilce = p.get('ilce');
  if (ilce) x.ilce = trArama(ilce) === 'yok' ? YOK : (ilceBul(ilce) || ilce.toLocaleUpperCase('tr'));
  x.q = p.get('q') || p.get('ara') || '';
  const sira = p.get('sira');
  if (sira) { const [alan, yon] = sira.split('.'); if (ANAHTAR[alan]) x.sira = { alan, yon: yon === 'azalan' ? 'azalan' : 'artan' }; }
  return x;
}
function durumKaydet() {
  if (!kok) return;
  const p = paramYaz();
  const hedef = '#kisiler' + (p ? '/' + p : '');
  try { if (decodeURIComponent(location.hash) !== decodeURIComponent(hedef)) history.replaceState(null, '', hedef); } catch { history.replaceState(null, '', hedef); }
  try { sessionStorage.setItem(DEPO, JSON.stringify({ ...d, q: '' })); } catch {}
}
function durumHafizadan() {
  try {
    const x = JSON.parse(sessionStorage.getItem(DEPO) || 'null');
    if (!x || typeof x !== 'object') return null;
    const b = bosDurum();
    for (const k of ['sinif', 'durum', 'ulasim', 'diger']) b[k] = Array.isArray(x[k]) ? x[k].map(String) : [];
    b.referans = typeof x.referans === 'string' ? x.referans : '';
    b.ilce = typeof x.ilce === 'string' ? x.ilce : '';
    if (x.sira && ANAHTAR[x.sira.alan]) b.sira = { alan: x.sira.alan, yon: x.sira.yon === 'azalan' ? 'azalan' : 'artan' };
    return b;
  } catch { return null; }
}

// ---------------------------------------------------------------- HTML parçaları
function ozetHtml(r) {
  const s = sayac();
  const filtreli = filtreVarMi();
  return `
    <div title="Oda listesindeki tüm firmalar"><b>${fmt.sayi(s.toplam)}</b><span>firma</span></div>
    <div class="kirmizi" title="Oy sınıfı: kesin bizde"><b>${fmt.sayi(s.bizde)}</b><span>kesin bizde</span></div>
    <div class="yesil" title="Bizden oy kullanan: ${s.oy_bizde}"><b>${fmt.sayi(s.oy_kullandi)}</b><span>oy kullandı${s.oy_kullandi ? ` · ${fmt.sayi(s.oy_bizde)} bizden` : ''}</span></div>
    <div class="filtre${filtreli ? ' aktif' : ''}" title="Şu anki filtre ve aramayla eşleşen"><b>${fmt.sayi(r.sonuc.length)}</b><span>filtrede</span></div>`;
}
function cipHtml(grup, secenek, sayim, secili) {
  const n = sayim[secenek.k] || 0; const aktif = secili.includes(secenek.k);
  return `<button type="button" class="cip${aktif ? ' aktif' : ''}${n ? '' : ' sifir'}" data-g="${grup}" data-v="${esc(secenek.k)}" aria-pressed="${aktif}">`
    + `<i class="kisiler-nokta" style="background:${NOKTA[grup][secenek.k]}"></i>${esc(secenek.ad)} <span class="say">${fmt.sayi(n)}</span></button>`;
}
function ciplerHtml(r) {
  const grup = (ad, g, secenekler, secili) => `<div class="kisiler-grup"><span class="kisiler-grup-ad">${ad}</span>${secenekler.map(s => cipHtml(g, s, r.sayim[g], secili)).join('')}</div>`;
  return grup('Oy sınıfı', 'sinif', SINIFLAR, d.sinif)
    + grup('Gün durumu', 'durum', DURUM_CIP, d.durum)
    + grup('Ulaşım', 'ulasim', ULASIM_CIP, d.ulasim)
    + grup('Diğer', 'diger', DIGER_CIP, d.diger);
}
function basHtml() {
  return `<tr>${SUTUNLAR.map(s => {
    if (!s.k) return `<th class="${s.cls || ''}">${esc(s.ad)}</th>`;
    const aktif = d.sira?.alan === s.k, yon = aktif ? d.sira.yon : null;
    return `<th class="sirali${aktif ? ' aktif' : ''} ${s.cls || ''}" data-sira="${s.k}" aria-sort="${yon === 'artan' ? 'ascending' : yon === 'azalan' ? 'descending' : 'none'}" title="${esc(s.ipucu || s.ad + ' sütununa göre sırala')}">${esc(s.ad)}<span class="kisiler-ok">${yon === 'artan' ? '↑' : yon === 'azalan' ? '↓' : '↕'}</span></th>`;
  }).join('')}</tr>`;
}
function telHucre(f) {
  const cep = f.cep || f.cep2;
  if (cep) {
    const link = fmt.telLink(cep);
    const not = !f.cep ? '<span class="kisiler-alt">2. yetkili</span>' : '';
    return link ? `<a class="kisiler-tel" href="${link}" title="Ara">${esc(fmt.tel(cep))}</a>${not}` : `<span class="kisiler-serbest" title="${esc(cep)}">${esc(cep)}</span>${not}`;
  }
  if (f.sabit_tel) {
    const ilk = String(f.sabit_tel).split(/\s*[-/,;]\s*/).find(t => t.replace(/\D/g, '').length >= 7) || String(f.sabit_tel);
    const link = fmt.telLink(ilk);
    return `${link ? `<a class="kisiler-tel" href="${link}" title="${esc(f.sabit_tel)}">${esc(fmt.tel(ilk))}</a>` : `<span class="kisiler-serbest">${esc(ilk)}</span>`}<span class="kisiler-alt">sabit hat</span>`;
  }
  return '<span class="kisiler-yok">Numara yok</span>';
}
function ulasimHucre(f, u) {
  if (u === 'servis') {
    const saat = fmt.saatKisa(f.tasima_saati);
    return `<span class="rozet u-servis" title="${esc(f.rota_kod ? trBaslik(f.rota_kod) + (f.rota_sira ? ` · ${f.rota_sira}. durak` : '') : 'Servisle alınacak')}">Servis${saat ? ' ' + esc(saat) : ''}</span>${saat ? '' : '<span class="kisiler-alt">saat belirsiz</span>'}`;
  }
  if (u === 'kendi') return '<span class="rozet u-kendi" title="Kendisi gelecek">Kendi</span>';
  return f.oy_sinifi === 'bizde' ? '<span class="rozet u-ulasimyok">Ulaşım yok</span>' : '';
}
function satirHtml(f, yaz) {
  const u = ulasim(f);
  const arac = aracOf(f);
  const sinif = [f.oy_sinifi === 'bizde' ? 'bizde' : '', f.durum === 'oy_kullandi' ? 'oy' : '', f.id === secili ? 'secili' : ''].filter(Boolean).join(' ');
  const zaman = f.durum !== 'bekliyor' && f.durum_zamani
    ? `<span class="kisiler-alt" title="${esc(f.durum_kim ? 'İşaretleyen: ' + f.durum_kim : '')}">${esc(fmt.saat(f.durum_zamani))}${f.durum_kim ? ' · ' + esc(ilkAd(f.durum_kim)) : ''}</span>` : '';
  const uyari = [uyariRozetleri(f, { hepsi: false }), f.toplulukta ? '<span class="rozet u-topluluk" title="WhatsApp topluluğunda">Toplulukta</span>' : ''].filter(Boolean).join(' ');
  const ref = f.referans ? `<span class="kisiler-ref kisiler-kes" title="${esc(refAd(f.referans))}">${esc(refAd(f.referans))}</span>` : '<span class="kisiler-yok">Yok</span>';
  return `<tr data-id="${f.id}"${sinif ? ` class="${sinif}"` : ''}>
    <td class="kisiler-k-firma"><div class="kisiler-firma" title="${esc(f.unvan || '')}">${esc(f.unvan || '')}</div></td>
    <td><span class="kisiler-ad kisiler-kes" title="${esc(trBaslik(f.yetkili || ''))}">${f.yetkili ? esc(trBaslik(f.yetkili)) : '<span class="kisiler-yok">Yetkili yok</span>'}</span>${f.yetkili2 ? `<span class="kisiler-alt kisiler-kes" title="2. yetkili: ${esc(trBaslik(f.yetkili2))}">${esc(trBaslik(f.yetkili2))}</span>` : ''}</td>
    <td>${telHucre(f)}</td>
    <td>${esc(trBaslik(f.ilce || ''))}</td>
    <td class="kisiler-k-ref">${ref}${f.referans2 ? `<span class="kisiler-alt kisiler-kes" title="2. referans: ${esc(refAd(f.referans2))}">+ ${esc(refAd(f.referans2))}</span>` : ''}</td>
    <td>${rozetSinif(f.oy_sinifi)}</td>
    <td>${rozetDurum(f)}${zaman}</td>
    <td>${ulasimHucre(f, u)}</td>
    <td class="kisiler-k-uyari"><div class="kisiler-uyari">${uyari}</div></td>
    <td>${arac ? plakaHtml(arac.plaka) : u === 'servis' ? '<span class="kisiler-atanmadi">Atanmadı</span>' : ''}</td>
    <td class="kisiler-k-eylem">${yaz && f.durum !== 'oy_kullandi' ? '<button type="button" class="btn btn-kucuk kisiler-oy" data-oy title="Oy kullandı olarak işaretle"><b>✓</b> Oy<span class="kisiler-oy-uzun"> kullandı</span></button>' : ''}</td>
  </tr>`;
}
function bosGovdeHtml(r) {
  if (!r.toplam) return `<tr><td colspan="${SUTUNLAR.length}"><div class="bos">Liste henüz yüklenmedi. Bağlantı gelince kendiliğinden dolacak.</div></td></tr>`;
  return `<tr><td colspan="${SUTUNLAR.length}"><div class="bos kisiler-bos"><b>Bu filtrelerle eşleşen kişi yok.</b><div>${d.q ? `"${esc(d.q)}" araması ` : ''}${filtreVarMi() ? 'Filtreleri gevşet ya da temizle.' : ''}</div><button type="button" class="btn btn-kucuk" data-temizle>Filtreleri temizle</button></div></td></tr>`;
}
// Tablo gövdesi satır satır güncellenir: değişmeyen <tr> yerinde kalır (canlı yenileme odaktaki düğmeyi,
// seçili metni ve o an basılı tıklamayı bozmaz), yalnız değişen satır yeniden kurulur, sıra değişirse taşınır.
const sablon = document.createElement('template');
function govdeCiz(r) {
  const tb = $('[data-govde]', kok); if (!tb) return;
  if (!r.sonuc.length) {
    const html = bosGovdeHtml(r);
    if (sonHtml.govde !== html) { tb.innerHTML = html; sonHtml.govde = html; }
    return;
  }
  sonHtml.govde = '';
  const yaz = yazabilirMi();
  const liste = r.sonuc.slice(0, limit);
  const mevcut = new Map();
  for (const tr of tb.children) if (tr.dataset.id) mevcut.set(tr.dataset.id, tr);
  const htmller = liste.map(f => satirOnbellekli(f, yaz, r.gec.get(f.id) || 0));
  const yeniSira = [];
  liste.forEach((f, i) => { const tr = mevcut.get(String(f.id)); if (!tr || tr._html !== htmller[i]) yeniSira.push(i); });
  const uretilen = new Map();
  if (yeniSira.length) {
    sablon.innerHTML = yeniSira.map(i => htmller[i]).join('');
    [...sablon.content.children].forEach((tr, j) => { tr._html = htmller[yeniSira[j]]; uretilen.set(yeniSira[j], tr); });
  }
  let ref = tb.firstElementChild;
  liste.forEach((f, i) => {
    const anahtar = String(f.id);
    let tr = uretilen.get(i);
    const eski = mevcut.get(anahtar); mevcut.delete(anahtar);
    if (tr) { if (eski) { if (eski === ref) ref = ref.nextElementSibling; eski.remove(); } }
    else tr = eski;
    if (tr === ref) { ref = ref.nextElementSibling; return; }
    tb.insertBefore(tr, ref);
  });
  while (ref) { const n = ref.nextElementSibling; ref.remove(); ref = n; }   // listeden çıkanlar
}
// Satır HTML'i önbellekte: store her güncellemede satır nesnesini yeniler, değişmeyen satır yeniden üretilmez
const satirOnbellek = new Map();
function satirOnbellekli(f, yaz, gec) {
  const arac = f.arac_id ? store.araclar.get(f.arac_id) : null, sec = f.id === secili;
  const k = satirOnbellek.get(f.id);
  if (k && k.f === f && k.arac === arac && k.gec === gec && k.sec === sec && k.yaz === yaz) return k.html;
  const html = satirHtml(f, yaz);
  satirOnbellek.set(f.id, { f, arac, gec, sec, yaz, html });
  return html;
}
function devamHtml(r) {
  const n = r.sonuc.length; if (!n) return '';
  const gosterilen = Math.min(limit, n);
  if (gosterilen >= n) return `<span>${fmt.sayi(n)} kişinin tamamı gösteriliyor</span>`;
  return `<span>${fmt.sayi(gosterilen)} / ${fmt.sayi(n)} kişi gösteriliyor</span>`
    + `<button type="button" class="btn btn-kucuk" data-daha>${fmt.sayi(Math.min(SAYFA, n - gosterilen))} daha göster</button>`
    + `<button type="button" class="btn btn-kucuk btn-hayalet" data-tumu>Tümünü göster</button>`;
}
function secenekYaz(sel, secenekler, deger) {
  const ayni = sel.options.length === secenekler.length && secenekler.every((s, i) => sel.options[i].value === s.v);
  if (ayni) secenekler.forEach((s, i) => { if (sel.options[i].text !== s.ad) sel.options[i].text = s.ad; });
  else sel.innerHTML = secenekler.map(s => `<option value="${esc(s.v)}">${esc(s.ad)}</option>`).join('');
  if (sel.value !== deger) sel.value = deger;
  sel.classList.toggle('dolu', !!deger);
}
function seciciler(r) {
  const refSel = $('[data-referans]', kok), ilceSel = $('[data-ilce]', kok);
  if (!refSel || !ilceSel) return;
  const toplamRef = Object.values(r.sayim.referans).reduce((a, b) => a + b, 0);
  const refler = referanslar(); if (d.referans && d.referans !== YOK && !refler.includes(d.referans)) refler.push(d.referans);
  secenekYaz(refSel, [
    { v: '', ad: `Tüm referanslar (${fmt.sayi(toplamRef)})` },
    { v: YOK, ad: `Referansı yok (${fmt.sayi(r.sayim.referans[YOK] || 0)})` },
    ...refler.map(x => ({ v: x, ad: `${refAd(x)} (${fmt.sayi(r.sayim.referans[x] || 0)})` })),
  ], d.referans);
  const toplamIlce = Object.values(r.sayim.ilce).reduce((a, b) => a + b, 0);
  const ilc = ilceler(); if (d.ilce && d.ilce !== YOK && !ilc.includes(d.ilce)) ilc.push(d.ilce);
  secenekYaz(ilceSel, [
    { v: '', ad: `Tüm ilçeler (${fmt.sayi(toplamIlce)})` },
    ...(r.sayim.ilce[YOK] || d.ilce === YOK ? [{ v: YOK, ad: `İlçesi yok (${fmt.sayi(r.sayim.ilce[YOK] || 0)})` }] : []),
    ...ilc.map(x => ({ v: x, ad: `${trBaslik(x)} (${fmt.sayi(r.sayim.ilce[x] || 0)})` })),
  ], d.ilce);
  const siraSel = $('[data-sira-sec]', kok);
  if (siraSel) { const v = d.sira ? `${d.sira.alan}.${d.sira.yon}` : ''; if (siraSel.value !== v) siraSel.value = v; siraSel.classList.toggle('dolu', !!v); }
  const say = d.sinif.length + d.durum.length + d.ulasim.length + d.diger.length;
  const ac = $('[data-filtre-ac]', kok);
  if (ac) { const s = ac.querySelector('[data-filtre-say]'); s.textContent = say ? String(say) : ''; s.hidden = !say; }
}
// telefonda sıralama sütun başlığıyla değil bu seçimle yapılır
function siraSecenekHtml() {
  return `<option value="">Sıra: liste sırası</option>` + SUTUNLAR.filter(s => s.k).map(s =>
    `<option value="${s.k}.artan">${esc(s.ad)} ↑</option><option value="${s.k}.azalan">${esc(s.ad)} ↓</option>`).join('');
}

// ---------------------------------------------------------------- çizim
const parca = (anahtar, secici, html) => {
  if (sonHtml[anahtar] === html) return false;
  const e = $(secici, kok); if (!e) return false;
  e.innerHTML = html; sonHtml[anahtar] = html; return true;
};
function ciz() {
  if (!kok || !kok.isConnected) return;
  son = hesapla();
  if (secili && !son.sonuc.some(f => f.id === secili)) secili = null;
  parca('ozet', '[data-ozet]', ozetHtml(son));
  parca('cipler', '[data-cipler]', ciplerHtml(son));
  parca('bas', '[data-bas]', basHtml());
  govdeCiz(son);
  parca('devam', '[data-devam]', devamHtml(son));
  seciciler(son);
  const tem = $('[data-temizle-ust]', kok); if (tem) tem.hidden = !filtreVarMi();
  const araTem = $('[data-ara-temizle]', kok); if (araTem) araTem.hidden = !d.q;
  const csv = $('[data-csv]', kok); if (csv) { csv.disabled = !son.sonuc.length; csv.title = `${son.sonuc.length} kişiyi Excel'de açılan CSV olarak indir`; }
}
// canlı olaylar: kare başına en çok bir çizim
function cizimIste() {
  if (cizimBekliyor) return; cizimBekliyor = true;
  requestAnimationFrame(() => { cizimBekliyor = false; ciz(); });
}
function filtreDegisti({ basaDon = true } = {}) {
  if (basaDon) { limit = SAYFA; const kap = $('[data-kap]', kok); if (kap) kap.scrollTop = 0; }
  ciz(); durumKaydet(); yukseklikAyarla();
}

// tablo alanı ekranın kalanını doldurur (başlık sabit, yalnız satırlar kayar)
function yukseklikAyarla() {
  if (!kok) return;
  const kap = $('[data-kap]', kok); if (!kap) return;
  if (darMi()) { kap.style.maxHeight = ''; kap.classList.remove('tasiyor'); return; }   // telefonda sayfa kayar
  const ust = kap.getBoundingClientRect().top + window.scrollY;
  kap.style.maxHeight = Math.max(360, window.innerHeight - ust - 20) + 'px';
  kap.classList.toggle('tasiyor', kap.scrollWidth > kap.clientWidth + 1);
}
// listenin sonuna yaklaşınca sonraki 200 satır (masaüstünde tablo alanı, telefonda sayfa kayar)
function dahaGerekirse() {
  if (!kok || !son || limit >= son.sonuc.length) return;
  const kap = $('[data-kap]', kok); if (!kap) return;
  const yakin = darMi()
    ? kap.getBoundingClientRect().bottom - window.innerHeight < 900
    : kap.scrollTop + kap.clientHeight > kap.scrollHeight - 600;
  if (yakin) { limit += SAYFA; ciz(); }
}

// ---------------------------------------------------------------- eylemler
// Düğme kalıcı kilitlenmez: 2 oylu kişide açılan soru Esc ile kapatılırsa isaretle() hiç dönmez,
// bu yüzden çift tıklama kısa bir süre kilitle yutulur ve güncel durum store'dan okunur.
async function oyVer(id) {
  if (!yazabilirMi()) return toast('İşaretleme yetkin yok', { tur: 'hata' });
  const f = store.firmalar.get(id); if (!f) return;
  if (f.durum === 'oy_kullandi') return toast(`${firmaAdi(f)} zaten oy kullandı olarak işaretli`);
  const t = Date.now(); if (t - (kilit.get(id) || 0) < 1200) return;
  kilit.set(id, t);
  try { await isaretle(id, 'oy_kullandi'); } catch (e) { hataGoster(e); } finally { kilit.delete(id); }
}
function seciliyiTasi(adim) {
  if (!son?.sonuc.length) return;
  let i = son.sonuc.findIndex(f => f.id === secili);
  i = i < 0 ? (adim > 0 ? 0 : son.sonuc.length - 1) : Math.max(0, Math.min(son.sonuc.length - 1, i + adim));
  secili = son.sonuc[i].id;
  if (i >= limit) limit = Math.ceil((i + 1) / SAYFA) * SAYFA;
  ciz();
  $(`tr[data-id="${secili}"]`, kok)?.scrollIntoView({ block: 'nearest' });
}
// sabit hat serbest metin: numara gibi olan parçalar 0232 462 58 35 biçimine (Excel sayıya çevirip baştaki 0'ı yemesin)
const sabitTelMetni = t => (t ? String(t).split(/\s*[-/,;]\s*/).map(x => (/^\d{10,12}$/.test(x.replace(/\s/g, '')) ? fmt.tel(x) : x)).join(' / ') : '');
const csvHucre = v => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // Excel formül enjeksiyonuna karşı
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function csvIndir() {
  const r = hesapla();
  if (!r.sonuc.length) return toast('İndirilecek kişi yok', { tur: 'hata' });
  const baslik = ['Sıra', 'Ünvan', 'Tür', 'Yetkili', 'Cep', '2. yetkili', '2. cep', 'Sabit telefon', 'İlçe', 'Adres', 'Referans', '2. referans',
    'Oy sınıfı', 'Gün durumu', 'Kendi geldi', 'Durum saati', 'İşaretleyen', 'Ulaşım', 'Taşıma saati', 'Rota', 'Araç', 'Şoför', 'Şoför telefonu',
    'Gecikme (dk)', 'Aynı kişinin oy sayısı', 'Evrak uyarısı', 'Toplulukta', 'Oda sicil', 'Ticari sicil', 'Notlar'];
  const satirlar = r.sonuc.map(f => {
    const a = aracOf(f); const u = ulasim(f);
    return [
      f.sn, f.unvan, f.tur, trBaslik(f.yetkili || ''), f.cep ? fmt.tel(f.cep) : '', trBaslik(f.yetkili2 || ''), f.cep2 ? fmt.tel(f.cep2) : '', sabitTelMetni(f.sabit_tel),
      trBaslik(f.ilce || ''), f.adres, f.referans, f.referans2,
      SINIF_AD[f.oy_sinifi] || f.oy_sinifi, DURUM_AD[f.durum] || f.durum, f.kendi_geldi ? 'Evet' : '', f.durum_zamani && f.durum !== 'bekliyor' ? fmt.saat(f.durum_zamani) : '', f.durum_kim && f.durum !== 'bekliyor' ? f.durum_kim : '',
      u === 'servis' ? 'Servis' : u === 'kendi' ? 'Kendi gelecek' : '', fmt.saatKisa(f.tasima_saati), f.rota_kod ? trBaslik(f.rota_kod) + (f.rota_sira ? ` · ${f.rota_sira}. durak` : '') : '',
      a ? fmt.plaka(a.plaka) : '', a ? trBaslik(a.sofor_ad || '') : '', a?.sofor_tel ? fmt.tel(a.sofor_tel) : '',
      r.gec.get(f.id) || '', f.kisi_oy_sayisi > 1 ? f.kisi_oy_sayisi : '', f.evrak_uyari, f.toplulukta ? 'Evet' : '', f.oda_sicil, f.ticari_sicil, f.notlar,
    ];
  });
  const metin = [baslik, ...satirlar].map(s => s.map(csvHucre).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + metin], { type: 'text/csv;charset=utf-8' });
  const t = new Date(); const iki = n => String(n).padStart(2, '0');
  const ek = [d.referans && d.referans !== YOK ? d.referans : '', d.ilce && d.ilce !== YOK ? d.ilce : ''].filter(Boolean).map(x => trArama(x).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).join('-');
  const ad = `kisiler-${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}-${iki(t.getHours())}${iki(t.getMinutes())}${ek ? '-' + ek : ''}${filtreVarMi() && !ek ? '-filtreli' : ''}.csv`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = ad; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast(`${fmt.sayi(r.sonuc.length)} kişi CSV olarak indirildi`, { tur: 'basari' });
}

// ---------------------------------------------------------------- iskelet + bağlama
function iskeletHtml() {
  return `
  <div class="kisiler">
    <div class="sayfa-baslik kisiler-baslik">
      <div><h1>Kişiler</h1><div class="alt">Oda listesindeki tüm firmalar · canlı</div></div>
      <div class="kisiler-ozet" data-ozet></div>
      <div class="sag"><button type="button" class="btn" data-csv>⤓ Dışa aktar (CSV)</button></div>
    </div>
    <div class="kart kisiler-filtre">
      <div class="kisiler-ust-satir">
        <label class="kisiler-ara">
          <span class="kisiler-ara-ikon" aria-hidden="true">🔍</span>
          <input class="girdi" type="search" data-kisi-ara placeholder="Ad, firma, telefon, referans, ilçe, sicil… (Enter: ilk kişinin kartı)" autocomplete="off" spellcheck="false" aria-label="Kişilerde ara">
          <button type="button" class="btn btn-hayalet btn-kucuk" data-ara-temizle title="Aramayı temizle (Esc)" hidden>✕</button>
        </label>
        <select class="girdi kisiler-secim" data-referans aria-label="Referans"></select>
        <select class="girdi kisiler-secim" data-ilce aria-label="İlçe"></select>
        <select class="girdi kisiler-secim kisiler-yalniz-dar" data-sira-sec aria-label="Sıralama">${siraSecenekHtml()}</select>
        <button type="button" class="btn kisiler-yalniz-dar kisiler-filtre-ac" data-filtre-ac aria-expanded="false">Filtreler <span class="rozet-sayi" data-filtre-say hidden></span><span class="kisiler-ok-asagi" aria-hidden="true">▾</span></button>
        <button type="button" class="btn btn-hayalet btn-kucuk kisiler-temizle" data-temizle data-temizle-ust hidden>✕ Filtreleri temizle</button>
      </div>
      <div class="kisiler-gruplar" data-cipler></div>
    </div>
    <div class="tablo-kap kisiler-tablo-kap" data-kap>
      <table class="tablo kisiler-tablo">
        <thead data-bas></thead>
        <tbody data-govde></tbody>
      </table>
      <div class="kisiler-devam" data-devam></div>
    </div>
  </div>`;
}
function bagla() {
  const ara = $('[data-kisi-ara]', kok);
  ara.value = d.q;
  let araZaman = null;
  ara.addEventListener('input', () => {
    d.q = ara.value.trim(); secili = null;
    cancelAnimationFrame(araZaman); araZaman = requestAnimationFrame(() => filtreDegisti());
  });
  ara.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); seciliyiTasi(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); seciliyiTasi(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const f = son?.sonuc.find(x => x.id === secili) || son?.sonuc[0]; if (!f) return;
      secili = f.id; ciz();
      if ((e.metaKey || e.ctrlKey) && yazabilirMi()) { oyVer(f.id); ara.select(); }   // sıradaki adı hemen yazabilsin
      else kisiKartiAc(f.id);
    } else if (e.key === 'Escape' && ara.value) {
      // kişi kartı, onay kutusu ya da ⌘K açıksa Esc önce onu kapatsın (ui.js belge dinleyicisi), aramaya dokunma
      if (document.querySelector('#katman .cekmece, #katman [data-modal], .palet')) { e.preventDefault(); return; }   // (tarayıcının arama kutusunu kendiliğinden silmesini de engelle)
      e.preventDefault(); e.stopPropagation(); ara.value = ''; d.q = ''; secili = null; filtreDegisti();
    }
  });
  $('[data-ara-temizle]', kok).addEventListener('click', () => { ara.value = ''; d.q = ''; secili = null; filtreDegisti(); ara.focus(); });
  $('[data-referans]', kok).addEventListener('change', e => { d.referans = e.target.value; filtreDegisti(); });
  $('[data-ilce]', kok).addEventListener('change', e => { d.ilce = e.target.value; filtreDegisti(); });
  $('[data-cipler]', kok).addEventListener('click', e => {
    const c = e.target.closest('[data-g]'); if (!c) return;
    const liste = d[c.dataset.g]; const v = c.dataset.v; const i = liste.indexOf(v);
    if (i >= 0) liste.splice(i, 1); else liste.push(v);
    filtreDegisti();
  });
  kok.addEventListener('click', e => {
    if (e.target.closest('[data-temizle]')) {
      d = { ...bosDurum(), sira: d.sira }; ara.value = ''; secili = null; filtreDegisti(); ara.focus();
    }
  });
  $('[data-csv]', kok).addEventListener('click', () => { try { csvIndir(); } catch (e) { hataGoster(e); } });
  $('[data-bas]', kok).addEventListener('click', e => {
    const th = e.target.closest('[data-sira]'); if (!th) return;
    const alan = th.dataset.sira;
    if (d.sira?.alan !== alan) d.sira = { alan, yon: 'artan' };
    else if (d.sira.yon === 'artan') d.sira = { alan, yon: 'azalan' };
    else d.sira = null;
    filtreDegisti();
  });
  $('[data-govde]', kok).addEventListener('click', e => {
    if (e.target.closest('a[href]')) return;                 // telefon bağlantısı: kart açılmasın
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = Number(tr.dataset.id);
    if (e.target.closest('[data-oy]')) { oyVer(id); return; }
    if (String(window.getSelection?.() || '').trim()) return; // metin seçip kopyalayan kişiye kart açma
    secili = id; ciz(); kisiKartiAc(id);
  });
  $('[data-devam]', kok).addEventListener('click', e => {
    if (e.target.closest('[data-daha]')) { limit += SAYFA; ciz(); }
    else if (e.target.closest('[data-tumu]')) { limit = Infinity; ciz(); }
  });
  $('[data-sira-sec]', kok).addEventListener('change', e => {
    const [alan, yon] = e.target.value.split('.');
    d.sira = ANAHTAR[alan] ? { alan, yon: yon === 'azalan' ? 'azalan' : 'artan' } : null;
    filtreDegisti();
  });
  $('[data-filtre-ac]', kok).addEventListener('click', e => {
    const kart = $('.kisiler-filtre', kok); const acik = kart.classList.toggle('acik');
    e.currentTarget.setAttribute('aria-expanded', String(acik));
  });
  // aşağı kaydırdıkça sonraki 200 satır kendiliğinden gelir
  $('[data-kap]', kok).addEventListener('scroll', dahaGerekirse, { passive: true });
  window.addEventListener('scroll', dahaGerekirse, { passive: true });
  temizlikler.push(() => window.removeEventListener('scroll', dahaGerekirse));
  // yükseklik: pencere, filtre kartı ve çevrimdışı şeridi değiştikçe
  const boyut = () => yukseklikAyarla();
  window.addEventListener('resize', boyut);
  temizlikler.push(() => window.removeEventListener('resize', boyut));
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(boyut);
    [$('.kisiler-filtre', kok), $('.kisiler-baslik', kok), document.getElementById('cevrimdisi')].filter(Boolean).forEach(x => ro.observe(x));
    temizlikler.push(() => ro.disconnect());
  }
  // canlı veri: app.js yenile() kare başına tek sebep iletir; veri olaylarını kaçırmamak için doğrudan dinlenir
  for (const ad of ['firma', 'firmalar', 'arac', 'araclar', 'saat', 'hazir']) temizlikler.push(bus.on(ad, cizimIste));
}

function stilEkle() {
  if (document.querySelector('style[data-ekran="kisiler"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'kisiler';
  s.textContent = `
  .kisiler { display: flex; flex-direction: column; gap: 12px; }
  .kisiler [hidden] { display: none !important; }
  .kisiler .sayfa-baslik { margin-bottom: 0; align-items: center; gap: 16px; }
  .kisiler .sayfa-baslik .alt { font-size: 12px; margin-top: 2px; }
  .kisiler-ozet { display: flex; background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: var(--r-2); box-shadow: var(--golge-1); overflow: hidden; }
  .kisiler-ozet > div { display: flex; align-items: baseline; gap: 6px; padding: 8px 16px; border-left: 1px solid var(--cizgi); white-space: nowrap; }
  .kisiler-ozet > div:first-child { border-left: 0; }
  .kisiler-ozet b { font-size: 20px; font-weight: 900; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .kisiler-ozet span { font-size: 12px; font-weight: 600; color: var(--metin-3); }
  .kisiler-ozet .kirmizi b { color: var(--kirmizi); }
  .kisiler-ozet .yesil b { color: var(--yesil); }
  .kisiler-ozet .filtre.aktif { background: var(--kirmizi-acik); }
  .kisiler-ozet .filtre.aktif b, .kisiler-ozet .filtre.aktif span { color: var(--kirmizi); }
  .kisiler-filtre { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .kisiler-ust-satir { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .kisiler-ara { position: relative; flex: 1 1 320px; max-width: 560px; display: block; }
  .kisiler-ara .girdi { height: 40px; padding: 0 40px 0 36px; font-size: 14px; font-weight: 600; }
  .kisiler-ara .girdi::-webkit-search-cancel-button { display: none; }
  .kisiler-ara-ikon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; opacity: .55; pointer-events: none; }
  .kisiler-ara [data-ara-temizle] { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); width: 30px; padding: 0; }
  .kisiler-secim { width: auto; min-width: 170px; max-width: 250px; height: 40px; font-weight: 600; cursor: pointer; }
  .kisiler-secim.dolu { border-color: var(--metin); background: var(--yuzey-3); font-weight: 800; }
  .kisiler-yalniz-dar { display: none !important; }
  .kisiler-filtre-ac .rozet-sayi { margin-left: 2px; }
  .kisiler-ok-asagi { font-size: 11px; opacity: .6; transition: transform .15s; }
  .kisiler-filtre.acik .kisiler-ok-asagi { transform: rotate(180deg); }
  .kisiler-temizle { color: var(--kirmizi); }
  .kisiler-gruplar { display: flex; flex-wrap: wrap; gap: 8px 20px; }
  .kisiler-grup { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .kisiler-grup-ad { font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--metin-3); margin-right: 3px; }
  .kisiler .cip { height: 28px; padding: 0 10px; gap: 6px; transition: opacity .12s, background .12s; }
  .kisiler .cip.sifir:not(.aktif) { opacity: .45; }
  .kisiler .cip .say { font-variant-numeric: tabular-nums; }
  .kisiler-nokta { width: 8px; height: 8px; border-radius: 50%; flex: none; box-shadow: 0 0 0 1.5px var(--yuzey); }
  .kisiler .cip.aktif .kisiler-nokta { box-shadow: 0 0 0 1.5px rgba(255,255,255,.85); }
  [data-tema="koyu"] .kisiler .cip.aktif { background: var(--metin); border-color: var(--metin); color: var(--zemin); }
  [data-tema="koyu"] .kisiler .cip.aktif .kisiler-nokta { box-shadow: 0 0 0 1.5px var(--zemin); }
  .kisiler-tablo-kap { position: relative; overscroll-behavior: contain; box-shadow: var(--golge-1); }
  table.kisiler-tablo { min-width: 1120px; }
  .kisiler-tablo th { padding: 10px 7px; }
  .kisiler-tablo td { padding: 7px 7px; font-size: 13px; background: var(--yuzey); }
  .kisiler-tablo tr { scroll-margin-top: 44px; scroll-margin-bottom: 6px; }
  .kisiler-tablo th:first-child, .kisiler-tablo td:first-child { padding-left: 12px; }
  .kisiler-tablo th.sirali { cursor: pointer; user-select: none; }
  .kisiler-tablo th.sirali:hover { color: var(--metin); }
  .kisiler-tablo th.aktif { color: var(--kirmizi); }
  .kisiler-ok { display: inline-block; margin-left: 4px; font-size: 11px; opacity: .35; }
  .kisiler-tablo th.aktif .kisiler-ok { opacity: 1; }
  .kisiler-tablo th.sirali:hover .kisiler-ok { opacity: .8; }
  .kisiler-k-firma { width: 24%; min-width: 165px; }
  .kisiler-kes { display: block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kisiler-ref.kisiler-kes, .kisiler-k-ref .kisiler-kes { max-width: 118px; }
  .kisiler-firma { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 600; font-size: 12.5px; line-height: 1.32; color: var(--metin-2); }
  .kisiler-tablo td:not(.kisiler-k-firma):not(.kisiler-k-uyari) { white-space: nowrap; }
  .kisiler-ad { font-weight: 800; color: var(--metin); }
  .kisiler-alt { display: block; font-size: 11px; line-height: 1.3; color: var(--metin-3); font-weight: 600; margin-top: 2px; }
  .kisiler-yok { color: var(--metin-3); font-size: 12px; opacity: .7; }
  .kisiler-ref { font-weight: 600; color: var(--metin-2); }
  .kisiler-tel { font-weight: 700; font-variant-numeric: tabular-nums; }
  .kisiler-tel:hover { color: var(--kirmizi); text-decoration: underline; }
  .kisiler-serbest { display: inline-block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; font-size: 12px; color: var(--metin-2); }
  .kisiler-uyari { display: flex; flex-wrap: wrap; gap: 4px; min-width: 76px; }
  .kisiler-atanmadi { font-size: 11px; font-weight: 800; color: var(--amber); }
  .kisiler-k-eylem { width: 1%; text-align: right; position: sticky; right: 0; z-index: 1; }
  th.kisiler-k-eylem { z-index: 2; }
  .kisiler-tablo-kap.tasiyor .kisiler-k-eylem { box-shadow: -10px 0 12px -10px rgba(0,0,0,.25); }
  .kisiler-oy { color: var(--metin-2); border-color: var(--cizgi-2); background: var(--yuzey); }
  .kisiler-oy b { color: var(--yesil); font-weight: 900; }
  .kisiler-tablo tr:hover .kisiler-oy, .kisiler-tablo tr.secili .kisiler-oy, .kisiler-oy:focus-visible { background: var(--yesil); border-color: #11803A; color: #fff; }
  .kisiler-tablo tr:hover .kisiler-oy b, .kisiler-tablo tr.secili .kisiler-oy b, .kisiler-oy:focus-visible b { color: #fff; }
  .kisiler-tablo tr.bizde td:first-child { box-shadow: inset 3px 0 0 var(--kirmizi); }
  .kisiler-tablo tr.oy td { background: color-mix(in srgb, var(--yesil-acik) 55%, var(--yuzey)); }
  .kisiler-tablo tr.oy:hover td { background: var(--yesil-acik); }
  .kisiler-tablo tr.secili td, .kisiler-tablo tr.secili:hover td { background: var(--kirmizi-acik); }
  .kisiler-bos { display: grid; gap: 8px; justify-items: center; }
  .kisiler-bos b { color: var(--metin); }
  .kisiler-devam { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px; color: var(--metin-3); font-weight: 600; font-size: 12px; border-top: 1px solid var(--cizgi); background: var(--yuzey-2); position: sticky; left: 0; }
  .kisiler-devam:empty { display: none; }
  @media (max-width: 1399px) { .kisiler-oy-uzun { display: none; } .kisiler-oy { min-width: 58px; } }
  @media (max-width: 1100px) { .kisiler-ozet { order: 3; width: 100%; } .kisiler-ozet > div { flex: 1; justify-content: center; padding: 8px 10px; } }
  @media (max-width: 640px) { .kisiler-ozet { flex-wrap: wrap; } .kisiler-ozet > div { flex: 1 1 45%; border-top: 1px solid var(--cizgi); } .kisiler-ozet > div:nth-child(-n+2) { border-top: 0; } .kisiler-ozet > div:nth-child(odd) { border-left: 0; } }
  /* ---- telefon: satırlar karta döner, filtre çipleri "Filtreler" düğmesinin arkasında, sayfa kayar */
  @media ${DAR} {
    .kisiler { gap: 10px; }
    .kisiler .sayfa-baslik h1 { font-size: 22px; }
    .kisiler .sayfa-baslik .sag { margin-left: auto; }
    .kisiler-yalniz-dar { display: inline-flex !important; }
    select.kisiler-yalniz-dar { display: block !important; }
    .kisiler-filtre { padding: 10px; gap: 8px; }
    .kisiler-ara { flex: 1 1 100%; max-width: none; }
    .kisiler-ara .girdi { font-size: 16px; }
    .kisiler-secim { flex: 1 1 40%; min-width: 0; max-width: none; font-size: 14px; }
    .kisiler-filtre-ac { height: 40px; flex: 0 0 auto; }
    .kisiler-temizle { flex: 0 0 auto; }
    .kisiler-filtre:not(.acik) .kisiler-gruplar { display: none; }
    .kisiler-gruplar { gap: 10px; }
    .kisiler-grup { gap: 6px; }
    .kisiler-grup-ad { flex: 1 1 100%; margin: 0; }
    .kisiler .cip { height: 34px; padding: 0 12px; font-size: 13px; }
    .kisiler-tablo-kap { overflow: visible; border: 0; background: transparent; box-shadow: none; border-radius: 0; }
    table.kisiler-tablo, .kisiler-tablo tbody { display: block; min-width: 0; width: 100%; }
    .kisiler-tablo thead { display: none; }
    .kisiler-tablo tbody { display: flex; flex-direction: column; gap: 8px; }
    .kisiler-tablo tr { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 11px 12px; background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: var(--r-2); box-shadow: var(--golge-1); }
    .kisiler-tablo tr > td { display: block; padding: 0 !important; border: 0; background: transparent !important; white-space: normal !important; position: static; width: auto; min-width: 0; box-shadow: none !important; }
    .kisiler-tablo tr:hover td { background: transparent; }
    .kisiler-tablo tr.bizde { box-shadow: inset 4px 0 0 var(--kirmizi), var(--golge-1); }
    .kisiler-tablo tr.oy { background: color-mix(in srgb, var(--yesil-acik) 60%, var(--yuzey)); }
    .kisiler-tablo tr.secili { background: var(--kirmizi-acik); }
    .kisiler-tablo tr > td:empty, .kisiler-tablo tr > td:has(> .kisiler-uyari:empty) { display: none; }
    .kisiler-tablo tr > td:nth-child(2) { order: 1; flex: 1 1 0; }
    .kisiler-tablo tr > td:nth-child(11) { order: 2; flex: 0 0 auto; }
    .kisiler-tablo tr > td:nth-child(1) { order: 3; flex: 1 1 100%; margin-top: -4px; }
    .kisiler-tablo tr > td:nth-child(3) { order: 4; }
    .kisiler-tablo tr > td:nth-child(4) { order: 5; color: var(--metin-2); }
    .kisiler-tablo tr > td:nth-child(5) { order: 6; }
    .kisiler-tablo tr > td:nth-child(6) { order: 7; }
    .kisiler-tablo tr > td:nth-child(7) { order: 8; }
    .kisiler-tablo tr > td:nth-child(8) { order: 9; }
    .kisiler-tablo tr > td:nth-child(9) { order: 10; }
    .kisiler-tablo tr > td:nth-child(10) { order: 11; }
    .kisiler-tablo tr > td:nth-child(5)::before { content: 'Ref: '; color: var(--metin-3); font-size: 12px; font-weight: 600; }
    .kisiler-tablo tr > td:nth-child(4), .kisiler-tablo tr > td:nth-child(5) { font-size: 12.5px; }
    .kisiler-tablo tr > td:nth-child(3) { margin-right: 2px; }
    .kisiler-ad { font-size: 15px; }
    .kisiler-kes, .kisiler-ref.kisiler-kes, .kisiler-k-ref .kisiler-kes { max-width: none; display: inline; white-space: normal; }
    .kisiler-alt { display: inline; margin: 0 0 0 6px; }
    .kisiler-alt.kisiler-kes { display: block; margin: 2px 0 0; }
    .kisiler-firma { font-size: 12px; -webkit-line-clamp: 2; }
    .kisiler-tel { font-size: 14px; }
    .kisiler-uyari { min-width: 0; }
    .kisiler-oy { height: 36px; padding: 0 14px; font-size: 13px; background: var(--yesil); border-color: #11803A; color: #fff; }
    .kisiler-oy b { color: #fff; }
    .kisiler-oy-uzun { display: inline; }
    .kisiler-tablo tr:not([data-id]) { display: block; }
    .kisiler-devam { position: static; border: 1px solid var(--cizgi); border-radius: var(--r-2); flex-wrap: wrap; margin-top: 8px; }
  }
  `;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- ekran sözleşmesi
const ekran = {
  async render(hedef, param) {
    ekran.temizle();
    kok = hedef;
    stilEkle();
    d = paramOku(param) || durumHafizadan() || bosDurum();
    limit = SAYFA; secili = null; son = null; satirOnbellek.clear();
    sonHtml = { govde: '', cipler: '', ozet: '', devam: '', bas: '' };
    kok.innerHTML = iskeletHtml();
    bagla();
    ciz();
    durumKaydet();
    yukseklikAyarla();
    requestAnimationFrame(yukseklikAyarla);   // yazı tipi ve rozetler oturduktan sonra bir kez daha
    if (!window.matchMedia?.('(pointer: coarse)').matches) $('[data-kisi-ara]', kok)?.focus({ preventScroll: true });
  },
  yenile(sebep) {
    // Veri olayları bagla() içinde doğrudan dinleniyor; burada yalnız yerleşimi etkileyenler
    if (sebep === 'baglanti') yukseklikAyarla();
    else if (['firma', 'firmalar', 'arac', 'araclar', 'saat', 'hazir'].includes(sebep)) cizimIste();
  },
  temizle() {
    temizlikler.forEach(fn => { try { fn(); } catch {} });
    temizlikler = [];
    kok = null; son = null;
  },
};
export default ekran;
