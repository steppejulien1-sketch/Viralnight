// Analyse des recompenses pour une soiree : reach, publications, ratio cout/visibilite,
// scans et engagement generes par recompense. Prend des lignes brutes, ne fait aucun appel reseau.

function safeDiv(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Nombre minimum de reclamations avant de comparer deux recompenses.
 *
 * En dessous, l'ecart de reach moyen reflete surtout le hasard : une recompense
 * reclamee 3 fois par un client tres viral paraitrait meilleure que toutes les autres.
 * Le moteur doit refuser de conclure plutot que d'affirmer du bruit.
 */
export const MIN_CLAIMS_FOR_COMPARISON = 10;

/**
 * @param {object} params
 * @param {Array<object>} params.rewards - lignes public.rewards de l'establishment
 * @param {Array<object>} params.redemptions - reward_redemptions de l'event (avec reward_id)
 * @param {Array<object>} params.submissions - submissions de l'event (avec views_count)
 * @returns {{ perReward: Array<object>, rankedByReach: object, bestCostVisibility: object|null }}
 */
export function analyzeRewards({ rewards, redemptions, submissions }) {
  const redemptionsByReward = groupBy(redemptions, "reward_id");

  const claimantsByReward = new Map();
  for (const [rewardId, claims] of redemptionsByReward) {
    claimantsByReward.set(rewardId, new Set(claims.map((c) => c.customer_id)));
  }

  // Reach et nombre de publications par client sur la soiree.
  const reachByCustomer = new Map();
  const postsByCustomer = new Map();
  for (const submission of submissions) {
    const id = submission.customer_id;
    reachByCustomer.set(id, (reachByCustomer.get(id) || 0) + (submission.views_count || 0));
    postsByCustomer.set(id, (postsByCustomer.get(id) || 0) + 1);
  }

  // Le schema ne relie pas une publication a une recompense : on attribue donc le reach
  // d'un client aux recompenses qu'il a reclamees. Ce reach est REPARTI entre elles, et non
  // duplique : sans cela, un client ayant reclame trois recompenses gonflerait les trois,
  // et les recompenses populaires paraitraient artificiellement les plus performantes.
  const rewardCountByCustomer = new Map();
  for (const [, claimants] of claimantsByReward) {
    for (const customerId of claimants) {
      rewardCountByCustomer.set(customerId, (rewardCountByCustomer.get(customerId) || 0) + 1);
    }
  }

  const perReward = rewards.map((reward) => {
    const claims = redemptionsByReward.get(reward.id) || [];
    const claimants = claimantsByReward.get(reward.id) || new Set();

    let reach = 0;
    let publicationsCount = 0;

    for (const customerId of claimants) {
      const share = rewardCountByCustomer.get(customerId) || 1;
      reach += (reachByCustomer.get(customerId) || 0) / share;
      publicationsCount += (postsByCustomer.get(customerId) || 0) / share;
    }

    return {
      rewardId: reward.id,
      title: reward.title,
      pointsRequired: reward.points_required,
      claimsCount: claims.length,
      publicationsCount: Math.round(publicationsCount),
      avgReach: safeDiv(reach, claims.length || 1),
      totalReach: reach,
      // ratio cout/visibilite : points investis pour 1000 vues generees (plus bas = meilleur)
      costPerThousandReach: reach > 0 ? (reward.points_required * claims.length * 1000) / reach : null,
    };
  });

  const totalClaims = perReward.reduce((sum, r) => sum + r.claimsCount, 0);
  for (const reward of perReward) {
    // Preference = ce que les clients choisissent reellement, mesure la plus directe
    // et la plus fiable (pas d'attribution indirecte).
    reward.claimShare = safeDiv(reward.claimsCount, totalClaims);
    reward.hasEnoughData = reward.claimsCount >= MIN_CLAIMS_FOR_COMPARISON;
  }

  const rankedByPreference = [...perReward].sort((a, b) => b.claimsCount - a.claimsCount);

  // Les comparaisons de reach n'utilisent que les recompenses suffisamment reclamees.
  const comparable = perReward.filter((r) => r.hasEnoughData);
  const rankedByReach = comparable.sort((a, b) => b.avgReach - a.avgReach);
  const withCost = comparable.filter((r) => r.costPerThousandReach !== null);
  const bestCostVisibility = withCost.length
    ? withCost.reduce((best, r) => (r.costPerThousandReach < best.costPerThousandReach ? r : best))
    : null;

  return {
    perReward,
    rankedByReach: { best: rankedByReach[0] || null, second: rankedByReach[1] || null, all: rankedByReach },
    rankedByPreference,
    mostPreferred: rankedByPreference[0] || null,
    leastPreferred: rankedByPreference.length > 1 ? rankedByPreference.at(-1) : null,
    bestCostVisibility,
  };
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}
