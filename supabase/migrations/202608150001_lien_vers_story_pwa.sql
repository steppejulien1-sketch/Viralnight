-- Lien entre un contenu du dashboard B2B et son enregistrement d'origine
-- dans la base de la PWA clubbeur.
--
-- POURQUOI. La validation des contenus devient centralisee sur le site
-- B2B : c'est desormais elle qui doit crediter les points du clubbeur,
-- dans l'AUTRE base Supabase. Or un contenu remonte par le pont
-- (push-submission -> /api/track-post) n'emportait jusqu'ici aucune
-- reference vers sa story d'origine : impossible de savoir qui crediter.
--
-- Ce n'est volontairement PAS une cle etrangere : les deux tables vivent
-- dans deux projets Supabase distincts. C'est un identifiant opaque, que
-- seul le pont sait resoudre.

alter table public.submissions
  add column if not exists external_story_id uuid;

comment on column public.submissions.external_story_id is
  'Identifiant de la story dans la base de la PWA clubbeur. Sert au pont retour qui credite les points apres validation. Null pour un contenu qui n''est pas venu de la PWA.';

-- Un meme contenu ne doit pas pouvoir etre credite deux fois par le pont.
create unique index if not exists submissions_external_story_id_idx
  on public.submissions (external_story_id)
  where external_story_id is not null;
