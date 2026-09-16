import { requireEstablishment } from "../lib/auth/requireEstablishment.js";
import { importOpeningHoursFromGoogle } from "../lib/google/openingHours.js";
import { LIEUX_AUTORISES, listerPhotos, lirePhoto } from "../lib/google/photosLieu.js";
import { lireFicheGoogle } from "../lib/google/ficheLieu.js";
import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};

  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk;
  }
  return rawBody ? JSON.parse(rawBody) : {};
}

function isGoogleUrl(value) {
  try {
    const { hostname } = new URL(value);
    const host = hostname.replace(/^www\./, "");
    return (
      host === "google.com" ||
      host.startsWith("google.") ||
      host.endsWith(".google.com") ||
      host === "maps.app.goo.gl" ||
      host === "share.google" ||
      host === "goo.gl" ||
      host === "g.co"
    );
  } catch {
    return false;
  }
}

/* GET ?action=photo&place=<id>&i=<rang>   -> l'image
   GET ?action=photos&place=<id>           -> { total, auteurs } pour l'attribution
   Les photos de la fiche Google d'un lieu (lib/google/photosLieu.js). Greffe
   ici plutot qu'une route de plus : le plan Vercel plafonne a 12 fonctions. */
async function servirPhotos(request, response) {
  const url = new URL(request.url, "http://local");
  const action = url.searchParams.get("action");
  const place = url.searchParams.get("place") || "";
  if (!LIEUX_AUTORISES.has(place)) return json(response, { error: "Lieu inconnu." }, 404);
  const cle = process.env.GOOGLE_PLACES_API_KEY;
  if (!cle) return json(response, { error: "Configuration serveur incomplete." }, 503);

  try {
    const photos = await listerPhotos(place, cle);
    if (action === "photos") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
      return response.end(JSON.stringify({
        total: photos.length,
        auteurs: [...new Set(photos.flatMap((p) => p.auteurs.map((a) => a.nom)).filter(Boolean))].slice(0, 6),
      }));
    }
    const rang = Math.max(0, Math.min(photos.length - 1, Number(url.searchParams.get("i")) || 0));
    if (!photos[rang]) return json(response, { error: "Aucune photo." }, 404);
    const image = await lirePhoto(photos[rang].nom, cle);
    response.statusCode = 200;
    response.setHeader("Content-Type", image.type);
    // Une semaine au CDN : la fiche change rarement, et chaque appel Places se paie.
    response.setHeader("Cache-Control", "public, s-maxage=604800, max-age=86400, stale-while-revalidate=86400");
    return response.end(image.octets);
  } catch (error) {
    console.error("[photos-lieu]", error.message);
    return json(response, { error: "Photo indisponible." }, 502);
  }
}

/* POST { action: "fiche", googleUrl, enregistrer }
   Le parcours de l'appli des gerants (17/09/2026) : le gerant colle le lien de
   sa fiche Google, on lui renvoie nom, adresse, type, telephone et horaires.
   Il faut une session (la cle Places se paie), mais pas encore d'etablissement :
   le club nait juste apres, avec ces infos. `enregistrer` ecrit ensuite la
   fiche sur l'etablissement DU JETON -- jamais un id lu dans la requete. */
