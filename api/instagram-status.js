// Statut de la connexion Instagram, pour l'afficher dans le dashboard.
//
// Ne renvoie JAMAIS de jeton au client : seulement de quoi afficher "connecte
// a @nom_du_compte" et le nombre de mentions recues. Le dashboard n'a
// aucune raison de voir un access_token, et une route qui l'exposerait
// deviendrait une facon d'exfiltrer l'acces au compte Instagram du club.

import { requireEstablishment } from "../lib/auth/requireEstablishment.js";

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, { error: "Methode non supportee." }, 405);

  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  const { data: compte, error: erreurCompte } = await auth.supabase
    .from("establishment_instagram_accounts")
    .select("ig_username, webhook_subscribed, connected_at, token_expires_at")
    .eq("establishment_id", auth.establishmentId)
    .maybeSingle();

  if (erreurCompte) {
    console.error("[instagram-status]", erreurCompte.message);
    return json(response, { error: "Lecture du statut Instagram impossible." }, 500);
  }

  if (!compte) return json(response, { connecte: false });

  const { count, error: erreurCompteur } = await auth.supabase
    .from("instagram_mentions")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", auth.establishmentId);

  if (erreurCompteur) console.error("[instagram-status] comptage mentions:", erreurCompteur.message);

  return json(response, {
    connecte: true,
    username: compte.ig_username,
    webhookActif: compte.webhook_subscribed,
    connecteDepuis: compte.connected_at,
    jetonExpireLe: compte.token_expires_at,
    mentions: count ?? 0,
  });
}
