// Webhook Meta : verification d'URL (GET, une fois a la configuration de
// l'app) puis reception des mentions en story (POST, en continu).
//
// Route volontairement publique (aucune session, aucun jeton Supabase) :
// Meta ne peut pas s'authentifier comme un gerant. La securite repose sur
// le jeton de verification cote GET, et sur le fait que le POST ne fait
// jamais confiance a autre chose que l'igUserId du payload pour savoir
// quel establishment crediter (jamais un establishment_id lu ailleurs).

import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";
import { verifierChallengeWebhook, extraireMentions } from "../lib/instagram/webhook.js";

function texte(response, corps, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(corps);
}

async function lireBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};

  let brut = "";
  for await (const morceau of request) brut += morceau;
  return brut ? JSON.parse(brut) : {};
}

export default async function handler(request, response) {
  if (request.method === "GET") {
    const url = new URL(request.url, "http://localhost");
    const query = Object.fromEntries(url.searchParams.entries());
    const challenge = verifierChallengeWebhook(query, process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN);
    if (challenge === null) return texte(response, "Jeton de verification invalide.", 403);
    return texte(response, challenge, 200);
  }

  if (request.method !== "POST") return texte(response, "Methode non supportee.", 405);

  // Meta considere tout code != 2xx comme un echec et redeliv­re le meme
  // evenement plus tard : on repond 200 tres tot, meme si le traitement
  // interne echoue partiellement, pour ne jamais provoquer de tempete de
  // redelivrance sur un payload qu'on ne saura de toute facon pas mieux
  // traiter la fois suivante.
  let mentions = [];
  try {
    const payload = await lireBody(request);
    mentions = extraireMentions(payload);
  } catch (error) {
    console.error("[instagram-webhook] payload illisible:", error.message);
    return texte(response, "EVENT_RECEIVED");
  }

  if (!mentions.length) return texte(response, "EVENT_RECEIVED");

  try {
    const supabase = getSupabaseAdmin();

    // Un igUserId peut correspondre a plusieurs mentions dans le meme
    // payload : on ne resout la table qu'une fois par identifiant distinct.
    const igUserIds = [...new Set(mentions.map((m) => m.igUserId))];
    const { data: comptes } = await supabase
      .from("establishment_instagram_accounts")
      .select("establishment_id, ig_user_id")
      .in("ig_user_id", igUserIds);

    const etablissementParIgUserId = new Map((comptes || []).map((c) => [c.ig_user_id, c.establishment_id]));

    const lignes = mentions
      .map((m) => ({ establishment_id: etablissementParIgUserId.get(m.igUserId), media_id: m.mediaId }))
      .filter((ligne) => ligne.establishment_id);

    if (lignes.length) {
      // ignoreDuplicates : Meta redeliv­re parfois le meme evenement, et
      // l'index unique (establishment_id, media_id) sert exactement a ca.
      await supabase.from("instagram_mentions").upsert(lignes, { onConflict: "establishment_id,media_id", ignoreDuplicates: true });
    }
  } catch (error) {
    console.error("[instagram-webhook] enregistrement echoue:", error.message);
  }

  return texte(response, "EVENT_RECEIVED");
}
