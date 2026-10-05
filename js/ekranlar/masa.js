// 72. Komite · Seçim Masası · MASA: CANLI KOMUTA (Claude Design "SM Masa" + "SM Gorev" birebir, ATLAS 2026-09-30)
// Seçim günü masada 8 saat açık kalan ana ekran: KPI şeridi + ilerleme halkası, ZAMAN ÇİZELGESİ | GÖREV DAĞILIMI,
// sağda AKIŞ · CEVAPSIZ · GELİŞMELER paneli. Her şey store'dan okunur; yazma yalnız core.js işlevleriyle
// (durumYap, aracAta, sorumluAta, sinifYap, bildirimCevapla ...) ve ui.isaretle ile yapılır.
import {
  store, sb, esc, fmt, trBaslik, trKucuk, dakika, simdiDk, sayac, gecikme, firmaListesi, firmaAdi, aracOf,
  yazabilirMi, ekip, aramaEslesir, DURUM_AD, SINIF_AD, ARAC_DURUM_AD, GERI_SAYIM, ROL_AD,
  durumYap, aracAta, sorumluAta, sinifYap, notEkle, aracDurumYap, bildirimCevapla, cevapsizBildirimler,
  karsiladim, referansBenMi,
} from '../core.js';
import { el, bas, rozetDurum, isaretle, kisiKartiAc, paletAc, paletKapat, modal, modalKapat, toast, hataGoster } from '../ui.js';
import { anahtar } from '../komite.js';

// ---------------------------------------------------------------- sabitler
const SOL = 176;             // çizelge satır başlığı genişliği (px)
const CHIP_G = 88, CHIP_Y = 34, CHIP_ARA = 4;   // çip ölçüsü (tasarım: 88x34)
const SATIR_MIN = 44;        // tek şeritli satır yüksekliği
const TERCIH = anahtar('secim-masa-tercih-v2');
const GUN = {
  bekliyor: { ad: 'Bekliyor', renk: 'var(--ink-3)', fiil: 'bekliyor' },
  arandi: { ad: 'Arandı', renk: 'var(--blue)', fiil: 'arandı' },
  yolda: { ad: 'Yolda', renk: 'var(--amber)', fiil: 'yola çıktı' },
  fuarda: { ad: 'Fuarda', renk: 'var(--violet)', fiil: 'fuara geldi' },
  oy_kullandi: { ad: 'Oy kullandı', renk: 'var(--green)', fiil: 'oy kullandı' },
};
const SIRA = ['bekliyor', 'arandi', 'yolda', 'fuarda', 'oy_kullandi'];
const SEKMELER = [['akis', 'AKIŞ'], ['cevapsiz', 'CEVAPSIZ'], ['gel', 'GELİŞMELER']];
const CEVAP_DURUM = { 'Aldık': 'yolda', 'Yolda': 'yolda', 'Fuarda': 'fuarda', 'Fuarda ✓': 'fuarda', 'Oy kullandı': 'oy_kullandi', 'Başkası karşıladı': 'fuarda' };
const ZINCIR_CEVAP = ['Aldık', 'Yolda', 'Fuarda', 'Sorun var'];
const LIM = 14;              // görev dağılımı sütunlarında ilk açılışta gösterilen kart sayısı

// ---------------------------------------------------------------- ekran durumu
const S = {
  kok: null, gorunum: 'cz', grup: 'rota', benim: false, sekme: 'akis', kume: null,
  imza: {}, ax: null, W: 0, sokuculer: [], zamanlayici: 0, ro: null,
  suruk: false, bekleyen: false, menu: null, gecikenModal: null,
  tumBild: [], gvAcik: new Set(), gvFiltre: '', say: { timed: 0, satir: 0 },
};
const q = s => S.kok?.querySelector(s);
const qa = s => (S.kok ? [...S.kok.querySelectorAll(s)] : []);

