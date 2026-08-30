// Connexion Instagram du club via l'OAuth "Facebook Login for Business".
//
// POURQUOI CE CHEMIN-LA. Compter les mentions en story suppose de lire le
// webhook `mentions` de l'Instagram Graph API, qui exige un compte Instagram
// professionnel (Business ou Creator) RATTACHE A UNE PAGE FACEBOOK. Ce n'est
// pas le chemin le plus court pour un simple "se connecter" (Meta propose
// aussi une connexion Instagram directe, plus simple, mais qui ne donne pas
// acces aux mentions) : c'est le prix a payer pour la fonctionnalite demandee.
//
// Cote Meta, ca veut dire pour Julien :
//   1. Le compte Instagram du club doit etre en mode Business ou Creator.
//   2. Il doit etre relie a une Page Facebook (meme une page vide, creee pour
//      l'occasion).
//   3. Une app Meta for Developers doit exister, avec le produit "Facebook
//      Login for Business" active et ces variables renseignees sur Vercel :
//        INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI,
//        INSTAGRAM_STATE_SECRET (une chaine aleatoire, choisie par Julien),
//        INSTAGRAM_WEBHOOK_VERIFY_TOKEN (idem).
//   4. Tant que l'app Meta est en mode "developpement" (pas encore passee en
//      App Review), SEULS les comptes ajoutes comme testeurs dans le
//      dashboard Meta peuvent se connecter — largement suffisant pour les
//      premiers clubs, sans attendre la revue de Meta.

const VERSION_API = "v21.0";
const GRAPH = `https://graph.facebook.com/${VERSION_API}`;

