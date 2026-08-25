-- Phase 1 du rapprochement appli client / dashboard club (voir le plan
-- "Unifier l'appli client et le dashboard club sur une seule base").
--
-- L'appli client (app-preview.html) se connectait jusqu'ici a un AUTRE
-- projet Supabase (clubs.ig_handle, clubs.primary_color, etc. dans
-- 06-pwa-clubbeurs) -- deux bases separees pour la meme notion de "club".
-- Cette migration ajoute a establishments les colonnes que l'appli client
-- attend, pour pouvoir a terme s'y connecter directement.
--
-- ⚠️ PUREMENT ADDITIF, PHASE 1 SEULEMENT :
--   - Aucune donnee a migrer (les etablissements existent deja).
--   - Ne branche encore aucune fonction/RPC (submit_story, checkin_scan,
--     points, amis...) -- ca reste la Phase 3 du plan, apres que la
--     Phase 0 (dump reel des deux bases) et la Phase 2 (strategie de
--     migration des comptes clubbeurs) soient tranchees.
--   - Le formulaire pour remplir ces champs (Parametres du dashboard
--     club) n'existe pas encore non plus -- prochaine etape naturelle,
--     mais separee de cette migration de schema.

alter table public.establishments
  add column if not exists ig_handle text,
  add column if not exists slug text,
  add column if not exists primary_color text not null default '#ff6363',
  add column if not exists logo_url text,
  add column if not exists leaderboard_enabled boolean not null default true,
  add column if not exists points_lock_hours integer not null default 12
    check (points_lock_hours between 0 and 168),
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- Unique seulement si rempli : la plupart des etablissements existants
-- n'auront pas de slug avant que le formulaire de Parametres soit
-- construit, un index unique classique refuserait alors tous les NULL
-- en double.
create unique index if not exists establishments_slug_unique
  on public.establishments (slug)
  where slug is not null;

comment on column public.establishments.ig_handle is
  'Pseudo Instagram du club (sans @), saisi par le club lui-meme. Utilise par l''appli client pour dire quoi taguer -- meme colonne que clubs.ig_handle dans 06-pwa-clubbeurs.';
comment on column public.establishments.slug is
  'Identifiant lisible du club (ex: mirage-brussels), pour les QR codes et liens publics cote appli client.';
comment on column public.establishments.primary_color is
  'Couleur d''accent du club dans l''appli client (fiche, badges). Corail ViralNight par defaut.';
comment on column public.establishments.logo_url is
  'Logo/photo de couverture du club, affiche cote appli client.';
comment on column public.establishments.leaderboard_enabled is
  'Le club affiche-t-il le classement de ses clubbeurs les plus actifs ?';
comment on column public.establishments.points_lock_hours is
  'Delai (en heures) avant que les points gagnes deviennent depensables -- anti-abus, evite "je poste et je retire tout de suite". 12h par defaut, meme valeur que 06-pwa-clubbeurs.';
