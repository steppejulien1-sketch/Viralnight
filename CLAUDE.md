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

Le depot parent `Noctify-ClaudeCode-FULL/` contient 5 dossiers. **Un seul est vivant :
celui-ci** (`01-base-fonctionnelle-vite-supabase-api/`). C'est lui qui est deploye.

| Dossier | Statut |
|---|---|
| `01-base-fonctionnelle-vite-supabase-api` | **LE projet.** Tout se fait ici. |
| `02-projet-nextjs-experimental` | Abandonne. Ne pas y toucher. |
| `03-ancien-mvp-client-rewards` | Archive historique. |
| `04-liens-utiles-production` | Notes et liens. |
| `05-refonte-wetransfer-julien` | Maquettes de reference pour le design. Source d'inspiration, jamais de code a copier tel quel. |

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
| `app-preview.html` | Maquette autoportante de l'app mobile "clubbeur" (cote client final : scan QR, points, boutique, carte des clubs). Un seul gros fichier, branche sur les vraies fonctions RPC Supabase (`submit_story`, `redeem_reward`, `checkin_scan`...). **Double vie** : au navigateur c'est la maquette de demonstration ; installee sur l'ecran d'accueil ou dans Capacitor, la classe `.mode-appli` fait tomber l'habillage et l'appli passe en plein ecran. Tester avec `?app=1`. Voir `MOBILE.md`. |
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
```

Tout ce qui est dans `lib/` est teste par `scripts/test-*.mjs`. **Si tu modifies
`lib/`, lance `npm test`.**

### Base de donnees

Migrations dans `supabase/migrations/`, appliquees par `npm run db:apply`.

Tables : `establishments`, `establishment_owners`, `establishment_point_rules`,
`establishment_point_rule_items`, `establishment_opening_hours`,
`establishment_schedule`, `events`, `event_metrics`, `submissions`, `qr_scans`,
`rewards`, `reward_redemptions`, `demo_requests`, `establishment_instagram_accounts`,
`instagram_mentions`.

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

Le compte admin est `viralnight001@gmail.com` (constante `ADMIN_EMAIL`, dupliquee
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
  `SUPABASE_CLUBBEUR_SERVICE_ROLE_KEY`, `INSTAGRAM_FORFAIT_STORY`) ne vivent que sur Vercel. En local, les routes qui en
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
