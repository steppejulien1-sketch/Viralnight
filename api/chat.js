import { requireEstablishment } from "../lib/auth/requireEstablishment.js";
import { loadEventAnalysis, EventNotFoundError } from "../lib/analytics/loadEventAnalysis.js";
import { buildChatMessages } from "../lib/ai/chatPrompt.js";
import { streamChatCompletion, MissingApiKeyError } from "../lib/ai/chatClient.js";

const MAX_HISTORY = 12; // tours conserves : au-dela, le contexte coute cher sans servir
const MAX_MESSAGE_LENGTH = 2000;

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};

  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

/**
 * Nettoie l'historique fourni par le client.
 *
 * L'historique vient du navigateur : il ne faut jamais le passer tel quel au modele.
 * On ne garde que les roles attendus, on tronque les messages trop longs et on limite
 * le nombre de tours, pour eviter qu'un client manipule le contexte ou fasse exploser
 * la facture.
 */
function sanitizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .filter((message) => typeof message.content === "string" && message.content.trim())
    .slice(-MAX_HISTORY)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH),
    }));
}

/** Envoie un evenement SSE. */
function sendEvent(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, { error: "Methode non supportee." }, 405);
  }

  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  let body;
  try {
    body = await readBody(request);
  } catch {
    return json(response, { error: "Corps de requete invalide." }, 400);
  }

  const eventId = String(body.eventId || "").trim();
  if (!eventId) return json(response, { error: "eventId est requis." }, 400);

  const history = sanitizeHistory(body.messages);
  if (!history.length || history.at(-1).role !== "user") {
    return json(response, { error: "Le dernier message doit venir de l'utilisateur." }, 400);
  }

  try {
    const { analysis, recommendations } = await loadEventAnalysis(auth.supabase, auth.establishmentId, eventId);
    const messages = buildChatMessages({ analysis, recommendations, history });

    // A partir d'ici la reponse est un flux : les erreurs doivent passer par un
    // evenement SSE, plus par un code HTTP (les en-tetes sont deja envoyes).
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    try {
      const full = await streamChatCompletion(messages, (chunk) => sendEvent(response, "delta", { text: chunk }));
      sendEvent(response, "done", { text: full });
    } catch (error) {
      console.error("[api/chat] streaming interrompu", error);
      sendEvent(response, "error", {
        error:
          error instanceof MissingApiKeyError
            ? "Le chat n'est pas encore configure : ajoutez OPENAI_API_KEY cote serveur."
            : "La reponse a ete interrompue. Reessayez.",
      });
    }

    response.end();
  } catch (error) {
    if (error instanceof EventNotFoundError) {
      return json(response, { error: error.message }, 404);
    }
    console.error("[api/chat]", error);
    return json(response, { error: "Impossible de preparer l'analyse de cette soiree." }, 500);
  }
}
