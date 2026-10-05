// Giriş (SM Giris): sol 640 px kırmızı panel, sağda ad soyad + 4 kutulu PIN + 68 px tuş takımı.
// Telefonda tek sütun (kırmızı üst blok). Hatalı PIN: amber kutular + sallanma + "PIN hatalı" metni. Son yazılan ad hatırlanır.
// 2026-10-01: ad yazılmadıysa 4 hane girilince PIN'in sahibi bulunur, "Ad Soyad · Rol, bu sen misin?" kartı çıkar; [Evet, gir] ile girilir.
import { girisYap, pinSahibi, pinleGir, ROL_AD, esc, trBaslik, kurulumBekliyor } from '../core.js';
import { KOMITE, KOMITE_SORUN, SORUN_METNI, anahtar, logoHtml } from '../komite.js';

const YON = { yonetici: 'masaya', kurul: 'masaya', masa: 'masaya', sofor: 'sahaya', sorumlu: 'araç listene', rapor: 'rapora' };

export default {
  async render(kok, girisSonrasi) {
    let pin = '';
    let durum = 'bos';        // bos | kontrol | onay | hata | tamam
    let kisi = null;          // onay kartındaki kişi {eposta, ad, rol}
    let mesaj = '';
    let pinHatasi = false;    // yalnız PIN yanlışsa kutular amber olur (ad bulunamadı gibi hatalarda olmaz)
    let zamanlayici = 0;
    const SON_AD = anahtar('secim-son-ad');
    let sonAd = ''; try { sonAd = localStorage.getItem(SON_AD) || ''; } catch {}
    const K = KOMITE, kapali = kurulumBekliyor;   // 26-27 veritabanı kurulumu sürerken giriş kapalı

    kok.innerHTML = `
    <div class="giris-sayfa">
      <section class="giris-sol">
        <div class="giris-ust">
          <div class="giris-baslik">${logoHtml('span')}</div>
          <div class="giris-aciklama">${esc(K.aciklama)}</div>
          <div class="giris-rozet-satir">${K.liste ? `<div class="giris-rozet">${esc(K.liste)}</div>` : ''}<div class="giris-tel-tarih">${esc(K.kisaTarih)}</div></div>
        </div>
        <div class="giris-alt">
          <div class="giris-masa">SEÇİM MASASI</div>
          <div class="giris-tarih">${esc(K.uzunTarih)}<br>${esc(K.uzunYer)}${K.uzunSaat ? `<br>${esc(K.uzunSaat)}` : ''}</div>
          ${K.slogan ? `<div class="giris-cizgi"></div>
          <div class="giris-slogan">${esc(K.slogan)}</div>` : ''}
        </div>
      </section>
      <section class="giris-sag">
        <form class="giris-kutu" autocomplete="off" novalidate>
          <div class="giris-baslik-blok"><h2>Giriş</h2><div class="giris-not">Sana verilen 4 haneli PIN'i gir. Adını yazmak zorunlu değil.</div></div>
          ${kapali ? `<div class="giris-kurulum" role="status"><b>${KOMITE_SORUN === 'bekliyor' ? 'Veritabanı kurulumu sürüyor' : 'Giriş geçici olarak kapalı'}</b><span>${esc(SORUN_METNI[KOMITE_SORUN] || '')}</span></div>` : ''}
          <div class="giris-alan">
            <label class="giris-etiket" for="giris-ad">AD SOYAD (isteğe bağlı)</label>
            <input class="giris-ad" id="giris-ad" name="ad" value="" placeholder="Ad soyad" autocapitalize="words" autocomplete="off" spellcheck="false" enterkeyhint="next" aria-label="Ad soyad">
          </div>
          <div class="giris-alan pin">
            <div class="giris-etiket">PIN</div>
            <div class="pin-kutular" role="group" aria-label="PIN">${[0, 1, 2, 3].map(i => `<div class="pin-kutu" data-k="${i}"></div>`).join('')}</div>
            <div class="giris-mesaj-kap"><div class="giris-mesaj" data-mesaj role="alert"></div></div>
          </div>
          <div class="giris-onay" data-onay hidden></div>
          <div class="tus-takimi">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="tus" data-t="${n}">${n}</button>`).join('')}<button type="button" class="tus sil" data-t="sil" aria-label="Sil">⌫</button><button type="button" class="tus" data-t="0">0</button><button type="submit" class="tus gir">Giriş</button></div>
          <div class="giris-dipnot">PIN'ini unuttuysan yöneticiye yaz.</div>
          ${K.slogan ? `<div class="giris-slogan-tel">${esc(K.slogan)}</div>` : ''}
        </form>
      </section>
    </div>`;

    const form = kok.querySelector('form'), kutular = [...kok.querySelectorAll('.pin-kutu')], satir = kok.querySelector('.pin-kutular');
    const mesajKutu = kok.querySelector('[data-mesaj]'), tuslar = [...kok.querySelectorAll('.tus')];
    const onayKutu = kok.querySelector('[data-onay]'), takim = kok.querySelector('.tus-takimi');
    form.ad.value = sonAd;
    if (kapali) form.ad.disabled = true;
    stilEkle();

    const ciz = () => {
      kutular.forEach((k, i) => {
        k.textContent = pin[i] ? '●' : '';
        k.className = 'pin-kutu' + (durum === 'hata' && pinHatasi ? ' hata' : durum === 'tamam' ? ' tamam' : durum === 'bos' && !kapali && i === pin.length ? ' sira' : '');
      });
      mesajKutu.className = 'giris-mesaj' + (durum === 'tamam' ? ' tamam' : durum === 'kontrol' ? ' notr' : '');
      mesajKutu.textContent = durum === 'hata' ? `▲ ${mesaj}` : durum === 'tamam' ? `✓ ${mesaj}` : durum === 'kontrol' ? 'Giriş yapılıyor…' : '';
      const kilit = kapali || durum === 'kontrol' || durum === 'tamam';
      tuslar.forEach(t => { t.disabled = kilit; });
      // onay kartı: tuş takımının yerine çıkar (başparmağın altında iki büyük düğme)
      const onayda = durum === 'onay' && kisi;
      onayKutu.hidden = !onayda; takim.hidden = !!onayda;
      if (onayda && !onayKutu.dataset.ciz) {
        onayKutu.dataset.ciz = '1';
        const ad = trBaslik(kisi.ad || '') || 'Bu hesap';
        onayKutu.innerHTML = `<div class="giris-onay-kart" role="group" aria-label="Kimlik onayı">
            <div class="giris-onay-avatar" aria-hidden="true">${esc(ad.split(/\s+/).map(x => x[0] || '').slice(0, 2).join('').toLocaleUpperCase('tr'))}</div>
            <div class="giris-onay-yazi"><div class="giris-onay-ad">${esc(ad)}</div><div class="giris-onay-soru">${kisi.rol ? `<span class="giris-onay-rol">${esc(ROL_AD[kisi.rol] || kisi.rol)}</span>` : ''}Bu sen misin?</div></div>
          </div>
          <div class="giris-onay-dugmeler"><button type="button" class="tus gir" data-onay-evet>Evet, gir</button><button type="button" class="tus giris-onay-hayir" data-onay-hayir>Hayır, başka PIN</button></div>`;
        onayKutu.querySelector('[data-onay-evet]').addEventListener('click', onayla);
        onayKutu.querySelector('[data-onay-hayir]').addEventListener('click', vazgec);
        if (!matchMedia('(pointer: coarse)').matches) onayKutu.querySelector('[data-onay-evet]').focus({ preventScroll: true });   // klavyede Enter = Evet
      }
      if (!onayda) { delete onayKutu.dataset.ciz; onayKutu.innerHTML = ''; }
      if (durum === 'onay') mesajKutu.textContent = '';
    };
    const temizleHata = () => { durum = 'bos'; mesaj = ''; pinHatasi = false; form.ad.classList.remove('hata'); };
    const hataYaz = (m, { pin: pinMi = false, ad: adMi = false } = {}) => {
      durum = 'hata'; mesaj = m; pinHatasi = pinMi;
      form.ad.classList.toggle('hata', adMi);
      satir.classList.remove('sallan'); void satir.offsetWidth; satir.classList.add('sallan');   // smShake yeniden oynasın
      ciz(); if (adMi) form.ad.focus();
    };
    const hataGoster = e => {
      const pinMi = /PIN hatalı/i.test(e.message);
      hataYaz(pinMi ? (form.ad.value.trim() ? 'PIN hatalı · tekrar dene' : 'PIN hatalı · tekrar dene ya da adını da yaz') : e.message, { pin: pinMi, ad: /Adını da yaz/i.test(e.message) });
    };
    const girildi = async (ben, ad) => {
      try { localStorage.setItem(SON_AD, ad); } catch {}
      durum = 'tamam'; mesaj = `Hoş geldin, ${YON[ben?.rol] ? YON[ben.rol] + ' ' : ''}yönlendiriliyorsun…`; ciz();
      await girisSonrasi();
    };
    const gonder = async () => {
      clearTimeout(zamanlayici);
      if (kapali) return;
      if (durum === 'kontrol' || durum === 'tamam') return;
      if (durum === 'onay') return onayla();
      const ad = form.ad.value.trim();
      if (pin.length !== 4) return hataYaz('PIN 4 haneli olmalı');
      durum = 'kontrol'; mesaj = ''; form.ad.classList.remove('hata'); ciz();
      try {
        if (ad) return await girildi(await girisYap(ad, pin), ad);   // adını yazan zaten kendini tanıttı: onay sorulmaz
        kisi = await pinSahibi(pin);
        durum = 'onay'; ciz();
      } catch (e) { hataGoster(e); }
    };
    async function onayla() {
      if (durum !== 'onay' || !kisi) return;
      const k = kisi; durum = 'kontrol'; ciz();
      try { await girildi(await pinleGir(k.eposta, pin), ''); }
      catch (e) { kisi = null; hataGoster(e); }
    }
    function vazgec() {
      if (durum !== 'onay') return;
      kisi = null; pin = ''; temizleHata(); ciz();
    }
    const tus = k => {
      if (kapali || durum === 'kontrol' || durum === 'tamam') return;
      if (document.activeElement === form.ad) form.ad.blur();   // telefonda klavye tuş takımını kapatmasın
      if (durum === 'onay') return;
      if (k === 'sil') { if (durum === 'hata') temizleHata(); pin = pin.slice(0, -1); return ciz(); }
      if (durum === 'hata') { pin = ''; temizleHata(); }         // hatadan sonra yeni tuş yeni PIN başlatır
      if (pin.length >= 4) return;
      pin += k; ciz();
      if (pin.length === 4) zamanlayici = setTimeout(gonder, 150);
    };

    // tuşlar odağı çalmasın (Enter ile aynı rakam tekrar basılmasın); ad kutusundan çıkış tus() içinde
    kok.querySelector('.tus-takimi').addEventListener('mousedown', e => e.preventDefault());
    kok.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => tus(b.dataset.t)));
    form.ad.addEventListener('input', () => {
      if (durum === 'onay') { kisi = null; pin = ''; temizleHata(); ciz(); return; }   // ad yazmaya başladıysa onay kartı kapanır
      if (durum === 'hata' && !pinHatasi) { temizleHata(); ciz(); } else form.ad.classList.remove('hata');
    });
    form.addEventListener('submit', e => { e.preventDefault(); gonder(); });
    document.addEventListener('keydown', function tusOlayi(e) {
      if (!document.body.contains(form)) return document.removeEventListener('keydown', tusOlayi);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement === form.ad) { if (e.key === 'Enter') { e.preventDefault(); form.ad.blur(); } return; }
      if (durum === 'onay') { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); vazgec(); } return; }   // Enter odaktaki düğmeye gider
      if (/^\d$/.test(e.key)) tus(e.key);
      else if (e.key === 'Backspace') tus('sil');
      else if (e.key === 'Enter' && pin.length === 4) gonder();
    });
    ciz();
    // ad isteğe bağlı: klavye açılmasın, doğrudan PIN tuşlarıyla girilsin
  },
};

function stilEkle() {
  if (document.head.querySelector('style[data-ekran="giris"]')) return;
  const s = document.createElement('style'); s.dataset.ekran = 'giris';
  s.textContent = `
