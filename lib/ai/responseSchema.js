// Schema JSON force pour l'appel OpenAI, et validation de la reponse pour eviter les hallucinations :
// le LLM ne peut reformuler que des recommandations qui existent deja dans le moteur de regles,
// et ne peut pas introduire un chiffre qui s'ecarte de plus de 1% de la donnee source.

export const AI_NARRATIVE_JSON_SCHEMA = {
  name: "viral_intelligence_narrative",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "summary", "recommendationTexts"],
    properties: {
      headline: { type: "string", description: "Titre court (<=12 mots) resumant la soiree." },
      summary: { type: "string", description: "2-3 phrases resumant la performance, en francais professionnel." },
      recommendationTexts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text"],
          properties: {
            id: { type: "string", description: "Doit correspondre exactement a l'id d'une recommandation fournie." },
            text: { type: "string", description: "Reformulation professionnelle, sans nouveau chiffre invente." },
          },
        },
      },
    },
  },
};

/**
 * Extrait les valeurs numeriques avec leur unite.
 *
 * L'unite compte autant que la valeur : un message source parlant d'un "bonus x2"
 * contient le nombre 2, mais cela n'autorise pas le LLM a ecrire "a 2h du matin".
 * On compare donc des couples (valeur, unite) et non des nombres nus.
 */
function extractNumericTokens(text) {
  const tokens = [];
  const pattern = /(-?\d+(?:[.,]\d+)?)\s*(%|h\b|heures?\b)?/gi;

  for (const match of String(text).matchAll(pattern)) {
    const value = Number(match[1].replace(",", "."));
    if (!Number.isFinite(value)) continue;

    const rawUnit = (match[2] || "").toLowerCase();
    const unit = rawUnit.startsWith("h") ? "hour" : rawUnit === "%" ? "percent" : null;
    tokens.push({ value, unit });
  }

  return tokens;
}

function valuesMatch(a, b, tolerance = 0.01) {
  return Math.abs(b) > 0 ? Math.abs(a - b) / Math.abs(b) <= tolerance : a === b;
}

/**
 * Un token du texte IA est considere source si :
 *  - il porte une unite, et la source contient la meme valeur avec la meme unite ;
 *  - il est nu, et la source contient la meme valeur (quelle que soit son unite).
 */
function tokenIsSourced(token, sourceTokens) {
  return sourceTokens.some(
    (source) =>
      valuesMatch(token.value, source.value) && (token.unit === null || token.unit === source.unit),
  );
}

function extractNumbers(text) {
  return extractNumericTokens(text).map((token) => token.value);
}

function numberIsCloseToAny(value, references, tolerance = 0.01) {
  return references.some((ref) => valuesMatch(value, ref, tolerance));
}

/**
 * Valide la reponse du LLM contre les recommandations reellement declenchees par le moteur de regles.
 * Retourne { valid: boolean, reason?: string }.
 */
export function validateAiResponse(aiResponse, recommendations) {
  if (!aiResponse || typeof aiResponse !== "object") {
    return { valid: false, reason: "Reponse IA vide ou malformee." };
  }

  if (typeof aiResponse.headline !== "string" || typeof aiResponse.summary !== "string") {
    return { valid: false, reason: "headline ou summary manquant." };
  }

  const recommendationById = new Map(recommendations.map((r) => [r.id, r]));

  for (const item of aiResponse.recommendationTexts || []) {
    const source = recommendationById.get(item.id);
    if (!source) {
      return { valid: false, reason: `id inconnu dans la reponse IA: ${item.id}` };
    }
    if (typeof item.text !== "string" || !item.text.trim()) {
      return { valid: false, reason: `texte vide pour ${item.id}` };
    }

    // Tout chiffre present dans la reformulation doit exister dans la donnee source.
    // C'est l'invariant central : le LLM reformule, il ne calcule pas. Sans cela il
    // pourrait inventer un pourcentage credible sans qu'on le detecte.
    const sourceTokens = [
      { value: Number(source.estimatedGain), unit: "percent" },
      { value: Number(source.estimatedGain), unit: null },
      ...extractNumericTokens(source.message),
    ];
    const invented = extractNumericTokens(item.text).find((token) => !tokenIsSourced(token, sourceTokens));

    if (invented !== undefined) {
      return {
        valid: false,
        reason: `chiffre non source (${invented.value}${invented.unit === "hour" ? "h" : invented.unit === "percent" ? "%" : ""}) dans la reformulation de ${item.id}`,
      };
    }
  }

  return { valid: true };
}

/** Verifie que le resume global n'introduit aucun chiffre absent des donnees calculees. */
export function summaryHasOnlySourcedNumbers(summary, sourceNumbers) {
  return extractNumbers(summary).every((n) => numberIsCloseToAny(n, sourceNumbers));
}
