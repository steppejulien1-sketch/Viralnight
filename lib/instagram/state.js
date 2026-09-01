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
 *
 * `retour` dit sur QUELLE page ramener le gerant a la fin. Le besoin est
 * ne d'un vrai defaut : la connexion lancee depuis l'appli club
 * (club-app.html) renvoyait sur /app.html, l'ancien tableau de bord web.
 * On partait sur Facebook et on revenait ailleurs -- l'appli club, elle,
 * continuait d'afficher "non connecte".
 *
 * ⚠️ C'EST UNE CLE COURTE, JAMAIS UNE URL. Une URL de retour transmise
 * par le client et suivie par le serveur, c'est une redirection ouverte :
 * n'importe qui pourrait fabriquer un lien Noctify qui depose la victime
 * sur son propre site apres un passage credible par Facebook. Ici le
 * state ne peut porter qu'une cle ("club", "dashboard"), et la cle est
 * traduite en chemin interne par une table figee cote serveur.
 *
 * @param {string} establishmentId
 * @param {string} [retour] cle de page de retour ; ignoree si inconnue
 * @returns {string}
 */
export function signerState(establishmentId, retour) {
  const payload = {
    e: establishmentId,
    n: base64url(randomBytes(9)), // nonce : deux connexions lancees a la meme milliseconde restent distinctes
    t: Date.now(),
  };
  // Absente du payload quand elle n'est pas fournie : les states deja en
  // circulation restent lisibles, et le callback retombe sur son defaut.
  if (typeof retour === "string" && retour) payload.r = retour;
  const payloadBase64 = base64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadBase64}.${signer(payloadBase64)}`;
}

/**
 * Verifie un `state` recu au callback.
 * @param {string} state
 * @returns {{establishmentId: string, retour: string | null} | {error: string}}
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

  // `retour` ressort tel qu'il a ete signe. C'est a l'appelant de le
  // traduire en chemin : ici on ne fait que constater qu'il n'a pas ete
  // modifie en route.
  return {
    establishmentId: payload.e,
    retour: typeof payload.r === "string" ? payload.r : null,
  };
}
