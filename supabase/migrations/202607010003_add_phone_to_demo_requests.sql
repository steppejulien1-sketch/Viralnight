-- Ajoute le numero de telephone au formulaire de demo public.

alter table public.demo_requests
  add column if not exists phone text;

drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert"
on public.demo_requests
for insert
to anon, authenticated
with check (
  length(trim(club)) > 0
  and position('@' in email) > 1
  and length(trim(phone)) > 0
);
