-- Categorie d'une recompense : sert a choisir automatiquement une illustration
-- generique dans la boutique de la PWA clubbeur (bar/acces/vip), puisqu'un
-- gerant qui cree une recompense ("Shot cadeau anniversaire") n'a pas de
-- dessin sur-mesure pour elle. Trois categories seulement, pas plus : elles
-- correspondent aux trois familles deja utilisees partout ailleurs dans la
-- boutique (filtres, halos de couleur).

alter table public.rewards
  add column if not exists category text not null default 'bar'
    check (category in ('bar', 'acces', 'vip'));

comment on column public.rewards.category is
  'Famille de la recompense (bar/acces/vip). Choisit l''illustration generique affichee dans la boutique client.';

-- Categorise les 4 recompenses reelles deja creees pour Mirage, plutot que de
-- les laisser toutes retomber sur le defaut 'bar'.
update public.rewards set category = 'bar'   where title = 'Un cocktail offert';
update public.rewards set category = 'acces' where title = 'Coupe-file garanti';
update public.rewards set category = 'vip'   where title = 'Table offerte + bouteille';
update public.rewards set category = 'vip'   where title = 'Accès carré VIP';
