# Noctify sur le téléphone — PWA, connexion Apple, App Store

Ce fichier couvre l'appli **clubbeur** (`app-preview.html`), pas le dashboard
du gérant. Il répond à une question précise : *comment mettre Noctify sur
l'App Store sans se faire rejeter ?*

---

## 1. La règle qui fait peur, et ce qu'elle dit vraiment

Apple applique la directive **4.2 « Minimum Functionality »** : une app qui
n'est qu'un site web repackagé est rejetée. La 4.2.3 va jusqu'à conseiller
d'en faire plutôt une web app.

C'est vrai — mais ça ne vise pas la technologie. Des milliers d'apps de
l'App Store sont du HTML/CSS/JS. Apple regarde deux choses :

1. **Le code est embarqué dans l'app**, téléchargé avec elle, pas chargé
   depuis une URL distante. Une coquille qui ouvre `viralnight-koif.vercel.app`
   dans une webview se fait rejeter. C'est précisément pour ça que
   `npm run build:mobile` produit un dossier `dist-mobile/` embarqué.
2. **L'app fait des choses qu'un site ne peut pas faire.** Voir §5.

---

## 2. Ce qui est déjà en place

### Mode appli (PWA installable)

`app-preview.html` a désormais deux vies :

| Contexte | Ce qui s'affiche |
|---|---|
| Navigateur normal | La maquette de démonstration : titre, texte, cadre de téléphone. Inchangé. |
| Installée sur l'écran d'accueil, ou dans Capacitor | L'appli seule, plein écran, sans habillage. |

La bascule se fait par la classe `.mode-appli` posée sur `<html>` par un
script inline du `<head>` — avant la première peinture, sinon l'habillage
apparaîtrait une fraction de seconde. Quatre déclencheurs : `display-mode`,
`navigator.standalone` (iOS), `window.Capacitor`, et `?app=1` pour tester
au navigateur.

**Un seul fichier, pas de fork.** Dupliquer voudrait dire maintenir 8500
lignes en double.

Pour voir le mode appli sans rien installer :
`http://127.0.0.1:5173/app-preview.html?app=1`

### Icônes

`npm run icones` régénère `public/icones/` depuis l'étoile de marque
(`assets/favicon-vn.svg`) avec le Chrome local. Six tailles, deux
compositions : carré plein pour iOS et Android — qui appliquent eux-mêmes
leur masque, arrondir à la source donnerait un double arrondi avec un
liseré noir — et version arrondie pour les contextes qui affichent l'icône
telle quelle.

### Service worker

`public/sw.js`, écrit petit et méfiant. Le projet a déjà perdu du temps sur
du cache (voir CLAUDE.md, « Pièges connus » : le CDN Vercel servait un HTML
périmé et Julien voyait la version précédente après un push). Un service
worker mal réglé fait la même chose en pire, parce qu'il survit au
rechargement et au vidage du cache du navigateur.

D'où les règles :

- **Le HTML n'est jamais servi depuis le cache tant que le réseau répond.**
  Une seule page est gardée en secours hors ligne : `/app-preview.html`.
- Les autres pages (landing, dashboard, admin) passent en direct, comme si
  le fichier n'existait pas. Leur comportement ne doit pas changer parce
  qu'un clubbeur a installé l'appli.
- Seuls `/assets/` et `/icones/` sont mis en cache pour de bon — les
  fichiers de `/assets/` portent un hash, donc une nouvelle version a une
  nouvelle URL et l'ancienne entrée ne peut pas masquer la nouvelle.
- En local (`127.0.0.1`) le worker ne s'enregistre pas du tout.

`vercel.json` interdit désormais au CDN de mettre `/sw.js` en cache. Sans
ça, un worker périmé pourrait rester en place des heures.

**Le bouton d'arrêt.** Un service worker survit à la fermeture de l'onglet
et reste sur le téléphone des gens : c'est ce qui le rend utile, et c'est
ce qui le rend inquiétant. La sortie de secours est simple — **supprimer
`public/sw.js` et pousser**. Le navigateur revérifie ce fichier à chaque
navigation ; s'il reçoit une 404, il désinscrit le worker tout seul. Pas
besoin de demander quoi que ce soit aux utilisateurs.

C'est aussi pour ça que `skipWaiting()` et `clients.claim()` sont là : une
nouvelle version prend la main immédiatement, au lieu d'attendre que TOUS
les onglets de l'appli soient fermés. Sans eux, une correction pouvait
rester invisible pendant des jours.

