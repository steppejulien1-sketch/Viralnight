// Notifications de l'appli iOS native, via APNs (29/09/2026).
//
// Le Web Push (envoyer.js + VAPID) ne touche que le navigateur et la PWA.
// L'appli installee depuis l'App Store recoit ses notifications d'Apple,
// par APNs : un jeton d'appareil, une requete HTTP/2 signee par une cle
// .p8 du compte Apple Developer.
//
// ⚠️ OU VIVENT LES JETONS. Dans la meme table que les abonnements web,
// push_subscriptions, avec `endpoint = "apns:<jeton>"` : pas de migration,
// les regles RLS (chacun ses lignes) et le nettoyage des morts s'appliquent
// telles quelles. p256dh et auth, obligatoires pour le web, valent "natif".
//
// ⚠️ SANS CLE, RIEN NE PART ET RIEN N'EST EFFACE. Tant que les variables
// ci-dessous manquent sur Vercel, les jetons iOS restent en base, intacts,
// et partiront le jour ou la cle sera posee.
//
// VARIABLES (Vercel, jamais dans git) :
//   APNS_KEY       contenu du fichier AuthKey_XXXX.p8 (les \n peuvent etre
//                  ecrits "\n" sur une seule ligne)
//   APNS_KEY_ID    les 10 caracteres de la cle
//   APNS_TEAM_ID   les 10 caracteres de l'equipe Apple Developer
//   APNS_TOPIC     l'identifiant de l'appli : com.noctify.app
//   APNS_ENV       "production" (TestFlight, App Store) ou "development"
//                  (appli lancee depuis Xcode). Defaut : production.

import { createSign } from "node:crypto";
import http2 from "node:http2";

export const PREFIXE_APNS = "apns:";

/** Le jeton APNs d'une ligne de push_subscriptions, ou null si c'est un
    abonnement web. Un jeton APNs est une suite hexadecimale. */
export function jetonApns(ligne) {
  const endpoint = ligne?.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith(PREFIXE_APNS)) return null;
  const jeton = endpoint.slice(PREFIXE_APNS.length);
  return /^[0-9a-f]{32,200}$/i.test(jeton) ? jeton : null;
}

/** La charge APNs d'un message de construireMessage() (push.js).
    `url` suit la notification : l'appli s'y rend quand on la touche. */
export function chargeApns(message) {
  return {
    aps: {
      alert: { title: message.titre || "Noctify", body: message.corps || "" },
      sound: "default",
      ...(message.tag ? { "thread-id": message.tag } : {}),
    },
    url: message.url || "",
  };
}

/** Quand APNs dit que le jeton ne vaut plus rien (appli desinstallee,
    notifications coupees) : la ligne doit partir, comme un 410 web. */
export function jetonMort(statut, raison) {
  if (statut === 410) return true;
  return statut === 400 && (raison === "BadDeviceToken" || raison === "DeviceTokenNotForTopic");
}

export function configApns(env = process.env) {
  const cle = env.APNS_KEY;
  if (!cle || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPIC) return null;
  return {
    cle: cle.includes("\\n") ? cle.replace(/\\n/g, "\n") : cle,
    idCle: env.APNS_KEY_ID,
    equipe: env.APNS_TEAM_ID,
    topic: env.APNS_TOPIC,
    hote: env.APNS_ENV === "development" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com",
  };
}

const b64url = (b) => Buffer.from(b).toString("base64url");

/* Le jeton d'authentification d'APNs : un JWT ES256, valable une heure
   chez Apple, qui refuse qu'on en change plus d'une fois toutes les
   20 minutes. On le garde donc 40 minutes. */
let jwtEnCache = null;
function jwtApns(config, maintenant = Date.now()) {
  if (jwtEnCache && jwtEnCache.idCle === config.idCle && maintenant - jwtEnCache.le < 40 * 60 * 1000) {
    return jwtEnCache.jwt;
  }
  const entete = b64url(JSON.stringify({ alg: "ES256", kid: config.idCle }));
  const corps = b64url(JSON.stringify({ iss: config.equipe, iat: Math.floor(maintenant / 1000) }));
  const signature = createSign("SHA256")
    .update(`${entete}.${corps}`)
    .sign({ key: config.cle, dsaEncoding: "ieee-p1363" });
  const jwt = `${entete}.${corps}.${b64url(signature)}`;
  jwtEnCache = { jwt, idCle: config.idCle, le: maintenant };
  return jwt;
}

function posterHttp2(hote, chemin, entetes, corps) {
  return new Promise((resoudre) => {
    let client;
    try {
      client = http2.connect(hote);
    } catch {
      return resoudre({ statut: 0 });
    }
    const fin = (r) => {
      try { client.close(); } catch {}
      resoudre(r);
    };
    client.on("error", () => fin({ statut: 0 }));
    const req = client.request({ ":method": "POST", ":path": chemin, ...entetes });
    let statut = 0;
    let texte = "";
    req.setEncoding("utf8");
    req.on("response", (h) => { statut = h[":status"]; });
    req.on("data", (morceau) => { texte += morceau; });
    req.on("end", () => {
      let raison = "";
      try { raison = JSON.parse(texte).reason || ""; } catch {}
      fin({ statut, raison });
    });
    req.on("error", () => fin({ statut: 0 }));
    req.setTimeout(10000, () => { req.close(); fin({ statut: 0 }); });
    req.end(JSON.stringify(corps));
  });
}

/**
 * Envoie un message a un appareil iOS. Ne leve jamais.
 * @returns {Promise<"ok"|"mort"|"echec"|"non_configure">}
 */
export async function envoyerApns(jeton, message, env = process.env) {
  const config = configApns(env);
  if (!config) return "non_configure";
  try {
    const { statut, raison } = await posterHttp2(
      config.hote,
      `/3/device/${jeton}`,
      {
        authorization: `bearer ${jwtApns(config)}`,
        "apns-topic": config.topic,
        "apns-push-type": "alert",
        "content-type": "application/json",
        ...(message.tag ? { "apns-collapse-id": String(message.tag).slice(0, 64) } : {}),
      },
      chargeApns(message),
    );
    if (statut === 200) return "ok";
    return jetonMort(statut, raison) ? "mort" : "echec";
  } catch {
    return "echec";
  }
}
