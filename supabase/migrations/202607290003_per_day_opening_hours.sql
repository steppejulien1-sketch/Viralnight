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
