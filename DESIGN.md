# Design

<!-- impeccable:design-schema 1 -->

## World

**Mise à jour (18-19 août 2026) : la direction "pochette de disque"
ci-dessous a été remplacée.** Julien a rejeté cette piste après coup
et a redirigé vers une conversation Claude web où il avait déjà
travaillé un brief détaillé ("prompt v2") citant Airbnb, Spotify,
Discord, Figma et Twitch comme références — grille de cartes claires,
pas de dashboard sombre. Ce brief prime désormais sur la thèse
vinyle/nixie décrite plus bas, conservée uniquement comme trace
historique de ce qui a été essayé et écarté.

Nouvelle thèse : la boutique de la PWA clubbeur (`app-preview.html`,
`#vue-boutique`) est une grille de cartes lumineuses — chaque
récompense a sa propre carte avec icône sur aplat pastel, titre, prix
en gros, plutôt qu'une ligne de "tracklist" sombre. Le thème clair vit
dans la classe `.screen.clair`, posée uniquement sur l'écran boutique
par `activerVue()` — l'écran carte garde sa nuit (ciel, arbres, halo)
sans aucune modification.

*Ancienne thèse (abandonnée) : pochette de disque, catalogue façon
matrice de vinyle, cadran ambre circulaire pour la cagnotte — direction
tirée via le skill Impeccable (`concept-seed.mjs --scope direction
--mode operate`, seed `c3276dbf`, index 4), qui remplaçait elle-même
trois tentatives antérieures rejetées comme "trop IA" (photos de
banque d'images, icônes plates génériques, palette froide #08090c).
La forme du cadran circulaire (`.cadran`) est réutilisée telle quelle
dans la nouvelle direction — seule sa palette change.*

## Palette

- `--bg` #fafafa, `--s1` #ffffff, `--s2` #f6f6f7, `--s3` #eeeeef —
  quasi blanc, jamais de noir/brun "alcoolé" (rejeté explicitement).
- `--accent` (corail) #ff6b5b, aussi assigné à `--ambre` en theme
  clair : **le corail porte maintenant à la fois les points ET les
  boutons d'action.** Ceci renverse la règle précédente ("corail =
  marque, jamais une quantité") sur demande explicite de Julien
  reprenant son brief externe — changement assumé, pas un oubli.
  Cette règle inversée ne vaut que pour `#vue-boutique` ; le dashboard
  B2B (`app.html`) garde sa règle d'origine (voir `CLAUDE.md` §6).
- `--ink` #1f2937 / `--ink2` #6b7280 / `--ink3` #98a0ab — gris neutres
  sur fond clair (jamais de blanc-sur-blanc : voir piège ci-dessous).
- Pastilles d'icône par famille : bar `#ffece0`, accès `#fdeaf1`, vip
  `#eef0fe` — aplat léger derrière chaque dessin, pas de halo sombre.

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
  tabulaire au centre. Forme conservée de l'ancienne direction, glow
  et pulse retirés en thème clair (`.screen.clair .cadran-valeur`
  n'a plus de `filter`, `.cadran-centre b.maj` n'a plus d'animation) —
  les effets "néon" appartenaient à l'ancienne palette sombre.
- **Carte récompense** (`.carte-reco`, grille `.grille`) : icône dans
  une pastille pastel par famille (`.visuel-badge`, couleur via
  `--tinte`), titre, numéro de catalogue, prix corail en gros, état
  visuel `.loin`/`.epuise`. Remplace l'ancienne ligne "tracklist"
  (`.ligne`) pour le catalogue ; l'offre du soir garde la ligne
  horizontale (une seule entrée, pas besoin de grille).
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
