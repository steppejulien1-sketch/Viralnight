-- Le parcours d'installation de l'appli club (club-app.html) a besoin de
-- savoir s'il a deja ete fait. Sans cette colonne il ne peut s'en souvenir
-- que dans le localStorage du telephone : changer d'appareil, vider son
-- navigateur ou ouvrir l'appli sur la tablette du bar relancerait les cinq
-- ecrans a un gerant qui a deja tout regle.
--
-- Le code ne DEPEND pas de cette migration : si la colonne manque, l'update
-- echoue en silence (trace en console) et le localStorage suffit sur cet
-- appareil. Cette migration ameliore le comportement, elle ne le debloque
-- pas -- choix deliberatif, vu le nombre de migrations de ce depot qui
-- attendent d'etre passees.

alter table public.establishments
  add column if not exists onboarded_at timestamptz;

comment on column public.establishments.onboarded_at is
  'Fin du parcours d''installation de club-app.html. Null = jamais fait, le parcours s''ouvrira a la prochaine connexion.';

-- La policy d'ecriture est celle de 202608250003 (« le club modifie sa
-- fiche »), reprise ici a l'identique : rien ne garantit que cette
-- migration-la soit passee sur la base, et un grant sans policy ne donne
-- aucun droit. Les deux sont idempotentes, les rejouer ne casse rien.
drop policy if exists "establishments_update_own_establishment" on public.establishments;
create policy "establishments_update_own_establishment"
on public.establishments
for update
to authenticated
using (id = public.current_establishment_id())
with check (id = public.current_establishment_id());

-- ⚠️ GRANT PAR COLONNE, PAS TOUTE LA TABLE. La policy RLS controle QUELLE
-- LIGNE (son propre etablissement), le grant controle QUELS CHAMPS.
-- subscription_status, public_code, points_lock_hours et lat/lng restent
-- hors de portee du club meme si la ligne lui appartient.
--
-- La liste est reecrite en entier parce que le revoke qui la precede efface
-- celle de 202608250003 : ajouter onboarded_at seul apres coup laisserait un
-- club incapable de changer son propre nom.
revoke update on public.establishments from authenticated;
grant update (name, city, phone, category, ig_handle, slug, primary_color, logo_url, leaderboard_enabled, onboarded_at)
  on public.establishments to authenticated;