// ---------------------------------------------------------------- yardımcılar
const iki = n => String(n).padStart(2, '0');
const hhmm = dk => `${iki(Math.floor(dk / 60) % 24)}:${iki(Math.floor(dk % 60))}`;
const tumKisa = ad => { const p = trBaslik(ad).split(/\s+/).filter(Boolean); if (p.length < 2) return p[0] || ''; return `${p[0]} ${p[p.length - 1].charAt(0).toLocaleUpperCase('tr')}.`; };
const kisa = f => tumKisa(f?.yetkili || f?.unvan || '');
const baslikKelime = w => (/\d/.test(w) ? w : trBaslik(w));
// "SOLFER SOĞUTMA VE ..." -> "Solfer Soğutma"
function firmaKisa(f) { return String(f?.unvan || '').replace(/[,.;:()]/g, ' ').split(/\s+/).filter(x => x && x !== '-').slice(0, 2).map(baslikKelime).join(' '); }
// Türkçe iyelik eki: "Harun Bulan" -> "Harun Bulan'ın"
function iyelik(ad) {
  const s = String(ad || '').trim(); if (!s) return '';
  const k = trKucuk(s).replace(/[^a-zçğıöşü]/g, ''); const v = k.match(/[aeıioöuü]/g); const son = v ? v[v.length - 1] : 'e';
  const ek = 'aı'.includes(son) ? 'ı' : 'ei'.includes(son) ? 'i' : 'ou'.includes(son) ? 'u' : 'ü';
  return `${s}'${/[aeıioöuü]$/.test(k) ? 'n' : ''}${ek}n`;
}
function zamanAyar() {
  const z = store.ayarlar.zaman || {};
  let b = dakika(z.bas), t = dakika(z.bit);
  if (b == null || Number.isNaN(b)) b = 9 * 60;
  if (t == null || Number.isNaN(t) || t <= b) t = Math.max(b + 60, 17 * 60);
  return { bas: b, bit: t };
}
function tercihOku() { try { const t = JSON.parse(localStorage.getItem(TERCIH) || '{}'); if (['rota', 'arac'].includes(t.grup)) S.grup = t.grup; S.benim = !!t.benim; } catch { /* depolama yoksa varsayılan */ } }
function tercihYaz() { try { localStorage.setItem(TERCIH, JSON.stringify({ grup: S.grup, benim: S.benim })); } catch { /* yoksay */ } }
// Yönetim kurulu üyesi kendi tanıdığı (REFERANS sütunu adıyla eşleşen) kişileri ayrı görebilir
const benimKisilerVar = () => !!store.ben && firmaListesi().some(referansBenMi);
const listeSuz = f => !S.benim || referansBenMi(f);
function benimDugme() {
  if (!benimKisilerVar()) return '';
  return `<button type="button" class="masa-benim${S.benim ? ' on' : ''}" data-benim title="Benim listem: referans sütununda adın geçen kişiler" aria-label="Benim listem">Benim listem <span>${fmt.sayi(firmaListesi().filter(referansBenMi).length)}</span></button>`;
}
const gecikmisMi = f => gecikme(f) > 0;
const bitmisMi = f => f.durum === 'oy_kullandi' || f.durum === 'fuarda';
function aracDurumYazi(d) { return d === 'arizali' ? '✕ Arızalı' : (ARAC_DURUM_AD[d || 'hazir'] || d); }
function rotaParca(kod) {
  const [ref, ...kalan] = String(kod || '').split(' · ');
  const r = kalan.join(' · '); const m = r.match(/(\d+)/);
  return { ref: trBaslik(ref || ''), rota: r, no: m ? Number(m[1]) : 0 };
}
function kartBaslik(f) {
  const a = aracOf(f); const g = gecikme(f); const p = rotaParca(f.rota_kod);
  return [
    firmaAdi(f), f.unvan || '',
    `${f.tasima_saati ? 'Taşıma ' + fmt.saatKisa(f.tasima_saati) : 'Saat belirsiz'}${f.rota_kod ? ' · ' + p.ref + ' ' + p.rota + (f.rota_sira ? ', ' + f.rota_sira + '. durak' : '') : ''}`,
    `Durum: ${f.kendi_geldi && f.durum === 'oy_kullandi' ? 'Kendi geldi, oy kullandı' : (DURUM_AD[f.durum] || f.durum)} · Sınıf: ${SINIF_AD[f.oy_sinifi] || f.oy_sinifi || '?'}`,
    f.karsilayan ? `Karşılayan: ${trBaslik(f.karsilayan)}${f.karsilama_zamani ? ' · ' + fmt.saat(f.karsilama_zamani) : ''}` : '',
    g ? `Gecikme: ${g} dk` : '', f.evrak_uyari ? `Evrak uyarısı: ${f.evrak_uyari}` : '',
    f.kisi_oy_sayisi > 1 ? `Aynı kişi ${f.kisi_oy_sayisi} firmayla oy kullanıyor` : '',
    a ? `Araç: ${fmt.plaka(a.plaka)}${a.sofor_ad ? ' (' + trBaslik(a.sofor_ad) + ')' : ''}` : 'Araç atanmadı',
    'Tıkla: kişi kartı · Sağ tık: hızlı işaret',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- iskelet
function iskelet() {
  const yaz = yazabilirMi();
  const kpi = [['hedef', 'HEDEF', 'var(--red)', 'var(--ink)'], ['oy', 'OY KULLANDI', 'var(--green)', 'var(--green)'], ['fuarda', 'FUARDA', 'var(--violet)', 'var(--violet)'], ['yolda', 'YOLDA', 'var(--amber)', 'var(--amber-ink)'], ['kalan', 'KALAN', 'var(--ink-3)', 'var(--ink)']]
    .map(([k, e, nokta, renk]) => `
      <div class="masa-kpi-k"><div class="masa-kpi-e"><span class="masa-nokta" style="background:${nokta}"></span>${e}</div><div class="masa-kpi-d" data-k="${k}" style="color:${renk}">0</div><div class="masa-kpi-a" data-k="${k}-alt"></div></div>`).join('');
  return `
  <div class="masa">
    <div class="masa-kpi" data-kpi>
      ${kpi}
      <div class="masa-kpi-r">
        <div class="masa-halka" data-halka><div class="masa-halka-ic"><div class="y" data-k="yuzde">%0</div><div class="h">HEDEF</div></div></div>
        <div class="masa-kpi-rs"><div class="e">İLERLEME</div><div class="d"><span data-k="oy2">0</span><span class="t"> / <span data-k="hedef2">0</span></span></div><div class="a">oy kullandı</div></div>
      </div>
    </div>
    <div class="masa-ana">
      <section class="masa-merkez">
        <div class="masa-cbas" data-cbas></div>
        <div class="masa-cz" data-cz-kaydir><div class="masa-cz-ic" data-cz></div></div>
        <div class="masa-gv" data-gv hidden></div>
        <div class="masa-bel" data-bel></div>
      </section>
      <aside class="masa-panel">
        <div class="masa-ptab" data-ptab></div>
        <div class="masa-pbody" data-pbody></div>
        <div class="masa-pfoot">
          <button type="button" class="masa-ara" data-ara>Gelen kişiyi işaretle <span class="kbd">⌘K</span></button>
          ${yaz ? '<button type="button" class="masa-kendi" data-kendi title="Servis beklemeden kendi gelen kişiyi bul, kendi geldi ve oy kullandı olarak işaretle">✓ Kendi gelen kişiyi işaretle</button>' : ''}
        </div>
      </aside>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- KPI şeridi + ilerleme halkası
function kpiCiz() {
  const s = sayac(); const elle = store.ayarlar.hedef?.elle;
  const simdiMs = Date.now();
  const son30 = firmaListesi().filter(f => f.durum === 'oy_kullandi' && f.durum_zamani && simdiMs - Date.parse(f.durum_zamani) < 30 * 60000).length;
  const imza = JSON.stringify(s) + '|' + (elle ?? '') + '|' + son30;
  if (imza === S.imza.kpi) return;
  const ilk = !S.imza.kpi; S.imza.kpi = imza;
  const yuzde = s.hedef ? Math.round((s.oy_bizde / s.hedef) * 100) : 0;
  const yaz = (k, v, html = false) => {
    const e = q(`[data-k="${k}"]`); if (!e) return; v = String(v);
    if (html ? e.innerHTML === v : e.textContent === v) return;
    if (html) e.innerHTML = v; else e.textContent = v;
    if (!ilk && !k.endsWith('-alt')) { e.classList.remove('masa-flas'); void e.offsetWidth; e.classList.add('masa-flas'); }   // değişen büyük rakam kısa bir parlama yapar
  };
  const halka = q('[data-halka]'); if (halka) halka.style.background = `conic-gradient(var(--red) ${Math.min(100, yuzde) * 3.6}deg, var(--surface-3) 0)`;
  yaz('yuzde', `%${yuzde}`);
  yaz('oy2', fmt.sayi(s.oy_bizde)); yaz('hedef2', fmt.sayi(s.hedef));
  yaz('hedef', fmt.sayi(s.hedef)); yaz('hedef-alt', elle != null ? 'elle belirlendi' : 'otomatik · kesin bizde');
  yaz('oy', fmt.sayi(s.oy_bizde)); yaz('oy-alt', `son 30 dk: +${son30}${s.oy_kullandi !== s.oy_bizde ? ` · toplam ${fmt.sayi(s.oy_kullandi)}` : ''}`);
  yaz('fuarda', fmt.sayi(s.fuarda)); yaz('fuarda-alt', 'içeride, sırada');
  yaz('yolda', fmt.sayi(s.yolda));
  yaz('yolda-alt', s.geciken ? `<button type="button" class="masa-gec-link" data-geciken title="Gecikenlerin listesini aç">${fmt.sayi(s.geciken)} alım gecikti</button>` : '0 alım gecikti', true);
  yaz('kalan', fmt.sayi(s.kalan)); yaz('kalan-alt', `${fmt.sayi(s.arandi)} arandı · ${fmt.sayi(s.bekliyor)} bekliyor`);
}

// ---------------------------------------------------------------- ORTA KART BAŞLIĞI (sekmeler, sayaç, Rota|Araç, lejant, aralık)
function basCiz(zorla = false) {
  const gv = S.gorunum === 'gv'; const ax = S.ax;
  const aralik = ax ? `${hhmm(ax.bas)} – ${hhmm(ax.bit)}` : '';
  const imza = [S.gorunum, S.grup, S.say.timed, S.say.satir, aralik].join('|');
  if (!zorla && imza === S.imza.bas) return; S.imza.bas = imza;
  const lejant = ['bekliyor', 'arandi', 'yolda', 'fuarda', 'oy_kullandi'].map(k => `<div class="masa-lej"><span class="masa-nokta" style="background:${GUN[k].renk}"></span>${GUN[k].ad}</div>`).join('')
    + '<div class="masa-lej"><span class="masa-nokta halka-nokta"></span>Gecikti</div>';
  const e = q('[data-cbas]'); if (!e) return;
  e.innerHTML = `
    <button type="button" class="masa-tab${gv ? '' : ' on'}" data-gorunum="cz">ZAMAN ÇİZELGESİ</button><button type="button" class="masa-tab${gv ? ' on' : ''}" data-gorunum="gv">GÖREV DAĞILIMI</button>
    <div class="masa-say">${fmt.sayi(S.say.timed)} servis alımı · ${fmt.sayi(S.say.satir)} ${S.grup === 'arac' ? 'araç' : 'rota'}</div>
    <div class="masa-seg"><button type="button" data-grup="rota" class="${S.grup === 'rota' ? 'on' : ''}">Rota</button><button type="button" data-grup="arac" class="${S.grup === 'arac' ? 'on' : ''}">Araç</button></div>
    <div class="masa-leg">${lejant}</div>
    <div class="masa-aralik">${esc(aralik)}</div>`;
}

// ---------------------------------------------------------------- ZAMAN ÇİZELGESİ
function saatliKartlar() {
  return firmaListesi().filter(f => f.tasima_saati && listeSuz(f)).map(f => ({ f, dk: dakika(f.tasima_saati) })).filter(k => Number.isFinite(k.dk));
}
function eksenHesapla(kartlar) {
  const z = zamanAyar(); let b = Math.floor(z.bas / 60) * 60, t = Math.ceil(z.bit / 60) * 60;
  for (const k of kartlar) { b = Math.min(b, Math.floor(k.dk / 60) * 60); t = Math.max(t, Math.ceil((k.dk + 1) / 60) * 60); }   // ayar dışına düşen saatler kaybolmasın
  return { bas: b, bit: t, span: t - b };
}
// Satırlar: Rota (rota_kod) ya da Araç
function satirlaraAyir(kartlar) {
  const g = new Map();
  const ekle = (anahtar, bilgi, k) => { if (!g.has(anahtar)) g.set(anahtar, { anahtar, ...bilgi, kartlar: [] }); if (k) g.get(anahtar).kartlar.push(k); };
  if (S.grup === 'arac') {
    const yok = kartlar.filter(k => !aracOf(k.f));
    const liste = [...store.araclar.values()].sort((a, b) => fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr', { numeric: true }));
    if (yok.length) ekle('yok', { tur: 'yok' });
    liste.forEach(a => ekle('a' + a.id, { tur: 'arac', a }));
    kartlar.forEach(k => { const a = aracOf(k.f); ekle(a ? 'a' + a.id : 'yok', a ? { tur: 'arac', a } : { tur: 'yok' }, k); });
    return [...g.values()];
  }
  kartlar.forEach(k => ekle('k' + (k.f.rota_kod || ''), { tur: 'rota', kod: k.f.rota_kod || '' }, k));
  return [...g.values()].sort((a, b) => {
    const pa = rotaParca(a.kod), pb = rotaParca(b.kod);
    if (!a.kod !== !b.kod) return a.kod ? -1 : 1;
    return pa.ref.localeCompare(pb.ref, 'tr') || pa.no - pb.no;
  });
}
// Aynı satırda saatleri yakın kartlar üst üste binmesin: şeritlere böl
function seritle(kartlar) {
  const W = S.W, sonlar = [];
  const yerli = kartlar.slice().sort((a, b) => a.dk - b.dk || kisa(a.f).localeCompare(kisa(b.f), 'tr')).map(k => {
    const x = Math.max(0, Math.min((k.dk - S.ax.bas) / S.ax.span * W, W - CHIP_G - 4));
    let l = sonlar.findIndex(son => son + 3 <= x);
    if (l < 0) { l = sonlar.length; sonlar.push(0); }
    sonlar[l] = x + CHIP_G;
    return { ...k, x, l };
  });
  return { kartlar: yerli, serit: Math.max(1, sonlar.length) };
}
function satirEtiket(g) {
  const list = g.kartlar; const bitti = list.filter(k => bitmisMi(k.f)).length;
  const sayi = `<div class="masa-satir-sayi">${bitti}/${list.length}</div>`;
  if (g.tur === 'arac') {
    const a = g.a;
    return `<div class="masa-satir-e1"><span class="masa-plk" title="${esc(fmt.plaka(a.plaka))}"><i></i><b>${esc(fmt.plaka(a.plaka))}</b></span>${sayi}</div>
      <div class="masa-satir-alt" title="${esc(trBaslik(a.sofor_ad || ''))}">${esc(trBaslik(a.sofor_ad || 'Şoför girilmemiş'))} · ${esc(aracDurumYazi(a.durum))}</div>`;
  }
  if (g.tur === 'yok') return `<div class="masa-satir-e1"><div class="masa-satir-ad masa-uyari-yazi">Araç atanmadı</div>${sayi}</div><div class="masa-satir-alt">Sürükleyip bir araca bırak</div>`;
  const p = rotaParca(g.kod);
  if (!g.kod) return `<div class="masa-satir-e1"><div class="masa-satir-ad">Rotası yok</div>${sayi}</div><div class="masa-satir-alt">Rota kodu girilmemiş</div>`;
  const uyeler = firmaListesi().filter(f => f.rota_kod === g.kod);
  const ilce = (uyeler.find(f => f.rota_ilceler)?.rota_ilceler) || [...new Set(uyeler.map(f => f.ilce).filter(Boolean))].join(' / ');
  const alt = `${p.ref ? p.ref + ' · ' : ''}${trBaslik(ilce)}`;
  return `<div class="masa-satir-e1"><div class="masa-satir-ad">${esc(p.rota || g.kod)}</div>${sayi}</div><div class="masa-satir-alt" title="${esc(alt)}">${esc(alt)}</div>`;
}
function cipHtml(k, top, havuz = false) {
  const f = k.f; const gec = gecikmisMi(f); const d = f.durum || 'bekliyor';
  const saat = fmt.saatKisa(f.tasima_saati);
  const sub = gec ? `${saat} GECİKTİ` : d === 'oy_kullandi' ? `${saat} ✓ oy` : `${saat} · ${firmaKisa(f)}`;
  const soluk = bitmisMi(f) && k.dk < simdiDk() - 20;
  return `<div class="masa-chip${gec ? ' gec' : ''}${soluk ? ' soluk' : ''}" data-id="${f.id}" data-d="${esc(d)}" data-surukle="${yazabilirMi() ? 1 : 0}" ${yazabilirMi() ? 'draggable="true"' : ''} role="button" tabindex="0" title="${esc(kartBaslik(f))}"${havuz ? '' : ` style="left:${(k.x + 2).toFixed(1)}px;top:${top}px"`}>
    <div class="c1"><span class="masa-nokta k" style="background:${gec ? 'var(--amber)' : GUN[d]?.renk || 'var(--ink-3)'}"></span><span class="ad">${esc(kisa(f))}</span></div>
    <div class="c2${gec ? ' gec' : d === 'oy_kullandi' ? ' oy' : ''}">${esc(sub)}</div>
  </div>`;
}
function czCiz(zorla = false) {
  const kap = q('[data-cz-kaydir]'), ic = q('[data-cz]'); if (!kap || !ic || S.gorunum !== 'cz') return;
  const w = kap.clientWidth || 900;
  const tum = saatliKartlar(); const ax = eksenHesapla(tum); const W = Math.max(300, w - SOL);
  const satirlar = satirlaraAyir(tum);
  const araclarImza = S.grup === 'arac' ? [...store.araclar.values()].map(a => [a.id, a.plaka, a.sofor_ad, a.durum].join('|')).join(';') : '';
  const imza = [Math.round(W), S.grup, S.benim, benimKisilerVar() ? firmaListesi().filter(referansBenMi).length : -1, ax.bas, ax.bit, araclarImza,
    tum.map(k => { const f = k.f; return [f.id, f.durum, f.tasima_saati, f.arac_id, f.rota_kod, f.yetkili, f.unvan, gecikmisMi(f) ? 1 : 0, bitmisMi(f) && k.dk < simdiDk() - 20 ? 1 : 0].join('|'); }).join(';')].join('#');
  S.ax = ax; S.W = W; S.say = { timed: tum.length, satir: satirlar.filter(g => g.tur !== 'yok').length };
  if (!zorla && imza === S.imza.cz) { simdiCiz(); basCiz(); return; }
  S.imza.cz = imza;
  const saatSay = (ax.bit - ax.bas) / 60;
  let saatler = '';
  for (let h = ax.bas / 60; h <= ax.bit / 60; h++) {
    const p = (h * 60 - ax.bas) / ax.span * 100; const ilk = h * 60 === ax.bas, son = h * 60 === ax.bit;
    saatler += `<div class="masa-saat" data-x="${p.toFixed(3)}" style="left:${p}%;transform:${ilk ? 'none' : son ? 'translateX(-100%)' : 'translateX(-50%)'};${ilk ? 'padding-left:6px;' : ''}${son ? 'padding-right:6px;' : ''}">${iki(h)}:00</div>`;
  }
  const govde = satirlar.map(g => {
    if (g.tur === 'yok') {   // araçsız havuz: saate göre sıralı, satır atlayan kartlar (yüzlerce kişi tek sütunda yığılmasın)
      const sirali = g.kartlar.slice().sort((a, b) => a.dk - b.dk || kisa(a.f).localeCompare(kisa(b.f), 'tr'));
      return `<div class="masa-satir"><div class="masa-satir-e">${satirEtiket(g)}</div>
        <div class="masa-iz havuz" data-hedef="yok">${sirali.map(k => cipHtml(k, 0, true)).join('')}</div></div>`;
    }
    const { kartlar, serit } = seritle(g.kartlar);
    const yuk = Math.max(SATIR_MIN, 10 + serit * CHIP_Y + (serit - 1) * CHIP_ARA);
    const hedef = g.tur === 'arac' ? `data-hedef="arac" data-hedef-id="${g.a.id}"` : g.tur === 'yok' ? 'data-hedef="yok"' : `data-hedef="rota" data-hedef-id="${esc(g.kod)}"`;
    return `<div class="masa-satir" style="height:${yuk}px">
      <div class="masa-satir-e">${satirEtiket(g)}</div>
      <div class="masa-iz" ${hedef} style="--sa:${100 / saatSay}%"><div class="masa-past" data-past></div>${kartlar.map(k => cipHtml(k, 5 + k.l * (CHIP_Y + CHIP_ARA))).join('')}</div>
    </div>`;
  }).join('');
  ic.innerHTML = `
    <div class="masa-eksen"><div class="masa-eksen-e"><span>${S.grup === 'arac' ? 'ARAÇ' : 'ROTA'}</span>${benimDugme()}</div><div class="masa-eksen-z"><div class="masa-simdi-pill" data-pill></div>${saatler}</div></div>
    ${govde || `<div class="masa-bos">${tum.length ? 'Gösterilecek satır yok.' : 'Henüz taşıma saati girilmiş yolcu yok. Saat girilince kişiler burada saatine göre dizilir.'}</div>`}
    <div class="masa-simdi" data-simdi></div>`;
  simdiCiz(); basCiz(true);
}
// Şimdi çizgisi, geçmiş gölgesi ve eksendeki ŞİMDİ hapı (her 'saat' olayında kayar)
function simdiCiz() {
  const ax = S.ax; if (!ax || S.gorunum !== 'cz') return;
  const cizgi = q('[data-simdi]'), pill = q('[data-pill]'); if (!cizgi || !pill) return;
  const dk = simdiDk(); const ham = (dk - ax.bas) / ax.span * 100; const p = Math.max(0, Math.min(100, ham));
  const once = ham < 0, sonra = ham > 100;
  const saat = `${iki(Math.floor(dk / 60))}:${iki(Math.floor(dk % 60))}`;
  cizgi.hidden = once || sonra; cizgi.style.left = `calc(${SOL}px + (100% - ${SOL}px) * ${p / 100})`;
  qa('[data-past]').forEach(e => { e.style.width = `${p}%`; });
  pill.classList.toggle('disari', once || sonra);
  pill.style.left = `${p}%`; pill.style.transform = once ? 'none' : sonra ? 'translateX(-100%)' : 'translateX(-50%)';
  pill.textContent = `ŞİMDİ ${saat}`;
  // hapın altında kalan saat etiketleri silikleşir (üst üste binmesin)
  const zW = pill.parentElement.clientWidth || 1; const pillG = pill.offsetWidth || 70; const pillX = p / 100 * zW;
  qa('.masa-saat').forEach(e => {
    const x = Number(e.dataset.x) / 100 * zW;
    const yakin = once ? x < pillG + 24 : sonra ? x > zW - pillG - 24 : Math.abs(x - pillX) < pillG / 2 + 22;
    e.classList.toggle('silik', yakin);
  });
}

// ---------------------------------------------------------------- SAAT BELİRSİZ
function belirsizListe() {
  return firmaListesi().filter(f => (f.oy_sinifi === 'bizde' || f.oy_sinifi === 'yolda') && !f.tasima_saati && f.durum !== 'oy_kullandi' && f.durum !== 'fuarda' && listeSuz(f));
}
function belirsizCiz(zorla = false) {
  const kok = q('[data-bel]'); if (!kok) return;
  const liste = belirsizListe();
  const kumeler = new Map(); liste.forEach(f => { const k = f.ilce || ''; if (!kumeler.has(k)) kumeler.set(k, []); kumeler.get(k).push(f); });
  if (S.kume !== null && !kumeler.has(S.kume)) S.kume = null;
  const imza = [S.kume, liste.map(f => [f.id, f.durum, f.ilce, f.yetkili, f.unvan].join('|')).join(';')].join('#');
  if (!zorla && imza === S.imza.bel) return; S.imza.bel = imza;
  const kaydir = kok.querySelector('.masa-bel-c')?.scrollLeft || 0;
  kok.classList.toggle('acik', S.kume !== null);   // ilçe açıkken şerit büyür, kişiler ızgara halinde alt alta dizilir
  const sirali = [...kumeler.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] || '￿').localeCompare(b[0] || '￿', 'tr'));
  const acik = S.kume !== null ? (kumeler.get(S.kume) || []).slice().sort((a, b) => kisa(a).localeCompare(kisa(b), 'tr')) : [];
  kok.innerHTML = `
    <div class="masa-bel-u"><div class="masa-bel-b">SAAT BELİRSİZ</div><div class="masa-bel-s">${fmt.sayi(liste.length)} kişi henüz gelmedi · ilçeye göre</div>
      ${S.kume !== null ? '<button type="button" class="masa-bel-g" data-kume-kapat>← Tüm ilçeler</button>' : ''}</div>
    <div class="masa-bel-c" data-bel-c>
      ${S.kume === null
        ? (sirali.map(([ilce, l]) => `<button type="button" class="masa-kume" data-kume="${esc(ilce)}">${esc(trBaslik(ilce) || 'İlçe yok')} <span>${l.length}</span></button>`).join('') || '<span class="masa-bel-s">Saati belirsiz bekleyen kimse kalmadı.</span>')
        : acik.map(f => `<button type="button" class="masa-kisi-c" data-id="${f.id}" title="${esc(kartBaslik(f))}"><span class="masa-nokta k" style="background:${GUN[f.durum]?.renk || 'var(--ink-3)'}"></span>${esc(kisa(f))}<span class="f">${esc(firmaKisa(f))}</span></button>`).join('')}
    </div>`;
  const c = kok.querySelector('.masa-bel-c'); if (c) c.scrollLeft = S.kume === null ? kaydir : 0;
}

// ---------------------------------------------------------------- GÖREV DAĞILIMI (SM Gorev, kind p)
function gorevVeri() {
  const hepsi = firmaListesi().filter(listeSuz);
  const bizim = f => f.oy_sinifi === 'bizde' || f.oy_sinifi === 'yolda';
  const atanan = new Set(hepsi.filter(f => f.sorumlu_id).map(f => f.sorumlu_id));
  const uyeler = ekip().filter(p => !/\bbot\b|botu\b/i.test(p.ad_soyad) && (['yonetici', 'masa', 'sorumlu'].includes(p.rol) || atanan.has(p.id)));
  const rolAd = r => ROL_AD[r] || r;   // yonetici = Admin, kurul = Yönetim kurulu
  const sutunlar = uyeler.map(m => ({ id: m.id, ad: m.ad_soyad, rol: rolAd(m.rol), ini: bas(m.ad_soyad), liste: hepsi.filter(f => f.sorumlu_id === m.id) }));
  sutunlar.push({ id: null, ad: 'Atanmamış', rol: 'sorumlusu yok', ini: '?', liste: hepsi.filter(f => !f.sorumlu_id && bizim(f) && (f.servis || f.tasima_saati)) });
  return sutunlar;
}
const acilisSirasi = f => (gecikmisMi(f) ? -2 : f.durum === 'yolda' ? -1 : 0) + (dakika(f.tasima_saati) ?? 900) / 1000;
function gorevKart(f) {
  const gec = gecikmisMi(f); const d = f.durum || 'bekliyor';
  const rozet = gec ? '<span class="masa-rz gec">◷ GECİKTİ</span>' : `<span class="masa-rz d-${esc(d)}">${d === 'oy_kullandi' ? '✓ ' : ''}${esc(GUN[d]?.ad || d)}</span>`;
  const saat = fmt.saatKisa(f.tasima_saati);
  return `<div class="masa-gvk${gec ? ' gec' : ''}" data-gvk="${f.id}" data-surukle="${yazabilirMi() ? 1 : 0}" ${yazabilirMi() ? 'draggable="true"' : ''} title="${esc(kartBaslik(f))}">
    <div class="r1"><div class="t">${esc(firmaAdi(f))}</div>${rozet}</div>
    <div class="r2">${saat ? esc(saat) + ' · ' : ''}${esc(trBaslik(f.ilce || ''))} · Ref: ${esc(trBaslik(f.referans || '-'))}</div>
  </div>`;
}
function gvKartListe(s, acikTum, filtre) {
  let acik = s.liste.filter(f => !bitmisMi(f)).sort((a, b) => acilisSirasi(a) - acilisSirasi(b));
  if (filtre) acik = acik.filter(f => aramaEslesir(f, filtre));
  const goster = acikTum || filtre ? acik : acik.slice(0, LIM);
  const kalan = acik.length - goster.length;
  return goster.map(gorevKart).join('')
    + (kalan > 0 ? `<button type="button" class="masa-gv-daha" data-gv-daha="${esc(String(s.id))}">+${kalan} daha</button>` : '')
    + (!acik.length ? `<div class="masa-gv-bos">${filtre ? 'Eşleşen kişi yok' : s.id ? 'Bekleyen kişi yok' : 'Atanmamış kişi yok'}</div>` : '');
}
function gorevCiz(zorla = false) {
  const kok = q('[data-gv]'); if (!kok || S.gorunum !== 'gv') return;
  const sutunlar = gorevVeri();
  const imza = [S.benim, benimKisilerVar(), S.gvFiltre, [...S.gvAcik].join(','), sutunlar.map(s => s.id + ':' + s.ad + ':' + s.liste.map(f => [f.id, f.durum, f.tasima_saati, f.ilce, f.referans, f.yetkili, gecikmisMi(f) ? 1 : 0].join('.')).join('|')).join('#')].join('~');
  if (!zorla && imza === S.imza.gv) return; S.imza.gv = imza;
  const odak = document.activeElement?.matches?.('[data-gv-filtre]') ? document.activeElement.selectionStart : null;
  const kaydirlar = {}; kok.querySelectorAll('[data-gv-sutun]').forEach(c => { kaydirlar[c.dataset.gvSutun] = c.querySelector('.masa-gv-liste')?.scrollTop || 0; });
  const yatay = kok.querySelector('.masa-gv-sut')?.scrollLeft || 0;
  const toplam = sutunlar.reduce((n, s) => n + s.liste.length, 0);
  kok.innerHTML = `
    <div class="masa-gv-ust"><div class="a">${fmt.sayi(toplam)} kişi (kesin + ilzam) · sorumlulara göre · bekleyenler önce</div><div class="b">${yazabilirMi() ? 'Kartı sürükleyip başka sütuna bırak' : ''}</div>${benimDugme()}</div>
    <div class="masa-gv-sut">
      ${sutunlar.map(s => {
        const bitti = s.liste.filter(bitmisMi).length; const bekleyen = s.liste.length - bitti; const anahtar = String(s.id);
        const kalabalik = !s.id && bekleyen > LIM;
        return `<div class="masa-gv-s${s.id ? '' : ' yok'}" data-gv-sutun="${esc(anahtar)}">
          <div class="h"><div class="av${s.id ? '' : ' yok'}">${esc(s.ini)}</div><div class="hb"><div class="ad">${esc(s.ad)}</div><div class="rol">${esc(s.rol)}</div></div><div class="n">${s.liste.length}</div></div>
          <div class="bar"><div class="iz"><i style="width:${s.liste.length ? bitti / s.liste.length * 100 : 0}%"></i></div><div class="tx">${bitti} tamam · ${bekleyen} bekleyen</div></div>
          ${kalabalik ? `<input class="masa-gv-filtre" data-gv-filtre name="gv-filtre" aria-label="Atanmamış kişileri filtrele" placeholder="Filtre: ad, ilçe, referans" value="${esc(S.gvFiltre)}">` : ''}
          <div class="masa-gv-liste" data-gv-liste="${esc(anahtar)}">${gvKartListe(s, S.gvAcik.has(anahtar), kalabalik ? S.gvFiltre : '')}</div>
        </div>`;
      }).join('')}
    </div>`;
  kok.querySelectorAll('[data-gv-sutun]').forEach(c => { const l = c.querySelector('.masa-gv-liste'); if (l) l.scrollTop = kaydirlar[c.dataset.gvSutun] || 0; });
  const y = kok.querySelector('.masa-gv-sut'); if (y) y.scrollLeft = yatay;
  if (odak !== null) { const inp = kok.querySelector('[data-gv-filtre]'); if (inp) { inp.focus(); try { inp.setSelectionRange(odak, odak); } catch { /* yoksay */ } } }
}
function gorunumUygula() {
  const gv = S.gorunum === 'gv';
  q('[data-cz-kaydir]').hidden = gv; q('[data-bel]').hidden = gv; q('[data-gv]').hidden = !gv;
  S.imza.cz = S.imza.gv = null;
}

// ---------------------------------------------------------------- SAĞ PANEL: AKIŞ
function sonOlaylar() { const m = new Map(); for (const o of store.olaylar) { const k = `${o.firma_id || 'a' + o.arac_id}|${o.tur}`; if (!m.has(k)) m.set(k, o.id); } return m; }
function olayParca(o) {
  const f = o.firma_id ? store.firmalar.get(o.firma_id) : null;
  const a = o.arac_id ? store.araclar.get(o.arac_id) : null;
  const plaka = id => { const x = store.araclar.get(Number(id)); return x ? fmt.plaka(x.plaka) : ''; };
  const yeniD = String(o.yeni || '').split('+')[0]; const kendi = String(o.yeni || '').includes('+kendi');
  const ad = f ? kisa(f) : a ? fmt.plaka(a.plaka) : '';
  let metin, renk = 'var(--ink-3)';
  if (o.tur === 'durum') { metin = kendi && yeniD === 'oy_kullandi' ? 'kendi geldi, oy kullandı' : (GUN[yeniD]?.fiil || DURUM_AD[yeniD] || yeniD); renk = GUN[yeniD]?.renk || renk; }
  else if (o.tur === 'oy_sinifi') { metin = `sınıf: ${SINIF_AD[o.eski] || o.eski || '-'} → ${SINIF_AD[o.yeni] || o.yeni}`; renk = 'var(--red)'; }
  else if (o.tur === 'not') { metin = `not: ${String(o.yeni || '').split('\n').pop().replace(/^\[[^\]]*\]\s*/, '')}`; }
  else if (o.tur === 'arac') { metin = o.yeni ? `araç: ${plaka(o.yeni) || 'atandı'}` : 'araçtan çıkarıldı'; renk = 'var(--blue)'; }
  else if (o.tur === 'arac_durum') { metin = `araç durumu: ${aracDurumYazi(o.yeni)}`; renk = 'var(--amber)'; }
  else if (o.tur === 'sorumlu') { const p = store.profiller.get(o.yeni); metin = p ? `sorumlu: ${tumKisa(p.ad_soyad)}` : 'sorumlusu kaldırıldı'; renk = 'var(--ink-2)'; }
  else if (o.tur === 'karsilama') { metin = `${o.yeni ? tumKisa(o.yeni) + ' ' : ''}karşıladı`; renk = 'var(--violet)'; }
  else if (o.tur === 'geri_sayim') { const g = GERI_SAYIM.find(x => x.k === o.yeni); metin = `şoför: ${g ? g.ad.toLocaleLowerCase('tr') : o.yeni}`; renk = 'var(--amber)'; }
  else metin = o.tur;
  return { f, a, ad, metin, renk };
}
function olayKimlik(o) {
  const kim = (o.kim_ad || '').trim();
  if (o.kaynak === 'asistan') return kim && !/^(atlas|sistem)$/i.test(kim) ? `${iyelik(kim)} mesajından` : 'ATLAS işledi';
  if (o.kaynak === 'sistem') return 'sistem';
  if (o.tur === 'geri_sayim') return kim && kim !== 'sistem' ? `sürücü: ${tumKisa(kim)}` : 'sürücü';
  if (o.kaynak === 'konum') return `konum: ${tumKisa(kim)}`;
  if (o.kaynak === 'excel') return 'Excel aktarımı';
  return `işaretleyen: ${kim ? kim.split(' ')[0] : '?'}`;
}
// Son 5 dakikadaki, hâlâ güncel ve geri alınabilir olaylar
function olayGeriAlinir(o, son) {
  if (!yazabilirMi() || Date.now() - Date.parse(o.zaman) > 5 * 60000 || /geri alındı/i.test(o.kaynak_metin || '')) return false;
  if (son.get(`${o.firma_id || 'a' + o.arac_id}|${o.tur}`) !== o.id) return false;   // sonradan aynı alan değiştiyse geri alma yok
  const f = o.firma_id ? store.firmalar.get(o.firma_id) : null;
  if (o.tur === 'durum') return !!f && f.durum === String(o.yeni || '').split('+')[0];
  if (o.tur === 'oy_sinifi') return !!f && f.oy_sinifi === o.yeni;
  if (o.tur === 'arac') return !!f && String(f.arac_id ?? '') === String(o.yeni ?? '');
  if (o.tur === 'sorumlu') return !!f && (f.sorumlu_id ?? null) === (o.yeni ?? null);
  if (o.tur === 'arac_durum') { const a = store.araclar.get(o.arac_id); return !!a && a.durum === o.yeni && !!o.eski; }
  return false;
}
async function olayGeriAl(o) {
  try {
    let g = null;
    if (o.tur === 'durum') { const [d, k] = String(o.eski || 'bekliyor').split('+'); g = await durumYap([o.firma_id], d || 'bekliyor', { kendi: k === 'kendi', metin: 'Akıştan geri alındı' }); }
    else if (o.tur === 'oy_sinifi') g = await sinifYap(o.firma_id, o.eski, { metin: 'Akıştan geri alındı' });
    else if (o.tur === 'arac') g = await aracAta([o.firma_id], o.eski ? Number(o.eski) : null, { metin: 'Akıştan geri alındı' });
    else if (o.tur === 'sorumlu') g = await sorumluAta([o.firma_id], o.eski || null, { metin: 'Akıştan geri alındı' });
    else if (o.tur === 'arac_durum') await aracDurumYap(o.arac_id, o.eski);
    toast('Geri alındı', g ? { geriAl: g } : {});
  } catch (e) { hataGoster(e); }
}
function akisHtml() {
  const son = sonOlaylar();
  const liste = store.olaylar.slice(0, 60);
  if (!liste.length) return '<div class="masa-bos-p">Henüz işaret yok.<br>Masada, sahada ya da ATLAS ile yapılan her işaret burada anında görünür.</div>';
  return liste.map(o => {
    const { f, ad, metin, renk } = olayParca(o); const atlas = o.kaynak === 'asistan';
    const geri = olayGeriAlinir(o, son);
    return `<div class="masa-fd">
      <div class="z">${esc(fmt.saat(o.zaman))}</div>
      <div class="nk" style="background:${renk}"></div>
      <div class="g">
        <div class="l1">${o.firma_id ? `<button type="button" class="ad" data-id="${o.firma_id}">${esc(ad)}</button>` : `<span class="ad">${esc(ad)}</span>`} ${esc(metin)}</div>
        <div class="l2">${atlas ? '<span class="masa-atlas">ATLAS</span>' : ''}<span class="tx">${f ? esc(firmaKisa(f)) + ' · ' : ''}${esc(olayKimlik(o))}</span></div>
        ${atlas && o.kaynak_metin ? `<div class="al">“${esc(o.kaynak_metin)}”</div>` : ''}
      </div>
      ${geri ? `<button type="button" class="masa-geri" data-geri-olay="${o.id}">Geri al</button>` : ''}
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------- SAĞ PANEL: CEVAPSIZ
async function tumBildirimCek() {
  if (!yazabilirMi() || !S.kok) return;
  try {
    const { data } = await sb.from('bildirimler').select('*').is('cevap', null).order('zaman', { ascending: false }).limit(300);
    const yeni = data || []; if (JSON.stringify(yeni.map(b => b.id)) === JSON.stringify(S.tumBild.map(b => b.id))) return;
    S.tumBild = yeni; S.imza.pnl = null; panelCiz();
  } catch { /* yetki yoksa yalnız kendi bildirimleri görünür */ }
}
function cevapsizVeri() {
  const simdiMs = Date.now(); const esik = 10 * 60000;
  const harita = new Map();
  cevapsizBildirimler().forEach(b => harita.set(b.id, b));
  S.tumBild.forEach(b => { if (!harita.has(b.id) && !b.cevap && b.secenekler?.length > 1 && simdiMs - Date.parse(b.zaman) > esik && !store.bildirimler.some(x => x.id === b.id)) harita.set(b.id, b); });
  const liste = [...harita.values()].map(b => {
    const f = b.firma_id ? store.firmalar.get(b.firma_id) : null; const alici = store.profiller.get(b.alici_id);
    return { anahtar: 'b' + b.id, bildirimId: b.id, t: Date.parse(b.zaman), kime: alici?.ad_soyad || '', metin: b.metin || b.baslik || '', firmaId: b.firma_id, sec: b.secenekler, f };
  });
  // Bildirimi olmayan ama şoför adımından sonra hareketsiz kalanlar: ALDIM ve FUARA BIRAKTIM sonrası 10 dk sessizlik
  const tumBildirim = [...store.bildirimler, ...S.tumBild];
  for (const f of firmaListesi()) {
    if ((f.geri_sayim !== 'aldim' && f.geri_sayim !== 'birakti') || f.durum === 'oy_kullandi') continue;
    const gz = Date.parse(f.geri_sayim_zamani); if (!gz || simdiMs - gz < esik) continue;
    if (store.olaylar.some(o => o.firma_id === f.id && Date.parse(o.zaman) > gz + 8000)) continue;      // adımdan sonra hareket olmuş (durum, not, atama ...)
    if (tumBildirim.some(b => b.firma_id === f.id && Date.parse(b.zaman) >= gz - 60000)) continue;         // sunucu hatırlatması zaten listede ya da cevaplanmış
    const a = aracOf(f); const sor = store.profiller.get(f.sorumlu_id || a?.sorumlu_id);
    liste.push({ anahtar: 'f' + f.id, bildirimId: null, t: gz, kime: sor?.ad_soyad || (a?.sofor_ad ? trBaslik(a.sofor_ad) : ''), f, firmaId: f.id, sec: ZINCIR_CEVAP,
      metin: f.geri_sayim === 'aldim' ? `${firmaAdi(f)} aldınız mı, şu an nerede?` : `${firmaAdi(f)} fuarda mı, oy kullandı mı?` });
  }
  return liste.sort((x, y) => y.t - x.t);
}
async function cevapUygula(firmaId, cevap) {
  const f = store.firmalar.get(firmaId); if (!f) return;
  const d = CEVAP_DURUM[cevap];
  if (cevap === 'Karşıladım') { await karsiladim(firmaId); return; }   // kim karşıladıysa kendi adıyla yazılır
  if (d && SIRA.indexOf(d) > SIRA.indexOf(f.durum)) await durumYap([firmaId], d, { metin: `Cevapsız listeden cevap: ${cevap}` });
  else await notEkle(firmaId, cevap === 'Sorun var' ? 'Sorun bildirildi (cevapsız listesi)' : `Cevap: ${cevap}`);   // durum değişmese de zincir hareket görür, kayıt kapanır
}
async function cevapVer(anahtar, cevap) {
  const it = cevapsizVeri().find(x => x.anahtar === anahtar); if (!it) return;
  try {
    if (it.bildirimId != null) {
      await bildirimCevapla(it.bildirimId, cevap);
      if (!store.bildirimler.some(b => b.id === it.bildirimId)) {   // bana gelmemiş bildirim: durum değişikliğini core yapmaz
        S.tumBild = S.tumBild.filter(b => b.id !== it.bildirimId);
        if (it.firmaId) await cevapUygula(it.firmaId, cevap);
      }
    } else await cevapUygula(it.firmaId, cevap);
    toast(`${it.f ? kisa(it.f) : 'Kayıt'} · ${cevap}`);
  } catch (e) { hataGoster(e); }
  S.imza.pnl = null; panelCiz();
}
function cevapsizHtml(liste) {
  const simdiMs = Date.now();
  return `<div class="masa-cv-ust">Cevapsız hatırlatmalar · 10 dk'dan uzun süredir bekliyor</div>`
    + liste.map(n => `<div class="masa-cv">
      <div class="u"><div class="t">${esc(fmt.saat(n.t))} · ${Math.round((simdiMs - n.t) / 60000)} dk cevapsız</div>${n.kime ? `<div class="k">→ ${esc(trBaslik(n.kime))}</div>` : ''}</div>
      <button type="button" class="m" ${n.firmaId ? `data-id="${n.firmaId}"` : ''}>${esc(n.metin)}</button>
      <div class="b" style="grid-template-columns:repeat(${Math.min(4, n.sec.length)},minmax(0,1fr))">${n.sec.map(s => `<button type="button" data-cevap="${esc(n.anahtar)}" data-cevap-ad="${esc(s)}" ${yazabilirMi() ? '' : 'disabled'}>${esc(s)}</button>`).join('')}</div>
    </div>`).join('')
    + (!liste.length ? '<div class="masa-bos-p">✓ Cevapsız hatırlatma yok</div>' : '');
}

// ---------------------------------------------------------------- SAĞ PANEL: GELİŞMELER
const ISTEK_DURUM = { onay_bekliyor: ['onaya gitti', 'amber'], onaylandi: ['onaylandı', 'mavi'], yapiliyor: ['yapılıyor', 'mavi'], yapildi: ['işlendi', 'yesil'], reddedildi: ['reddedildi', 'gri'], hata: ['hata', 'amber'] };
function gelismelerVeri() {
  const liste = []; const gorulen = new Map();
  for (const o of store.olaylar) {
    const atlas = o.kaynak === 'asistan'; if (!atlas && o.tur !== 'not') continue;
    const f = o.firma_id ? store.firmalar.get(o.firma_id) : null; const a = o.arac_id ? store.araclar.get(o.arac_id) : null;
    const hedef = f ? `${kisa(f)} · ${firmaKisa(f)}` : a ? fmt.plaka(a.plaka) : '';
    const metin = atlas && o.kaynak_metin ? o.kaynak_metin : o.tur === 'not' ? String(o.yeni || '').split('\n').pop().replace(/^\[[^\]]*\]\s*/, '') : `${olayParca(o).ad} ${olayParca(o).metin}`;
    const anahtar = atlas ? `${o.kaynak_metin || o.id}|${String(o.zaman).slice(0, 16)}` : null;
    if (anahtar && gorulen.has(anahtar)) { const g = gorulen.get(anahtar); if (hedef && !g.hedefler.includes(hedef)) g.hedefler.push(hedef); continue; }
    const g = { t: Date.parse(o.zaman), by: (o.kim_ad || '').trim() || 'ATLAS', metin, durum: atlas ? ['işlendi', 'yesil'] : ['bilgi olarak kaydedildi', 'gri'], hedefler: hedef ? [hedef] : [] };
    liste.push(g); if (anahtar) gorulen.set(anahtar, g);
  }
  for (const i of store.istekler) liste.push({ t: Date.parse(i.zaman), by: i.isteyen_ad || 'ATLAS', metin: i.metin || i.plan || '', durum: ISTEK_DURUM[i.durum] || ['işlendi', 'yesil'], hedefler: [] });
  return liste.filter(g => g.metin).sort((a, b) => b.t - a.t).slice(0, 60);
}
function gelismelerHtml(liste) {
  if (!liste.length) return '<div class="masa-bos-p">Henüz gelişme yok.<br>ATLAS\'a yazılan bilgiler ve saha notları burada işlenme durumuyla görünür.</div>';
  return liste.map(g => `<div class="masa-gl">
    <div class="u"><div class="z">${esc(fmt.saat(g.t))}</div><div class="k">${esc(trBaslik(g.by))}</div><div class="s"><span class="masa-st ${g.durum[1]}">${esc(g.durum[0])}</span></div></div>
    <div class="q">“${esc(g.metin)}”</div>
    ${g.hedefler.length ? `<div class="h">İlgili: ${esc(g.hedefler.slice(0, 3).join(', '))}${g.hedefler.length > 3 ? ` +${g.hedefler.length - 3}` : ''}</div>` : ''}
  </div>`).join('');
}

// ---------------------------------------------------------------- panel çizimi (sekmeler + gövde)
function panelCiz(zorla = false) {
  const tab = q('[data-ptab]'), govde = q('[data-pbody]'); if (!tab || !govde) return;
  const cv = cevapsizVeri(); const gl = gelismelerVeri();
  const canli = store.cevrimici && store.canli;
  const tabImza = [S.sekme, cv.length, gl.length, canli].join('|');
  if (zorla || tabImza !== S.imza.ptab) {
    S.imza.ptab = tabImza;
    tab.innerHTML = SEKMELER.map(([k, ad]) => {
      const on = S.sekme === k;
      const ek = k === 'akis' ? `<span class="masa-canli${canli ? '' : ' kopuk'}" title="${canli ? 'Canlı bağlantı açık' : 'Canlı bağlantı yok, yeniden bağlanıyor'}"></span>`
        : k === 'cevapsiz' ? `<span class="masa-tab-say${cv.length ? ' amber' : ''}">${cv.length}</span>` : `<span class="masa-tab-say">${gl.length}</span>`;
      return `<button type="button" class="masa-tab${on ? ' on' : ''}" data-sekme="${k}">${ad} ${ek}</button>`;
    }).join('');
  }
  let html, imza;
  const son = sonOlaylar();
  if (S.sekme === 'akis') { imza = 'a|' + store.olaylar.slice(0, 60).map(o => o.id + (olayGeriAlinir(o, son) ? 'g' : '')).join(','); html = akisHtml; }
  else if (S.sekme === 'cevapsiz') { imza = 'c|' + cv.map(n => n.anahtar + ':' + Math.round((Date.now() - n.t) / 60000)).join(','); html = () => cevapsizHtml(cv); }
  else { imza = 'g|' + gl.map(g => g.t + g.durum[0] + g.metin.length).join(','); html = () => gelismelerHtml(gl); }
  if (!zorla && imza === S.imza.pnl) return; S.imza.pnl = imza;
  const kaydir = govde.scrollTop; govde.innerHTML = html(); govde.scrollTop = kaydir;
}

// ---------------------------------------------------------------- hızlı işaret menüsü (çipe sağ tık)
function menuKapat() { S.menu?.remove(); S.menu = null; }
function menuAc(id, konum) {
  menuKapat();
  const f = store.firmalar.get(id); if (!f) return;
  const secenek = [['yolda', 'amber'], ['fuarda', 'violet'], ['oy_kullandi', 'green']];
  const m = el(`<div class="masa-menu" role="menu">
    <div class="ust"><div class="ad">${esc(firmaAdi(f))}</div><div class="firma">${esc(f.unvan || '')}</div><div style="margin-top:6px">${rozetDurum(f)}</div>${f.karsilayan ? `<div class="karsilayan">Karşılayan: ${esc(trBaslik(f.karsilayan))}${f.karsilama_zamani ? ' · ' + esc(fmt.saat(f.karsilama_zamani)) : ''}</div>` : ''}</div>
    ${secenek.map(([k, renk]) => `<button type="button" role="menuitem" data-isaret="${k}" ${f.durum === k ? 'disabled' : ''}><i style="background:var(--${renk})"></i>${esc(DURUM_AD[k])}${f.durum === k ? '<span class="sag">şu an</span>' : ''}</button>`).join('')}
    ${f.durum !== 'oy_kullandi' && !f.karsilayan ? `<button type="button" role="menuitem" data-karsila><i class="cerceve"></i>Karşıladım</button>` : ''}
    <div class="ayrac"></div>
    <button type="button" role="menuitem" data-kart><i class="cerceve"></i>Kişi kartını aç</button>
  </div>`);
  document.body.appendChild(m);
  const r = m.getBoundingClientRect(); let x = konum.x, y = konum.y;
  if (x + r.width > innerWidth - 8) x = Math.max(8, innerWidth - r.width - 8);
  if (y + r.height > innerHeight - 8) y = Math.max(8, y - r.height - 4);
  m.style.left = `${x}px`; m.style.top = `${y}px`;
  m.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return; menuKapat();
    if (b.dataset.isaret) isaretle(id, b.dataset.isaret, { kendi: false });
    else if (b.hasAttribute('data-karsila')) karsilaIsaretle(id);
    else if (b.hasAttribute('data-kart')) kisiKartiAc(id);
  });
  S.menu = m; m.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
}

