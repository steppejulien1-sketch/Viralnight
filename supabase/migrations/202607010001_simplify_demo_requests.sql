-- Adapte les demandes de demo au formulaire public simplifie.
-- Le premier contact ne demande plus le nom du club, la ville ni les objectifs chiffres.

alter table public.demo_requests
  alter column club drop not null,
  alter column city drop not null;

alter table public.demo_requests
  add column if not exists establishment_type text;

comment on column public.demo_requests.establishment_type is
  'Type d''etablissement choisi dans le formulaire public simplifie : club, bar, event_venue, restaurant, other.';

drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert"
on public.demo_requests
for insert
to anon, authenticated
with check (
  length(trim(contact_name)) > 0
  and position('@' in email) > 1
  and length(trim(establishment_type)) > 0
);
