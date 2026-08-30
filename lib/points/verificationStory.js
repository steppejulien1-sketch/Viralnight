// Verification differee d'une story creditee automatiquement.
//
// Le probleme, pose par Julien : quelqu'un poste, la mention arrive, les
// points sont credites -- et il supprime sa story trois heures plus tard. Le
// club a paye une visibilite qui n'a pas eu lieu.
//
// Meta n'envoie AUCUN evenement quand une story est supprimee. La seule
// facon de le savoir est de redemander le media : s'il a disparu, l'API
// cesse de le rendre. On ne peut donc pas reagir a la suppression, il faut
// aller verifier -- et le bon moment pour le faire, c'est juste avant que
// les points deviennent depensables.
//
// Ce moment existe deja dans le systeme : les point_grants ne sont pas
// disponibles tout de suite, ils portent un `unlocks_at` (clubs.
// points_lock_hours) et release_due_points() les libere a echeance. La
// verification se glisse donc AVANT cette liberation, sans rien inventer.
//
// Ce module ne fait que decider. L'acces au reseau et a la base vit dans
// api/instagram.js -- ici, tout est testable en Node.

/** Delai avant liberation des points, en heures. 20 et non 24 : une story
 *  vit 24 h, verifier a 24 h tombe exactement au moment ou elle expire
 *  d'elle-meme et où l'API peut deja ne plus la rendre -- on annulerait des
 *  points parfaitement legitimes. 20 h laisse la marge, et Julien la juge
 *  suffisante ("20 heures c'est assez"). */
export const DELAI_POINTS_HEURES = 20;

export const SORTS = {
  GARDER: "garder",
  ANNULER: "annuler",
  ATTENDRE: "attendre",
};

/**
 * Que faire d'une story creditee dont les points ne sont pas encore liberes.
 *
 * @param {object} params
 * @param {"present"|"absent"|"indetermine"} params.etatMedia
 * @param {string|number|Date} params.unlocksAt - echeance du point_grant
 * @param {Date|number} [params.maintenant]
 * @returns {{sort: string, raison: string}}
 */
export function deciderSortStory({ etatMedia, unlocksAt, maintenant = Date.now() }) {
  const echeance = new Date(unlocksAt).getTime();

  // Pas encore l'heure : on ne verifie pas une story qui a peut-etre
  // encore des heures a vivre. Verifier trop tot, c'est annuler des points
  // pour une story qui existait parfaitement au moment du controle.
  if (Number.isFinite(echeance) && Number(maintenant) < echeance) {
    return { sort: SORTS.ATTENDRE, raison: "pas_encore_echue" };
  }

  if (etatMedia === "absent") {
    return { sort: SORTS.ANNULER, raison: "story_supprimee" };
  }

  // "indetermine" = notre appel a echoue, pas la story. Le benefice du
  // doute va au clubbeur : entre payer une story qu'on n'a pas su verifier
  // et retenir les points de quelqu'un qui a joue le jeu, le second cout
  // est bien plus eleve -- il est visible, et il se raconte.
  if (etatMedia === "indetermine") {
    return { sort: SORTS.GARDER, raison: "verification_impossible" };
  }

  return { sort: SORTS.GARDER, raison: "story_toujours_en_ligne" };
}

/**
 * Echeance d'un credit, a partir de sa date de creation.
 * Utilise quand le grant n'a pas d'unlocks_at exploitable.
 */
export function echeancePoints(creeA, delaiHeures = DELAI_POINTS_HEURES) {
  const debut = new Date(creeA).getTime();
  if (!Number.isFinite(debut)) return null;
  return new Date(debut + delaiHeures * 3600000);
}
