import { requireEstablishment } from "../lib/auth/requireEstablishment.js";
import { loadEventAnalysis, EventNotFoundError } from "../lib/analytics/loadEventAnalysis.js";
import { narrateAnalysis } from "../lib/ai/narrate.js";

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

/**
 * Empreinte des donnees qui justifient une reformulation IA. Tant qu'elle ne change pas,
 * le texte en cache reste valable.
 */
function narrativeFingerprint(analysis, recommendations) {
  return JSON.stringify({
    score: analysis.viralScore,
    reach: analysis.metrics.total_reach,
    ids: recommendations.map((r) => r.id),
  });
}

/**
 * Reformulation IA avec cache en base.
 *
 * Un appel OpenAI par soiree, pas par affichage du dashboard : sans ce cache, chaque
 * consultation d'une soiree passee refacturerait le meme texte. Le cache est invalide
 * des que les analyses sous-jacentes changent (nouvelles publications, regles differentes).
 */
async function getOrCreateNarrative(supabase, eventId, analysis, recommendations) {
  const fingerprint = narrativeFingerprint(analysis, recommendations);

  const { data: cached } = await supabase
    .from("event_metrics")
    .select("ai_narrative")
    .eq("event_id", eventId)
    .maybeSingle();

  if (cached?.ai_narrative?.fingerprint === fingerprint) {
    return { ...cached.ai_narrative.narrative, cached: true };
  }

  const narrative = await narrateAnalysis(analysis, recommendations);

  // Upsert plutot qu'update : la ligne event_metrics peut ne pas exister encore pour une
  // soiree jamais passee par le script de recalcul. On profite de l'occasion pour
  // rafraichir les metriques, ce qui garde le cache utilise par les comparaisons a jour.
  // Le repli "rules-only" n'est pas mis en cache : il est gratuit a regenerer et doit
  // laisser une chance a l'IA au prochain appel.
  const { error } = await supabase.from("event_metrics").upsert({
    event_id: eventId,
    ...analysis.metrics,
    viral_score: analysis.viralScore,
    score_breakdown: analysis.scoreBreakdown,
    ...(narrative.source === "ai" ? { ai_narrative: { fingerprint, narrative } } : {}),
    computed_at: new Date().toISOString(),
  });

  if (error) console.warn("[viral-intelligence] persistance des metriques impossible", error.message);

  return { ...narrative, cached: false };
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return json(response, { error: "Methode non supportee." }, 405);
  }

  const url = new URL(request.url, `https://${request.headers.host}`);
  const eventId = url.searchParams.get("eventId");

  if (!eventId) {
    return json(response, { error: "eventId est requis." }, 400);
  }

  // L'establishment vient de la session, jamais de la requete : cette route utilise
  // la cle service_role qui contourne RLS.
  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  const { supabase, establishmentId } = auth;

  try {
    // Chargement et calcul partages avec api/chat.js : les deux routes doivent
    // commenter exactement les memes chiffres.
    const { analysis, recommendations } = await loadEventAnalysis(supabase, establishmentId, eventId);

    const narrative = await getOrCreateNarrative(supabase, eventId, analysis, recommendations);

    return json(response, {
      event: analysis.event,
      viralScore: analysis.viralScore,
      scoreBreakdown: analysis.scoreBreakdown,
      metrics: analysis.metrics,
      rewardAnalytics: analysis.rewardAnalytics,
      djAnalytics: analysis.djAnalytics,
      timing: analysis.timing,
      comparison: analysis.comparison,
      customerAnalytics: analysis.customerAnalytics,
      narrative,
    });
  } catch (error) {
    if (error instanceof EventNotFoundError) {
      return json(response, { error: error.message }, 404);
    }
    console.error("[api/viral-intelligence]", error);
    return json(response, { error: "Erreur lors du calcul de Viral Intelligence." }, 500);
  }
}