async function actionFiche(request, response, body) {
  const googleUrl = String(body.googleUrl || "").trim();
  if (!googleUrl) return json(response, { error: "Colle le lien de ta fiche Google." }, 400);
  if (!isGoogleUrl(googleUrl)) return json(response, { error: "Ce lien n'est pas un lien Google Maps." }, 400);

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(response, { error: "Session requise." }, 401);
  let supabase;
  try { supabase = getSupabaseAdmin(); } catch { return json(response, { error: "Configuration serveur incomplete." }, 500); }
  const { data: qui, error: erreurQui } = await supabase.auth.getUser(token);
  if (erreurQui || !qui?.user) return json(response, { error: "Session invalide." }, 401);

  let fiche;
  try {
    fiche = await lireFicheGoogle(googleUrl, process.env.GOOGLE_PLACES_API_KEY);
  } catch (error) {
    console.error("[fiche-google]", error.message);
    // `detail` : le message de Google (jamais la cle), pour comprendre un refus sans acces aux logs.
    return json(response, { error: "Google ne répond pas pour le moment. Réessaie dans un instant.", detail: String(error.message || "").replace(/key=[^&\s]+/g, "key=…").slice(0, 300) }, 502);
  }
  if (!fiche || !fiche.nom) return json(response, { error: "Fiche introuvable. Vérifie que le lien ouvre bien ton établissement dans Google Maps." }, 422);

  if (body.enregistrer) {
    const auth = await requireEstablishment(request);
    if (auth.error) return json(response, { error: auth.error }, auth.status);
    const maj = { address: fiche.adresse || null, category: fiche.type };
    if (fiche.ville) maj.city = fiche.ville;
    if (fiche.lat !== null && fiche.lng !== null) { maj.lat = fiche.lat; maj.lng = fiche.lng; }
    const { error: erreurMaj } = await auth.supabase.from("establishments").update(maj).eq("id", auth.establishmentId);
    if (erreurMaj) console.warn("[fiche-google] etablissement", erreurMaj.message);

    if (fiche.horaires) {
      const lignes = fiche.horaires.map((h) => ({
        establishment_id: auth.establishmentId, weekday: h.weekday, is_open: h.isOpen,
        opens_at: h.isOpen ? h.opensAt : null, closes_at: h.isOpen ? h.closesAt : null,
      }));
      const { error: erreurHoraires } = await auth.supabase.from("establishment_opening_hours").upsert(lignes, { onConflict: "establishment_id,weekday" });
      if (erreurHoraires) console.warn("[fiche-google] horaires", erreurHoraires.message);
      const { error: erreurPlanning } = await auth.supabase.from("establishment_schedule").upsert({
        establishment_id: auth.establishmentId, google_place_id: fiche.placeId, google_place_name: fiche.nom,
        google_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "establishment_id" });
      if (erreurPlanning) console.warn("[fiche-google] planning", erreurPlanning.message);
    }
  }

  return json(response, { ok: true, fiche });
}

export default async function handler(request, response) {
  if (request.method === "GET") return servirPhotos(request, response);
  if (request.method !== "POST") {
    return json(response, { error: "Methode non supportee." }, 405);
  }

  try {
    const body = await readBody(request);
    if (body.action === "fiche") return actionFiche(request, response, body);
    const googleUrl = String(body.googleUrl || "").trim();

    if (!googleUrl) return json(response, { error: "Lien Google requis." }, 400);
    if (!isGoogleUrl(googleUrl)) {
      return json(response, { error: "Ce lien n'est pas une adresse Google Maps." }, 400);
    }

    const auth = await requireEstablishment(request);
    if (auth.error) return json(response, { error: auth.error }, auth.status);

    const { supabase, establishmentId } = auth;

    const imported = await importOpeningHoursFromGoogle(googleUrl, process.env.GOOGLE_PLACES_API_KEY);

    if (!imported?.openingHours) {
      return json(
        response,
        {
          error:
            "Horaires introuvables sur cette fiche Google. Verifiez que la fiche affiche bien des horaires, ou saisissez-les manuellement.",
          placeName: imported?.placeName || null,
          source: imported?.source || null,
        },
        422,
      );
    }

    // Enregistrement en une seule fois : horaires des 7 jours + tracabilite de l'import.
    const rows = imported.openingHours.map((hours) => ({
      establishment_id: establishmentId,
      weekday: hours.weekday,
      is_open: hours.isOpen,
      opens_at: hours.isOpen ? hours.opensAt : null,
      closes_at: hours.isOpen ? hours.closesAt : null,
    }));

    const { error: hoursError } = await supabase
      .from("establishment_opening_hours")
      .upsert(rows, { onConflict: "establishment_id,weekday" });

    if (hoursError) throw hoursError;

    const { error: scheduleError } = await supabase.from("establishment_schedule").upsert(
      {
        establishment_id: establishmentId,
        google_place_id: imported.placeId,
        google_place_name: imported.placeName,
        google_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id" },
    );

    if (scheduleError) throw scheduleError;

    // Les soirees a venir sont materialisees immediatement avec les nouveaux horaires.
    const { error: precreateError } = await supabase.rpc("precreate_upcoming_events", { p_days_ahead: 14 });
    if (precreateError) console.warn("[import-opening-hours] pre-creation impossible", precreateError.message);

    return json(response, {
      ok: true,
      source: imported.source,
      placeName: imported.placeName,
      address: imported.address,
      openingHours: imported.openingHours,
    });
  } catch (error) {
    console.error("[api/import-opening-hours]", error);
    return json(response, { error: "Erreur lors de l'import des horaires Google." }, 500);
  }
}