async function karsilaIsaretle(id) {
  const f = store.firmalar.get(id); if (!f) return;
  try { const geriAl = await karsiladim(id); toast(`${kisa(f)} · ${trBaslik(store.ben?.ad_soyad || '')} karşıladı`, { geriAl }); } catch (e) { hataGoster(e); }
}

// ---------------------------------------------------------------- gecikenler listesi (Yolda kartındaki "N alım gecikti")
function gecikenModalAc() {
  if (!firmaListesi().some(gecikmisMi)) { toast('Şu an geciken yok'); return; }
  const m = modal('Gecikenler', '<div data-gec-liste></div>', '<button type="button" class="btn" data-kapat>Kapat</button>');
  m.querySelector('.modal')?.classList.add('masa-gec-modal');
  S.gecikenModal = m; S.imza.gec = '';
  m.addEventListener('click', e => {
    const y = e.target.closest('[data-gec-yolda]'); if (y) { isaretle(Number(y.dataset.gecYolda), 'yolda', { kendi: false }); return; }
    if (e.target.closest('a[href]')) return;
    const r = e.target.closest('[data-gec-kisi]'); if (r) { const id = Number(r.dataset.gecKisi); modalKapat(); S.gecikenModal = null; kisiKartiAc(id); }
  });
  gecikenModalCiz();
}
function gecikenModalCiz() {
  const m = S.gecikenModal; if (!m) return; if (!m.isConnected) { S.gecikenModal = null; return; }
  const liste = firmaListesi().map(f => ({ f, g: gecikme(f) })).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
  const imza = liste.map(x => x.f.id + ':' + x.g + ':' + x.f.durum + ':' + x.f.arac_id).join(','); if (imza === S.imza.gec) return; S.imza.gec = imza;
  const kok = m.querySelector('[data-gec-liste]'); if (!kok) return;
  kok.innerHTML = liste.length ? `<div class="masa-gec-aciklama">Taşıma saatini 10 dakikadan fazla geçmiş, henüz yola çıkmamış ${liste.length} kişi. En çok geciken üstte.</div>` + liste.map(({ f, g }) => {
    const a = aracOf(f); const tel = f.cep || f.cep2; const p = rotaParca(f.rota_kod);
    return `<div class="masa-gec-satir" data-gec-kisi="${f.id}">
      <div class="masa-gec-sure"><b>+${g}</b><span>dk</span></div>
      <div class="masa-gec-bilgi"><div class="ad">${esc(firmaAdi(f))} ${rozetDurum(f)}</div>
        <div class="alt">${esc(fmt.saatKisa(f.tasima_saati))} · ${esc(firmaKisa(f))}${f.rota_kod ? ' · ' + esc(p.ref + ' ' + p.rota) : ''} · ${a ? `${esc(fmt.plaka(a.plaka))}${a.sofor_ad ? ' ' + esc(trBaslik(a.sofor_ad)) : ''}` : 'Araç atanmadı'}</div></div>
      <div class="masa-gec-eylem">
        ${tel && fmt.telLink(tel) ? `<a class="btn btn-kucuk" href="${fmt.telLink(tel)}" title="Kişiyi ara">Ara</a>` : ''}
        ${a?.sofor_tel && fmt.telLink(a.sofor_tel) ? `<a class="btn btn-kucuk" href="${fmt.telLink(a.sofor_tel)}" title="Şoförü ara">Şoför</a>` : ''}
        ${yazabilirMi() ? `<button type="button" class="btn btn-kucuk masa-yolda-btn" data-gec-yolda="${f.id}">Yolda</button>` : ''}
      </div></div>`;
  }).join('') : '<div class="bos">✓ Geciken kalmadı.</div>';
}

