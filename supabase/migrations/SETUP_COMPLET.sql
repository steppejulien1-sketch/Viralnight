-- ============================================================================
-- ViralNight — Installation complete de la collecte et de l'analyse
--
-- Colle ce fichier ENTIER dans le SQL Editor de Supabase, puis clique sur Run.
-- Il regroupe les 4 migrations dans l'ordre et peut etre relance sans risque
-- (toutes les creations sont conditionnelles).
--
-- Ce qu'il installe :
--   1. Les soirees (events), les scans QR et le cache de metriques
--   2. La creation automatique des soirees selon les horaires d'ouverture
--   3. Les horaires jour par jour (une soiree traverse minuit)
--   4. Le QR code public : le point d'entree de toute la collecte
--
-- Apres execution, ouvre /setup.html dans ton navigateur pour verifier.
-- ============================================================================



-- ============================================================================
-- Source : 202607290001_viral_intelligence_events.sql
-- ============================================================================

-- Viral Intelligence(TM) : modele de donnees "soiree"
-- Ajoute la notion d'Event (soiree), les scans QR horodates, et un cache de metriques
-- par soiree utilise par le moteur d'analyse. Rattache submissions/reward_redemptions
-- a une soiree via event_id (nullable : le contenu historique reste valide sans soiree).

-- Table events
-- Represente une soiree organisee par un establishment.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null,
  event_date date not null,
  dj_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  participants_count integer not null default 0
    check (participants_count >= 0),
  created_at timestamptz not null default now()
);

comment on table public.events is
  'Soirees organisees par un establishment. Point d''ancrage de Viral Intelligence.';

-- Table qr_scans
-- Represente les scans QR horodates pendant une soiree (n'existait pas avant).
create table if not exists public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  customer_id uuid not null,
  scanned_at timestamptz not null default now()
);

comment on table public.qr_scans is
  'Scans QR horodates lies a une soiree, utilises pour la heatmap horaire.';

-- Rattachement des tables existantes a une soiree.
-- Nullable : les submissions/reward_redemptions anterieures a cette feature restent valides.
alter table public.submissions
  add column if not exists event_id uuid references public.events(id) on delete set null;

alter table public.reward_redemptions
  add column if not exists event_id uuid references public.events(id) on delete set null;

-- Table event_metrics
-- Cache des metriques agregees par soiree, recalcule par le job d'analyse
-- (pas de recalcul live a chaque affichage du dashboard).
create table if not exists public.event_metrics (
  event_id uuid primary key references public.events(id) on delete cascade,
  total_reach integer not null default 0
    check (total_reach >= 0),
  stories_count integer not null default 0
    check (stories_count >= 0),
  reels_count integer not null default 0
    check (reels_count >= 0),
  tiktoks_count integer not null default 0
    check (tiktoks_count >= 0),
  points_distributed integer not null default 0
    check (points_distributed >= 0),
  rewards_claimed_count integer not null default 0
    check (rewards_claimed_count >= 0),
  scans_count integer not null default 0
    check (scans_count >= 0),
  viral_score numeric(5,2),
  score_breakdown jsonb,
  ai_narrative jsonb,
  computed_at timestamptz not null default now()
);

comment on table public.event_metrics is
  'Cache des metriques et du Viral Score par soiree, recalcule par scripts/recompute-event-metrics.js.';

-- Index utiles pour les lectures du dashboard Viral Intelligence.
create index if not exists events_establishment_date_idx
  on public.events (establishment_id, event_date desc);

create index if not exists qr_scans_event_scanned_idx
  on public.qr_scans (event_id, scanned_at);

create index if not exists submissions_event_idx
  on public.submissions (event_id);

create index if not exists reward_redemptions_event_idx
  on public.reward_redemptions (event_id);

-- Activation de RLS.
alter table public.events enable row level security;
alter table public.qr_scans enable row level security;
alter table public.event_metrics enable row level security;

-- Events : les owners/managers lisent et gerent seulement les soirees de leur establishment.
drop policy if exists "events_select_own_establishment" on public.events;
create policy "events_select_own_establishment"
on public.events
for select
to authenticated
using (establishment_id = public.current_establishment_id());

drop policy if exists "events_insert_own_establishment" on public.events;
create policy "events_insert_own_establishment"
on public.events
for insert
to authenticated
with check (establishment_id = public.current_establishment_id());

