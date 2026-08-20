-- Julien voulait pouvoir exporter "toute la base de donnees" de ses clients
-- (email, nom du club, numero). Le numero n'existait nulle part : ni colonne
-- sur establishments, ni champ dans le formulaire de creation. Ajoute ici.

alter table public.establishments
  add column if not exists phone text;

comment on column public.establishments.phone is
  'Numero de contact du club, saisi a la creation dans l''admin. Facultatif.';
