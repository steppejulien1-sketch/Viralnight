// Reception du webhook Meta pour les mentions en story.
//
// Deux usages distincts, tous deux appeles par api/instagram-webhook.js :
//   - Meta verifie l'URL du webhook une seule fois (GET), avec un challenge
//     a renvoyer tel quel si le jeton de verification correspond.
//   - Ensuite, chaque mention arrive en POST. Le payload peut contenir
//     plusieurs entrees (une par compte Instagram) et plusieurs changements
//     par entree : on les met tous a plat.

/**
 * Repond a la verification d'URL de webhook (handshake `hub.challenge`).
 * @returns {string | null} le challenge a renvoyer tel quel, ou null si le jeton ne correspond pas
 */
export function verifierChallengeWebhook(query, verifyTokenAttendu) {
  if (query["hub.mode"] !== "subscribe") return null;
  if (!verifyTokenAttendu || query["hub.verify_token"] !== verifyTokenAttendu) return null;
  return query["hub.challenge"] ?? null;
}

/**
 * Extrait les evenements de mention d'un payload de webhook Meta.
 *
 * Ne fait AUCUNE hypothese de confiance sur le contenu : `igUserId` sert
 * ensuite a retrouver l'establishment proprietaire cote base (jamais
 * l'inverse), exactement comme requireEstablishment.js le fait pour les
 * routes authentifiees.
 *
 * @param {unknown} payload
 * @returns {Array<{igUserId: string, mediaId: string}>}
 */
export function extraireMentions(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (payload.object !== "instagram") return [];
  if (!Array.isArray(payload.entry)) return [];

  const evenements = [];

  for (const entree of payload.entry) {
    const igUserId = entree?.id;
    if (!igUserId || !Array.isArray(entree.changes)) continue;

    for (const changement of entree.changes) {
      if (changement?.field !== "mentions") continue;
      const mediaId = changement.value?.media_id;
      if (typeof mediaId === "string" && mediaId) {
        evenements.push({ igUserId: String(igUserId), mediaId });
      }
    }
  }

  return evenements;
}