### Connexion Apple

Le bouton « Continuer avec Apple » existait déjà mais affichait « bientôt
disponible ». Il est maintenant branché sur le vrai `signInWithOAuth`, avec
la même mécanique que Google : on interroge `/auth/v1/settings` (endpoint
public de Supabase) au chargement pour savoir si le fournisseur est activé.

État actuel de la base clubbeur : `google: true`, `apple: false`, `email: true`.

**Le jour où tu actives Apple dans Supabase, le bouton marche tout seul.
Il n'y a aucune ligne de code à retoucher.** En attendant il dit pourquoi
il ne marche pas, au lieu d'envoyer sur une page Supabase qui affiche du
JSON brut sans bouton retour.

### Notifications push

La bascule « Activer les notifications » des Réglages existait depuis le
début, mais elle écrivait `on`/`off` dans le localStorage du téléphone et
rien ne partait nulle part. Elle est maintenant réelle.

**Le chemin complet, du clic à la notification :**

| Étape | Où | Quoi |
|---|---|---|
| 1. La personne active la bascule | `app-preview.html` | Demande la permission, crée un abonnement Web Push |
| 2. L'abonnement est enregistré | table `push_subscriptions` (base clubbeur) | Une ligne **par appareil**, pas par personne |
| 3. L'admin valide une story | back-office | `api/credit-clubbeur.js` crédite les points |
| 4. La notification part | `lib/notifications/envoyer.js` | Signée VAPID, chiffrée, postée au service de push |
| 5. Le téléphone l'affiche | `public/sw.js` | Le clic rouvre l'appli sur la boutique |

**Le découpage suit la règle du projet** : `lib/notifications/push.js` est
pur — il décide du texte et de quand se taire, sans réseau ni DOM, donc
`npm test` le couvre (39 vérifications). `envoyer.js` à côté ne fait que
du réseau.

**Pas de 13ᵉ fonction serverless.** Le plan Vercel plafonne à 12 et `api/`
y est déjà. L'envoi se greffe sur `credit-clubbeur.js`, qui est justement
le moment où il y a quelque chose à annoncer.

**Trois décisions à connaître :**

- **La permission n'est demandée qu'au clic**, jamais au chargement. Une
  demande qui surgit sans raison se fait refuser — et un refus est
  définitif : le site ne peut plus jamais reposer la question, il faut
  aller dans les réglages du navigateur. On ne dépense cette cartouche
  qu'au moment où la personne appuie sur l'interrupteur.
- **La bascule affiche l'état réel**, plus le localStorage. Avant, elle
  pouvait afficher « on » alors que la permission avait été révoquée
  depuis les réglages du téléphone.
- **Un échec d'envoi ne fait jamais échouer le crédit.** Les points sont
  acquis avant que la notification parte. Si le service de push est en
  panne, l'admin ne doit pas voir une erreur qui l'inciterait à revalider,
  donc à rejouer un crédit déjà fait.

**Ce qu'il reste à faire pour que ça marche :**

1. Générer la paire de clés VAPID — **c'est à toi de lancer la commande**,
   pour que la clé privée ne transite par aucune conversation :

   ```bash
   npm run cles:vapid
   ```

   Puis coller `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` et
   `VITE_VAPID_PUBLIC_KEY` dans les variables Vercel. ⚠️ **Une fois les
   notifications en service, ne regénère jamais cette paire** : tous les
   abonnements existants deviendraient muets sans que personne s'en
   aperçoive.

2. Appliquer la migration `0038_notifications_push.sql` sur la base
   clubbeur. Elle vit dans l'autre dépôt (voir plus bas).

Tant que les clés manquent, la bascule le dit franchement au lieu de
faire semblant de s'allumer.

**⚠️ Sur iPhone**, les notifications web n'existent que si l'appli a été
**ajoutée à l'écran d'accueil** (iOS 16.4+). Dans Safari, l'API est
purement absente — la bascule l'explique alors au lieu de rester morte.
C'est une limite d'iOS, pas un défaut du code, et c'est le meilleur
argument pour Capacitor : en natif, APNs marche sans que la personne ait
à installer quoi que ce soit de particulier.

### Le second dépôt : `06-pwa-clubbeurs`

