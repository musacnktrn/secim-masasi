// 72. Komite · Seçim Masası · MASA: CANLI KOMUTA (ATLAS, 2026-09-30)
// Seçim günü masada 8 saat açık kalan ana ekran: KPI şeridi + ilerleme halkası, yatay zaman çizelgesi
// (şimdi çizgisi, gecikenler, hızlı işaret), saati belirsiz servis yolcuları ve canlı işaret akışı.
// Her şey store'dan okunur; yazma yalnız ui.isaretle (ve onun çağırdığı core.durumYap) ile yapılır.
import {
  store, esc, fmt, trBaslik, dakika, simdi, simdiDk, sayac, gecikme, ulasim, firmaListesi, firmaAdi, aracOf,
  olayMetni, yazabilirMi, DURUM_AD, SINIF_AD, ARAC_DURUM_AD, VARIS,
} from '../core.js';
import { el, plakaHtml, rozetDurum, kaynakCip, isaretle, kisiKartiAc, paletAc, paletKapat, modal, modalKapat, toast } from '../ui.js';

// ---------------------------------------------------------------- sabitler
const GRUPLAR = [{ k: 'rota', ad: 'Rota' }, { k: 'arac', ad: 'Araç' }, { k: 'referans', ad: 'Referans' }];
const EKSEN_Y = 34;          // saat ekseni yüksekliği (px)
const KART_Y = 40;           // çizelge kartı yüksekliği
const SERIT_ARA = 6;         // kartlar arası dikey boşluk
const SATIR_PAD = 8;         // satır iç boşluğu (üst/alt)
const ETIKET_MIN = { arac: 86, diger: 58 };   // satır başlığının sığdığı en küçük satır yüksekliği (plaka + şoför + durum üç satır)
const DURUM_RENK = { bekliyor: 'gri', arandi: 'mavi', yolda: 'amber', fuarda: 'mor', oy_kullandi: 'yesil' };
const TERCIH_ANAHTAR = 'secim-masa-tercih';

// ---------------------------------------------------------------- ekran durumu
const S = {
  kok: null, grup: 'rota', gizle: false, acikIlce: null,
  imza: {}, gorulen: new Set(), ilkAkis: true, ilkKaydirma: true,
  ar: null, ppm: 1, sol: 196, kartG: 144, genislik: 0,
  ro: null, sokuculer: [], menu: null, gecikenModal: null,
};

// ---------------------------------------------------------------- yardımcılar
const iki = n => String(n).padStart(2, '0');
const hhmm = dk => `${iki(Math.floor(dk / 60) % 24)}:${iki(Math.floor(dk % 60))}`;
function sureYaz(dk) {
  dk = Math.max(0, Math.round(dk));
  const s = Math.floor(dk / 60), d = dk % 60;
  return s ? `${s} sa${d ? ` ${d} dk` : ''}` : `${d} dk`;
}
function zamanAyar() {
  const z = store.ayarlar.zaman || {};
  let bas = dakika(z.bas), bit = dakika(z.bit);
  if (bas == null || Number.isNaN(bas)) bas = 9 * 60;
  if (bit == null || Number.isNaN(bit) || bit <= bas) bit = Math.max(bas + 60, 17 * 60);
  return { bas, bit };
}
function gunFarki() {
  const t = store.ayarlar.secim?.tarih; if (!t) return 0;
  const d = simdi(); const bugun = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const [y, a, g] = String(t).split('-').map(Number); if (!y) return 0;
  return Math.round((new Date(y, a - 1, g) - bugun) / 86400000);
}
// Firma ünvanından kısa etiket: "SOLFER SOĞUTMA VE ..." -> "SOLFER"; çok kısaysa ikinci kelime eklenir
function kisaFirma(u) {
  const w = String(u || '').replace(/[,.;:()]/g, ' ').split(/\s+/).filter(x => x && x !== '-');
  let s = w[0] || ''; if (s.length < 5 && w[1]) s += ' ' + w[1];
  return s.length > 18 ? s.slice(0, 17) + '…' : s;
}
// 'HARUN BULAN · Rota 3' -> { ref: 'Harun Bulan', rota: 'Rota 3' }
function rotaParca(kod) {
  if (!kod) return { ref: '', rota: '' };
  const [ref, ...kalan] = String(kod).split(' · ');
  return { ref: trBaslik(ref), rota: kalan.join(' · ') };
}
const rotaKisa = f => { if (!f.rota_kod) return ''; const p = rotaParca(f.rota_kod); return `${p.ref}${p.rota ? ' · ' + p.rota.replace(/^Rota\s*/i, 'R') : ''}${f.rota_sira ? '/' + f.rota_sira : ''}`; };
function kartBaslik(f) {
  const a = aracOf(f); const g = gecikme(f);
  return [
    firmaAdi(f), f.unvan || '',
    `${f.tasima_saati ? 'Taşıma ' + fmt.saatKisa(f.tasima_saati) : 'Saat belirsiz'}${f.rota_kod ? ' · ' + rotaParca(f.rota_kod).ref + ' ' + rotaParca(f.rota_kod).rota + (f.rota_sira ? ', ' + f.rota_sira + '. durak' : '') : ''}`,
    `Durum: ${f.kendi_geldi && f.durum === 'oy_kullandi' ? 'Kendi geldi, oy kullandı' : (DURUM_AD[f.durum] || f.durum)} · Sınıf: ${SINIF_AD[f.oy_sinifi] || f.oy_sinifi || '?'}`,
    g ? `Gecikme: ${g} dk` : '',
    f.evrak_uyari ? `Evrak uyarısı: ${f.evrak_uyari}` : '',
    f.kisi_oy_sayisi > 1 ? `Aynı kişi ${f.kisi_oy_sayisi} firmayla oy kullanıyor` : '',
    a ? `Araç: ${fmt.plaka(a.plaka)}${a.sofor_ad ? ' (' + trBaslik(a.sofor_ad) + ')' : ''}` : 'Araç atanmadı',
    'Tıkla: kişi kartı · Sağ tık: hızlı işaret',
  ].filter(Boolean).join('\n');
}
function uyariNoktasi(f) {
  if (f.evrak_uyari) return `<span class="masa-nokta evrak${f.kisi_oy_sayisi > 1 ? ' iki' : ''}"></span>`;
  if (f.kisi_oy_sayisi > 1) return '<span class="masa-nokta ikioy"></span>';
  return '';
}
function tercihOku() {
  try { const t = JSON.parse(localStorage.getItem(TERCIH_ANAHTAR) || '{}'); if (GRUPLAR.some(g => g.k === t.grup)) S.grup = t.grup; S.gizle = !!t.gizle; } catch { /* tarayıcı depolaması yoksa varsayılanlar */ }
}
function tercihYaz() { try { localStorage.setItem(TERCIH_ANAHTAR, JSON.stringify({ grup: S.grup, gizle: S.gizle })); } catch { /* yoksay */ } }
const q = s => S.kok?.querySelector(s);

