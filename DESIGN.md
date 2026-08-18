# Design

<!-- impeccable:design-schema 1 -->

## World

La boutique de la PWA clubbeur (`app-preview.html`) est une pochette de
disque, pas un dashboard : chaque récompense est cataloguée comme un
titre sur un vinyle (numéro de référence façon matrice de disque), le
solde de points se lit comme un compteur à lampes (cadran ambre
circulaire), jamais comme une carte "gros chiffre + barre de
progression" générique.

Direction choisie via le tirage du skill Impeccable (`concept-seed.mjs
--scope direction --mode operate`, seed `c3276dbf`, index assigné 4) :
monde vinyle/label de disque, fusionné avec le grain "tube à lampes"
(nixie) d'un challenger dealé pour le rendu des chiffres.

Cette direction remplace trois tentatives précédentes explicitement
rejetées comme "trop IA" : photos de banque d'images, icônes plates
génériques, palette froide (#08090c). Le noir bleuté et la barre de
progression plate sont désormais l'anti-référence de cet écran.

## Palette

- `--bg` #120d0d, `--s1` #1c1512, `--s2` #261c17, `--s3` #30231c —
  noir chaud (bois/laiton), jamais de gris bleuté.
- `--ambre` #ffb020 — réservé à toute quantité de points (cagnotte,
  prix, "encore/manque", gains, pastille carte). Jamais utilisé pour
  autre chose.
- `--accent` (corail) #ff2f45 — réservé au seul bouton d'action
  (Échanger). Jamais un badge plein, jamais une quantité.
- `--ink`/`--ink2`/`--ink3` — blanc puis gris chauds (jamais bleu-gris).

Règle stricte héritée du dashboard B2B : le corail est une couleur de
marque/action, jamais décorative ni répétée ailleurs.

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
  périmètre fixe `PERIMETRE_CADRAN = 276.5` pour r=44), chiffre ambre
  tabulaire au centre. Anime au changement de solde
  (`.cadran-centre b.maj`).
- **Visuel circulaire** (`.visuel`, `.sheet-visuel`) : label de disque
  — anneau via `box-shadow` inset double, dessin au centre (66% pour
  la liste, 58% pour la fiche). Remplace l'ancien cadre carré arrondi.
- **Numéro de catalogue** (`.ligne-txt .court`, `.sheet-fam`) :
  `PREFIXE·NNN` (3 lettres du club, dérivées de son nom via
  `prefixeClub()`, + ordinal). Assigné une fois au chargement, stable
  au filtrage.
- **Jeton** (`jeton()` en JS) : mini-disque (anneau sombre, label
  ambre, trou de spindle) — plus une pièce à étoile.

## Patterns

- Toute quantité de points s'affiche en `var(--ambre)`, `var(--mono)`,
  `font-variant-numeric: tabular-nums`.
- Le stock ne s'affiche que sous 5 unités ("plus que N", en ambre) —
  au-dessus, silence plutôt que "il en reste 50" qui ne crée aucune
  urgence.
- Le catalogue vient de la vraie table `rewards` via
  `/api/rewards-public` ; aucune donnée inventée quand le club n'a
  rien configuré (liste vide honnête).

## What not to change

Ne jamais réintroduire une carte icône-carré + texte-gris générique,
une barre de progression plate, ou une deuxième couleur pour les
quantités de points : c'est exactement le motif que trois itérations
précédentes ont essayé et que l'utilisateur a rejeté.

<!--
IMPECCABLE PROCESS NOTE (a lire par une future session) : cette passe
a saute le rendu de comparaison visuelle (visualize.md) et la page de
decision interactive (serve-question.mjs) — l'utilisateur a explicitement
demande de proceder sans interruption ("je te fais confiance"). La revue
de finition et cette documentation ont ete faites en ligne, sans les
sous-agents dedies du skill (non enregistres dans ce harnais). A la
prochaine session, /impeccable doctor peut signaler cet ecart de process ;
ce n'est pas une erreur, c'est une substitution assumee et documentee ici.
-->
