// Le pont entre les deux bases : decide si une mention Instagram recue par
// le webhook (base des GERANTS) peut creer des points chez un clubbeur (base
// CLUBBEUR), et combien.
//
// Pourquoi un module a part plutot que du code dans api/instagram.js : le
// webhook parle a deux bases et a Meta, il n'est testable qu'en production.
// Toute la logique qui DECIDE vit donc ici, sans reseau ni DOM, et se teste
// en Node (scripts/test-mention-automatique.mjs). api/instagram.js ne fait
// plus que rassembler les faits et appliquer la decision.
//
// Ce qui n'est PAS automatisable, et pourquoi : Meta ne donne pas les
// statistiques d'une story qui ne vous appartient pas. Un club voit qu'il a
// ete mentionne, jamais combien de vues a fait la story du clubbeur. Le
// calcul aux vues (lib/points/computePoints.js) reste donc reserve aux
// formats a URL publique (reel, TikTok), verifies a la main. Une story
// detectee automatiquement vaut un FORFAIT : c'est le prix a payer pour se
// passer de validation manuelle sur le format le plus frequent.

/** Motifs de refus. Rendus explicites : le webhook les journalise, et c'est
 *  la seule facon de comprendre apres coup pourquoi un clubbeur n'a pas eu
 *  ses points -- une mention refusee silencieusement est un ticket support. */
export const RAISONS = {
  MENTION_INCOMPLETE: "mention_incomplete",
  ETABLISSEMENT_INCONNU: "etablissement_inconnu",
  CLUB_NON_RELIE: "club_non_relie",
  AUTEUR_INCONNU: "auteur_inconnu",
  DEJA_CREDITE: "deja_credite",
  TROP_ANCIENNE: "trop_ancienne",
};

/** Forfait par defaut d'une story detectee automatiquement. */
export const FORFAIT_STORY_DEFAUT = 50;

/** Au-dela, on ne credite plus : une mention qui remonte trois jours plus
 *  tard (redelivrance Meta, webhook rebranche apres une panne) ne correspond
 *  plus a la soiree que le club voulait recompenser. */
export const FENETRE_HEURES_DEFAUT = 24;

/**
 * @param {object} params
 * @param {{mediaId: string, igUserId: string, publieeA?: string|number|Date}} params.mention
 * @param {string|null} params.etablissementId - resolu depuis ig_user_id (base gerants)
 * @param {string|null} params.clubId - le club clubbeur relie a cet etablissement
 * @param {string|null} params.clubbeurId - users.id dont le handle est l'auteur
 * @param {boolean} [params.dejaCredite] - une attribution existe deja pour ce media
 * @param {number} [params.forfaitStory]
 * @param {number} [params.fenetreHeures]
 * @param {Date|number} [params.maintenant]
 * @returns {{crediter: boolean, raison: string|null, points: number, clubId: string|null, clubbeurId: string|null, mediaId: string|null}}
 */
export function deciderCreditMention({
  mention,
  etablissementId,
  clubId,
  clubbeurId,
  dejaCredite = false,
  forfaitStory = FORFAIT_STORY_DEFAUT,
  fenetreHeures = FENETRE_HEURES_DEFAUT,
  maintenant = Date.now(),
}) {
  const refus = (raison) => ({
    crediter: false,
    raison,
    points: 0,
    clubId: clubId || null,
    clubbeurId: clubbeurId || null,
    mediaId: mention?.mediaId || null,
  });

  if (!mention || !mention.mediaId || !mention.igUserId) return refus(RAISONS.MENTION_INCOMPLETE);
  if (!etablissementId) return refus(RAISONS.ETABLISSEMENT_INCONNU);
  if (!clubId) return refus(RAISONS.CLUB_NON_RELIE);
  if (!clubbeurId) return refus(RAISONS.AUTEUR_INCONNU);
  if (dejaCredite) return refus(RAISONS.DEJA_CREDITE);

  // Sans date de publication, on accepte : Meta ne la fournit pas toujours
  // dans l'evenement, et refuser par defaut priverait des clubbeurs de
  // points pour une information manquante dont ils ne sont pas responsables.
  if (mention.publieeA != null) {
    const publiee = new Date(mention.publieeA).getTime();
    if (Number.isFinite(publiee)) {
      const ageHeures = (Number(maintenant) - publiee) / 3600000;
      if (ageHeures > fenetreHeures) return refus(RAISONS.TROP_ANCIENNE);
    }
  }

  const points = Math.max(0, Math.round(Number(forfaitStory) || 0));

  return {
    crediter: true,
    raison: null,
    points,
    clubId,
    clubbeurId,
    mediaId: mention.mediaId,
  };
}

/** Normalise un pseudo Instagram avant de le comparer a users.handle : Meta
 *  renvoie parfois le username avec une casse differente de celle saisie par
 *  le clubbeur, et un @ traine selon la source. Sans ca, "Julien.Stpt" et
 *  "julien.stpt" seraient deux personnes. */
export function normaliserHandle(valeur) {
  if (typeof valeur !== "string") return null;
  const propre = valeur.trim().replace(/^@/, "").toLowerCase();
  return propre || null;
}
