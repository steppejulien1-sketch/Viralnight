-- La galerie de photos du club.
--
-- establishments.logo_url ne portait qu'UNE image, servie a la fois comme
-- logo et comme photo de couverture. Julien, 05/09/2026, sur le parcours
-- d'installation : "tu mets le nom de ta boite, puis tu mets des photos de
-- l'etablissement". Des photos, au pluriel : la facade, la salle, le bar,
-- le dancefloor. C'est ce qui donne un visage au club dans l'appli des
-- clubbeurs et sur la carte, la ou une seule vignette carree ne montre
-- rien.
--
-- jsonb et pas une table a part : une galerie de club, c'est quatre ou
-- cinq URL ordonnees, jamais requetees une par une. Une table
-- establishment_photos aurait ajoute une policy, un index et une jointure
-- pour transporter un tableau de chaines.
--
-- logo_url reste la COUVERTURE (la premiere image, celle des vignettes et
-- des listes) ; photos porte les autres. Les deux vivent ensemble : rien
-- de ce qui lit logo_url aujourd'hui ne bouge.

alter table public.establishments
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- Un tableau, et pas plus de huit : le client saisit ce champ depuis son
-- appli, la contrainte est ce qui empeche d'y pousser autre chose.
alter table public.establishments
  drop constraint if exists establishments_photos_est_un_tableau;
alter table public.establishments
  add constraint establishments_photos_est_un_tableau
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 8);

comment on column public.establishments.photos is
  'Galerie du club (facade, salle, bar...) : tableau JSON d''URL publiques, 8 au maximum. La couverture reste logo_url.';

-- Le club modifie sa propre fiche depuis l'appli : meme principe que la
-- migration 202608250003, un GRANT par colonne. La policy RLS controle
-- QUELLE LIGNE, le grant controle QUELS CHAMPS. Le grant etant remplace
-- en bloc, la liste reprend toutes les colonnes deja autorisees --
-- en omettre une la retirerait au club.
grant update (name, city, phone, category, ig_handle, slug, primary_color, logo_url, leaderboard_enabled, photos)
  on public.establishments to authenticated;