.giris-onay { display: flex; flex-direction: column; gap: 12px; animation: smIn .18s ease-out; }
.giris-onay[hidden], .tus-takimi[hidden] { display: none; }
.giris-onay-kart { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 14px; border: 1.5px solid var(--red-line); background: var(--red-soft); }
.giris-onay-avatar { flex: none; width: 52px; height: 52px; border-radius: 99px; background: var(--red); color: #fff; display: grid; place-items: center; font-size: 18px; font-weight: 900; letter-spacing: .02em; }
.giris-onay-yazi { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.giris-onay-ad { font-size: 20px; font-weight: 900; letter-spacing: -.01em; color: var(--ink); line-height: 1.2; }
.giris-onay-soru { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 15px; font-weight: 600; color: var(--ink-2); }
.giris-onay-rol { padding: 3px 8px; border-radius: 6px; background: var(--red); color: #fff; font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.giris-onay-dugmeler { display: grid; grid-template-columns: 1fr; gap: 10px; }
.giris-onay-dugmeler .tus { font-size: 18px; font-weight: 800; }
.giris-onay-dugmeler .giris-onay-hayir { font-size: 16px; color: var(--ink-2); }
.giris-kurulum { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 12px; background: var(--amber-soft); border: 1.5px solid var(--amber); color: var(--amber-ink); font-size: 14px; font-weight: 600; line-height: 1.4; }
.giris-kurulum b { font-size: 16px; font-weight: 900; color: var(--ink); }
@media (max-width: 900px) { .giris-onay-dugmeler .tus { height: 58px; } .giris-kurulum { margin-bottom: 4px; } }`;
  document.head.appendChild(s);
}
