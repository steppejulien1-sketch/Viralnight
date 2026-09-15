# Noctify

SaaS B2B pour boites de nuit. Le client du club scanne un QR code sur place, publie
une story / Reel / TikTok avec le tag du club, gagne des points, debloque une
recompense. Le club suit les vues generees, les points distribues, le cout par
recompense et l'impact sur le remplissage.

Le produit se vend a des gerants de club, pas a des developpeurs. Tout ce qui est
affiche doit etre comprehensible par quelqu'un qui n'a jamais lu un dashboard
analytique.

---

## 1. Ou travailler

Le depot parent `Noctify-ClaudeCode-FULL/` contient 6 dossiers. **Celui-ci
(`01-base-fonctionnelle-vite-supabase-api/`) porte tout le site** : landing,
dashboard gerant, admin, et l'appli clubbeur (`app-preview.html`).

⚠️ **`06-pwa-clubbeurs` est vivant lui aussi**, contrairement a ce que cette
section a longtemps dit. C'est un depot git SEPARE
(`steppejulien1-sketch/-viralnight-pwa`) qui porte la base Supabase des clubbeurs
(`gcopwgmqjiufemapamek`), ses migrations numerotees et ses Edge Functions — dont
`credit-story`, appelee en production par `api/credit-clubbeur.js`. Toute
modification du schema clubbeur (points, amis, abonnements push) se fait la-bas,
pas dans `supabase/migrations/` d'ici.

| Dossier | Statut |
|---|---|
| `01-base-fonctionnelle-vite-supabase-api` | **LE projet.** Tout se fait ici. |
| `02-projet-nextjs-experimental` | Abandonne. Ne pas y toucher. |
| `03-ancien-mvp-client-rewards` | Archive historique. |
| `04-liens-utiles-production` | Notes et liens. |
| `05-refonte-wetransfer-julien` | Maquettes de reference pour le design. Source d'inspiration, jamais de code a copier tel quel. |
| `06-pwa-clubbeurs` | **Vivant.** Depot git separe. Base Supabase des clubbeurs + Edge Functions. Voir l'avertissement ci-dessus. |

## 2. Deploiement — a lire avant de dire "c'est corrige"

Ce dossier a son propre `.git` et son propre `.vercel`. Le depot parent n'est PAS
un depot git.

```
remote  https://github.com/steppejulien1-sketch/Viralnight.git
branche main
prod    https://viralnight-koif.vercel.app  (rebuild auto a chaque push, ~20 s)
```

**Julien verifie toujours sur l'URL de prod, jamais sur `localhost`.** Modifier un
fichier en local ne change strictement rien pour lui. Une correction n'est terminee
qu'apres `git push origin main` ET verification que la prod sert bien le nouveau code :

```bash
curl -s https://viralnight-koif.vercel.app/connexion.html | grep -c "un-marqueur-de-ta-modif"
```

## 3. Stack

Vite multi-pages, JavaScript natif en modules ES. **Aucun framework front, aucun
TypeScript, aucun bundler exotique.** Ne pas introduire React, Tailwind ou un
gestionnaire d'etat : le projet est volontairement en HTML/CSS/JS lisibles.

- **Front** : 21 pages HTML declarees dans `vite.config.js`. Chacune a son `.css` et son `.js`.
- **Backend** : `api/*.js`, fonctions serverless Vercel. En local, `vite-plugin-api.js` les sert sous `npm run dev`.
- **Base** : Supabase (Postgres + Auth + RLS).
- **Logique metier** : `lib/`, pur JS sans dependance au DOM ni au reseau, donc testable en Node.

## 4. Carte du code

### Pages

