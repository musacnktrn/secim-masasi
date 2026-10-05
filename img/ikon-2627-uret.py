# 26-27 Seçim Masası ikonları: 72 ikonlarıyla aynı boyut ve yerleşim, turkuaz #087F8C zemin, beyaz "26-27", çizgi, "SEÇİM"
from PIL import Image, ImageDraw, ImageFont   # python3 img/ikon-2627-uret.py
import os
HEDEF = os.path.dirname(os.path.abspath(__file__))   # img/ klasörü
ZEMIN = (8, 127, 140)
BEYAZ = (255, 255, 255)
FONT = '/System/Library/Fonts/HelveticaNeue.ttc'

def ciz(S):
    # 4x büyük çiz, sonra küçült (kenar yumuşatma)
    K = 4; W = S * K
    im = Image.new('RGB', (W, W), ZEMIN); d = ImageDraw.Draw(im)
    u = W / 512.0
    # sayı: en çok %80 genişlik, 72 ikonundaki gibi üst yarıda
    hedef_g = 360 * u   # maskable güvenli daire (yarıçap %40) içinde kalsın
    boy = int(200 * u)
    while True:
        f = ImageFont.truetype(FONT, boy, index=1)
        b = d.textbbox((0, 0), '26-27', font=f)
        if b[2] - b[0] <= hedef_g: break
        boy -= int(2 * u) or 1
    g, y = b[2] - b[0], b[3] - b[1]
    sayi_alt = 275 * u                     # 72 ikonunda sayının alt kenarı
    x0 = (W - g) / 2 - b[0]
    y0 = sayi_alt - y - b[1]
    d.text((x0, y0), '26-27', font=f, fill=BEYAZ)
    # çizgi: 36x4, y 308
    d.rectangle([(W / 2 - 18 * u), 308 * u, (W / 2 + 18 * u), 312 * u - 1], fill=BEYAZ)
    # SEÇİM: harf aralıklı, 72 ikonundaki boyda (büyük harf yüksekliği ~28 px)
    f2 = ImageFont.truetype(FONT, int(38 * u), index=1)
    harfler = list('SEÇİM'); ara = 14 * u
    gen = [d.textbbox((0, 0), h, font=f2) for h in harfler]
    toplam = sum(bb[2] - bb[0] for bb in gen) + ara * (len(harfler) - 1)
    x = (W - toplam) / 2
    tavan = 339 * u
    ref = d.textbbox((0, 0), 'S', font=f2)
    for h, bb in zip(harfler, gen):
        d.text((x - bb[0], tavan - ref[1]), h, font=f2, fill=BEYAZ)
        x += (bb[2] - bb[0]) + ara
    return im.resize((S, S), Image.LANCZOS)

for S in (180, 192, 512):
    yol = os.path.join(HEDEF, f'ikon-2627-{S}.png')
    ciz(S).save(yol, optimize=True)
    print(yol)
