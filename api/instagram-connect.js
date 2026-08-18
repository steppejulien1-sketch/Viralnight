// Point de depart de la connexion Instagram : le bouton "Connecter mon
// compte Instagram" du dashboard appelle cette route en fetch() authentifie
// (comme toute route qui touche a des donnees de club) puis redirige
// lui-meme le navigateur vers l'URL renvoyee.
//
// Pas de redirection HTTP directe ici expres : une simple navigation
// (<a href="/api/instagram-connect">) n'emporterait aucun en-tete
// Authorization, et cette route doit pourtant authentifier le gerant avant
// de savoir quel establishment signer dans le state.

import { requireEstablishment } from "../lib/auth/requireEstablishment.js";
import { signerState } from "../lib/instagram/state.js";
import { urlAutorisation, MissingConfigError } from "../lib/instagram/oauth.js";

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

  try {
    const state = signerState(auth.establishmentId);
    return json(response, { url: urlAutorisation(state) });
  } catch (error) {
    if (error instanceof MissingConfigError) {
      return json(response, { error: "La connexion Instagram n'est pas encore configuree sur ce serveur." }, 500);
    }
    console.error("[instagram-connect]", error);
    return json(response, { error: "Impossible de demarrer la connexion Instagram." }, 500);
  }
}
