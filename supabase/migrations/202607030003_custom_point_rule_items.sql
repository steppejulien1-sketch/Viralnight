-- Critères personnalisés du barème de points.
-- Chaque établissement peut ajouter ses propres lignes sans modifier les règles fixes.

create table if not exists public.establishment_point_rule_items (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  points integer not null default 0 check (points >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.establishment_point_rule_items is
  'Critères personnalisés de barème ajoutés par chaque établissement.';

create index if not exists establishment_point_rule_items_establishment_idx
  on public.establishment_point_rule_items (establishment_id, active, created_at);

alter table public.establishment_point_rule_items enable row level security;

drop policy if exists "custom_point_rules_select_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_select_own"
on public.establishment_point_rule_items
for select
using (establishment_id = public.current_establishment_id());

drop policy if exists "custom_point_rules_insert_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_insert_own"
on public.establishment_point_rule_items
for insert
with check (establishment_id = public.current_establishment_id());

drop policy if exists "custom_point_rules_update_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_update_own"
on public.establishment_point_rule_items
for update
using (establishment_id = public.current_establishment_id())
with check (establishment_id = public.current_establishment_id());

drop policy if exists "custom_point_rules_delete_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_delete_own"
on public.establishment_point_rule_items
for delete
using (establishment_id = public.current_establishment_id());

grant select, insert, update, delete on public.establishment_point_rule_items to authenticated;
