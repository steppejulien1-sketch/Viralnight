// Reception du webhook Meta : les mentions en story.
//
// Deux usages, tous deux appeles par api/instagram.js (action=webhook) :
//   - Meta verifie l'URL du webhook une fois (GET), avec un challenge a
//     renvoyer tel quel si le jeton de verification correspond ;
//   - ensuite, chaque evenement arrive en POST.
//
// ⚠️ UNE MENTION EN STORY N'EST PAS UNE « MENTION ». Le champ `mentions`
// couvre les commentaires et les legendes. La story arrive dans la
// messagerie : entry[].messaging[].message.attachments[] de type
// `story_mention` (14/09/2026, voir lib/instagram/oauth.js).

import { createHmac, timingSafeEqual } from "node:crypto";

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
 * La signature Meta (en-tete X-Hub-Signature-256 : « sha256=<hex> »), HMAC du
 * corps BRUT avec la cle secrete de l'app.
 * @returns {boolean|null} null quand on ne peut pas trancher (corps ou secret absent)
 */
export function signatureValide(corpsBrut, entete, secret) {
  if (!corpsBrut || !secret || !entete) return null;
  const recu = String(entete).replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(recu)) return false;
  const attendu = createHmac("sha256", secret).update(corpsBrut).digest("hex");
  return timingSafeEqual(Buffer.from(recu.toLowerCase(), "hex"), Buffer.from(attendu, "hex"));
}

/**
 * Les mentions en story d'un payload de webhook.
 *
 * Aucune confiance dans le contenu : `igCompte` sert ensuite a retrouver
 * l'etablissement cote base (jamais l'inverse), et l'expediteur est relu par
 * l'API Instagram avec le jeton du club avant tout credit.
 *
 * @param {unknown} payload
 * @returns {Array<{mid: string, igCompte: string, expediteur: string, recuA: string|null}>}
 */
export function extraireMentionsStory(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (payload.object !== "instagram" || !Array.isArray(payload.entry)) return [];

  const mentions = [];
  for (const entree of payload.entry) {
    if (!entree?.id || !Array.isArray(entree.messaging)) continue;
    for (const evenement of entree.messaging) {
      const message = evenement?.message;
      // is_echo : un message envoye PAR le club, pas une mention recue.
      if (!message || message.is_echo || !Array.isArray(message.attachments)) continue;
      if (!message.attachments.some((a) => a?.type === "story_mention")) continue;
      const expediteur = evenement.sender?.id;
      if (!message.mid || !expediteur || String(expediteur) === String(entree.id)) continue;
      const horodatage = Number(evenement.timestamp);
      mentions.push({
        mid: String(message.mid),
        igCompte: String(evenement.recipient?.id || entree.id),
        expediteur: String(expediteur),
        // Meta envoie des millisecondes ; une valeur en secondes est convertie.
        recuA: Number.isFinite(horodatage) && horodatage > 0
          ? new Date(horodatage < 1e12 ? horodatage * 1000 : horodatage).toISOString()
          : null,
      });
    }
  }
  return mentions;
}
