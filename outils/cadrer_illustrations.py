# -*- coding: utf-8 -*-
"""RECADRE LES ILLUSTRATIONS DE RECOMPENSES A LA MEME ECHELLE.

Julien, 06/09/2026 : "la boutique de recompense, ce n'est pas bien
cadre, genre les images ne sont pas bien cadrees, cadre-les bien."

Il ne parlait pas du CSS. Les fichiers eux-memes sont dessines a des
echelles differentes -- releve avant correction, sur des toiles toutes
carrees de 512 px :

    art-bouteille   encre 218x420   82,0 % de la toile
    art-pinte       encre 246x384   75,0 %
    art-cocktail    encre 278x338   66,0 %
    art-cintre      encre 338x279   54,5 %
    art-shot        encre 342x277   54,1 %

Un rapport de un a un et demi. Pose dans une grille, ca donne une
bouteille qui touche les bords a cote d'un shot qui flotte au milieu de
son cadre -- et aucun reglage de `object-fit` ne rattrape ca, parce que
le vide fait partie de l'image.

    python outils/cadrer_illustrations.py

Chaque dessin est rogne sur son encre, remis a l'echelle pour que son
COTE LE PLUS LONG occupe la meme fraction de la toile, puis recentre.

⚠️ LE COTE LE PLUS LONG, PAS LA HAUTEUR. Egaliser les hauteurs ferait
un shot aussi grand qu'une bouteille : c'est la boite englobante qui
doit se ressembler d'un dessin a l'autre, pas l'objet. Un cintre est
large et plat, une bouteille est haute et fine ; les deux doivent
occuper la meme place.

⚠️ NE TOUCHE PAS art-cocktail-hero.webp : ce n'est pas une vignette de
catalogue mais une banniere 960x540, cadree pour son propre usage.

Les fichiers sont reecrits SUR PLACE. Ils sont dans git : `git diff` dit
ce qui a bouge, `git checkout` revient en arriere.
"""
import os

from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(os.path.dirname(ICI), "public", "recompenses")

# La part de la toile qu'occupe le cote le plus long du dessin. 76 % :
# assez grand pour que l'objet porte la vignette, assez petit pour qu'il
# lui reste une marge et ne touche jamais le bord d'une tuile.
PART = 0.76

# Recadree pour son propre usage, elle n'a rien a faire ici.
EXCLUES = {"art-cocktail-hero.webp"}


def cadrer(chemin):
    im = Image.open(chemin).convert("RGBA")
    L, H = im.size
    boite = im.getchannel("A").getbbox()
    if not boite:
        return None  # entierement transparente : rien a cadrer

    encre = im.crop(boite)
    cible = PART * max(L, H)
    facteur = cible / max(encre.size)
    neuve = encre.resize(
        (max(1, round(encre.width * facteur)), max(1, round(encre.height * facteur))),
        Image.LANCZOS,
    )

    toile = Image.new("RGBA", (L, H), (0, 0, 0, 0))
    toile.paste(neuve, ((L - neuve.width) // 2, (H - neuve.height) // 2), neuve)
    # quality/method : les memes que detourer_logo.py, pour que tout le
    # depot sorte du meme encodeur.
    toile.save(chemin, "WEBP", quality=92, method=6)
    return encre.size, neuve.size


def main():
    for nom in sorted(os.listdir(DOSSIER)):
        if not nom.endswith(".webp") or nom in EXCLUES:
            continue
        chemin = os.path.join(DOSSIER, nom)
        avant_apres = cadrer(chemin)
        if not avant_apres:
            print("%-22s vide, ignoree" % nom)
            continue
        avant, apres = avant_apres
        print("%-22s encre %3dx%-3d -> %3dx%-3d" % (nom, avant[0], avant[1], apres[0], apres[1]))


if __name__ == "__main__":
    main()
