-- Le bonus "mention du club en description" est retiré du barème.
-- On conserve la colonne existante pour compatibilité, mais elle ne doit plus attribuer de points.

alter table public.establishment_point_rules
  alter column club_mention set default 0;

update public.establishment_point_rules
set club_mention = 0
where club_mention <> 0;
