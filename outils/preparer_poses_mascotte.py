# Prepare les 5 poses de la mascotte pour le parcours d'installation.
#
# Le vrai travail n'est pas le detourage, c'est la MISE A L'ECHELLE. Les
# cinq images sortent du meme generateur mais le personnage n'y fait pas la
# meme taille (le liquide du verre mesure de 411 a 475 px selon la pose,
# soit 15 % d'ecart). Affichees a la suite dans le parcours, elles feraient
# grandir et retrecir le verre a chaque etape.
#
# On mesure donc le liquide du grand verre -- la plus grande masse rouge de
# l'image, jamais connectee au shot ni aux barres du graphique -- et on
# ramene tout le monde a la meme largeur, puis on aligne sur son centre.
from PIL import Image
from collections import deque
import os

SRC = "C:/Users/stepp/Downloads"
DEST = "C:/Users/stepp/Downloads/ViralNight-ClaudeCode-FULL/01-base-fonctionnelle-vite-supabase-api/public/mascotte"

FICHIERS = {
    1: ("ChatGPT Image 4 sept. 2026, 19_19_13.png", "il salue"),
    2: ("ChatGPT Image 4 sept. 2026, 19_25_37.png", "il leve un shot"),
    3: ("ChatGPT Image 4 sept. 2026, 19_26_36.png", "il montre la courbe"),
    4: ("ChatGPT Image 4 sept. 2026, 19_27_43.png", "il filme"),
    5: ("ChatGPT Image 4 sept. 2026, 19_26_42.png", "il brandit le panneau"),
}

TRAVAIL = 700          # on detoure a cette taille, pas en 1254 : 3x moins de pixels
LIQUIDE_CIBLE = 236    # largeur voulue du liquide, a l'echelle de travail
HAUTEUR_FINALE = 420


def detourer(im):
    """Rend transparent le fond blanc, depuis les bords. L'interieur clair du
    verre est protege par son propre contour noir : le remplissage ne peut
    pas y entrer."""
    L, H = im.size
    d = list(im.getdata())

    def blanc(i, seuil):
        r, g, b, _ = d[i]
        return (255 - r) + (255 - g) + (255 - b) <= seuil

    vus = bytearray(L * H)
    f = deque()
    for x in range(L):
        f.append(x)
        f.append((H - 1) * L + x)
    for y in range(H):
        f.append(y * L)
        f.append(y * L + L - 1)

    while f:
        i = f.popleft()
        if vus[i] or not blanc(i, 12):
            continue
        vus[i] = 1
        r, g, b, _ = d[i]
        d[i] = (r, g, b, 0)
        x, y = i % L, i // L
        if x > 0: f.append(i - 1)
        if x < L - 1: f.append(i + 1)
        if y > 0: f.append(i - L)
        if y < H - 1: f.append(i + L)

    # L'anti-aliasing laisse une frange blanche autour des traits. Sur le
    # fond creme de l'appli elle se verrait : on la grignote. L'erosion ne
    # progresse que depuis le vide, le contour noir l'arrete avant le verre.
    for _ in range(3):
        aRetirer = []
        for i in range(L * H):
            if d[i][3] == 0 or not blanc(i, 90):
                continue
            x, y = i % L, i // L
            if ((x > 0 and d[i-1][3] == 0) or (x < L-1 and d[i+1][3] == 0)
                    or (y > 0 and d[i-L][3] == 0) or (y < H-1 and d[i+L][3] == 0)):
                aRetirer.append(i)
        if not aRetirer:
            break
        for i in aRetirer:
            r, g, b, _ = d[i]
            d[i] = (r, g, b, 0)

    im.putdata(d)
    return im


def bbox_liquide(im):
    """La plus grande composante rouge : le liquide du grand verre."""
    L, H = im.size
    d = list(im.getdata())

    def rouge(i):
        r, g, b, a = d[i]
        return a > 0 and r > 140 and g < 130 and b < 130 and r - max(g, b) > 45

    vus = bytearray(L * H)
    meilleur = None
    for depart in range(0, L * H, 2):
        if vus[depart] or not rouge(depart):
            continue
        f = deque([depart])
        vus[depart] = 1
        n = 0
        minx = maxx = depart % L
        miny = maxy = depart // L
        while f:
            i = f.popleft()
            n += 1
            x, y = i % L, i // L
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            for j, ok in ((i-1, x > 0), (i+1, x < L-1), (i-L, y > 0), (i+L, y < H-1)):
                if ok and not vus[j] and rouge(j):
                    vus[j] = 1
                    f.append(j)
        if meilleur is None or n > meilleur[0]:
            meilleur = (n, minx, miny, maxx, maxy)
    return meilleur


# --- 1. detourer, mesurer, mettre a l'echelle ---
preparees = {}
for pas, (nom, geste) in FICHIERS.items():
    im = Image.open(os.path.join(SRC, nom)).convert("RGBA")
    im = im.resize((TRAVAIL, TRAVAIL), Image.LANCZOS)
    im = detourer(im)

    n, minx, miny, maxx, maxy = bbox_liquide(im)
    largeur = maxx - minx + 1
    facteur = LIQUIDE_CIBLE / largeur

    cx = (minx + maxx) / 2 * facteur
    cy = (miny + maxy) / 2 * facteur
    taille = (round(TRAVAIL * facteur), round(TRAVAIL * facteur))
    im = im.resize(taille, Image.LANCZOS)

    boite = im.getbbox()
    preparees[pas] = (im, cx, cy, boite, geste)
    print(f"pose {pas} ({geste}) : liquide {largeur}px -> facteur {facteur:.3f}")

# --- 2. un cadre commun, cale sur le centre du liquide ---
gauche = max(cx - b[0] for _, cx, cy, b, _ in preparees.values())
droite = max(b[2] - cx for _, cx, cy, b, _ in preparees.values())
haut = max(cy - b[1] for _, cx, cy, b, _ in preparees.values())
bas = max(b[3] - cy for _, cx, cy, b, _ in preparees.values())

MARGE = 6
LARGEUR_CADRE = round(gauche + droite) + MARGE * 2
HAUTEUR_CADRE = round(haut + bas) + MARGE * 2
ANCRE = (round(gauche) + MARGE, round(haut) + MARGE)
print(f"\ncadre commun : {LARGEUR_CADRE}x{HAUTEUR_CADRE}, centre du liquide en {ANCRE}")

# --- 3. composer et exporter ---
echelle = HAUTEUR_FINALE / HAUTEUR_CADRE
for pas, (im, cx, cy, boite, geste) in preparees.items():
    cadre = Image.new("RGBA", (LARGEUR_CADRE, HAUTEUR_CADRE), (0, 0, 0, 0))
    cadre.paste(im, (ANCRE[0] - round(cx), ANCRE[1] - round(cy)), im)
    cadre = cadre.resize((round(LARGEUR_CADRE * echelle), HAUTEUR_FINALE), Image.LANCZOS)
    chemin = os.path.join(DEST, f"pose-{pas}.webp")
    cadre.save(chemin, "WEBP", quality=88, method=6)
    print(f"pose-{pas}.webp  {cadre.size[0]}x{cadre.size[1]}  {os.path.getsize(chemin) // 1024} Ko  ({geste})")
