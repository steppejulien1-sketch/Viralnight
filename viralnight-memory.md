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
- Garder la navigation par pages sur le cote gauche.
- Ne pas permettre de scroller tout le site d'un coup comme une landing classique.
- Navigation page par page via les onglets lateraux.
- Le bloc contact ne doit pas rester fixe quand on descend.
- Corriger les fautes d'orthographe.
- Eviter les mots flous ou trop jargon si l'utilisateur ne les comprend pas.
- Eviter "Campagnes" et "Nouvelle campagne" dans le SaaS : ca ne sert a rien pour lui.
- Garder le site tres professionnel.

## Landing page actuelle

Fichier principal :

- `index.html`
- `styles.css`
- `script.js`

Sections :

- Accueil
- Parcours
- Points
- Pilotage
- Impact
- Contact

Elements importants :

- Logo/badge ViralNight visible sur l'accueil.
- Titre hero valide.
- Carte produit a droite compacte sur desktop.
- Carte produit cachee sur tablette/mobile pour eviter les bugs.
- Navigation laterale gauche.
- Pas de scroll global du site.
- CSS charge avec `styles.css?v=5` pour forcer le navigateur a prendre la derniere version.

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

