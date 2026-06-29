-- Barème de points configurable par établissement.
-- Cette migration ajoute une table séparée pour les règles de points.
-- Les récompenses restent configurées dans public.rewards.

create table if not exists public.establishment_point_rules (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null unique references public.establishments(id) on delete cascade,
  validated_publication integer not null default 30
    check (validated_publication >= 0),
  video_views_per_thousand integer not null default 25
    check (video_views_per_thousand >= 0),
  validated_story integer not null default 60
    check (validated_story >= 0),
  story_views_per_thousand integer not null default 80
    check (story_views_per_thousand >= 0),
  viral_bonus integer not null default 90
    check (viral_bonus >= 0),
  club_mention integer not null default 20
    check (club_mention >= 0),
  qr_checkin integer not null default 15
    check (qr_checkin >= 0),
  monthly_ambassador integer not null default 350
    check (monthly_ambassador >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.establishment_point_rules is
  'Barème de points configurable pour chaque établissement ViralNight.';

create index if not exists establishment_point_rules_establishment_id_idx
  on public.establishment_point_rules (establishment_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists establishment_point_rules_set_updated_at on public.establishment_point_rules;
create trigger establishment_point_rules_set_updated_at
before update on public.establishment_point_rules
for each row
execute function public.set_updated_at();

alter table public.establishment_point_rules enable row level security;

drop policy if exists "establishment_point_rules_select_own" on public.establishment_point_rules;
create policy "establishment_point_rules_select_own"
on public.establishment_point_rules
for select
to authenticated
using (establishment_id = public.current_establishment_id());

drop policy if exists "establishment_point_rules_insert_own" on public.establishment_point_rules;
create policy "establishment_point_rules_insert_own"
on public.establishment_point_rules
for insert
to authenticated
with check (establishment_id = public.current_establishment_id());

drop policy if exists "establishment_point_rules_update_own" on public.establishment_point_rules;
create policy "establishment_point_rules_update_own"
on public.establishment_point_rules
for update
to authenticated
using (establishment_id = public.current_establishment_id())
with check (establishment_id = public.current_establishment_id());

drop policy if exists "establishment_point_rules_delete_own" on public.establishment_point_rules;
create policy "establishment_point_rules_delete_own"
on public.establishment_point_rules
for delete
to authenticated
using (establishment_id = public.current_establishment_id());
