import { analyzeRewards } from "./rewardAnalytics.js";
import { analyzeDjs } from "./djAnalytics.js";
import { analyzeTiming } from "./timeAnalytics.js";
import { compareEvents } from "./eventComparison.js";
import { computeViralScore } from "./viralScore.js";
import { analyzeCustomers } from "./customerAnalytics.js";

const HISTORY_WINDOW = 12; // soirees prises en compte pour les moyennes de reference
const GROWTH_WINDOW = 4; // soirees prises en compte pour la moyenne mobile de croissance

/**
 * Point d'entree unique du module analytics. Recoit des lignes brutes Supabase
 * (deja filtrees sur l'establishment) et retourne tous les resultats chiffres
 * necessaires au moteur de regles et au dashboard. Aucune logique de decision ici :
 * uniquement du calcul.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {Array<object>} params.events - soirees de l'establishment (les plus recentes en premier)
 * @param {Array<object>} params.rewards
 * @param {Array<object>} params.redemptions - reward_redemptions de l'event courant
 * @param {Array<object>} params.submissions - submissions de l'event courant
 * @param {Array<object>} params.qrScans - qr_scans de l'event courant
 * @param {Map<string, object>} params.metricsByEventId - event_metrics historiques (inclut l'event courant s'il existe deja)
 * @param {Array<object>} [params.recentSubmissions] - submissions des soirees precedentes, pour la fidelite client
 */
export function runFullAnalysis({
  eventId,
  events,
  rewards,
  redemptions,
  submissions,
  qrScans,
  metricsByEventId,
  recentSubmissions = [],
}) {
  const currentEvent = events.find((e) => e.id === eventId);
  if (!currentEvent) throw new Error(`Event ${eventId} introuvable dans le jeu de donnees fourni.`);

  const rewardAnalytics = analyzeRewards({ rewards, redemptions, submissions });
  const djAnalytics = analyzeDjs({ events, metricsByEventId });
  const timing = analyzeTiming({
    submissionTimestamps: submissions.map((s) => s.submitted_at),
    scanTimestamps: qrScans.map((s) => s.scanned_at),
    redemptionTimestamps: redemptions.map((r) => r.redeemed_at),
  });

  const currentComputedMetrics = computeRawMetrics({ submissions, redemptions, qrScans });
  const customerAnalytics = analyzeCustomers({ submissions, qrScans, recentSubmissions });

  const historyEvents = events
    .filter((e) => e.id !== eventId && e.event_date < currentEvent.event_date)
    .slice(0, HISTORY_WINDOW);
  const historyMetrics = historyEvents.map((e) => metricsByEventId.get(e.id)).filter(Boolean);
  const previousMetrics = historyMetrics[0] || null;
  const recentMetrics = historyMetrics.slice(0, GROWTH_WINDOW);

  const comparison = compareEvents({
    currentMetrics: currentComputedMetrics,
    previousMetrics,
    recentMetrics,
  });

  const avgReach = historyMetrics.length
    ? historyMetrics.reduce((sum, m) => sum + m.total_reach, 0) / historyMetrics.length
    : currentComputedMetrics.total_reach;

  const bestSubmissionRatio = bestRatioOverParticipants(historyEvents, historyMetrics, (m) =>
    m.stories_count + m.reels_count + m.tiktoks_count,
  );
  const bestClaimRatio = bestDirectRatio(historyMetrics, (m) =>
    m.scans_count > 0 ? m.rewards_claimed_count / m.scans_count : 0,
  );

  const { score, breakdown } = computeViralScore({
    currentMetrics: currentComputedMetrics,
    avgReach,
    participantsCount: currentEvent.participants_count,
    bestSubmissionRatio: bestSubmissionRatio || 1,
    bestClaimRatio: bestClaimRatio || 1,
    growthPercent: comparison.vsAverage.total_reach,
  });

  return {
    event: currentEvent,
    metrics: currentComputedMetrics,
    rewardAnalytics,
    djAnalytics,
    timing,
    comparison,
    customerAnalytics,
    viralScore: score,
    scoreBreakdown: breakdown,
  };
}

function computeRawMetrics({ submissions, redemptions, qrScans }) {
  return {
    total_reach: submissions.reduce((sum, s) => sum + (s.views_count || 0), 0),
    stories_count: submissions.filter((s) => s.content_type === "story").length,
    reels_count: submissions.filter((s) => s.content_type === "reel").length,
    tiktoks_count: submissions.filter((s) => s.platform === "tiktok").length,
    points_distributed: submissions.reduce((sum, s) => sum + (s.points_awarded || 0), 0),
    rewards_claimed_count: redemptions.length,
    scans_count: qrScans.length,
  };
}

function bestRatioOverParticipants(events, metricsList, numeratorFn) {
  let best = 0;
  events.forEach((event, index) => {
    const metrics = metricsList[index];
    if (!metrics || !event.participants_count) return;
    const ratio = numeratorFn(metrics) / event.participants_count;
    if (ratio > best) best = ratio;
  });
  return best;
}

function bestDirectRatio(metricsList, ratioFn) {
  return metricsList.reduce((best, metrics) => Math.max(best, ratioFn(metrics)), 0);
}
