// Retour de Facebook apres l'ecran d'autorisation.
//
// Contrairement aux autres routes API du projet, il n'y a pas de session ici
// (Facebook redirige un navigateur "nu", sans le jeton Supabase du gerant) :
// c'est le `state` signe (voir lib/instagram/state.js) qui tient lieu
// d'authentification et retrouve l'establishment_id. Le rejeter, c'est
// rejeter toute la requete — jamais de repli sur un establishment_id lu
// ailleurs dans la requete.

import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";
import { verifierState } from "../lib/instagram/state.js";
import {
  echangerCode,
  prolongerJeton,
  trouverCompteInstagram,
  inscrireWebhookMentions,
  MissingConfigError,
  InstagramApiError,
} from "../lib/instagram/oauth.js";

const RETOUR = "/app.html#instagram";

function rediriger(response, statut) {
  response.statusCode = 302;
  response.setHeader("Location", `${RETOUR}?instagram=${statut}`);
  response.end();
}

export default async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const erreurFacebook = url.searchParams.get("error");

  if (erreurFacebook) {
    // Le gerant a refuse l'autorisation, ou Facebook a bloque l'app : ce
    // n'est pas une panne, juste un retour negatif attendu.
    return rediriger(response, "refuse");
  }

  const verifie = verifierState(state);
  if (verifie.error) {
    console.error("[instagram-callback] state invalide:", verifie.error);
    return rediriger(response, "session_expiree");
  }
  if (!code) return rediriger(response, "erreur");

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[instagram-callback] Supabase admin indisponible", error);
    return rediriger(response, "erreur");
  }

  try {
    const jetonCourt = await echangerCode(code);
    const { accessToken: jetonLong, dureeSecondes } = await prolongerJeton(jetonCourt);

    const compte = await trouverCompteInstagram(jetonLong);
    if (!compte) {
      // Cas le plus probable en pratique : le compte Instagram n'est pas en
      // mode Business/Creator, ou n'est relie a aucune Page Facebook.
      return rediriger(response, "aucun_compte_pro");
    }

    let webhookInscrit = false;
    try {
      await inscrireWebhookMentions(compte.pageId, compte.pageAccessToken);
      webhookInscrit = true;
    } catch (error) {
      // Non bloquant : la connexion reste utile (statut affiche, jeton
      // stocke) meme si l'inscription au webhook echoue, par exemple parce
      // que l'app Meta n'a pas encore d'URL de webhook validee.
      console.error("[instagram-callback] inscription webhook echouee:", error.message);
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
      console.error("[instagram-callback] ecriture Supabase echouee:", erreurEcriture.message);
      return rediriger(response, "erreur");
    }

    return rediriger(response, "connecte");
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error("[instagram-callback]", error.message);
      return rediriger(response, "erreur");
    }
    if (error instanceof InstagramApiError) {
      console.error("[instagram-callback] Graph API:", error.message, JSON.stringify(error.details).slice(0, 300));
      return rediriger(response, "erreur");
    }
    console.error("[instagram-callback] erreur inattendue:", error);
    return rediriger(response, "erreur");
  }
}
