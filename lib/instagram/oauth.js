// Connexion Instagram du club : « Instagram API avec connexion Instagram ».
//
// ⚠️ CHANGE LE 14/09/2026. Ce fichier passait par « Facebook Login for
// Business » et le champ webhook `mentions`. Deux problemes, trouves en
// configurant l'app Meta avec Julien :
//   - `mentions` ne couvre que les @mentions dans les commentaires et les
//     legendes. Une mention en STORY arrive par la messagerie Instagram
//     (champ `messages`, piece jointe `story_mention`) : rien ne serait
//     jamais arrive ;
//   - ce chemin exigeait un compte Instagram RELIE A UNE PAGE FACEBOOK,
//     l'obstacle sur lequel les clubs (et Julien) butaient.
// La connexion Instagram directe donne acces a la messagerie, donc aux
// mentions en story, avec un simple compte professionnel.
//
// Cote Meta (app « Noctify », cas d'usage « Gerer les messages et le contenu
// sur Instagram », configuration avec connexion Instagram) :
//   - URL de redirection : INSTAGRAM_REDIRECT_URI (.../api/instagram?action=callback)
//   - webhook : .../api/instagram?action=webhook, champ `messages`
//   - variables Vercel : INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET (ceux de
//     l'app INSTAGRAM, pas de l'app Facebook), INSTAGRAM_REDIRECT_URI,
//     INSTAGRAM_STATE_SECRET, INSTAGRAM_WEBHOOK_VERIFY_TOKEN.
//   - Tant que Meta n'a pas valide la permission de messagerie (App Review),
//     seuls les comptes ajoutes comme testeurs Instagram fonctionnent.

const VERSION_API = "v23.0";
const GRAPH = `https://graph.instagram.com/${VERSION_API}`;

// Le strict necessaire : moins de permissions, c'est une revue Meta plus
// courte. followers_count est lisible avec instagram_business_basic.
const SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"].join(",");

function config() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new MissingConfigError();
  }
  return { appId, appSecret, redirectUri };
}

export class MissingConfigError extends Error {
  constructor() {
    super("Connexion Instagram non configuree sur ce serveur (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / INSTAGRAM_REDIRECT_URI).");
    this.name = "MissingConfigError";
  }
}

export class InstagramApiError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "InstagramApiError";
    this.details = details;
  }
}

/**
 * URL vers laquelle rediriger le gerant pour demarrer la connexion.
 * @param {string} state - produit par lib/instagram/state.js, jamais fourni par le client
 */
export function urlAutorisation(state) {
  const { appId, redirectUri } = config();
  const params = new URLSearchParams({
    enable_fb_login: "0",
    force_reauth: "true",
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

async function lireReponse(reponse, messageDefaut) {
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok || corps?.error || corps?.error_message) {
    const message = corps?.error?.message || corps?.error_message || `${messageDefaut} (${reponse.status}).`;
    throw new InstagramApiError(message, corps);
  }
  return corps;
}

async function appelGraph(chemin, params, fetchImpl = fetch, options = {}) {
  const url = `${GRAPH}${chemin}?${new URLSearchParams(params).toString()}`;
  return lireReponse(await fetchImpl(url, options), "Appel a l'API Instagram en echec");
}

/**
 * Echange le `code` du callback contre un jeton courte duree.
 * Instagram colle parfois « #_ » a la fin du code dans l'URL : on le retire.
 * @returns {Promise<string>}
 */
export async function echangerCode(code, fetchImpl = fetch) {
  const { appId, appSecret, redirectUri } = config();
  const corps = await lireReponse(
    await fetchImpl("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: String(code || "").replace(/#_$/, ""),
      }).toString(),
    }),
    "Echange du code Instagram refuse",
  );
  // Selon les versions, la reponse est a plat ou dans data[0].
  const ligne = Array.isArray(corps?.data) ? corps.data[0] : corps;
  if (!ligne?.access_token) throw new InstagramApiError("Aucun jeton dans la reponse d'Instagram.", corps);
  return ligne.access_token;
}

