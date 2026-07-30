# Supabase setup ViralNight

## Installation rapide (recommandee)

Tout le SQL de Viral Intelligence et de la collecte est regroupe dans un seul fichier
rejouable : `supabase/migrations/SETUP_COMPLET.sql`.

```bash
npm run dev
```

Puis ouvrir **http://127.0.0.1:5173/setup.html** : la page donne le lien direct vers ton
SQL Editor, un bouton pour copier le script, et verifie ensuite en direct ce qui est
reellement installe.

La verification distingue trois etats — installe, manquant, **indetermine**. Ce dernier
apparait quand Supabase est injoignable : sans lui, une coupure reseau afficherait tout
au vert et laisserait croire que la base est prete alors qu'elle est vide.

Le reste de ce document detaille chaque migration prise separement.

---


## 1. Variables d'environnement

Créer ou compléter `.env.local` à la racine du projet Vite :

```env
VITE_SUPABASE_URL=https://TON-PROJET.supabase.co
VITE_SUPABASE_ANON_KEY=ta_cle_publishable_ou_anon
```

La clé `VITE_SUPABASE_ANON_KEY` peut être la clé publishable publique.
Ne jamais mettre la clé `service_role` dans le front.

## 2. Créer les tables

Dans Supabase Dashboard :

1. Ouvrir le projet.
2. Aller dans `SQL Editor`.
3. Coller le contenu de :
   `supabase/migrations/202606270001_initial_schema.sql`
4. Cliquer sur `Run`.
5. Coller ensuite le contenu de :
   `supabase/migrations/202606270002_establishment_point_rules.sql`
6. Cliquer sur `Run`.
7. Executer ensuite les migrations suivantes dans l'ordre :
   `supabase/migrations/202606300001_demo_requests.sql`
   `supabase/migrations/202606300002_remove_validation_point_rewards.sql`

Le fichier crée :

- `establishments`
- `establishment_owners`
- `submissions`
- `rewards`
- `reward_redemptions`
- `establishment_point_rules`
- index utiles
- fonction `current_establishment_id()`
- RLS + policies

## 3. Créer un premier owner

Depuis l'admin ViralNight, le plus simple est d'utiliser le formulaire `Créer un client`.
Il crée automatiquement l'établissement, le compte Auth, le lien `establishment_owners`,
le barème par défaut, les premières récompenses et l'email de création du mot de passe.

Pour que ce bouton fonctionne en production, ajouter dans Vercel :

```text
SUPABASE_SERVICE_ROLE_KEY=clé service_role du projet Supabase
SITE_URL=https://viralnight-koif.vercel.app
```

La clé `service_role` doit rester côté serveur uniquement. Elle ne doit jamais être exposée
dans `VITE_...` ni dans le navigateur.

Création manuelle alternative :

Dans Supabase Dashboard :

1. Aller dans `Authentication > Users`.
2. Créer un utilisateur avec l'email owner. Le mot de passe peut être défini directement dans Supabase, ou créé ensuite par le client depuis le bouton `Créer / changer mot de passe` du dashboard.
3. Copier son `User UID`.

Ensuite, dans `SQL Editor`, adapter et exécuter :

```sql
insert into public.establishments (id, name, address, city, category, subscription_status)
values (
  gen_random_uuid(),
  'Mirage Club Brussels',
  'Avenue Louise 100',
  'Brussels',
  'club',
  'essai'
)
returning id;
```

Copier l'id retourné, puis adapter :

```sql
insert into public.establishment_owners (id, email, establishment_id, role)
values (
  'USER_UID_AUTH_SUPABASE',
  'owner@club.com',
  'ESTABLISHMENT_ID_RETOURNE',
  'owner'
);
```

## 4. Ajouter un barème de points de départ

Adapter `ESTABLISHMENT_ID_RETOURNE` :

```sql
insert into public.establishment_point_rules (
  establishment_id,
  validated_publication,
  video_views_per_thousand,
  validated_story,
  story_views_per_thousand,
  viral_bonus,
  club_mention,
  qr_checkin,
  monthly_ambassador
)
values (
  'ESTABLISHMENT_ID_RETOURNE',
  0,
  25,
  0,
  80,
  90,
  20,
  15,
  350
);
```

Les champs `validated_publication` et `validated_story` restent presents pour compatibilite,
mais la validation ne donne plus de points. Les points viennent des vues et des actions mesurables.

Le dashboard peut aussi créer cette ligne automatiquement au premier changement de barème,
tant que l'owner est connecté et que les policies RLS sont actives.

