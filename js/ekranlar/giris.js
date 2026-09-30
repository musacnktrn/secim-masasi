// Giriş (SM Giris): sol 640 px kırmızı panel, sağda ad soyad + 4 kutulu PIN + 68 px tuş takımı.
// Telefonda tek sütun (kırmızı üst blok). Hatalı PIN: amber kutular + sallanma + "PIN hatalı" metni. Son yazılan ad hatırlanır.
import { girisYap } from '../core.js';

const YON = { yonetici: 'masaya', kurul: 'masaya', masa: 'masaya', sofor: 'sahaya', sorumlu: 'araç listene', rapor: 'rapora' };

export default {
  async render(kok, girisSonrasi) {
    let pin = '';
    let durum = 'bos';        // bos | kontrol | hata | tamam
    let mesaj = '';
    let pinHatasi = false;    // yalnız PIN yanlışsa kutular amber olur (ad bulunamadı gibi hatalarda olmaz)
    let zamanlayici = 0;
    let sonAd = ''; try { sonAd = localStorage.getItem('secim-son-ad') || ''; } catch {}

    kok.innerHTML = `
    <div class="giris-sayfa">
      <section class="giris-sol">
        <div class="giris-ust">
          <div class="giris-baslik">72. KOMİTE <span>|</span> GENÇ ENERJİ</div>
          <div class="giris-aciklama">İzmir Ticaret Odası 72. Komite · İklimlendirme, Mekanik ve Doğalgaz Grubu</div>
          <div class="giris-rozet-satir"><div class="giris-rozet">KIRMIZI LİSTE</div><div class="giris-tel-tarih">1 Ekim · Fuar İzmir</div></div>
        </div>
        <div class="giris-alt">
          <div class="giris-masa">SEÇİM MASASI</div>
          <div class="giris-tarih">1 Ekim 2026 Perşembe<br>Fuar İzmir (Gaziemir)</div>
          <div class="giris-cizgi"></div>
          <div class="giris-slogan">Enerjimiz sektörden, gücümüz gençlikten</div>
        </div>
      </section>
      <section class="giris-sag">
        <form class="giris-kutu" autocomplete="off" novalidate>
          <div class="giris-baslik-blok"><h2>Giriş</h2><div class="giris-not">Adını yaz, sana verilen 4 haneli PIN'i gir.</div></div>
          <div class="giris-alan">
            <label class="giris-etiket" for="giris-ad">AD SOYAD</label>
            <input class="giris-ad" id="giris-ad" name="ad" value="" placeholder="Ad soyad" autocapitalize="words" autocomplete="off" spellcheck="false" enterkeyhint="next" aria-label="Ad soyad">
          </div>
          <div class="giris-alan pin">
            <div class="giris-etiket">PIN</div>
            <div class="pin-kutular" role="group" aria-label="PIN">${[0, 1, 2, 3].map(i => `<div class="pin-kutu" data-k="${i}"></div>`).join('')}</div>
            <div class="giris-mesaj-kap"><div class="giris-mesaj" data-mesaj role="alert"></div></div>
          </div>
          <div class="tus-takimi">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="tus" data-t="${n}">${n}</button>`).join('')}<button type="button" class="tus sil" data-t="sil" aria-label="Sil">⌫</button><button type="button" class="tus" data-t="0">0</button><button type="submit" class="tus gir">Giriş</button></div>
          <div class="giris-dipnot">PIN'ini unuttuysan yöneticiye yaz.</div>
          <div class="giris-slogan-tel">Enerjimiz sektörden, gücümüz gençlikten</div>
        </form>
      </section>
    </div>`;

    const form = kok.querySelector('form'), kutular = [...kok.querySelectorAll('.pin-kutu')], satir = kok.querySelector('.pin-kutular');
    const mesajKutu = kok.querySelector('[data-mesaj]'), tuslar = [...kok.querySelectorAll('.tus')];
    form.ad.value = sonAd;

    const ciz = () => {
      kutular.forEach((k, i) => {
        k.textContent = pin[i] ? '●' : '';
        k.className = 'pin-kutu' + (durum === 'hata' && pinHatasi ? ' hata' : durum === 'tamam' ? ' tamam' : durum === 'bos' && i === pin.length ? ' sira' : '');
      });
      mesajKutu.className = 'giris-mesaj' + (durum === 'tamam' ? ' tamam' : durum === 'kontrol' ? ' notr' : '');
      mesajKutu.textContent = durum === 'hata' ? `▲ ${mesaj}` : durum === 'tamam' ? `✓ ${mesaj}` : durum === 'kontrol' ? 'Giriş yapılıyor…' : '';
      const kilit = durum === 'kontrol' || durum === 'tamam';
      tuslar.forEach(t => { t.disabled = kilit; });
    };
    const temizleHata = () => { durum = 'bos'; mesaj = ''; pinHatasi = false; form.ad.classList.remove('hata'); };
    const hataYaz = (m, { pin: pinMi = false, ad: adMi = false } = {}) => {
      durum = 'hata'; mesaj = m; pinHatasi = pinMi;
      form.ad.classList.toggle('hata', adMi);
      satir.classList.remove('sallan'); void satir.offsetWidth; satir.classList.add('sallan');   // smShake yeniden oynasın
      ciz(); if (adMi) form.ad.focus();
    };
    const gonder = async () => {
      clearTimeout(zamanlayici);
      if (durum === 'kontrol' || durum === 'tamam') return;
      const ad = form.ad.value.trim();
      if (ad.length < 3) return hataYaz('Ad soyadını yaz', { ad: true });
      if (pin.length !== 4) return hataYaz('PIN 4 haneli olmalı');
      durum = 'kontrol'; mesaj = ''; form.ad.classList.remove('hata'); ciz();
      try {
        const ben = await girisYap(ad, pin);
        try { localStorage.setItem('secim-son-ad', ad); } catch {}
        durum = 'tamam'; mesaj = `Hoş geldin, ${YON[ben?.rol] ? YON[ben.rol] + ' ' : ''}yönlendiriliyorsun…`; ciz();
        await girisSonrasi();
      } catch (e) {
        const pinMi = /PIN hatalı/i.test(e.message);
        hataYaz(pinMi ? 'PIN hatalı · tekrar dene' : e.message, { pin: pinMi, ad: /bulunamadı/i.test(e.message) });
      }
    };
    const tus = k => {
      if (durum === 'kontrol' || durum === 'tamam') return;
      if (document.activeElement === form.ad) form.ad.blur();   // telefonda klavye tuş takımını kapatmasın
      if (k === 'sil') { if (durum === 'hata') temizleHata(); pin = pin.slice(0, -1); return ciz(); }
      if (durum === 'hata') { pin = ''; temizleHata(); }         // hatadan sonra yeni tuş yeni PIN başlatır
      if (pin.length >= 4) return;
      pin += k; ciz();
      if (pin.length === 4) zamanlayici = setTimeout(gonder, 150);
    };

    // tuşlar odağı çalmasın (Enter ile aynı rakam tekrar basılmasın); ad kutusundan çıkış tus() içinde
    kok.querySelector('.tus-takimi').addEventListener('mousedown', e => e.preventDefault());
    kok.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => tus(b.dataset.t)));
    form.ad.addEventListener('input', () => { if (durum === 'hata' && !pinHatasi) { temizleHata(); ciz(); } else form.ad.classList.remove('hata'); });
    form.addEventListener('submit', e => { e.preventDefault(); gonder(); });
    document.addEventListener('keydown', function tusOlayi(e) {
      if (!document.body.contains(form)) return document.removeEventListener('keydown', tusOlayi);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement === form.ad) { if (e.key === 'Enter') { e.preventDefault(); form.ad.blur(); } return; }
      if (/^\d$/.test(e.key)) tus(e.key);
      else if (e.key === 'Backspace') tus('sil');
      else if (e.key === 'Enter' && pin.length === 4) gonder();
    });
    ciz();
    if (!sonAd) form.ad.focus();
  },
};
