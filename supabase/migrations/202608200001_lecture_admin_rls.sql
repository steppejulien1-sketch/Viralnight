-- Bug de securite decouvert le 20/08 : le compte admin (viralnight001@gmail.com)
-- n'a jamais eu de ligne dans establishment_owners (normal, ce n'est pas un
-- club). Or toutes les policies RLS de submissions/establishments/
-- establishment_owners filtrent sur `establishment_id = current_establishment_id()`,
-- et current_establishment_id() lit justement establishment_owners pour
-- l'utilisateur connecte. Pour l'admin cette fonction renvoie NULL, et
-- `establishment_id = NULL` ne matche jamais aucune ligne en SQL.
--
-- Consequence concrete : la file de validation d'admin.js
-- (loadSupabaseSubmissions, requete directe via supabase.from("submissions"))
-- a TOUJOURS renvoye une liste vide pour l'admin reel, quel que soit le
-- nombre de contenus reellement en attente. Le bouton Valider/Rejeter
-- (supabase.from("submissions").update(...), meme fichier ligne ~525) etait
-- bloque de la meme facon : meme quand un contenu apparaissait (via le
-- mode demonstration, jamais les vraies donnees), le valider n'ecrivait
-- rien en base. La validation des contenus n'a donc jamais vraiment
-- fonctionne en production.
--
-- Le correctif ajoute des policies PERMISSIVES supplementaires reservees a
-- l'email admin. En Postgres RLS, plusieurs policies permissives sur la
-- meme commande se combinent en OU : celles des clubs (qui filtrent sur
-- leur propre etablissement) restent inchangees, l'admin recoit juste un
-- acces en plus, jamais en retrait.

create policy "submissions_select_admin"
  on public.submissions
  for select
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

create policy "submissions_update_admin"
  on public.submissions
  for update
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com')
  with check (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

create policy "establishments_select_admin"
  on public.establishments
  for select
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');

create policy "establishment_owners_select_admin"
  on public.establishment_owners
  for select
  using (auth.jwt() ->> 'email' = 'viralnight001@gmail.com');
