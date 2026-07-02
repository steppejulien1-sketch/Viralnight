-- Donne au compte interne ViralNight le droit de valider les contenus de tous les établissements.
-- Le front admin se connecte avec Supabase Auth, puis les policies RLS ci-dessous autorisent uniquement
-- l'adresse viralnight001@gmail.com à lire et mettre à jour la file globale de submissions.

create or replace function public.is_viralnight_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'viralnight001@gmail.com';
$$;

grant execute on function public.is_viralnight_admin() to authenticated;

drop policy if exists "establishments_select_viralnight_admin" on public.establishments;
create policy "establishments_select_viralnight_admin"
on public.establishments
for select
to authenticated
using (public.is_viralnight_admin());

drop policy if exists "submissions_select_viralnight_admin" on public.submissions;
create policy "submissions_select_viralnight_admin"
on public.submissions
for select
to authenticated
using (public.is_viralnight_admin());

drop policy if exists "submissions_update_viralnight_admin" on public.submissions;
create policy "submissions_update_viralnight_admin"
on public.submissions
for update
to authenticated
using (public.is_viralnight_admin())
with check (public.is_viralnight_admin());

grant select on public.establishments to authenticated;
grant select on public.submissions to authenticated;
grant update (status) on public.submissions to authenticated;
