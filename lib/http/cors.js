/* CORS des applis natives (08/09/2026, etendu a toutes les routes le 29/09/2026).

   Les applis iOS/Android ne sont pas servies par notre domaine : iOS sert la
   page depuis capacitor://localhost, Android depuis https://localhost. Sans
   en-tete CORS, la webview refuse la reponse avant meme que le code la voie
   -- l'appli gerants ne pouvait donc RIEN charger (creation du lieu, bons,
   Instagram...).

   ⚠️ LISTE BLANCHE, JAMAIS "*". Ce n'est pas le CORS qui autorise l'appel --
   c'est le jeton de session, verifie par chaque route -- mais autant ne pas
   offrir ces routes a n'importe quelle page web. Aucun cookie ne circule :
   les routes lisent un en-tete Authorization, pas une session navigateur.

   Au navigateur rien ne change : la page et l'API ont la meme origine, le
   navigateur n'envoie pas de prevol et ne lit pas ces en-tetes. */

export const ORIGINES_APPLI = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
  "https://viralnight-koif.vercel.app",
]);

export function poserCors(request, response) {
  const origine = request.headers.origin;
  if (!origine || !ORIGINES_APPLI.has(origine)) return;
  response.setHeader("Access-Control-Allow-Origin", origine);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
}

/** Pose les en-tetes CORS et repond au prevol. Rend true si la requete
    etait un prevol (OPTIONS) : la route n'a alors plus rien a faire.
    ⚠️ A appeler AVANT le controle de methode, sinon le prevol prend un 405
    et le navigateur abandonne l'appel reel. */
export function repondrePrevol(request, response) {
  poserCors(request, response);
  if (request.method !== "OPTIONS") return false;
  response.statusCode = 204;
  response.end();
  return true;
}
