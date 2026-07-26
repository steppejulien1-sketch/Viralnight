# Memoire projet ViralNight

## Idee centrale

ViralNight est un SaaS pour boites de nuit et clubs.

Objectif : aider les clubs a multiplier leur visibilite, fideliser leurs clients et remplir leurs soirees grace aux contenus publies par leurs propres clients.

Le client scanne un QR code dans le club, publie une story, un Reel, un TikTok ou un Short avec le tag du club, gagne des points, puis debloque une recompense.

Le club suit les vues, le budget, les points attribues, les recompenses et l'impact commercial.

## Positionnement prefere

- Style professionnel, premium, SaaS B2B.
- Inspiration : Stripe, Linear, Vercel, Ramp, Shotgun, Dice, Partiful.
- Ne pas faire trop "boite de nuit cheap" avec neon partout.
- Garder une ambiance nightlife, mais propre, credible et business.
- Ton clair, direct, commercial.

## Texte hero valide

Titre prefere :

"Multipliez votre visibilité. Fidélisez vos clients. Remplissez vos soirées."

Le texte sous le titre explique :

- QR code dans le club
- publication story/Reel/TikTok
- points
- recompenses
- suivi des vues, budget et clients generes

## Preferences utilisateur

- Ne pas remettre de grosse banniere en haut.
- Corriger les fautes d'orthographe.
- Eviter les mots flous ou trop jargon si l'utilisateur ne les comprend pas.
- Eviter "Campagnes" et "Nouvelle campagne" dans le SaaS : ca ne sert a rien pour lui.
- Garder le site tres professionnel.

### Decision du 26/07/2026 : la landing passe en scroll classique

Ancienne regle, maintenant ABANDONNEE pour la landing :

- ~~Garder la navigation par pages sur le cote gauche.~~
- ~~Ne pas permettre de scroller tout le site d'un coup comme une landing classique.~~
- ~~Navigation page par page via les onglets lateraux.~~

La refonte visuelle (dossier `05-refonte-wetransfer-julien`) est construite autour d'une
landing scrollable : nav flottante en haut, sections empilees, apparitions au scroll,
manifesto qui s'allume mot par mot. Le page-deck etait incompatible avec ce design.
Julien a tranche en faveur du design de la refonte.

Cette decision ne concerne QUE `index.html`. Le dashboard (`app.html`) garde sa
navigation par onglets.

## Landing page actuelle

Refondue le 26/07/2026 sur le design system de `05-refonte-wetransfer-julien`.

Fichiers :

- `index.html`
- `base.css` : polices Inter locales + reset (inchange)
- `theme.css` : design system partage — tokens, boutons, cartes, champs, halos
- `theme.js` : runtime partage — apparitions au scroll, spotlight des cartes
- `landing.css` : styles propres a la landing
- `landing.js` : JS propre a la landing

`styles.css` et `script.js` sont les fichiers de l'ANCIENNE landing page-deck.
Plus rien ne les charge. A supprimer quand la refonte sera validee.

Sections, dans l'ordre de scroll :

- Hero (avec maquette animee du dashboard)
- Bandeau defilant
- Manifesto
- Fonctionnement (4 etapes)
- Points & bareme
- Simulateur d'impact
- Bande controle
- FAQ
- Contact

Elements importants :

- Titre hero valide, conserve mot pour mot.
- Le bareme affiche vient de `dashboardData.js` (`DEFAULT_POINT_RULES`), pas de valeurs
  ecrites en dur dans le HTML. Changer un point la-bas le change sur toute la landing.
- Le formulaire de contact demande club + email + telephone. Les trois sont obligatoires
  parce que la policy RLS `demo_requests_public_insert` les exige.
- Les etats caches des animations sont scopes sous `.vn-js` / `.vn-reveal-ready` : si le JS
  ne tourne pas, la page reste entierement lisible. Ne jamais mettre ces classes en dur
  dans le HTML.
- Plus de `?v=` sur les CSS : Vite gere le cache-busting au build.

## SaaS actuel

Fichier principal :

- `app.html`
- `app.css`
- `app.js`

Onglets actuels :

- Vue generale
- Points & recompenses
- Contenus clients
- QR & check-in
- Clients
- Projection

L'onglet "Campagnes" a ete retire.
Le bouton "Nouvelle campagne" a ete retire.
Le select de campagne en haut a ete retire.

## Systeme de points

Le systeme doit montrer clairement :

- Story validee avec tag du club : points propres aux stories
- 1 000 vues story = plus de points que 1 000 vues video
- 1 000 vues Reel/TikTok = moins de points que story, car volume plus large mais influence moins directe
- Check-in QR pendant la soiree
- Bonus ambassadeur mensuel

Idee retenue :

- Les stories rapportent plus de points car elles influencent directement les proches.
- Les videos rapportent moins par 1 000 vues, mais peuvent generer plus de volume.

## Recompenses

Les recompenses doivent etre configurables par le club :

- le club choisit le nom de la recompense
- le club choisit le nombre de points necessaire

Exemples :

- Vestiaire offert
- Boisson soft ou shot
- Boisson premium
- Coupe-file
- Entree gratuite
- Bracelet +1 invite
- Surclassement table
- Acces VIP / backroom

Les seuils doivent rester plutot accessibles, pas trop hauts.

## Formulaire contact

Le formulaire doit demander des donnees utiles pour vendre/projeter le service :

- nom de l'etablissement
- ville / zone
- site, Instagram ou TikTok
- nom du contact
- email pro
- fonction
- objectifs prioritaires
- clients supplementaires esperes par mois
- vues mensuelles esperees
- budget mensuel envisage
- cout moyen d'une recompense
- priorite de lancement
- contexte / contraintes

Le but est d'estimer :

- CPM previsionnel
- budget par client espere
- nombre de recompenses possibles

## Verifications deja faites

- `script.js` valide avec `node --check`
- `app.js` valide avec `node --check`
- Accueil teste en desktop 1280x720
- Accueil teste en mobile 390x844
- Plus de debordement horizontal
- Hero desktop : carte visible et non coupee
- Hero mobile : carte cachee, titre lisible

