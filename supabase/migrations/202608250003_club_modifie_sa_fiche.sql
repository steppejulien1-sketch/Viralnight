-- Le club peut modifier sa propre fiche (nom d'affichage, ville,
-- telephone, pseudo Instagram, couleur, logo) depuis le nouvel onglet
-- "Ma fiche" de l'appli club -- jusqu'ici establishments n'avait qu'une
-- policy SELECT, aucune ecriture n'etait possible cote club.
--
-- ⚠️ GRANT PAR COLONNE, PAS TOUTE LA TABLE. Meme principe que la policy
-- deja en place sur submissions ("grant update (status) ... to
-- authenticated", migration 202607030001) : la policy RLS controle QUELLE
-- LIGNE (son propre etablissement), le GRANT par colonne controle QUELS
-- CHAMPS. subscription_status, public_code, points_lock_hours, lat/lng
-- restent hors de portee du club meme si la ligne lui appartient -- ce
-- sont des champs de facturation/config interne, pas d'identite visuelle.
-- category (bar/restaurant/club/event_venue/other) reste purement
-- descriptif (aucune route ne s'en sert pour la facturation, verifie
-- dans api/update-client-status.js), autorise ici.

drop policy if exists "establishments_update_own_establishment" on public.establishments;
create policy "establishments_update_own_establishment"
on public.establishments
for update
to authenticated
using (id = public.current_establishment_id())
with check (id = public.current_establishment_id());

revoke update on public.establishments from authenticated;
grant update (name, city, phone, category, ig_handle, slug, primary_color, logo_url, leaderboard_enabled)
  on public.establishments to authenticated;
