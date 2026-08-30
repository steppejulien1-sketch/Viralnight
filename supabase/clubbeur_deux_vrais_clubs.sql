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

-- Le meme catalogue de depart pour les deux : ce sont les quatre
-- recompenses que Julien vend deja. Chaque club les ajustera ensuite
-- depuis son dashboard.
insert into public.rewards (club_id, title, description, cost_points, category, active)
select c.id, r.title, r.description, r.cost_points, r.category, true
from public.clubs c
cross join (values
  ('Un cocktail offert',        null::text, 300,  'boisson'),
  ('Coupe-file garanti',        null::text, 600,  'entree'),
  ('Accès carré VIP',           null::text, 1200, 'vip'),
  ('Table offerte + bouteille', null::text, 3000, 'exclusif')
) as r(title, description, cost_points, category)
where c.slug in ('le-trebuchet', 'cactus-club')
  and not exists (
    select 1 from public.rewards x
    where x.club_id = c.id and x.title = r.title
  );

-- Verification : 4 recompenses actives par club.
select c.name, count(r.id) as recompenses
from public.clubs c
left join public.rewards r on r.club_id = c.id and r.active
group by c.name
order by c.name;
