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
 * Enregistre une publication soumise par un client apres son passage au club.
 *
 * Le nombre de vues annonce est stocke separement (declared_views) : il n'attribue
 * aucun point tant que le staff n'a pas valide le contenu depuis l'admin. Faire
 * confiance a une valeur saisie par le client reviendrait a laisser distribuer
 * les points sans controle.
 */
export default async function handler(request, response) {
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
    console.error("[api/track-post]", error);
    return json(response, { error: "Enregistrement impossible pour le moment." }, 500);
  }
}
