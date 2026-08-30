-- Photo d'une recompense, choisie par le club lui-meme.
--
-- Jusqu'ici la boutique du clubbeur choisissait seule une illustration a
-- partir du TITRE de la recompense (choisirArt() dans app-preview.html).
-- Ca marche pour "Un cocktail offert", pas pour "Le shooter maison du
-- patron" : le club doit pouvoir montrer ce qu'il donne vraiment.

alter table public.rewards
  add column if not exists image_url text;

comment on column public.rewards.image_url is
  'Photo de la recompense, televersee par le club (bucket reward-photos). Null = illustration choisie automatiquement d''apres le titre.';

-- Bucket public : ces images s'affichent dans la boutique du clubbeur,
-- qui n'est pas authentifie cote gerants. Public en LECTURE seulement --
-- les policies ci-dessous gardent l'ecriture pour le proprietaire du club.
insert into storage.buckets (id, name, public)
values ('reward-photos', 'reward-photos', true)
on conflict (id) do nothing;

-- Chaque club ecrit uniquement dans son propre dossier, nomme d'apres son
-- establishment_id. Sans ce prefixe, n'importe quel gerant connecte
-- pourrait ecraser la photo d'un concurrent.
drop policy if exists "reward photos lecture publique" on storage.objects;
create policy "reward photos lecture publique"
  on storage.objects for select
  using (bucket_id = 'reward-photos');

drop policy if exists "reward photos ecriture club" on storage.objects;
create policy "reward photos ecriture club"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reward-photos'
    and (storage.foldername(name))[1] = public.current_establishment_id()::text
  );

drop policy if exists "reward photos remplacement club" on storage.objects;
create policy "reward photos remplacement club"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'reward-photos'
    and (storage.foldername(name))[1] = public.current_establishment_id()::text
  );

drop policy if exists "reward photos suppression club" on storage.objects;
create policy "reward photos suppression club"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'reward-photos'
    and (storage.foldername(name))[1] = public.current_establishment_id()::text
  );
