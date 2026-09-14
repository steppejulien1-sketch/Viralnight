// Valider ou refuser une story / un post de l'appli : UNE facon de faire,
// que la decision vienne du bouton du pilotage ou de la validation
// automatique a 24 h (api/credit-clubbeur.js?action=auto-valider).
//
// Deux chemins qui auraient chacun leur copie finiraient par diverger : un
// jour la validation a la main previendrait le clubbeur et l'automatique non,
// ou l'inverse.
//
// Comme envoyer.js, ce fichier fait du reseau : il n'est pas teste en Node.

import { notifierStory } from "../notifications/envoyer.js";

/**
 * @param {object} p
 * @param {import("@supabase/supabase-js").SupabaseClient} p.clubbeur - cle service, base clubbeur
 * @param {import("@supabase/supabase-js").SupabaseClient} p.gerants  - cle service, base gerants
 * @param {string} p.storyId
 * @param {boolean} p.approve
 * @param {boolean} [p.auto] - decision prise par la validation automatique
 * @returns {Promise<{ ok: true, points: number, notifie: number } | { ok: false, code: string, message: string }>}
 */
export async function deciderStory({ clubbeur, gerants, storyId, approve, auto = false }) {
  const { data, error } = await clubbeur.rpc("pilotage_review_story", {
    p_story: storyId,
    p_approve: approve,
    p_points: null,
    p_auto: auto,
  });
  if (error) {
    if (/already_reviewed/.test(error.message)) return { ok: false, code: "deja", message: "Ce contenu a déjà été traité." };
    if (/unknown_story/.test(error.message)) return { ok: false, code: "introuvable", message: "Contenu introuvable." };
    return { ok: false, code: "erreur", message: error.message };
  }
  const ligne = Array.isArray(data) ? data[0] : data;
  const points = ligne?.awarded ?? 0;

  // Le meme contenu, s'il etait remonte cote gerants (Reel / TikTok avec
  // lien) : sans ca il resterait « en attente » dans le tableau de bord du club.
  if (gerants) {
    const { error: erreurGerants } = await gerants
      .from("submissions")
      .update(approve ? { status: "validated", points_awarded: points } : { status: "rejected" })
      .eq("external_story_id", storyId)
      .eq("status", "pending");
    if (erreurGerants) console.error("[deciderStory] contenu gerants non mis a jour", erreurGerants.message);
  }

  // Apres la decision, jamais avant : on n'annonce que ce qui est acquis.
  const notif = await notifierStory({ storyId, type: approve ? "story_validee" : "story_refusee", points });
  return { ok: true, points, notifie: notif?.envoyees || 0 };
}
