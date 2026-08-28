# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Deux publics distincts, deux surfaces distinctes :

1. **Le gérant de club** (`app.html` et le reste du dashboard B2B) — patron ou
   manager d'une boîte de nuit, pas un profil technique. Consulte son
   tableau de bord depuis un bureau ou une tablette, en horaires de bureau,
   pour configurer ses récompenses et lire ses statistiques de soirée.
2. **Le clubbeur** (PWA client final, dont l'écran boutique) — 20-30 ans,
   sur son téléphone, **dans le club, la nuit, en soirée** : lumière basse,
   une main occupée (verre, téléphone de l'autre), attention fragmentée
   par la musique et les gens autour, luminosité d'écran poussée au max,
   parfois un peu alcoolisé. Ouvre l'appli entre deux moments, pas assis
   à un bureau. *(Scène déduite du produit et des échanges de conception ;
   non confirmée mot pour mot par un entretien utilisateur.)*

## Product Purpose

Noctify fait gagner en visibilité les boîtes de nuit via leurs propres
clients : le clubbeur scanne un QR code sur place, publie une story/Reel/
TikTok taguant le club, gagne des points selon les vues générées, et
échange ces points contre de vraies récompenses (boisson, entrée,
coupe-file, table VIP) directement au bar ou à l'entrée. Le club, lui,
suit les vues générées, les points distribués, le coût par récompense et
l'impact sur son remplissage — sans avoir à gérer ça manuellement.

## Positioning

Un concurrent ne peut pas copier-coller la mécanique : ce n'est pas un
programme de fidélité générique (tampons, cagnotte passive), c'est un
échange direct — *ta publication mesurée en vues devient des points, tes
points s'échangent contre quelque chose de réel ce soir-là*, validé sur
place par le staff du club, pas par une carte de fidélité qu'on oublie
dans un tiroir.

## Operating Context

- Le clubbeur scanne un QR affiché dans le club (vestiaire, bar, entrée),
  publie, revient dans l'appli quelques minutes ou heures plus tard pour
  voir ses points, et échange dans la même soirée le plus souvent — les
  récompenses et bonus sont pensés "ce soir", pas "ce mois-ci".
- L'échange se valide physiquement : le clubbeur montre un code/QR au
  staff (bar ou entrée), qui le scanne ou le lit à voix haute dans le
  bruit — d'où l'alphabet du code sans caractères ambigus (0/O, 1/I).
- Le gérant configure son barème de points et ses récompenses (nom, seuil
  en points, stock, famille bar/accès/VIP) depuis son dashboard, en
  dehors des heures de service.
- Un seul vrai club existe aujourd'hui en production : **Mirage**
  (Bruxelles), avec 4 récompenses réelles configurées.

## Capabilities and Constraints

- Vite multi-pages, JS natif en modules ES — pas de framework front, pas
  de TypeScript. Deux bases Supabase distinctes (dashboard B2B / PWA
  clubbeur historique).
- Sécurité non négociable : les routes API utilisent `service_role`, donc
  l'`establishment_id` est toujours redéduit de la session ou du code
  public — jamais lu depuis le corps ou l'URL de la requête.
- Le catalogue de récompenses de la boutique vient réellement de la table
  `rewards` (nom + seuil + stock + famille), via une route publique
  dédiée. Le gérant ne rédige ni description ni règles détaillées — la
  boutique les complète elle-même de façon honnête et générique.
- Le corail (`#ff6363`) est la couleur de marque Noctify — jamais un
  bouton d'action, contrainte déjà en vigueur côté dashboard B2B.

## Brand Commitments

- Nom : Noctify.
- Le dashboard B2B (gérant) vise délibérément Stripe/Linear/Vercel :
  sombre, premium, crédible en B2B, sans néon ni "boîte de nuit cheap".
  Cette règle est documentée et ferme pour cette surface-là.
- La PWA clubbeur (boutique, carte) est une surface différente, plus
  jeune de ton, mais hérite de l'interdit sur le "néon partout" et le
  cliché boîte-de-nuit bon marché : la marque doit rester crédible même
  en s'adressant à un public de soirée.
- Plusieurs tentatives visuelles précédentes sur l'écran boutique (photos
  de banque d'images, icônes plates génériques, palette froide) ont été
  explicitement rejetées par le fondateur comme "trop IA" / "vibe codé" —
  fait à traiter comme contrainte de conception active, pas comme un
  simple avis esthétique.

## Evidence on Hand

- Écran carte (`carte-preview.html`) et écran boutique
  (`app-preview.html`) existent déjà en maquette interactive fonctionnelle
  (carte MapLibre réelle, échange de récompenses avec vrai QR code
  généré localement, données réelles du club Mirage).
- Illustrations dessinées à la main pour 8 familles d'objets (verre,
  bouteille, cordon VIP, bracelet, etc.) — encore utilisées comme repli
  quand aucune photo ne correspond à l'objet (voir point suivant).
- **Mise à jour (19 août 2026) : les dessins faits main ont été jugés
  "IA dégueulasse" par Julien pour les objets identifiables** (cocktail,
  bouteille, shot, cordon VIP, ticket). Remplacés par de vraies photos
  libres de droits (licence Unsplash), affichées telles quelles (sans
  filtre de teinte — essayé puis retiré) dans des cartes au format
  proche d'une vraie appli de réservation (référence explicite fournie
  par Julien : Pad'up). Ce n'est toujours pas une vraie photo du club
  Mirage — reste un objet générique, jamais présenté comme si c'était
  le lieu réel.

## Product Principles

1. Ce que le clubbeur voit doit se lire en une fraction de seconde, une
   main occupée, dans le noir, avec de la musique — jamais un dashboard
   d'analyse.
2. La récompense doit sembler réelle et immédiate ("ce soir"), pas un
   programme de fidélité abstrait à long terme.
3. Le corail reste une signature de marque, jamais un langage d'action ;
   le relief vient du contraste des surfaces, pas de la couleur ajoutée.
4. Aucune fausse donnée : un club sans récompense configurée affiche un
   vide honnête, jamais un catalogue inventé.
5. Le vocabulaire évite le jargon analytique et les mots que le
   fondateur n'emploie pas ("campagne", etc.).

## Accessibility & Inclusion

Aucune exigence spécifique établie au-delà des standards web usuels
(contraste, focus visible, `prefers-reduced-motion`), déjà respectés
dans l'implémentation actuelle.
