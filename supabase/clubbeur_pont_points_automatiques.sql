-- LE PONT ENTRE LES DEUX BASES -- a executer sur la base CLUBBEUR
-- (gcopwgmqjiufemapamek), dans l'editeur SQL de Supabase.
--
-- Pas via `npm run db:apply` : ce script ne connait que la base des gerants.
--
-- Le probleme qu'il resout. Une mention Instagram arrive dans la base des
-- GERANTS (webhook Meta -> instagram_mentions, cle establishment_id). Les
-- points d'un clubbeur vivent dans la base CLUBBEUR (point_grants, cle
-- user_id + club_id). Ce sont deux projets Supabase distincts : le webhook
-- ne peut pas crediter quelqu'un qu'il ne voit pas. Il manque trois choses,
-- et les voici.

-- ---------------------------------------------------------------------
-- 1. Le lien lui-meme : quel club clubbeur correspond a quel etablissement
--    gerant. Nullable, parce que tous les clubs n'auront pas de compte
--    gerant tout de suite. Unique quand il est rempli : deux clubs qui
--    pointeraient sur le meme etablissement crediteraient deux fois.
-- ---------------------------------------------------------------------
alter table public.clubs
  add column if not exists establishment_id uuid;

comment on column public.clubs.establishment_id is
  'Etablissement correspondant dans la base des gerants (mrukkexghpcqtwvwwcbe). Sert au credit automatique des mentions Instagram.';

create unique index if not exists clubs_establishment_id_unique
  on public.clubs (establishment_id)
  where establishment_id is not null;

-- ---------------------------------------------------------------------
-- 2. La trace des mentions deja creditees. Meta redelivre le meme
--    evenement (c'est documente, et c'est meme la regle des qu'on repond
--    autre chose qu'un 200) : sans cette table, un clubbeur serait credite
--    plusieurs fois pour une seule story. La cle primaire EST la garantie.
-- ---------------------------------------------------------------------
create table if not exists public.instagram_mention_credits (
  club_id        uuid not null references public.clubs(id) on delete cascade,
  media_id       text not null,
  user_id        uuid not null references public.users(id) on delete cascade,
  point_grant_id uuid references public.point_grants(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (club_id, media_id)
);

comment on table public.instagram_mention_credits is
  'Une ligne par mention Instagram deja creditee. Empeche le double credit quand Meta redelivre un evenement.';

-- RLS active SANS aucune policy : c'est volontaire. Seule la cle
-- service_role (le webhook) doit toucher cette table. Un clubbeur qui
-- pourrait y ecrire pourrait s'attribuer des points.
alter table public.instagram_mention_credits enable row level security;

-- ---------------------------------------------------------------------
-- 3. L'ecriture, en une seule transaction. Passer par une fonction plutot
--    que par deux insert depuis le serveur evite l'etat batard ou le
--    point_grant existe mais pas sa trace : au prochain evenement redelivre,
--    le clubbeur serait credite une seconde fois.
--
--    L'ordre compte : on insere d'abord la TRACE. Si elle existe deja, on
--    sort sans avoir rien credite. Faire l'inverse obligerait a creer le
--    grant puis a le supprimer.
-- ---------------------------------------------------------------------
create or replace function public.crediter_mention_instagram(
  p_club   uuid,
  p_user   uuid,
  p_media  text,
  p_points integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant uuid;
  v_lock  integer;
begin
  if p_points is null or p_points <= 0 then
    return null;
  end if;

  select points_lock_hours into v_lock from public.clubs where id = p_club;
  if not found then
    return null;
  end if;

  insert into public.instagram_mention_credits (club_id, media_id, user_id)
  values (p_club, p_media, p_user)
  on conflict (club_id, media_id) do nothing;

  -- Deja credite : on ne touche a rien.
  if not found then
    return null;
  end if;

  -- unlocks_at suit le delai du club (points_lock_hours), comme tout le
  -- reste du systeme : release_due_points() liberera ces points au meme
  -- rythme que ceux d'une story validee a la main. Un point automatique ne
  -- doit pas etre disponible plus vite qu'un point verifie.
  insert into public.point_grants (user_id, club_id, amount, unlocks_at)
  values (p_user, p_club, p_points, now() + make_interval(hours => coalesce(v_lock, 0)))
  returning id into v_grant;

  update public.instagram_mention_credits
     set point_grant_id = v_grant
   where club_id = p_club and media_id = p_media;

  return v_grant;
end;
$$;

-- Personne d'autre que le webhook n'appelle cette fonction. security definer
-- sans ce revoke, c'est une porte ouverte : n'importe quel clubbeur connecte
-- pourrait s'attribuer des points.
revoke all on function public.crediter_mention_instagram(uuid, uuid, text, integer) from public;
revoke all on function public.crediter_mention_instagram(uuid, uuid, text, integer) from anon;
revoke all on function public.crediter_mention_instagram(uuid, uuid, text, integer) from authenticated;

-- ---------------------------------------------------------------------
-- A FAIRE ENSUITE, a la main : relier chaque club a son etablissement.
-- Les identifiants d'etablissement se lisent dans l'AUTRE base
-- (mrukkexghpcqtwvwwcbe, table establishments).
--
--   update public.clubs
--      set establishment_id = 'COLLER-ICI-L-UUID-DE-L-ETABLISSEMENT'
--    where slug = 'le-trebuchet';
--
-- Verification :
--   select name, slug, establishment_id from public.clubs order by name;
-- ---------------------------------------------------------------------
