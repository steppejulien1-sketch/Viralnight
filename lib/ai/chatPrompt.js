// Construction du prompt de conversation.
//
// Le modele recoit uniquement les resultats DEJA calcules par lib/analytics et
// lib/rules. Il n'a acces a aucune donnee brute et ne doit jamais calculer :
// il interprete, explique et converse a partir de ces chiffres.

export const CHAT_SYSTEM_PROMPT = `Tu es l'analyste de Noctify, un outil qui aide les patrons de boites de nuit
a comprendre leurs soirees. Tu discutes en francais avec le gerant du club.

REGLES ABSOLUES
1. Tu ne disposes que des chiffres presents dans le bloc DONNEES ci-dessous. N'invente jamais
   un chiffre, un nom de DJ, une recompense ou une date qui n'y figure pas.
2. Si une question porte sur une information absente des DONNEES, dis-le simplement et propose
   ce que tu peux analyser a la place. Ne devine pas.
3. Ne recalcule rien. Les pourcentages, moyennes et scores sont deja calcules : reprends-les
   tels quels. Tu peux comparer deux chiffres fournis, mais pas en fabriquer de nouveaux.
4. Reste dans le sujet : les soirees, les DJs, les recompenses, les horaires de publication,
   la frequentation et la visibilite du club. Pour toute autre demande, recentre poliment.

STYLE
- Direct et concret, comme un consultant qui connait le terrain. Pas de jargon technique.
- Cite toujours les chiffres qui appuient ton propos.
- Va au fond : explique le pourquoi, distingue la correlation de la cause, signale quand un
  echantillon est trop petit pour conclure.
- Reponses courtes par defaut (2 a 5 phrases). Developpe seulement si on te le demande.
- Pas de listes a puces sauf si on demande explicitement une liste.
- Tutoie ou vouvoie selon le ton du gerant, en restant professionnel.`;

/**
 * Serialise l'analyse pour le modele : uniquement des resultats, jamais de lignes brutes.
 *
 * @param {object} analysis - sortie de runFullAnalysis()
 * @param {object[]} recommendations - sortie de generateRecommendations()
 */
export function buildFactsBlock(analysis, recommendations) {
  const facts = {
    soiree: {
      nom: analysis.event.name,
      date: analysis.event.event_date,
      dj: analysis.event.dj_name,
      participants: analysis.event.participants_count,
    },
    note_sur_100: Math.round(analysis.viralScore),
    detail_de_la_note: analysis.scoreBreakdown,
    chiffres_de_la_soiree: {
      vues_generees: analysis.metrics.total_reach,
      stories: analysis.metrics.stories_count,
      reels: analysis.metrics.reels_count,
      tiktok: analysis.metrics.tiktoks_count,
      points_distribues: analysis.metrics.points_distributed,
      recompenses_reclamees: analysis.metrics.rewards_claimed_count,
      scans_qr: analysis.metrics.scans_count,
    },
    ecart_en_pourcent_vs_moyenne_recente: Object.fromEntries(
      Object.entries(analysis.comparison.vsAverage).map(([key, value]) => [key, Math.round(value)]),
    ),
    djs: analysis.djAnalytics.perDj.map((dj) => ({
      nom: dj.djName,
      soirees_mesurees: dj.eventsCount,
      vues_moyennes: Math.round(dj.avgReach),
      vues_min: Math.round(dj.worstReach),
      vues_max: Math.round(dj.bestReach),
      scans_moyens: Math.round(dj.avgParticipation),
      publications_moyennes: Math.round(dj.avgEngagement),
      irregularite: Number(dj.reachVariability.toFixed(2)),
    })),
    recompenses: analysis.rewardAnalytics.perReward.map((reward) => ({
      titre: reward.title,
      points_requis: reward.pointsRequired,
      reclamations: reward.claimsCount,
      part_des_reclamations_en_pourcent: Math.round(reward.claimShare * 100),
      vues_moyennes_par_reclamation: Math.round(reward.avgReach),
      echantillon_suffisant: reward.hasEnoughData,
    })),
    horaires: {
      par_heure: analysis.timing.heatmap.map((bucket) => ({
        heure: bucket.hour,
        publications: bucket.publications,
        scans: bucket.scans,
        reclamations: bucket.redemptions,
      })),
      pic_publications: analysis.timing.publicationPeakHour,
      pic_scans: analysis.timing.scanPeakHour,
      heure_bonus_recommandee: analysis.timing.recommendedBonusHour,
    },
    clients: {
      scanneurs_uniques: analysis.customerAnalytics.uniqueScanners,
      publicateurs_uniques: analysis.customerAnalytics.uniquePublishers,
      taux_scan_vers_publication: Number(analysis.customerAnalytics.scanToPublishRatio.toFixed(2)),
      clients_fideles: analysis.customerAnalytics.loyalCustomersCount,
      vues_du_client_le_plus_viral: analysis.customerAnalytics.mostViralCustomerReach,
    },
    recommandations_du_moteur: recommendations.map((rec) => ({
      constat: rec.message,
      gain_estime_en_pourcent: rec.estimatedGain,
      priorite: rec.priority,
      domaine: rec.category,
    })),
  };

  return `DONNEES (seule source autorisee) :\n${JSON.stringify(facts, null, 1)}`;
}

/**
 * Assemble les messages envoyes au modele.
 *
 * Les faits sont injectes dans un message systeme distinct, place apres les consignes :
 * on peut ainsi rafraichir les donnees a chaque tour sans reecrire l'historique.
 *
 * @param {object[]} history - [{role: "user"|"assistant", content: string}]
 */
export function buildChatMessages({ analysis, recommendations, history }) {
  return [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    { role: "system", content: buildFactsBlock(analysis, recommendations) },
    ...history,
  ];
}
