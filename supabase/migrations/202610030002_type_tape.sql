-- 03/10/2026 : « Autre commerce » + le nom tape par le gerant, pour qu'il se
-- sente reconnu (Julien). category reste "other" ; ce texte sert a l'affichage.
-- APPLIQUEE le 03/10/2026 via le connecteur Supabase.
alter table public.establishments add column if not exists category_label text;
grant update (category_label) on public.establishments to authenticated;
