// 72. Komite · Seçim Masası · KİŞİLER (Claude Design "SM Kisiler" tasarımı, ATLAS, 2026-09-30)
// 675 firmanın tamamı: arama, birleşen filtre çipleri (her çipte canlı sayı), 56 px yoğun satırlar, sıralama,
// hızlı "✓ Oy", filtre durumu adres çubuğunda (#kisiler/referans=HARUN BULAN&sinif=bizde), filtrelenmiş listeyi CSV'ye aktarma.
import {
  store, bus, esc, fmt, trBaslik, trArama, DURUMLAR, DURUM_AD, SINIFLAR, SINIF_AD, yazabilirMi, sayac, gecikme, ulasim,
  aracOf, aramaEslesir, referanslar, ilceler, firmaListesi, firmaAdi, simdiDk, dakika, ekip,
  ROL_AD, referansBenMi, karsiladim, isaretleyebilirMi,
} from '../core.js';
import { $, bas, isaretle, kisiKartiAc, toast, hataGoster, ilzamRozet } from '../ui.js';

// ---------------------------------------------------------------- sabitler
const SAYFA = 200;                       // ilk açılışta ve her "daha fazla"da eklenen satır
const YOK = '__yok';                     // "referansı yok" / "ilçesi yok" / "sorumlusu yok" seçeneği
const DEPO = 'secim-kisiler-gorunum';    // sekme içinde filtre hafızası (sessionStorage)
const kol = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
const SINIF_I = Object.fromEntries(SINIFLAR.map((s, i) => [s.k, i]));
const DURUM_I = Object.fromEntries(DURUMLAR.map((x, i) => [x.k, i]));
const ULASIM_I = { servis: 0, kendi: 1, yok: 2 };

// Çip etiketleri tasarımdaki gibi (oy sınıfı ve ulaşım BÜYÜK HARF)
const SINIF_CIP = [
  { k: 'bizde', ad: 'KESİN BİZDE' }, { k: 'yolda', ad: 'İLZAM YOLDA' }, { k: 'belirsiz', ad: 'BELİRSİZ' },
  { k: 'karsi', ad: 'KARŞI' }, { k: 'oy_yok', ad: 'OY KULLANMIYOR' },
];
const DURUM_CIP = DURUMLAR.map(x => ({ k: x.k, ad: x.k === 'oy_kullandi' ? 'Oy kullandı' : x.ad }));
const ULASIM_CIP = [{ k: 'servis', ad: 'SERVİS' }, { k: 'kendi', ad: 'KENDİ GELECEK' }, { k: 'yok', ad: 'ULAŞIM YOK' }];
const DIGER_CIP = [
  { k: 'topluluk', ad: '◉ Toplulukta' }, { k: 'evrak', ad: '▲ Evrak uyarısı', sinif: 'evrak' },
  { k: 'geciken', ad: '◷ Geciken', sinif: 'late' }, { k: 'ikioy', ad: '2 OY' },
  { k: 'benim', ad: 'Benim listem' },     // yalnız kullanıcı kimi tanıyan referans ise görünür (referansBenMi)
];
const DIGER_TEST = {
  geciken: (f, c) => (c.gec.get(f.id) || 0) > 0,
  evrak: f => !!f.evrak_uyari,
  ikioy: f => (f.kisi_oy_sayisi || 0) > 1,
  topluluk: f => !!f.toplulukta,
  benim: f => referansBenMi(f),
};
const GUN_RENK = { bekliyor: 'var(--ink-3)', arandi: 'var(--blue)', yolda: 'var(--amber)', fuarda: 'var(--violet)', oy_kullandi: 'var(--green)' };
// Filtre grupları: grup içinde seçenekler "ya da", gruplar arası "ve" ile birleşir. Uyarı çipleri ayrı ayrı "ve".
const GRUPLAR = ['q', 'sinif', 'durum', 'ulasim', 'referans', 'ilce', 'sorumlu', ...DIGER_CIP.map(x => 'u:' + x.k)];
const BIT = Object.fromEntries(GRUPLAR.map((g, i) => [g, 1 << i]));

const uye = id => (id ? store.profiller.get(id) : null);
const sorumluAd = f => uye(f.sorumlu_id)?.ad_soyad || '';

// Sıralama anahtarları (boş değerler yön ne olursa olsun en sona)
const ANAHTAR = {
  unvan: f => f.unvan || '',
  yetkili: f => f.yetkili || '',
  ilce: f => f.ilce || '',
  referans: f => f.referans || '',
  sorumlu: f => sorumluAd(f),
  sinif: f => SINIF_I[f.oy_sinifi] ?? null,
  durum: f => DURUM_I[f.durum] ?? null,
  ulasim: f => ULASIM_I[ulasim(f)],
  saat: f => (f.tasima_saati ? dakika(f.tasima_saati) : null),
  arac: f => aracOf(f)?.plaka || '',       // eski bağlantılar için (sütun yok)
};
const IKINCIL = {
  saat: (a, b) => ULASIM_I[ulasim(a)] - ULASIM_I[ulasim(b)],
  ulasim: (a, b) => (a.tasima_saati ? dakika(a.tasima_saati) : 1e9) - (b.tasima_saati ? dakika(b.tasima_saati) : 1e9),
  durum: (a, b) => String(b.durum_zamani || '').localeCompare(String(a.durum_zamani || '')),
};
const DAR = '(max-width: 760px)';       // telefon: kart görünümü, sayfa kayar
const darMi = () => !!window.matchMedia?.(DAR).matches;
// c = hücre sınıfı, ad = başlık (tasarımdaki gibi BÜYÜK HARF), kisa = telefondaki sıralama seçimi
const SUTUNLAR = [
  { k: 'unvan', c: 'firma', ad: 'FİRMA', kisa: 'Firma' },
  { k: 'yetkili', c: 'yet', ad: 'YETKİLİ', kisa: 'Yetkili' },
  { c: 'cep', ad: 'CEP' },
  { k: 'ilce', c: 'ilce', ad: 'İLÇE', kisa: 'İlçe' },
  { k: 'referans', c: 'ref', ad: 'REFERANS', kisa: 'Referans' },
  { k: 'sorumlu', c: 'sor', ad: 'SORUMLU', kisa: 'Sorumlu' },
  { k: 'sinif', c: 'sinif', ad: 'OY SINIFI', kisa: 'Oy sınıfı' },
  { k: 'durum', c: 'gun', ad: 'GÜN DURUMU', kisa: 'Gün durumu' },
  { k: 'ulasim', c: 'ulasim', ad: 'ULAŞIM', kisa: 'Ulaşım' },
  { k: 'saat', c: 'saat', ad: 'SAAT', kisa: 'Saat' },
  { c: 'uyari', ad: 'UYARI' },
  { c: 'eylem', ad: '' },
];

