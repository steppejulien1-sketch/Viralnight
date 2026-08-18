# Design

<!-- impeccable:design-schema 1 -->

## World

**Mise à jour (19 août 2026) : troisième palette pour cet écran.** La
direction "pochette de disque" a été rejetée en premier, remplacée par
un brief clair/Cali ("prompt v2", Airbnb/Spotify/Discord/Figma/Twitch)
dont la structure (grille de cartes, corail en CTA et en indicateur de
points) a été jugée bonne — mais Julien a ensuite demandé explicitement
un fond noir. La grille de cartes reste ; seule la palette change à
nouveau, vers un noir neutre (pas un retour au brun/laiton de la toute
première version).

Thèse actuelle : la boutique de la PWA clubbeur (`app-preview.html`,
`#vue-boutique`) est une grille de cartes sur fond noir neutre — chaque
récompense a sa propre carte avec icône sur aplat pastel vif (qui
ressort d'autant plus sur le noir), titre, prix corail en gros. Le
thème vit dans la classe `.screen.boutique-sombre`, posée uniquement
sur l'écran boutique par `activerVue()` — l'écran carte garde sa
propre nuit (ciel, arbres, halo), sans lien avec ce noir-ci : les deux
noirs ne partagent aucune règle, ce sont deux identités différentes.

*Étapes abandonnées (traces historiques) :*
- *Pochette de disque, catalogue façon matrice de vinyle, cadran ambre
  circulaire — direction tirée via le skill Impeccable
  (`concept-seed.mjs --scope direction --mode operate`, seed
  `c3276dbf`, index 4), qui remplaçait elle-même trois tentatives
  antérieures rejetées comme "trop IA" (photos de banque d'images,
  icônes plates génériques, palette froide #08090c). Rejetée à son
  tour comme "trop alcoolisée".*
- *Fond clair `#fafafa` (v2 Cali) : structure conservée, fond rejeté.*

La forme du cadran circulaire (`.cadran`) traverse les trois versions
sans changer — seule sa palette est recolorée à chaque fois.

## Palette

- `--bg` #0d0e11, `--s1` #17181c, `--s2` #1e2025, `--s3` #26282e — noir
  neutre (ni bleuté, ni brun/laiton — les deux ont déjà été rejetés).
- `--accent` (corail) #ff6b5b, aussi assigné à `--ambre` : **le corail
  porte à la fois les points ET les boutons d'action.** Ceci renverse
  la règle du dashboard B2B ("corail = marque, jamais une quantité"),
  sur demande explicite de Julien reprenant un brief externe —
  changement assumé, pas un oubli. Cette règle inversée ne vaut que
  pour `#vue-boutique` ; `app.html` garde sa règle d'origine (voir
  `CLAUDE.md` §6).
- `--ink` #f4f5f7 / `--ink2` #9aa0ab / `--ink3` #6b7078 — blanc cassé
  puis gris neutres sur fond noir (voir piège ci-dessous : `.sheet` ne
  reçoit rien de ce token par héritage automatique, il faut l'écrire).
- Pastilles d'icône par famille : bar `#ffece0`, accès `#fdeaf1`, vip
  `#eef0fe` — restées pastel/claires à dessein : sur le fond noir, ce
  sont des pavés de couleur qui ressortent, pas un halo qui se fond.
- Le QR code d'un bon reste blanc à modules sombres, quel que soit le
  thème : c'est une contrainte de scannabilité, pas un choix
  esthétique. Le cadre autour (`.qr-frame`, `--s2`) porte tout le
  travail de contraste avec le fond.

## Typography

Pas de police d'affichage ajoutée — Inter (déjà chargée) partout.
Deux registres :
- Titres et corps : Inter, poids et tracking normaux.
- "Impression de pochette" : `var(--mono)` (pile système), petites
  capitales tracées, pour les numéros de catalogue, les chiffres de
  points et les codes de bons. Le monospace sert exclusivement à la
  mesure/donnée, jamais de costume "technique".

## Components

- **Cadran (cagnotte)** : anneau SVG (stroke-dasharray/dashoffset,
  périmètre fixe `PERIMETRE_CADRAN = 276.5` pour r=44), chiffre corail
  tabulaire au centre. Forme conservée depuis la toute première
  direction, glow et pulse retirés (`.cadran-valeur` sans `filter`,
  `.cadran-centre b.maj` sans animation) — les effets "néon"
  appartenaient à l'ancienne palette vinyle.
- **Carte récompense** (`.carte-reco`, grille `.grille`) : surface en
  léger dégradé (`--s2` → `--s1`, pas un aplat plat), icône dans une
  pastille pastel par famille (`.visuel-badge`, couleur via `--tinte`),
  titre, numéro de catalogue, prix corail en gros, état visuel
  `.loin`/`.epuise`. Au survol : légère montée + `scale(1.015)` + ombre
  qui se creuse. Remplace l'ancienne ligne "tracklist" (`.ligne`) pour
  le catalogue ; l'offre du soir garde la ligne horizontale (une seule
  entrée, pas besoin de grille).
- **Palier de rareté** (`.palier`, `tierDe()` en JS) : badge discret
  ("Rare" dès 500 pts, "Légendaire" dès 1500 pts), dérivé du prix —
  le gérant ne configure jamais de niveau, juste un coût. Volontairement
  absent sous 500 pts : même logique de silence sélectif que le stock
  (`.reste`), pour ne pas étiqueter tout le catalogue.
- **Confettis de confirmation** (`confettis()` en JS) : six éclats
  colorés qui partent du rond de succès à l'échange, une fois,
  jamais en boucle ; coupés sous `prefers-reduced-motion`.
- **Visuel circulaire** (`.visuel`, `.sheet-visuel`) : anneau via
  `box-shadow` inset double, dessin au centre. Conservé tel quel ;
  seul le fallback de couleur change (`#ffffff` en thème clair au
  lieu du brun sombre `#14100e`).
- **Numéro de catalogue** (`.code` dans `.carte-reco`, `.sheet-fam`) :
  `PREFIXE·NNN` (3 lettres du club, dérivées de son nom via
  `prefixeClub()`, + ordinal). Assigné une fois au chargement, stable
  au filtrage.
- **Jeton** (`jeton()` en JS) : mini-disque (anneau sombre, label
  ambre, trou de spindle). Détail hérité de l'ancienne direction non
  encore recolorié — visible en petit format (pastille carte), impact
  mineur, à revoir si Julien le signale.

## Patterns

- Toute quantité de points et tout bouton d'action s'affichent en
  `var(--accent)` (= `var(--ambre)` en thème clair, les deux pointent
  vers le même corail #ff6b5b) — **changement volontaire** par rapport
  à la règle du dashboard B2B, qui elle continue de réserver le corail
  à l'action seule.
- Le stock ne s'affiche que sous 5 unités ("plus que N") — au-dessus,
  silence plutôt que "il en reste 50" qui ne crée aucune urgence.
- Le catalogue vient de la vraie table `rewards` via
  `/api/rewards-public` ; aucune donnée inventée quand le club n'a
  rien configuré (liste vide honnête).
- Le thème clair (`.screen.clair`) n'est posé que sur `#vue-boutique`
  par `activerVue()` — jamais sur l'écran carte, qui garde son
  ambiance nocturne d'origine.

## Piège rencontré

`.sheet h3` (titre de la fiche récompense) n'avait pas de `color`
explicite : il héritait du blanc cassé de la page (`--page-ink`) au
lieu du `--ink` de l'écran, invisible une fois le fond de la fiche
passé au blanc. Corrigé en fixant `color: var(--ink)` sur `.sheet` et
`.sheet h3`. À vérifier sur tout nouveau texte ajouté dans `.sheet` :
`.sheet` n'est pas un enfant de `.app`, donc rien n'y hérite
automatiquement du texte de l'écran boutique.

## What not to change

- Ne jamais réintroduire un fond sombre/brun sur `#vue-boutique` : deux
  directions distinctes ont déjà été essayées et rejetées ("trop IA"
  pour la première, "trop alcoolé" pour la seconde).
- Ne jamais recolorer l'écran carte (`#vue-carte`) en thème clair : sa
  nuit (ciel, arbres, étoiles) est une identité à part, non concernée
  par ce changement.

<!--
IMPECCABLE PROCESS NOTE (a lire par une future session) : cette passe
et la precedente (theme sombre vinyle/nixie) ont saute le rendu de
comparaison visuelle (visualize.md) et la page de decision interactive
(serve-question.mjs) — l'utilisateur a explicitement demande de
proceder sans interruption ("je te fais confiance", puis un revirement
complet de direction sur instruction directe reprenant un brief
externe). La revue de finition et cette documentation ont ete faites
en ligne, sans les sous-agents dedies du skill (non enregistres dans
ce harnais). A la prochaine session, /impeccable doctor peut signaler
cet ecart de process ; ce n'est pas une erreur, c'est une substitution
assumee et documentee ici.
-->
