-- ============================================================
-- REMISE A ZERO — BASE DES CLUBBEURS (projet gcopwgmqjiufemapamek)
-- ------------------------------------------------------------
-- Julien, 13/09/2026 : « repartir de zero », sans les donnees de test.
--
-- OU LE LANCER : supabase.com > projet gcopwgmqjiufemapamek > SQL Editor >
-- New query > coller tout ce fichier > Run. Supabase demande de confirmer
-- une requete « destructive » : c'est normal.
--
-- SAUVEGARDE FAITE AVANT (lecture seule, 13/09/2026) :
--   Downloads/ViralNight-ClaudeCode-FULL/sauvegardes/2026-09-13-avant-remise-a-zero/
--
-- CE QUI PART
--   - Tous les comptes SAUF julien.steppe123@gmail.com (le compte admin du
--     support) : les 9 faux clubbeurs @demo.mirage, owner@mirage.club,
--     test@example.com, et les autres adresses de test de Julien.
--   - Avec eux, par cascade : profils, points, stories, recompenses
--     echangees, amis, badges gagnes, series, cadeaux du jour, messages du
--     support, abonnements aux notifications, jetons Instagram.
--   - Le compte admin garde sa connexion mais repart a zero (0 point, aucun
--     historique, aucun message).
--   - Les compteurs du tableau de bord : installations, ouvertures, departs.
--
-- CE QUI RESTE
--   - Toute la structure et les fonctions.
--   - Les reglages de l'appli : niveaux, badges, echelle du cadeau du jour,
--     defis.
--   - L'etablissement Mirage et ses 4 recompenses (stock remis au plein) :
--     la boutique de l'appli s'appuie dessus tant qu'aucun vrai etablissement
--     n'est inscrit (CLUB_ID_DEMO dans app-preview.html). L'enlever viderait
--     la boutique.
--
-- PAS DANS CE SCRIPT : les 4 fichiers stockes (3 captures de story, 1 photo
-- de profil). Supabase interdit de les effacer en SQL. Pour les enlever :
-- Storage > story-proofs, puis avatars > selectionner > Delete.
--
-- TOUT OU RIEN : si une seule ligne echoue, rien n'est efface.
-- ============================================================

begin;

-- Le seul lien sans cascade (users.referred_by, migration 0032) : coupe
-- d'abord, sinon la base refuse d'effacer un parrain.
update public.users set referred_by = null where referred_by is not null;

-- Tous les comptes sauf l'admin. La cascade emporte le reste de leurs lignes.
delete from auth.users where lower(coalesce(email, '')) <> 'julien.steppe123@gmail.com';

-- L'activite du compte admin, et tout ce qui ne depend d'aucun compte.
delete from public.view_claims;
delete from public.instagram_mention_credits;
delete from public.point_grants;
delete from public.story_events;
delete from public.redemptions;
delete from public.leaderboard_entries;
delete from public.user_badges;
delete from public.streaks;
delete from public.daily_gifts;
delete from public.user_club_balance;
delete from public.welcome_bonuses;
delete from public.friendships;
delete from public.push_subscriptions;
delete from public.support_messages;
delete from public.social_tokens;
delete from public.oauth_states;
delete from public.app_evenements;
delete from public.departs;

update public.users
   set points_balance = 0,
       lifetime_points = 0,
       current_level = 'bronze',
       tier = 'x1',
       tier_updated_at = now();

-- Les recompenses a stock limite reviennent a leur plafond.
update public.rewards set stock_remaining = stock_limit where stock_limit is not null;

commit;

-- Ce qui reste, pour verifier d'un coup d'oeil.
select
  (select count(*) from auth.users)            as comptes,
  (select count(*) from public.users)          as profils,
  (select count(*) from public.story_events)   as stories,
  (select count(*) from public.support_messages) as messages_support,
  (select count(*) from public.clubs)          as etablissements_appli,
  (select count(*) from public.rewards)        as recompenses_boutique,
  (select count(*) from public.badges)         as badges_reglages;