// ---------------------------------------------------------------- ekran durumu
const bosDurum = () => ({ q: '', sinif: [], durum: [], ulasim: [], diger: [], referans: '', ilce: '', sorumlu: '', sira: null });
let d = bosDurum();
let kok = null, limit = SAYFA, secili = null, son = null, cizimBekliyor = false, sonDar = null;
let sonHtml = { govde: '', ozet: '', say: '', sinif: '', ulasim: '', durum: '', diger: '', devam: '', bas: '' };
let temizlikler = [];
const kilit = new Map();                 // hızlı "✓ Oy": aynı kişiye çift tıklamayı yut (id -> zaman)

const filtreVarMi = (x = d) => !!(x.q || x.referans || x.ilce || x.sorumlu || x.sinif.length || x.durum.length || x.ulasim.length || x.diger.length);
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
  let benVar = false;
  const sayim = { sinif: {}, durum: {}, ulasim: {}, referans: {}, ilce: {}, sorumlu: {}, diger: {} };
  const sonuc = [];
  const aktifDiger = d.diger.filter(k => DIGER_TEST[k]);
  const q = d.q ? aramaMetni(d.q) : '';
  for (const f of hepsi) {
    let m = 0;
    const u = ulasim(f);
    if (q && !aramaEslesir(f, q)) m |= BIT.q;
    if (d.sinif.length && !d.sinif.includes(f.oy_sinifi)) m |= BIT.sinif;
    if (d.durum.length && !d.durum.includes(f.durum)) m |= BIT.durum;
    if (d.ulasim.length && !d.ulasim.includes(u)) m |= BIT.ulasim;
    if (d.referans && (d.referans === YOK ? !!f.referans : f.referans !== d.referans)) m |= BIT.referans;
    if (d.ilce && (d.ilce === YOK ? !!f.ilce : f.ilce !== d.ilce)) m |= BIT.ilce;
    if (d.sorumlu && (d.sorumlu === YOK ? !!f.sorumlu_id : f.sorumlu_id !== d.sorumlu)) m |= BIT.sorumlu;
    for (const k of aktifDiger) if (!DIGER_TEST[k](f, c)) m |= BIT['u:' + k];
    if (!m) sonuc.push(f);
    if (!benVar && referansBenMi(f)) benVar = true;
    // bir çipin sayısı = o çipin kendi grubu HARİÇ diğer tüm filtrelerden geçenler
    const gecer = g => (m & ~BIT[g]) === 0;
    if (gecer('sinif')) art(sayim.sinif, f.oy_sinifi);
    if (gecer('durum')) art(sayim.durum, f.durum);
    if (gecer('ulasim')) art(sayim.ulasim, u);
    if (gecer('referans')) art(sayim.referans, f.referans || YOK);
    if (gecer('ilce')) art(sayim.ilce, f.ilce || YOK);
    if (gecer('sorumlu')) art(sayim.sorumlu, f.sorumlu_id || YOK);
    for (const x of DIGER_CIP) if (gecer('u:' + x.k) && DIGER_TEST[x.k](f, c)) art(sayim.diger, x.k);
  }
  sirala(sonuc, gec);
  return { sonuc, sayim, gec, toplam: hepsi.length, benVar };
}
function sirala(liste, gec) {
  const alan = d.sira?.alan, yon = d.sira?.yon === 'azalan' ? -1 : 1, k = ANAHTAR[alan];
  const varsayilan = (a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9) || a.id - b.id;
  liste.sort((a, b) => {
    if (k) {
      const x = k(a), y = k(b), bx = x === '' || x == null, by = y === '' || y == null;
      if (bx !== by) return bx ? 1 : -1;
      if (!bx) { const r = typeof x === 'number' ? x - y : kol.compare(x, y); if (r) return r * yon; }
      const t = IKINCIL[alan]?.(a, b); if (t) return t;
      return varsayilan(a, b);
    }
    // sıralama seçilmemişse tasarımdaki düzen: gecikenler önce, sonra taşıma saatine göre, saatsizler liste sırasıyla
    const ga = gec.has(a.id) ? 1 : 0, gb = gec.has(b.id) ? 1 : 0;
    if (ga !== gb) return gb - ga;
    const sa = a.tasima_saati ? dakika(a.tasima_saati) : 1e9, sb = b.tasima_saati ? dakika(b.tasima_saati) : 1e9;
    return sa - sb || varsayilan(a, b);
  });
}

