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
import { getSupabaseClubbeurAdmin } from "../lib/db/supabaseClubbeurAdmin.js";
import { signerState, verifierState } from "../lib/instagram/state.js";
import {
  urlAutorisation,
  echangerCode,
  prolongerJeton,
  rafraichirJeton,
  trouverCompteInstagram,
  inscrireWebhook,
  recupererAbonnes,
  lirePseudoExpediteur,
  verifierMediaExiste,
  MissingConfigError,
  InstagramApiError,
} from "../lib/instagram/oauth.js";
import { verifierChallengeWebhook, extraireMentionsStory, signatureValide } from "../lib/instagram/webhook.js";
import { normaliserHandle } from "../lib/points/mentionAutomatique.js";
import { deciderStory } from "../lib/admin/deciderContenu.js";
import { deciderSortStory, SORTS } from "../lib/points/verificationStory.js";

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

/* Les quatre variables que la connexion exige, verifiees ENSEMBLE.
 *
 * Sans ce controle, un secret manquant remontait en "Impossible de
 * demarrer la connexion Instagram" -- un message qui ne dit rien, et sur
 * lequel Julien a perdu une soiree. La cause : signerState() lit
 * INSTAGRAM_STATE_SECRET et echoue AVANT que urlAutorisation() ne
 * verifie les trois cles Meta. Son erreur, banale, tombait dans le catch
 * generique, tandis que MissingConfigError -- la seule a etre nommee --
 * n'etait jamais atteinte. Le message masquait donc exactement
 * l'information qu'on cherchait : laquelle des quatre manque.
 *
 * On nomme les variables absentes. La route est derriere
 * requireEstablishment : seul un gerant deja authentifie voit ce
 * message, et il n'expose aucune valeur. */
const VARIABLES_INSTAGRAM = [
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_REDIRECT_URI",
  "INSTAGRAM_STATE_SECRET",
];

function variablesInstagramManquantes() {
  return VARIABLES_INSTAGRAM.filter((nom) => !process.env[nom]);
}

