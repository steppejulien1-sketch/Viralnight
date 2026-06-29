-- Schema Supabase initial de ViralNight
-- Cette migration cree les tables principales du dashboard B2B et les regles RLS.
-- A executer seulement apres relecture dans le SQL Editor de Supabase.

create extension if not exists pgcrypto;

-- Table establishments
-- Represente les bars, restaurants, clubs et lieux clients qui utilisent ViralNight.
-- Chaque compte owner/manager sera rattache a un seul establishment.
create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  category text not null default 'club'
    check (category in ('bar', 'restaurant', 'club', 'event_venue', 'other')),
  subscription_status text not null default 'essai'
    check (subscription_status in ('actif', 'essai', 'suspendu')),
  created_at timestamptz not null default now()
);

comment on table public.establishments is
  'Bars, restaurants, clubs et lieux clients qui utilisent ViralNight.';

-- Table establishment_owners
-- Represente les comptes qui se connectent au dashboard.
-- id reference auth.users(id), ce qui permet aux policies RLS de comparer avec auth.uid().
create table if not exists public.establishment_owners (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'manager')),
  created_at timestamptz not null default now()
);

comment on table public.establishment_owners is
  'Comptes dashboard lies a un establishment. id correspond a auth.users.id.';

-- Table submissions
-- Represente les contenus sociaux envoyes par les clients finaux.
-- customer_id est volontairement un UUID sans cle etrangere pour l'instant :
-- la future web app mobile pourra plus tard le relier a une table customers.
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  customer_id uuid not null,
  platform text not null
    check (platform in ('tiktok', 'instagram', 'youtube')),
  content_type text not null
    check (content_type in ('story', 'reel', 'post', 'video')),
  url text not null,
  views_count integer not null default 0
    check (views_count >= 0),
  points_awarded integer not null default 0
    check (points_awarded >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'validated', 'rejected')),
  submitted_at timestamptz not null default now()
);

comment on table public.submissions is
  'Contenus clients soumis pour gagner des points. Les points attribues restent historises sur chaque contenu.';

-- Table rewards
-- Represente les recompenses configurees par chaque establishment.
-- Les regles de calcul des points ne sont pas stockees ici : elles vivent dans establishment_point_rules.
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  title text not null,
  points_required integer not null
    check (points_required >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.rewards is
  'Recompenses proposees par chaque establishment, avec seuils de points configurables.';

-- Table reward_redemptions
-- Represente l'historique des recompenses reclamees ou utilisees par les clients finaux.
-- customer_id est volontairement un UUID sans cle etrangere pour l'instant.
create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards(id) on delete cascade,
  customer_id uuid not null,
  redeemed_at timestamptz not null default now(),
  status text not null default 'claimed'
    check (status in ('claimed', 'used'))
);

comment on table public.reward_redemptions is
  'Historique des recompenses reclamees ou utilisees par les clients finaux.';

-- Index utiles pour les lectures du dashboard et les futurs parcours mobile.
create index if not exists establishments_created_at_idx
  on public.establishments (created_at desc);

create index if not exists establishment_owners_establishment_id_idx
  on public.establishment_owners (establishment_id);

create index if not exists submissions_establishment_id_submitted_at_idx
  on public.submissions (establishment_id, submitted_at desc);

create index if not exists submissions_establishment_id_status_idx
  on public.submissions (establishment_id, status);

create index if not exists rewards_establishment_id_active_idx
  on public.rewards (establishment_id, active);

create index if not exists reward_redemptions_reward_id_redeemed_at_idx
  on public.reward_redemptions (reward_id, redeemed_at desc);

-- Helper securite : retourne l'establishment lie a l'utilisateur connecte.
-- SECURITY DEFINER evite une recursion RLS quand les policies doivent lire establishment_owners.
create or replace function public.current_establishment_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select eo.establishment_id
  from public.establishment_owners eo
  where eo.id = auth.uid()
  limit 1
$$;

comment on function public.current_establishment_id() is
  'Retourne establishment_id pour le owner/manager connecte au dashboard.';

-- Activation de RLS sur toutes les tables metier.
alter table public.establishments enable row level security;
alter table public.establishment_owners enable row level security;
alter table public.submissions enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_redemptions enable row level security;

-- Establishments : les owners/managers lisent uniquement leur propre establishment.
drop policy if exists "establishments_select_own" on public.establishments;
create policy "establishments_select_own"
on public.establishments
for select
to authenticated
using (id = public.current_establishment_id());

-- Establishment owners : un utilisateur lit uniquement les comptes lies a son establishment.
drop policy if exists "establishment_owners_select_same_establishment" on public.establishment_owners;
create policy "establishment_owners_select_same_establishment"
on public.establishment_owners
for select
to authenticated
using (establishment_id = public.current_establishment_id());

-- Submissions : les utilisateurs dashboard lisent et mettent a jour seulement les contenus de leur establishment.
drop policy if exists "submissions_select_own_establishment" on public.submissions;
create policy "submissions_select_own_establishment"
on public.submissions
for select
to authenticated
using (establishment_id = public.current_establishment_id());

drop policy if exists "submissions_update_own_establishment" on public.submissions;
create policy "submissions_update_own_establishment"
on public.submissions
for update
to authenticated
using (establishment_id = public.current_establishment_id())
with check (establishment_id = public.current_establishment_id());

-- Rewards : les utilisateurs dashboard gerent seulement les recompenses de leur establishment.
drop policy if exists "rewards_select_own_establishment" on public.rewards;
create policy "rewards_select_own_establishment"
on public.rewards
for select
to authenticated
using (establishment_id = public.current_establishment_id());

drop policy if exists "rewards_insert_own_establishment" on public.rewards;
create policy "rewards_insert_own_establishment"
on public.rewards
for insert
to authenticated
with check (establishment_id = public.current_establishment_id());

drop policy if exists "rewards_update_own_establishment" on public.rewards;
create policy "rewards_update_own_establishment"
on public.rewards
for update
to authenticated
using (establishment_id = public.current_establishment_id())
with check (establishment_id = public.current_establishment_id());

drop policy if exists "rewards_delete_own_establishment" on public.rewards;
create policy "rewards_delete_own_establishment"
on public.rewards
for delete
to authenticated
using (establishment_id = public.current_establishment_id());

-- Reward redemptions : l'acces est limite via l'establishment_id de la reward liee.
drop policy if exists "reward_redemptions_select_own_establishment" on public.reward_redemptions;
create policy "reward_redemptions_select_own_establishment"
on public.reward_redemptions
for select
to authenticated
using (
  exists (
    select 1
    from public.rewards r
    where r.id = reward_redemptions.reward_id
      and r.establishment_id = public.current_establishment_id()
  )
);

drop policy if exists "reward_redemptions_update_own_establishment" on public.reward_redemptions;
create policy "reward_redemptions_update_own_establishment"
on public.reward_redemptions
for update
to authenticated
using (
  exists (
    select 1
    from public.rewards r
    where r.id = reward_redemptions.reward_id
      and r.establishment_id = public.current_establishment_id()
  )
)
with check (
  exists (
    select 1
    from public.rewards r
    where r.id = reward_redemptions.reward_id
      and r.establishment_id = public.current_establishment_id()
  )
);
