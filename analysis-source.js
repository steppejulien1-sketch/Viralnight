// Source de donnees de la page d'analyse.
//
// Deux modes, choisis automatiquement :
//   - "live"  : un owner est connecte -> les soirees viennent de Supabase et l'analyse
//               de /api/viral-intelligence (moteur de regles + reformulation IA cote serveur).
//   - "demo"  : pas de session (ou Supabase non configure) -> le meme moteur tourne dans
//               le navigateur sur des donnees generees.
//
// L'interet de cette separation : la page de rendu ne connait qu'une seule forme de
// resultat, { analysis, recommendations }, et reste identique dans les deux modes.

import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { buildDemoDataset, buildMetricsMap } from "./demo-data.js";
import { runFullAnalysis } from "./lib/analytics/index.js";
import { generateRecommendations } from "./lib/rules/index.js";

let demoDataset = null;
let demoMetrics = null;

function ensureDemoData() {
  if (!demoDataset) {
    demoDataset = buildDemoDataset();
    demoMetrics = buildMetricsMap(demoDataset);
  }
  return { dataset: demoDataset, metrics: demoMetrics };
}

/**
 * Determine le mode et, en mode live, l'establishment de l'utilisateur connecte.
 * Toute erreur fait basculer en demo plutot que de bloquer la page.
 */
export async function resolveSource() {
  if (!isSupabaseConfigured || !supabase) {
    return { mode: "demo", reason: "Supabase n'est pas configuré." };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      return { mode: "demo", reason: "Aucune session : connectez-vous pour voir vos vraies soirées." };
    }

    const { data: owner, error } = await supabase
      .from("establishment_owners")
      .select("establishment_id")
      .eq("id", sessionData.session.user.id)
      .maybeSingle();

    if (error || !owner?.establishment_id) {
      return { mode: "demo", reason: "Ce compte n'est rattaché à aucun établissement." };
    }

    return { mode: "live", establishmentId: owner.establishment_id };
  } catch (error) {
    return { mode: "demo", reason: `Supabase injoignable (${error.message}).` };
  }
}

/**
 * Liste des soirees, avec leur reach pour la courbe de tendance.
 * @returns {Promise<Array<{id:string,name:string,eventDate:string,djName:string|null,reach:number}>>}
 */
export async function loadEvents(source) {
  if (source.mode === "demo") {
    const { dataset, metrics } = ensureDemoData();
    return dataset.events.map((event) => ({
      id: event.id,
      name: event.name,
      eventDate: event.event_date,
      djName: event.dj_name,
      reach: metrics.get(event.id).total_reach,
    }));
  }

  const { data: events, error } = await supabase
    .from("events")
    .select("id, name, event_date, dj_name")
    .eq("establishment_id", source.establishmentId)
    .order("event_date", { ascending: true })
    .limit(30);

  if (error) throw new Error(`Chargement des soirées impossible : ${error.message}`);
  if (!events?.length) return [];

  // Le reach vient du cache event_metrics, alimente par l'API a chaque analyse.
  const { data: metrics } = await supabase
    .from("event_metrics")
    .select("event_id, total_reach")
    .in("event_id", events.map((event) => event.id));

  const reachByEvent = new Map((metrics || []).map((row) => [row.event_id, row.total_reach]));

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    eventDate: event.event_date,
    djName: event.dj_name,
    reach: reachByEvent.get(event.id) || 0,
  }));
}

/**
 * Analyse d'une soiree.
 * @returns {Promise<{analysis: object, recommendations: object[], narrative: object|null}>}
 */
export async function loadAnalysis(source, eventId) {
  if (source.mode === "demo") return analyzeLocally(eventId);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Session expirée, reconnectez-vous.");

  const response = await fetch(`/api/viral-intelligence?${new URLSearchParams({ eventId })}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "L'analyse a échoué.");

  return {
    // L'API renvoie deja les analyses calculees cote serveur.
    analysis: body,
    recommendations: body.narrative?.recommendations || [],
    narrative: body.narrative || null,
  };
}

/** Execute le moteur dans le navigateur, sur les donnees de demonstration. */
function analyzeLocally(eventId) {
  const { dataset, metrics } = ensureDemoData();

  const analysis = runFullAnalysis({
    eventId,
    // Le moteur attend les soirees les plus recentes en premier, comme la requete Supabase.
    events: [...dataset.events].reverse(),
    rewards: dataset.rewards,
    redemptions: dataset.redemptions.filter((r) => r.event_id === eventId),
    submissions: dataset.submissions.filter((s) => s.event_id === eventId),
    qrScans: dataset.qrScans.filter((s) => s.event_id === eventId),
    metricsByEventId: metrics,
    recentSubmissions: dataset.submissions.filter((s) => s.event_id !== eventId),
  });

  return { analysis, recommendations: generateRecommendations(analysis), narrative: null };
}