// ---------------------------------------------------------------- "Kendi geldi": ortak paleti kendi geldi kipinde açar
function kendiGelenAc() {
  paletAc();
  const p = document.querySelector('.palet'); if (!p) return;
  p.classList.add('masa-palet-kendi');
  const inp = p.querySelector('input'); const liste = p.querySelector('.palet-liste');
  if (inp) inp.placeholder = 'Kendi gelen kişiyi ara: ad, firma, telefon… (⌘Enter: kendi geldi, oy kullandı)';
  if (liste) liste.before(el('<div class="masa-palet-ipucu">✓ Kendi gelen kişi · Seçtiğin kişi "kendi geldi, oy kullandı" olarak işaretlenir. Enter kartı açar.</div>'));
  const etiketle = () => liste?.querySelectorAll('[data-oy]').forEach(b => { if (!b.dataset.masaKendi) { b.dataset.masaKendi = '1'; b.textContent = '✓ Kendi geldi, oy'; } });
  if (liste) { new MutationObserver(etiketle).observe(liste, { childList: true, subtree: true }); etiketle(); }
  const kendiIsaretle = id => { paletKapat(); isaretle(id, 'oy_kullandi', { kendi: true }); };
  p.addEventListener('click', e => { const b = e.target.closest('[data-oy]'); if (!b) return; e.stopPropagation(); e.preventDefault(); kendiIsaretle(Number(b.dataset.oy)); }, true);
  p.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
    const b = p.querySelector('.palet-satir.secili [data-oy]'); if (!b) return;
    e.stopPropagation(); e.preventDefault(); kendiIsaretle(Number(b.dataset.oy));
  }, true);
}

