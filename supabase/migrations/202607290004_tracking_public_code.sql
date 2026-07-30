-- Collecte des statistiques : point d'entree public.
--
-- Jusqu'ici aucune table n'etait alimentee : il n'existait aucun moyen pour un client
-- du club de signaler sa presence ou sa publication. Cette migration cree ce point
-- d'entree, active par un QR code affiche a l'entree du club.
--
-- Principe : le QR contient un code public court, jamais l'UUID de l'etablissement.
-- Un UUID dans une URL publique permettrait d'enumerer les etablissements et de
-- deviner d'autres identifiants de la base.

-- Code public de l'etablissement, encode dans le QR code.
alter table public.establishments
  add column if not exists public_code text;

-- Genere un code court, lisible et non sequentiel (pas de 0/O/1/I pour eviter
-- les confusions si quelqu'un doit le saisir a la main).
create or replace function public.generate_public_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;

    exit when not exists (select 1 from public.establishments where public_code = v_code);

    v_attempt := v_attempt + 1;
    if v_attempt > 50 then
      raise exception 'Impossible de generer un code public unique.';
    end if;
  end loop;

  return v_code;
end;
$$;

-- Attribution d'un code aux etablissements existants.
update public.establishments
set public_code = public.generate_public_code()
where public_code is null;

alter table public.establishments
  alter column public_code set not null;

alter table public.establishments
  drop constraint if exists establishments_public_code_unique;
alter table public.establishments
  add constraint establishments_public_code_unique unique (public_code);

-- Tout nouvel etablissement recoit son code automatiquement.
create or replace function public.set_public_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null then
    new.public_code := public.generate_public_code();
  end if;
  return new;
end;
$$;

drop trigger if exists establishments_set_public_code on public.establishments;
create trigger establishments_set_public_code
before insert on public.establishments
for each row
execute function public.set_public_code();

-- Un client ne compte qu'une fois par soiree : sans cette contrainte, rafraichir la page
-- du QR gonflerait artificiellement la frequentation.
create unique index if not exists qr_scans_event_customer_unique
  on public.qr_scans (event_id, customer_id)
  where event_id is not null;

-- Meme logique pour les publications : un client ne peut pas soumettre deux fois la meme URL.
create unique index if not exists submissions_event_url_unique
  on public.submissions (event_id, url)
  where event_id is not null;

-- Vues declarees par le client, distinctes de views_count qui reste la valeur validee
-- par le staff. On garde les deux pour pouvoir mesurer l'ecart et detecter les abus.
alter table public.submissions
  add column if not exists declared_views integer
    check (declared_views is null or declared_views >= 0);

alter table public.submissions
  add column if not exists source text not null default 'staff'
    check (source in ('staff', 'customer_qr'));

comment on column public.submissions.declared_views is
  'Nombre de vues annonce par le client. views_count reste la valeur validee par le staff.';

-- Resout un etablissement depuis son code public, sans exposer la table entiere.
-- SECURITY DEFINER : appelable par le role anon pour la page de scan.
create or replace function public.establishment_by_public_code(p_code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name
  from public.establishments e
  where e.public_code = upper(trim(p_code))
  limit 1;
$$;

comment on function public.establishment_by_public_code(text) is
  'Resout un etablissement depuis le code public du QR. Ne renvoie que id et nom.';

grant execute on function public.establishment_by_public_code(text) to anon, authenticated;

-- Les ecritures publiques passent uniquement par les routes API (service_role) :
-- RLS reste donc ferme en insertion pour anon, ce qui evite qu'un client injecte
-- directement des scans ou des publications avec la cle anon.
create index if not exists submissions_establishment_source_idx
  on public.submissions (establishment_id, source, submitted_at desc);
