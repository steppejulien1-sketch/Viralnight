import { AI_NARRATIVE_JSON_SCHEMA } from "./responseSchema.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini"; // reformulation uniquement, pas de raisonnement chiffre : pas besoin d'un modele plus cher
const TIMEOUT_MS = 15000;

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<object>} objet JSON parse conforme a AI_NARRATIVE_JSON_SCHEMA
 */
export async function callOpenAiNarrative(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY non configure.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: AI_NARRATIVE_JSON_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI a repondu ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Reponse OpenAI sans contenu.");

    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}