// ---------------------------------------------------------------- iskelet
function iskelet() {
  return `
  <div class="masa">
    <div class="masa-ust">
      <div class="masa-baslik">
        <h1>Canlı komuta</h1>
        <div class="masa-baslik-alt" data-baslik-alt></div>
      </div>
      <button type="button" class="masa-ara" data-ara title="Hızlı arama (⌘K ya da /)">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span class="masa-ara-yazi">Ad, firma, telefon ya da referans ara</span>
        <span class="kbd">⌘K</span>
      </button>
      ${yazabilirMi() ? `<button type="button" class="btn btn-yesil btn-buyuk masa-kendi" data-kendi title="Servis beklemeden kendi gelen kişiyi bul ve oy kullandı olarak işaretle">✓ Kendi gelen kişiyi işaretle</button>` : ''}
    </div>

    <section class="kart masa-kpi" data-kpi>
      <div class="masa-kpi-halka">
        <div class="masa-halka">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="iz" cx="60" cy="60" r="50"></circle>
            <circle class="dolu" data-halka cx="60" cy="60" r="50" transform="rotate(-90 60 60)"></circle>
          </svg>
          <div class="masa-halka-ic"><div class="yuzde" data-k="yuzde">%0</div><div class="oran" data-k="oran">0 / 0</div></div>
        </div>
        <div class="masa-halka-etiket">Hedefe ilerleme</div>
      </div>
      <div class="masa-kpi-hucre" data-renk="metin">
        <div class="kpi-etiket">Hedef</div>
        <div class="masa-kpi-deger" data-k="hedef">0</div>
        <div class="kpi-alt" data-k="hedef-alt"></div>
      </div>
      <div class="masa-kpi-hucre" data-renk="yesil">
        <div class="kpi-etiket">Oy kullandı</div>
        <div class="masa-kpi-deger"><span data-k="oy">0</span><small data-k="oy-hedef"></small></div>
        <div class="kpi-alt" data-k="oy-alt"></div>
      </div>
      <div class="masa-kpi-hucre" data-renk="mor">
        <div class="kpi-etiket">Fuarda</div>
        <div class="masa-kpi-deger" data-k="fuarda">0</div>
        <div class="kpi-alt">İçeride, oy bekliyor</div>
      </div>
      <div class="masa-kpi-hucre" data-renk="amber">
        <div class="kpi-etiket">Yolda</div>
        <div class="masa-kpi-deger" data-k="yolda">0</div>
        <div class="kpi-alt">Servis ya da araçta</div>
      </div>
      <div class="masa-kpi-hucre" data-renk="kirmizi">
        <div class="kpi-etiket">Kalan</div>
        <div class="masa-kpi-deger" data-k="kalan">0</div>
        <div class="kpi-alt">Hedefe kalan bizim oy</div>
      </div>
      <button type="button" class="masa-kpi-hucre masa-kpi-geciken" data-renk="turuncu" data-geciken title="Gecikenlerin listesini aç">
        <div class="kpi-etiket"><span class="masa-gec-nokta"></span>Geciken</div>
        <div class="masa-kpi-deger" data-k="geciken">0</div>
        <div class="kpi-alt" data-k="geciken-alt">Saati geçti, yola çıkmadı</div>
      </button>
    </section>

    <div class="masa-govde">
      <div class="masa-sol">
        <section class="kart masa-cz-kart">
          <div class="kart-baslik masa-cz-baslik">
            <div class="masa-cz-baslik-sol">Zaman çizelgesi <span class="alt" data-cz-alt></span></div>
            <div class="sag">
              <button type="button" class="masa-gizle" data-gizle title="Oy kullanmış kişilerin kartlarını çizelgeden gizle">
                <span class="anahtar" data-gizle-anahtar></span><span>Oy kullananları gizle</span>
              </button>
              <div class="masa-seg" role="tablist" aria-label="Gruplama">
                ${GRUPLAR.map(g => `<button type="button" role="tab" data-grup="${g.k}">${esc(g.ad)}</button>`).join('')}
              </div>
            </div>
          </div>
          <div class="masa-cz-kaydir" data-cz-kaydir><div class="masa-cz-ic" data-cz></div></div>
          <div class="masa-lejant">
            ${['bekliyor', 'arandi', 'yolda', 'fuarda', 'oy_kullandi'].map(d => `<span><i class="masa-lejant-kare" data-d="${d}"></i>${esc(DURUM_AD[d])}</span>`).join('')}
            <span><i class="masa-lejant-kare gec"></i>Gecikti</span>
            <span><i class="masa-nokta evrak statik"></i>Evrak uyarısı</span>
            <span><i class="masa-nokta ikioy statik"></i>Birden çok oy</span>
            <span class="masa-lejant-ipucu">Kart: tıkla kişi kartı · sağ tık hızlı işaret</span>
          </div>
        </section>
        <section class="kart masa-belirsiz" data-belirsiz></section>
      </div>
      <aside class="kart masa-akis">
        <div class="kart-baslik"><span class="masa-canli" data-canli></span>Canlı akış <span class="alt" data-akis-alt></span></div>
        <div class="masa-akis-liste" data-akis></div>
      </aside>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- başlık alt satırı (tarih, yer, kalan süre)
function baslikAltCiz() {
  const e = q('[data-baslik-alt]'); if (!e) return;
  const s = store.ayarlar.secim || {}; const z = zamanAyar();
  let tarih = '';
  if (s.tarih) { const [y, a, g] = String(s.tarih).split('-').map(Number); if (y) tarih = new Date(y, a - 1, g, 12).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }); }
  const fark = gunFarki(); const dk = simdiDk();
  let durum;
  if (fark > 1) durum = `Seçime ${fark} gün var`;
  else if (fark === 1) durum = 'Seçim yarın';
  else if (fark < 0) durum = 'Seçim tamamlandı';
  else if (dk < z.bas) durum = `Oy verme ${sureYaz(z.bas - dk)} sonra başlıyor`;
  else if (dk < z.bit) durum = `Sandık kapanışına ${sureYaz(z.bit - dk)}`;
  else durum = 'Oy verme saati bitti';
  const html = [tarih, s.yer || VARIS.ad, `Oy verme ${hhmm(z.bas)}-${hhmm(z.bit)}`].filter(Boolean).map(esc).join(' · ')
    + ` · <b class="${fark === 0 && dk >= z.bas && dk < z.bit && z.bit - dk <= 60 ? 'son-saat' : ''}">${esc(durum)}</b>`;
  if (e.innerHTML !== html) e.innerHTML = html;
}

// ---------------------------------------------------------------- KPI şeridi
function kpiCiz() {
  const s = sayac(); const elle = store.ayarlar.hedef?.elle;
  const imza = JSON.stringify(s) + '|' + (elle ?? '');
  if (imza === S.imza.kpi) return;
  const ilk = !S.imza.kpi; S.imza.kpi = imza;
  const yuzde = s.hedef ? Math.min(100, Math.round((s.oy_bizde / s.hedef) * 100)) : 0;
  const yaz = (k, v) => {
    const e = q(`[data-k="${k}"]`); if (!e) return; v = String(v);
    if (e.textContent === v) return; e.textContent = v;
    const deger = !ilk && e.closest('.masa-kpi-deger, .masa-halka-ic');   // değişen büyük rakam kısa bir parlama yapar
    if (deger) { deger.classList.remove('masa-flas'); void deger.offsetWidth; deger.classList.add('masa-flas'); }
  };
  const halka = q('[data-halka]');
  if (halka) { const C = 2 * Math.PI * 50; halka.style.strokeDasharray = `${C}`; halka.style.strokeDashoffset = `${C * (1 - yuzde / 100)}`; }
  q('.masa-halka')?.classList.toggle('tam', yuzde >= 100);
  yaz('yuzde', `%${yuzde}`);
  yaz('oran', `${fmt.sayi(s.oy_bizde)} / ${fmt.sayi(s.hedef)}`);
  yaz('hedef', fmt.sayi(s.hedef));
  yaz('hedef-alt', elle != null ? 'Elle belirlenen hedef' : `Kesin bizde listesi (${fmt.sayi(s.bizde)})`);
  yaz('oy', fmt.sayi(s.oy_bizde));
  yaz('oy-hedef', ` / ${fmt.sayi(s.hedef)}`);
  yaz('oy-alt', `Bizden oy · toplam oy kullanan ${fmt.sayi(s.oy_kullandi)}${s.kendi_geldi ? ` · ${fmt.sayi(s.kendi_geldi)} kendi geldi` : ''}`);
  yaz('fuarda', fmt.sayi(s.fuarda));
  yaz('yolda', fmt.sayi(s.yolda));
  yaz('kalan', fmt.sayi(s.kalan));
  yaz('geciken', fmt.sayi(s.geciken));
  yaz('geciken-alt', s.geciken ? 'Listeyi görmek için tıkla' : 'Saati geçti, yola çıkmadı');
  q('[data-geciken]')?.classList.toggle('var', s.geciken > 0);
}

// ---------------------------------------------------------------- ZAMAN ÇİZELGESİ
function saatliKartlar() {
  return firmaListesi().filter(f => f.tasima_saati).map(f => ({ f, dk: dakika(f.tasima_saati) })).filter(k => Number.isFinite(k.dk));
}
function aralikHesapla(kartlar) {
  const z = zamanAyar(); let gBas = z.bas, gBit = z.bit;
  for (const k of kartlar) { gBas = Math.min(gBas, Math.floor(k.dk / 60) * 60); gBit = Math.max(gBit, Math.ceil((k.dk + 1) / 60) * 60); }
  return { bas: z.bas, bit: z.bit, gBas, gBit };
}
// Satırlara ayır: rota / araç / referans
function satirlaraAyir(kartlar) {
  const gruplar = new Map();
  const ekle = (anahtar, bilgi, k) => { if (!gruplar.has(anahtar)) gruplar.set(anahtar, { anahtar, ...bilgi, kartlar: [] }); if (k) gruplar.get(anahtar).kartlar.push(k); };
  if (S.grup === 'arac') {
    ekle('yok', { tur: 'yok' });
    [...store.araclar.values()].sort((a, b) => fmt.plaka(a.plaka).localeCompare(fmt.plaka(b.plaka), 'tr', { numeric: true })).forEach(a => ekle('a' + a.id, { tur: 'arac', a }));
    kartlar.forEach(k => { const a = aracOf(k.f); ekle(a ? 'a' + a.id : 'yok', a ? { tur: 'arac', a } : { tur: 'yok' }, k); });
    // araçlar üstte (masanın izlediği asıl şey), atanmamışlar en altta toplu durur
    const liste = [...gruplar.values()];
    return [...liste.filter(g => g.tur !== 'yok'), ...liste.filter(g => g.tur === 'yok' && g.kartlar.length)];
  }
  if (S.grup === 'referans') kartlar.forEach(k => ekle('r' + (k.f.referans || ''), { tur: 'referans', ad: k.f.referans }, k));
  else kartlar.forEach(k => ekle('k' + (k.f.rota_kod || ''), { tur: 'rota', kod: k.f.rota_kod }, k));
  const liste = [...gruplar.values()];
  const enErken = g => Math.min(...g.kartlar.map(k => k.dk));
  const ad = g => g.tur === 'rota' ? (g.kod || '￿') : (g.ad || '￿');
  return liste.sort((a, b) => enErken(a) - enErken(b) || ad(a).localeCompare(ad(b), 'tr', { numeric: true }));
}
// Kartları dikey şeritlere diz: aynı dakikada ya da yatayda çakışan kartlar üst üste binmez
function seritle(kartlar) {
  const sonlar = [];
  const yerli = kartlar.slice().sort((a, b) => a.dk - b.dk || (a.f.rota_sira || 0) - (b.f.rota_sira || 0) || firmaAdi(a.f).localeCompare(firmaAdi(b.f), 'tr')).map(k => {
    const x = (k.dk - S.ar.gBas) * S.ppm;
    let l = sonlar.findIndex(son => son + 4 <= x);
    if (l < 0) { l = sonlar.length; sonlar.push(0); }
    sonlar[l] = x + S.kartG;
    return { ...k, x, l };
  });
  return { kartlar: yerli, serit: Math.max(1, sonlar.length) };
}
function etiketHtml(g) {
  const n = g.kartlar.length; const bitti = g.kartlar.filter(k => k.f.durum === 'oy_kullandi').length;
  const ilerleme = n ? `<span class="masa-etiket-ilerleme${bitti === n ? ' tam' : ''}">${bitti}/${n} ✓</span>` : '';
  if (g.tur === 'arac') {
    const a = g.a;
    const ad = ARAC_DURUM_AD[a.durum || 'hazir'] || a.durum;
    return `<div class="masa-etiket-ust">${plakaHtml(a.plaka)}</div>
      <div class="masa-etiket-sofor kes" title="${esc(trBaslik(a.sofor_ad || ''))}${a.sofor_tel ? ' · ' + esc(fmt.tel(a.sofor_tel)) : ''}">${esc(trBaslik(a.sofor_ad || 'Şoför girilmemiş'))}</div>
      <div class="masa-etiket-alt"><span class="masa-arac-d a-${esc(a.durum || 'hazir')}" title="Araç durumu">${esc(ad)}</span>${n ? ` ${n} kişi ${ilerleme}` : ' <span class="zayif">saatli yolcu yok</span>'}</div>`;
  }
  if (g.tur === 'yok') return `<div class="masa-etiket-ust"><b class="masa-uyari-yazi">Araç atanmadı</b></div><div class="masa-etiket-alt">${n} kişi ${ilerleme}</div>`;
  if (g.tur === 'referans') return `<div class="masa-etiket-ust"><b class="kes">${esc(trBaslik(g.ad || 'Referans yok'))}</b></div><div class="masa-etiket-alt">${n} kişi ${ilerleme}</div>`;
  // rota
  const p = rotaParca(g.kod);
  const duraklar = g.kod ? firmaListesi().filter(f => f.rota_kod === g.kod && f.adres).sort((a, b) => (a.rota_sira || 0) - (b.rota_sira || 0)) : [];
  const link = duraklar.length ? `<a class="masa-rota-link" href="${esc(fmt.rotaLink(duraklar.map(f => f.adres)))}" target="_blank" rel="noopener" title="Rotayı Google Haritalar'da aç (${duraklar.length} durak, varış ${esc(VARIS.ad)})" aria-label="Rotayı haritada aç"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.6a4.4 4.4 0 0 0-4.4 4.4c0 3.1 4.4 8.3 4.4 8.3s4.4-5.2 4.4-8.3A4.4 4.4 0 0 0 8 1.6z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="6" r="1.6" fill="currentColor"/></svg></a>` : '';
  return `<div class="masa-etiket-ust"><b class="kes">${esc(p.ref || 'Rotası yok')}</b>${link}</div>
    <div class="masa-etiket-alt">${esc(p.rota || 'Rota kodu girilmemiş')} · ${n} kişi ${ilerleme}</div>`;
}
function kartHtml(k, y) {
  const f = k.f; const g = gecikme(f); const d = f.durum || 'bekliyor';
  const altSol = g ? `<b class="masa-gec-yazi">+${g} dk</b>` : `<span>${esc(fmt.saatKisa(f.tasima_saati))}</span>`;
  const kendi = f.kendi_geldi && d === 'oy_kullandi' ? ' · kendi' : '';
  return `<div class="masa-kart${g ? ' gec' : ''}" data-id="${f.id}" data-d="${esc(d)}" style="left:${k.x.toFixed(1)}px;top:${y}px;width:${S.kartG}px" title="${esc(kartBaslik(f))}" tabindex="0" role="button">
    <div class="ad">${d === 'oy_kullandi' ? '<i class="tik">✓</i>' : ''}${esc(firmaAdi(f) || f.unvan || '')}</div>
    <div class="alt">${altSol} · ${esc(kisaFirma(f.unvan))}${kendi}</div>
    ${uyariNoktasi(f)}
    ${yazabilirMi() ? `<button type="button" class="masa-kart-menu" data-menu="${f.id}" tabindex="-1" title="Hızlı işaret">⋯</button>` : ''}
  </div>`;
}
function czCiz(zorla = false) {
  const kap = q('[data-cz-kaydir]'), ic = q('[data-cz]'); if (!kap || !ic) return;
  const w = kap.clientWidth || 900;
  const tum = saatliKartlar();
  const ar = aralikHesapla(tum);
  const gorunen = S.gizle ? tum.filter(k => k.f.durum !== 'oy_kullandi') : tum;
  const aracImza = S.grup === 'arac' ? [...store.araclar.values()].map(a => [a.id, a.plaka, a.sofor_ad, a.durum].join('|')).join(';') : '';
  const imza = [Math.round(w), S.grup, S.gizle, ar.gBas, ar.gBit, ar.bas, ar.bit, aracImza,
    gorunen.map(k => { const f = k.f; return [f.id, f.durum, f.kendi_geldi ? 1 : 0, f.tasima_saati, f.arac_id, f.rota_kod, f.rota_sira, f.referans, f.yetkili, f.unvan, f.evrak_uyari ? 1 : 0, f.kisi_oy_sayisi, f.oy_sinifi, gecikme(f)].join('|'); }).join(';'),
  ].join('#');
  if (!zorla && imza === S.imza.cz) { simdiCiz(); return; }
  S.imza.cz = imza;

  // ölçek: tüm aralık ve en sağdaki kart kaydırmadan sığsın; çok darsa yatay kaydırma (en az 1 px/dk)
  S.sol = w < 820 ? 156 : 196;
  S.kartG = w < 820 ? 124 : 144;
  S.ar = ar;
  const genis = Math.max(200, w - S.sol - 10);
  const aralikDk = ar.gBit - ar.gBas;
  let ppm = genis / aralikDk;
  for (const k of tum) { const fark = k.dk - ar.gBas; if (fark > 0) ppm = Math.min(ppm, (genis - S.kartG - 4) / fark); }
  S.ppm = Math.max(1, ppm);
  const izG = Math.ceil(Math.max(aralikDk * S.ppm, ...tum.map(k => (k.dk - ar.gBas) * S.ppm + S.kartG + 6)));

  // başlık alt yazısı
  const gizli = tum.length - gorunen.length;
  const alt = q('[data-cz-alt]');
  if (alt) alt.textContent = `${tum.length} kişinin taşıma saati belli · ${hhmm(ar.gBas)}-${hhmm(ar.gBit)}${gizli ? ` · ${gizli} oy kullanan gizli` : ''}`;

  const satirlar = satirlaraAyir(gorunen);
  if (!satirlar.length) {
    ic.style.width = ''; ic.style.setProperty('--sol', S.sol + 'px');
    ic.innerHTML = `<div class="bos masa-cz-bos">${tum.length ? '✓ Saati belli herkes oy kullandı. Gizlenenleri görmek için anahtarı kapat.' : 'Henüz taşıma saati girilmiş yolcu yok. Saat girilince kişiler burada saatine göre dizilir.'}</div>`;
    return;
  }

  // eksen
  let tikler = '';
  for (let dk = Math.ceil(ar.gBas / 30) * 30; dk <= ar.gBit; dk += 30) {
    const x = (dk - ar.gBas) * S.ppm; const saat = dk % 60 === 0;
    tikler += `<i class="masa-cz-tik${saat ? ' saat' : ''}" style="left:${x.toFixed(1)}px"></i>`;
    if (saat) tikler += `<span class="masa-cz-tik-yazi${x < 20 ? ' ilk' : ''}${x > aralikDk * S.ppm - 20 ? ' son' : ''}${dk < ar.bas || dk > ar.bit ? ' disi' : ''}" data-x="${x.toFixed(1)}" style="left:${x.toFixed(1)}px">${hhmm(dk)}</span>`;
  }
  // arka plan: yarım saat çizgileri + oy saati dışı taralı alanlar
  let arka = '';
  for (let dk = Math.ceil(ar.gBas / 30) * 30; dk <= ar.gBit; dk += 30) arka += `<i class="masa-cz-cizgi${dk % 60 ? ' yarim' : ''}" style="left:${((dk - ar.gBas) * S.ppm).toFixed(1)}px"></i>`;
  if (ar.gBas < ar.bas) arka += `<i class="masa-cz-disi" style="left:0;width:${((ar.bas - ar.gBas) * S.ppm).toFixed(1)}px" title="Oy verme saati dışında"></i>`;
  if (ar.gBit > ar.bit) arka += `<i class="masa-cz-disi" style="left:${((ar.bit - ar.gBas) * S.ppm).toFixed(1)}px;width:${((ar.gBit - ar.bit) * S.ppm).toFixed(1)}px" title="Oy verme saati dışında"></i>`;

  const govde = satirlar.map(g => {
    const { kartlar, serit } = seritle(g.kartlar);
    const h = Math.max(g.tur === 'arac' ? ETIKET_MIN.arac : ETIKET_MIN.diger, serit * (KART_Y + SERIT_ARA) - SERIT_ARA + SATIR_PAD * 2);
    const bitti = g.kartlar.length && g.kartlar.every(k => k.f.durum === 'oy_kullandi');
    // Etiket içeriği satırın üstüne hizalı ve dikeyde yapışkan: çok kartlı uzun satırda (ör. "Araç atanmadı")
    // kaydırırken de görünür kalır.
    return `<div class="masa-cz-satir${g.tur === 'yok' ? ' uyari' : ''}${bitti ? ' bitti' : ''}" style="height:${h}px">
      <div class="masa-cz-etiket"><div class="masa-etiket-ic">${etiketHtml(g)}</div></div>
      <div class="masa-cz-iz" style="width:${izG}px">${kartlar.map(k => kartHtml(k, SATIR_PAD + k.l * (KART_Y + SERIT_ARA))).join('')}</div>
    </div>`;
  }).join('');

  const koseAd = GRUPLAR.find(x => x.k === S.grup)?.ad || '';
  ic.style.setProperty('--sol', S.sol + 'px');
  ic.style.width = `${S.sol + izG}px`;
  ic.innerHTML = `
    <div class="masa-cz-eksen" style="height:${EKSEN_Y}px">
      <div class="masa-cz-kose">${esc(koseAd)}</div>
      <div class="masa-cz-eksen-iz" style="width:${izG}px">${tikler}<span class="masa-cz-hap" data-hap></span></div>
    </div>
    <div class="masa-cz-arka" style="left:${S.sol}px;width:${izG}px;top:${EKSEN_Y}px">${arka}<i class="masa-cz-gecmis" data-gecmis></i></div>
    ${govde}
    <i class="masa-cz-simdi" data-simdi style="top:${EKSEN_Y}px"></i>`;
  simdiCiz();

  // ilk açılışta şimdi çizgisini görünür yere kaydır
  if (S.ilkKaydirma && kap.scrollWidth > kap.clientWidth + 4) {
    const x = (simdiDk() - ar.gBas) * S.ppm;
    kap.scrollLeft = Math.max(0, x - (kap.clientWidth - S.sol) * 0.3);
  }
  S.ilkKaydirma = false;
}
// Şimdi çizgisi, geçmiş gölgesi ve eksendeki saat hapı (her 'saat' olayında kayar)
function simdiCiz() {
  const ar = S.ar; if (!ar) return;
  const cizgi = q('[data-simdi]'), gecmis = q('[data-gecmis]'), hap = q('[data-hap]'); if (!cizgi || !gecmis || !hap) return;
  const dk = simdiDk(); const tamG = (ar.gBit - ar.gBas) * S.ppm;
  const saat = `${iki(Math.floor(dk / 60))}:${iki(Math.floor(dk % 60))}`;
  const once = dk < ar.gBas, sonra = dk > ar.gBit;
  hap.classList.toggle('disari', once || sonra); hap.classList.toggle('sag', sonra);
  if (once || sonra) {
    cizgi.hidden = true; gecmis.style.width = once ? '0px' : `${tamG}px`;
    hap.style.left = once ? '0px' : `${tamG}px`;
    hap.textContent = `Şimdi ${saat}`;
  } else {
    const x = (dk - ar.gBas) * S.ppm;
    cizgi.hidden = false; cizgi.style.left = `${S.sol + x}px`;
    gecmis.style.width = `${x}px`;
    hap.style.left = `${x}px`; hap.textContent = saat;
  }
  // şimdi hapının altında kalan saat etiketleri silikleşir (üst üste binmesin)
  const hapX = (dk - ar.gBas) * S.ppm; const hapG = hap.offsetWidth || 60;
  S.kok.querySelectorAll('.masa-cz-tik-yazi').forEach(e => {
    const x = Number(e.dataset.x);
    const yakin = once ? x < hapG + 26 : sonra ? x > tamG - hapG - 26 : Math.abs(x - hapX) < hapG / 2 + 18;
    e.classList.toggle('silik', yakin);
  });
}

// ---------------------------------------------------------------- SAAT BELİRSİZ şeridi
function belirsizCiz(zorla = false) {
  const kok = q('[data-belirsiz]'); if (!kok) return;
  const liste = firmaListesi().filter(f => ulasim(f) === 'servis' && !f.tasima_saati);
  const imza = [S.acikIlce, liste.map(f => [f.id, f.durum, f.kendi_geldi ? 1 : 0, f.ilce, f.arac_id, f.rota_kod, f.rota_sira, f.yetkili, f.unvan, f.evrak_uyari ? 1 : 0, f.kisi_oy_sayisi, f.oy_sinifi].join('|')).join(';'),
    [...store.araclar.values()].map(a => a.id + a.plaka).join(',')].join('#');
  if (!zorla && imza === S.imza.belirsiz) return;
  S.imza.belirsiz = imza;
  const bitti = liste.filter(f => f.durum === 'oy_kullandi').length;
  const kumeler = new Map();
  liste.forEach(f => { const k = f.ilce || ''; if (!kumeler.has(k)) kumeler.set(k, []); kumeler.get(k).push(f); });
  const sirali = [...kumeler.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] || '￿').localeCompare(b[0] || '￿', 'tr'));
  if (S.acikIlce !== null && S.acikIlce !== '*' && !kumeler.has(S.acikIlce)) S.acikIlce = null;

  const cip = (anahtar, ad, fs) => {
    const tamam = fs.filter(f => f.durum === 'oy_kullandi').length;
    return `<button type="button" class="cip masa-ilce-cip${S.acikIlce === anahtar ? ' aktif' : ''}${tamam === fs.length ? ' tam' : ''}" data-ilce="${esc(anahtar)}" aria-expanded="${S.acikIlce === anahtar}">
      ${esc(ad)} <span class="say">${fs.length}</span>${tamam ? `<span class="masa-cip-tik">${tamam} ✓</span>` : ''}</button>`;
  };
  const acik = S.acikIlce === null ? [] : S.acikIlce === '*' ? liste : (kumeler.get(S.acikIlce) || []);
  const acikSirali = acik.slice().sort((a, b) => (a.rota_kod || '￿').localeCompare(b.rota_kod || '￿', 'tr', { numeric: true }) || (a.rota_sira || 0) - (b.rota_sira || 0));
  const acikAd = S.acikIlce === '*' ? 'Tüm ilçeler' : (trBaslik(S.acikIlce) || 'İlçe girilmemiş');

  kok.innerHTML = `
    <div class="kart-baslik">Saat belirsiz
      <span class="alt">Servisle alınacak, taşıma saati girilmemiş · ${liste.length} kişi · ${kumeler.size} ilçe</span>
      <div class="sag">${liste.length ? `<span class="masa-etiket-ilerleme${bitti === liste.length ? ' tam' : ''}">${bitti}/${liste.length} ✓</span>` : ''}</div>
    </div>
    <div class="kart-govde">
      ${liste.length ? `<div class="cipler">${cip('*', 'Tümü', liste)}${sirali.map(([k, fs]) => cip(k, trBaslik(k) || 'İlçe yok', fs)).join('')}</div>` : '<div class="bos" style="padding:14px">Saati belirsiz servis yolcusu yok. Servisle alınacak herkesin taşıma saati girilmiş.</div>'}
      ${acik.length ? `<div class="masa-belirsiz-panel">
        <div class="masa-belirsiz-panel-ust"><b>${esc(acikAd)}</b> · ${acik.length} kişi<button type="button" class="btn btn-hayalet btn-kucuk" data-ilce-kapat>Kapat</button></div>
        <div class="masa-mini-izgara">${acikSirali.map(miniHtml).join('')}</div>
      </div>` : ''}
    </div>`;
}
function miniHtml(f) {
  const a = aracOf(f); const d = f.durum || 'bekliyor';
  return `<div class="masa-mini" data-id="${f.id}" data-d="${esc(d)}" title="${esc(kartBaslik(f))}" tabindex="0" role="button">
    <div class="masa-mini-ust"><span class="ad">${d === 'oy_kullandi' ? '<i class="tik">✓</i>' : ''}${esc(firmaAdi(f) || f.unvan || '')}</span>${uyariNoktasi(f)}</div>
    <div class="masa-mini-alt"><span class="kes">${esc(kisaFirma(f.unvan))}${f.rota_kod ? ' · ' + esc(rotaKisa(f)) : ''}</span>${a ? plakaHtml(a.plaka) : '<span class="masa-arac-yok">Araç yok</span>'}</div>
    <div class="masa-mini-durum">${rozetDurum(f)}</div>
    ${yazabilirMi() ? `<button type="button" class="masa-kart-menu" data-menu="${f.id}" tabindex="-1" title="Hızlı işaret">⋯</button>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- CANLI AKIŞ
function olayRenk(o) {
  if (o.tur === 'durum') return DURUM_RENK[String(o.yeni || '').split('+')[0]] || 'gri';
  if (o.tur === 'oy_sinifi') return 'kirmizi';
  if (o.tur === 'arac') return 'mavi';
  if (o.tur === 'arac_durum') return 'amber';
  return 'metin-3';
}
function akisCiz() {
  const kok = q('[data-akis]'); if (!kok) return;
  const son = store.olaylar.slice(0, 40);
  const imza = son.map(o => o.id).join(',');
  // "Son 1 saatte N oy": olay sayısı değil, ŞU AN oy kullandı durumunda olup son 1 saatte işaretlenenler.
  // (Olaydan sayılsaydı geri alınan ya da iki kez işaretlenen oylar da sayılırdı.)
  const saatOnce = Date.now() - 3600000;
  const sonSaat = firmaListesi().filter(f => f.durum === 'oy_kullandi' && f.durum_zamani && new Date(f.durum_zamani).getTime() >= saatOnce).length;
  const alt = q('[data-akis-alt]'); if (alt) alt.textContent = sonSaat ? `Son 1 saatte ${sonSaat} oy` : (son.length ? `Son ${son.length} işaret` : '');
  if (imza !== S.imza.akis) {
    S.imza.akis = imza;
    if (!son.length) {
      kok.innerHTML = `<div class="bos masa-akis-bos"><div class="masa-akis-bos-ikon">◉</div>Henüz işaret yok.<br>Masada, sahada ya da ATLAS ile yapılan her işaret burada anında görünür.</div>`;
    } else {
      kok.innerHTML = son.map(o => {
        const yeni = !S.ilkAkis && !S.gorulen.has(o.id);
        const metin = olayMetni(o); const i = metin.indexOf(' · ');
        const kim = i > 0 ? metin.slice(0, i) : ''; const ne = i > 0 ? metin.slice(i + 3) : metin;
        const tik = o.firma_id ? `data-akis-kisi="${o.firma_id}"` : '';
        return `<div class="masa-akis-oge${yeni ? ' yeni' : ''}${o.firma_id ? ' tiklanir' : ''}" ${tik}>
          <span class="masa-akis-nokta" style="background:var(--${olayRenk(o)})"></span>
          <div class="masa-akis-govde">
            <div class="masa-akis-metin">${kim ? `<b>${esc(kim)}</b> · ` : ''}${esc(ne)}</div>
            <div class="masa-akis-alt">${kaynakCip(o)}<span class="masa-akis-goreli" data-goreli="${esc(o.zaman)}">${esc(fmt.goreli(o.zaman))}</span></div>
          </div>
        </div>`;
      }).join('');
    }
    son.forEach(o => S.gorulen.add(o.id));
    S.ilkAkis = false;
  } else {
    kok.querySelectorAll('[data-goreli]').forEach(e => { const v = fmt.goreli(e.dataset.goreli); if (e.textContent !== v) e.textContent = v; });
  }
  const c = q('[data-canli]'); if (c) { const kopuk = !store.cevrimici || !store.canli; c.classList.toggle('kopuk', kopuk); c.title = kopuk ? 'Canlı bağlantı yok, yeniden bağlanıyor' : 'Canlı bağlantı açık'; }
}

// ---------------------------------------------------------------- hızlı işaret menüsü (sağ tık / ⋯)
function menuKapat() { S.menu?.remove(); S.menu = null; }
function menuAc(id, konum) {
  menuKapat();
  const f = store.firmalar.get(id); if (!f) return;
  const yaz = yazabilirMi();
  const secenek = [['yolda', 'amber'], ['fuarda', 'mor'], ['oy_kullandi', 'yesil']];
  const m = el(`<div class="masa-menu" role="menu">
    <div class="masa-menu-ust"><div class="ad">${esc(firmaAdi(f))}</div><div class="firma">${esc(f.unvan || '')}</div><div style="margin-top:6px">${rozetDurum(f)}</div></div>
    ${yaz ? secenek.map(([k, renk]) => `<button type="button" role="menuitem" data-isaret="${k}" ${f.durum === k ? 'disabled' : ''}><i class="masa-renk" style="background:var(--${renk})"></i>${esc(DURUM_AD[k])}${f.durum === k ? '<span class="sag">şu an</span>' : ''}</button>`).join('') + '<div class="masa-menu-ayrac"></div>' : ''}
    <button type="button" role="menuitem" data-kart><i class="masa-renk cerceve"></i>Kişi kartını aç<span class="sag kbd">↵</span></button>
  </div>`);
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  let x = konum.x, y = konum.y;
  if (x + r.width > innerWidth - 8) x = Math.max(8, innerWidth - r.width - 8);
  if (y + r.height > innerHeight - 8) y = Math.max(8, (konum.ust ?? y) - r.height - 4);
  m.style.left = `${x}px`; m.style.top = `${y}px`;
  m.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    menuKapat();
    if (b.dataset.isaret) isaretle(id, b.dataset.isaret, { kendi: false });
    else if (b.hasAttribute('data-kart')) kisiKartiAc(id);
  });
  m.addEventListener('keydown', e => {
    const dugmeler = [...m.querySelectorAll('button:not([disabled])')]; const i = dugmeler.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); dugmeler[(i + 1) % dugmeler.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); dugmeler[(i - 1 + dugmeler.length) % dugmeler.length]?.focus(); }
  });
  S.menu = m;
  m.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- gecikenler listesi (Geciken KPI'sına tıklayınca)
function gecikenModalAc() {
  if (!firmaListesi().some(f => gecikme(f) > 0)) { toast('Şu an geciken yok'); return; }
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
  const m = S.gecikenModal; if (!m) return;
  if (!m.isConnected) { S.gecikenModal = null; return; }
  const liste = firmaListesi().map(f => ({ f, g: gecikme(f) })).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
  const imza = liste.map(x => x.f.id + ':' + x.g + ':' + x.f.durum + ':' + x.f.arac_id).join(',');
  if (imza === S.imza.gec) return; S.imza.gec = imza;
  const kok = m.querySelector('[data-gec-liste]'); if (!kok) return;
  kok.innerHTML = liste.length ? `<div class="masa-gec-aciklama">Taşıma saati 5 dakikadan fazla geçmiş, henüz yola çıkmamış ${liste.length} kişi. En çok geciken üstte.</div>` + liste.map(({ f, g }) => {
    const a = aracOf(f); const tel = f.cep || f.cep2;
    return `<div class="masa-gec-satir" data-gec-kisi="${f.id}">
      <div class="masa-gec-sure"><b>+${g}</b><span>dk</span></div>
      <div class="masa-gec-bilgi">
        <div class="ad">${esc(firmaAdi(f))} ${rozetDurum(f)}</div>
        <div class="alt">${esc(fmt.saatKisa(f.tasima_saati))} · ${esc(kisaFirma(f.unvan))}${f.rota_kod ? ' · ' + esc(rotaKisa(f)) : ''} · ${a ? `${esc(fmt.plaka(a.plaka))}${a.sofor_ad ? ' ' + esc(trBaslik(a.sofor_ad)) : ''}` : 'Araç atanmadı'}</div>
      </div>
      <div class="masa-gec-eylem">
        ${tel && fmt.telLink(tel) ? `<a class="btn btn-kucuk" href="${fmt.telLink(tel)}" title="Kişiyi ara">Ara</a>` : ''}
        ${a?.sofor_tel && fmt.telLink(a.sofor_tel) ? `<a class="btn btn-kucuk" href="${fmt.telLink(a.sofor_tel)}" title="Şoförü ara">Şoför</a>` : ''}
        ${yazabilirMi() ? `<button type="button" class="btn btn-kucuk masa-yolda-btn" data-gec-yolda="${f.id}">Yolda</button>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="bos">✓ Geciken kalmadı.</div>';
}

// ---------------------------------------------------------------- "Kendi gelen kişiyi işaretle": ortak paleti kendi geldi kipinde açar
function kendiGelenAc() {
  paletAc();
  const p = document.querySelector('.palet'); if (!p) return;
  p.classList.add('masa-palet-kendi');
  const inp = p.querySelector('input'); const liste = p.querySelector('.palet-liste');
  if (inp) inp.placeholder = 'Kendi gelen kişiyi ara: ad, firma, telefon… (⌘Enter: kendi geldi, oy kullandı)';
  if (liste) liste.before(el('<div class="masa-palet-ipucu">✓ Kendi gelen kişi · Seçtiğin kişi "kendi geldi, oy kullandı" olarak işaretlenir. Enter kartı açar.</div>'));
  const etiketle = () => liste?.querySelectorAll('[data-oy]').forEach(b => { if (!b.dataset.masaKendi) { b.dataset.masaKendi = '1'; b.textContent = '✓ Kendi geldi, oy'; } });
  if (liste) { new MutationObserver(etiketle).observe(liste, { childList: true, subtree: true }); etiketle(); }
  const isaretleKendi = id => { paletKapat(); isaretle(id, 'oy_kullandi', { kendi: true }); };
  // Paletin kendi "Oy kullandı" düğmesi ve ⌘Enter'ı yakalanır: kendi_geldi bilgisi de yazılsın
  p.addEventListener('click', e => { const b = e.target.closest('[data-oy]'); if (!b) return; e.stopPropagation(); e.preventDefault(); isaretleKendi(Number(b.dataset.oy)); }, true);
  p.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
    const b = p.querySelector('.palet-satir.secili [data-oy]'); if (!b) return;
    e.stopPropagation(); e.preventDefault(); isaretleKendi(Number(b.dataset.oy));
  }, true);
}

// ---------------------------------------------------------------- olay bağlama
function kontrolleriCiz() {
  S.kok.querySelectorAll('[data-grup]').forEach(b => { const a = b.dataset.grup === S.grup; b.classList.toggle('aktif', a); b.setAttribute('aria-selected', a); });
  q('[data-gizle-anahtar]')?.classList.toggle('acik', S.gizle);
  q('[data-gizle]')?.setAttribute('aria-pressed', S.gizle);
}
function bagla() {
  const kok = S.kok;
  kok.addEventListener('click', e => {
    const t = e.target;
    const menuB = t.closest('[data-menu]');
    if (menuB) { e.stopPropagation(); const r = menuB.getBoundingClientRect(); menuAc(Number(menuB.dataset.menu), { x: r.left, y: r.bottom + 4, ust: r.top }); return; }
    const kart = t.closest('.masa-kart[data-id], .masa-mini[data-id]');
    if (kart) { kisiKartiAc(Number(kart.dataset.id)); return; }
    const akis = t.closest('[data-akis-kisi]');
    if (akis) { kisiKartiAc(Number(akis.dataset.akisKisi)); return; }
    const grup = t.closest('[data-grup]');
    if (grup) { if (S.grup !== grup.dataset.grup) { S.grup = grup.dataset.grup; tercihYaz(); kontrolleriCiz(); czCiz(true); } return; }
    if (t.closest('[data-gizle]')) { S.gizle = !S.gizle; tercihYaz(); kontrolleriCiz(); czCiz(true); return; }
    if (t.closest('[data-ilce-kapat]')) { S.acikIlce = null; belirsizCiz(true); return; }
    const ilce = t.closest('[data-ilce]');
    if (ilce) { S.acikIlce = S.acikIlce === ilce.dataset.ilce ? null : ilce.dataset.ilce; belirsizCiz(true); return; }
    if (t.closest('[data-ara]')) { paletAc(); return; }
    if (t.closest('[data-kendi]')) { kendiGelenAc(); return; }
    if (t.closest('[data-geciken]')) { gecikenModalAc(); }
  });
  kok.addEventListener('contextmenu', e => {
    const kart = e.target.closest('.masa-kart[data-id], .masa-mini[data-id]'); if (!kart) return;
    e.preventDefault();
    if (!yazabilirMi()) { kisiKartiAc(Number(kart.dataset.id)); return; }
    let x = e.clientX, y = e.clientY;
    if (!x && !y) { const r = kart.getBoundingClientRect(); x = r.left; y = r.bottom + 4; }
    menuAc(Number(kart.dataset.id), { x, y });
  });
  kok.addEventListener('keydown', e => {
    const kart = e.target.closest?.('.masa-kart[data-id], .masa-mini[data-id]'); if (!kart || e.target !== kart) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kisiKartiAc(Number(kart.dataset.id)); }
  });
  // menü: dışarı tıklayınca, Esc, kaydırma ve yeniden boyutlandırmada kapanır
  const disari = e => { if (S.menu && !S.menu.contains(e.target)) menuKapat(); };
  const tus = e => { if (e.key === 'Escape' && S.menu) { menuKapat(); } };
  const kapat = e => { if (S.menu && !(e?.target instanceof Node && S.menu.contains(e.target))) menuKapat(); };
  document.addEventListener('mousedown', disari, true);
  document.addEventListener('keydown', tus, true);
  window.addEventListener('scroll', kapat, true);
  window.addEventListener('resize', kapat);
  window.addEventListener('blur', kapat);
  S.sokuculer.push(
    () => document.removeEventListener('mousedown', disari, true),
    () => document.removeEventListener('keydown', tus, true),
    () => window.removeEventListener('scroll', kapat, true),
    () => window.removeEventListener('resize', kapat),
    () => window.removeEventListener('blur', kapat),
  );
  // çizelge genişliği değişince ölçeği yeniden hesapla
  const kap = q('[data-cz-kaydir]');
  if (kap && 'ResizeObserver' in window) {
    S.genislik = kap.clientWidth;
    let bekle = 0;
    S.ro = new ResizeObserver(() => {
      cancelAnimationFrame(bekle);
      bekle = requestAnimationFrame(() => { if (!S.kok) return; const w = kap.clientWidth; if (Math.abs(w - S.genislik) > 2) { S.genislik = w; czCiz(true); } });
    });
    S.ro.observe(kap);
  }
}

function hepsiniGuncelle() {
  baslikAltCiz(); kpiCiz(); czCiz(); belirsizCiz(); akisCiz(); gecikenModalCiz();
}

// ---------------------------------------------------------------- ekran modülü
export default {
  async render(kok) {
    stilEkle(); tercihOku();
    menuKapat();
    Object.assign(S, { kok, imza: {}, gorulen: new Set(), ilkAkis: true, ilkKaydirma: true, ar: null, sokuculer: [], gecikenModal: null });
    kok.innerHTML = iskelet();
    kontrolleriCiz();
    bagla();
    hepsiniGuncelle();
  },
  yenile() {
    // app.js kare başına tek sebep iletir; aynı karede gelen diğer olaylar kaybolmasın diye
    // her parça kendi imzasına bakıp yalnız değiştiyse yeniden çizilir.
    if (!S.kok || !S.kok.isConnected) return;
    hepsiniGuncelle();
  },
  temizle() {
    S.sokuculer.forEach(f => { try { f(); } catch { /* yoksay */ } }); S.sokuculer = [];
    S.ro?.disconnect(); S.ro = null;
    menuKapat();
    if (S.gecikenModal?.isConnected) modalKapat();
    S.gecikenModal = null; S.kok = null; S.ar = null;
  },
};

// ---------------------------------------------------------------- ekran stili
function stilEkle() {
  if (document.querySelector('style[data-ekran="masa"]')) return;
  const st = document.createElement('style'); st.dataset.ekran = 'masa';
  st.textContent = `
.masa { display: flex; flex-direction: column; gap: 16px; }
.masa .kes { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.masa .zayif { color: var(--metin-3); }

/* üst satır */
.masa-ust { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.masa-baslik { flex: 1 1 320px; min-width: 0; }
.masa-baslik h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -.02em; line-height: 1.1; }
.masa-baslik-alt { color: var(--metin-3); font-weight: 600; font-size: 13px; margin-top: 4px; }
.masa-baslik-alt b { color: var(--metin); font-weight: 800; }
.masa-baslik-alt b.son-saat { color: var(--turuncu); }
.masa-ara { flex: 0 1 380px; min-width: 220px; display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 12px 0 14px; border: 1px solid var(--cizgi-2); border-radius: 12px; background: var(--yuzey); color: var(--metin-3); cursor: text; font-weight: 600; font-size: 14px; box-shadow: var(--golge-1); text-align: left; transition: border-color .12s, box-shadow .12s; }
.masa-ara:hover { border-color: var(--metin-3); }
.masa-ara:focus-visible { outline: none; border-color: var(--kirmizi); box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.masa-ara-yazi { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.masa-kendi { font-weight: 800; box-shadow: var(--golge-1); }

/* KPI şeridi */
.masa-kpi { display: grid; grid-template-columns: auto repeat(6, minmax(0, 1fr)); overflow: hidden; }
.masa-kpi-halka { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 14px 22px; border-right: 1px solid var(--cizgi); background: var(--yuzey-2); }
.masa-halka { position: relative; width: 116px; height: 116px; }
.masa-halka svg { width: 100%; height: 100%; display: block; }
.masa-halka circle { fill: none; stroke-width: 11; }
.masa-halka .iz { stroke: var(--gri-acik); }
.masa-halka .dolu { stroke: var(--kirmizi); stroke-linecap: round; transition: stroke-dashoffset .8s cubic-bezier(.2, .8, .2, 1); }
.masa-halka.tam .dolu { stroke: var(--yesil); }
.masa-halka-ic { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
.masa-halka-ic .yuzde { font-size: 30px; font-weight: 900; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.masa-halka-ic .oran { font-size: 12px; font-weight: 700; color: var(--metin-3); margin-top: 3px; font-variant-numeric: tabular-nums; }
.masa-halka-etiket { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--metin-3); }
.masa-kpi-hucre { display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: 16px 18px; border-right: 1px solid var(--cizgi); background: var(--yuzey); text-align: left; font: inherit; color: inherit; }
.masa-kpi-hucre:last-child { border-right: 0; }
.masa-kpi-hucre .kpi-etiket { display: flex; align-items: center; gap: 6px; }
.masa-kpi-hucre .kpi-etiket::before { content: ''; width: 8px; height: 8px; border-radius: 3px; background: var(--metin-3); flex: none; }
.masa-kpi-hucre[data-renk="metin"] .kpi-etiket::before { background: var(--koyu); }
.masa-kpi-hucre[data-renk="yesil"] .kpi-etiket::before { background: var(--yesil); }
.masa-kpi-hucre[data-renk="mor"] .kpi-etiket::before { background: var(--mor); }
.masa-kpi-hucre[data-renk="amber"] .kpi-etiket::before { background: var(--amber); }
.masa-kpi-hucre[data-renk="kirmizi"] .kpi-etiket::before { background: var(--kirmizi); }
.masa-kpi-geciken .kpi-etiket::before { display: none; }
.masa-kpi-deger { font-size: clamp(28px, 2.6vw, 46px); font-weight: 900; letter-spacing: -.03em; line-height: 1.05; margin: 6px 0 4px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.masa-kpi-deger small { font-size: .42em; font-weight: 800; color: var(--metin-3); letter-spacing: 0; margin-left: 2px; }
.masa-kpi-hucre[data-renk="yesil"] .masa-kpi-deger > span { color: var(--yesil); }
.masa-kpi-hucre[data-renk="kirmizi"] .masa-kpi-deger { color: var(--kirmizi); }
.masa-kpi-hucre .kpi-alt { line-height: 1.3; }
.masa-kpi-geciken { cursor: pointer; border-top: 0; border-bottom: 0; border-left: 0; transition: background .15s; }
.masa-kpi-geciken:hover { background: var(--yuzey-2); }
.masa-kpi-geciken.var { background: var(--turuncu-acik); }
.masa-kpi-geciken.var .masa-kpi-deger, .masa-kpi-geciken.var .kpi-etiket { color: var(--turuncu); }
.masa-gec-nokta { width: 8px; height: 8px; border-radius: 50%; background: var(--metin-3); flex: none; }
.masa-kpi-geciken.var .masa-gec-nokta { background: var(--turuncu); animation: masa-nabiz-nokta 1.4s infinite; }
@keyframes masa-nabiz-nokta { 0% { box-shadow: 0 0 0 0 rgba(234, 88, 12, .55); } 70% { box-shadow: 0 0 0 7px rgba(234, 88, 12, 0); } 100% { box-shadow: 0 0 0 0 rgba(234, 88, 12, 0); } }
.masa-flas { animation: masa-flas .9s ease-out; }
@keyframes masa-flas { 0% { transform: scale(1.1); text-shadow: 0 0 18px currentColor; } 100% { transform: none; text-shadow: none; } }
.masa-kpi-deger.masa-flas { transform-origin: left center; }

/* gövde yerleşimi */
.masa-govde { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.masa-sol { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

/* zaman çizelgesi */
.masa-cz-kart { overflow: hidden; }
.masa-cz-baslik { flex-wrap: wrap; row-gap: 8px; }
.masa-cz-baslik-sol { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex-wrap: wrap; }
.masa-seg { display: inline-flex; background: var(--yuzey-3); border-radius: 10px; padding: 3px; gap: 2px; }
.masa-seg button { border: 0; background: transparent; height: 28px; padding: 0 12px; border-radius: 8px; font-weight: 700; font-size: 12px; color: var(--metin-2); cursor: pointer; }
.masa-seg button:hover { color: var(--metin); }
.masa-seg button.aktif { background: var(--yuzey); color: var(--metin); box-shadow: var(--golge-1); }
.masa-gizle { display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; cursor: pointer; font-size: 12px; font-weight: 700; color: var(--metin-2); padding: 0 4px; }
.masa-gizle .anahtar { width: 34px; height: 20px; pointer-events: none; }
.masa-gizle .anahtar::after { width: 14px; height: 14px; }
.masa-gizle .anahtar.acik::after { left: 17px; }
.masa-cz-kaydir { position: relative; overflow: auto; max-height: clamp(320px, calc(100vh - 380px), 980px); overscroll-behavior: contain; }
.masa-cz-ic { position: relative; min-width: 100%; }
.masa-cz-bos { padding: 40px 16px; }
.masa-cz-eksen { position: sticky; top: 0; z-index: 6; display: flex; background: var(--yuzey-2); border-bottom: 1px solid var(--cizgi); }
.masa-cz-kose { position: sticky; left: 0; z-index: 7; width: var(--sol); flex: none; display: flex; align-items: center; padding: 0 14px; background: var(--yuzey-2); border-right: 1px solid var(--cizgi); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--metin-3); }
.masa-cz-eksen-iz { position: relative; flex: none; }
.masa-cz-tik { position: absolute; bottom: 0; width: 1px; height: 5px; background: var(--cizgi-2); }
.masa-cz-tik.saat { height: 9px; background: var(--metin-3); }
.masa-cz-tik-yazi { position: absolute; top: 5px; transform: translateX(-50%); font-size: 11px; font-weight: 800; color: var(--metin-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.masa-cz-tik-yazi.ilk { transform: translateX(4px); }
.masa-cz-tik-yazi.son { transform: translateX(calc(-100% - 4px)); }
.masa-cz-tik-yazi.silik { opacity: 0; transition: opacity .2s; }
.masa-cz-tik-yazi.disi { color: var(--metin-3); font-weight: 600; }
.masa-cz-hap { position: absolute; top: 5px; z-index: 2; transform: translateX(-50%); background: var(--kirmizi); color: #fff; font-size: 11px; font-weight: 800; padding: 2px 7px; border-radius: 999px; box-shadow: 0 0 0 2px var(--yuzey-2); font-variant-numeric: tabular-nums; white-space: nowrap; transition: left .6s linear; }
.masa-cz-hap.disari { transform: translateX(4px); background: var(--metin-3); }
.masa-cz-hap.disari.sag { transform: translateX(calc(-100% - 4px)); }
.masa-cz-arka { position: absolute; bottom: 0; z-index: 0; pointer-events: none; }
.masa-cz-cizgi { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--cizgi); }
.masa-cz-cizgi.yarim { background: repeating-linear-gradient(to bottom, var(--cizgi) 0 4px, transparent 4px 8px); }
.masa-cz-disi { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(135deg, transparent 0 7px, var(--cizgi) 7px 8px); opacity: .8; }
.masa-cz-gecmis { position: absolute; top: 0; bottom: 0; left: 0; width: 0; background: var(--yuzey-3); opacity: .6; transition: width .6s linear; }
.masa-cz-simdi { position: absolute; bottom: 0; z-index: 4; width: 2px; margin-left: -1px; background: var(--kirmizi); pointer-events: none; transition: left .6s linear; }
.masa-cz-simdi::before { content: ''; position: absolute; top: -1px; left: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--kirmizi); box-shadow: 0 0 0 3px var(--kirmizi-acik); }
.masa-cz-satir { position: relative; display: flex; border-bottom: 1px solid var(--cizgi); }
.masa-cz-satir:last-of-type { border-bottom: 0; }
.masa-cz-etiket { position: sticky; left: 0; z-index: 5; width: var(--sol); flex: none; padding: 0 12px 0 14px; background: var(--yuzey); border-right: 1px solid var(--cizgi); min-width: 0; }
.masa-etiket-ic { position: sticky; top: ${EKSEN_Y}px; display: flex; flex-direction: column; gap: 4px; padding: ${SATIR_PAD}px 0; min-width: 0; }
.masa-etiket-ic > * { flex: none; }
.masa-cz-satir.uyari .masa-cz-etiket { box-shadow: inset 3px 0 0 var(--amber); background: var(--amber-acik); }
.masa-cz-satir.bitti .masa-cz-etiket { box-shadow: inset 3px 0 0 var(--yesil); }
.masa-etiket-ust { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
.masa-etiket-ust .plaka { flex: none; }
.masa-etiket-sofor { font-size: 12.5px; font-weight: 800; color: var(--metin); }
.masa-arac-d { display: inline-flex; align-items: center; gap: 4px; height: 18px; padding: 0 6px; border-radius: 6px; font-size: 10.5px; font-weight: 800; flex: none; }
.masa-arac-d::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.masa-etiket-alt { display: flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: var(--metin-3); min-width: 0; white-space: nowrap; overflow: hidden; }
.masa-etiket-ilerleme { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 6px; background: var(--yuzey-3); color: var(--metin-2); font-size: 10.5px; font-weight: 800; font-variant-numeric: tabular-nums; margin-left: 2px; white-space: nowrap; }
.masa-etiket-ilerleme.tam { background: var(--yesil-acik); color: var(--yesil); }
.masa-uyari-yazi { color: var(--amber); }
.masa-rota-link { margin-left: auto; flex: none; display: grid; place-items: center; width: 24px; height: 22px; color: var(--mavi); border-radius: 6px; }
.masa-rota-link:hover { background: var(--mavi-acik); }
.masa-cz-iz { position: relative; flex: none; }

/* çizelge kartı */
.masa-kart { position: absolute; z-index: 2; height: ${KART_Y}px; display: flex; flex-direction: column; justify-content: center; padding: 3px 20px 3px 8px; border-radius: 8px; background: var(--yuzey); border: 1px solid var(--cizgi-2); border-left: 3px solid var(--gri); box-shadow: var(--golge-1); cursor: pointer; overflow: hidden; transition: transform .12s, box-shadow .12s; outline: none; }
.masa-kart:hover, .masa-kart:focus-visible { transform: translateY(-1px); box-shadow: var(--golge-2); z-index: 3; }
.masa-kart:focus-visible { border-color: var(--kirmizi); }
.masa-kart .ad { font-size: 12px; font-weight: 800; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--metin); }
.masa-kart .alt { font-size: 10.5px; font-weight: 700; line-height: 1.3; color: var(--metin-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: .01em; font-variant-numeric: tabular-nums; }
.masa-kart .tik, .masa-mini .tik { font-style: normal; color: var(--yesil); font-weight: 900; margin-right: 3px; }
.masa-kart[data-d="arandi"], .masa-mini[data-d="arandi"] { background: var(--mavi-acik); border-color: transparent; border-left-color: var(--mavi); }
.masa-kart[data-d="yolda"], .masa-mini[data-d="yolda"] { background: var(--amber-acik); border-color: transparent; border-left-color: var(--amber); }
.masa-kart[data-d="fuarda"], .masa-mini[data-d="fuarda"] { background: var(--mor-acik); border-color: transparent; border-left-color: var(--mor); }
.masa-kart[data-d="oy_kullandi"], .masa-mini[data-d="oy_kullandi"] { background: var(--yesil-acik); border-color: transparent; border-left-color: var(--yesil); }
.masa-kart.gec { background: var(--turuncu-acik); border-color: var(--turuncu); border-left-color: var(--turuncu); animation: masa-nabiz 1.6s infinite; }
.masa-gec-yazi { color: var(--turuncu); font-weight: 900; }
@keyframes masa-nabiz { 0% { box-shadow: 0 0 0 0 rgba(234, 88, 12, .5); } 70% { box-shadow: 0 0 0 6px rgba(234, 88, 12, 0); } 100% { box-shadow: 0 0 0 0 rgba(234, 88, 12, 0); } }
.masa-nokta { position: absolute; top: 5px; right: 6px; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 2px var(--yuzey); }
.masa-nokta.evrak { background: var(--sari); }
.masa-nokta.evrak.iki { box-shadow: 0 0 0 2px var(--yuzey), 0 0 0 3.5px var(--koyu); }
.masa-nokta.ikioy { background: var(--koyu); }
:root[data-tema="koyu"] .masa-nokta.ikioy { background: var(--metin); }
.masa-nokta.statik { position: static; display: inline-block; box-shadow: none; }
.masa-kart-menu { position: absolute; right: 2px; bottom: 2px; width: 18px; height: 16px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--metin-2); font-weight: 900; font-size: 13px; line-height: 1; cursor: pointer; opacity: 0; transition: opacity .12s; }
.masa-kart:hover .masa-kart-menu, .masa-kart:focus-within .masa-kart-menu, .masa-mini:hover .masa-kart-menu, .masa-mini:focus-within .masa-kart-menu { opacity: 1; }
.masa-kart-menu:hover { background: var(--yuzey-3); color: var(--metin); }
@media (hover: none) { .masa-kart-menu { opacity: .8; } }

/* lejant */
.masa-lejant { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 10px 16px; border-top: 1px solid var(--cizgi); font-size: 11.5px; font-weight: 600; color: var(--metin-3); }
.masa-lejant span { display: inline-flex; align-items: center; gap: 6px; }
.masa-lejant-kare { display: inline-block; width: 14px; height: 10px; border-radius: 3px; background: var(--yuzey); border: 1px solid var(--cizgi-2); border-left: 3px solid var(--gri); }
.masa-lejant-kare[data-d="arandi"] { background: var(--mavi-acik); border-color: transparent; border-left-color: var(--mavi); }
.masa-lejant-kare[data-d="yolda"] { background: var(--amber-acik); border-color: transparent; border-left-color: var(--amber); }
.masa-lejant-kare[data-d="fuarda"] { background: var(--mor-acik); border-color: transparent; border-left-color: var(--mor); }
.masa-lejant-kare[data-d="oy_kullandi"] { background: var(--yesil-acik); border-color: transparent; border-left-color: var(--yesil); }
.masa-lejant-kare.gec { background: var(--turuncu-acik); border-color: var(--turuncu); }
.masa-lejant-ipucu { margin-left: auto; }

/* saat belirsiz */
.masa-belirsiz .kart-baslik { flex-wrap: wrap; row-gap: 4px; }
.masa-ilce-cip.tam:not(.aktif) { border-color: var(--yesil); }
.masa-cip-tik { font-size: 11px; font-weight: 800; color: var(--yesil); }
.masa-ilce-cip.aktif .masa-cip-tik { color: #7EE2A3; }
.masa-belirsiz-panel { margin-top: 12px; border: 1px solid var(--cizgi); border-radius: var(--r-2); background: var(--yuzey-2); padding: 10px; animation: belir .15s; }
.masa-belirsiz-panel-ust { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--metin-2); padding: 0 2px 8px; }
.masa-belirsiz-panel-ust .btn { margin-left: auto; }
.masa-mini-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.masa-mini { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 8px 26px 8px 10px; border-radius: 10px; background: var(--yuzey); border: 1px solid var(--cizgi-2); border-left: 3px solid var(--gri); cursor: pointer; min-width: 0; transition: box-shadow .12s, transform .12s; outline: none; }
.masa-mini:hover, .masa-mini:focus-visible { box-shadow: var(--golge-2); transform: translateY(-1px); }
.masa-mini-ust { display: flex; align-items: center; gap: 6px; min-width: 0; }
.masa-mini-ust .ad { font-weight: 800; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-mini-ust .masa-nokta { position: static; flex: none; box-shadow: none; }
.masa-mini-alt { display: flex; align-items: center; gap: 6px; justify-content: space-between; font-size: 11px; font-weight: 700; color: var(--metin-3); min-width: 0; }
.masa-mini-alt .plaka { height: 20px; font-size: 10.5px; flex: none; }
.masa-arac-yok { flex: none; font-size: 10.5px; font-weight: 800; color: var(--amber); }
.masa-mini-durum .rozet { height: 20px; font-size: 10.5px; }

/* canlı akış */
.masa-akis { position: sticky; top: calc(var(--ust-h) + 16px); display: flex; flex-direction: column; max-height: calc(100vh - var(--ust-h) - 36px); min-height: 320px; overflow: hidden; }
.masa-akis .kart-baslik { flex: none; }
.masa-akis .kart-baslik .alt { margin-left: auto; }
.masa-canli { width: 8px; height: 8px; border-radius: 50%; background: var(--yesil); box-shadow: 0 0 0 3px var(--yesil-acik); animation: nabiz 1.8s infinite; flex: none; }
.masa-canli.kopuk { background: var(--turuncu); box-shadow: 0 0 0 3px var(--turuncu-acik); }
.masa-akis-liste { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.masa-akis-oge { display: flex; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--cizgi); }
.masa-akis-oge.tiklanir { cursor: pointer; }
.masa-akis-oge.tiklanir:hover { background: var(--yuzey-2); }
.masa-akis-oge.yeni { animation: masa-akis-gir .5s cubic-bezier(.2, .8, .2, 1), masa-akis-parla 3.2s ease-out; }
@keyframes masa-akis-gir { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
@keyframes masa-akis-parla { 0%, 25% { background: var(--kirmizi-acik); } 100% { background: transparent; } }
.masa-akis-nokta { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; flex: none; }
.masa-akis-govde { flex: 1; min-width: 0; }
.masa-akis-metin { font-size: 13px; font-weight: 600; line-height: 1.35; color: var(--metin-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.masa-akis-metin b { color: var(--metin); font-weight: 800; }
.masa-akis-alt { display: flex; align-items: center; gap: 6px; margin-top: 5px; min-width: 0; }
.masa-akis-alt .kaynak-cip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.masa-akis-goreli { margin-left: auto; flex: none; font-size: 11px; font-weight: 700; color: var(--metin-3); white-space: nowrap; }
.masa-akis-bos { padding: 48px 20px; line-height: 1.6; }
.masa-akis-bos-ikon { font-size: 22px; color: var(--cizgi-2); margin-bottom: 6px; }

/* hızlı işaret menüsü */
.masa-menu { position: fixed; z-index: 95; width: 240px; background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: 12px; box-shadow: var(--golge-3); padding: 6px; animation: belir .1s; }
.masa-menu-ust { padding: 8px 10px 10px; border-bottom: 1px solid var(--cizgi); margin-bottom: 4px; }
.masa-menu-ust .ad { font-weight: 900; font-size: 14px; }
.masa-menu-ust .firma { font-size: 11px; color: var(--metin-3); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-menu button { display: flex; align-items: center; gap: 10px; width: 100%; height: 36px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; font-weight: 700; font-size: 13px; cursor: pointer; text-align: left; color: var(--metin); }
.masa-menu button:hover:not(:disabled), .masa-menu button:focus-visible { background: var(--yuzey-3); outline: none; }
.masa-menu button:disabled { color: var(--metin-3); cursor: default; }
.masa-menu .sag { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--metin-3); }
.masa-renk { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.masa-renk.cerceve { background: transparent; border: 1.5px solid var(--metin-3); }
.masa-menu-ayrac { height: 1px; background: var(--cizgi); margin: 4px 2px; }

/* gecikenler penceresi */
.masa-gec-modal { width: min(640px, 100%); }
.masa-gec-aciklama { font-size: 12px; color: var(--metin-3); font-weight: 600; margin-bottom: 10px; }
.masa-gec-satir { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 10px; border: 1px solid var(--cizgi); margin-bottom: 8px; cursor: pointer; }
.masa-gec-satir:hover { background: var(--yuzey-2); }
.masa-gec-sure { flex: none; width: 54px; height: 44px; border-radius: 10px; background: var(--turuncu-acik); color: var(--turuncu); display: grid; place-content: center; text-align: center; line-height: 1; }
.masa-gec-sure b { font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums; }
.masa-gec-sure span { font-size: 10px; font-weight: 800; }
.masa-gec-bilgi { flex: 1; min-width: 0; }
.masa-gec-bilgi .ad { font-weight: 800; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.masa-gec-bilgi .alt { font-size: 12px; color: var(--metin-3); font-weight: 600; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.masa-gec-eylem { display: flex; gap: 6px; flex: none; }
.masa-yolda-btn { background: var(--amber-acik); color: var(--amber); border-color: transparent; }

/* kendi gelen kipi (ortak palet) */
.masa-palet-ipucu { padding: 8px 20px; background: var(--yesil-acik); color: var(--yesil); font-weight: 700; font-size: 12px; border-bottom: 1px solid var(--cizgi); }

/* genişlik uyarlamaları */
@media (max-width: 1439px) { .masa-govde { grid-template-columns: minmax(0, 1fr) 300px; } }
@media (max-width: 1240px) {
  .masa-kpi-halka { padding: 12px 16px; }
  .masa-halka { width: 100px; height: 100px; }
  .masa-halka-ic .yuzde { font-size: 26px; }
  .masa-kpi-hucre { padding: 14px 12px; }
  .masa-kpi-hucre .kpi-alt { font-size: 11px; }
  .masa-lejant-ipucu { margin-left: 0; }
}
@media (max-width: 999px) {
  .masa-govde { grid-template-columns: minmax(0, 1fr); }
  .masa-akis { position: static; max-height: 460px; }
  .masa-kpi { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .masa-kpi-halka { grid-column: 1 / -1; flex-direction: row; gap: 14px; border-right: 0; border-bottom: 1px solid var(--cizgi); }
  .masa-kpi-hucre { border-bottom: 1px solid var(--cizgi); }
  .masa-kpi-hucre:nth-child(4) { border-right: 0; }
  .masa-ara { flex: 1 1 100%; }
  .masa-kendi { flex: 1 1 100%; }
}
`;
  document.head.appendChild(st);
}