// ---------------------------------------------------------------- sürükle-bırak
function rotaAraci(kod) {
  const say = {}; firmaListesi().forEach(f => { if (f.rota_kod === kod && f.arac_id && store.araclar.has(f.arac_id)) say[f.arac_id] = (say[f.arac_id] || 0) + 1; });
  const en = Object.entries(say).sort((a, b) => b[1] - a[1])[0]; return en ? Number(en[0]) : null;
}
async function araciBirak(firmaId, satir) {
  const f = store.firmalar.get(firmaId); if (!f || !yazabilirMi()) return;
  let aracId;
  if (satir.dataset.hedef === 'arac') aracId = Number(satir.dataset.hedefId);
  else if (satir.dataset.hedef === 'yok') aracId = null;
  else { aracId = rotaAraci(satir.dataset.hedefId); if (aracId == null) { toast('Bu rotada henüz araç yok. Araç görünümünde bir araca bırak.'); return; } }
  if ((f.arac_id ?? null) === aracId) return;
  try {
    const geriAl = await aracAta([firmaId], aracId);
    const a = aracId != null ? store.araclar.get(aracId) : null;
    toast(`${kisa(f)} → ${a ? fmt.plaka(a.plaka) : 'araçsız'}`, { geriAl });
  } catch (e) { hataGoster(e); }
}
async function sorumluyaBirak(firmaId, sutun) {
  const f = store.firmalar.get(firmaId); if (!f || !yazabilirMi()) return;
  const hedef = sutun.dataset.gvSutun === 'null' ? null : sutun.dataset.gvSutun;
  if ((f.sorumlu_id ?? null) === hedef) return;
  try {
    const geriAl = await sorumluAta([firmaId], hedef);
    toast(`${kisa(f)} → ${hedef ? trBaslik(store.profiller.get(hedef)?.ad_soyad || '') : 'Atanmamış'}`, { geriAl });
  } catch (e) { hataGoster(e); }
}
function surukSonu() { S.suruk = false; qa('.over').forEach(e => e.classList.remove('over')); if (S.bekleyen) { S.bekleyen = false; guncelle(); } }