`CLAUDE.md` ne liste que 5 dossiers, mais il en existe un sixième, et il
est **vivant** : `06-pwa-clubbeurs`, dépôt git séparé
(`steppejulien1-sketch/-viralnight-pwa`). Il porte la base Supabase des
clubbeurs, ses 38 migrations et 8 Edge Functions — dont `credit-story`,
que `api/credit-clubbeur.js` appelle en production.

La migration `0038_notifications_push.sql` y a été déposée mais **n'est ni
commitée ni poussée** : c'est un autre dépôt que celui-ci, la décision
t'appartient.

### Squelette Capacitor

```
capacitor.config.json     appId, appName, webDir, réglages des plugins
vite.config.mobile.js     build de dist-mobile/ (l'appli seule, 5,4 Mo)
```

Plugins installés : `push-notifications`, `geolocation`, `barcode-scanner`,
`browser`, `app`, `status-bar`, `splash-screen`, `haptics`.

```bash
npm run build:mobile   # construit dist-mobile/index.html
npm run ios:sync       # build + cap sync ios     (Mac uniquement)
npm run ios:open       # ouvre Xcode              (Mac uniquement)
```

Le service worker ne s'enregistre pas dans Capacitor non plus : l'origine y
est `localhost`, donc le garde-fou du §« Service worker » s'applique. C'est
voulu — Capacitor sert déjà les fichiers depuis le téléphone, un worker
par-dessus n'apporterait que des ennuis.

---

## 3. Ce que je ne peux pas faire à ta place

### Le build iOS se fait sur le Mac, pas sur le PC

Julien a un Mac : ce point n'est pas un blocage, juste un aller-retour.
Xcode et CocoaPods n'existent que sur macOS, donc `npx cap add ios`
échouera sur la machine Windows. Tout le reste — code, config,
`npm run build:mobile` — se fait sous Windows sans problème.

Sur le Mac, la première fois :

```bash
git clone https://github.com/steppejulien1-sketch/Viralnight.git
cd Viralnight
npm install
npx cap add ios      # cree le dossier ios/ (Mac uniquement)
npm run ios:sync     # build + copie dans le projet natif
npm run ios:open     # ouvre Xcode
```

Ensuite, à chaque changement de code : `npm run ios:sync`.

Le dossier `ios/` **se commit** une fois créé — il porte la signature,
les droits et `Info.plist`. Seuls ses artefacts de compilation sont
ignorés (voir `.gitignore`).

### Compte Apple Developer

99 $/an. Obligatoire pour Sign in with Apple **et** pour publier. Rien ne
peut avancer sur ces deux fronts sans lui.

### Activer Sign in with Apple

Côté Apple (developer.apple.com) :

1. Créer un **App ID** avec la capacité « Sign In with Apple ».
2. Créer un **Services ID** — c'est lui le `client_id` côté Supabase.
3. Ajouter comme *Return URL* :
   `https://gcopwgmqjiufemapamek.supabase.co/auth/v1/callback`
4. Créer une **clé** (Keys) avec « Sign In with Apple », télécharger le
   `.p8`. **Il ne se retélécharge jamais.** Note aussi le Key ID et le
   Team ID.

Côté Supabase (projet clubbeur `gcopwgmqjiufemapamek`) :

5. Authentication → Providers → Apple → activer, coller le Services ID et
   le secret généré depuis le `.p8`.
6. Vérifier que l'URL de l'appli figure dans *Redirect URLs*.

Puis recharger l'appli : le bouton s'allume seul.

### Décider du bundle ID — avant la première soumission

`capacitor.config.json` porte `"appId": "com.noctify.app"`. C'est une valeur
par défaut que j'ai choisie. **Un bundle ID ne se change plus une fois l'app
publiée** : c'est l'identité de l'app chez Apple. Le nom du produit hésite
encore entre Noctify et ViralNight — tranche maintenant, pas après.

### CORS sur `api/`

Le formulaire « demande de démo » de l'appli appelle `/api/demo-request`.
J'ai rendu l'URL absolue (sans effet sur le web), mais **aucune route `api/`
ne renvoie d'en-tête CORS aujourd'hui** : depuis l'app iOS l'origine sera
`capacitor://localhost`, et l'appel sera bloqué.

Je ne l'ai pas ouvert de moi-même — c'est une décision de sécurité. Le
moment venu, ajouter un `Access-Control-Allow-Origin` restreint à cette
origine, sur cette route précise, jamais sur tout `api/`.

---

## 4. Les vrais motifs de rejet, par ordre de danger

