// Deconnexion : supprime le jeton stocke. Les mentions deja recues restent
// (c'est un historique, pas une consequence de la connexion), seul l'acces
// futur au compte Instagram est coupe.

import { requireEstablishment } from "../lib/auth/requireEstablishment.js";

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, { error: "Methode non supportee." }, 405);

  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  const { error } = await auth.supabase
    .from("establishment_instagram_accounts")
    .delete()
    .eq("establishment_id", auth.establishmentId);

  if (error) {
    console.error("[instagram-disconnect]", error.message);
    return json(response, { error: "Deconnexion impossible." }, 500);
  }

  return json(response, { connecte: false });
}