// ---------------------------------------------------------------- olay bağlama
function bagla() {
  const kok = S.kok;
  kok.addEventListener('click', e => {
    const t = e.target;
    const gor = t.closest('[data-gorunum]'); if (gor) { if (S.gorunum !== gor.dataset.gorunum) { S.gorunum = gor.dataset.gorunum; gorunumUygula(); basCiz(true); guncelle(true); } return; }
    if (t.closest('[data-benim]')) { S.benim = !S.benim; tercihYaz(); S.imza = {}; guncelle(true); return; }
    const grup = t.closest('[data-grup]'); if (grup) { if (S.grup !== grup.dataset.grup) { S.grup = grup.dataset.grup; tercihYaz(); S.imza.cz = null; guncelle(true); } return; }
    const sek = t.closest('[data-sekme]'); if (sek) { S.sekme = sek.dataset.sekme; S.imza.pnl = null; panelCiz(true); return; }
    const cev = t.closest('[data-cevap]'); if (cev) { cevapVer(cev.dataset.cevap, cev.dataset.cevapAd); return; }
    const geri = t.closest('[data-geri-olay]'); if (geri) { const o = store.olaylar.find(x => x.id === Number(geri.dataset.geriOlay)); if (o) olayGeriAl(o); return; }
    if (t.closest('[data-geciken]')) { gecikenModalAc(); return; }
    if (t.closest('[data-kume-kapat]')) { S.kume = null; belirsizCiz(true); return; }
    const kume = t.closest('[data-kume]'); if (kume) { S.kume = kume.dataset.kume; belirsizCiz(true); return; }
    const daha = t.closest('[data-gv-daha]'); if (daha) { S.gvAcik.add(daha.dataset.gvDaha); gorevCiz(true); return; }
    const gvk = t.closest('[data-gvk]'); if (gvk) { kisiKartiAc(Number(gvk.dataset.gvk)); return; }
    const kisi = t.closest('[data-id]'); if (kisi) { kisiKartiAc(Number(kisi.dataset.id)); return; }
    if (t.closest('[data-ara]')) { paletAc(); return; }
    if (t.closest('[data-kendi]')) { kendiGelenAc(); }
  });
  kok.addEventListener('keydown', e => {
    const chip = e.target.closest?.('.masa-chip[data-id]');
    if (chip && e.target === chip && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); kisiKartiAc(Number(chip.dataset.id)); }
  });
  kok.addEventListener('input', e => {
    if (!e.target.matches?.('[data-gv-filtre]')) return;
    S.gvFiltre = e.target.value;
    const sutun = e.target.closest('[data-gv-sutun]'); const s = gorevVeri().find(x => String(x.id) === sutun?.dataset.gvSutun);
    const liste = sutun?.querySelector('.masa-gv-liste'); if (s && liste) { liste.innerHTML = gvKartListe(s, S.gvAcik.has(String(s.id)), S.gvFiltre); S.imza.gv = null; }
  });
  kok.addEventListener('wheel', e => {   // saat belirsiz şeridinde fare tekerleği yatay kaydırır
    const c = e.target.closest?.('.masa-bel-c'); if (!c || c.scrollWidth <= c.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    c.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  kok.addEventListener('contextmenu', e => {
    const c = e.target.closest('.masa-chip[data-id], .masa-kisi-c[data-id], .masa-gvk[data-gvk]'); if (!c) return;
    e.preventDefault(); const id = Number(c.dataset.id || c.dataset.gvk);
    if (!yazabilirMi()) { kisiKartiAc(id); return; }
    menuAc(id, { x: e.clientX, y: e.clientY });
  });
  // sürükle-bırak: çizelge çipi -> araç satırı · görev kartı -> sorumlu sütunu
  kok.addEventListener('dragstart', e => {
    const s = e.target.closest?.('[data-surukle="1"]'); if (!s) return;
    const id = s.dataset.id || s.dataset.gvk; S.suruk = true;
    e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move';
  });
  kok.addEventListener('dragend', surukSonu);
  const hedefBul = e => e.target.closest?.('.masa-iz[data-hedef], .masa-gv-s');
  kok.addEventListener('dragover', e => {
    const h = hedefBul(e); if (!h || !S.suruk) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    qa('.over').forEach(x => { if (x !== h) x.classList.remove('over'); }); h.classList.add('over');
  });
  kok.addEventListener('dragleave', e => { const h = hedefBul(e); if (h && !h.contains(e.relatedTarget)) h.classList.remove('over'); });
  kok.addEventListener('drop', e => {
    const h = hedefBul(e); if (!h) return; e.preventDefault(); h.classList.remove('over');
    const id = Number(e.dataTransfer.getData('text/plain')); surukSonu(); if (!id) return;
    if (h.classList.contains('masa-iz')) araciBirak(id, h); else sorumluyaBirak(id, h);
  });
  // menü: dışarı tıklayınca, Esc, kaydırma ve yeniden boyutlandırmada kapanır
  const disari = e => { if (S.menu && !S.menu.contains(e.target)) menuKapat(); };
  const tus = e => { if (e.key === 'Escape' && S.menu) menuKapat(); };
  const kapat = e => { if (S.menu && !(e?.target instanceof Node && S.menu.contains(e.target))) menuKapat(); };
  document.addEventListener('mousedown', disari, true); document.addEventListener('keydown', tus, true);
  window.addEventListener('scroll', kapat, true); window.addEventListener('resize', kapat);
  S.sokuculer.push(() => document.removeEventListener('mousedown', disari, true), () => document.removeEventListener('keydown', tus, true),
    () => window.removeEventListener('scroll', kapat, true), () => window.removeEventListener('resize', kapat));
  // çizelge genişliği değişince ölçek yeniden hesaplanır
  const kap = q('[data-cz-kaydir]');
  if (kap && 'ResizeObserver' in window) {
    let bekle = 0;
    S.ro = new ResizeObserver(() => { cancelAnimationFrame(bekle); bekle = requestAnimationFrame(() => { if (!S.kok || S.gorunum !== 'cz') return; if (Math.abs(Math.max(300, kap.clientWidth - SOL) - S.W) > 2) czCiz(true); }); });
    S.ro.observe(kap);
  }
}

// Görev dağılımı açıkken de başlıktaki sayaç ve saat aralığı güncel kalsın
function sayiHesapla() { const tum = saatliKartlar(); S.ax = eksenHesapla(tum); S.say = { timed: tum.length, satir: satirlaraAyir(tum).filter(g => g.tur !== 'yok').length }; }
function guncelle(zorla = false) {
  if (!S.kok || !S.kok.isConnected) return;
  if (S.suruk) { S.bekleyen = true; return; }   // sürüklerken DOM yerinde kalsın; bırakınca yenilenir
  const serit = (document.getElementById('cevrimdisi')?.offsetHeight || 0) + 'px';   // çevrimdışı şeridi açıkken sayfa taşmasın
  const kutu = q('.masa'); if (kutu && kutu.style.getPropertyValue('--serit-h') !== serit) kutu.style.setProperty('--serit-h', serit);
  kpiCiz();
  if (S.gorunum === 'cz') { czCiz(zorla); belirsizCiz(zorla); } else { sayiHesapla(); gorevCiz(zorla); }
  basCiz(zorla); panelCiz(zorla); gecikenModalCiz();
}

// ---------------------------------------------------------------- ekran modülü
export default {
  async render(kok) {
    stilEkle(); tercihOku(); menuKapat();
    Object.assign(S, { kok, gorunum: 'cz', sekme: 'akis', kume: null, imza: {}, ax: null, sokuculer: [], gecikenModal: null, suruk: false, bekleyen: false, tumBild: [], gvFiltre: '', gvAcik: new Set(), say: { timed: 0, satir: 0 } });
    kok.innerHTML = iskelet();
    bagla(); gorunumUygula();
    guncelle(true);
    tumBildirimCek();
    S.zamanlayici = setInterval(tumBildirimCek, 30000);
  },
  yenile(sebep) {
    // app.js kare başına tek sebep iletir; her parça kendi imzasına bakıp yalnız değiştiyse yeniden çizilir.
    if (!S.kok || !S.kok.isConnected) return;
    if (sebep === 'bildirim') tumBildirimCek();
    if (sebep === 'saat' && S.gorunum === 'cz') simdiCiz();
    guncelle();
  },
  temizle() {
    S.sokuculer.forEach(f => { try { f(); } catch { /* yoksay */ } }); S.sokuculer = [];
    clearInterval(S.zamanlayici); S.ro?.disconnect(); S.ro = null;
    menuKapat(); if (S.gecikenModal?.isConnected) modalKapat();
    S.gecikenModal = null; S.kok = null; S.ax = null;
  },
};

// ---------------------------------------------------------------- ekran stili
function stilEkle() {
  document.querySelector('style[data-ekran="masa"]')?.remove();
  const st = document.createElement('style'); st.dataset.ekran = 'masa';
  st.textContent = `
.masa { display: flex; flex-direction: column; gap: 14px; height: calc(100dvh - var(--ust-h) - var(--serit-h, 0px) - 30px); min-height: 640px; margin: -6px 0 -4px; color: var(--ink); }
.masa button { font-family: inherit; }
.masa-nokta { display: inline-block; width: 8px; height: 8px; border-radius: 99px; flex: none; }
.masa-nokta.k { width: 7px; height: 7px; }
.masa-nokta.halka-nokta { width: 10px; height: 10px; background: transparent; border: 2px solid var(--amber); box-sizing: border-box; }

/* KPI şeridi */
.masa-kpi { flex: none; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) 300px; gap: 12px; }
.masa-kpi-k { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px 12px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 4px; }
.masa-kpi-e { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: .09em; color: var(--ink-3); white-space: nowrap; }
.masa-kpi-d { font-size: 44px; font-weight: 900; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; transform-origin: left center; }
.masa-kpi-a { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 15px; }
.masa-gec-link { border: 0; background: none; padding: 0; font: inherit; color: inherit; font-weight: 600; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
.masa-gec-link:hover { color: var(--amber-ink); text-decoration-style: solid; }
.masa-kpi-r { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; box-shadow: var(--shadow); display: flex; align-items: center; gap: 16px; }
.masa-halka { width: 88px; height: 88px; border-radius: 99px; flex: none; display: flex; align-items: center; justify-content: center; background: conic-gradient(var(--red) 0deg, var(--surface-3) 0); }
.masa-halka-ic { width: 74px; height: 74px; border-radius: 99px; background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.masa-halka-ic .y { font-size: 24px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--ink); }
.masa-halka-ic .h { font-size: 10px; font-weight: 700; letter-spacing: .08em; color: var(--ink-3); margin-top: 3px; white-space: nowrap; }
.masa-kpi-rs { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.masa-kpi-rs .e { font-size: 11px; font-weight: 700; letter-spacing: .09em; color: var(--ink-3); white-space: nowrap; }
.masa-kpi-rs .d { font-size: 26px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
.masa-kpi-rs .d .t { color: var(--ink-3); font-weight: 700; }
.masa-kpi-rs .a { font-size: 12px; color: var(--ink-2); }
.masa-flas { animation: masa-flas .9s ease-out; }
@keyframes masa-flas { 0% { transform: scale(1.08); } 100% { transform: none; } }

/* ana ızgara */
.masa-ana { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 14px; }
.masa-merkez { min-height: 0; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); position: relative; display: flex; flex-direction: column; overflow: hidden; }
.masa-cbas { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.masa-tab { flex: none; display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 7px; border-radius: 7px; border: 0; cursor: pointer; font-size: 11px; font-weight: 800; letter-spacing: .06em; white-space: nowrap; background: transparent; color: var(--ink-3); }
.masa-tab:hover { color: var(--ink); }
.masa-tab.on { background: var(--surface-3); color: var(--ink); }
.masa-say { flex: none; white-space: nowrap; font-size: 12px; color: var(--ink-3); }
.masa-seg { flex: none; display: grid; grid-template-columns: 1fr 1fr; padding: 2px; border-radius: 8px; background: var(--surface-3); }
.masa-seg button { height: 24px; padding: 0 10px; border-radius: 6px; border: 0; cursor: pointer; font-size: 12px; font-weight: 700; background: transparent; color: var(--ink-2); }
.masa-seg button.on { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
.masa-leg { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.masa-lej { flex: none; display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ink-2); white-space: nowrap; }
.masa-benim { flex: none; height: 26px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 99px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink-2); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.masa-benim span { font-variant-numeric: tabular-nums; background: var(--surface-3); border-radius: 99px; padding: 0 6px; }
.masa-benim.on { background: var(--red); border-color: var(--red); color: var(--on-red, #fff); }
.masa-benim.on span { background: rgba(255, 255, 255, .22); }
.masa-aralik { flex: none; white-space: nowrap; font-size: 12px; font-weight: 700; color: var(--ink-2); border: 1px solid var(--line); border-radius: 7px; padding: 4px 8px; font-variant-numeric: tabular-nums; }

/* zaman çizelgesi */
.masa-cz { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; position: relative; }
.masa-cz-ic { position: relative; min-width: 100%; }
.masa-eksen { position: sticky; top: 0; z-index: 6; display: grid; grid-template-columns: ${SOL}px minmax(0, 1fr); border-bottom: 1px solid var(--line); background: var(--surface-2); }
.masa-eksen-e { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; color: var(--ink-3); padding: 6px 16px; white-space: nowrap; display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
.masa-eksen-e .masa-benim { height: 18px; padding: 0 7px; font-size: 10.5px; letter-spacing: 0; gap: 4px; }
.masa-eksen-z { position: relative; height: 24px; }
.masa-simdi-pill { position: absolute; top: 3px; z-index: 3; background: var(--red); color: #fff; font-size: 10px; font-weight: 800; letter-spacing: .06em; padding: 3px 6px; border-radius: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; transition: left .6s linear; }
.masa-simdi-pill.disari { background: var(--ink-3); }
.masa-saat { position: absolute; top: 5px; font-size: 11px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; transition: opacity .2s; }
.masa-saat.silik { opacity: 0; }
.masa-satir { display: grid; grid-template-columns: ${SOL}px minmax(0, 1fr); border-bottom: 1px solid var(--line); }
.masa-satir-e { display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 0 12px 0 16px; border-right: 1px solid var(--line); min-width: 0; }
.masa-satir-e1 { display: flex; align-items: center; gap: 6px; }
.masa-satir-ad { font-size: 12.5px; font-weight: 800; white-space: nowrap; }
.masa-uyari-yazi { color: var(--amber-ink); }
.masa-satir-sayi { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.masa-satir-alt { font-size: 11px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-plk { display: inline-flex; align-items: stretch; height: 18px; border: 1.2px solid #111; border-radius: 3px; background: #fff; overflow: hidden; flex: none; }
.masa-plk i { width: 6px; background: #1F4FA8; }
.masa-plk b { padding: 0 5px; display: flex; align-items: center; font-size: 10.5px; font-weight: 800; color: #111; white-space: nowrap; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
.masa-iz { position: relative; background-image: linear-gradient(to right, var(--line) 1px, transparent 1px); background-size: var(--sa) 100%; }
.masa-iz.havuz { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px; padding: 5px; min-height: ${SATIR_MIN}px; background-image: none; }
.masa-iz.havuz .masa-chip { position: relative; flex: none; }
.masa-iz.havuz .masa-past { display: none; }
.masa-iz.over { background-color: var(--red-soft); outline: 1.5px dashed var(--red); outline-offset: -2px; }
.masa-past { position: absolute; top: 0; bottom: 0; left: 0; width: 0; background: var(--past); pointer-events: none; }
.masa-simdi { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--red); z-index: 5; pointer-events: none; box-shadow: 0 0 0 3px rgba(var(--marka-golge), .12); transition: left .6s linear; }
.masa-bos { padding: 40px 16px; text-align: center; color: var(--ink-3); font-size: 13px; }

/* çizelge çipi 88x34 */
.masa-chip { position: absolute; z-index: 2; width: ${CHIP_G}px; height: ${CHIP_Y}px; box-sizing: border-box; border-radius: 7px; padding: 3px 7px; display: flex; flex-direction: column; justify-content: center; gap: 2px; text-align: left; cursor: pointer; color: var(--ink); background: var(--gray-soft); border: 1px solid transparent; outline: none; }
.masa-chip[data-d="bekliyor"] { background: var(--surface); border-color: var(--line-2); }
.masa-chip[data-d="arandi"] { background: var(--blue-soft); }
.masa-chip[data-d="yolda"] { background: var(--amber-soft); }
.masa-chip[data-d="fuarda"] { background: var(--violet-soft); }
.masa-chip[data-d="oy_kullandi"] { background: var(--green-soft); }
.masa-chip.gec { background: var(--amber-soft); border: 1.5px solid var(--amber); animation: smPulse 1.6s ease-in-out infinite; }
.masa-chip.soluk { opacity: .6; }
.masa-chip:hover, .masa-chip:focus-visible { z-index: 4; box-shadow: var(--shadow); }
.masa-chip:focus-visible { border-color: var(--red); }
.masa-chip .c1 { display: flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 11.5px; font-weight: 800; line-height: 1.1; overflow: hidden; }
.masa-chip .ad { overflow: hidden; text-overflow: ellipsis; }
.masa-chip .c2 { font-size: 10px; font-weight: 500; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; }
.masa-chip .c2.gec { font-weight: 800; letter-spacing: .06em; color: var(--amber-ink); }
.masa-chip .c2.oy { color: var(--green); }

/* saat belirsiz */
.masa-bel { flex: none; border-top: 1px solid var(--line); background: var(--surface-2); padding: 10px 16px 12px; display: flex; flex-direction: column; gap: 8px; height: 84px; box-sizing: border-box; }
.masa-bel[hidden], .masa-cz[hidden], .masa-gv[hidden] { display: none; }
.masa-bel-u { display: flex; align-items: center; gap: 10px; }
.masa-bel-b { white-space: nowrap; font-size: 11px; font-weight: 800; letter-spacing: .1em; }
.masa-bel-s { white-space: nowrap; font-size: 12px; color: var(--ink-3); }
.masa-bel-g { margin-left: auto; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 600; cursor: pointer; }
.masa-bel-c { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap; scrollbar-width: none; }
.masa-bel-c::-webkit-scrollbar { display: none; }
.masa-bel.acik { height: auto; max-height: 42vh; }
.masa-bel.acik .masa-bel-c { flex-wrap: wrap; overflow-x: hidden; overflow-y: auto; align-content: flex-start; scrollbar-width: thin; padding-bottom: 2px; }
.masa-bel.acik .masa-bel-c::-webkit-scrollbar { display: block; width: 6px; }
.masa-bel.acik .masa-bel-c::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 3px; }
.masa-kume { flex: none; height: 32px; display: flex; align-items: center; gap: 7px; padding: 0 11px; border-radius: 99px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.masa-kume:hover, .masa-kisi-c:hover { border-color: var(--ink-3); }
.masa-kume span { font-weight: 800; font-variant-numeric: tabular-nums; background: var(--surface-3); border-radius: 99px; padding: 1px 7px; }
.masa-kisi-c { flex: none; height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.masa-kisi-c .f { font-weight: 500; color: var(--ink-3); }

/* görev dağılımı */
.masa-gv { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: var(--surface); box-sizing: border-box; }
.masa-gv-ust { flex: none; display: flex; align-items: center; gap: 10px; }
.masa-gv-ust .a { font-size: 12.5px; color: var(--ink-2); }
.masa-gv-ust .masa-benim { margin-left: 10px; }
.masa-gv-ust .b { margin-left: auto; font-size: 12px; color: var(--ink-3); white-space: nowrap; }
.masa-gv-sut { flex: 1; min-height: 0; display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
.masa-gv-s { flex: none; width: 214px; display: flex; flex-direction: column; border-radius: 11px; background: var(--surface-2); border: 1px solid var(--line); min-height: 0; }
.masa-gv-s.yok { background: var(--surface); border: 1.5px dashed var(--line-2); }
.masa-gv-s.over { background: var(--red-soft); border: 1.5px dashed var(--red); }
.masa-gv-s .h { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 10px 8px; }
.masa-gv-s .av { width: 30px; height: 30px; flex: none; border-radius: 99px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; background: var(--ink); color: var(--surface); box-sizing: border-box; }
.masa-gv-s .av.yok { background: transparent; color: var(--ink-3); border: 1.5px dashed var(--line-2); }
.masa-gv-s .hb { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
.masa-gv-s .ad { font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-gv-s .rol { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.masa-gv-s .n { font-size: 18px; font-weight: 900; font-variant-numeric: tabular-nums; }
.masa-gv-s .bar { flex: none; display: flex; align-items: center; gap: 6px; padding: 0 10px 8px; }
.masa-gv-s .bar .iz { flex: 1; height: 5px; border-radius: 99px; background: var(--surface-3); overflow: hidden; }
.masa-gv-s .bar .iz i { display: block; height: 100%; background: var(--green); border-radius: 99px; }
.masa-gv-s .bar .tx { font-size: 11px; font-weight: 700; color: var(--ink-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.masa-gv-filtre { flex: none; margin: 0 8px 8px; height: 30px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); padding: 0 10px; font-size: 12px; outline: none; }
.masa-gv-filtre:focus { border-color: var(--red); }
.masa-gv-liste { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; padding: 0 8px 8px; }
.masa-gvk { display: flex; flex-direction: column; gap: 3px; padding: 8px 9px; border-radius: 8px; background: var(--surface); border: 1px solid var(--line); cursor: grab; box-shadow: var(--shadow); flex: none; }
.masa-gvk.gec { border: 1.5px solid var(--amber); }
.masa-gvk .r1 { display: flex; align-items: center; gap: 6px; }
.masa-gvk .t { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.masa-gvk .r1 .masa-rz { margin-left: auto; flex: none; }
.masa-gvk .r2 { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-rz { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; }
.masa-rz.d-bekliyor { background: var(--gray-soft); color: var(--ink-2); border: 1.5px solid var(--gray-soft); }
.masa-rz.d-arandi { background: var(--blue-soft); color: var(--blue); border: 1.5px solid var(--blue-soft); }
.masa-rz.d-yolda { background: var(--amber-soft); color: var(--amber-ink); border: 1.5px solid var(--amber-soft); }
.masa-rz.d-fuarda { background: var(--violet-soft); color: var(--violet); border: 1.5px solid var(--violet-soft); }
.masa-rz.d-oy_kullandi { background: var(--green); color: #fff; border: 1.5px solid var(--green); }
.masa-rz.gec { background: var(--amber-soft); color: var(--amber-ink); border: 1.5px solid var(--amber); animation: smPulse 1.6s ease-in-out infinite; }
.masa-gv-s .d-oy_kullandi::before { content: none; }
.masa-gv-daha { flex: none; font-size: 11.5px; color: var(--ink-3); text-align: center; padding: 6px; border: 0; background: none; cursor: pointer; }
.masa-gv-daha:hover { color: var(--ink); text-decoration: underline; }
.masa-gv-bos { font-size: 11.5px; color: var(--ink-3); text-align: center; padding: 14px 6px; }

/* sağ panel */
.masa-panel { min-height: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; }
.masa-ptab { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.masa-canli { width: 7px; height: 7px; border-radius: 99px; background: var(--green); animation: smBlink 2s infinite; flex: none; }
.masa-canli.kopuk { background: var(--amber); }
.masa-tab-say { font-variant-numeric: tabular-nums; background: var(--surface-3); color: var(--ink-2); border-radius: 99px; padding: 1px 6px; letter-spacing: 0; }
.masa-tab-say.amber { background: var(--amber); color: #1a1200; }
.masa-pbody { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; overscroll-behavior: contain; }
.masa-pbody > * { flex: none; }
.masa-bos-p { padding: 30px 16px; text-align: center; font-size: 13px; color: var(--ink-3); line-height: 1.6; }
.masa-fd { display: grid; grid-template-columns: 40px 10px minmax(0, 1fr) auto; align-items: start; gap: 8px; padding: 9px 16px; border-bottom: 1px solid var(--line); }
.masa-fd .z { font-size: 12px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; padding-top: 1px; }
.masa-fd .nk { width: 8px; height: 8px; border-radius: 99px; margin-top: 5px; }
.masa-fd .g { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.masa-fd .l1 { font-size: 13px; color: var(--ink); line-height: 1.35; word-break: break-word; }
.masa-fd .ad { border: 0; background: none; padding: 0; font: inherit; font-weight: 800; color: var(--ink); cursor: pointer; }
.masa-fd button.ad:hover { text-decoration: underline; }
.masa-fd .l2 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.masa-fd .l2 .tx { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-atlas { flex: none; font-size: 9.5px; font-weight: 900; letter-spacing: .08em; background: var(--ink); color: var(--surface); border-radius: 4px; padding: 2px 5px; }
.masa-fd .al { font-size: 11.5px; color: var(--ink-2); font-style: italic; line-height: 1.35; padding: 4px 0 0 8px; border-left: 2px solid var(--line-2); }
.masa-geri { height: 24px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink-2); font-size: 11.5px; font-weight: 700; cursor: pointer; }
.masa-geri:hover { background: var(--surface-3); color: var(--ink); }
.masa-cv-ust { padding: 10px 16px 6px; font-size: 12px; color: var(--ink-2); }
.masa-cv { display: flex; flex-direction: column; gap: 8px; margin: 0 12px 10px; padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--amber); background: var(--amber-soft); }
.masa-cv .u { display: flex; align-items: center; gap: 8px; }
.masa-cv .t { font-size: 12px; font-weight: 800; color: var(--amber-ink); font-variant-numeric: tabular-nums; }
.masa-cv .k { margin-left: auto; font-size: 11.5px; color: var(--ink-2); white-space: nowrap; }
.masa-cv .m { border: 0; background: none; padding: 0; text-align: left; font: inherit; font-size: 13.5px; font-weight: 700; color: var(--ink); cursor: pointer; }
.masa-cv .b { display: grid; gap: 5px; }
.masa-cv .b button { height: 34px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.masa-cv .b button:hover:not(:disabled) { background: var(--surface-3); }
.masa-cv .b button:disabled { opacity: .5; cursor: not-allowed; }
.masa-gl { display: flex; flex-direction: column; gap: 5px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.masa-gl .u { display: flex; align-items: center; gap: 8px; }
.masa-gl .z { font-size: 12px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.masa-gl .k { font-size: 12.5px; font-weight: 800; }
.masa-gl .s { margin-left: auto; }
.masa-gl .q { font-size: 13px; line-height: 1.4; padding: 7px 10px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); word-break: break-word; }
.masa-gl .h { font-size: 11.5px; color: var(--ink-3); }
.masa-st { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; white-space: nowrap; box-sizing: border-box; line-height: 1; }
.masa-st.yesil { background: var(--green-soft); color: var(--green); border: 1.5px solid var(--green-soft); }
.masa-st.gri { background: var(--gray-soft); color: var(--ink-2); border: 1.5px solid var(--gray-soft); }
.masa-st.amber { background: var(--amber-soft); color: var(--amber-ink); border: 1.5px solid var(--amber-soft); }
.masa-st.mavi { background: var(--blue-soft); color: var(--blue); border: 1.5px solid var(--blue-soft); }
.masa-pfoot { flex: none; display: flex; flex-direction: column; gap: 2px; margin: 10px 10px 8px; }
.masa-ara { flex: none; min-width: 0; height: 48px; margin-bottom: 2px; border-radius: 10px; border: 0; background: var(--red); color: #fff; font-size: 15px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; white-space: nowrap; }
.masa-ara:hover { background: var(--red-d); }
.masa-ara .kbd { font-size: 12px; font-weight: 700; background: rgba(255, 255, 255, .18); border: 0; color: #fff; border-radius: 5px; padding: 2px 7px; min-width: 0; height: auto; display: inline-block; }
.masa-kendi { align-self: flex-start; height: 26px; padding: 0 8px; border-radius: 7px; border: 0; background: transparent; color: var(--green); font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.masa-kendi:hover { background: var(--green-soft); }

/* hızlı işaret menüsü */
.masa-menu { position: fixed; z-index: 95; width: 240px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-lg); padding: 6px; }
.masa-menu .ust { padding: 8px 10px 10px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.masa-menu .ad { font-weight: 900; font-size: 14px; }
.masa-menu .firma { font-size: 11px; color: var(--ink-3); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-menu button { display: flex; align-items: center; gap: 10px; width: 100%; height: 36px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; font-weight: 700; font-size: 13px; cursor: pointer; text-align: left; color: var(--ink); }
.masa-menu button:hover:not(:disabled), .masa-menu button:focus-visible { background: var(--surface-3); outline: none; }
.masa-menu button:disabled { color: var(--ink-3); cursor: default; }
.masa-menu i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.masa-menu i.cerceve { background: transparent; border: 1.5px solid var(--ink-3); }
.masa-menu .sag { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--ink-3); }
.masa-menu .karsilayan { margin-top: 6px; font-size: 11.5px; font-weight: 700; color: var(--violet); }
.masa-menu .ayrac { height: 1px; background: var(--line); margin: 4px 2px; }

/* gecikenler penceresi */
.masa-gec-modal { width: min(640px, 100%); }
.masa-gec-aciklama { font-size: 12px; color: var(--ink-3); font-weight: 600; margin-bottom: 10px; }
.masa-gec-satir { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 8px; cursor: pointer; }
.masa-gec-satir:hover { background: var(--surface-2); }
.masa-gec-sure { flex: none; width: 54px; height: 44px; border-radius: 10px; background: var(--amber-soft); color: var(--amber-ink); display: grid; place-content: center; text-align: center; line-height: 1; }
.masa-gec-sure b { font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums; }
.masa-gec-sure span { font-size: 10px; font-weight: 800; }
.masa-gec-bilgi { flex: 1; min-width: 0; }
.masa-gec-bilgi .ad { font-weight: 800; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.masa-gec-bilgi .alt { font-size: 12px; color: var(--ink-3); font-weight: 600; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-gec-eylem { display: flex; gap: 6px; flex: none; }
.masa-yolda-btn { background: var(--amber-soft); color: var(--amber-ink); border-color: transparent; }
.masa-palet-ipucu { padding: 8px 20px; background: var(--green-soft); color: var(--green); font-weight: 700; font-size: 12px; border-bottom: 1px solid var(--line); }

/* dar ekranlar: sabit yükseklik bırakılır, kartlar alt alta */
@media (max-width: 1100px) {
  .masa { height: auto; margin: 0; }
  .masa-kpi { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .masa-kpi-r { grid-column: 1 / -1; }
  .masa-ana { grid-template-columns: minmax(0, 1fr); }
  .masa-merkez { height: 680px; }
  .masa-panel { height: 520px; }
}
`;
  document.head.appendChild(st);
}