const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_insights",
].join(",");

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
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${VERSION_API}/dialog/oauth?${params.toString()}`;
}

async function appelGraph(chemin, params, fetchImpl = fetch) {
  const url = `${GRAPH}${chemin}?${new URLSearchParams(params).toString()}`;
  const reponse = await fetchImpl(url);
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok || corps?.error) {
    throw new InstagramApiError(corps?.error?.message || `Appel Graph API en echec (${reponse.status}).`, corps);
  }
  return corps;
}

/** Echange le `code` du callback contre un jeton utilisateur courte duree. */
export async function echangerCode(code, fetchImpl = fetch) {
  const { appId, appSecret, redirectUri } = config();
  const corps = await appelGraph(
    "/oauth/access_token",
    { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
    fetchImpl,
  );
  return corps.access_token;
}

/** Convertit le jeton courte duree en jeton longue duree (~60 jours). */
export async function prolongerJeton(jetonCourt, fetchImpl = fetch) {
  const { appId, appSecret } = config();
  const corps = await appelGraph(
    "/oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: jetonCourt },
    fetchImpl,
  );
  return { accessToken: corps.access_token, dureeSecondes: corps.expires_in };
}

/**
 * Trouve, parmi les pages Facebook gerees par l'utilisateur, la premiere qui
 * a un compte Instagram professionnel rattache.
 *
 * Un gerant qui gere plusieurs pages/clubs n'est pas gere ici : on prend la
 * premiere trouvee. Suffisant pour un seul club par compte Noctify.
 *
 * @returns {Promise<{pageId: string, pageAccessToken: string, igUserId: string, igUsername: string} | null>}
 */
export async function trouverCompteInstagram(jetonUtilisateur, fetchImpl = fetch) {
  const pages = await appelGraph("/me/accounts", { access_token: jetonUtilisateur, fields: "id,name,access_token" }, fetchImpl);

  for (const page of pages.data || []) {
    const detail = await appelGraph(
      `/${page.id}`,
      { fields: "instagram_business_account{id,username}", access_token: page.access_token },
      fetchImpl,
    );
    const compte = detail.instagram_business_account;
    if (compte?.id) {
      return { pageId: page.id, pageAccessToken: page.access_token, igUserId: compte.id, igUsername: compte.username };
    }
  }

  return null;
}

/**
 * Inscrit la page au champ webhook `mentions`.
 *
 * Peut echouer si l'app Meta n'a pas encore d'URL de webhook verifiee : ce
 * n'est volontairement pas fatal pour la connexion elle-meme (voir l'appelant
 * dans api/instagram.js, action=callback), juste journalise. Le gerant reste
 * "connecte" ; les mentions ne remonteront simplement pas tant que ce n'est
 * pas resolu cote Meta.
 */
export async function inscrireWebhookMentions(pageId, pageAccessToken, fetchImpl = fetch) {
  const url = `${GRAPH}/${pageId}/subscribed_apps?subscribed_fields=mentions&access_token=${encodeURIComponent(pageAccessToken)}`;
  const reponse = await fetchImpl(url, { method: "POST" });
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok || corps?.error) {
    throw new InstagramApiError(corps?.error?.message || "Inscription au webhook mentions refusee.", corps);
  }
  return true;
}

/**
 * Nombre d'abonnes actuel du compte Instagram professionnel connecte.
 *
 * Alimente l'historique quotidien (establishment_follower_history, voir
 * api/instagram.js action=collecter-abonnes) : demande de Julien, voir
 * combien d'abonnes un club a gagne depuis qu'il utilise Noctify.
 * `instagram_manage_insights` (deja dans SCOPES ci-dessus) est le scope
 * necessaire pour lire `followers_count`.
 */
export async function recupererAbonnes(igUserId, pageAccessToken, fetchImpl = fetch) {
  const corps = await appelGraph(`/${igUserId}`, { fields: "followers_count", access_token: pageAccessToken }, fetchImpl);
  return typeof corps.followers_count === "number" ? corps.followers_count : null;
}

/**
 * Auteur et date d'une publication qui mentionne le club.
 *
 * L'evenement webhook ne porte qu'un `media_id` : il dit qu'on a ete
 * mentionne, jamais PAR QUI. Sans cet appel, une mention recue est anonyme
 * et impossible a rattacher a un clubbeur -- c'est le maillon manquant du
 * credit automatique (voir lib/points/mentionAutomatique.js).
 *
 * Renvoie null plutot que de lever si Meta refuse : une mention qu'on ne
 * sait pas attribuer ne doit pas faire echouer tout le lot. Le cas est
 * frequent et normal -- compte prive, media supprime entre l'evenement et
 * notre appel, ou permission pas encore validee par l'App Review.
 */
export async function lireAuteurMention(mediaId, pageAccessToken, fetchImpl = fetch) {
  try {
    const corps = await appelGraph(
      `/${mediaId}`,
      { fields: "username,timestamp", access_token: pageAccessToken },
      fetchImpl,
    );
    return {
      username: typeof corps.username === "string" ? corps.username : null,
      publieeA: typeof corps.timestamp === "string" ? corps.timestamp : null,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Le media existe-t-il encore ?
 *
 * Sert a la verification differee : quelqu'un peut poster, declencher la
 * mention, puis supprimer sa story trois heures plus tard. Meta n'envoie
 * AUCUN evenement dans ce cas -- un media supprime cesse simplement de
 * repondre. On le redemande donc avant de liberer les points.
 *
 * Trois etats et non un booleen, parce que la distinction decide de
 * l'argent : "absent" annule des points, "indetermine" (panne reseau,
 * quota Meta, jeton expire) ne doit surtout pas le faire. Confondre les
 * deux, c'est punir un clubbeur pour une panne qui n'est pas la sienne.
 *
 * @returns {Promise<"present"|"absent"|"indetermine">}
 */
export async function verifierMediaExiste(mediaId, pageAccessToken, fetchImpl = fetch) {
  try {
    await appelGraph(`/${mediaId}`, { fields: "id", access_token: pageAccessToken }, fetchImpl);
    return "present";
  } catch (error) {
    // Meta repond code 100 / "Object with ID ... does not exist" quand le
    // media a disparu. Tout le reste (429, 500, jeton invalide) est une
    // panne de notre cote et ne prouve rien.
    const code = error?.payload?.error?.code;
    const message = String(error?.message || "");
    const absent = code === 100 || /does not exist|Unsupported get request|cannot be loaded/i.test(message);
    return absent ? "absent" : "indetermine";
  }
}
