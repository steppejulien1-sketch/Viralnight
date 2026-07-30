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
