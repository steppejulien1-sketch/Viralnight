// Calcul du Viral Score (/100). Chaque composante est plafonnee independamment
// puis sommee, pour que le dashboard puisse expliquer le score composant par composant.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shannonDiversity(counts) {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) return 0;

  const entropy = counts
    .filter((c) => c > 0)
    .reduce((sum, c) => {
      const p = c / total;
      return sum - p * Math.log2(p);
    }, 0);

  const maxEntropy = Math.log2(counts.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * @param {object} params
 * @param {object} params.currentMetrics - event_metrics de la soiree courante
 * @param {number} params.avgReach - reach moyen des 12 dernieres soirees de l'establishment
 * @param {number} params.participantsCount - participants de la soiree
 * @param {number} params.bestSubmissionRatio - meilleur ratio submissions/participants historique
 * @param {number} params.bestClaimRatio - meilleur ratio reclamations/scans historique
 * @param {number} params.growthPercent - croissance vs moyenne mobile 4 soirees (eventComparison.vsAverage.total_reach)
 */
export function computeViralScore({
  currentMetrics,
  avgReach,
  participantsCount,
  bestSubmissionRatio,
  bestClaimRatio,
  growthPercent,
}) {
  const reachScore = avgReach > 0 ? clamp(30 * (currentMetrics.total_reach / avgReach), 0, 30) : 0;

  const submissionsTotal = currentMetrics.stories_count + currentMetrics.reels_count + currentMetrics.tiktoks_count;
  const submissionRatio = participantsCount > 0 ? submissionsTotal / participantsCount : 0;
  const participationScore = bestSubmissionRatio > 0
    ? clamp(20 * (submissionRatio / bestSubmissionRatio), 0, 20)
    : 0;

  const claimRatio = currentMetrics.scans_count > 0
    ? currentMetrics.rewards_claimed_count / currentMetrics.scans_count
    : 0;
  const claimScore = bestClaimRatio > 0 ? clamp(20 * (claimRatio / bestClaimRatio), 0, 20) : 0;

  const diversityScore = 15 * shannonDiversity([
    currentMetrics.stories_count,
    currentMetrics.reels_count,
    currentMetrics.tiktoks_count,
  ]);

  const growthScore = clamp(15 + 15 * (growthPercent / 20), 0, 15);

  const breakdown = {
    reach: round2(reachScore),
    participation: round2(participationScore),
    claimRate: round2(claimScore),
    contentDiversity: round2(diversityScore),
    growth: round2(growthScore),
  };

  const total = round2(reachScore + participationScore + claimScore + diversityScore + growthScore);

  return { score: clamp(total, 0, 100), breakdown };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
