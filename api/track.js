// Les deux routes de collecte QR (scan a l'entree, publication apres coup)
// fusionnees en une seule fonction serverless, choisies via ?type=scan|post.
//
// POURQUOI : le plan Vercel Hobby limite un deploiement a 12 fonctions
// serverless. Fusionnee avec les 5 routes Instagram (voir api/instagram.js)
// pour repasser sous la limite apres l'avoir depassee a 17.

import { json, preparePublicRequest } from "../lib/tracking/publicEndpoint.js";

const PLATFORM_HOSTS = {
  "instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
};

const CONTENT_TYPES = ["story", "reel", "post", "video"];

/**
 * Reconnait la plateforme depuis l'URL, et refuse tout ce qui n'est pas un reseau
 * supporte : sans ce filtre, n'importe quel lien pourrait etre soumis pour des points.
 *
 * @returns {{platform: string, url: string} | null}
 */
export function parseSocialUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  const host = parsed.hostname.replace(/^(www\.|m\.|vm\.|vt\.)/, "").toLowerCase();
  const platform = PLATFORM_HOSTS[host];
  if (!platform) return null;

  // Les parametres de suivi n'apportent rien et empechent la detection des doublons.
  parsed.search = "";
  parsed.hash = "";

  return { platform, url: parsed.toString() };
}

/**
 * Enregistre le passage d'un client, declenche par le scan du QR code a l'entree.
 *
 * C'est le point de depart de toute la collecte : sans ce scan, aucune soiree n'existe
 * et aucune publication ne peut etre rattachee. Le trigger SQL resout automatiquement
 * la soiree correspondante a partir de l'heure et des horaires d'ouverture du club.
 */
async function typeScan(request, response) {
  const prepared = await preparePublicRequest(request);
  if (prepared.error) return json(response, { error: prepared.error }, prepared.status);

  const { supabase, establishment, body } = prepared;

  try {
    const { data, error } = await supabase
      .from("qr_scans")
      .insert({
        establishment_id: establishment.id,
        customer_id: body.customerId,
        scanned_at: new Date().toISOString(),
      })
      .select("id, event_id")
      .single();

    if (error) {
      // 23505 = violation d'unicite : le client a deja scanne cette nuit.
      // Ce n'est pas une erreur pour lui, on repond normalement.
      if (error.code === "23505") {
        return json(response, {
          ok: true,
          alreadyScanned: true,
          establishment: establishment.name,
          message: "Vous etes deja enregistre pour ce soir.",
        });
      }
      throw error;
    }

    // Aucune soiree resolue : le club est ferme a cette heure-ci d'apres ses horaires.
    // On le dit clairement plutot que de laisser croire que le scan a compte.
    if (!data.event_id) {
      return json(
        response,
        {
          ok: false,
          outsideOpeningHours: true,
          establishment: establishment.name,
          error: "Aucune soiree en cours actuellement pour cet etablissement.",
        },
        409,
      );
    }

    return json(response, {
      ok: true,
      alreadyScanned: false,
      establishment: establishment.name,
      eventId: data.event_id,
    });
  } catch (error) {
    console.error("[api/track?type=scan]", error);
    return json(response, { error: "Enregistrement impossible pour le moment." }, 500);
  }
}

/**
 * Enregistre une publication soumise par un client apres son passage au club.
 *
 * Le nombre de vues annonce est stocke separement (declared_views) : il n'attribue
 * aucun point tant que le staff n'a pas valide le contenu depuis l'admin. Faire
 * confiance a une valeur saisie par le client reviendrait a laisser distribuer
 * les points sans controle.
 */
async function typePost(request, response) {
  // Le lien est valide avant toute requete en base : un lien non reconnu ne doit pas
  // declencher de resolution d'etablissement.
  const prepared = await preparePublicRequest(request, {
    validate: (body) =>
      parseSocialUrl(body.url || "")
        ? null
        : { error: "Lien non reconnu. Collez un lien Instagram, TikTok ou YouTube.", status: 400 },
  });

  if (prepared.error) return json(response, { error: prepared.error }, prepared.status);

  const { supabase, establishment, body } = prepared;
  const social = parseSocialUrl(body.url);
  const contentType = CONTENT_TYPES.includes(body.contentType) ? body.contentType : "post";

  const declaredViews =
    Number.isFinite(Number(body.declaredViews)) && Number(body.declaredViews) >= 0
      ? Math.min(Math.round(Number(body.declaredViews)), 100_000_000)
      : null;

  try {
    const { data, error } = await supabase
      .from("submissions")
      .insert({
        establishment_id: establishment.id,
        customer_id: body.customerId,
        platform: social.platform,
        content_type: contentType,
        url: social.url,
        declared_views: declaredViews,
        // Reference vers la story d'origine dans la base de la PWA.
        // C'est elle qui permettra, apres validation ici, de crediter le
        // clubbeur dans l'autre base. Null si le contenu n'est pas venu
        // de la PWA (saisie manuelle, autre source).
        external_story_id: typeof body.storyId === "string" && body.storyId ? body.storyId : null,
        views_count: 0,
        points_awarded: 0,
        status: "pending",
        source: "customer_qr",
        submitted_at: new Date().toISOString(),
      })
      .select("id, event_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return json(response, {
          ok: true,
          alreadySubmitted: true,
          message: "Ce lien a deja ete envoye pour cette soiree.",
        });
      }
      throw error;
    }

    if (!data.event_id) {
      return json(
        response,
        {
          ok: false,
          outsideOpeningHours: true,
          error: "Aucune soiree en cours : votre publication n'a pas pu etre rattachee.",
        },
        409,
      );
    }

    return json(response, {
      ok: true,
      alreadySubmitted: false,
      platform: social.platform,
      establishment: establishment.name,
      message: "Publication enregistree. Elle sera validee par l'equipe du club.",
    });
  } catch (error) {
    console.error("[api/track?type=post]", error);
    return json(response, { error: "Enregistrement impossible pour le moment." }, 500);
  }
}

const TYPES = { scan: typeScan, post: typePost };

export default async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const type = url.searchParams.get("type");
  const fn = TYPES[type];

  if (!fn) return json(response, { error: "Parametre type invalide ou manquant." }, 400);

  return fn(request, response);
}
