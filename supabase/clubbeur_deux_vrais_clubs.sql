-- Les deux vrais clubs dans la base CLUBBEUR (gcopwgmqjiufemapamek).
--
-- A executer dans l'editeur SQL de Supabase, sur la base clubbeur --
-- PAS celle des gerants (mrukkexghpcqtwvwwcbe), et pas via
-- `npm run db:apply`, qui ne connait que la base des gerants.
--
-- Pourquoi : la table clubs ne contient que "Mirage", un club de demo
-- retire de la carte depuis longtemps. La boutique de app-preview.html
-- servait donc son catalogue sous le nom d'un autre club. Le selecteur
-- de club resout les ids par NOM : des que ces deux lignes existent,
-- l'ecran se branche dessus tout seul, sans toucher au code.
--
-- Coordonnees et couleurs reprises de CLUBS dans app-preview.html.

insert into public.clubs (slug, name, city, primary_color, lat, lng)
values
  ('le-trebuchet', 'Le Trébuchet', 'Ciney',     '#ff2f45', 50.2797, 5.2127),
  ('cactus-club',  'Cactus Club',  'Auderghem', '#3b4250', 50.8157, 4.4266)
on conflict (slug) do update
  set name = excluded.name,
      city = excluded.city,
      primary_color = excluded.primary_color,
      lat = excluded.lat,
      lng = excluded.lng;

-- Le coupe-file sort du catalogue (demande de Julien). Desactive plutot
-- que supprime : les bons deja echanges par des clubbeurs pointent
-- dessus, un delete casserait leur historique.
update public.rewards
   set active = false
 where title = 'Coupe-file garanti';

-- Le catalogue de depart, pour les deux clubs ET pour Mirage -- c'est
-- Mirage qui s'affiche tant que les deux vrais clubs n'ont pas de
-- recompenses a eux, il doit donc montrer la meme chose.
-- Les couts de la pinte et du vestiaire sont une proposition : la pinte
-- sous le cocktail, le vestiaire juste au-dessus. A ajuster librement.
insert into public.rewards (club_id, title, description, cost_points, category, active)
select c.id, r.title, r.description, r.cost_points, r.category, true
from public.clubs c
cross join (values
  ('Une pinte offerte',         null::text, 200,  'boisson'),
  ('Un cocktail offert',        null::text, 300,  'boisson'),
  ('Vestiaire offert',          null::text, 250,  'entree'),
  ('Accès carré VIP',           null::text, 1200, 'vip'),
  ('Table offerte + bouteille', null::text, 3000, 'exclusif')
) as r(title, description, cost_points, category)
where c.slug in ('le-trebuchet', 'cactus-club', 'mirage-brussels')
  and not exists (
    select 1 from public.rewards x
    where x.club_id = c.id and x.title = r.title
  );

-- Verification : le catalogue actif de chaque club, du moins cher au plus cher.
select c.name, r.title, r.cost_points
from public.clubs c
join public.rewards r on r.club_id = c.id and r.active
order by c.name, r.cost_points;
