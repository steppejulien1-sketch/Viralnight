// Catalogue des recompenses actives d'un club, pour la boutique de la PWA
// clubbeur (client final, jamais connecte). Route publique en lecture seule :
// meme philosophie que scan.html/track-*.js — le code public du QR resout
// l'establishment via la fonction SQL dediee, jamais un establishment_id
// pris tel quel dans la requete.
//
// Ne renvoie que ce qu'un client doit voir : titre, seuil de points, famille,
// stock restant. Jamais l'establishment_id brut, jamais de champ interne.

import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";
import { isValidPublicCode, isRateLimited, resolveEstablishment, json } from "../lib/tracking/publicEndpoint.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, { error: "Methode non supportee." }, 405);

  if (isRateLimited(request)) {
    return json(response, { error: "Trop de requetes. Patiente un instant." }, 429);
  }

  const url = new URL(request.url, "http://localhost");
  const code = url.searchParams.get("c") || "";

  if (!isValidPublicCode(code)) {
    return json(response, { error: "Code etablissement invalide." }, 400);
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[rewards-public] Supabase admin indisponible", error);
    return json(response, { error: "Service momentanement indisponible." }, 503);
  }

  let establishment;
  try {
    establishment = await resolveEstablishment(supabase, code);
  } catch (error) {
    console.error("[rewards-public] resolution etablissement", error);
    return json(response, { error: "Service momentanement indisponible." }, 503);
  }

  if (!establishment) {
    return json(response, { error: "Ce code ne correspond a aucun etablissement." }, 404);
  }

  const { data: rewards, error: erreurRecompenses } = await supabase
    .from("rewards")
    .select("id, title, points_required, max_redemptions, category")
    .eq("establishment_id", establishment.id)
    .eq("active", true)
    .order("points_required", { ascending: true });

  if (erreurRecompenses) {
    console.error("[rewards-public] lecture recompenses", erreurRecompenses.message);
    return json(response, { error: "Lecture des recompenses impossible." }, 500);
  }

  // Le stock restant n'est stocke nulle part : il se deduit du nombre de
  // reclamations deja faites. Une seule requete groupee plutot qu'une par
  // recompense, pour ne pas multiplier les allers-retours base.
  const rewardIds = (rewards || []).map((r) => r.id);
  const redemptionCounts = new Map();

  if (rewardIds.length) {
    const { data: redemptions, error: erreurRedemptions } = await supabase
      .from("reward_redemptions")
      .select("reward_id")
      .in("reward_id", rewardIds);

    if (erreurRedemptions) {
      console.error("[rewards-public] lecture redemptions", erreurRedemptions.message);
      return json(response, { error: "Lecture des recompenses impossible." }, 500);
    }

    for (const r of redemptions || []) {
      redemptionCounts.set(r.reward_id, (redemptionCounts.get(r.reward_id) || 0) + 1);
    }
  }

  const catalogue = (rewards || []).map((r) => {
    const utilisees = redemptionCounts.get(r.id) || 0;
    const stock = r.max_redemptions === null ? null : Math.max(0, r.max_redemptions - utilisees);
    return {
      id: r.id,
      titre: r.title,
      cout: r.points_required,
      categorie: r.category,
      // null = illimite, cote client on affiche alors un grand nombre
      // arbitraire plutot que de gerer un etat "sans limite" en plus.
      stock: stock === null ? 999 : stock,
    };
  });

  return json(response, { club: establishment.name, recompenses: catalogue });
}
