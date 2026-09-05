# -*- coding: utf-8 -*-
"""LA PLANCHE-CONTACT DES DEUX APPLIS.

Assemble en UNE page autonome les captures produites par
`appli_club.cjs` et `appli_clubbeur.cjs`. Les images sont embarquees en
base64 : le fichier s'envoie par mail ou par WhatsApp tel quel, il ne
depend d'aucun dossier a cote.

    node outils/appli_club.cjs
    node outils/appli_clubbeur.cjs
    python outils/planche_ecrans.py

⚠️ CE SONT LES .jpg QUI SONT EMBARQUES, PAS LES .png. Les deux outils
ecrivent les deux : le PNG retine pour regarder de pres, le JPEG 1x pour
la planche. Embarquer le retine multiplierait le poids par dix pour une
page qu'on lit a 215 px de large.

Toute capture ajoutee doit l'etre AUSSI dans les listes ci-dessous : la
planche ne lit pas le dossier, elle nomme ses ecrans un par un, parce
que chacun porte une legende qui dit quoi regarder.
"""
import base64
import io
import os
import struct

ICI = os.path.dirname(os.path.abspath(__file__))
CLUB = os.path.join(ICI, "pages-club")
CLUBBEUR = os.path.join(ICI, "pages-clubbeur")
OUT = os.path.join(ICI, "noctify-ecrans.html")

# (dossier, fichier, eyebrow, titre, note, marque)
INSTALLATION = [
    (CLUB, "01-installation-1", "Étape 01", "Ton compte",
     "Six \u00e9crans, six dessins. Il y en avait cinq pour six \u00e9crans : le compte et le club se partageaient le m\u00eame verre. Celui-ci est attabl\u00e9, celui d\u2019\u00e0 c\u00f4t\u00e9 est debout.", ""),
    (CLUB, "02-installation-2", "Étape 02", "Ton club",
     "Le nom, la ville, puis les photos \u2014 dans cet ordre. Les deux champs obligatoires tiennent au-dessus du pli.", ""),
    (CLUB, "02b-galerie-remplie", "Étape 02 · détail", "Les photos, une fois posées",
     "La couverture en 16/9 : c\u2019est l\u2019image que le clubbeur verra sur la carte. Quatre cases fixes dessous, pleines ou vides.", "photos d\u2019exemple"),
    (CLUB, "03-installation-3", "Étape 03", "Tes r\u00e9compenses",
     "Le dessin affich\u00e9 est celui que verra le client dans sa boutique. Le prix porte le corail, une seule fois par carte.", ""),
    (CLUB, "04-installation-4", "Étape 04", "Ton bar\u00e8me",
     "Trois profils \u00e0 toucher plut\u00f4t qu\u2019un tableau de chiffres. Le r\u00e9glage ligne par ligne reste, repli\u00e9.", ""),
    (CLUB, "05-installation-5", "Étape 05", "Ton Instagram",
     "Le pseudo d\u2019abord \u2014 c\u2019est ce que les clients taguent. La connexion Meta peut attendre les R\u00e9glages.", ""),
    (CLUB, "06-installation-6", "Étape 06", "Tout est pr\u00eat",
     "L\u2019affiche A4 et le bilan de ce qui vient d\u2019\u00eatre construit. Vides ici : ils se fabriquent \u00e0 partir du club connect\u00e9.", "\u00e9cran incomplet"),
]

