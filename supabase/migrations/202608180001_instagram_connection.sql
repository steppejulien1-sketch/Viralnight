-- Connexion Instagram du club : stocke le jeton d'acces obtenu via l'OAuth
-- Facebook (Instagram Graph API) et journalise les mentions en story recues
-- par webhook.
--
-- Securite : ce jeton donne acces au compte Instagram professionnel du club.
-- Aucune policy RLS n'est ajoutee pour authenticated/anon ci-dessous, ce qui,
-- une fois RLS active, revient a interdire tout acces cote client : seule la
-- cle service_role (utilisee uniquement par les routes api/instagram-*.js,
-- jamais exposee au navigateur) peut lire ou ecrire cette table. Le dashboard
-- n'affiche jamais le jeton lui-meme, seulement un statut ("connecte : @nom")
-- renvoye par api/instagram-status.js.

create table if not exists public.establishment_instagram_accounts (
  establishment_id uuid primary key references public.establishments(id) on delete cascade,
  page_id text not null,
  page_access_token text not null,
  ig_user_id text not null,
  ig_username text not null,
  user_access_token text not null,
  token_expires_at timestamptz not null,
  webhook_subscribed boolean not null default false,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.establishment_instagram_accounts is
  'Connexion Instagram Business/Creator du club (OAuth Facebook Login for Business). Un seul compte connecte par establishment.';
comment on column public.establishment_instagram_accounts.page_access_token is
  'Jeton de la page Facebook liee, necessaire pour (re)inscrire le webhook mentions.';
comment on column public.establishment_instagram_accounts.user_access_token is
  'Jeton utilisateur longue duree (~60 jours) obtenu a la connexion, a rafraichir avant expiration.';

create unique index if not exists establishment_instagram_accounts_ig_user_id_idx
  on public.establishment_instagram_accounts (ig_user_id);

-- Table instagram_mentions
-- Journalise chaque mention en story recue via le webhook Meta. Ne declenche
-- PAS d'attribution de points automatique : ca reste un compteur affiche au
-- gerant, le flux de points existant (submissions + validation) est inchange.
create table if not exists public.instagram_mentions (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  media_id text not null,
  field text not null default 'mentions',
  received_at timestamptz not null default now()
);

comment on table public.instagram_mentions is
  'Historique des mentions en story detectees par le webhook Instagram. Sert de compteur affiche au gerant.';

-- Un meme media_id ne doit compter qu'une fois : Meta redeliv­re parfois le
-- meme evenement webhook, cette contrainte rend l'insertion idempotente.
create unique index if not exists instagram_mentions_establishment_media_idx
  on public.instagram_mentions (establishment_id, media_id);

create index if not exists instagram_mentions_establishment_received_idx
  on public.instagram_mentions (establishment_id, received_at desc);

alter table public.establishment_instagram_accounts enable row level security;
alter table public.instagram_mentions enable row level security;

-- Aucune policy pour authenticated/anon : par defaut, RLS sans policy refuse
-- tout acces a ces deux tables depuis le client. Seule la cle service_role
-- (routes api/instagram-*.js) peut les lire ou les modifier.
