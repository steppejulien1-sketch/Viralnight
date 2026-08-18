// Signature du parametre `state` de l'OAuth Instagram/Facebook.
//
// POURQUOI. Le callback OAuth (api/instagram.js, action=callback) est un simple GET
// sans session : Facebook y redirige le navigateur avec juste un `code` et le
// `state` qu'on lui a fourni au depart. Il faut pourtant y retrouver quel
// establishment a lance la connexion, SANS jamais faire confiance a une
// valeur venue de la requete (meme regle que requireEstablishment.js pour les
// routes API classiques). La solution : encoder l'establishment_id dans le
// state, signe avec un secret serveur, et le refuser si la signature ou
// l'age ne collent pas. Un attaquant qui forge un state avec un autre
// establishment_id ne peut pas produire la signature correspondante.

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const DUREE_VALIDITE_MS = 10 * 60 * 1000; // 10 minutes : le temps de l'aller-retour OAuth

function base64url(buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function depuisBase64url(valeur) {
  const normalise = valeur.replaceAll("-", "+").replaceAll("_", "/");
  const complet = normalise + "=".repeat((4 - (normalise.length % 4)) % 4);
  return Buffer.from(complet, "base64");
}

function secret() {
  const cle = process.env.INSTAGRAM_STATE_SECRET;
  if (!cle) throw new Error("INSTAGRAM_STATE_SECRET absent : configuration serveur incomplete.");
  return cle;
}

function signer(payloadBase64) {
  return base64url(createHmac("sha256", secret()).update(payloadBase64).digest());
}

/**
 * Construit le `state` signe a transmettre a Facebook.
 * @param {string} establishmentId
 * @returns {string}
 */
export function signerState(establishmentId) {
  const payload = {
    e: establishmentId,
    n: base64url(randomBytes(9)), // nonce : deux connexions lancees a la meme milliseconde restent distinctes
    t: Date.now(),
  };
  const payloadBase64 = base64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadBase64}.${signer(payloadBase64)}`;
}

/**
 * Verifie un `state` recu au callback.
 * @param {string} state
 * @returns {{establishmentId: string} | {error: string}}
 */
export function verifierState(state) {
  if (typeof state !== "string" || !state.includes(".")) return { error: "state absent ou malforme." };

  const [payloadBase64, signature] = state.split(".");
  const attendue = signer(payloadBase64);

  const bufA = Buffer.from(signature || "");
  const bufB = Buffer.from(attendue);
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return { error: "signature invalide : state refuse." };
  }

  let payload;
  try {
    payload = JSON.parse(depuisBase64url(payloadBase64).toString("utf8"));
  } catch {
    return { error: "state illisible." };
  }

  if (!payload?.e || typeof payload.t !== "number") return { error: "state incomplet." };
  if (Date.now() - payload.t > DUREE_VALIDITE_MS) return { error: "state expire, relance la connexion." };

  return { establishmentId: payload.e };
}