async function actionConnect(request, response) {
  if (request.method !== "GET") return json(response, { error: "Methode non supportee." }, 405);

  const auth = await requireEstablishment(request);
  if (auth.error) return json(response, { error: auth.error }, auth.status);

  const manquantes = variablesInstagramManquantes();
  if (manquantes.length) {
    return json(
      response,
      {
        error:
          "Connexion Instagram non configuree sur ce serveur : " +
          manquantes.join(", ") +
          (manquantes.length > 1 ? " manquent" : " manque") +
          " sur Vercel.",
      },
      500,
    );
  }

  try {
    // D'ou part la connexion, pour y ramener le gerant a la fin. Une cle
    // inconnue est ignoree par cheminRetour() : rien a valider ici, la
    // table figee cote callback fait deja ce travail.
    const retour = new URL(request.url, "http://localhost").searchParams.get("retour");
    const state = signerState(auth.establishmentId, retour);
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

/* Ou ramener le gerant a la fin de la connexion.
 *
 * ⚠️ TABLE FIGEE, ET C'EST VOLONTAIRE. Le state signe ne transporte
 * qu'une CLE ("club", "dashboard"), jamais une URL. Si le serveur suivait
 * une adresse fournie par le client, ce serait une redirection ouverte :
 * un lien Noctify pourrait deposer la victime sur le site d'un tiers
 * apres un passage credible par Facebook. Une cle inconnue retombe
 * silencieusement sur le defaut.
 *
 * "club" a ete ajoute parce que la connexion lancee depuis l'appli club
 * renvoyait quand meme sur /app.html : on partait sur Facebook et on
 * revenait sur une autre page, l'appli club continuant d'afficher
 * "non connecte". C'est ce qui donnait l'impression que rien ne marchait.
 */
const PAGES_RETOUR = {
  dashboard: "/app.html#instagram",
  club: "/club-app.html#reglages",
};
const RETOUR_DEFAUT = "dashboard";

function cheminRetour(cle) {
  return PAGES_RETOUR[cle] || PAGES_RETOUR[RETOUR_DEFAUT];
}

function redirigerCallback(response, statut, retour) {
  response.statusCode = 302;
  response.setHeader("Location", `${cheminRetour(retour)}?instagram=${statut}`);
  response.end();
}

async function actionCallback(request, response) {
  const url = new URL(request.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const erreurFacebook = url.searchParams.get("error");

  // On lit le state AVANT de traiter les erreurs : Facebook nous le
  // renvoie meme quand le gerant refuse l'autorisation. Sans ca, un refus
  // depuis l'appli club ramenait quand meme sur le tableau de bord web --
  // on se serait retrouve ailleurs pour avoir dit non.
  const verifie = verifierState(state);
  const retour = verifie.error ? null : verifie.retour;

  if (erreurFacebook) {
    // Le gerant a refuse l'autorisation, ou Facebook a bloque l'app : ce
    // n'est pas une panne, juste un retour negatif attendu.
    return redirigerCallback(response, "refuse", retour);
  }

  if (verifie.error) {
    console.error("[instagram:callback] state invalide:", verifie.error);
    return redirigerCallback(response, "session_expiree", retour);
  }
  if (!code) return redirigerCallback(response, "erreur", retour);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[instagram:callback] Supabase admin indisponible", error);
    return redirigerCallback(response, "erreur", retour);
  }

  try {
    const jetonCourt = await echangerCode(code);
    const { accessToken: jetonLong, dureeSecondes } = await prolongerJeton(jetonCourt);

    const compte = await trouverCompteInstagram(jetonLong);
    if (!compte) {
      // Le compte n'est pas un compte professionnel (Entreprise ou Createur).
      return redirigerCallback(response, "aucun_compte_pro", retour);
    }

    let webhookInscrit = false;
    try {
      await inscrireWebhook(jetonLong);
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
          // Plus de Page Facebook avec la connexion Instagram directe : les
          // deux colonnes, NOT NULL, portent l'identifiant et le jeton du
          // compte Instagram lui-meme. Le reste du code lit page_access_token.
          page_id: compte.igUserId,
          page_access_token: jetonLong,
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
      return redirigerCallback(response, "erreur", retour);
    }

    return redirigerCallback(response, "connecte", retour);
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error("[instagram:callback]", error.message);
      return redirigerCallback(response, "erreur", retour);
    }
    if (error instanceof InstagramApiError) {
      console.error("[instagram:callback] Graph API:", error.message, JSON.stringify(error.details).slice(0, 300));
      return redirigerCallback(response, "erreur", retour);
    }
    console.error("[instagram:callback] erreur inattendue:", error);
    return redirigerCallback(response, "erreur", retour);
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

  // Abonnes gagnes depuis la connexion : premier et dernier releve du cron
  // quotidien (establishment_follower_history) -- demande de Julien.
  // Absent tant que le cron n'a pas encore tourne une fois pour ce club
  // (ex: connexion faite il y a moins d'une journee).
  const { data: releves, error: erreurReleves } = await auth.supabase
    .from("establishment_follower_history")
    .select("follower_count, recorded_at")
    .eq("establishment_id", auth.establishmentId)
    .order("recorded_at", { ascending: true });

  if (erreurReleves) console.error("[instagram:status] historique abonnes:", erreurReleves.message);

  let abonnesGagnes = null;
  let abonnesActuels = null;
  if (releves && releves.length > 0) {
    abonnesActuels = releves[releves.length - 1].follower_count;
    abonnesGagnes = abonnesActuels - releves[0].follower_count;
  }

  return json(response, {
    connecte: true,
    username: compte.ig_username,
    webhookActif: compte.webhook_subscribed,
    connecteDepuis: compte.connected_at,
    jetonExpireLe: compte.token_expires_at,
    mentions: count ?? 0,
    abonnesActuels,
    abonnesGagnes,
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

  // Meta considere tout code != 2xx comme un echec et redelivre le meme
  // evenement plus tard : on repond 200 meme si le traitement interne echoue
  // partiellement. La table instagram_story_mentions (cle = mid) empeche
  // de traiter deux fois une redelivrance.
  let mentions = [];
  let signatureOk = null;
  try {
    const brut = await lireCorpsBrut(request);
    // ⚠️ SIGNATURE NOTEE, PAS ENCORE BLOQUANTE (14/09/2026). Meta signe avec
    // la cle secrete de l'app ; tant qu'on n'a pas vu un vrai evenement passer
    // avec signature_ok = true, bloquer risquerait de jeter toutes les
    // mentions. Le vrai garde-fou en attendant : l'expediteur est RELU par
    // l'API Instagram avec le jeton du club -- un evenement fabrique, avec un
    // identifiant invente, ne donne aucun pseudo et donc aucun point.
    signatureOk = signatureValide(brut, request.headers["x-hub-signature-256"], process.env.INSTAGRAM_APP_SECRET);
    mentions = extraireMentionsStory(brut ? JSON.parse(brut) : null);
  } catch (error) {
    console.error("[instagram:webhook] payload illisible:", error.message);
    return texte(response, "EVENT_RECEIVED");
  }

  if (!mentions.length) return texte(response, "EVENT_RECEIVED");

  try {
    await traiterMentionsStory(mentions, signatureOk);
  } catch (error) {
    console.error("[instagram:webhook] traitement echoue:", error.message);
  }

  return texte(response, "EVENT_RECEIVED");
}

/* Le corps BRUT, pour verifier la signature : un JSON re-serialise ne
   donnerait pas le meme HMAC. On lit le flux avant tout acces a
   request.body, que Vercel analyse a la demande. */
async function lireCorpsBrut(request) {
  let brut = "";
  try {
    for await (const morceau of request) brut += morceau;
  } catch {
    // flux deja consomme (serveur de dev) : repli ci-dessous
  }
  if (brut) return brut;
  if (typeof request.body === "string") return request.body;
  if (request.body && typeof request.body === "object") return JSON.stringify(request.body);
  return "";
}

/* Une mention en story -> la story du clubbeur validee (14/09/2026).
 *
 * Il faut rejoindre cinq faits, qui vivent a cinq endroits : le compte
 * Instagram mentionne (webhook), l'etablissement (base gerants), le club
 * de l'appli (base clubbeur, par le code public), le pseudo de l'auteur
 * (API Instagram, absent du webhook) et son compte clubbeur (users.handle,
 * le pseudo saisi dans l'appli). Chaque mention garde son statut dans
 * instagram_story_mentions : un credit qui n'arrive pas se comprend en
 * une requete, au lieu de rester silencieux.
 *
 * Plus de credit parallele : la story est trouvee (ou creee) par
 * story_detectee_instagram, puis validee par le meme chemin que le bouton
 * du pilotage et la validation a 24 h (lib/admin/deciderContenu.js).
 * Meme prix, et « une story par soiree » tient. */
async function traiterMentionsStory(mentions, signatureOk) {
  const gerants = getSupabaseAdmin();
  let clubbeur;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
  } catch (error) {
    console.error("[instagram:story] base clubbeur indisponible:", error.message);
    return;
  }

  const idsComptes = [...new Set(mentions.map((m) => m.igCompte))];
  const { data: comptes, error: erreurComptes } = await gerants
    .from("establishment_instagram_accounts")
    .select("establishment_id, ig_user_id, page_access_token")
    .in("ig_user_id", idsComptes);
  if (erreurComptes) console.error("[instagram:story] comptes illisibles:", erreurComptes.message);
  const compteParId = new Map((comptes || []).map((c) => [c.ig_user_id, c]));

  for (const mention of mentions) {
    const noter = (champs) => clubbeur.from("instagram_story_mentions").update(champs).eq("mid", mention.mid);
    try {
      // Premier arrive, seul traite : Meta redelivre ses evenements.
      const { data: nouvelle, error: erreurTrace } = await clubbeur
        .from("instagram_story_mentions")
        .upsert(
          { mid: mention.mid, ig_compte: mention.igCompte, expediteur: mention.expediteur, signature_ok: signatureOk },
          { onConflict: "mid", ignoreDuplicates: true },
        )
        .select("mid");
      if (erreurTrace) {
        // Sans trace, on s'abstient : mieux vaut ne pas crediter qu'en double.
        console.error("[instagram:story] trace impossible, on s'abstient:", erreurTrace.message);
        continue;
      }
      if (!nouvelle?.length) continue;

      const compte = compteParId.get(mention.igCompte);
      if (!compte) {
        await noter({ statut: "compte_non_relie" });
        continue;
      }

      // Le compteur de mentions de l'appli club (action=status).
      await gerants
        .from("instagram_mentions")
        .upsert({ establishment_id: compte.establishment_id, media_id: mention.mid, field: "story_mention" }, { onConflict: "establishment_id,media_id", ignoreDuplicates: true });

      const { data: etab } = await gerants.from("establishments").select("public_code").eq("id", compte.establishment_id).maybeSingle();
      const { data: club } = etab?.public_code
        ? await clubbeur.from("clubs").select("id").eq("b2b_public_code", etab.public_code).maybeSingle()
        : { data: null };
      if (!club?.id) {
        await noter({ statut: "club_absent_de_l_appli" });
        continue;
      }

      const username = await lirePseudoExpediteur(mention.expediteur, compte.page_access_token);
      const handle = normaliserHandle(username);
      if (!handle) {
        await noter({ club_id: club.id, statut: "pseudo_illisible" });
        continue;
      }

      // ilike pour la casse ; « _ » et « % » echappes, sinon « julien_6d1f »
      // repondrait aussi pour « julienX6d1f ».
      const { data: utilisateur, error: erreurUtilisateur } = await clubbeur
        .from("users")
        .select("id")
        .ilike("handle", handle.replace(/[\\%_]/g, (c) => `\\${c}`))
        .maybeSingle();
      if (erreurUtilisateur) {
        await noter({ club_id: club.id, username, statut: "lecture_clubbeur_impossible" });
        continue;
      }
      if (!utilisateur?.id) {
        await noter({ club_id: club.id, username, statut: "aucun_clubbeur_avec_ce_pseudo" });
        continue;
      }

      const { data: detection, error: erreurDetection } = await clubbeur.rpc("story_detectee_instagram", {
        p_user: utilisateur.id,
        p_club: club.id,
        p_at: mention.recuA,
      });
      const ligne = Array.isArray(detection) ? detection[0] : detection;
      if (erreurDetection || !ligne?.story_id) {
        await noter({ club_id: club.id, username, user_id: utilisateur.id, statut: "detection_impossible" });
        continue;
      }
      if (ligne.statut !== "a_valider" && ligne.statut !== "creee") {
        await noter({ club_id: club.id, username, user_id: utilisateur.id, story_event_id: ligne.story_id, statut: ligne.statut });
        continue;
      }

      const decision = await deciderStory({ clubbeur, gerants, storyId: ligne.story_id, approve: true });
      await noter({
        club_id: club.id,
        username,
        user_id: utilisateur.id,
        story_event_id: ligne.story_id,
        statut: decision.ok ? "validee" : `validation_${decision.code}`,
      });
    } catch (error) {
      // Une mention qui echoue ne doit pas emporter les suivantes.
      console.error(`[instagram:story] ${mention.mid}:`, error.message);
    }
  }
}

// ---------------- action=collecter-abonnes (GET, appele par le cron Vercel) ----------------
//
// Un releve par jour, pour tous les clubs connectes -- alimente
// establishment_follower_history (migration 202608250002), pour repondre a
// "combien d'abonnes un club a gagne depuis qu'il est avec moi" (Julien).
// Programme dans vercel.json (crons), pas appelable par un club ni un
// clubbeur : proteges par CRON_SECRET, le mecanisme documente par Vercel
// pour authentifier ses propres appels cron (jamais une session utilisateur).

/* Deux causes tres differentes, et il faut pouvoir les distinguer :
   - le serveur n'a AUCUN secret configure -> aucun cron ne passera
     jamais, c'est une panne de configuration ;
   - le secret existe et l'appelant ne l'a pas -> c'est un refus normal.

   Les deux rendaient "Non autorise" et un 401 identique. Vu de
   l'exterieur, un cron casse depuis des semaines ressemblait exactement
   a un curl anonyme. On ne revele jamais le secret, seulement son
   ABSENCE -- ce qui est une information d'exploitation, pas un secret. */
function verifierAppelCron(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, motif: "CRON_SECRET absent de ce serveur : aucune tache planifiee ne peut s'executer." };
  if (request.headers.authorization !== `Bearer ${secret}`) return { ok: false, motif: "Non autorise." };
  return { ok: true };
}

async function actionCollecterAbonnes(request, response) {
  if (request.method !== "GET") return json(response, { error: "Methode non supportee." }, 405);
  const cron = verifierAppelCron(request);
  if (!cron.ok) return json(response, { error: cron.motif }, 401);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[instagram:collecter-abonnes] Supabase admin indisponible", error);
    return json(response, { error: "Configuration serveur incomplete." }, 500);
  }

  const { data: comptes, error: erreurLecture } = await supabase
    .from("establishment_instagram_accounts")
    .select("establishment_id, ig_user_id, page_access_token, token_expires_at");

  if (erreurLecture) {
    console.error("[instagram:collecter-abonnes] lecture comptes:", erreurLecture.message);
    return json(response, { error: "Lecture des comptes Instagram impossible." }, 500);
  }

  let releves = 0;
  let echecs = 0;

  for (const compte of comptes || []) {
    try {
      // Un jeton Instagram vit 60 jours : renouvele quand il en reste moins
      // de 15, sinon la connexion d'un club tomberait sans bruit.
      let jeton = compte.page_access_token;
      const expire = new Date(compte.token_expires_at).getTime();
      if (!Number.isFinite(expire) || expire - Date.now() < 15 * 86400000) {
        try {
          const neuf = await rafraichirJeton(jeton);
          jeton = neuf.accessToken;
          await supabase
            .from("establishment_instagram_accounts")
            .update({
              page_access_token: jeton,
              user_access_token: jeton,
              token_expires_at: new Date(Date.now() + (neuf.dureeSecondes || 5184000) * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("establishment_id", compte.establishment_id);
        } catch (error) {
          console.error("[instagram:collecter-abonnes] renouvellement du jeton:", compte.establishment_id, error.message);
        }
      }

      const abonnes = await recupererAbonnes(jeton);
      if (abonnes === null) { echecs++; continue; }

      // upsert (pas insert) : le cron peut se redeclencher le meme jour
      // (retry Vercel, execution manuelle) sans dupliquer -- l'index unique
      // (establishment_id, recorded_date) sert exactement a ca.
      const { error: erreurEcriture } = await supabase
        .from("establishment_follower_history")
        .upsert(
          { establishment_id: compte.establishment_id, follower_count: abonnes },
          { onConflict: "establishment_id,recorded_date" },
        );

      if (erreurEcriture) {
        console.error("[instagram:collecter-abonnes] ecriture:", compte.establishment_id, erreurEcriture.message);
        echecs++;
      } else {
        releves++;
      }
    } catch (error) {
      // Un jeton expire ou une API Meta indisponible pour UN club ne doit
      // jamais interrompre le releve des autres.
      console.error("[instagram:collecter-abonnes] Graph API:", compte.establishment_id, error.message);
      echecs++;
    }
  }

  return json(response, { releves, echecs, total: (comptes || []).length });
}

// ---------------- dispatch ----------------

/* ---------------- action=verifier-stories (GET, cron quotidien) ----------------
 *
 * Une story vit 24 h. Quelqu'un peut poster, declencher la mention, se faire
 * crediter, puis supprimer trois heures plus tard : le club a paye une
 * visibilite qui n'a pas eu lieu, et Meta n'envoie rien pour le signaler.
 *
 * On va donc verifier, juste avant que les points deviennent depensables --
 * ce moment existe deja (unlocks_at, pose par crediter_mention_instagram
 * d'apres clubs.points_lock_hours, mis a 20 h). Un media supprime cesse de
 * repondre : c'est le seul signal disponible, et il suffit.
 *
 * La decision vit dans lib/points/verificationStory.js, testee en Node ; ici
 * on ne fait que la rassembler et l'appliquer.
 */
async function actionVerifierStories(request, response) {
  if (request.method !== "GET") return json(response, { error: "Methode non supportee." }, 405);
  const cron = verifierAppelCron(request);
  if (!cron.ok) return json(response, { error: cron.motif }, 401);

  let clubbeur, gerants;
  try {
    clubbeur = getSupabaseClubbeurAdmin();
    gerants = getSupabaseAdmin();
  } catch (error) {
    return json(response, { error: "Configuration serveur incomplete." }, 500);
  }

  // Seuls les credits encore en attente : un grant deja libere n'est plus
  // repris (le clubbeur a pu depenser les points), et un credit deja annule
  // n'a plus rien a verifier.
  const { data: credits, error: erreurLecture } = await clubbeur
    .from("instagram_mention_credits")
    .select("club_id, media_id, point_grant_id, clubs(establishment_id), point_grants(unlocks_at, released)")
    .is("annule_le", null)
    .not("point_grant_id", "is", null)
    .limit(200);

  if (erreurLecture) return json(response, { error: erreurLecture.message }, 500);

  let verifiees = 0, annulees = 0, gardees = 0, attendues = 0;

  for (const credit of credits || []) {
    const grant = credit.point_grants;
    if (!grant || grant.released) continue;

    // Premier filtre, sans reseau : inutile d'appeler Meta pour une story
    // qui a encore des heures devant elle.
    const preDecision = deciderSortStory({ etatMedia: "present", unlocksAt: grant.unlocks_at });
    if (preDecision.sort === SORTS.ATTENDRE) { attendues++; continue; }

    const etablissementId = credit.clubs?.establishment_id;
    if (!etablissementId) { gardees++; continue; }

    const { data: compte } = await gerants
      .from("establishment_instagram_accounts")
      .select("page_access_token")
      .eq("establishment_id", etablissementId)
      .maybeSingle();

    const jeton = compte?.page_access_token;
    // Sans jeton, on ne peut RIEN prouver : garder, jamais annuler.
    const etatMedia = jeton ? await verifierMediaExiste(credit.media_id, jeton) : "indetermine";
    verifiees++;

    const decision = deciderSortStory({ etatMedia, unlocksAt: grant.unlocks_at });
    if (decision.sort !== SORTS.ANNULER) {
      gardees++;
      continue;
    }

    const { error } = await clubbeur.rpc("annuler_mention_instagram", {
      p_club: credit.club_id,
      p_media: credit.media_id,
    });
    if (error) {
      console.error(`[instagram:verif] ${credit.media_id} annulation echouee:`, error.message);
      continue;
    }
    annulees++;
    console.log(`[instagram:verif] ${credit.media_id} annule: ${decision.raison}`);
  }

  return json(response, { verifiees, annulees, gardees, attendues });
}

const ACTIONS = {
  connect: actionConnect,
  callback: actionCallback,
  disconnect: actionDisconnect,
  status: actionStatus,
  webhook: actionWebhook,
  "collecter-abonnes": actionCollecterAbonnes,
  "verifier-stories": actionVerifierStories,
};

export default async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const action = url.searchParams.get("action");
  const fn = ACTIONS[action];

  if (!fn) return json(response, { error: "Parametre action invalide ou manquant." }, 400);

  return fn(request, response);
}
