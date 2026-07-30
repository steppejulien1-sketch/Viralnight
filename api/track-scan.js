import { json, preparePublicRequest } from "../lib/tracking/publicEndpoint.js";

/**
 * Enregistre le passage d'un client, declenche par le scan du QR code a l'entree.
 *
 * C'est le point de depart de toute la collecte : sans ce scan, aucune soiree n'existe
 * et aucune publication ne peut etre rattachee. Le trigger SQL resout automatiquement
 * la soiree correspondante a partir de l'heure et des horaires d'ouverture du club.
 */
export default async function handler(request, response) {
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
    console.error("[api/track-scan]", error);
    return json(response, { error: "Enregistrement impossible pour le moment." }, 500);
  }
}