drop policy if exists "events_update_own_establishment" on public.events;
create policy "events_update_own_establishment"
on public.events
for update
to authenticated
using (establishment_id = public.current_establishment_id())
with check (establishment_id = public.current_establishment_id());

drop policy if exists "events_delete_own_establishment" on public.events;
create policy "events_delete_own_establishment"
on public.events
for delete
to authenticated
using (establishment_id = public.current_establishment_id());

-- QR scans : acces limite via l'establishment_id de la soiree liee.
drop policy if exists "qr_scans_select_own_establishment" on public.qr_scans;
create policy "qr_scans_select_own_establishment"
on public.qr_scans
for select
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = qr_scans.event_id
      and e.establishment_id = public.current_establishment_id()
  )
);

-- Event metrics : lecture seule cote dashboard, ecriture reservee au service_role (job de recalcul).
drop policy if exists "event_metrics_select_own_establishment" on public.event_metrics;
create policy "event_metrics_select_own_establishment"
on public.event_metrics
for select
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_metrics.event_id
      and e.establishment_id = public.current_establishment_id()
  )
);


-- ============================================================================
-- Source : 202607290002_auto_event_scheduling.sql
-- ============================================================================

-- Viral Intelligence(TM) : creation automatique des soirees selon les jours d'ouverture.
--
-- Principe : une soiree traverse minuit. Une story publiee a 02h le samedi appartient
-- a la soiree du vendredi. On resout donc la "nuit" a laquelle appartient un timestamp
-- en retranchant l'heure de fermeture, puis on cree la soiree a la volee si le jour
-- correspond a un jour d'ouverture configure pour l'establishment.
--
-- Consequence : plus personne n'a besoin de creer une soiree a la main. Le premier
-- scan QR ou la premiere publication de la nuit cree l'Event automatiquement.