// ---------------------------------------------------------------- adres çubuğu (hash) ve sekme hafızası
// Değerdeki & = / + % # , karakterleri iki kez kaçışlanır: app.js hash'i bir kez çözer, URLSearchParams bir kez daha.
const hashKacis = v => String(v).replace(/[%&=/+#,]/g, ch => '%25' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
function paramYaz(x = d) {
  const p = [];
  if (x.referans) p.push(['referans', x.referans === YOK ? 'yok' : x.referans]);
  if (x.ilce) p.push(['ilce', x.ilce === YOK ? 'yok' : x.ilce]);
  if (x.sorumlu) p.push(['sorumlu', x.sorumlu === YOK ? 'yok' : (uye(x.sorumlu)?.ad_soyad || x.sorumlu)]);
  if (x.sinif.length) p.push(['sinif', x.sinif.join(',')]);
  if (x.durum.length) p.push(['durum', x.durum.join(',')]);
  if (x.ulasim.length) p.push(['ulasim', x.ulasim.join(',')]);
  if (x.diger.length) p.push(['uyari', x.diger.join(',')]);
  if (x.sira) p.push(['sira', `${x.sira.alan}.${x.sira.yon}`]);
  if (x.q) p.push(['q', x.q]);
  return p.map(([k, v]) => `${k}=${k === 'referans' || k === 'ilce' || k === 'q' || k === 'sorumlu' ? hashKacis(v) : v}`).join('&');
}
function sorumluBul(v) {
  const t = trArama(v);
  return ekip().find(p => p.id === v || trArama(p.ad_soyad) === t)?.id || '';
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
  const sor = p.get('sorumlu');
  if (sor) x.sorumlu = /^(yok|atanmamis)$/i.test(trArama(sor)) ? YOK : sorumluBul(sor);
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
    const izin = { sinif: SINIFLAR.map(s => s.k), durum: DURUM_CIP.map(s => s.k), ulasim: ULASIM_CIP.map(s => s.k), diger: DIGER_CIP.map(s => s.k) };
    for (const k of ['sinif', 'durum', 'ulasim', 'diger']) b[k] = Array.isArray(x[k]) ? x[k].map(String).filter(v => izin[k].includes(v)) : [];
    b.referans = typeof x.referans === 'string' ? x.referans : '';
    b.ilce = typeof x.ilce === 'string' ? x.ilce : '';
    b.sorumlu = typeof x.sorumlu === 'string' && (x.sorumlu === YOK || uye(x.sorumlu)) ? x.sorumlu : '';
    if (x.sira && ANAHTAR[x.sira.alan]) b.sira = { alan: x.sira.alan, yon: x.sira.yon === 'azalan' ? 'azalan' : 'artan' };
    return b;
  } catch { return null; }
}

// ---------------------------------------------------------------- HTML parçaları
function ozetHtml() {
  const s = sayac();
  return `<b>${fmt.sayi(s.toplam)}</b> firma · <b class="k">${fmt.sayi(s.bizde)}</b> kesin bizde · <b class="g">${fmt.sayi(s.oy_kullandi)}</b> oy kullandı`;
}
function cipHtml(grup, secenek, sayim, secilenler, nokta = false) {
  const n = sayim[secenek.k] || 0; const aktif = secilenler.includes(secenek.k);
  return `<button type="button" class="kc${aktif ? ' on' : ''}${secenek.sinif ? ' ' + secenek.sinif : ''}" data-g="${grup}" data-v="${esc(secenek.k)}" aria-pressed="${aktif}">`
    + `${nokta ? `<span class="kc-nokta" style="background:${GUN_RENK[secenek.k]}"></span>` : ''}${esc(secenek.ad)} <span class="n">${fmt.sayi(n)}</span></button>`;
}
const cipGrup = (g, liste, sayim, nokta) => liste.map(s => cipHtml(g, s, sayim[g], d[g], nokta)).join('');
// "Benim listem" yalnız referansı olan kullanıcıda (ya da adres çubuğundan seçilmişse) görünür
const digerCipler = benVar => DIGER_CIP.filter(x => x.k !== 'benim' || benVar || d.diger.includes('benim'));
function basHtml() {
  return SUTUNLAR.map(s => {
    if (!s.k) return `<div class="c-${s.c}">${esc(s.ad)}</div>`;
    const aktif = d.sira?.alan === s.k, yon = aktif ? d.sira.yon : null;
    return `<div class="c-${s.c} sirali${aktif ? ' aktif' : ''}" data-sira="${s.k}" aria-sort="${yon === 'artan' ? 'ascending' : yon === 'azalan' ? 'descending' : 'none'}" title="${esc((s.kisa || s.ad) + ' sütununa göre sırala')}">${esc(s.ad)}${aktif ? `<span class="ks-ok">${yon === 'artan' ? '↑' : '↓'}</span>` : ''}</div>`;
  }).join('');
}
function telHucre(f, dar) {
  const cep = f.cep || f.cep2;
  const yaz = (metin, link, baglanti) => (dar && link ? `<a class="ks-tel" href="${link}" title="Ara">${esc(metin)}</a>` : `<span title="${esc(baglanti || metin)}">${esc(metin)}</span>`);
  if (cep) {
    const link = fmt.telLink(cep);
    return yaz(link ? fmt.tel(cep) : cep, link, cep) + (!f.cep ? '<span class="ks-alt">2. yetkili</span>' : '');
  }
  if (f.sabit_tel) {
    const ilk = String(f.sabit_tel).split(/\s*[-/,;]\s*/).find(t => t.replace(/\D/g, '').length >= 7) || String(f.sabit_tel);
    const link = fmt.telLink(ilk);
    return yaz(link ? fmt.tel(ilk) : ilk, link, f.sabit_tel) + '<span class="ks-alt">sabit hat</span>';
  }
  return '<span class="ks-yok">Numara yok</span>';
}
function gunHucre(f, yaz) {
  const etiket = f.durum === 'oy_kullandi' ? '✓ OY KULLANDI' : (DURUM_AD[f.durum] || f.durum);
  const ipucu = [f.kendi_geldi && f.durum === 'oy_kullandi' ? 'Kendi geldi' : '',
    f.durum !== 'bekliyor' && f.durum_zamani ? `${fmt.saat(f.durum_zamani)}${f.durum_kim ? ' · ' + ilkAd(f.durum_kim) : ''}` : ''].filter(Boolean).join(' · ');
  const rozet = `<span class="kb kb-d-${esc(f.durum)}"${ipucu ? ` title="${esc(ipucu)}"` : ''}>${esc(etiket)}</span>`;
  // Karşılama: referans (kişiyi tanıyan yönetim kurulu üyesi) ya da başkası karşılar; kim karşıladıysa o yazılır
  if (f.karsilayan) {
    const z = f.karsilama_zamani ? ` · ${fmt.saat(f.karsilama_zamani)}` : '';
    return `${rozet}<span class="ks-kars" title="Karşılayan: ${esc(trBaslik(f.karsilayan))}${esc(z)}">Karşılayan: ${esc(ilkAd(f.karsilayan))}${esc(z)}</span>`;
  }
  if (yaz && (f.durum === 'yolda' || f.durum === 'fuarda') && isaretleyebilirMi(f)) {
    return `${rozet}<button type="button" class="ks-kars-dugme" data-karsila title="${referansBenMi(f) ? 'Kişiyi ben karşıladım' : 'Kişiyi ben karşıladım (referans başkası)'}">${referansBenMi(f) ? 'Karşıladım' : 'Ben karşıladım'}</button>`;
  }
  return rozet;
}
function ulasimHucre(f, u, arac) {
  if (u === 'servis') {
    const ipucu = [f.rota_kod ? trBaslik(f.rota_kod) + (f.rota_sira ? ` · ${f.rota_sira}. durak` : '') : 'Servisle alınacak',
      arac ? fmt.plaka(arac.plaka) + (arac.sofor_ad ? ' · ' + trBaslik(arac.sofor_ad) : '') : 'araç atanmadı'].join(' · ');
    return `<span class="kb kb-u" title="${esc(ipucu)}">SERVİS</span>`;
  }
  if (u === 'kendi') return '<span class="kb kb-u" title="Kendisi gelecek">KENDİ GELECEK</span>';
  return f.oy_sinifi === 'bizde' ? '<span class="kb kb-u kb-u-yok" title="Ulaşım bilgisi yok">ULAŞIM YOK</span>' : '<span class="ks-yok" title="Ulaşım bilgisi yok">-</span>';
}
function sorumluHucre(f) {
  const p = uye(f.sorumlu_id);
  if (p) return `<span class="ks-av" aria-hidden="true">${esc(bas(p.ad_soyad))}</span><span class="ks-sor-ad" title="${esc(p.ad_soyad + (ROL_AD[p.rol] ? ' · ' + ROL_AD[p.rol] : ''))}">${esc(trBaslik(p.ad_soyad.split(/\s+/)[0]))}</span>`;
  if (f.sorumlu_id) return '<span class="ks-yok">Bilinmiyor</span>';
  return f.oy_sinifi === 'bizde' || f.oy_sinifi === 'yolda' ? '<span class="ks-yok" title="Sorumlu atanmadı">-</span>' : '';
}
function uyariHucre(f, g) {
  const r = [];
  if (g) r.push(`<span class="kb kb-late" title="${g} dk gecikti">◷</span>`);
  if (f.evrak_uyari) r.push(`<span class="kb kb-evrak" title="${esc(f.evrak_uyari)}">▲</span>`);
  if ((f.kisi_oy_sayisi || 0) > 1) r.push(`<span class="kb kb-2oy" title="Aynı kişi ${f.kisi_oy_sayisi} firmayla oy kullanıyor">${f.kisi_oy_sayisi}</span>`);
  if (f.toplulukta) r.push('<span class="kb kb-top" title="Toplulukta">◉</span>');
  return r.join('');
}
function satirHtml(f, yaz, g, dar) {
  const u = ulasim(f);
  const arac = aracOf(f);
  const altSatir = [f.tur, f.oda_sicil ? 'Oda sicil ' + f.oda_sicil : ''].filter(Boolean).join(' · ');
  const ref = f.referans ? `<span title="${esc(refAd(f.referans) + (f.referans2 ? ' + ' + refAd(f.referans2) : ''))}">${esc(refAd(f.referans))}</span>` : '<span class="ks-yok">Yok</span>';
  return `<div class="ks-satir${f.id === secili ? ' secili' : ''}" data-id="${f.id}">
    <div class="c-firma"><div class="ks-ilzam" style="margin-bottom:3px">${ilzamRozet(f, 'kucuk')}</div><div class="ks-firma" title="${esc(f.unvan || '')}">${esc(f.unvan || '')}</div>${altSatir ? `<div class="ks-firma-alt">${esc(altSatir)}</div>` : ''}</div>
    <div class="c-yet"><div class="ks-ad" title="${esc(trBaslik(f.yetkili || ''))}">${f.yetkili ? esc(trBaslik(f.yetkili)) : '<span class="ks-yok">Yetkili yok</span>'}</div>${f.yetkili2 ? `<div class="ks-ad2" title="2. yetkili: ${esc(trBaslik(f.yetkili2))}">+ ${esc(trBaslik(f.yetkili2))}</div>` : ''}</div>
    <div class="c-cep">${telHucre(f, dar)}</div>
    <div class="c-ilce">${esc(trBaslik(f.ilce || ''))}</div>
    <div class="c-ref">${ref}</div>
    <div class="c-sor">${sorumluHucre(f)}</div>
    <div class="c-sinif"><span class="kb kb-s-${esc(f.oy_sinifi)}">${esc(SINIF_CIP.find(s => s.k === f.oy_sinifi)?.ad || SINIF_AD[f.oy_sinifi] || f.oy_sinifi)}</span></div>
    <div class="c-gun">${gunHucre(f, yaz)}</div>
    <div class="c-ulasim">${ulasimHucre(f, u, arac)}</div>
    <div class="c-saat">${esc(fmt.saatKisa(f.tasima_saati))}</div>
    <div class="c-uyari">${uyariHucre(f, g)}</div>
    <div class="c-eylem">${yaz && f.durum !== 'oy_kullandi' ? '<button type="button" class="ks-oy" data-oy title="Oy kullandı olarak işaretle">✓ Oy</button>' : ''}</div>
  </div>`;
}
function bosGovdeHtml(r) {
  if (!r.toplam) return '<div class="ks-bos"><div class="ks-bos-ikon">⌕</div><div class="ks-bos-baslik">Liste henüz yüklenmedi</div><div class="ks-bos-alt">Bağlantı gelince kendiliğinden dolacak.</div></div>';
  return `<div class="ks-bos"><div class="ks-bos-ikon">⌕</div><div class="ks-bos-baslik">Bu filtrelerle kimse yok</div><div class="ks-bos-alt">Aramayı kısaltmayı ya da bir filtreyi kaldırmayı deneyin.</div><button type="button" class="ks-bos-dugme" data-temizle>Filtreleri temizle</button></div>`;
}
// Satır listesi satır satır güncellenir: değişmeyen satır yerinde kalır (canlı yenileme odaktaki düğmeyi,
// seçili metni ve o an basılı tıklamayı bozmaz), yalnız değişen satır yeniden kurulur, sıra değişirse taşınır.
const sablon = document.createElement('template');
function govdeCiz(r) {
  const tb = $('[data-govde]', kok); if (!tb) return;
  if (!r.sonuc.length) {
    const html = bosGovdeHtml(r);
    if (sonHtml.govde !== html) { tb.innerHTML = html; sonHtml.govde = html; }
    return;
  }
  if (sonHtml.govde) { tb.innerHTML = ''; sonHtml.govde = ''; }
  const yaz = yazabilirMi(), dar = darMi();
  const liste = r.sonuc.slice(0, limit);
  const mevcut = new Map();
  for (const tr of tb.children) if (tr.dataset.id) mevcut.set(tr.dataset.id, tr);
  const htmller = liste.map(f => satirOnbellekli(f, yaz, r.gec.get(f.id) || 0, dar));
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
function satirOnbellekli(f, yaz, gec, dar) {
  const arac = f.arac_id ? store.araclar.get(f.arac_id) : null, sor = uye(f.sorumlu_id), sec = f.id === secili;
  const k = satirOnbellek.get(f.id);
  if (k && k.f === f && k.arac === arac && k.sor === sor && k.gec === gec && k.sec === sec && k.yaz === yaz && k.dar === dar) return k.html;
  const html = satirHtml(f, yaz, gec, dar);
  satirOnbellek.set(f.id, { f, arac, sor, gec, sec, yaz, dar, html });
  return html;
}
function devamHtml(r) {
  const n = r.sonuc.length; if (!n) return '';
  const gosterilen = Math.min(limit, n);
  if (gosterilen >= n) return '';
  return `<span>+ ${fmt.sayi(n - gosterilen)} kişi daha · aramayı daraltın</span>`
    + `<button type="button" class="ks-kucuk" data-daha>${fmt.sayi(Math.min(SAYFA, n - gosterilen))} daha göster</button>`
    + `<button type="button" class="ks-kucuk" data-tumu>Tümünü göster</button>`;
}
function secenekYaz(sel, secenekler, deger) {
  const ayni = sel.options.length === secenekler.length && secenekler.every((s, i) => sel.options[i].value === s.v);
  if (ayni) secenekler.forEach((s, i) => { if (sel.options[i].text !== s.ad) sel.options[i].text = s.ad; });
  else sel.innerHTML = secenekler.map(s => `<option value="${esc(s.v)}">${esc(s.ad)}</option>`).join('');
  if (sel.value !== deger) sel.value = deger;
  sel.classList.toggle('dolu', !!deger);
}
function seciciler(r) {
  const refSel = $('[data-referans]', kok), ilceSel = $('[data-ilce]', kok), sorSel = $('[data-sorumlu]', kok);
  if (!refSel || !ilceSel || !sorSel) return;
  const refler = referanslar(); if (d.referans && d.referans !== YOK && !refler.includes(d.referans)) refler.push(d.referans);
  secenekYaz(refSel, [
    { v: '', ad: 'Referans: tümü' },
    { v: YOK, ad: `Referansı yok (${fmt.sayi(r.sayim.referans[YOK] || 0)})` },
    ...refler.map(x => ({ v: x, ad: `${refAd(x)} (${fmt.sayi(r.sayim.referans[x] || 0)})` })),
  ], d.referans);
  const ilc = ilceler(); if (d.ilce && d.ilce !== YOK && !ilc.includes(d.ilce)) ilc.push(d.ilce);
  secenekYaz(ilceSel, [
    { v: '', ad: 'İlçe: tümü' },
    ...(r.sayim.ilce[YOK] || d.ilce === YOK ? [{ v: YOK, ad: `İlçesi yok (${fmt.sayi(r.sayim.ilce[YOK] || 0)})` }] : []),
    ...ilc.map(x => ({ v: x, ad: `${trBaslik(x)} (${fmt.sayi(r.sayim.ilce[x] || 0)})` })),
  ], d.ilce);
  const takim = ekip(); if (d.sorumlu && d.sorumlu !== YOK && !takim.some(p => p.id === d.sorumlu)) { const p = uye(d.sorumlu); if (p) takim.push(p); }
  secenekYaz(sorSel, [
    { v: '', ad: 'Sorumlu: tümü' },
    { v: YOK, ad: `Atanmamış (${fmt.sayi(r.sayim.sorumlu[YOK] || 0)})` },
    ...takim.map(p => ({ v: p.id, ad: `${p.ad_soyad}${ROL_AD[p.rol] ? ' · ' + ROL_AD[p.rol] : ''} (${fmt.sayi(r.sayim.sorumlu[p.id] || 0)})` })),
  ], d.sorumlu);
  const siraSel = $('[data-sira-sec]', kok);
  if (siraSel) { const v = d.sira ? `${d.sira.alan}.${d.sira.yon}` : ''; if (siraSel.value !== v) siraSel.value = v; }
  const say = d.sinif.length + d.durum.length + d.ulasim.length + d.diger.length + (d.referans ? 1 : 0) + (d.ilce ? 1 : 0) + (d.sorumlu ? 1 : 0);
  const ac = $('[data-filtre-ac]', kok);
  if (ac) { const s = ac.querySelector('[data-filtre-say]'); s.textContent = say ? String(say) : ''; s.hidden = !say; }
}
// telefonda sıralama sütun başlığıyla değil bu seçimle yapılır
function siraSecenekHtml() {
  return '<option value="">Sıra: varsayılan</option>' + SUTUNLAR.filter(s => s.k).map(s =>
    `<option value="${s.k}.artan">${esc(s.kisa)} ↑</option><option value="${s.k}.azalan">${esc(s.kisa)} ↓</option>`).join('');
}

// ---------------------------------------------------------------- çizim
const parca = (anahtar, secici, html) => {
  if (sonHtml[anahtar] === html) return false;
  const e = $(secici, kok); if (!e) return false;
  e.innerHTML = html; sonHtml[anahtar] = html; return true;
};
function ciz() {
  if (!kok || !kok.isConnected) return;
  const dar = darMi();
  if (sonDar !== null && sonDar !== dar) satirOnbellek.clear();      // telefon <-> masaüstü: telefon numarası bağlantı olur / düz metin kalır
  sonDar = dar;
  son = hesapla();
  if (secili && !son.sonuc.some(f => f.id === secili)) secili = null;
  parca('ozet', '[data-ozet]', ozetHtml());
  parca('say', '[data-say]', filtreVarMi() ? `${fmt.sayi(son.sonuc.length)} sonuç` : `${fmt.sayi(son.sonuc.length)} kişi`);
  parca('sinif', '[data-c="sinif"]', cipGrup('sinif', SINIF_CIP, son.sayim));
  parca('ulasim', '[data-c="ulasim"]', cipGrup('ulasim', ULASIM_CIP, son.sayim));
  parca('durum', '[data-c="durum"]', cipGrup('durum', DURUM_CIP, son.sayim, true));
  parca('diger', '[data-c="diger"]', cipGrup('diger', digerCipler(son.benVar), son.sayim));
  parca('bas', '[data-bas]', basHtml());
  govdeCiz(son);
  parca('devam', '[data-devam]', devamHtml(son));
  seciciler(son);
  const var_ = filtreVarMi();
  kok.querySelectorAll('[data-temizle-ust]').forEach(t => { t.hidden = !var_; });
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

// tablo kartı ekranın kalanını doldurur (başlık sabit, yalnız satırlar kayar)
function yukseklikAyarla() {
  if (!kok) return;
  const kart = $('[data-kart]', kok); if (!kart) return;
  if (darMi()) { kart.style.height = ''; return; }   // telefonda sayfa kayar
  const ust = kart.getBoundingClientRect().top + window.scrollY;
  kart.style.height = Math.max(360, window.innerHeight - ust - 16) + 'px';
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
// Tasarım: servisle gelmeyen biri "✓ Oy" ile işaretlenirse kendi geldi sayılır.
async function oyVer(id) {
  if (!yazabilirMi()) return toast('İşaretleme yetkin yok', { tur: 'hata' });
  const f = store.firmalar.get(id); if (!f) return;
  if (f.durum === 'oy_kullandi') return toast(`${firmaAdi(f)} zaten oy kullandı olarak işaretli`);
  const t = Date.now(); if (t - (kilit.get(id) || 0) < 1200) return;
  kilit.set(id, t);
  try { await isaretle(id, 'oy_kullandi', { kendi: ulasim(f) !== 'servis' }); } catch (e) { hataGoster(e); } finally { kilit.delete(id); }
}
async function karsila(id) {
  const f = store.firmalar.get(id); if (!f || f.karsilayan) return;
  const t = Date.now(); if (t - (kilit.get('k' + id) || 0) < 1200) return;
  kilit.set('k' + id, t);
  try {
    await karsiladim(id);
    toast(`${firmaAdi(f)} · ${store.ben?.ad_soyad ? trBaslik(store.ben.ad_soyad) : 'siz'} karşıladı`, { tur: 'basari' });
  } catch (e) { hataGoster(e); } finally { kilit.delete('k' + id); }
}
function seciliyiTasi(adim) {
  if (!son?.sonuc.length) return;
  let i = son.sonuc.findIndex(f => f.id === secili);
  i = i < 0 ? (adim > 0 ? 0 : son.sonuc.length - 1) : Math.max(0, Math.min(son.sonuc.length - 1, i + adim));
  secili = son.sonuc[i].id;
  if (i >= limit) limit = Math.ceil((i + 1) / SAYFA) * SAYFA;
  ciz();
  $(`.ks-satir[data-id="${secili}"]`, kok)?.scrollIntoView({ block: 'nearest' });
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
    'Sorumlu', 'Karşılayan', 'Karşılama saati', 'Gecikme (dk)', 'Aynı kişinin oy sayısı', 'Evrak uyarısı', 'Toplulukta', 'Oda sicil', 'Ticari sicil', 'Notlar'];
  const satirlar = r.sonuc.map(f => {
    const a = aracOf(f); const u = ulasim(f);
    return [
      f.sn, f.unvan, f.tur, trBaslik(f.yetkili || ''), f.cep ? fmt.tel(f.cep) : '', trBaslik(f.yetkili2 || ''), f.cep2 ? fmt.tel(f.cep2) : '', sabitTelMetni(f.sabit_tel),
      trBaslik(f.ilce || ''), f.adres, f.referans, f.referans2,
      SINIF_AD[f.oy_sinifi] || f.oy_sinifi, DURUM_AD[f.durum] || f.durum, f.kendi_geldi ? 'Evet' : '', f.durum_zamani && f.durum !== 'bekliyor' ? fmt.saat(f.durum_zamani) : '', f.durum_kim && f.durum !== 'bekliyor' ? f.durum_kim : '',
      u === 'servis' ? 'Servis' : u === 'kendi' ? 'Kendi gelecek' : '', fmt.saatKisa(f.tasima_saati), f.rota_kod ? trBaslik(f.rota_kod) + (f.rota_sira ? ` · ${f.rota_sira}. durak` : '') : '',
      a ? fmt.plaka(a.plaka) : '', a ? trBaslik(a.sofor_ad || '') : '', a?.sofor_tel ? fmt.tel(a.sofor_tel) : '',
      sorumluAd(f), f.karsilayan ? trBaslik(f.karsilayan) : '', f.karsilayan && f.karsilama_zamani ? fmt.saat(f.karsilama_zamani) : '', r.gec.get(f.id) || '', f.kisi_oy_sayisi > 1 ? f.kisi_oy_sayisi : '', f.evrak_uyari, f.toplulukta ? 'Evet' : '', f.oda_sicil, f.ticari_sicil, f.notlar,
    ];
  });
  const metin = [baslik, ...satirlar].map(s => s.map(csvHucre).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + metin], { type: 'text/csv;charset=utf-8' });
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
    <div class="ks-ust">
      <div class="ks-baslik">Kişiler</div>
      <div class="ks-ozet" data-ozet></div>
      <div class="ks-bosluk"></div>
      <button type="button" class="ks-temizle ks-temizle-masaustu" data-temizle data-temizle-ust hidden>Filtreleri temizle</button>
      <div class="ks-say" data-say></div>
      <button type="button" class="ks-csv" data-csv>⤓ CSV</button>
      <label class="ks-ara" title="Ad, firma, telefon, referans, ilçe, sicil ya da not ara · Enter: ilk kişinin kartı · ⌘Enter: oy kullandı">
        <span class="ks-ara-ikon" aria-hidden="true">⌕</span>
        <input type="search" data-kisi-ara placeholder="Ad, firma, ilçe ara…" autocomplete="off" spellcheck="false" aria-label="Kişilerde ara">
        <button type="button" class="ks-ara-temizle" data-ara-temizle title="Aramayı temizle (Esc)" hidden>✕</button>
      </label>
    </div>
    <div class="ks-dar-arac">
      <select class="ks-sel" data-sira-sec aria-label="Sıralama">${siraSecenekHtml()}</select>
      <button type="button" class="ks-sel ks-filtre-ac" data-filtre-ac aria-expanded="false">Filtreler <span class="ks-say-rozet" data-filtre-say hidden></span> ▾</button>
      <button type="button" class="ks-temizle" data-temizle data-temizle-ust hidden>Filtreleri temizle</button>
    </div>
    <div class="ks-filtre" data-filtre>
      <div class="ks-fsatir">
        <div class="ks-lbl">OY SINIFI</div>
        <span data-c="sinif" class="ks-c"></span>
        <div class="ks-ayrac"></div>
        <div class="ks-lbl ks-lbl-k">ULAŞIM</div>
        <span data-c="ulasim" class="ks-c"></span>
        <div class="ks-ayrac"></div>
        <select class="ks-sel" data-sorumlu aria-label="Sorumlu"></select>
      </div>
      <div class="ks-fsatir">
        <div class="ks-lbl">GÜN</div>
        <span data-c="durum" class="ks-c"></span>
        <div class="ks-ayrac"></div>
        <span data-c="diger" class="ks-c"></span>
        <select class="ks-sel" data-referans aria-label="Referans"></select>
        <select class="ks-sel" data-ilce aria-label="İlçe"></select>
      </div>
    </div>
    <div class="ks-kart" data-kart>
      <div class="ks-kap" data-kap>
        <div class="ks-ic">
          <div class="ks-bas" data-bas></div>
          <div data-govde></div>
          <div class="ks-devam" data-devam></div>
        </div>
      </div>
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
  $('[data-sorumlu]', kok).addEventListener('change', e => { d.sorumlu = e.target.value; filtreDegisti(); });
  $('[data-filtre]', kok).addEventListener('click', e => {
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
    const tel = e.target.closest('a[href]');
    if (tel && darMi()) return;                                // telefonda numara arar, kart açılmaz
    const tr = e.target.closest('.ks-satir[data-id]'); if (!tr) return;
    const id = Number(tr.dataset.id);
    if (e.target.closest('[data-oy]')) { oyVer(id); return; }
    if (e.target.closest('[data-karsila]')) { karsila(id); return; }
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
    const blok = $('[data-filtre]', kok); const acik = blok.classList.toggle('acik');
    e.currentTarget.setAttribute('aria-expanded', String(acik));
    yukseklikAyarla();
  });
  // aşağı kaydırdıkça sonraki 200 satır kendiliğinden gelir
  $('[data-kap]', kok).addEventListener('scroll', dahaGerekirse, { passive: true });
  window.addEventListener('scroll', dahaGerekirse, { passive: true });
  temizlikler.push(() => window.removeEventListener('scroll', dahaGerekirse));
  // yükseklik: pencere, üst kısım ve çevrimdışı şeridi değiştikçe
  const boyut = () => { yukseklikAyarla(); if (sonDar !== darMi()) cizimIste(); };
  window.addEventListener('resize', boyut);
  temizlikler.push(() => window.removeEventListener('resize', boyut));
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(yukseklikAyarla);
    [$('[data-filtre]', kok), $('.ks-ust', kok), document.getElementById('cevrimdisi')].filter(Boolean).forEach(x => ro.observe(x));
    temizlikler.push(() => ro.disconnect());
  }
  // kişi kartı kapanınca satırdaki seçili vurgusu kalkar
  const katman = document.getElementById('katman');
  if (katman && 'MutationObserver' in window) {
    const mo = new MutationObserver(() => {
      if (!secili || katman.querySelector('.cekmece')) return;
      if (document.activeElement === $('[data-kisi-ara]', kok)) return;   // klavye imleci (↑↓) arama kutusundayken korunur
      secili = null; cizimIste();
    });
    mo.observe(katman, { childList: true });
    temizlikler.push(() => mo.disconnect());
  }
  // canlı veri: app.js yenile() kare başına tek sebep iletir; veri olaylarını kaçırmamak için doğrudan dinlenir
  for (const ad of ['firma', 'firmalar', 'arac', 'araclar', 'profil', 'saat', 'hazir']) temizlikler.push(bus.on(ad, cizimIste));
}

function stilEkle() {
  if (document.querySelector('style[data-ekran="kisiler"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'kisiler';
  s.textContent = `
  .kisiler { --ks-kol: minmax(130px,1.5fr) minmax(100px,1fr) 108px 80px 100px 78px 124px 124px 112px 46px 88px 58px; display: flex; flex-direction: column; gap: 12px; margin: -4px 0; color: var(--ink); }
  .kisiler [hidden] { display: none !important; }
  .kisiler button, .kisiler select, .kisiler input { font-family: inherit; }
  /* ---- üst satır */
  .ks-ust { flex: none; display: flex; align-items: center; gap: 16px; }
  .ks-baslik { font-size: 24px; font-weight: 900; letter-spacing: -.02em; white-space: nowrap; }
  .ks-ozet { font-size: 14px; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ks-ozet b { color: var(--ink); } .ks-ozet b.k { color: var(--red); } .ks-ozet b.g { color: var(--green); }
  .ks-bosluk { flex: 1; }
  .ks-say { font-size: 13px; color: var(--ink-3); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ks-csv { height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .ks-csv:hover:not(:disabled) { background: var(--hover); }
  .ks-csv:disabled { opacity: .5; cursor: not-allowed; }
  .ks-ara { position: relative; width: 380px; height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 12px; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--line-2); background: var(--surface); cursor: text; }
  .ks-ara:focus-within { border-color: var(--ink-3); }
  .ks-ara-ikon { color: var(--ink-3); font-size: 16px; }
  .ks-ara input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 14px; -webkit-appearance: none; appearance: none; }
  .ks-ara input::-webkit-search-cancel-button { display: none; }
  .ks-ara-temizle { flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink-3); font-size: 12px; cursor: pointer; }
  .ks-ara-temizle:hover { background: var(--surface-3); color: var(--ink); }
  /* ---- filtre çipleri */
  .ks-filtre { flex: none; display: flex; flex-direction: column; gap: 8px; }
  .ks-fsatir { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .ks-c { display: contents; }
  .ks-lbl { width: 78px; font-size: 11px; font-weight: 700; letter-spacing: .08em; color: var(--ink-3); white-space: nowrap; }
  .ks-lbl-k { width: auto; margin-right: 4px; }
  .ks-ayrac { width: 1px; height: 20px; background: var(--line-2); margin: 0 6px; }
  .kc { height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; border-radius: 99px; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); }
  .kc:hover { border-color: var(--ink-3); }
  .kc .n { opacity: .65; font-variant-numeric: tabular-nums; }
  .kc-nokta { width: 8px; height: 8px; border-radius: 99px; flex: none; }
  .kc.late:not(.on) { border-color: var(--amber); color: var(--amber-ink); }
  .kc.evrak:not(.on) { border-color: var(--yellow); color: var(--yellow-ink); }
  .kc.on, .kc.on:hover { border-color: var(--ink); background: var(--ink); color: var(--surface); }
  .ks-sel { height: 30px; max-width: 230px; padding: 0 8px; border-radius: 99px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .ks-sel.dolu { border-color: var(--ink); font-weight: 800; }
  /* seçili değerin genişliğine uyar (Chrome); desteklemeyen tarayıcıda en uzun seçeneğe göre açılır, bu yüzden sabit genişlik */
  .ks-filtre .ks-sel { field-sizing: content; }
  @supports not (field-sizing: content) { .ks-filtre .ks-sel[data-referans] { width: 138px; } .ks-filtre .ks-sel[data-ilce] { width: 108px; } .ks-filtre .ks-sel[data-sorumlu] { width: 142px; } }
  .ks-temizle { height: 30px; padding: 0 10px; border: 0; background: none; color: var(--red); font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .ks-temizle:hover { text-decoration: underline; }
  .ks-dar-arac { display: none; }
  /* ---- tablo kartı */
  .ks-kart { flex: none; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; min-height: 360px; }
  .ks-kap { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .ks-ic { min-width: 1340px; }
  .ks-bas, .ks-satir { display: grid; grid-template-columns: var(--ks-kol); gap: 12px; align-items: center; padding: 0 16px; }
  .ks-bas { position: sticky; top: 0; z-index: 2; height: 38px; border-bottom: 1px solid var(--line); background: var(--surface-2); font-size: 11px; font-weight: 700; letter-spacing: .07em; color: var(--ink-3); white-space: nowrap; }
  .ks-bas > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .ks-bas .sirali { cursor: pointer; user-select: none; }
  .ks-bas .sirali:hover { color: var(--ink); }
  .ks-bas .aktif { color: var(--red); }
  .ks-ok { margin-left: 4px; font-size: 12px; }
  .ks-satir { min-height: 56px; border-bottom: 1px solid var(--line); cursor: pointer; scroll-margin-top: 40px; scroll-margin-bottom: 6px; }
  .ks-satir:hover { background: var(--hover); }
  .ks-satir.secili, .ks-satir.secili:hover { background: var(--hover); box-shadow: inset 3px 0 0 var(--red); }
  .ks-satir > div { min-width: 0; }
  .ks-satir .c-firma { display: flex; flex-direction: column; gap: 2px; }
  .ks-firma { font-size: 13px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .ks-firma-alt { font-size: 11px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ks-satir .c-yet { display: flex; flex-direction: column; gap: 1px; }
  .ks-ad { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ks-ad2 { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ks-satir .c-cep { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ks-tel { color: var(--ink); } .ks-tel:hover { color: var(--red); text-decoration: underline; }
  .ks-alt { display: block; font-size: 11px; font-weight: 500; color: var(--ink-3); }
  .ks-yok { color: var(--ink-3); font-size: 12px; font-weight: 500; }
  .ks-satir .c-ilce { font-size: 13px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ks-satir .c-ref { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ks-satir .c-sor { display: flex; align-items: center; gap: 6px; }
  .ks-av { flex: none; width: 22px; height: 22px; border-radius: 99px; background: var(--ink); color: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 800; }
  .ks-sor-ad { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ks-satir .c-gun { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
  .ks-kars { max-width: 100%; font-size: 10px; line-height: 1.2; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .ks-kars-dugme { height: 20px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--violet); background: var(--surface); color: var(--violet); font-size: 10.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .ks-kars-dugme:hover, .ks-kars-dugme:focus-visible { background: var(--violet-soft); outline: 0; }
  .ks-satir .c-saat { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink); }
  .ks-satir .c-uyari { display: flex; gap: 4px; flex-wrap: wrap; }
  .ks-satir .c-eylem { display: flex; justify-content: flex-end; }
  /* rozetler (tasarımdaki B taban stili ve varyantları) */
  .kb { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; font-variant-numeric: tabular-nums; border: 1.5px solid transparent; }
  .kb-s-bizde { background: var(--red); color: var(--on-red); border-color: var(--red); }
  .kb-s-yolda { background: transparent; color: var(--red); border-color: var(--red); }
  .kb-s-belirsiz { background: var(--gray-soft); color: var(--ink-2); border-color: var(--gray-soft); }
  .kb-s-karsi { background: var(--karsi); color: var(--karsi-ink); border-color: var(--karsi); }
  .kb-s-oy_yok { background: var(--surface-3); color: var(--ink-3); border-color: var(--line); text-decoration: line-through; }
  .kb-d-bekliyor { background: var(--gray-soft); color: var(--ink-2); border-color: var(--gray-soft); }
  .kb-d-arandi { background: var(--blue-soft); color: var(--blue); border-color: var(--blue-soft); }
  .kb-d-yolda { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber-soft); }
  .kb-d-fuarda { background: var(--violet-soft); color: var(--violet); border-color: var(--violet-soft); }
  .kb-d-oy_kullandi { background: var(--green); color: #fff; border-color: var(--green); }
  .kb-u { background: transparent; color: var(--ink-2); border: 1px solid var(--line-2); font-weight: 600; }
  .kb-u-yok { color: var(--amber-ink); border-color: var(--amber); }
  .kb-late { background: var(--amber-soft); color: var(--amber-ink); border-color: var(--amber); animation: smPulse 1.6s ease-in-out infinite; }
  .kb-evrak { background: var(--yellow-soft); color: var(--yellow-ink); border-color: var(--yellow); }
  .kb-2oy { background: var(--surface); color: var(--ink); border-color: var(--ink); }
  .kb-top { background: transparent; color: var(--ink-2); border: 1px solid var(--line-2); font-weight: 600; padding: 0 6px; }
  .ks-oy { height: 30px; padding: 0 10px; border-radius: 8px; border: 1.5px solid var(--green); background: var(--surface); color: var(--green); font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .ks-oy:hover, .ks-oy:focus-visible { background: var(--green-soft); outline: 0; }
  .ks-oy:active { background: var(--green); color: #fff; }
  /* boş durum ve devam */
  .ks-bos { padding: 80px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .ks-bos-ikon { width: 48px; height: 48px; border-radius: 99px; border: 1.5px dashed var(--line-2); display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--ink-3); }
  .ks-bos-baslik { font-size: 16px; font-weight: 800; }
  .ks-bos-alt { font-size: 13.5px; color: var(--ink-2); }
  .ks-bos-dugme { margin-top: 6px; height: 36px; padding: 0 14px; border-radius: 9px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 700; cursor: pointer; }
  .ks-bos-dugme:hover { background: var(--hover); }
  .ks-devam { padding: 14px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; position: sticky; left: 0; }
  .ks-devam:empty { display: none; }
  .ks-kucuk { height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 700; cursor: pointer; }
  .ks-kucuk:hover { background: var(--hover); }
  .ks-say-rozet { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px; background: var(--red); color: var(--on-red); font-size: 11px; font-weight: 800; }
  @media (max-width: 1100px) { .ks-ara { width: 300px; } }
  /* ---- telefon: satırlar karta döner, çipler "Filtreler" düğmesinin arkasında, sayfa kayar */
  @media ${DAR} {
    .kisiler { gap: 10px; margin: 0; }
    .ks-ust { flex-wrap: wrap; gap: 8px 12px; }
    .ks-baslik { font-size: 22px; }
    .ks-ozet { white-space: normal; font-size: 13px; flex: 1 1 100%; order: 2; }
    .ks-bosluk { display: none; }
    .ks-say { order: 3; margin-left: auto; }
    .ks-csv { order: 4; height: 36px; }
    .ks-ara { order: 5; flex: 1 1 100%; width: auto; height: 44px; }
    .ks-ara input { font-size: 16px; }
    .ks-dar-arac { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .ks-dar-arac select.ks-sel { flex: 1 1 40%; height: 40px; max-width: none; border-radius: 10px; font-size: 14px; }
    .ks-filtre-ac { flex: 0 0 auto; height: 40px; padding: 0 14px; border-radius: 10px; font-weight: 700; }
    .ks-filtre:not(.acik) { display: none; }
    .ks-fsatir { gap: 6px; }
    .ks-lbl { flex: 1 1 100%; width: auto; margin: 4px 0 0; }
    .ks-lbl-k { margin-right: 0; }
    .ks-ayrac, .ks-temizle-masaustu { display: none; }
    .kc { height: 34px; padding: 0 12px; font-size: 13px; }
    .ks-fsatir .ks-sel { height: 38px; border-radius: 10px; font-size: 14px; flex: 1 1 40%; max-width: none; }
    .ks-kart { height: auto !important; min-height: 0; overflow: visible; border: 0; background: transparent; box-shadow: none; border-radius: 0; }
    .ks-kap { overflow: visible; }
    .ks-ic { min-width: 0; }
    .ks-bas { display: none; }
    .ks-satir { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 11px 12px; margin-bottom: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
    .ks-satir > div { min-width: auto; }
    .ks-satir > div:empty, .ks-satir > .c-sor:has(> .ks-yok), .ks-satir > .c-ulasim:has(> .ks-yok) { display: none; }
    .c-yet { order: 1; flex: 1 1 0; min-width: 0 !important; }
    .c-eylem { order: 2; flex: 0 0 auto; }
    .c-firma { order: 3; flex: 1 1 100%; margin-top: -4px; }
    .c-cep { order: 4; } .c-ilce { order: 5; } .c-ref { order: 6; } .c-ref::before { content: 'Ref: '; color: var(--ink-3); }
    .c-sor { order: 7; } .c-sinif { order: 8; } .c-gun { order: 9; } .c-ulasim { order: 10; } .c-saat { order: 11; } .c-uyari { order: 12; }
    .c-cep, .c-ilce, .c-ref { white-space: normal; overflow: visible; }
    .ks-ad { font-size: 15px; }
    .ks-tel { font-size: 14px; color: var(--ink); }
    .ks-oy { height: 36px; padding: 0 14px; font-size: 13px; background: var(--green); color: #fff; }
    .ks-devam { position: static; border: 1px solid var(--line); border-radius: 12px; }
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
    limit = SAYFA; secili = null; son = null; sonDar = null; satirOnbellek.clear();
    sonHtml = { govde: '', ozet: '', say: '', sinif: '', ulasim: '', durum: '', diger: '', devam: '', bas: '' };
    kok.innerHTML = iskeletHtml();
    bagla();
    ciz();
    durumKaydet();
    yukseklikAyarla();
    requestAnimationFrame(yukseklikAyarla);   // yazı tipi ve çipler oturduktan sonra bir kez daha
    if (!window.matchMedia?.('(pointer: coarse)').matches) $('[data-kisi-ara]', kok)?.focus({ preventScroll: true });
  },
  yenile(sebep) {
    // Veri olayları bagla() içinde doğrudan dinleniyor; burada yalnız yerleşimi etkileyenler
    if (sebep === 'baglanti') yukseklikAyarla();
    else if (['firma', 'firmalar', 'arac', 'araclar', 'profil', 'saat', 'hazir'].includes(sebep)) cizimIste();
  },
  temizle() {
    temizlikler.forEach(fn => { try { fn(); } catch {} });
    temizlikler = [];
    kok = null; son = null;
  },
};
export default ekran;
