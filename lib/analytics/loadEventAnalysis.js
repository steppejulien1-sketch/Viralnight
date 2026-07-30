// Chargement des donnees d'une soiree depuis Supabase, puis execution du moteur.
//
// Extrait de api/viral-intelligence.js pour etre partage avec api/chat.js : les deux
// routes doivent analyser exactement la meme chose, sinon le chat commenterait des
// chiffres differents de ceux affiches dans le dashboard.

import { runFullAnalysis } from "./index.js";
import { generateRecommendations } from "../rules/index.js";

const HISTORY_LIMIT = 30; // soirees chargees pour donner du recul aux comparaisons et aux DJs

export class EventNotFoundError extends Error {
  constructor(eventId) {
    super(`Soiree ${eventId} introuvable pour cet etablissement.`);
    this.name = "EventNotFoundError";
  }
}

/**
 * @param {object} supabase - client service_role
 * @param {string} establishmentId - toujours issu de la session, jamais de la requete
 * @param {string} eventId
 * @returns {Promise<{analysis: object, recommendations: object[]}>}
 */
export async function loadEventAnalysis(supabase, establishmentId, eventId) {
  const [eventsRes, rewardsRes, metricsRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("event_date", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from("rewards").select("*").eq("establishment_id", establishmentId),
    supabase.from("event_metrics").select("*"),
  ]);

  if (eventsRes.error) throw eventsRes.error;
  if (rewardsRes.error) throw rewardsRes.error;
  if (metricsRes.error) throw metricsRes.error;

  const events = eventsRes.data || [];
  const eventIds = events.map((event) => event.id);

  if (!eventIds.includes(eventId)) throw new EventNotFoundError(eventId);

  const [submissionsRes, redemptionsRes, qrScansRes] = await Promise.all([
    supabase.from("submissions").select("*").in("event_id", eventIds),
    supabase.from("reward_redemptions").select("*").in("event_id", eventIds),
    supabase.from("qr_scans").select("*").in("event_id", eventIds),
  ]);

  if (submissionsRes.error) throw submissionsRes.error;
  if (redemptionsRes.error) throw redemptionsRes.error;
  if (qrScansRes.error) throw qrScansRes.error;

  const allSubmissions = submissionsRes.data || [];

  const analysis = runFullAnalysis({
    eventId,
    events,
    rewards: rewardsRes.data || [],
    redemptions: (redemptionsRes.data || []).filter((row) => row.event_id === eventId),
    submissions: allSubmissions.filter((row) => row.event_id === eventId),
    qrScans: (qrScansRes.data || []).filter((row) => row.event_id === eventId),
    metricsByEventId: new Map(
      (metricsRes.data || []).filter((row) => eventIds.includes(row.event_id)).map((row) => [row.event_id, row]),
    ),
    recentSubmissions: allSubmissions.filter((row) => row.event_id !== eventId),
  });

  return { analysis, recommendations: generateRecommendations(analysis) };
}
