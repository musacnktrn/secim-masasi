// Giriş: ad soyad + 4 haneli PIN (büyük tuş takımı, telefonda rahat). Son yazılan ad hatırlanır.
import { girisYap, esc } from '../core.js';

export default {
  async render(kok, girisSonrasi) {
    let pin = '';
    let sonAd = ''; try { sonAd = localStorage.getItem('secim-son-ad') || ''; } catch {}
    kok.innerHTML = `
    <div class="giris-sayfa">
      <section class="giris-sol">
        <div><span class="logo-yazi"><b>72. KOMİTE</b><i> | </i>GENÇ ENERJİ</span>
          <div style="margin-top:10px;opacity:.85;font-weight:600">İzmir Ticaret Odası 72. Komite · İklimlendirme, Mekanik ve Doğalgaz Grubu</div></div>
        <div>
          <span class="kirmizi-liste" style="background:#fff;color:var(--kirmizi);font-size:13px;padding:6px 10px;margin-bottom:16px">KIRMIZI LİSTE</span>
          <h1>Seçim Masası</h1>
          <div class="slogan">Enerjimiz sektörden, gücümüz gençlikten</div>
        </div>
        <div style="opacity:.75;font-weight:600;font-size:13px">1 Ekim 2026 Perşembe · Fuar İzmir, Gaziemir</div>
      </section>
      <section class="giris-sag">
        <form class="giris-kutu" autocomplete="off">
          <h2>Giriş</h2>
          <div style="color:var(--metin-3);margin-bottom:18px">Adını soyadını ve sana verilen 4 haneli PIN'i gir.</div>
          <label class="etiket">Ad soyad</label>
          <input class="girdi" name="ad" value="${esc(sonAd)}" placeholder="Ör. Ayşe Kaya" style="height:48px;font-size:16px" autocapitalize="words" required>
          <label class="etiket" style="margin-top:14px">PIN</label>
          <div class="pin-kutular">${[0, 1, 2, 3].map(i => `<div class="pin-kutu" data-k="${i}"></div>`).join('')}</div>
          <input name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" style="position:absolute;opacity:0;width:1px;height:1px" aria-label="PIN">
          <div class="tus-takimi">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="tus" data-t="${n}">${n}</button>`).join('')}<button type="button" class="tus" data-t="sil">⌫</button><button type="button" class="tus" data-t="0">0</button><button type="submit" class="tus" style="background:var(--kirmizi);color:#fff;border-color:var(--kirmizi-koyu)">→</button></div>
          <div class="hata-yazi" data-hata></div>
        </form>
      </section>
    </div>`;
    const form = kok.querySelector('form'), hata = kok.querySelector('[data-hata]'), gizliPin = form.pin;
    const ciz = () => kok.querySelectorAll('.pin-kutu').forEach((k, i) => { k.textContent = pin[i] ? '•' : ''; k.classList.toggle('dolu', !!pin[i]); });
    const gonder = async () => {
      const ad = form.ad.value.trim();
      if (ad.length < 3) { hata.textContent = 'Ad soyadını yaz'; form.ad.focus(); return; }
      if (pin.length !== 4) { hata.textContent = 'PIN 4 haneli olmalı'; return; }
      hata.textContent = 'Giriş yapılıyor…';
      try { await girisYap(ad, pin); try { localStorage.setItem('secim-son-ad', ad); } catch {} hata.textContent = ''; await girisSonrasi(); }
      catch (e) { hata.textContent = e.message; pin = ''; ciz(); }
    };
    kok.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.t; hata.textContent = '';
      if (t === 'sil') pin = pin.slice(0, -1); else if (pin.length < 4) pin += t;
      ciz(); if (pin.length === 4) gonder();
    }));
    kok.querySelector('.pin-kutular').addEventListener('click', () => gizliPin.focus());
    gizliPin.addEventListener('input', () => { pin = gizliPin.value.replace(/\D/g, '').slice(0, 4); ciz(); if (pin.length === 4) { gizliPin.value = ''; gonder(); } });
    document.addEventListener('keydown', function tus(e) {
      if (!document.body.contains(form)) return document.removeEventListener('keydown', tus);
      if (document.activeElement === form.ad) { if (e.key === 'Enter') { e.preventDefault(); gizliPin.focus(); } return; }
      if (/^\d$/.test(e.key) && pin.length < 4) { pin += e.key; ciz(); if (pin.length === 4) gonder(); }
      else if (e.key === 'Backspace') { pin = pin.slice(0, -1); ciz(); }
    });
    form.addEventListener('submit', e => { e.preventDefault(); gonder(); });
    if (sonAd) gizliPin.focus(); else form.ad.focus();
  },
};
