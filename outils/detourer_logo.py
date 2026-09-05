# -*- coding: utf-8 -*-
"""DETOURE LE LOGO NOCTIFY.

Julien, 05/09/2026 : "le logo n'est pas bien intégré dans le truc".

`public/noctify-logo-verre.png` a un fond CREME OPAQUE (246, 232, 222)
incruste dans l'image. Les deux applis le rattrapaient avec un filtre SVG
(#logo-blanc / #logo-blanc-club) qui remonte chaque canal pour amener ce
creme a 255 : tant que l'ecran etait blanc pur, le rectangle disparaissait.

Depuis que le fond de l'appli des gerants est un blanc casse CHAUD
(#f9f6f1), le filtre pose un rectangle plus clair et plus froid au milieu
d'un ecran vide. Le filtre visait une couleur ; il fallait donc en changer
des que la couleur changeait.

`mix-blend-mode: multiply` a ete essaye : il ASSOMBRIT le rectangle au
lieu de l'effacer, parce que creme x creme est plus fonce que creme.

La vraie solution est celle que le commentaire du CSS appelait deja :
un PNG a fond TRANSPARENT, qui marche sur n'importe quelle couleur.

    python outils/detourer_logo.py

Sortie : public/noctify-logo-verre-detoure.webp (l'original n'est pas
touche).

⚠️ REMPLISSAGE DEPUIS LES BORDS, PAS UN SEUIL GLOBAL.
Le verre a un INTERIEUR BLANC, plus clair que le fond creme. Un simple
"tout ce qui ressemble au fond devient transparent" le trouerait. Le fond
exterieur, lui, est le seul a toucher les bords de l'image : on part des
quatre coins et on ne franchit jamais le trait noir qui ferme le verre.

L'alpha est PROGRESSIF sur la distance au creme : un pixel exactement de
la couleur du fond disparait, un pixel a 45 unites reste opaque. C'est ce
qui garde les bords lisses au lieu d'un decoupage en escalier.
"""
from collections import deque
import os

from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
SOURCE = os.path.join(RACINE, "public", "noctify-logo-verre.png")
SORTIE = os.path.join(RACINE, "public", "noctify-logo-verre-detoure.webp")

# Le creme incruste, releve sur l'image elle-meme.
FOND = (246, 232, 222)
# En dessous : c'est du fond. Au-dessus : c'est du dessin. Entre les
# deux : un bord, dont l'opacite monte avec la distance.
SEUIL = 45


def distance(px):
    return max(abs(px[0] - FOND[0]), abs(px[1] - FOND[1]), abs(px[2] - FOND[2]))


def main():
    im = Image.open(SOURCE).convert("RGBA")
    L, H = im.size
    px = im.load()

    # Le fond exterieur, et lui seul : on part des quatre coins.
    dehors = bytearray(L * H)
    file = deque()
    for x in range(L):
        for y in (0, H - 1):
            file.append((x, y))
    for y in range(H):
        for x in (0, L - 1):
            file.append((x, y))

    while file:
        x, y = file.popleft()
        if x < 0 or y < 0 or x >= L or y >= H:
            continue
        i = y * L + x
        if dehors[i]:
            continue
        if distance(px[x, y]) >= SEUIL:
            continue  # le trait : on s'arrete la
        dehors[i] = 1
        file.append((x + 1, y))
        file.append((x - 1, y))
        file.append((x, y + 1))
        file.append((x, y - 1))

    efface = 0
    for y in range(H):
        for x in range(L):
            if not dehors[y * L + x]:
                continue
            r, v, b, _ = px[x, y]
            # Progressif : le fond pur a 0, un bord garde ce qu'il vaut.
            a = int(min(255, distance((r, v, b)) * 255 / SEUIL))
            px[x, y] = (r, v, b, a)
            if a == 0:
                efface += 1

    # Le logo s'affiche a 190 px de large. Le garder en 1254 px, c'est
    # 1,6 Mo d'alpha a telecharger sur le wifi d'un club pour un ecran de
    # chargement -- exactement ce qu'un ecran de chargement ne doit pas
    # faire. 640 px couvre le triple densite (190 x 3 = 570).
    LARGE = 640
    if im.size[0] > LARGE:
        im = im.resize((LARGE, round(H * LARGE / L)), Image.LANCZOS)

    # WebP et non PNG : le dessin a des degrades et une ombre, et le PNG
    # avec alpha y monte a 550 Ko. Le reste du depot (mascotte,
    # recompenses) est deja en WebP pour la meme raison.
    im.save(SORTIE, "WEBP", quality=92, method=6)
    print("%s : %d pixels de fond rendus transparents (%.0f %%), %d x %d, %d Ko"
          % (os.path.basename(SORTIE), efface, 100.0 * efface / (L * H),
             im.size[0], im.size[1], os.path.getsize(SORTIE) // 1024))


if __name__ == "__main__":
    main()