CLUB_APPLI = [
    (CLUB, "07-tableau-de-bord", "Onglet 1", "Tableau de bord",
     "Un seul objet sombre sur l\u2019\u00e9cran clair : le chiffre que le club ach\u00e8te. C\u2019est lui qui dit quoi regarder d\u2019abord. Les quatre autres tiennent dans une grille \u00e0 filets, visibles sans d\u00e9filer.", ""),
    (CLUB, "08-tableau-de-bord-activite", "Onglet 1", "Activit\u00e9 r\u00e9cente",
     "Le glyphe dit la plateforme, le point de couleur dit l\u2019\u00e9tat. Avant : l\u2019initiale du statut (\u00ab V \u00bb, \u00ab E \u00bb, \u00ab R \u00bb) dans un rond gris.", ""),
    (CLUB, "09-recompenses", "Onglet 2", "Boutique de r\u00e9compenses",
     "Chaque r\u00e9compense prend son dessin. Sans correspondance, un pictogramme \u2014 jamais une initiale dans un carr\u00e9 gris.", ""),
    (CLUB, "10-recompense-ouverte", "Onglet 2", "Une r\u00e9compense, d\u00e9pli\u00e9e",
     "Repli\u00e9e elle tient sur une ligne. On l\u2019ouvre pour la modifier, pas avant.", ""),
    (CLUB, "11-reglages", "Onglet 3", "R\u00e9glages",
     "La fiche du club en t\u00eate, cliquable : nom, ville et photos n\u2019\u00e9taient modifiables nulle part apr\u00e8s l\u2019installation. Lignes descendues de 62 \u00e0 52 px, carr\u00e9s gris devenus ronds.", ""),
    (CLUB, "12-bareme", "R\u00e9glages", "Bar\u00e8me de points",
     "Une ligne par r\u00e8gle, le champ \u00e0 droite, sous le pouce.", ""),
    (CLUB, "13-qr", "R\u00e9glages", "Affiche et QR code",
     "L\u2019aper\u00e7u de ce qui sera imprim\u00e9, en A4. Le QR garde son fond blanc : les appareils photo attendent du sombre sur clair.", ""),
]

CLUBBEUR_APPLI = [
    (CLUBBEUR, "01-accueil", "Arriv\u00e9e", "L\u2019accueil",
     "Ce que voit quelqu\u2019un qui vient de scanner le QR coll\u00e9 au mur du club.", ""),
    (CLUBBEUR, "02-recompenses", "Onglet 1", "R\u00e9compenses \u2014 le solde",
     "Le solde et la jauge crant\u00e9e aux prix r\u00e9els du club. Fond blanc, demand\u00e9 le 04/09.", ""),
    (CLUBBEUR, "03-recompenses-cartes", "Onglet 1", "Le catalogue",
     "Les quatre r\u00e9compenses du club, chacune avec son num\u00e9ro de catalogue. Les illustrations sont d\u00e9tour\u00e9es, elles flottent sur la carte.", ""),
    (CLUBBEUR, "04-recompense-fiche", "Onglet 1", "Une r\u00e9compense, ouverte",
     "La feuille qui d\u00e9cide de l\u2019\u00e9change. \u00c0 z\u00e9ro point, le bouton nomme ce qu\u2019il manque.", ""),
    (CLUBBEUR, "05-carte", "Onglet 3", "La carte des clubs",
     "Les clubs autour de soi. La carte garde sa nuit d\u2019origine, sans lien avec le th\u00e8me clair de la boutique.", ""),
    (CLUBBEUR, "06-story", "Onglet 2", "Story",
     "L\u2019onglet qui d\u00e9pose une publication. Sans compte, il ne montre que sa porte.", "sans compte"),
    (CLUBBEUR, "07-amis", "Onglet 4", "Amis",
     "M\u00eame chose : le contenu vient du compte.", "sans compte"),
    (CLUBBEUR, "08-profil", "Onglet 5", "Profil",
     "M\u00eame chose. Les trois \u00e9crans qui manquent sont ceux qui parlent de la personne.", "sans compte"),
]


def mesurer(dossier, nom):
    """Les dimensions reelles du JPEG, pour que la figure reserve la bonne
    place avant que l'image arrive."""
    with open(os.path.join(dossier, nom + ".jpg"), "rb") as f:
        d = f.read()
    i = 2
    while i < len(d):
        if d[i] != 0xFF:
            i += 1
            continue
        if d[i + 1] in (0xC0, 0xC2):
            h, w = struct.unpack(">HH", d[i + 5:i + 9])
            return 'width="%d" height="%d"' % (w, h)
        i += 2 + struct.unpack(">H", d[i + 2:i + 4])[0]
    return ""


