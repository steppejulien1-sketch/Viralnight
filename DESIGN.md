# Design

<!-- impeccable:design-schema 1 -->

## World

La boutique de la PWA clubbeur (`app-preview.html`, `#vue-boutique`)
suit désormais une vraie référence externe que Julien a fournie en
capture d'écran : **Pad'up**, une appli de réservation de terrains de
padel — fond clair, cartes blanches avec vraie photo pleine largeur,
boutons noirs en pilule, badges pilule blanche à texte gras posés sur
les photos, beaucoup d'espace blanc. Consigne explicite : "inspire-toi
de ce qu'il a fait".

Thèse actuelle : une grille de cartes blanches sur fond gris très
clair (`#f5f5f7`), chaque carte avec une vraie photo en haut (pas une
icône), un prix en pilule blanche posée sur la photo, et un bouton
d'échange en pilule noire pleine largeur — le même vocabulaire que les
cartes "club" et les boutons "Rejoindre" de Pad'up. Le thème vit dans
la classe `.screen.boutique-pro`, posée uniquement sur l'écran
boutique par `activerVue()` — l'écran carte garde sa propre nuit
(ciel, arbres, halo), sans lien avec ce thème clair.

Le corail (`--accent`) redevient réservé aux points/prix, jamais aux
boutons (`--bouton` est noir) : c'est un retour à la règle d'origine
du projet (voir `PRODUCT.md`, `CLAUDE.md` §6), pas une nouvelle
exception — la piste précédente (corail partout, y compris les CTA)
avait été un changement assumé mais temporaire.

### Historique des directions essayées (par ordre, toutes remplacées)

1. **Pochette de disque / vinyle** — noir brun-laiton, cadran ambre
   circulaire, catalogue façon matrice de disque. Rejetée : "trop
   alcoolisée".
2. **Cali clair v2** — fond `#fafafa`, grille de cartes, corail en CTA
   et en indicateur de points (prompt repris d'une conversation Claude
   web citant Airbnb/Spotify/Discord/Figma/Twitch). Structure jugée
   bonne, fond rejeté.
3. **Noir neutre** — même structure de grille, palette recolorée en
   noir neutre (`#0d0e11`, ni bleuté ni brun). Un dégradé radial de
   profondeur ajouté puis retiré aussitôt ("trop ambiance", pas assez
   pro). Rejetée à son tour : trop sombre pour l'usage voulu.