### ① Le testeur ne peut pas tester l'app (directive 2.1)

**C'est le risque n°1, et il est propre à ce produit.** Le reviewer Apple
est en Californie. Il n'ira pas scanner un QR code dans un club français à
1 h du matin. Il ouvre l'app, voit un écran de scan qui ne mène nulle part,
et rejette.

À fournir dans les notes de review :

- un compte de démo (email + mot de passe) **avec des points déjà crédités** ;
- une **image de QR code valide** qu'il puisse scanner depuis un autre écran ;
- des récompenses disponibles sur ce compte ;
- une phrase expliquant que l'app se destine à un usage sur place.

### ② Sign in with Apple (directive 4.8)

La règle vise les apps qui utilisent *exclusivement* un login tiers. Comme
le lien magique par email est proposé à côté de Google, tu es probablement
exempté à la lettre. Mais c'est appliqué de façon incohérente selon le
reviewer, et le bouton est déjà là. Assurance pas chère.

### ③ Achats intégrés (directive 3.1.1)

Frontière à tenir : les points sont **gratuits**, et les récompenses se
consomment **physiquement au club** (un verre, une entrée). Service
physique, donc hors commission Apple.

Ça reste vrai tant que :

- tu ne vends jamais de points contre de l'argent dans l'app ;
- l'abonnement du club (le SaaS B2B) n'apparaît **jamais** dans l'app clubbeur.

Si ça change, Apple prend 30 %.

### ④ Alcool et vie nocturne

Classification **17+** obligatoire. L'interface ne doit pas encourager la
consommation. Le vocabulaire compte.

### ⑤ Confidentialité (directive 5.1.1)

Nutrition labels à remplir dans App Store Connect, et lien vers
`confidentialite.html`. La page existe déjà.

---

## 5. Ce qui reste à faire pour que la 4.2 ne soit plus un sujet

Les plugins sont installés, pas encore branchés. Par ordre d'impact :

| Capacité | État | Pourquoi ça compte |
|---|---|---|
| **Notifications push** | plugin installé, à brancher | L'argument massue. « Ta story est validée, +150 pts », « Soirée ce soir ». Impossible correctement sur le web iOS. Demande APNs et une table de tokens. |
| **Apple Wallet** | non commencé | La récompense devient un pass dans le Wallet, le videur le scanne. Tue la 4.2 net. Pas de plugin officiel, passe par PassKit natif. |
| **Scan QR natif** | plugin installé, jsQR encore en place | Plus rapide et bien meilleur en basse lumière — un club, c'est sombre. |
| **Géoloc native** | plugin installé, à brancher | « Les clubs autour de toi » avec la vraie position. |

---

## 6. Ordre recommandé

**Ne casse pas le parcours web.** Quelqu'un dans un club à 1 h du matin qui
scanne un QR et tombe sur « Télécharger sur l'App Store » est perdu. Le web
est le meilleur produit pour ce moment-là.

L'App Store n'est pas le canal d'acquisition — c'est le canal de
**rétention** : faire revenir les gens entre deux soirées.

1. **Maintenant** — la PWA est en place, elle ne coûte rien. Laisse-la vivre.
2. **Aux premiers vrais clients** — compte Apple Developer, Sign in with
   Apple, puis Capacitor sur le Mac. Compte 1 à 2 semaines.

> **Décision de Julien, 01/09/2026 : on ne soumet PAS à l'App Store
> maintenant.** Il reste des améliorations à faire sur l'appli avant de la
> montrer à Apple, et une première soumission rejetée laisse une trace dans
> le dossier. Le squelette Capacitor est là pour être prêt le jour venu, pas
> pour publier tout de suite. Ne pas relancer le sujet de la soumission sans
> qu'il le demande.

---

## 7. Limite connue de la PWA sur iOS

Sur iOS, une PWA installée gère mal les retours OAuth : le login Google part
dans Safari et la session ne revient pas toujours dans l'app installée. Le
lien magique par email n'a pas ce problème.

Ce n'est pas réparable côté PWA, c'est une limite d'iOS. Capacitor le règle
proprement avec `@capacitor/browser`, qui ouvre `SFSafariViewController` —
ce qu'Apple **exige** pour l'OAuth, un flux de login dans une webview
embarquée étant lui-même un motif de rejet — plus un lien profond pour le
retour dans l'app.

Un argument de plus pour Capacitor le moment venu.
