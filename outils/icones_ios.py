"""Icones et ecran de lancement des deux applis iOS (29/09/2026).

Source : public/icones/icone-1024.png, le verre Noctify (le logo actuel).

- Icone : 1024 x 1024, SANS transparence -- App Store Connect refuse une
  icone avec canal alpha. Fond blanc pour l'appli clubbeur, noir pour
  l'appli gerants : les deux vivent parfois sur le meme telephone, il faut
  les distinguer d'un coup d'oeil.
- Ecran de lancement : blanc, le verre au centre, comme l'ecran de
  chargement de l'appli qui prend le relais (fond blanc, logo au verre).

Usage : python outils/icones_ios.py
"""
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "public" / "icones" / "icone-1024.png"

APPLIS = {
    "ios": {"fond_icone": (255, 255, 255), "fond_lancement": (255, 255, 255)},
    "ios-gerant": {"fond_icone": (18, 16, 21), "fond_lancement": (255, 255, 255)},
}


def aplatir(image, fond, taille):
    carre = Image.new("RGB", (taille, taille), fond)
    logo = image.convert("RGBA").resize((taille, taille), Image.LANCZOS)
    carre.paste(logo, (0, 0), logo)
    return carre


def icone_gerant(image, fond):
    """Le verre sur fond sombre. La source est sur fond BLANC opaque : on
    remplit ce blanc depuis les coins (inondation), ce qui garde le blanc
    de l'interieur du verre, qui n'est pas relie au bord."""
    from PIL import ImageDraw

    rgb = image.convert("RGB").copy()
    for coin in ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)):
        ImageDraw.floodfill(rgb, coin, fond, thresh=40)
    return rgb


def main():
    source = Image.open(SOURCE)
    for dossier, reglage in APPLIS.items():
        assets = RACINE / dossier / "App" / "App" / "Assets.xcassets"
        if not assets.exists():
            print("absent :", assets)
            continue
        if dossier == "ios-gerant":
            icone = icone_gerant(source, reglage["fond_icone"])
        else:
            icone = aplatir(source, reglage["fond_icone"], 1024)
        icone.save(assets / "AppIcon.appiconset" / "AppIcon-512@2x.png", optimize=True)

        lancement = Image.new("RGB", (2732, 2732), reglage["fond_lancement"])
        logo = source.convert("RGBA").resize((560, 560), Image.LANCZOS)
        lancement.paste(logo, ((2732 - 560) // 2, (2732 - 560) // 2), logo)
        for nom in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
            lancement.save(assets / "Splash.imageset" / nom, optimize=True)
        print("ok :", dossier)


if __name__ == "__main__":
    main()
