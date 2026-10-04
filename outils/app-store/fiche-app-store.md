# Fiche App Store : appli clients Noctify

À copier dans App Store Connect (appstoreconnect.apple.com → Mes apps → +).
Préparée le 04/10/2026. On commence par l'appli **clients** seule ; l'appli
gérants reste en version web (club-app.html), qui marche sur ordinateur et
téléphone.

## Identité

| Champ | Valeur |
|---|---|
| Nom | Noctify |
| Sous-titre (30 car.) | Tes sorties, récompensées |
| Identifiant (bundle ID) | com.noctify.app |
| SKU | noctify-ios-1 |
| Langue principale | Français |
| Catégorie principale | Style de vie |
| Catégorie secondaire | Nourriture et boissons |
| Prix | Gratuit |

## Liens (obligatoires)

| Champ | URL |
|---|---|
| Politique de confidentialité | https://viralnight-koif.vercel.app/confidentialite.html |
| Assistance (support) | https://viralnight-koif.vercel.app/ |
| Suppression de compte | https://viralnight-koif.vercel.app/suppression-compte.html |

À changer pour le vrai nom de domaine dès qu'il est acheté.

## Description

Gagne des points dans les bars, restaurants et cafés où tu vas déjà.

Scanne le QR code sur place : tes points arrivent tout de suite. Poste une story Instagram qui mentionne le lieu : tu en gagnes cinq fois plus. Échange-les contre ce que le lieu propose : un café, une bière, un dessert, un menu.

• La carte des lieux partenaires autour de toi
• Tes points et tes bons au même endroit
• Un bon à montrer sur place, impossible à copier
• Des cadeaux le jour de ton anniversaire, si tu le veux

Noctify est gratuit pour toi. Ce sont les commerces qui offrent les récompenses.

## Mots-clés (100 caractères, séparés par des virgules)

fidélité,points,récompenses,bar,restaurant,café,bons,sortie,bruxelles,story,instagram,cadeau

## Texte promotionnel (170 car., modifiable sans nouvelle version)

Scanne, poste ta story, gagne un verre. Les bars et restos de Bruxelles te récompensent.

## Informations pour la vérification (App Review Information)

- **Connexion requise : oui**
- **Identifiant :** `revue.apple@noctify-app.be`
- **Mot de passe :** dans `C:\Users\stepp\viralnight-identifiants.txt` (section « Compte du testeur Apple »)
- **Notes pour le testeur** (en anglais, à coller) :

> Noctify is a loyalty app for bars, restaurants and cafés in Belgium. Users earn points by scanning a QR code displayed in a partner venue, or by posting an Instagram story that mentions the venue, and redeem them for rewards offered by the venue (a coffee, a drink, a dessert).
>
> Sign-in: type the review e-mail above and tap "Continuer avec l'email": a password field appears for this account only (regular users receive a 6-digit code by e-mail). The account is already set up: you land on the welcome screen, tap "Récupérer mon cadeau" to receive 50 points, then browse the map, a venue page and its rewards.
>
> Scanning requires being inside a partner venue; points from stories are checked by the venue before being credited. Account deletion: Profile → Réglages → "Supprimer mon compte". Users must be 18 or older (alcohol is offered by some venues); the app asks for this confirmation at sign-up.

## Classification par âge

Répondre « Fréquent/Intense » à « Consommation ou références à l'alcool, au tabac ou aux drogues » (des bars offrent des boissons alcoolisées) : l'appli sort dans la tranche d'âge la plus haute. Tout le reste : « Aucun ».

## Confidentialité de l'app (« étiquettes nutritionnelles »)

Données **collectées et liées à l'identité**, aucune utilisée pour du pistage publicitaire :

| Donnée | Usage |
|---|---|
| Adresse e-mail | Fonctionnalité de l'app ; e-mails des lieux (désinscription en un clic) |
| Nom (pseudo Instagram) | Fonctionnalité de l'app |
| Photos (photo de profil, capture du profil Instagram) | Fonctionnalité de l'app |
| Contenu utilisateur (stories qui mentionnent un lieu) | Fonctionnalité de l'app |
| Date de naissance (facultative) | Personnalisation (e-mail d'anniversaire) |
| Historique d'achats (points, bons échangés) | Fonctionnalité de l'app |
| Identifiants de l'appareil (jeton de notification) | Fonctionnalité de l'app |

Position : comparée à celle du QR code au moment du scan, puis **non conservée**. À relire avant l'envoi : si Apple considère cet envoi au serveur comme une « collecte », cocher « Position précise, fonctionnalité de l'app, non liée ».

Pistage (App Tracking Transparency) : **non**.

## Captures d'écran

Il faut des captures aux tailles demandées par App Store Connect pour l'iPhone (la plus grande taille en premier ; App Store Connect affiche la liste exacte). 3 à 5 écrans : la carte, la page d'un lieu avec ses récompenses, le bon QR, les points, la page de bienvenue. Elles peuvent être faites depuis le simulateur du Mac (Fichier → Enregistrer l'écran).

## Avant d'envoyer, à cocher

- [ ] Compte Apple Developer ouvert (au nom de la société si possible)
- [ ] Branche `app-ios` remise à jour avec `main` (Claude), puis construite sur le Mac
- [ ] Dans Xcode : équipe choisie, Push Notifications activé
- [ ] Testé sur un vrai iPhone, puis TestFlight avec quelques amis
- [ ] Liens ci-dessus passés sur le vrai nom de domaine
- [ ] Aucun prix ni bouton de paiement dans l'appli (les gérants paient sur le site)
