-- Demandes de demo envoyees depuis le formulaire public ViralNight.
-- La table stocke les informations commerciales saisies sur index.html.
-- RLS autorise seulement l'insertion publique ; aucune lecture publique n'est ouverte.

create extension if not exists pgcrypto;

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  club text not null
    check (length(trim(club)) > 0),
  city text not null
    check (length(trim(city)) > 0),
  social text,
  contact_name text not null
    check (length(trim(contact_name)) > 0),
  email text not null
    check (position('@' in email) > 1),
  role text,
  objectives text[] not null default '{}',
  extra_customers integer not null default 0
    check (extra_customers >= 0),
  monthly_views integer not null default 0
    check (monthly_views >= 0),
  monthly_budget numeric(12, 2) not null default 0
    check (monthly_budget >= 0),
  reward_cost numeric(10, 2) not null default 0
    check (reward_cost >= 0),
  campaign_type text,
  context text,
  estimated_cpm numeric(10, 2) not null default 0
    check (estimated_cpm >= 0),
  estimated_cpa numeric(10, 2) not null default 0
    check (estimated_cpa >= 0),
  estimated_rewards integer not null default 0
    check (estimated_rewards >= 0),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'archived')),
  created_at timestamptz not null default now()
);

comment on table public.demo_requests is
  'Demandes de demo envoyees depuis le formulaire public du site vitrine ViralNight.';

comment on column public.demo_requests.objectives is
  'Objectifs coches dans le formulaire : visibility, attendance, loyalty, vip.';

create index if not exists demo_requests_created_at_idx
  on public.demo_requests (created_at desc);

create index if not exists demo_requests_email_idx
  on public.demo_requests (email);

alter table public.demo_requests enable row level security;

drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert"
on public.demo_requests
for insert
to anon, authenticated
with check (
  length(trim(club)) > 0
  and length(trim(city)) > 0
  and length(trim(contact_name)) > 0
  and position('@' in email) > 1
);

grant insert on public.demo_requests to anon, authenticated;
