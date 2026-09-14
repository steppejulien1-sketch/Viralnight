-- Le journal des e-mails Noctify (14/09/2026).
--
-- Julien : « que je puisse voir les mails que je vais recevoir en rapport
-- avec Noctify », dans le tableau de bord. Chaque e-mail envoye par Resend
-- (demande de demo, message au support, compte supprime) est aussi range ici
-- par lib/notifications/email.js -- y compris ceux qui ne sont PAS partis
-- (Resend absent ou en panne) : c'est justement ceux-la qu'on veut voir.
--
-- RLS sans policy : invisible avec la cle anon, lu par la cle service depuis
-- /api/update-client-status?action=pilotage (compte admin verifie).

create table if not exists public.journal_emails (
  id           bigint generated always as identity primary key,
  type         text not null,
  sujet        text not null,
  destinataire text,
  texte        text,
  envoye       boolean not null default false,
  erreur       text,
  created_at   timestamptz not null default now()
);

create index if not exists journal_emails_created_idx on public.journal_emails (created_at desc);

alter table public.journal_emails enable row level security;