/** Convertit le jeton courte duree en jeton longue duree (60 jours). */
export async function prolongerJeton(jetonCourt, fetchImpl = fetch) {
  const { appSecret } = config();
  const params = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: jetonCourt });
  const corps = await lireReponse(await fetchImpl(`https://graph.instagram.com/access_token?${params.toString()}`), "Prolongation du jeton refusee");
  return { accessToken: corps.access_token, dureeSecondes: corps.expires_in };
}

/**
 * Renouvelle un jeton longue duree pour 60 jours de plus. Possible a partir
 * de 24 h d'age ; sans ca, la connexion d'un club tombe au bout de deux mois
 * sans que personne ne le voie (appele par le cron quotidien).
 */
export async function rafraichirJeton(jeton, fetchImpl = fetch) {
  const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: jeton });
  const corps = await lireReponse(await fetchImpl(`https://graph.instagram.com/refresh_access_token?${params.toString()}`), "Renouvellement du jeton refuse");
  return { accessToken: corps.access_token, dureeSecondes: corps.expires_in };
}

/**
 * Le compte Instagram professionnel qui vient de se connecter.
 * `user_id` est l'identifiant que Meta met dans les webhooks (entry.id) :
 * c'est lui qui relie une mention recue a l'etablissement.
 * @returns {Promise<{igUserId: string, igUsername: string} | null>}
 */
export async function trouverCompteInstagram(jeton, fetchImpl = fetch) {
  const corps = await appelGraph("/me", { fields: "user_id,username", access_token: jeton }, fetchImpl);
  if (!corps?.user_id) return null;
  return { igUserId: String(corps.user_id), igUsername: corps.username || "" };
}

/**
 * Abonne le compte aux webhooks de messagerie : c'est par la qu'arrivent les
 * mentions en story. Non fatal pour la connexion (voir l'appelant).
 */
export async function inscrireWebhook(jeton, fetchImpl = fetch) {
  await appelGraph("/me/subscribed_apps", { subscribed_fields: "messages", access_token: jeton }, fetchImpl, { method: "POST" });
  return true;
}

/** Nombre d'abonnes actuel du compte connecte (historique quotidien). */
export async function recupererAbonnes(jeton, fetchImpl = fetch) {
  const corps = await appelGraph("/me", { fields: "followers_count", access_token: jeton }, fetchImpl);
  return typeof corps.followers_count === "number" ? corps.followers_count : null;
}

/**
 * Le pseudo de la personne qui a mentionne le club en story.
 *
 * Le webhook ne porte qu'un identifiant opaque (IGSID). Sans ce pseudo, la
 * mention est impossible a rattacher a un clubbeur : users.handle est la
 * seule passerelle. Renvoie null plutot que de lever : une mention qu'on ne
 * sait pas attribuer ne doit pas faire echouer le lot.
 */
export async function lirePseudoExpediteur(igsid, jeton, fetchImpl = fetch) {
  try {
    const corps = await appelGraph(`/${encodeURIComponent(igsid)}`, { fields: "username", access_token: jeton }, fetchImpl);
    return typeof corps.username === "string" && corps.username ? corps.username : null;
  } catch {
    return null;
  }
}

/**
 * Le media existe-t-il encore ? Garde pour la verification differee des
 * anciens credits (instagram_mention_credits, avant le 14/09/2026).
 * @returns {Promise<"present"|"absent"|"indetermine">}
 */
export async function verifierMediaExiste(mediaId, jeton, fetchImpl = fetch) {
  try {
    await appelGraph(`/${encodeURIComponent(mediaId)}`, { fields: "id", access_token: jeton }, fetchImpl);
    return "present";
  } catch (error) {
    const code = error?.details?.error?.code;
    const message = String(error?.message || "");
    const absent = code === 100 || /does not exist|Unsupported get request|cannot be loaded/i.test(message);
    return absent ? "absent" : "indetermine";
  }
}
