// Calcul des points attribues a une publication validee.
//
// Meme formule que le simulateur et le dashboard client : (vues / 1000) x taux,
// avec un taux distinct pour les stories, qui sont plus ephemeres donc mieux
// valorisees a audience egale.
//
// Ce module est la seule source du calcul : sans lui, la validation admin et
// l'affichage client pourraient diverger et un client verrait un nombre de points
// different de celui reellement credite.

/** Seuil au-dela duquel une publication est consideree comme virale. */
export const VIRAL_THRESHOLD_VIEWS = 10000;

/**
 * @param {object} params
 * @param {number} params.views - vues validees par le staff
 * @param {string} params.contentType - "story" | "reel" | "post" | "video"
 * @param {object} params.rules - bareme de l'etablissement
 * @param {number} params.rules.storyViewsPerThousand
 * @param {number} params.rules.videoViewsPerThousand
 * @param {number} [params.rules.viralBonus] - prime unique au-dela du seuil viral
 * @returns {{points: number, detail: {base: number, bonus: number, taux: number, parMille: number}}}
 */
export function computePoints({ views, contentType, rules }) {
  const vues = Number.isFinite(Number(views)) ? Math.max(0, Math.round(Number(views))) : 0;

  // Les stories ont leur propre taux ; tout le reste suit le taux video.
  const taux = contentType === "story"
    ? Number(rules?.storyViewsPerThousand) || 0
    : Number(rules?.videoViewsPerThousand) || 0;

  const parMille = vues / 1000;
  const base = Math.round(parMille * taux);

  // La prime virale est versee une seule fois, pas proportionnellement :
  // elle recompense le fait d'avoir franchi le seuil, pas l'ampleur du depassement.
  const bonus = vues >= VIRAL_THRESHOLD_VIEWS ? Number(rules?.viralBonus) || 0 : 0;

  return { points: base + bonus, detail: { base, bonus, taux, parMille } };
}

/** Resume lisible du calcul, affiche au staff pour qu'il comprenne le total propose. */
export function describePoints({ views, contentType, rules }) {
  const { points, detail } = computePoints({ views, contentType, rules });

  if (!detail.taux) return "Bareme non configure pour ce type de contenu.";

  const morceaux = [
    `${detail.parMille.toFixed(1)} x ${detail.taux} = ${detail.base} pts`,
  ];
  if (detail.bonus) morceaux.push(`+ ${detail.bonus} pts de prime virale`);

  return `${morceaux.join(" ")} → ${points} pts`;
}
