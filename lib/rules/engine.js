// Moteur de regles : consomme uniquement la sortie de lib/analytics (jamais les lignes brutes),
// execute toutes les regles enregistrees, filtre celles qui ne se declenchent pas et trie
// le resultat par priorite puis par gain estime. C'est la seule source de recommandations :
// la couche IA (lib/ai) ne fait que reformuler ce que ce moteur produit.

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

/** Plafond des gains estimes. Au-dela, une projection n'est plus credible pour un gerant. */
const MAX_ESTIMATED_GAIN = 35;

/**
 * Convertit un ecart observe en gain realiste actionnable.
 *
 * Un ecart de reach de 300% entre deux DJs est un fait, pas un gain : reprogrammer le
 * meilleur DJ ne triple pas la visibilite du club. On applique donc un facteur de
 * realisation et un plafond, pour ne jamais afficher une promesse intenable.
 * Le chiffre brut reste dans le message de la regle, ou il decrit un constat.
 *
 * @param {number} observedPercent - ecart constate, en pourcentage
 * @param {number} [realizationFactor] - part de l'ecart reellement capturable
 * @returns {number} gain estime, entier borne
 */
export function estimateGain(observedPercent, realizationFactor = 0.35) {
  if (!Number.isFinite(observedPercent) || observedPercent <= 0) return 0;
  return Math.min(MAX_ESTIMATED_GAIN, Math.round(observedPercent * realizationFactor));
}

/**
 * @typedef {object} Recommendation
 * @property {string} id
 * @property {"reward"|"dj"|"timing"|"trend"|"customer"} category
 * @property {string} message
 * @property {number} estimatedGain - pourcentage de gain estime
 * @property {"high"|"medium"|"low"} priority
 */

/**
 * @param {Array<{id: string, evaluate: (ctx: object) => Recommendation|null}>} rules
 * @param {object} analysisContext - sortie de runFullAnalysis()
 * @returns {Recommendation[]}
 */
export function runRules(rules, analysisContext) {
  const triggered = [];

  for (const rule of rules) {
    let result;
    try {
      result = rule.evaluate(analysisContext);
    } catch (error) {
      // Une regle en erreur ne doit jamais casser les autres.
      console.error(`[rules] ${rule.id} a leve une exception`, error);
      continue;
    }
    if (result) triggered.push({ ...result, supersedes: rule.supersedes });
  }

  const sorted = triggered.sort((a, b) => {
    const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    return priorityDelta !== 0 ? priorityDelta : b.estimatedGain - a.estimatedGain;
  });

  return dropSupersededRules(sorted);
}

/**
 * Retire les recommandations rendues redondantes par une autre, deja retenue.
 *
 * Deux regles peuvent decrire le meme constat sous un angle different (par exemple
 * "le meilleur DJ surperforme" et "l'ecart entre DJs est important"). Les afficher
 * toutes les deux donne l'impression d'un outil bavard qui se repete.
 * Le tri etant deja fait, la regle la plus prioritaire gagne.
 */
function dropSupersededRules(recommendations) {
  const removed = new Set();

  for (const recommendation of recommendations) {
    if (removed.has(recommendation.id)) continue;
    for (const supersededId of recommendation.supersedes || []) {
      removed.add(supersededId);
    }
  }

  return recommendations
    .filter((recommendation) => !removed.has(recommendation.id))
    .map(({ supersedes, ...rest }) => rest);
}
