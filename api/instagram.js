// Toutes les routes Instagram fusionnees en une seule fonction serverless.
//
// POURQUOI une fusion : le plan Vercel Hobby limite un deploiement a 12
// fonctions serverless. Les 5 routes Instagram (connect/callback/disconnect/
// status/webhook), ajoutees separement, ont fait passer le projet a 17 et
// bloque tous les deploiements depuis (build reussi, echec silencieux a
// "Deploying outputs"). Elles vivent maintenant ici, choisies via
// ?action=connect|callback|disconnect|status|webhook plutot qu'un fichier
// chacune — meme logique metier, juste un point d'entree commun.
//
// Le callback OAuth (action=callback) et le webhook (action=webhook) sont
// appeles par Meta, pas par le navigateur : leurs URLs (INSTAGRAM_REDIRECT_URI
// cote Meta App, callback URL webhook) doivent pointer vers
// /api/instagram?action=callback et /api/instagram?action=webhook. Comme
// l'app Meta n'est pas encore configuree en production, ce renommage ne casse
// rien de deja en place — voir CLAUDE.md.

import { requireEstablishment } from "../lib/auth/requireEstablishment.js";
import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";
import { signerState, verifierState } from "../lib/instagram/state.js";
import {
  urlAutorisation,
  echangerCode,
  prolongerJeton,
  trouverCompteInstagram,
  inscrireWebhookMentions,
  MissingConfigError,
  InstagramApiError,
} from "../lib/instagram/oauth.js";
import { verifierChallengeWebhook, extraireMentions } from "../lib/instagram/webhook.js";

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

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

// ---------------- action=connect (GET, authentifie) ----------------

async function actionConnect(request, response) {
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
    console.error("[instagram:connect]", error);
    return json(response, { error: "Impossible de demarrer la connexion Instagram." }, 500);
  }
}

// ---------------- action=callback (GET, appele par Meta, sans session) ----------------

const RETOUR_CALLBACK = "/app.html#instagram";

function redirigerCallback(response, statut) {
  response.statusCode = 302;
  response.setHeader("Location", `${RETOUR_CALLBACK}?instagram=${statut}`);
  response.end();
}

async function actionCallback(request, response) {
  const url = new URL(request.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const erreurFacebook = url.searchParams.get("error");

  if (erreurFacebook) {
    // Le gerant a refuse l'autorisation, ou Facebook a bloque l'app : ce
    // n'est pas une panne, juste un retour negatif attendu.
    return redirigerCallback(response, "refuse");
  }

  const verifie = verifierState(state);
  if (verifie.error) {
    console.error("[instagram:callback] state invalide:", verifie.error);
    return redirigerCallback(response, "session_expiree");
  }
  if (!code) return redirigerCallback(response, "erreur");

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[instagram:callback] Supabase admin indisponible", error);
    return redirigerCallback(response, "erreur");
  }

  try {
    const jetonCourt = await echangerCode(code);
    const { accessToken: jetonLong, dureeSecondes } = await prolongerJeton(jetonCourt);

    const compte = await trouverCompteInstagram(jetonLong);
    if (!compte) {
      // Cas le plus probable en pratique : le compte Instagram n'est pas en
      // mode Business/Creator, ou n'est relie a aucune Page Facebook.
      return redirigerCallback(response, "aucun_compte_pro");
    }

    let webhookInscrit = false;
    try {
      await inscrireWebhookMentions(compte.pageId, compte.pageAccessToken);
      webhookInscrit = true;
    } catch (error) {
      // Non bloquant : la connexion reste utile (statut affiche, jeton
      // stocke) meme si l'inscription au webhook echoue, par exemple parce
      // que l'app Meta n'a pas encore d'URL de webhook validee.
      console.error("[instagram:callback] inscription webhook echouee:", error.message);
    }

    const { error: erreurEcriture } = await supabase
      .from("establishment_instagram_accounts")
      .upsert(
        {
          establishment_id: verifie.establishmentId,
          page_id: compte.pageId,
          page_access_token: compte.pageAccessToken,
          ig_user_id: compte.igUserId,
          ig_username: compte.igUsername,
          user_access_token: jetonLong,
          token_expires_at: new Date(Date.now() + dureeSecondes * 1000).toISOString(),
          webhook_subscribed: webhookInscrit,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "establishment_id" },
      );

    if (erreurEcriture) {
      console.error("[instagram:callback] ecriture Supabase echouee:", erreurEcriture.message);
      return redirigerCallback(response, "erreur");
    }

    return redirigerCallback(response, "connecte");
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error("[instagram:callback]", error.message);
      return redirigerCallback(response, "erreur");
    }
    if (error instanceof InstagramApiError) {
      console.error("[instagram:callback] Graph API:", error.message, JSON.stringify(error.details).slice(0, 300));
      return redirigerCallback(response, "erreur");
    }
    console.error("[instagram:callback] erreur inattendue:", error);
    return redirigerCallback(response, "erreur");
  }
}

// ---------------- action=disconnect (POST, authentifie) ----------------

async function actionDisconnect(request, response) {
  if (request.method !== "POST") return json(response, { error: "Methode non supportee." }, 405);

  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  const { error } = await auth.supabase
    .from("establishment_instagram_accounts")
    .delete()
    .eq("establishment_id", auth.establishmentId);

  if (error) {
    console.error("[instagram:disconnect]", error.message);
    return json(response, { error: "Deconnexion impossible." }, 500);
  }

  return json(response, { connecte: false });
}

// ---------------- action=status (GET, authentifie) ----------------

async function actionStatus(request, response) {
  if (request.method !== "GET") return json(response, { error: "Methode non supportee." }, 405);

  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  const { data: compte, error: erreurCompte } = await auth.supabase
    .from("establishment_instagram_accounts")
    .select("ig_username, webhook_subscribed, connected_at, token_expires_at")
    .eq("establishment_id", auth.establishmentId)
    .maybeSingle();

  if (erreurCompte) {
    console.error("[instagram:status]", erreurCompte.message);
    return json(response, { error: "Lecture du statut Instagram impossible." }, 500);
  }

  if (!compte) return json(response, { connecte: false });

  const { count, error: erreurCompteur } = await auth.supabase
    .from("instagram_mentions")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", auth.establishmentId);

  if (erreurCompteur) console.error("[instagram:status] comptage mentions:", erreurCompteur.message);

  return json(response, {
    connecte: true,
    username: compte.ig_username,
    webhookActif: compte.webhook_subscribed,
    connecteDepuis: compte.connected_at,
    jetonExpireLe: compte.token_expires_at,
    mentions: count ?? 0,
  });
}

// ---------------- action=webhook (GET verif / POST reception, public) ----------------

async function actionWebhook(request, response) {
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
    console.error("[instagram:webhook] payload illisible:", error.message);
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
    console.error("[instagram:webhook] enregistrement echoue:", error.message);
  }

  return texte(response, "EVENT_RECEIVED");
}

// ---------------- dispatch ----------------

const ACTIONS = {
  connect: actionConnect,
  callback: actionCallback,
  disconnect: actionDisconnect,
  status: actionStatus,
  webhook: actionWebhook,
};

export default async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const action = url.searchParams.get("action");
  const fn = ACTIONS[action];

  if (!fn) return json(response, { error: "Parametre action invalide ou manquant." }, 400);

  return fn(request, response);
}