| Page | Role |
|---|---|
| `index.html` | Landing publique. Scroll classique, nav flottante. |
| `connexion.html` / `inscription.html` | Auth. Partagent `auth.js` et `auth.css`. |
| `app.html` | Dashboard client (le gerant du club). |
| `admin.html` | Back-office interne Noctify. Validation des contenus, creation de clients. |
| `simulateur.html` | Demo commerciale autoportante. Donnees simulees, sert a vendre. |
| `scan.html` / `qr.html` | Parcours QR cote client final. |
| `live.html` | Suivi de soiree en direct. |
| `setup.html` | Configuration initiale d'un club. |
| `chat.html` | Assistant. |
| `viral-intelligence.html` / `demo.html` | Analyse des soirees. |
| `app-preview.html` | Maquette autoportante de l'app mobile "clubbeur" (cote client final : scan QR, points, boutique, carte des clubs). Un seul gros fichier, branche sur les vraies fonctions RPC Supabase (`submit_story`, `redeem_reward`, `checkin_scan`...). **Double vie** : au navigateur c'est la maquette de demonstration ; installee sur l'ecran d'accueil ou dans Capacitor, la classe `.mode-appli` fait tomber l'habillage et l'appli passe en plein ecran. Tester avec `?app=1`. Voir `MOBILE.md`. **Inscription (etat du 15/09/2026, apres deux jours d'essais facon DUSK abandonnes)** : l'accueil d'avant, BLANC et SANS photo (essai sur photo retire le soir meme, Julien : « remets celle d'avant, c'est deja assez clean ») : titre, logo au verre (`public/noctify-logo-accueil.webp`, fond blanchi), « Transforme tes sorties en recompenses. » (sorties, plus soirees : bars et restaurants arrivent), Apple, Google, champ email. L'email envoie un code ; une feuille monte, PLEIN ECRAN, en BLANC comme l'accueil (15/09/2026 : « tout en blanc, c'est plus coherent » ; « Ton code » a sa photo fondue dans le blanc, seule la page du cadeau reste en photo plein cadre) (15/09/2026, Julien : « la derniere page c'est propre grace a la photo, fais ca pour tout » ; classe `.ob-photo-etape`, photos dans `public/ambiance/`, textes courts ; animations facon DUSK : photo qui sort du noir, texte qui monte en se defloutant, barres de progression facon story `#ob-progres` ; voile leger, un premier essai trop sombre etait « eteint » ; « Ouvrir Instagram » tente `instagram://user` sur telephone) : « Ton code » + les 6 cases, puis « Capture ton profil » SEULEMENT (15/09/2026 soir : plus d'ecran prenom ni d'ecran pseudo ; la capture DOIT etre un profil Instagram, verifie sur le telephone par Tesseract -- `estProfilInstagram`, sinon refusee ; le pseudo est LU dessus et prerempli, corrigeable -- `lib/profil/pseudoDepuisCapture.js` ; le nom du compte = le pseudo), « Capture ton profil » (ecran a part : un telephone dessine : sequence animee jouee UNE fois (ecran d'accueil aux vrais logos d'applis via Simple Icons, doigt sur Instagram, ouverture, capture, miniature cochee ; plus aucun rouge autour du pseudo ni sous le telephone), le profil reprend la structure et les chiffres du compte de Julien (julien.stpt, capture IMG_5080 du 15/09) avec les posts de `public/ambiance/profil/` ; « Ouvrir Instagram » ouvre l'appli (instagram://app), jamais le profil du pseudo tape et le flash d'une capture, un gros bouton « Ajouter la capture », puis « Continuer » ; cases arrondies pour le code et le pseudo), puis « Bienvenue sur Noctify » en plein ecran (TOUJOURS pour un compte neuf ; le bonus se prend TOUT DE SUITE, meme sans club scanne (migration clubbeur 0049), UN PAR COMPTE et plus par telephone (0050, le jeton vn_appareil n'existe plus) ; la page ne vient QUE si le cadeau reste a prendre : une fois pris, ni accueil, ni feuille, ni page du cadeau ne reviennent, meme en rouvrant l'appli -- base welcome_bonus_status + trace locale vn_parcours_fini ; verifie par parcours_inscription.cjs apres rechargement) sur une photo de bar (Pexels, `public/ambiance/bienvenue.webp`) avec un gros bouton « Recuperer mon cadeau » (welcome_bonus, +50). Points verses : SUR LA MEME PAGE PHOTO, le titre s'efface et un gros « +50 » blanc compte a sa place, « points ajoutes a ton compte », le bouton devient « Continuer » (`montrerCadeauOb`, classe `.recupere`) -- la page medaille/rayons/confettis a ete retiree le 15/09 : « trop IA » ; captures sans rien verser : `outils/cadeau_bienvenue_apercu.cjs` (`window.noctifyCadeau`) ; sans etablissement scanne, le bouton dit que les points arrivent au premier scan. Julien : « trop d'etapes [...] simple, efficace ». La suite part toujours de `onAuthStateChange` → `poursuivreParcours()`, quelle que soit la porte (code, lien, Google). `window.noctifyParcours(ecran, adresse)` pose la feuille sur un ecran sans envoyer d'e-mail (captures). Test de bout en bout avec compte jetable : `outils/parcours_inscription.cjs`. |
| `club-app.html` | **L'appli des gerants**, cote club, dans le meme cadre de telephone qu'`app-preview.html`. Connexion, tableau de bord, boutique de recompenses, bareme, QR, reglages, Instagram. Un seul gros fichier, donnees reelles (`dashboardData.js`). Julien : « le truc que tu m'as fait [`app.html`], c'est un site, ce n'est pas fou ». Contient le **parcours d'installation** : cinq ecrans qui prennent la main a la premiere ouverture d'un club (fiche, catalogue de recompenses, bareme, Instagram, QR), puis plus jamais -- `establishments.onboarded_at` s'en souvient, le `localStorage` sert de filet. Rejouable depuis Reglages → « Refaire l'installation ». |
| `apercu.html` | **Outil de travail, pas une page produit.** Le cadre de telephone seul, sans l'habillage de demonstration, pour regarder l'appli clubbeur depuis un PC. Selecteur d'appareil (375 a 430 px) et mise a l'echelle automatique. Bouton **Blanc / Noir** (15/09/2026, Blanc par defaut) : passe `?theme=blanc|noir` a l'appli, qui force son theme en reecrivant ses `@media (prefers-color-scheme: dark)` avant la premiere peinture (script juste apres la feuille de style). Charge `app-preview.html?app=1` dans une iframe : c'est le seul moyen d'avoir un VRAI viewport mobile (`100dvh` et les media queries y sont justes, ce qui n'est pas le cas d'un simple div de 390 px pose sur une page de 1900 px). Ne copie aucun code de l'appli. |
| `pilotage.html` | **Le tableau de bord de Julien** (13/09/2026) : « un compte ou j'ai toutes les donnees rassemblees ». Reunit les DEUX bases : inscrits (jour / 7 jours / mois), installations et appareils actifs, activite, departs et leurs raisons, support (repondre depuis la page), avis, clubs payants / essai (statut modifiable), demandes de demo. Tout vient de `/api/update-client-status?action=pilotage`, reserve a `ADMIN_EMAIL` (jeton verifie cote serveur). Calculs dans `lib/admin/pilotage.js`. Les comptes de Julien et de test (`COMPTES_INTERNES`, `DOMAINES_INTERNES`) sont exclus des chiffres. La connexion admin atterrit ici. **Remplace admin.html pour la validation** (14/09/2026) : la file « A valider » lit `story_events` a la source (admin.html ne voyait jamais les stories Instagram, faute de lien public) et valide via la RPC `pilotage_review_story` (migration clubbeur 0046). Rubrique E-mails = table `journal_emails` : tout envoi Resend passe par `lib/notifications/email.js`. Le telephone du gerant vient de l'etape « Ton club » de club-app.html (`establishments.phone`). |
| `admin-prospection.html` | Back-office de prospection commerciale (qualification de clubs). |
| `carte-preview.html` | Maquette autoportante de la carte des clubs (maplibre-gl). |
| `bienvenue.html` | Ecran d'accueil post-inscription. |
| `mentions-legales.html` / `confidentialite.html` / `cgu.html` / `cookies.html` | Pages legales statiques. |

### Fichiers transverses

- `base.css` — polices Inter locales + reset. Ne quasiment jamais toucher.
- `theme.css` — **le design system**. Tokens de couleur, boutons, cartes, champs, elevations.
- `theme.js` — runtime du design system : apparitions au scroll, spotlight des cartes.
- `supabaseClient.js` — client Supabase cote navigateur (cle anon).
- `dashboardData.js` — bareme de points par defaut. La landing ET le dashboard lisent d'ici. Changer une valeur la-bas la change partout.
- `public/sw.js` — service worker de l'appli clubbeur. **Volontairement minimal** : le
  HTML n'est jamais servi depuis le cache tant que le reseau repond, et seules
  `/assets/` et `/icones/` (noms a hash) sont gardees. Les autres pages du site passent
  en direct. Rien ne s'enregistre en local.
- **15/09/2026 : mascotte retiree puis REMISE le jour meme**, a la demande de Julien (« remets le
  logo d'avant avec le verre, oublie le logo qu'on a cree ensemble »). Ce qui reste de cette
  journee : le rouge de l'appli clubbeur est celui du logo, `#de3131` ; son mode sombre est un
  noir neutre (`#000`, plus le noir brun `#120d0d`) ; `?theme=noir|blanc`.
- `public/mascotte/` — le verre Noctify, la mascotte de la marque. Une pose par ecran du
  parcours d'installation : `pose-1.webp` a `pose-5.webp`. Un fichier absent n'est pas une
  panne : l'ecran retombe sur `verre-salut.webp`, le verre du logo detoure. Les poses sont
  generees par Julien puis detourees/recadrees ici — fond transparent, meme echelle d'une
  pose a l'autre, sinon le personnage saute d'un ecran au suivant.
- `public/manifest.webmanifest` + `public/icones/` — installation sur le telephone.
  Les icones se regenerent avec `npm run icones` depuis `assets/favicon-vn.svg`.
- `capacitor.config.json` + `vite.config.mobile.js` — coquille iOS/Android.
  `npm run build:mobile` sort l'appli SEULE dans `dist-mobile/`. **Le build iOS exige
  un Mac**, il ne se fait pas sous Windows.

### `lib/` — la logique qui compte

```
lib/analytics/    calcul des metriques d'une soiree, score viral, comparaisons
lib/rules/        moteur de recommandations ("ce qu'il faut ameliorer")
lib/points/       attribution des points
lib/auth/         requireEstablishment : le garde-fou de securite des routes API
lib/verification/ controle des contenus soumis par les clients
lib/tracking/     QR codes et endpoints publics
lib/ai/           prompts et clients OpenAI
lib/points/       aussi : mentionAutomatique.js (pont entre les deux bases)
                  et verificationStory.js (story supprimee avant l'echeance)
lib/scheduling/   dates de soiree (une soiree du samedi soir finit le dimanche matin)
lib/notifications/ push.js = QUOI dire et quand se taire (pur, teste).
                  envoyer.js = l'envoi reel (reseau, VAPID, nettoyage des
                  abonnements morts). L'envoi est greffe sur
                  api/credit-clubbeur.js : pas de 13e fonction serverless.
```

Tout ce qui est dans `lib/` est teste par `scripts/test-*.mjs`. **Si tu modifies
`lib/`, lance `npm test`.**

### Base de donnees

Migrations dans `supabase/migrations/`, appliquees par `npm run db:apply`.

Tables : `establishments`, `establishment_owners`, `establishment_point_rules`,
`establishment_point_rule_items`, `establishment_opening_hours`,
`establishment_schedule`, `events`, `event_metrics`, `submissions`, `qr_scans`,
`rewards`, `reward_redemptions`, `demo_requests`, `establishment_instagram_accounts`,
`instagram_mentions`, `club_invitations`.

⚠️ `npm run db:apply` ne rejoue en realite que `supabase/migrations/SETUP_COMPLET.sql`,
pas chaque fichier numerote individuellement — et ce fichier a deja pris du retard sur
au moins une migration recente (`202608150001_lien_vers_story_pwa.sql`, absente).
`outils/ecart_migrations.cjs` compare le depot a la base reelle et repere ce genre
d'ecart ; utile a lancer avant de supposer qu'une migration recente est appliquee.

## 5. Securite — regle non negociable

Les routes `api/*.js` utilisent la cle `service_role`, **qui contourne RLS**.
L'`establishment_id` doit donc TOUJOURS etre rededuit du jeton de session via
`lib/auth/requireEstablishment.js`, et **jamais lu depuis le corps ou l'URL de la
requete**. Sinon il suffit de deviner un UUID pour lire les donnees d'un autre club.

Toute nouvelle route API qui touche a des donnees de club commence par :

```js
const auth = await requireEstablishment(request);
if (auth.error) return response.status(auth.status).json({ error: auth.error });
```

**L'inscription est OUVERTE depuis le 05/09/2026** (decision de Julien : « je vais
ouvrir l'inscription a tout le monde pour le moment »). N'importe quel compte peut
creer SON club -- un seul, le controle `dejaProprietaire` tient toujours, et le
proprietaire vient du jeton de session verifie, jamais du corps de la requete.
Les liens d'invitation continuent de marcher quand il y en a un : ils portent le nom
et la ville prepares par l'admin, et restent brules a l'usage. Ils ne sont plus
exiges. Le jour ou il faudra refermer, c'est dans `api/create-client.js`, en une
condition. Le verrou est cote serveur parce que `club-app.html` n'est pas la
seule porte — `inscription.html` appelle la meme route. La table a RLS activee et
**aucune policy** : elle est invisible avec la cle anon, seule la cle `service_role`
la lit. Le jeton est brule avant la creation (update conditionne a `used_at IS NULL`),
et rendu si la creation echoue. L'admin fabrique les liens depuis `admin.html`
(« Inviter un club » → `POST /api/create-client?action=inviter`).

Le compte admin est `steppejulien1@gmail.com` depuis le 14/09/2026 (avant : `viralnight001@gmail.com`). L'adresse de CONTACT / support affichee partout (pages legales, liens mailto des deux applis, suppression de compte) est `noctify.support@gmail.com` depuis le 14/09/2026 (constante `ADMIN_EMAIL`, dupliquee
dans `admin.js` et `auth.js` — les garder alignes).

## 6. Regles de design

Le style vise : **Stripe, Linear, Vercel.** Sombre, premium, credible en B2B.
Pas de neon partout, pas de "boite de nuit cheap".

- **Le corail `--coral` (#ff6363) est une couleur de MARQUE, jamais un bouton d'action.**
  Il souligne une valeur importante, un accent, un liseré. Les CTA sont blancs ou `--mist`.
- Le relief vient du contraste de surfaces (`--surface-1/2/3`), pas de la couleur.
- Fond de page : `--void` (#08090b). Jamais de noir pur.
- `--sky`, `--cobalt`, `--iris` sont reserves aux atmospheres de fond (hero, pages d'auth).
- Les etats caches des animations sont scopes sous `.vn-js` / `.vn-reveal-ready`.
  **Ne jamais ecrire ces classes en dur dans le HTML** : si le JS ne tourne pas, la
  page doit rester entierement lisible.
- Toujours verifier mobile (375px) autant que desktop. Zero debordement horizontal.
- **Taille du texte dans `app-preview.html`** : les font-size s'ecrivent
  `calc(13.5 * var(--u))`, jamais `13.5px`. `--u` vaut 1px partout, sauf en mode
  appli ou il grandit avec la largeur de l'ecran (`clamp(1.06px, 0.30vw, 1.24px)`).
  L'appli a ete dessinee dans un cadre de 360px sur un ecran de PC ; sur un vrai
  iPhone 12+ le texte etait nettement trop petit. Tout le texte suit --u en bloc,
  donc la hierarchie dessinee reste intacte. Aucune marge ni hauteur n'est en unite
  relative dans ce fichier : faire varier `--u` ne touche QUE le texte.
  **Exception : `.tab .lbl`** est bride a `min(var(--u), 1px)` — a pleine echelle
  "Récompenses" n'a plus un pixel de marge sur un ecran de 375px, et iOS garde de
  toute facon ses libelles d'onglet a 10 pt sur tous les iPhone.

Vocabulaire a bannir dans l'interface : "Campagne", "Nouvelle campagne". Julien ne
s'en sert pas. Eviter le jargon analytique non explique.

## 7. Commandes

```bash
npm run dev        # serveur local sur 127.0.0.1:5173, sert aussi les routes /api
npm run build      # build de production
npm test           # 11 suites sur lib/ — a lancer apres toute modif de lib/
npm run db:apply   # applique les migrations Supabase
npm run db:test    # verifie les migrations sans les appliquer
```

## 8. Pieges connus

- **Supabase en offre gratuite se met en pause apres ~1 semaine sans activite.** Si tout
  repond 500 sans raison, verifier d'abord le dashboard Supabase. Passer en Pro (25 $/mois)
  quand le premier vrai client arrive.
- **`.env.local` ne contient que les cles `VITE_*`** (URL et cle anon). Les cles serveur
  (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`,
  `NOTIFICATION_EMAIL`, `NOTIFICATION_FROM`, `SITE_URL`, `INSTAGRAM_APP_ID`,
  `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `INSTAGRAM_STATE_SECRET`,
  `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_CLUBBEUR_URL`,
  `SUPABASE_CLUBBEUR_SERVICE_ROLE_KEY`, `INSTAGRAM_FORFAIT_STORY`, `CRON_SECRET`) ne vivent que sur Vercel. En local, les routes qui en
  dependent repondent `Configuration serveur incomplete`. C'est normal.
- **La connexion Instagram (`api/instagram.js`, `lib/instagram/`) exige une app Meta for
  Developers** (produit "Facebook Login for Business") cote Julien : le compte Instagram du
  club doit etre en mode Business/Creator et relie a une Page Facebook. Tant que l'app Meta
  est en mode developpement, seuls les comptes ajoutes comme testeurs dans le dashboard Meta
  peuvent se connecter — pas besoin d'attendre l'App Review pour les premiers clients.
- **Plan Vercel Hobby : 12 fonctions serverless maximum par deploiement.** Deja touche une
  fois (17 fonctions fin aout 2026 → tous les deploiements echouaient a "Deploying outputs",
  build reussi mais rien en ligne, sans message d'erreur clair). `api/` est actuellement a
  12 pile. Avant d'ajouter une nouvelle route API, verifier `ls api/*.js | wc -l` — si ca
  approche 12, fusionner plutot que d'ajouter (voir `api/instagram.js` et `api/track.js`,
  qui dispatchent plusieurs actions via `?action=` / `?type=` au lieu d'un fichier chacune).
- **Le formulaire de demande de demo ecrit dans la vraie base de production, meme en local** :
  `landing.js` bascule sur une insertion Supabase directe avec la cle anon si
  `/api/demo-request` echoue. Ne pas le soumettre "pour tester".
- **Le CDN Vercel met le HTML en cache quelques minutes.** Constate le 31/08/2026 :
  `X-Vercel-Cache: HIT` avec `Age: 242` sur `/app-preview.html`. Julien rafraichissait
  juste apres un push et recevait la version precedente — d'ou plusieurs "ca ne se met
  pas a jour" qui n'etaient pas des bugs de code. `vercel.json` force desormais
  `s-maxage=0` sur les `.html` (les `/assets/*` gardent leur cache long, ils portent un
  hash). Pour verifier une prod sans attendre : ajouter `?cb=$RANDOM` a l'URL.
- **`CRON_SECRET` conditionne les deux taches planifiees.** `vercel.json` declare deux
  crons (`?action=collecter-abonnes` a 6 h, `?action=verifier-stories` a 18 h) et
  `estAppelCron()` exige `Authorization: Bearer $CRON_SECRET`. **Si la variable est absente
  du serveur, les deux repondent 401 tous les jours, en silence** : l'historique d'abonnes
  ne se remplit jamais, les stories supprimees avant l'echeance ne sont jamais detectees,
  et le projet Supabase gratuit perd ce qui le tenait eveille. Depuis le 03/09/2026 la
  reponse distingue les deux cas -- "CRON_SECRET absent de ce serveur" plutot qu'un "Non
  autorise" identique a celui d'un appel anonyme. Poser la meme valeur dans les variables
  Vercel ET dans le champ prevu par Vercel pour les crons.
- **Le parcours d'installation de `club-app.html` marche sans sa migration, mais oublie.**
  `202609040001_parcours_installation.sql` ajoute `establishments.onboarded_at`. Tant
  qu'elle n'est pas passee, la fin du parcours n'est retenue que dans le `localStorage`
  du telephone : le gerant qui ouvre l'appli sur la tablette du bar, ou qui vide son
  navigateur, se retape les cinq ecrans. Aucune erreur visible, juste un `console.warn`.
- **Installations et departs ne sont comptes que depuis le 13/09/2026** (migration 0045 de la base clubbeur : `app_evenements`, `departs`, RPC `noter_evenement`). Une desinstallation ne se voit pas, et sur iPhone Safari et l'appli installee comptent pour deux appareils. `departs` ne garde rien d'identifiant, par choix (droit a l'effacement).
- **`outils/remise_a_zero/`** : les deux scripts SQL qui vident les donnees de test (un par base), a lancer par Julien dans le SQL Editor de Supabase. Sauvegarde prise avant dans `../sauvegardes/2026-09-13-avant-remise-a-zero/`.
- **Le code de connexion de l'appli clubbeur fait 6 chiffres** (depuis le 15/09/2026, a la demande
  de Julien). `mailer_otp_length` = 6 dans la base clubbeur ET `LONGUEUR_CODE = 6` dans
  `app-preview.html` : les deux bougent ensemble ou plus aucun code ne passe. L'e-mail (francais,
  code en gros, lien de secours, expediteur « Noctify ») vit dans `outils/emails/connexion.html` et
  se pose avec `node outils/emails/appliquer_modeles.cjs` (`--lire` pour voir l'etat sans rien changer).
- **Ne jamais commit `.env.local`** (deja dans `.gitignore`).
- `app.css` et `admin.css` peuvent redefinir des variables qui existent deja dans
  `theme.css`. En cas de couleur inattendue, chercher la collision.

## 9. Conventions

- **Commentaires et messages de commit en francais**, sans accents dans les commentaires
  de code (le reste du projet est comme ca).
- Les commentaires expliquent *pourquoi*, pas *quoi*. Le code dit deja quoi.
- Textes d'interface en francais, avec accents, orthographe soignee. Julien y tient.
- Les erreurs Supabase arrivent en anglais et sont trop techniques : toujours les
  traduire pour l'utilisateur final (voir `messageErreur` dans `auth.js`).
