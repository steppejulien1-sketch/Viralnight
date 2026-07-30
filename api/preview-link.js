import { requireEstablishment } from "../lib/auth/requireEstablishment.js";
import { apercuLien } from "../lib/verification/linkPreview.js";

/**
 * Apercu d'une publication pour la file de validation.
 *
 * Passe par le serveur et non par le navigateur : les endpoints oEmbed de TikTok et
 * YouTube n'autorisent pas les appels depuis une autre origine, et la cle YouTube
 * ne doit jamais se retrouver cote client.
 *
 * Reserve au staff connecte : c'est un outil interne, et l'exposer publiquement
 * en ferait un proxy gratuit vers des API tierces.
 */
function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  // Les apercus changent peu : un cache court evite de rappeler TikTok a chaque
  // reaffichage de la file de validation.
  response.setHeader("Cache-Control", status === 200 ? "private, max-age=300" : "no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    return json(response, { error: "Methode non supportee." }, 405);
  }

  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  const url = new URL(request.url, `https://${request.headers.host}`).searchParams.get("url");
  if (!url) return json(response, { error: "Parametre url requis." }, 400);

  try {
    const apercu = await apercuLien(url, { youtubeKey: process.env.YOUTUBE_API_KEY });

    if (!apercu) {
      return json(response, { error: "Lien non reconnu (Instagram, TikTok ou YouTube attendu)." }, 400);
    }

    return json(response, apercu);
  } catch (error) {
    console.error("[api/preview-link]", error);
    return json(response, { error: "Verification impossible pour le moment." }, 502);
  }
}
