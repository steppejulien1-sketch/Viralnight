-- ============================================================
-- 202609020001_invitations_club.sql
-- ------------------------------------------------------------
-- L'inscription a Noctify se fait desormais sur invitation.
--
-- Avant : n'importe qui pouvait creer un compte (sur club-app.html ou
-- sur inscription.html) et se voir attribuer un etablissement complet,
-- avec ses recompenses par defaut et son QR code. Le chemin
-- "libre-service" de api/create-client.js ne demandait rien d'autre
-- qu'un compte valide. Un produit vendu a des gerants de club ne peut
-- pas laisser sa porte d'entree ouverte a tout le monde.
--
-- Un jeton = un club. Le jeton se verifie UNIQUEMENT cote serveur avec
-- la cle service_role : aucune policy n'est ouverte sur cette table,
-- donc elle est invisible depuis le navigateur -- ni pour la lire, ni
-- pour y pecher un jeton valide.
-- ============================================================

create table if not exists public.club_invitations (
  token text primary key,
  email text,
  establishment_name text,
  city text,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid,
  establishment_id uuid
);

comment on table public.club_invitations is
  'Invitations a creer un club. Un jeton = un club. Verifie uniquement cote serveur (service_role).';
comment on column public.club_invitations.email is
  'Si renseigne, seule cette adresse peut utiliser l''invitation. Sinon, n''importe quel compte connecte.';
comment on column public.club_invitations.used_at is
  'Usage unique. Pose AVANT la creation du club, en update conditionnel, pour que deux appels simultanes ne creent pas deux clubs avec le meme jeton.';
comment on column public.club_invitations.establishment_id is
  'Le club finalement cree. Sert a retrouver quelle invitation a donne quel client.';

create index if not exists club_invitations_email_idx
  on public.club_invitations (lower(email));

alter table public.club_invitations enable row level security;

-- Aucune policy, volontairement : RLS activee sans policy rend la table
-- totalement invisible avec la cle anon. Seule la cle service_role, qui
-- contourne RLS, y touche -- c'est-a-dire api/create-client.js.
