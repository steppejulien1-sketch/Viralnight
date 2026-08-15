// Appel de conversation en streaming vers OpenAI.
//
// Le streaming n'est pas cosmetique : une analyse fait plusieurs phrases, et attendre
// la reponse complete donne l'impression que rien ne se passe. On relaie donc les
// fragments au fur et a mesure.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// gpt-4o-mini suffit : le modele ne calcule rien, il interprete des chiffres deja
// fournis. Surdimensionner couterait plus cher sans gagner en fiabilite.
const MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 45000;

export class MissingApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY n'est pas configuree.");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Le compte OpenAI n'a plus de credit.
 *
 * ⚠️ CE CAS MERITE SON PROPRE TYPE, et ce n'est pas de la coquetterie.
 * Il etait traite comme une panne passagere, donc l'utilisateur lisait
 * « La reponse a ete interrompue. Reessayez. » — un message qui invite
 * a refaire une action qui ne peut PAS aboutir, et qui fait passer un
 * probleme de facturation pour un incident reseau. On peut reessayer
 * cent fois, il faut recharger le compte.
 *
 * Forme reelle de la reponse, relevee le 2026-08-15 contre l'API :
 *   HTTP 429, body { error: { type: "insufficient_quota", ... } }
 * ⚠️ Le 429 seul ne suffit PAS a conclure : c'est aussi le code d'une
 * limite de debit, elle passagere et pour laquelle reessayer est le bon
 * conseil. C'est `insufficient_quota` qui distingue les deux.
 */
export class QuotaExceededError extends Error {
  constructor() {
    super("Le compte OpenAI n'a plus de credit.");
    this.name = "QuotaExceededError";
  }
}

/**
 * Diffuse la reponse du modele fragment par fragment.
 *
 * @param {object[]} messages - messages au format OpenAI
 * @param {(chunk: string) => void} onChunk - appele a chaque fragment de texte
 * @returns {Promise<string>} la reponse complete
 */
export async function streamChatCompletion(messages, onChunk) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

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
        messages,
        // Temperature basse : on veut une lecture fidele des chiffres, pas de la creativite.
        temperature: 0.4,
        max_tokens: 700,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 429 && detail.includes("insufficient_quota")) {
        throw new QuotaExceededError();
      }
      throw new Error(`OpenAI a repondu ${response.status} : ${detail.slice(0, 300)}`);
    }

    return await consumeSseStream(response.body, onChunk);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lit un flux SSE OpenAI et extrait le texte.
 * Les fragments arrivent decoupes n'importe ou : on accumule donc jusqu'au
 * separateur de ligne avant de parser, sinon un JSON coupe en deux ferait echouer.
 */
async function consumeSseStream(body, onChunk) {
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for await (const rawChunk of body) {
    buffer += decoder.decode(rawChunk, { stream: true });

    const lines = buffer.split("\n");
    // La derniere ligne peut etre incomplete : on la garde pour le tour suivant.
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return full;

      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        // Fragment non parsable : on l'ignore plutot que d'interrompre la reponse.
      }
    }
  }

  return full;
}