4. **Clair "pro" (Pad'up)** — direction actuelle, voir World ci-dessus.

Éléments retirés en cours de route, sans lien avec la palette :
- **Cadran circulaire du solde** (anneau SVG, label "Ma cagnotte",
  cumul du mois, objectif vers la prochaine récompense) : a traversé
  plusieurs palettes sans changer de forme, puis jugé inutile et
  "bizarre" d'un coup. Remplacé par un simple chiffre (`.solde`).
- **Badges de rareté** ("Rare"/"Légendaire" dérivés du prix) : essayés
  puis retirés, jugés "éclatés".
- **Offre du soir en ligne "tracklist"** (`.ligne`/`.liste`, partagée
  avec l'ancien catalogue) : détonnait à côté de la grille de cartes
  ("pas fou"). Devenue `.offre-hero`, structurée comme les autres
  cartes (photo + corps blanc + pilule).
- **Teinte colorée sur les photos** (`mix-blend-mode: color`) : essayée
  pour unifier photo et palette, retirée — la référence Pad'up garde
  ses photos telles quelles, sans filtre couleur.

## Palette

- `--bg` #f5f5f7 (fond de page), `--s1` #ffffff (cartes), `--s2`
  #f0f0f2, `--s3` #e7e7ea — gris très clair à blanc, jamais de noir
  (deux directions sombres déjà essayées et rejetées).
- `--ink` #16171c / `--ink2` #6b6f76 / `--ink3` #9a9ea5 — noir doux
  puis gris sur fond clair (voir piège ci-dessous : `.sheet` ne reçoit
  rien de ce token par héritage automatique, il faut l'écrire).
- `--accent` / `--ambre` (corail) #ff6b5b — **réservé aux points et
  aux prix**, jamais à un bouton. Utilisé sur le solde et les pilules
  de prix.
- `--bouton` #16171c (quasi noir) — couleur de tous les CTA pleins
  (`.sheet-cta`, `.cta-visuelle`, pilule de filtre actif). Distinct de
  `--accent` pour que la boutique puisse avoir des boutons noirs sans
  toucher à la couleur des prix ailleurs dans l'appli ; vaut
  `var(--accent)` par défaut (voir `:root .screen`), donc la fiche
  club de l'écran carte garde son bouton corail sans rien changer.
- Le QR code d'un bon reste blanc à modules sombres, quel que soit le
  thème : contrainte de scannabilité, pas un choix esthétique.

## Typography

Pas de police d'affichage ajoutée — Inter (déjà chargée) partout.
Deux registres :
- Titres et corps : Inter, poids et tracking normaux.
- `var(--mono)` (pile système) pour les numéros de catalogue, les
  prix et les codes de bons — la donnée/mesure, jamais un habillage
  "technique".

## Components

- **Solde** (`.solde`) : juste le nombre de points en corail, gros,
  plus "pts". Pas d'anneau, pas de label, pas d'objectif — retiré
  après que Julien l'a trouvé inutile.
- **Carte récompense** (`.carte-reco`, grille `.grille`) : photo
  carrée pleine largeur en haut (`.photo`, vraie photo ou repli SVG
  `art()`), pilule de prix blanche posée en bas à gauche de la photo
  (`.prix-pastille`), puis en dessous sur fond blanc : titre, numéro
  de catalogue, et un bouton d'échange en pilule noire pleine largeur
  (`.cta-visuelle` — texte seul, pas un `<button>` imbriqué : toute la
  carte est le bouton cliquable qui ouvre la fiche détail). États
  `.loin`/`.epuise` : la pilule passe en gris avec le texte adapté
  ("Encore N pts" / "Épuisé").
- **Bannière de l'offre du soir** (`.offre-hero`) : même famille que
  `.carte-reco` — photo 16:9 en haut avec badge "Offert" en pilule
  blanche, corps blanc en dessous (titre, description, prix barré,
  pilule noire).
- **Illustration photo** (`.foto`, `FOTOS` en JS) : remplace le dessin
  vectoriel fait main pour les objets identifiables (cocktail,
  bouteille, shot, cordon VIP, tickets) — jugé "IA dégueulasse" par
  Julien. Photos Unsplash (licence libre, vérifiées une par une avant
  intégration), affichées telles quelles, sans filtre de teinte. Le
  dessin vectoriel (`art()`) reste le repli pour les objets sans photo
  (`FOTOS[nomDeLaFonctionArt]`).
- **Numéro de catalogue** (`.code`, `.sheet-fam`) : `PREFIXE·NNN` (3
  lettres du club via `prefixeClub()` + ordinal). Assigné une fois au
  chargement, stable au filtrage.
- **Confettis de confirmation** (`confettis()` en JS) : six éclats
  colorés au moment de l'échange, une fois, jamais en boucle ; coupés
  sous `prefers-reduced-motion`.
- **Jeton** (`jeton()` en JS) : mini-disque (anneau sombre, label
  ambre, trou de spindle). Détail hérité de l'ancienne direction non
  recoloré — impact mineur, à revoir si Julien le signale.

## Patterns

- Les prix/points sont toujours en corail (`var(--accent)`) ; les
  boutons d'action sont toujours en noir (`var(--bouton)`) — les deux
  rôles ne se mélangent jamais, contrairement à la version précédente
  qui les avait volontairement confondus.
- Le stock ne s'affiche que sous 5 unités ("plus que N") — au-dessus,
  silence plutôt que "il en reste 50" qui ne crée aucune urgence.
- Le catalogue vient de la vraie table `rewards` via
  `/api/rewards-public` ; aucune donnée inventée quand le club n'a
  rien configuré (liste vide honnête).
- Le thème boutique (`.screen.boutique-pro`) n'est posé que sur
  `#vue-boutique` par `activerVue()` — jamais sur l'écran carte.

## Piège rencontré

`.sheet h3` (titre de la fiche récompense) n'avait pas de `color`
explicite : il héritait du blanc cassé de la page (`--page-ink`) au
lieu du `--ink` de l'écran, invisible une fois le fond de la fiche
passé au blanc. Corrigé en fixant `color: var(--ink)` sur `.sheet` et
`.sheet h3`. À vérifier sur tout nouveau texte ajouté dans `.sheet` :
`.sheet` n'est pas un enfant de `.app`, donc rien n'y hérite
automatiquement du texte de l'écran boutique.

## What not to change

- Ne pas réintroduire un fond sombre sur `#vue-boutique` sans un
  signal explicite de Julien : trois directions différentes (brun,
  noir neutre) ont déjà été essayées et abandonnées avant celle-ci.
- Ne pas remettre le corail sur un bouton d'action dans la boutique :
  la règle "corail = prix/points, noir = bouton" vient d'un vrai
  revirement, pas d'un oubli.
- Ne pas recolorer l'écran carte (`#vue-carte`) : sa nuit (ciel,
  arbres, étoiles) est une identité à part, jamais concernée par les
  changements de palette de la boutique.

<!--
IMPECCABLE PROCESS NOTE (a lire par une future session) : plusieurs
passes successives sur cet ecran ont saute le rendu de comparaison
visuelle (visualize.md) et la page de decision interactive
(serve-question.mjs) — l'utilisateur a enchaine les revirements de
direction en conversation ("je te fais confiance" au debut, puis
plusieurs consignes directes reprenant des briefs externes, puis une
capture d'ecran de reference concrete). La revue de finition et cette
documentation ont ete faites en ligne, sans les sous-agents dedies du
skill (non enregistres dans ce harnais). A la prochaine session,
/impeccable doctor peut signaler cet ecart de process ; ce n'est pas
une erreur, c'est une substitution assumee et documentee ici.
-->
