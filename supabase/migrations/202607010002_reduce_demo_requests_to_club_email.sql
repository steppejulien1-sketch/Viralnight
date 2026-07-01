-- Adapte le formulaire de demo a deux champs : nom de l'etablissement et email.
-- Les anciennes informations de qualification restent possibles en base, mais ne sont plus obligatoires.

alter table public.demo_requests
  alter column contact_name drop not null;

drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert"
on public.demo_requests
for insert
to anon, authenticated
with check (
  length(trim(club)) > 0
  and position('@' in email) > 1
);
