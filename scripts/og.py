"""Open Graph images, one per language: python scripts/og.py [--fonts .rig/fonts]
Same copy as the hero. Needs JetBrains Mono 400/700 as jbm-400.ttf / jbm-700.ttf in the fonts dir."""
import sys
from PIL import Image, ImageDraw, ImageFont

fonts = sys.argv[sys.argv.index("--fonts") + 1] if "--fonts" in sys.argv else ".rig/fonts"
W, H = 1200, 630
BG, SCAN = (7, 12, 18), (10, 16, 23)
CYAN, CORAL, TEXT, SUB, RULE, AMBER, DIM = (95, 211, 255), (255, 107, 107), (213, 227, 236), (134, 160, 178), (28, 58, 74), (255, 176, 46), (78, 101, 119)
B = lambda s: ImageFont.truetype(f"{fonts}/jbm-700.ttf", s)
R = lambda s: ImageFont.truetype(f"{fonts}/jbm-400.ttf", s)

COPY = {
    "en": {
        "title": ["split your session at the silences.", "keep the good takes."],
        "sub": ["every take cut at the silence around it, transcribed and", "filed under its line. you narrow them down, all by keyboard."],
        "keys": [("[enter]", "keep", AMBER), ("[backspace]", "drop", DIM), ("[w]", "transcribe", DIM), ("[g]", "by line", DIM)],
        "foot": "takekeeper.com  ·  free  ·  private  ·  nothing uploaded  ·  spanish & english",
        "file": "public/og.png",
    },
    "es": {
        "title": ["corta tu sesión en los silencios.", "quédate con las tomas buenas."],
        "sub": ["cada toma cortada en el silencio, transcrita y archivada", "bajo su línea. las filtras en pasadas, todo con el teclado."],
        "keys": [("[enter]", "subir", AMBER), ("[backspace]", "tirar", DIM), ("[w]", "transcribir", DIM), ("[g]", "por línea", DIM)],
        "foot": "takekeeper.com  ·  gratis  ·  privado  ·  no se sube nada  ·  español e inglés",
        "file": "public/og-es.png",
    },
}


def mark(d, x, y, s=0.8):
    # the logo: two cyan half-takes on the baseline, a coral take lifted out over a dashed ghost slot
    k = lambda v: round(v * s)
    d.rectangle([x, y + k(28), x + k(10), y + k(48)], fill=CYAN)
    d.rectangle([x + k(38), y + k(28), x + k(48), y + k(48)], fill=CYAN)
    d.rectangle([x + k(14), y + k(16), x + k(34), y + k(36)], fill=CORAL)
    gx0, gy0, gx1, gy1 = x + k(14.5), y + k(28.5), x + k(33.5), y + k(47.5)
    dash = (40, 70, 90)
    for i in range(0, k(19), 3):
        d.point((gx0 + i, gy1), fill=dash)
        d.point((gx1, gy0 + i), fill=dash)
        d.point((gx0, gy0 + i), fill=dash)


for lang, c in COPY.items():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for y in range(0, H, 3):
        d.line([(0, y), (W, y)], fill=SCAN)
    width = lambda t, f: d.textbbox((0, 0), t, font=f, anchor="ls")[2]
    mark(d, 96, 62)
    d.text((150, 106), "takekeeper", font=B(27), fill=TEXT, anchor="ls")
    size = 50
    while max(width(t, B(size)) for t in c["title"]) > 1010:
        size -= 1
    for i, t in enumerate(c["title"]):
        d.text((97, 228 + i * (size + 10)), t, font=B(size), fill=CYAN, anchor="ls")
    for i, t in enumerate(c["sub"]):
        d.text((97, 352 + i * 38), t, font=R(26), fill=SUB, anchor="ls")
    d.line([(97, 425), (1105, 425)], fill=RULE, width=1)
    x, f = 97, R(23)
    for key, label, col in c["keys"]:
        d.text((x, 478), key, font=f, fill=col, anchor="ls")
        x += width(key + " ", f)
        d.text((x, 478), label, font=f, fill=DIM, anchor="ls")
        x += width(label, f) + width("    ", f)
    d.text((97, 564), c["foot"], font=R(22), fill=DIM, anchor="ls")
    im.save(c["file"], optimize=True)
    print(c["file"], "title", size)
