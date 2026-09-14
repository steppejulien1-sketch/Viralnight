-- Le compte admin change d'adresse : steppejulien1@gmail.com remplace
-- viralnight001@gmail.com (Julien, 14/09/2026 : « on change l'adresse mail et
-- tu mets juste steppejulien1@gmail.com »).
--
-- Les cinq policies de lecture admin comparaient l'e-mail du jeton a l'ancienne
-- adresse. Sans elles, admin.html (Validation) se connecterait mais ne verrait
-- aucun contenu ni aucun club -- sans erreur, juste des listes vides.
--
-- ⚠️ L'adresse est aussi en dur cote code (ADMIN_EMAIL) : admin.js, auth.js,
-- app.js, redirectionConnecte.js, dashboardData.js, pilotage.js,
-- api/create-client.js, api/credit-clubbeur.js, api/qualify-club.js,
-- api/update-client-status.js. Les garder alignes.

drop policy if exists submissions_select_admin on public.submissions;
create policy submissions_select_admin on public.submissions
  for select using (auth.jwt() ->> 'email' = 'steppejulien1@gmail.com');

drop policy if exists submissions_update_admin on public.submissions;
create policy submissions_update_admin on public.submissions
  for update using (auth.jwt() ->> 'email' = 'steppejulien1@gmail.com')
  with check (auth.jwt() ->> 'email' = 'steppejulien1@gmail.com');

drop policy if exists establishments_select_admin on public.establishments;
create policy establishments_select_admin on public.establishments
  for select using (auth.jwt() ->> 'email' = 'steppejulien1@gmail.com');

drop policy if exists establishment_owners_select_admin on public.establishment_owners;
create policy establishment_owners_select_admin on public.establishment_owners
  for select using (auth.jwt() ->> 'email' = 'steppejulien1@gmail.com');

drop policy if exists follower_history_select_admin on public.establishment_follower_history;
create policy follower_history_select_admin on public.establishment_follower_history
  for select using (auth.jwt() ->> 'email' = 'steppejulien1@gmail.com');
