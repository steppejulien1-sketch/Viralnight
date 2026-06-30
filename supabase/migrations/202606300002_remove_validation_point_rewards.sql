-- Retire les points attribues uniquement parce qu'un contenu est valide.
-- Les colonnes sont conservees pour compatibilite avec les installations existantes,
-- mais leur valeur par defaut et les lignes deja creees passent a 0.

alter table public.establishment_point_rules
  alter column validated_publication set default 0,
  alter column validated_story set default 0;

update public.establishment_point_rules
set
  validated_publication = 0,
  validated_story = 0,
  updated_at = now();

comment on column public.establishment_point_rules.validated_publication is
  'Compatibilite historique : la validation d une publication ne donne plus de points.';

comment on column public.establishment_point_rules.validated_story is
  'Compatibilite historique : la validation d une story ne donne plus de points.';
