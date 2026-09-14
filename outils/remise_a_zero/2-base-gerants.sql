-- ============================================================
-- REMISE A ZERO — BASE DES GERANTS (projet mrukkexghpcqtwvwwcbe)
-- ------------------------------------------------------------
-- Julien, 13/09/2026 : « repartir de zero », sans les donnees de test.
--
-- OU LE LANCER : supabase.com > projet mrukkexghpcqtwvwwcbe > SQL Editor >
-- New query > coller tout ce fichier > Run.
--
-- SAUVEGARDE FAITE AVANT (lecture seule, 13/09/2026) :
--   Downloads/ViralNight-ClaudeCode-FULL/sauvegardes/2026-09-13-avant-remise-a-zero/
--
-- CE QUI PART
--   - Les 3 etablissements de test : Mirage (Bruxelles), Mon Club Test
--     (Bruxelles), NEUIL (Namur). Avec eux, par cascade : proprietaires,
--     recompenses et leurs echanges, soirees et leurs chiffres, bareme,
--     horaires, contenus, scans QR, comptes Instagram relies.
--   - Les 2 demandes de demo « La house » et le lien d'invitation en attente.
--   - Les comptes gerants julien.steppe123@gmail.com et steppejulien1@gmail.com
--     (ceux qui ouvraient Mon Club Test et NEUIL dans l'appli club). Pour
--     retester l'appli club, il suffira de se reinscrire : l'inscription est
--     ouverte.
--
-- CE QUI RESTE
--   - Toute la structure et les fonctions.
--   - Le compte admin viralnight001@gmail.com (pilotage, validation).
--
-- PAS DANS CE SCRIPT : 1 photo de recompense stockee. Supabase interdit de
-- l'effacer en SQL. Pour l'enlever : Storage > reward-photos > Delete.
--
-- TOUT OU RIEN : si une seule ligne echoue, rien n'est efface.
-- ============================================================

begin;

-- La cascade depuis establishments emporte tout ce qui appartient a un club.
delete from public.establishments;

delete from public.demo_requests;
delete from public.club_invitations;

-- Tous les comptes sauf l'admin.
delete from auth.users where lower(coalesce(email, '')) <> 'viralnight001@gmail.com';

commit;

-- Ce qui reste, pour verifier d'un coup d'oeil.
select
  (select count(*) from auth.users)                 as comptes,
  (select count(*) from public.establishments)      as etablissements,
  (select count(*) from public.establishment_owners) as proprietaires,
  (select count(*) from public.rewards)             as recompenses,
  (select count(*) from public.events)              as soirees,
  (select count(*) from public.demo_requests)       as demandes_demo;
