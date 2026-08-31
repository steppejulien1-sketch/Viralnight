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

/** Delai avant liberation des points, en heures. 24, comme la duree de vie
 *  d'une story : c'est ce que le clubbeur comprend sans explication, et c'est
 *  ce que l'appli lui annonce ("tu recois tes points 24 h apres"). */
export const DELAI_POINTS_HEURES = 24;

/** Combien d'heures AVANT l'echeance on va verifier que la story existe
 *  encore. Ce n'est pas un reglage de confort, c'est ce qui rend la
 *  verification possible :
 *
 *  - verifier APRES l'echeance ne sert a rien, les points sont deja liberes
 *    et on ne les reprend plus (voir annuler_mention_instagram) ;
 *  - verifier PILE a 24 h tombe au moment ou la story expire d'elle-meme et
 *    ou l'API peut deja ne plus la rendre : on annulerait des points
 *    parfaitement legitimes.
 *
 *  4 h avant, la story est encore en ligne si elle n'a pas ete supprimee, et
 *  les points ne sont pas encore partis. */
export const MARGE_VERIFICATION_HEURES = 4;

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
export function deciderSortStory({
  etatMedia,
  unlocksAt,
  maintenant = Date.now(),
  margeHeures = MARGE_VERIFICATION_HEURES,
}) {
  const echeance = new Date(unlocksAt).getTime();

  // Trop tot : la story a encore des heures a vivre, la verifier
  // maintenant ne prouverait rien sur ce qu'elle sera a l'echeance. On
  // n'ouvre la fenetre que `margeHeures` avant -- et pas apres, sinon les
  // points seraient deja liberes et plus recuperables.
  if (Number.isFinite(echeance) && Number(maintenant) < echeance - margeHeures * 3600000) {
    return { sort: SORTS.ATTENDRE, raison: "trop_tot" };
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
