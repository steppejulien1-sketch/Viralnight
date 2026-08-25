-- Suivi des abonnes Instagram gagnes depuis l'inscription du club.
--
-- Julien : "je puisse voir aussi combien est-ce qu'ils ont gagne d'abonnes
-- depuis qu'ils sont avec moi". La connexion Instagram existante
-- (establishment_instagram_accounts) ne detecte que les mentions -- elle
-- n'a jamais releve le nombre d'abonnes dans le temps. Un releve
-- quotidien (cron, voir api/instagram.js action=collecter-abonnes) permet
-- de comparer le premier et le dernier releve pour un club.

create table if not exists public.establishment_follower_history (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references public.establishments(id) on delete cascade,
  follower_count    integer not null check (follower_count >= 0),
  recorded_at       timestamptz not null default now(),
  -- Colonne generee (pas une expression d'index directe) : caster un
  -- timestamptz en date depend du fuseau, donc pas IMMUTABLE -- Postgres
  -- refuse un index sur une telle expression. Fige en UTC, calculee une
  -- fois a l'ecriture.
  recorded_date     date generated always as ((recorded_at at time zone 'utc')::date) stored
);

comment on table public.establishment_follower_history is
  'Un releve = un jour = un nombre d''abonnes Instagram pour un club. Alimente uniquement par le cron (service_role) -- jamais ecrit par le club ni le clubbeur.';

-- Un seul releve par club et par jour : le cron peut se redeclencher (retry
-- Vercel, execution manuelle) sans dupliquer la journee.
create unique index if not exists establishment_follower_history_par_jour
  on public.establishment_follower_history (establishment_id, recorded_date);

create index if not exists establishment_follower_history_chrono
  on public.establishment_follower_history (establishment_id, recorded_at);

alter table public.establishment_follower_history enable row level security;

drop policy if exists "follower_history_select_own_establishment" on public.establishment_follower_history;
create policy "follower_history_select_own_establishment"
  on public.establishment_follower_history
  for select
  using (establishment_id = public.current_establishment_id());

drop policy if exists "follower_history_select_admin" on public.establishment_follower_history;
create policy "follower_history_select_admin"
  on public.establishment_follower_history
  for select
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

-- Aucune policy insert/update/delete : les ecritures passent uniquement par
-- le cron (cle service_role, qui contourne RLS), jamais par le navigateur --
-- meme principe que event_metrics (SETUP_COMPLET.sql), reserve au serveur.