## 5. Ajouter des récompenses de départ

Adapter `ESTABLISHMENT_ID_RETOURNE` :

```sql
insert into public.rewards (establishment_id, title, points_required, active)
values
  ('ESTABLISHMENT_ID_RETOURNE', 'Vestiaire offert', 40, true),
  ('ESTABLISHMENT_ID_RETOURNE', 'Boisson soft ou shot', 70, true),
  ('ESTABLISHMENT_ID_RETOURNE', 'Boisson premium', 110, true),
  ('ESTABLISHMENT_ID_RETOURNE', 'Coupe-file', 160, true),
  ('ESTABLISHMENT_ID_RETOURNE', 'Entree gratuite', 240, true),
  ('ESTABLISHMENT_ID_RETOURNE', 'Bracelet +1 invite', 330, true),
  ('ESTABLISHMENT_ID_RETOURNE', 'Surclassement table', 500, true),
  ('ESTABLISHMENT_ID_RETOURNE', 'Acces VIP / backroom', 700, true);
```

## 5quater. Collecte des statistiques (le QR code)

C'est le point d'entree de toute la chaine : **sans scan, aucune donnee n'est collectee**
et toutes les analyses restent vides.

Executer `supabase/migrations/202607290004_tracking_public_code.sql`. Elle ajoute :

