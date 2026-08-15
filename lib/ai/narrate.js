import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { callOpenAiNarrative } from "./openaiClient.js";
import { validateAiResponse } from "./responseSchema.js";

/**
 * Orchestration de la couche IA : ne fait que reformuler des recommandations
 * deja produites par le moteur de regles. En cas d'echec (API indisponible,
 * reponse invalide, chiffre suspect), retombe sur les textes bruts du moteur
 * de regles : le dashboard n'est jamais bloque par une panne IA.
 *
 * @param {object} analysisContext
 * @param {import("../rules/engine.js").Recommendation[]} recommendations
 */
export async function narrateAnalysis(analysisContext, recommendations) {
  const fallback = buildFallbackNarrative(analysisContext, recommendations);

  if (!process.env.OPENAI_API_KEY) return fallback;

  try {
    const userPrompt = buildUserPrompt(analysisContext, recommendations);
    const aiResponse = await callOpenAiNarrative(SYSTEM_PROMPT, userPrompt);

    const validation = validateAiResponse(aiResponse, recommendations);
    if (!validation.valid) {
      console.warn(`[ai] reponse rejetee: ${validation.reason}`);
      return fallback;
    }

    const textById = new Map(aiResponse.recommendationTexts.map((r) => [r.id, r.text]));
    return {
      headline: aiResponse.headline,
      summary: aiResponse.summary,
      recommendations: recommendations.map((r) => ({
        ...r,
        message: textById.get(r.id) || r.message,
      })),
      source: "ai",
    };
  } catch (error) {
    // ⚠️ Ici le repli est le bon comportement — le recit calcule est
    // vrai, il ne manque que la reformulation. Mais la CAUSE doit etre
    // lisible dans les journaux : un compte sans credit degrade la page
    // en silence, et sans cette ligne on cherche un bug la ou il n'y en
    // a pas. Forme relevee contre l'API le 2026-08-15 : HTTP 429 +
    // `insufficient_quota`.
    if (String(error?.message).includes("insufficient_quota")) {
      console.error("[ai] compte OpenAI sans credit — recit calcule servi a la place");
    } else {
      console.error("[ai] appel OpenAI en echec", error);
    }
    return fallback;
  }
}

function buildFallbackNarrative(analysisContext, recommendations) {
  return {
    headline: `Viral Score ${analysisContext.viralScore}/100`,
    summary: `Analyse de "${analysisContext.event.name}" basee sur ${recommendations.length} recommandation(s) generee(s) par le moteur de regles.`,
    recommendations,
    source: "rules-only",
  };
}
