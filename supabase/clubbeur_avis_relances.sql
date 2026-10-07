-- Base CLUBBEUR (viralnight-pwa). Applique le 07/10/2026.
-- Le lendemain d'un passage (scan ou story), une notification demande un
-- avis Google (lib/notifications/envoyer.js, notifierAvisGoogle). Une ligne
-- par envoi : on ne redemande pas au meme lieu avant 30 jours. Lue et
-- ecrite uniquement par le serveur (service_role), donc RLS sans politique.
create table if not exists public.avis_relances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  envoye_le timestamptz not null default now()
);
create index if not exists avis_relances_user_club on public.avis_relances (user_id, club_id, envoye_le desc);
alter table public.avis_relances enable row level security;
