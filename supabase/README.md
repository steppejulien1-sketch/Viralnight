# Supabase setup ViralNight

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
