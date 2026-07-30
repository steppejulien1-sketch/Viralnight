// Construction du prompt envoye a OpenAI. N'envoie JAMAIS les lignes brutes de la base :
// uniquement les resultats deja calcules par analytics + rules.

export const SYSTEM_PROMPT = `Tu es un redacteur professionnel pour un dashboard de club/bar.
Tu recois des donnees deja calculees (chiffres, recommandations) et tu dois uniquement les reformuler
en francais clair et professionnel, sans jamais inventer de chiffre, de recommandation ou de fait
absent des donnees fournies. Chaque recommandation reformulee doit garder le meme sens que
la version source. N'ajoute aucune recommandation qui n'est pas dans la liste fournie.`;

/**
 * @param {object} analysisContext - sortie de runFullAnalysis()
 * @param {import("../rules/engine.js").Recommendation[]} recommendations
 */
export function buildUserPrompt(analysisContext, recommendations) {
  const payload = {
    viralScore: analysisContext.viralScore,
    scoreBreakdown: analysisContext.scoreBreakdown,
    bestReward: analysisContext.rewardAnalytics.rankedByReach.best?.title || null,
    worstReward: analysisContext.rewardAnalytics.rankedByReach.all.at(-1)?.title || null,
    bestDJ: analysisContext.djAnalytics.best?.djName || null,
    peakPublicationHour: analysisContext.timing.publicationPeakHour,
    peakScanHour: analysisContext.timing.scanPeakHour,
    reachChangeVsAverage: Math.round(analysisContext.comparison.vsAverage.total_reach),
    recommendations: recommendations.map((r) => ({
      id: r.id,
      category: r.category,
      message: r.message,
      estimatedGain: r.estimatedGain,
    })),
  };

  return `Voici les donnees calculees pour la soiree "${analysisContext.event.name}" du ${analysisContext.event.event_date} :

${JSON.stringify(payload, null, 2)}

Reponds au format JSON demande : un "headline", un "summary" de 2-3 phrases, et pour chaque
recommandation de la liste ci-dessus un objet {id, text} qui la reformule professionnellement.`;
}