- `establishments.public_code` : code court encode dans le QR (jamais l'UUID, qui
  permettrait d'enumerer les etablissements) ;
- un index unique `(event_id, customer_id)` sur `qr_scans` : un client ne compte qu'une
  fois par soiree, meme s'il rafraichit la page ;
- `submissions.declared_views` : les vues **annoncees** par le client, distinctes de
  `views_count` qui reste la valeur validee par le staff ;
- `submissions.source` : distingue une saisie staff d'une soumission client.

### Le parcours complet

1. Le gerant ouvre `qr.html`, telecharge ou imprime son QR code, et l'affiche a l'entree.
2. Le client scanne -> `scan.html?c=CODE` -> `POST /api/track-scan` enregistre son passage.
   Le trigger SQL resout la soiree a partir de l'heure et des horaires d'ouverture, et la
   cree si c'est le premier scan de la nuit.
3. Le client publie sa story, colle le lien -> `POST /api/track-post` cree une `submission`
   en statut `pending`, rattachee automatiquement a la meme soiree.
4. Le staff valide le contenu depuis `admin.html` et saisit le nombre de vues reel.
5. Les analyses se recalculent : DJs, recompenses, heures de publication.

### Points de vigilance

- Les clients **ne sont pas authentifies**. Les routes `track-*` sont donc publiques :
  elles valident strictement le code et l'identifiant, limitent le debit par IP, et
  n'exposent jamais d'erreur interne.
- L'identifiant client est un UUID anonyme stocke dans le navigateur. Aucune donnee
  personnelle (nom, email, telephone) n'est collectee.
- Les points ne sont **jamais** attribues sur la base du nombre de vues annonce par le
  client : la validation staff reste obligatoire.

## 5ter. Tester l'API en local

Les fonctions `api/*.js` sont des fonctions serverless Vercel. Elles sont desormais servies
aussi par `npm run dev`, grace au plugin `vite-plugin-api.js` : un appel a
`/api/viral-intelligence` execute reellement le handler, comme en production.

Pour que l'API reponde autre chose qu'une erreur de configuration, `.env.local` doit contenir
les cles serveur (elles ne sont PAS prefixees `VITE_`, donc jamais exposees au navigateur) :

```env
SUPABASE_SERVICE_ROLE_KEY=cle service_role du projet Supabase
OPENAI_API_KEY=optionnel
GOOGLE_PLACES_API_KEY=optionnel
```

Verification rapide, sans session : la reponse attendue est `401 Session requise.`

```bash
curl -i "http://127.0.0.1:5173/api/viral-intelligence?eventId=test"
```

La page `demo.html` s'adapte automatiquement :

- **owner connecte** -> les soirees viennent de Supabase et l'analyse de `/api/viral-intelligence` ;
- **pas de session** -> le meme moteur tourne dans le navigateur sur des donnees generees,
  et un bandeau precise que les chiffres sont fictifs.

## 5bis. Viral Intelligence™ : soirees et metriques

Executer `supabase/migrations/202607290001_viral_intelligence_events.sql` dans le `SQL Editor`
(cree `events`, `qr_scans`, `event_metrics`, rattache `submissions`/`reward_redemptions` a un `event_id`).

Ajouter ensuite dans `.env.local` (local) et dans Vercel (prod) :

```text
SUPABASE_SERVICE_ROLE_KEY=clé service_role du projet Supabase
OPENAI_API_KEY=clé OpenAI (optionnelle : sans elle, les recommandations restent affichées, juste sans reformulation IA)
```

Executer ensuite, dans l'ordre :

```text
supabase/migrations/202607290002_auto_event_scheduling.sql
supabase/migrations/202607290003_per_day_opening_hours.sql
```

Pour l'import Google, ajouter aussi (optionnel mais recommande) :

```text
GOOGLE_PLACES_API_KEY=cle API Google avec Places API (New) activee
```

Sans cette cle, l'import bascule sur une lecture de la page Google Maps publique :
ca depanne, mais c'est fragile (Google change son HTML sans preavis) et l'interface
affiche alors un avertissement invitant a verifier les horaires importes.

### Comment fonctionne la creation automatique

Le gerant renseigne ses horaires dans `viral-intelligence.html`, soit en collant le lien
de sa fiche Google Maps (panneau `Import Google`, tout est recupere et enregistre en une
fois), soit a la main jour par jour. Ensuite, plus personne ne cree de soiree :

1. Des qu'un scan QR, une publication ou une reclamation arrive, un trigger SQL rattache
   automatiquement la ligne a la bonne soiree, et cree cette soiree si elle n'existe pas.
2. Chaque jour a ses propres horaires. Un club ouvert vendredi 22h-06h et dimanche 15h-23h
   est correctement gere : une publication du dimanche apres-midi va sur la soiree du
   dimanche, une publication du samedi 02h va sur la soiree du **vendredi**.
   C'est la fonction `resolve_event_night()`, qui teste les deux nuits candidates.
3. Une activite en dehors de toute plage d'ouverture ne cree aucune soiree
   (pas de soirees fantomes un mardi apres-midi).
4. Les prochaines soirees sont pre-creees pour que le gerant les voie a l'avance, soit au
   chargement du dashboard, soit via le script ci-dessous.

Pre-creer les soirees a venir (14 jours par defaut) :

```powershell
node scripts/precreate-events.js
```

Alternative 100% Supabase avec `pg_cron`, une fois par jour :

```sql
select cron.schedule('precreate-events', '0 12 * * *', $$select public.precreate_upcoming_events(14)$$);
```

### Creation manuelle (optionnelle)

Pour une soiree exceptionnelle un jour de fermeture, utiliser le bloc
`Ajouter une soiree exceptionnelle` du dashboard, ou directement en SQL :

```sql
insert into public.events (establishment_id, name, event_date, dj_name, participants_count)
values ('ESTABLISHMENT_ID_RETOURNE', 'Soiree Halloween', '2026-10-31', 'DJ Martin', 320)
returning id;
```

Rattacher les submissions/reward_redemptions **historiques** (anterieures aux triggers) a une soiree.
Les nouvelles lignes sont rattachees automatiquement, ceci ne sert qu'au rattrapage :

```sql
update public.submissions set event_id = 'EVENT_ID_RETOURNE' where establishment_id = 'ESTABLISHMENT_ID_RETOURNE' and event_id is null;
update public.reward_redemptions set event_id = 'EVENT_ID_RETOURNE'
  where event_id is null and reward_id in (select id from public.rewards where establishment_id = 'ESTABLISHMENT_ID_RETOURNE');
```

Puis recalculer les metriques (necessite `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`) :

```powershell
node scripts/recompute-event-metrics.js ESTABLISHMENT_ID_RETOURNE
```

Ouvrir ensuite `http://127.0.0.1:5173/viral-intelligence.html` (owner connecte requis).

## 6. Tester le dashboard

Lancer le projet :

```powershell
npm run dev
```

Ouvrir :

```text
http://127.0.0.1:5173/app.html
```

Si `.env.local` n'a pas encore d'URL Supabase ou si aucun owner n'est connecté,
le dashboard reste en mode démo.

Quand Supabase est configuré :

1. Si le client n'a pas encore de mot de passe, entrer l'email du club puis cliquer sur `Créer / changer mot de passe`.
2. Le client ouvre l'email Supabase, définit son mot de passe, puis revient sur le dashboard.
3. Entrer l'email du club et son mot de passe.
4. Le dashboard charge les données filtrées par RLS pour cet établissement.