def img(dossier, nom):
    with open(os.path.join(dossier, nom + ".jpg"), "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode("ascii")


def figures(liste, ratio):
    out = []
    for dossier, nom, eyebrow, titre, note, marque in liste:
        tag = ('<span class="marque">' + marque + "</span>") if marque else ""
        # Un detail est une bande decoupee dans l'ecran : il garde ses
        # propres proportions et perd le rayon d'un cadre de telephone.
        est_detail = "-galerie-" in nom or "-detail" in nom
        dim = mesurer(dossier, nom) if est_detail else ratio
        classe = "cadre bande" if est_detail else "cadre"
        out.append(
            '        <figure class="ecran">\n'
            '          <button type="button" class="' + classe + '" data-titre="' + titre + '">\n'
            '            <img src="' + img(dossier, nom) + '" alt="' + titre + '" ' + dim + ' loading="lazy" />\n'
            "          </button>\n"
            "          <figcaption>\n"
            '            <p class="eyebrow">' + eyebrow + tag + "</p>\n"
            "            <h3>" + titre + "</h3>\n"
            '            <p class="note">' + note + "</p>\n"
            "          </figcaption>\n"
            "        </figure>"
        )
    return "\n".join(out)


PAGE = u"""<title>Noctify, \u00e9cran par \u00e9cran</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=DM+Mono:wght@400;500&display=swap" />
<style>
  /* Les jetons des applis elles-memes (club-app.html / app-preview.html) :
     une planche qui montre un produit se dessine dans la langue de ce
     produit, pas dans une palette de rapport. */
  :root {
    --fond:      #0d0a0a;
    --surface:   #16100e;
    --surface-2: #211815;
    --ligne:     rgba(255,235,220,.09);
    --ligne-2:   rgba(255,235,220,.17);
    --encre:     #f6f1ec;
    --encre-2:   #b6a99e;
    --encre-3:   #8a7a6e;
    --corail:    #ff2f45;
    --titre: "Archivo", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --sans: ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --mono: "DM Mono", ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  }
  /* Les deux applis sont nocturnes a la base : la planche l'est aussi.
     En theme clair, le fond devient du papier et les captures
     redeviennent ce qu'elles sont, des objets poses sur une planche. */
  :root[data-theme="light"] {
    --fond:      #ece6dd;
    --surface:   #f6f2eb;
    --surface-2: #e2d9cd;
    --ligne:     rgba(30,22,18,.13);
    --ligne-2:   rgba(30,22,18,.24);
    --encre:     #1a1411;
    --encre-2:   #574b44;
    --encre-3:   #82766d;
    --corail:    #c81f32;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --fond:      #ece6dd;
      --surface:   #f6f2eb;
      --surface-2: #e2d9cd;
      --ligne:     rgba(30,22,18,.13);
      --ligne-2:   rgba(30,22,18,.24);
      --encre:     #1a1411;
      --encre-2:   #574b44;
      --encre-3:   #82766d;
      --corail:    #c81f32;
    }
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fond); color: var(--encre);
    font-family: var(--sans); line-height: 1.6; -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 1200px; margin: 0 auto; padding: 40px 22px 80px; }

  /* ---- L'entete ---- */
  .tete { border-bottom: 1px solid var(--ligne); padding-bottom: 28px; }
  .logo {
    display: inline-flex; align-items: center; gap: 7px; margin-bottom: 22px;
    font-family: var(--titre); font-size: 14px; font-weight: 800; letter-spacing: -.02em;
  }
  .logo::after { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--corail); }
  .tete h1 {
    margin: 0; font-family: var(--titre); font-weight: 800;
    font-size: clamp(30px, 5.4vw, 48px); letter-spacing: -.043em; line-height: 1.01;
    text-wrap: balance;
  }
  .chapeau { margin: 15px 0 0; max-width: 60ch; font-size: 15.5px; color: var(--encre-2); }
  .meta {
    display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 24px 0 0;
    font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
    text-transform: uppercase; color: var(--encre-3);
  }
  .meta a { color: var(--encre-2); text-underline-offset: 3px; }
  .meta a:hover { color: var(--encre); }

  /* ---- Les deux applis ---- */
  .appli { margin-top: 64px; }
  .appli-tete { margin-bottom: 34px; }
  .appli-num {
    display: block; font-family: var(--mono); font-size: 10.5px; font-weight: 500;
    letter-spacing: .2em; text-transform: uppercase; color: var(--corail); margin-bottom: 10px;
  }
  .appli-tete h2 {
    margin: 0; font-family: var(--titre); font-size: clamp(22px, 3.4vw, 29px);
    font-weight: 800; letter-spacing: -.036em; line-height: 1.1;
  }
  .appli-tete p { margin: 10px 0 0; max-width: 58ch; font-size: 14px; color: var(--encre-2); }

  .groupe { margin-top: 34px; }
  .groupe-tete {
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
    padding-bottom: 12px; border-bottom: 1px solid var(--ligne); margin-bottom: 28px;
  }
  .groupe-tete h3 {
    margin: 0; font-family: var(--titre); font-size: 17px; font-weight: 700; letter-spacing: -.028em;
  }
  .groupe-tete p { margin: 0; flex: 1 1 20ch; font-size: 13px; color: var(--encre-3); line-height: 1.5; }
  .compte {
    font-family: var(--mono); font-size: 11px; letter-spacing: .1em;
    color: var(--encre-3); font-variant-numeric: tabular-nums;
  }

  /* ---- La grille d'ecrans ---- */
  .planche { display: grid; gap: 38px 24px; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); }
  .ecran { margin: 0; display: flex; flex-direction: column; gap: 13px; }
  /* Le cadre est un bouton : sur un telephone, la seule facon de lire
     une capture de telephone est de l'agrandir. */
  .cadre {
    display: block; width: 100%; padding: 0; border: 0; cursor: zoom-in;
    background: var(--surface-2); border-radius: 24px; overflow: hidden;
    box-shadow: 0 0 0 1px var(--ligne-2), 0 20px 40px -26px rgba(0,0,0,.8);
    transition: transform .18s cubic-bezier(.23,1,.32,1), box-shadow .18s ease;
  }
  .cadre img { display: block; width: 100%; height: auto; }
  /* Une bande decoupee dans l'ecran, pas un telephone : rayon court, et
     elle se cale en haut de sa case au lieu de l'occuper. */
  .cadre.bande { border-radius: 12px; align-self: start; }
  .cadre:hover { transform: translateY(-3px); box-shadow: 0 0 0 1px var(--ligne-2), 0 28px 50px -26px rgba(0,0,0,.85); }
  .cadre:focus-visible { outline: 2px solid var(--corail); outline-offset: 3px; }

  figcaption { display: flex; flex-direction: column; gap: 5px; }
  .eyebrow {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0;
    font-family: var(--mono); font-size: 10px; font-weight: 500;
    letter-spacing: .14em; text-transform: uppercase; color: var(--encre-3);
  }
  /* La marque d'un ecran qui ne montre pas la realite : elle porte le
     corail parce que c'est la seule chose de la planche qui doit
     arreter l'oeil. */
  .marque {
    padding: 2px 7px; border-radius: 999px; border: 1px solid var(--corail);
    color: var(--corail); letter-spacing: .05em; font-size: 9px; white-space: nowrap;
  }
  figcaption h3 {
    margin: 0; font-family: var(--titre); font-size: 14.5px; font-weight: 700;
    letter-spacing: -.022em; line-height: 1.2;
  }
  .note { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--encre-2); }

  /* ---- Ce que la planche ne montre pas ---- */
  .reserve {
    margin-top: 64px; padding: 24px 26px;
    background: var(--surface); border: 1px solid var(--ligne); border-radius: 18px;
  }
  .reserve h2 {
    margin: 0 0 14px; font-family: var(--mono); font-size: 10.5px; font-weight: 500;
    letter-spacing: .16em; text-transform: uppercase; color: var(--encre-3);
  }
  .reserve ul { margin: 0; padding-left: 18px; display: grid; gap: 11px; }
  .reserve li { font-size: 13.5px; color: var(--encre-2); line-height: 1.55; }
  .reserve b { color: var(--encre); font-weight: 700; }
  code {
    font-family: var(--mono); font-size: .9em; padding: 1px 5px; border-radius: 5px;
    background: var(--surface-2); color: var(--encre); overflow-wrap: anywhere;
  }

  /* ---- L'agrandissement ---- */
  .loupe {
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center;
    padding: 18px; background: rgba(8,5,5,.93); cursor: zoom-out;
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  }
  .loupe[hidden] { display: none !important; }
  .loupe img {
    max-width: min(100%, 400px); max-height: calc(100% - 40px); width: auto; height: auto;
    border-radius: 26px; box-shadow: 0 0 0 1px rgba(255,235,220,.18), 0 40px 80px -30px #000;
  }
  .loupe p {
    position: absolute; left: 0; right: 0; bottom: 16px; margin: 0; text-align: center;
    font-family: var(--mono); font-size: 11px; letter-spacing: .12em;
    text-transform: uppercase; color: #b6a99e;
  }

  @media (prefers-reduced-motion: reduce) {
    .cadre { transition: none; }
    .cadre:hover { transform: none; }
  }
</style>

<div class="page">
  <header class="tete">
    <p class="logo">Noctify</p>
    <h1>Les deux applis, \u00e9cran par \u00e9cran</h1>
    <p class="chapeau">
      Celle du g\u00e9rant de club et celle du clubbeur, c\u00f4te \u00e0 c\u00f4te. Captures prises sur
      la production, pas en local \u2014 c\u2019est le code qui tourne en ce moment. Touche
      une capture pour l\u2019agrandir.
    </p>
    <p class="meta">
      <span>5 septembre 2026</span>
      <span>22 \u00e9crans</span>
      <a href="https://viralnight-koif.vercel.app/club-app.html">club-app</a>
      <a href="https://viralnight-koif.vercel.app/app-preview.html?app=1">app-preview</a>
    </p>
  </header>

  <div class="appli">
    <div class="appli-tete">
      <span class="appli-num">Appli 1 sur 2</span>
      <h2>C\u00f4t\u00e9 g\u00e9rant</h2>
      <p>
        Ce que voit le patron du club : ce que son affiche g\u00e9n\u00e8re, ce qu\u2019il donne en
        \u00e9change, ce qu\u2019il r\u00e8gle. Refaite le 5 septembre. Une seule palette, claire \u2014
        le contraste vient des objets, pas du fond.
      </p>
    </div>

    <div class="groupe">
      <div class="groupe-tete">
        <h3>L\u2019installation</h3>
        <span class="compte">6 \u00e9crans</span>
        <p>Une seule fois, \u00e0 la premi\u00e8re ouverture. Chaque \u00e9cran \u00e9crit dans ce que les onglets montrent d\u00e9j\u00e0.</p>
      </div>
      <div class="planche">
__INSTALLATION__
      </div>
    </div>

    <div class="groupe">
      <div class="groupe-tete">
        <h3>L\u2019appli</h3>
        <span class="compte">3 onglets</span>
        <p>Regarder, vendre, r\u00e9gler. Le bar\u00e8me et le QR vivent dans les R\u00e9glages, \u00e0 un geste de l\u00e0.</p>
      </div>
      <div class="planche">
__CLUB_APPLI__
      </div>
    </div>
  </div>

  <div class="appli">
    <div class="appli-tete">
      <span class="appli-num">Appli 2 sur 2</span>
      <h2>C\u00f4t\u00e9 clubbeur</h2>
      <p>
        Ce que voit le client du club : il scanne, il poste, il cumule, il \u00e9change.
        Non touch\u00e9e aujourd\u2019hui \u2014 elle est ici pour la comparaison.
      </p>
    </div>

    <div class="groupe">
      <div class="groupe-tete">
        <h3>L\u2019appli</h3>
        <span class="compte">5 onglets</span>
        <p>R\u00e9compenses, Story, Carte, Amis, Profil. Les trois derniers demandent un compte.</p>
      </div>
      <div class="planche">
__CLUBBEUR__
      </div>
    </div>
  </div>

  <div class="reserve">
    <h2>Ce que ces captures ne montrent pas</h2>
    <ul>
      <li><b>Trois \u00e9crans clubbeur manquent : Story, Amis, Profil.</b> Ils ne se remplissent qu\u2019avec un compte, et je n\u2019en cr\u00e9e pas. R\u00e9compenses et Carte se lisent, elles, avec la cl\u00e9 publique. Pour les trois autres : soit tu me passes un compte de test, soit on lance <code>06-pwa-clubbeurs/outils/parcours_clubbeur.cjs</code>, qui fabrique un compte jetable et le nettoie.</li>
      <li><b>Les chiffres du c\u00f4t\u00e9 g\u00e9rant sont ceux de la d\u00e9monstration.</b> Sans session, l\u2019appli retombe sur un club fictif \u2014 Mirage Club Brussels, 249 480 abonn\u00e9s touch\u00e9s. Un vrai club voit les siens.</li>
      <li><b>L\u2019\u00e9cran 06 de l\u2019installation est vide.</b> L\u2019affiche A4 et le bilan se fabriquent \u00e0 partir du club connect\u00e9.</li>
      <li><b>Les photos de l\u2019\u00e9tape 02 sont des exemples.</b> Ce sont les deux images d\u2019ambiance du d\u00e9p\u00f4t, pos\u00e9es l\u00e0 pour montrer la forme de l\u2019\u00e9cran une fois rempli.</li>
      <li><b>La galerie attend sa migration.</b> <code>supabase/migrations/202609050001_photos_du_club.sql</code>, \u00e0 passer \u00e0 la main dans l\u2019\u00e9diteur SQL Supabase : <code>npm run db:apply</code> ne rejoue que <code>SETUP_COMPLET.sql</code>. Sans elle, la fiche s\u2019enregistre sans les photos plut\u00f4t que d\u2019\u00e9chouer.</li>
      <li><b>C\u00f4t\u00e9 g\u00e9rant, tout est clair.</b> Le sombre a \u00e9t\u00e9 essay\u00e9 deux fois dans la journ\u00e9e \u2014 sur toute l\u2019appli, puis sur le seul parcours \u2014 et les deux fois tu es revenu au blanc. Ce qui porte le contraste maintenant, c\u2019est un objet sombre par \u00e9cran : la carte du chiffre principal, le bouton d\u2019action. Jamais deux. C\u00f4t\u00e9 clubbeur, c\u2019est encore l\u2019inverse : sombre partout sauf l\u2019onglet principal.</li>
    </ul>
  </div>
</div>

<div class="loupe" id="loupe" hidden>
  <img id="loupe-img" src="" alt="" />
  <p id="loupe-txt"></p>
</div>

<script>
  (function () {
    var loupe = document.getElementById("loupe");
    var image = document.getElementById("loupe-img");
    var texte = document.getElementById("loupe-txt");

    document.querySelectorAll(".cadre").forEach(function (bouton) {
      bouton.addEventListener("click", function () {
        var src = bouton.querySelector("img");
        image.src = src.src;
        image.alt = src.alt;
        texte.textContent = bouton.dataset.titre;
        loupe.hidden = false;
        document.body.style.overflow = "hidden";
      });
    });

    function fermer() {
      loupe.hidden = true;
      image.removeAttribute("src");
      document.body.style.overflow = "";
    }
    loupe.addEventListener("click", fermer);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !loupe.hidden) fermer();
    });
  })();
</script>
"""

page = (PAGE
        .replace("__INSTALLATION__", figures(INSTALLATION, 'width="360" height="760"'))
        .replace("__CLUB_APPLI__", figures(CLUB_APPLI, 'width="360" height="760"'))
        .replace("__CLUBBEUR__", figures(CLUBBEUR_APPLI, 'width="390" height="844"')))
io.open(OUT, "w", encoding="utf-8").write(page)
print("planche ecrite :", OUT, round(os.path.getsize(OUT) / 1024), "Ko")