-- Une seule soiree par nuit et par establishment (necessaire pour l'upsert concurrent).
alter table public.events
  drop constraint if exists events_establishment_date_unique;
alter table public.events
  add constraint events_establishment_date_unique unique (establishment_id, event_date);

-- qr_scans doit pouvoir etre insere sans connaitre l'event : le trigger le resout.
alter table public.qr_scans
  add column if not exists establishment_id uuid references public.establishments(id) on delete cascade;
alter table public.qr_scans
  alter column event_id drop not null;

-- Table establishment_schedule
-- Configuration des jours et horaires d'ouverture, par establishment.
create table if not exists public.establishment_schedule (
  establishment_id uuid primary key references public.establishments(id) on delete cascade,
  -- Jours d'ouverture au format Postgres dow : 0=dimanche, 1=lundi ... 6=samedi.
  opening_weekdays smallint[] not null default '{5,6}',
  opens_at time not null default '22:00',
  closes_at time not null default '06:00',
  timezone text not null default 'Europe/Brussels',
  auto_create_events boolean not null default true,
  -- {date} est remplace par la date de la soiree.
  event_name_template text not null default 'Soiree du {date}',
  default_dj_name text,
  updated_at timestamptz not null default now()
);

comment on table public.establishment_schedule is
  'Jours et horaires d''ouverture par establishment. Pilote la creation automatique des soirees.';

-- Resout la nuit a laquelle appartient un timestamp.
-- On convertit en heure locale puis on retranche l'heure de fermeture : tout ce qui
-- arrive avant la fermeture est rattache a la date de la veille.
create or replace function public.resolve_night_date(
  ts timestamptz,
  tz text,
  closes_at time
)
returns date
language sql
stable
as $$
  select ((ts at time zone tz) - closes_at)::date;
$$;

comment on function public.resolve_night_date(timestamptz, text, time) is
  'Retourne la date de soiree correspondant a un timestamp, en tenant compte du passage de minuit.';

-- Retourne l'id de la soiree correspondant a un establishment + un timestamp,
-- en la creant si elle n'existe pas et si la nuit est un jour d'ouverture.
-- SECURITY DEFINER : les triggers doivent pouvoir inserer dans events malgre RLS.
create or replace function public.ensure_event_for_timestamp(
  p_establishment_id uuid,
  p_timestamp timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.establishment_schedule%rowtype;
  v_night_date date;
  v_event_id uuid;
  v_name text;
begin
  if p_establishment_id is null or p_timestamp is null then
    return null;
  end if;

  select * into v_schedule
  from public.establishment_schedule
  where establishment_id = p_establishment_id;

  -- Pas de configuration : on applique les valeurs par defaut plutot que de ne rien faire,
  -- pour qu'un club qui n'a jamais ouvert l'ecran de reglages soit quand meme analyse.
  if not found then
    v_schedule.opening_weekdays := '{5,6}';
    v_schedule.closes_at := '06:00';
    v_schedule.timezone := 'Europe/Brussels';
    v_schedule.auto_create_events := true;
    v_schedule.event_name_template := 'Soiree du {date}';
    v_schedule.default_dj_name := null;
  end if;

  v_night_date := public.resolve_night_date(p_timestamp, v_schedule.timezone, v_schedule.closes_at);

  -- Soiree deja existante (creee manuellement ou par un evenement precedent de la meme nuit).
  select id into v_event_id
  from public.events
  where establishment_id = p_establishment_id
    and event_date = v_night_date;

  if found then
    return v_event_id;
  end if;

  if not v_schedule.auto_create_events then
    return null;
  end if;

  -- Nuit hors jours d'ouverture : on ne cree rien (evite de polluer avec des soirees fantomes).
  if not (extract(dow from v_night_date)::smallint = any (v_schedule.opening_weekdays)) then
    return null;
  end if;

  v_name := replace(v_schedule.event_name_template, '{date}', to_char(v_night_date, 'DD/MM/YYYY'));

  insert into public.events (establishment_id, name, event_date, dj_name)
  values (p_establishment_id, v_name, v_night_date, v_schedule.default_dj_name)
  on conflict (establishment_id, event_date) do nothing
  returning id into v_event_id;

  -- Insertion concurrente gagnee par une autre transaction : on relit.
  if v_event_id is null then
    select id into v_event_id
    from public.events
    where establishment_id = p_establishment_id
      and event_date = v_night_date;
  end if;

  return v_event_id;
end;
$$;

comment on function public.ensure_event_for_timestamp(uuid, timestamptz) is
  'Retourne (et cree si besoin) la soiree correspondant a un timestamp pour un establishment.';

-- Trigger submissions : rattache automatiquement chaque contenu a sa soiree.
create or replace function public.assign_event_to_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_id is null then
    new.event_id := public.ensure_event_for_timestamp(new.establishment_id, new.submitted_at);
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_assign_event on public.submissions;
create trigger submissions_assign_event
before insert on public.submissions
for each row
execute function public.assign_event_to_submission();

-- Trigger qr_scans : resout l'establishment (soit fourni, soit via l'event) puis la soiree.
create or replace function public.assign_event_to_qr_scan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.establishment_id is null and new.event_id is not null then
    select establishment_id into new.establishment_id
    from public.events
    where id = new.event_id;
  end if;

  if new.event_id is null then
    new.event_id := public.ensure_event_for_timestamp(new.establishment_id, new.scanned_at);
  end if;

  return new;
end;
$$;

drop trigger if exists qr_scans_assign_event on public.qr_scans;
create trigger qr_scans_assign_event
before insert on public.qr_scans
for each row
execute function public.assign_event_to_qr_scan();

-- Trigger reward_redemptions : l'establishment se deduit de la recompense reclamee.
create or replace function public.assign_event_to_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  if new.event_id is null then
    select establishment_id into v_establishment_id
    from public.rewards
    where id = new.reward_id;

    new.event_id := public.ensure_event_for_timestamp(v_establishment_id, new.redeemed_at);
  end if;

  return new;
end;
$$;

drop trigger if exists reward_redemptions_assign_event on public.reward_redemptions;
create trigger reward_redemptions_assign_event
before insert on public.reward_redemptions
for each row
execute function public.assign_event_to_redemption();

-- Pre-cree les soirees a venir sur une fenetre glissante, pour qu'un gerant voie
-- les prochaines dates dans le dashboard avant meme le premier scan.
create or replace function public.precreate_upcoming_events(p_days_ahead integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.establishment_schedule%rowtype;
  v_date date;
  v_created integer := 0;
  v_inserted integer;
  v_name text;
begin
  for v_schedule in
    select * from public.establishment_schedule where auto_create_events
  loop
    for v_date in
      select generate_series(current_date, current_date + p_days_ahead, interval '1 day')::date
    loop
      if not (extract(dow from v_date)::smallint = any (v_schedule.opening_weekdays)) then
        continue;
      end if;

      v_name := replace(v_schedule.event_name_template, '{date}', to_char(v_date, 'DD/MM/YYYY'));

      insert into public.events (establishment_id, name, event_date, dj_name)
      values (v_schedule.establishment_id, v_name, v_date, v_schedule.default_dj_name)
      on conflict (establishment_id, event_date) do nothing;

      get diagnostics v_inserted = row_count;
      v_created := v_created + v_inserted;
    end loop;
  end loop;

  return v_created;
end;
$$;

comment on function public.precreate_upcoming_events(integer) is
  'Cree les soirees des jours d''ouverture a venir. A appeler via pg_cron ou scripts/precreate-events.js.';

create index if not exists qr_scans_establishment_idx
  on public.qr_scans (establishment_id, scanned_at);

-- RLS sur la configuration : chaque establishment gere seulement la sienne.
alter table public.establishment_schedule enable row level security;

drop policy if exists "establishment_schedule_select_own" on public.establishment_schedule;
create policy "establishment_schedule_select_own"
on public.establishment_schedule
for select
to authenticated
using (establishment_id = public.current_establishment_id());

drop policy if exists "establishment_schedule_insert_own" on public.establishment_schedule;
create policy "establishment_schedule_insert_own"
on public.establishment_schedule
for insert
to authenticated
with check (establishment_id = public.current_establishment_id());

drop policy if exists "establishment_schedule_update_own" on public.establishment_schedule;
create policy "establishment_schedule_update_own"
on public.establishment_schedule
for update
to authenticated
using (establishment_id = public.current_establishment_id())
with check (establishment_id = public.current_establishment_id());

-- Les scans QR doivent pouvoir etre lus via establishment_id direct, pas seulement via l'event.
drop policy if exists "qr_scans_select_own_establishment" on public.qr_scans;
create policy "qr_scans_select_own_establishment"
on public.qr_scans
for select
to authenticated
using (
  establishment_id = public.current_establishment_id()
  or exists (
    select 1
    from public.events e
    where e.id = qr_scans.event_id
      and e.establishment_id = public.current_establishment_id()
  )
);


-- ============================================================================
-- Source : 202607290003_per_day_opening_hours.sql
-- ============================================================================

-- Viral Intelligence(TM) : horaires d'ouverture jour par jour.
--
-- Remplace le couple global opens_at/closes_at par un horaire propre a chaque jour.
-- Un club peut ouvrir vendredi 22h-06h et dimanche 15h-23h : sans horaire par jour,
-- impossible de savoir a quelle soiree appartient une publication du dimanche apres-midi.
--
-- La resolution devient : pour un instant donne, on teste les deux nuits candidates
-- (le jour meme et la veille) et on retient celle dont la plage horaire contient l'instant.

-- Table establishment_opening_hours
-- Un enregistrement par jour de la semaine et par establishment.
create table if not exists public.establishment_opening_hours (
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  -- Convention Postgres dow : 0=dimanche, 1=lundi ... 6=samedi.
  weekday smallint not null check (weekday between 0 and 6),
  is_open boolean not null default false,
  opens_at time,
  closes_at time,
  primary key (establishment_id, weekday),
  -- Un jour ouvert doit avoir ses deux horaires renseignes.
  constraint opening_hours_complete check (
    not is_open or (opens_at is not null and closes_at is not null)
  )
);

comment on table public.establishment_opening_hours is
  'Horaires d''ouverture par jour de la semaine. closes_at <= opens_at signifie que la soiree traverse minuit.';

-- Reprise des donnees de l'ancien modele global, si la migration precedente a ete appliquee.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'establishment_schedule'
      and column_name = 'opening_weekdays'
  ) then
    insert into public.establishment_opening_hours (establishment_id, weekday, is_open, opens_at, closes_at)
    select
      s.establishment_id,
      d.weekday,
      d.weekday = any (s.opening_weekdays),
      case when d.weekday = any (s.opening_weekdays) then s.opens_at end,
      case when d.weekday = any (s.opening_weekdays) then s.closes_at end
    from public.establishment_schedule s
    cross join generate_series(0, 6) as d(weekday)
    on conflict (establishment_id, weekday) do nothing;
  end if;
end;
$$;

-- L'ancien modele global n'a plus lieu d'etre : les horaires vivent desormais par jour.
alter table public.establishment_schedule drop column if exists opening_weekdays;
alter table public.establishment_schedule drop column if exists opens_at;
alter table public.establishment_schedule drop column if exists closes_at;

-- Tracabilite de l'import Google.
alter table public.establishment_schedule
  add column if not exists google_place_id text,
  add column if not exists google_place_name text,
  add column if not exists google_synced_at timestamptz;

-- Resout la nuit a laquelle appartient un instant, en tenant compte des horaires du jour.
-- Retourne null si l'instant tombe en dehors de toute plage d'ouverture.
create or replace function public.resolve_event_night(
  p_establishment_id uuid,
  p_timestamp timestamptz
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_local timestamp;
  v_candidate date;
  v_offset integer;
  v_hours public.establishment_opening_hours%rowtype;
  v_start timestamp;
  v_end timestamp;
begin
  if p_establishment_id is null or p_timestamp is null then
    return null;
  end if;

  select coalesce(timezone, 'Europe/Brussels') into v_timezone
  from public.establishment_schedule
  where establishment_id = p_establishment_id;

  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_local := p_timestamp at time zone v_timezone;

  -- On teste d'abord la veille : une publication a 02h appartient en general
  -- a la soiree commencee la veille au soir.
  foreach v_offset in array array[-1, 0]
  loop
    v_candidate := (v_local::date) + v_offset;

    select * into v_hours
    from public.establishment_opening_hours
    where establishment_id = p_establishment_id
      and weekday = extract(dow from v_candidate)::smallint
      and is_open;

    if not found then
      continue;
    end if;

    v_start := v_candidate + v_hours.opens_at;
    -- Fermeture <= ouverture : la plage se termine le lendemain (soiree traversant minuit).
    v_end := case
      when v_hours.closes_at <= v_hours.opens_at then (v_candidate + 1) + v_hours.closes_at
      else v_candidate + v_hours.closes_at
    end;

    if v_local >= v_start and v_local < v_end then
      return v_candidate;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.resolve_event_night(uuid, timestamptz) is
  'Retourne la date de soiree correspondant a un instant, selon les horaires du jour. Null si hors ouverture.';

-- ensure_event_for_timestamp s'appuie desormais sur les horaires par jour.
create or replace function public.ensure_event_for_timestamp(
  p_establishment_id uuid,
  p_timestamp timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.establishment_schedule%rowtype;
  v_night_date date;
  v_event_id uuid;
  v_name text;
begin
  if p_establishment_id is null or p_timestamp is null then
    return null;
  end if;

  v_night_date := public.resolve_event_night(p_establishment_id, p_timestamp);

  -- Hors plage d'ouverture : aucune soiree n'est creee ni rattachee.
  if v_night_date is null then
    return null;
  end if;

  select id into v_event_id
  from public.events
  where establishment_id = p_establishment_id
    and event_date = v_night_date;

  if found then
    return v_event_id;
  end if;

  select * into v_schedule
  from public.establishment_schedule
  where establishment_id = p_establishment_id;

  if found and not v_schedule.auto_create_events then
    return null;
  end if;

  v_name := replace(
    coalesce(v_schedule.event_name_template, 'Soiree du {date}'),
    '{date}',
    to_char(v_night_date, 'DD/MM/YYYY')
  );

  insert into public.events (establishment_id, name, event_date, dj_name)
  values (p_establishment_id, v_name, v_night_date, v_schedule.default_dj_name)
  on conflict (establishment_id, event_date) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id
    from public.events
    where establishment_id = p_establishment_id
      and event_date = v_night_date;
  end if;

  return v_event_id;
end;
$$;

-- Pre-creation des soirees a venir, basee sur les jours reellement ouverts.
create or replace function public.precreate_upcoming_events(p_days_ahead integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_created integer := 0;
  v_inserted integer;
  v_name text;
begin
  for v_row in
    select
      h.establishment_id,
      d.day::date as event_date,
      coalesce(s.event_name_template, 'Soiree du {date}') as template,
      s.default_dj_name
    from public.establishment_opening_hours h
    join generate_series(current_date, current_date + p_days_ahead, interval '1 day') as d(day)
      on extract(dow from d.day)::smallint = h.weekday
    left join public.establishment_schedule s
      on s.establishment_id = h.establishment_id
    where h.is_open
      and coalesce(s.auto_create_events, true)
  loop
    v_name := replace(v_row.template, '{date}', to_char(v_row.event_date, 'DD/MM/YYYY'));

    insert into public.events (establishment_id, name, event_date, dj_name)
    values (v_row.establishment_id, v_name, v_row.event_date, v_row.default_dj_name)
    on conflict (establishment_id, event_date) do nothing;

    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;
  end loop;

  return v_created;
end;
$$;

-- L'ancienne fonction globale n'est plus utilisee.
drop function if exists public.resolve_night_date(timestamptz, text, time);

-- RLS : chaque establishment gere seulement ses propres horaires.
alter table public.establishment_opening_hours enable row level security;

drop policy if exists "opening_hours_select_own" on public.establishment_opening_hours;
create policy "opening_hours_select_own"
on public.establishment_opening_hours
for select
to authenticated
using (establishment_id = public.current_establishment_id());

drop policy if exists "opening_hours_insert_own" on public.establishment_opening_hours;
create policy "opening_hours_insert_own"
on public.establishment_opening_hours
for insert
to authenticated
with check (establishment_id = public.current_establishment_id());

drop policy if exists "opening_hours_update_own" on public.establishment_opening_hours;
create policy "opening_hours_update_own"
on public.establishment_opening_hours
for update
to authenticated
using (establishment_id = public.current_establishment_id())
with check (establishment_id = public.current_establishment_id());

drop policy if exists "opening_hours_delete_own" on public.establishment_opening_hours;
create policy "opening_hours_delete_own"
on public.establishment_opening_hours
for delete
to authenticated
using (establishment_id = public.current_establishment_id());


-- ============================================================================
-- Source : 202607290004_tracking_public_code.sql
-- ============================================================================

-- Collecte des statistiques : point d'entree public.
--
-- Jusqu'ici aucune table n'etait alimentee : il n'existait aucun moyen pour un client
-- du club de signaler sa presence ou sa publication. Cette migration cree ce point
-- d'entree, active par un QR code affiche a l'entree du club.
--
-- Principe : le QR contient un code public court, jamais l'UUID de l'etablissement.
-- Un UUID dans une URL publique permettrait d'enumerer les etablissements et de
-- deviner d'autres identifiants de la base.

-- Code public de l'etablissement, encode dans le QR code.
alter table public.establishments
  add column if not exists public_code text;

-- Genere un code court, lisible et non sequentiel (pas de 0/O/1/I pour eviter
-- les confusions si quelqu'un doit le saisir a la main).
create or replace function public.generate_public_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;

    exit when not exists (select 1 from public.establishments where public_code = v_code);

    v_attempt := v_attempt + 1;
    if v_attempt > 50 then
      raise exception 'Impossible de generer un code public unique.';
    end if;
  end loop;

  return v_code;
end;
$$;

-- Attribution d'un code aux etablissements existants.
update public.establishments
set public_code = public.generate_public_code()
where public_code is null;

alter table public.establishments
  alter column public_code set not null;

alter table public.establishments
  drop constraint if exists establishments_public_code_unique;
alter table public.establishments
  add constraint establishments_public_code_unique unique (public_code);

-- Tout nouvel etablissement recoit son code automatiquement.
create or replace function public.set_public_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null then
    new.public_code := public.generate_public_code();
  end if;
  return new;
end;
$$;

drop trigger if exists establishments_set_public_code on public.establishments;
create trigger establishments_set_public_code
before insert on public.establishments
for each row
execute function public.set_public_code();

-- Un client ne compte qu'une fois par soiree : sans cette contrainte, rafraichir la page
-- du QR gonflerait artificiellement la frequentation.
create unique index if not exists qr_scans_event_customer_unique
  on public.qr_scans (event_id, customer_id)
  where event_id is not null;

-- Meme logique pour les publications : un client ne peut pas soumettre deux fois la meme URL.
create unique index if not exists submissions_event_url_unique
  on public.submissions (event_id, url)
  where event_id is not null;

-- Vues declarees par le client, distinctes de views_count qui reste la valeur validee
-- par le staff. On garde les deux pour pouvoir mesurer l'ecart et detecter les abus.
alter table public.submissions
  add column if not exists declared_views integer
    check (declared_views is null or declared_views >= 0);

alter table public.submissions
  add column if not exists source text not null default 'staff'
    check (source in ('staff', 'customer_qr'));

comment on column public.submissions.declared_views is
  'Nombre de vues annonce par le client. views_count reste la valeur validee par le staff.';

-- Resout un etablissement depuis son code public, sans exposer la table entiere.
-- SECURITY DEFINER : appelable par le role anon pour la page de scan.
create or replace function public.establishment_by_public_code(p_code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name
  from public.establishments e
  where e.public_code = upper(trim(p_code))
  limit 1;
$$;

comment on function public.establishment_by_public_code(text) is
  'Resout un etablissement depuis le code public du QR. Ne renvoie que id et nom.';

grant execute on function public.establishment_by_public_code(text) to anon, authenticated;

-- Les ecritures publiques passent uniquement par les routes API (service_role) :
-- RLS reste donc ferme en insertion pour anon, ce qui evite qu'un client injecte
-- directement des scans ou des publications avec la cle anon.
create index if not exists submissions_establishment_source_idx
  on public.submissions (establishment_id, source, submitted_at desc);

-- ============================================================
-- 202608200001_lecture_admin_rls.sql
-- ------------------------------------------------------------
-- Le compte admin (viralnight001@gmail.com) n'a jamais de ligne dans
-- establishment_owners (ce n'est pas un club), donc current_establishment_id()
-- lui renvoie NULL et les policies scopees par etablissement ne matchaient
-- jamais rien pour lui : la file de validation d'admin.html renvoyait
-- toujours une liste vide, et valider un contenu n'ecrivait rien.
-- Policies permissives supplementaires : elles s'additionnent en OU aux
-- policies existantes, qui restent inchangees pour les clubs.
-- ============================================================

-- drop/create (pas juste create) : ces 4 policies avaient ete ajoutees a ce
-- fichier sans le garde-fou applique partout ailleurs ici, cassant la
-- promesse du fichier ("peut etre relance sans risque, toutes les creations
-- sont conditionnelles") -- npm run db:apply echouait avec "policy ...
-- already exists" des qu'on relancait l'installation. Signale par Julien.
drop policy if exists "submissions_select_admin" on public.submissions;
create policy "submissions_select_admin"
  on public.submissions
  for select
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

drop policy if exists "submissions_update_admin" on public.submissions;
create policy "submissions_update_admin"
  on public.submissions
  for update
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com')
  with check (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

drop policy if exists "establishments_select_admin" on public.establishments;
create policy "establishments_select_admin"
  on public.establishments
  for select
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

drop policy if exists "establishment_owners_select_admin" on public.establishment_owners;
create policy "establishment_owners_select_admin"
  on public.establishment_owners
  for select
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

-- ============================================================
-- 202608200002_telephone_etablissement.sql
-- ------------------------------------------------------------
-- Numero de contact du club, demande par Julien pour l'export client
-- (email, nom du club, numero). Aucune colonne ni champ ne l'accueillait.
-- ============================================================

alter table public.establishments
  add column if not exists phone text;

comment on column public.establishments.phone is
  'Numero de contact du club, saisi a la creation dans l''admin. Facultatif.';

-- ============================================================
-- 202609020001_invitations_club.sql
-- ------------------------------------------------------------
-- L'inscription a Noctify se fait sur invitation. Sans cette table,
-- n'importe qui pouvait creer un compte et se voir attribuer un club
-- complet via le chemin libre-service de api/create-client.js.
--
-- Verifie uniquement cote serveur (service_role) : aucune policy n'est
-- ouverte, la table est invisible depuis le navigateur.
-- ============================================================

create table if not exists public.club_invitations (
  token text primary key,
  email text,
  establishment_name text,
  city text,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid,
  establishment_id uuid
);

comment on table public.club_invitations is
  'Invitations a creer un club. Un jeton = un club. Verifie uniquement cote serveur (service_role).';

create index if not exists club_invitations_email_idx
  on public.club_invitations (lower(email));

alter table public.club_invitations enable row level security;
