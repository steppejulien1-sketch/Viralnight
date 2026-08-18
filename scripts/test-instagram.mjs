// Tests de la connexion Instagram : signature du state OAuth, construction
// des URLs et parsing du webhook. Aucun de ces tests n'appelle le vrai Graph
// API de Meta (impossible sans une app Meta et un compte de test) : ils
// verifient uniquement la logique qu'on controle nous-memes.

process.env.INSTAGRAM_STATE_SECRET = "secret-de-test-ne-pas-utiliser-en-prod";
process.env.INSTAGRAM_APP_ID = "123456789";
process.env.INSTAGRAM_APP_SECRET = "app-secret-test";
process.env.INSTAGRAM_REDIRECT_URI = "https://viralnight-koif.vercel.app/api/instagram-callback";

const { signerState, verifierState } = await import("../lib/instagram/state.js");
const { urlAutorisation, echangerCode, prolongerJeton, trouverCompteInstagram, MissingConfigError } = await import(
  "../lib/instagram/oauth.js"
);
const { verifierChallengeWebhook, extraireMentions } = await import("../lib/instagram/webhook.js");

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("\nSignature du state OAuth");
const ETABLISSEMENT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const state = signerState(ETABLISSEMENT);
check("le state contient un point (payload.signature)", state.includes("."));
const verifie = verifierState(state);
check("l'establishment_id se retrouve intact", verifie.establishmentId === ETABLISSEMENT, JSON.stringify(verifie));

const trafique = state.slice(0, -2) + "xx";
check("un state trafique est refuse", "error" in verifierState(trafique));

const [payloadBase64] = state.split(".");
const autreSignature = signerState("00000000-0000-4000-8000-000000000099").split(".")[1];
check("une signature d'un autre state ne colle pas", "error" in verifierState(`${payloadBase64}.${autreSignature}`));

check("un state vide est refuse", "error" in verifierState(""));
check("un state sans point est refuse", "error" in verifierState("abcdef"));

console.log("\nURL d'autorisation");
const url = new URL(urlAutorisation(state));
check("domaine Facebook", url.origin === "https://www.facebook.com");
check("client_id transmis", url.searchParams.get("client_id") === "123456789");
check("redirect_uri transmise", url.searchParams.get("redirect_uri") === process.env.INSTAGRAM_REDIRECT_URI);
check("state transmis tel quel", url.searchParams.get("state") === state);
check("le scope demande les mentions", url.searchParams.get("scope").includes("instagram_manage_insights"));

console.log("\nConfiguration manquante");
delete process.env.INSTAGRAM_APP_ID;
try {
  urlAutorisation(state);
  check("erreur levee si INSTAGRAM_APP_ID absent", false);
} catch (error) {
  check("erreur levee si INSTAGRAM_APP_ID absent", error instanceof MissingConfigError, error.message);
}
process.env.INSTAGRAM_APP_ID = "123456789";

console.log("\nEchange de jeton (fetch simule)");
const fauxFetchOk = async () => ({ ok: true, json: async () => ({ access_token: "jeton-abc", expires_in: 5184000 }) });
check("le jeton court est extrait", (await echangerCode("code-recu", fauxFetchOk)) === "jeton-abc");
const prolonge = await prolongerJeton("jeton-abc", fauxFetchOk);
check("le jeton longue duree est extrait", prolonge.accessToken === "jeton-abc" && prolonge.dureeSecondes === 5184000);

const fauxFetchErreur = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "code invalide" } }) });
try {
  await echangerCode("code-perime", fauxFetchErreur);
  check("erreur Graph API propagee", false);
} catch (error) {
  check("erreur Graph API propagee", error.message === "code invalide");
}

console.log("\nRecherche du compte Instagram lie a la page");
const fauxFetchPages = async (url) => {
  if (url.includes("/me/accounts")) {
    return { ok: true, json: async () => ({ data: [{ id: "page-1", name: "Mirage", access_token: "jeton-page" }] }) };
  }
  return {
    ok: true,
    json: async () => ({ instagram_business_account: { id: "ig-42", username: "mirage.club" } }),
  };
};
const compte = await trouverCompteInstagram("jeton-user", fauxFetchPages);
check("compte Instagram trouve", compte?.igUserId === "ig-42" && compte?.igUsername === "mirage.club", JSON.stringify(compte));
check("jeton de page conserve", compte?.pageAccessToken === "jeton-page");

const fauxFetchSansInstagram = async (url) => {
  if (url.includes("/me/accounts")) {
    return { ok: true, json: async () => ({ data: [{ id: "page-1", name: "Sans IG", access_token: "jeton-page" }] }) };
  }
  return { ok: true, json: async () => ({}) };
};
check("null si aucune page n'a de compte Instagram", (await trouverCompteInstagram("jeton-user", fauxFetchSansInstagram)) === null);

console.log("\nVerification d'URL de webhook (handshake Meta)");
process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "jeton-verif-test";
check(
  "challenge renvoye si le jeton correspond",
  verifierChallengeWebhook(
    { "hub.mode": "subscribe", "hub.verify_token": "jeton-verif-test", "hub.challenge": "abc123" },
    "jeton-verif-test",
  ) === "abc123",
);
check(
  "refuse si le jeton ne correspond pas",
  verifierChallengeWebhook(
    { "hub.mode": "subscribe", "hub.verify_token": "mauvais-jeton", "hub.challenge": "abc123" },
    "jeton-verif-test",
  ) === null,
);
check(
  "refuse si le mode n'est pas subscribe",
  verifierChallengeWebhook({ "hub.mode": "autre", "hub.verify_token": "jeton-verif-test" }, "jeton-verif-test") === null,
);

console.log("\nExtraction des mentions du payload webhook");
const payloadMention = {
  object: "instagram",
  entry: [
    { id: "ig-42", time: 123, changes: [{ field: "mentions", value: { media_id: "media-1" } }] },
    { id: "ig-42", time: 124, changes: [{ field: "comments", value: {} }] },
    { id: "ig-99", time: 125, changes: [{ field: "mentions", value: { media_id: "media-2" } }] },
  ],
};
const mentions = extraireMentions(payloadMention);
check("deux mentions extraites (le commentaire est ignore)", mentions.length === 2, JSON.stringify(mentions));
check("igUserId correct sur la premiere", mentions[0].igUserId === "ig-42" && mentions[0].mediaId === "media-1");
check("igUserId correct sur la seconde", mentions[1].igUserId === "ig-99" && mentions[1].mediaId === "media-2");

check("payload d'un autre objet ignore", extraireMentions({ object: "page", entry: [] }).length === 0);
check("payload vide ignore", extraireMentions(null).length === 0);
check("payload sans entry ignore", extraireMentions({ object: "instagram" }).length === 0);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
