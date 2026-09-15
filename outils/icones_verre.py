"""Icones de l'appli et du site a partir du VERRE du logo Noctify.

Julien, 15/09/2026 : « mets le verre sympa comme logo du site, pas ton truc
bizarre avec une etoile rouge ». Remplace outils/icones_pwa.cjs (l'etoile).

Source : public/noctify-logo-verre.png (le logo complet, texte + verre). On
decoupe le personnage seul (le mot « Noctify » serait illisible a 32 px), on
blanchit le fond creme, et on le pose au centre d'un carre blanc.

Usage : python outils/icones_verre.py
"""
from pathlib import Path
from PIL import Image, ImageChops

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "public" / "noctify-logo-verre.png"
SORTIE = RACINE / "public" / "icones"

logo = Image.open(SOURCE).convert("RGB")
k = logo.width / 640
# Le verre et son petit verre leve, sous le mot (releve sur l'image de 640 px).
verre = logo.crop([int(v * k) for v in (190, 246, 460, 470)])

# Le fond creme passe au blanc pur : sinon un carre beige sur l'ecran d'accueil.
fond = verre.getpixel((4, 4))
px = verre.load()
for y in range(verre.height):
    for x in range(verre.width):
        r, g, b = px[x, y]
        if abs(r - fond[0]) < 26 and abs(g - fond[1]) < 26 and abs(b - fond[2]) < 26:
            px[x, y] = (255, 255, 255)
# Recadrage serre sur le dessin
bbox = ImageChops.difference(verre, Image.new("RGB", verre.size, (255, 255, 255))).getbbox()
verre = verre.crop(bbox)


def carre(cote, part, fond=(255, 255, 255)):
    """Le verre occupe `part` du cote (zone sure des icones maskable : 80 %)."""
    img = Image.new("RGB", (cote, cote), fond)
    echelle = part * cote / max(verre.width, verre.height)
    v = verre.resize((round(verre.width * echelle), round(verre.height * echelle)), Image.LANCZOS)
    img.paste(v, ((cote - v.width) // 2, (cote - v.height) // 2))
    return img


CIBLES = [
    ("icone-192.png", 192, 0.78),
    ("icone-512.png", 512, 0.78),
    ("icone-192-maskable.png", 192, 0.66),
    ("icone-512-maskable.png", 512, 0.66),
    ("apple-touch-icon.png", 180, 0.74),
    ("icone-1024.png", 1024, 0.74),
    ("favicon-32.png", 32, 0.92),
    ("favicon-64.png", 64, 0.9),
]
for nom, cote, part in CIBLES:
    carre(cote, part).save(SORTIE / nom, optimize=True)
    print("  " + nom)

# Badge des notifications Android : le systeme ne garde que la forme.
# Silhouette blanche (les traits noirs et le rouge) sur fond transparent.
b = carre(96, 0.9).convert("L")
alpha = b.point(lambda v: 255 if v < 200 else 0)
badge = Image.new("RGBA", (96, 96), (255, 255, 255, 0))
badge.putalpha(alpha)
blanc = Image.new("RGBA", (96, 96), (255, 255, 255, 255))
blanc.putalpha(alpha)
blanc.save(SORTIE / "badge-96.png", optimize=True)
print("  badge-96.png")

# Apercu des liens partages (WhatsApp, iMessage, Instagram) : le logo complet.
og = Image.new("RGB", (1200, 630), (255, 255, 255))
complet = logo.copy()
fond = complet.getpixel((4, 4))
p = complet.load()
for y in range(complet.height):
    for x in range(complet.width):
        r, g, bb = p[x, y]
        if abs(r - fond[0]) < 26 and abs(g - fond[1]) < 26 and abs(bb - fond[2]) < 26:
            p[x, y] = (255, 255, 255)
complet = complet.crop(ImageChops.difference(complet, Image.new("RGB", complet.size, (255, 255, 255))).getbbox())
e = 520 / complet.height
complet = complet.resize((round(complet.width * e), 520), Image.LANCZOS)
og.paste(complet, ((1200 - complet.width) // 2, 55))
og.save(SORTIE / "partage.png", optimize=True)
print("  partage.png")
