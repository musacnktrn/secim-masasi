// Seçim Masası · AÇILIŞ KAPISI (ATLAS, 2026-10-05)
// index.html'in yüklediği ilk modül. Adreste ?k=72 ya da ?k=2627 varsa o seçimin uygulamasını (app.js) açar.
// ?k yoksa (eski https://musacnktrn.github.io/secim-masasi/#masa linki dahil) GİRİŞ MERKEZİ çizilir: iki büyük kart,
// Supabase'e hiç bağlanılmaz (core.js bu yolda hiç yüklenmez).
import { KOMITELER, HUB_SIRA, KOMITE_K, komiteUygula, surumEtiketiEkle } from './komite.js';

const kacis = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

komiteUygula(KOMITE_K);
surumEtiketiEkle(KOMITE_K);

if (KOMITE_K) {
  import('./app.js').catch(e => {
    console.error(e);
    const a = document.querySelector('.acilis-alt');
    if (a) a.textContent = 'Uygulama yüklenemedi. Bağlantını kontrol edip sayfayı yenile.';
  });
} else {
  hubCiz();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function hubCiz() {
  const kart = k => {
    const c = KOMITELER[k];
    // tam ad kısa adla başlıyorsa yalnız devamı yazılır ("ve Diğer Mineral Ürünler Sanayi")
    const devam = c.ad.startsWith(c.kisaAd) ? c.ad.slice(c.kisaAd.length).trim() : c.ad;
    const tam = devam ? `<span class="hub-kart-tam">${kacis(devam)}</span>` : '';
    const alt = c.hubAlt.split(' · ').map(p => `<span>${kacis(p)}</span>`).join(' · ');
    return `<a class="hub-kart" data-hub-komite="${k}" href="./?k=${k}#">
      <span class="hub-simge" aria-hidden="true">${kacis(c.simge)}</span>
      <span class="hub-kart-yazi"><b class="hub-kart-ad">${kacis(c.kisaAd)}</b>${tam}<span class="hub-kart-alt">${alt}</span></span>
      <span class="hub-ok" aria-hidden="true">›</span>
    </a>`;
  };
  document.getElementById('uygulama').innerHTML = `
    <main class="hub">
      <header class="hub-ust">
        <div class="hub-ust-etiket">İZTO · SEÇİM MASASI</div>
        <h1 class="hub-baslik">Hangi seçime giriyorsun?</h1>
        <p class="hub-not">Kartına dokun, o seçimin giriş ekranı açılır.</p>
      </header>
      <nav class="hub-kartlar" aria-label="Seçimler">${HUB_SIRA.map(kart).join('')}</nav>
    </main>`;
}
