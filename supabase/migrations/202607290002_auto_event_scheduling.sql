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
