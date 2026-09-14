// Tests de la connexion Instagram : signature du state OAuth, construction
// des URLs et parsing du webhook. Aucun de ces tests n'appelle le vrai Graph
// API de Meta (impossible sans une app Meta et un compte de test) : ils
// verifient uniquement la logique qu'on controle nous-memes.

process.env.INSTAGRAM_STATE_SECRET = "secret-de-test-ne-pas-utiliser-en-prod";
process.env.INSTAGRAM_APP_ID = "123456789";
process.env.INSTAGRAM_APP_SECRET = "app-secret-test";
process.env.INSTAGRAM_REDIRECT_URI = "https://viralnight-koif.vercel.app/api/instagram?action=callback";

const { signerState, verifierState } = await import("../lib/instagram/state.js");
const {
  urlAutorisation, echangerCode, prolongerJeton, rafraichirJeton, trouverCompteInstagram,
  recupererAbonnes, lirePseudoExpediteur, MissingConfigError,
} = await import("../lib/instagram/oauth.js");
const { verifierChallengeWebhook, extraireMentionsStory, signatureValide } = await import("../lib/instagram/webhook.js");

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

console.log("\nPage de retour transportee par le state");
// Enjeu : la connexion lancee depuis l'appli club doit y revenir. Et la
// cle de retour voyage chez Facebook, donc elle doit etre signee comme le
// reste -- sinon on choisit la page d'arrivee de quelqu'un d'autre.
const avecRetour = verifierState(signerState(ETABLISSEMENT, "club"));
check("la cle de retour est rendue au callback", avecRetour.retour === "club", JSON.stringify(avecRetour));
check("l'etablissement reste correct avec un retour", avecRetour.establishmentId === ETABLISSEMENT);
check("sans retour, le champ vaut null", verifierState(signerState(ETABLISSEMENT)).retour === null);
check("un retour vide vaut null", verifierState(signerState(ETABLISSEMENT, "")).retour === null);

// Le point qui compte pour la securite : on ne peut pas changer la page
// d'arrivee d'un state existant sans casser sa signature.
const stateClub = signerState(ETABLISSEMENT, "club");
const charge = JSON.parse(Buffer.from(stateClub.split(".")[0], "base64url").toString("utf8"));
charge.r = "https://exemple-malveillant.test";
const forge = Buffer.from(JSON.stringify(charge)).toString("base64url");
check("un retour trafique invalide la signature",
  "error" in verifierState(`${forge}.${stateClub.split(".")[1]}`));

// Et meme signee, une valeur inconnue ne peut pas devenir une redirection :
// le callback la traduit par une table figee (cheminRetour), qui retombe
// sur le tableau de bord. On verifie ici que le state la laisse passer
// telle quelle -- c'est la table, pas la signature, qui la neutralise.
check("une cle inconnue ressort telle quelle, a charge du callback de la rejeter",
  verifierState(signerState(ETABLISSEMENT, "site-externe")).retour === "site-externe");

console.log("\nURL d'autorisation (connexion Instagram directe, 14/09/2026)");
const url = new URL(urlAutorisation(state));
check("domaine Instagram, plus Facebook", url.origin === "https://www.instagram.com" && url.pathname === "/oauth/authorize");
check("client_id transmis", url.searchParams.get("client_id") === "123456789");
check("redirect_uri transmise", url.searchParams.get("redirect_uri") === process.env.INSTAGRAM_REDIRECT_URI);
check("state transmis tel quel", url.searchParams.get("state") === state);
check("la messagerie est demandee (c'est par la qu'arrivent les stories)", url.searchParams.get("scope").includes("instagram_business_manage_messages"));
check("aucune permission Facebook Page demandee", !/pages_/.test(url.searchParams.get("scope")));

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
let requeteEchange = null;
const fauxFetchEchange = async (adresse, options) => {
  requeteEchange = { adresse, options };
  return { ok: true, json: async () => ({ access_token: "jeton-court", user_id: 17841400000000000, permissions: ["instagram_business_basic"] }) };
};
check("le jeton court est extrait", (await echangerCode("code-recu#_", fauxFetchEchange)) === "jeton-court");
check("echange en POST sur api.instagram.com", requeteEchange.adresse === "https://api.instagram.com/oauth/access_token" && requeteEchange.options.method === "POST");
check("le « #_ » colle par Instagram est retire du code", new URLSearchParams(requeteEchange.options.body).get("code") === "code-recu");
const fauxFetchData = async () => ({ ok: true, json: async () => ({ data: [{ access_token: "jeton-data" }] }) });
check("reponse au format data[0] aussi comprise", (await echangerCode("x", fauxFetchData)) === "jeton-data");

const fauxFetchLong = async () => ({ ok: true, json: async () => ({ access_token: "jeton-long", expires_in: 5184000 }) });
const prolonge = await prolongerJeton("jeton-court", fauxFetchLong);
check("le jeton longue duree est extrait", prolonge.accessToken === "jeton-long" && prolonge.dureeSecondes === 5184000);
const rafraichi = await rafraichirJeton("jeton-long", fauxFetchLong);
check("le renouvellement rend un jeton et sa duree", rafraichi.accessToken === "jeton-long" && rafraichi.dureeSecondes === 5184000);

const fauxFetchErreur = async () => ({ ok: false, status: 400, json: async () => ({ error_message: "code invalide" }) });
try {
  await echangerCode("code-perime", fauxFetchErreur);
  check("erreur Instagram propagee", false);
} catch (error) {
  check("erreur Instagram propagee", error.message === "code invalide");
}

console.log("\nLe compte connecte");
const fauxFetchMoi = async (adresse) => ({ ok: true, json: async () => (adresse.includes("fields=user_id") ? { user_id: "17841400000000042", username: "mirage.club" } : { followers_count: 1234 }) });
const compte = await trouverCompteInstagram("jeton", fauxFetchMoi);
check("user_id (celui des webhooks) et pseudo lus", compte?.igUserId === "17841400000000042" && compte?.igUsername === "mirage.club", JSON.stringify(compte));
check("null si Instagram ne rend pas de user_id", (await trouverCompteInstagram("jeton", async () => ({ ok: true, json: async () => ({}) }))) === null);
check("abonnes lus", (await recupererAbonnes("jeton", fauxFetchMoi)) === 1234);
check("pseudo de l'expediteur lu", (await lirePseudoExpediteur("igsid-1", "jeton", async () => ({ ok: true, json: async () => ({ username: "camille_4" }) }))) === "camille_4");
check("pseudo illisible -> null, jamais d'exception", (await lirePseudoExpediteur("igsid-1", "jeton", fauxFetchErreur)) === null);

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

console.log("\nMentions en story (messagerie Instagram)");
const payloadStory = {
  object: "instagram",
  entry: [
    {
      id: "ig-42",
      time: 1789400000,
      messaging: [
        { sender: { id: "client-1" }, recipient: { id: "ig-42" }, timestamp: 1789400000123, message: { mid: "mid-1", attachments: [{ type: "story_mention", payload: { url: "https://cdn/x" } }] } },
        { sender: { id: "client-2" }, recipient: { id: "ig-42" }, timestamp: 1789400000456, message: { mid: "mid-2", text: "salut" } },
        { sender: { id: "ig-42" }, recipient: { id: "client-1" }, timestamp: 1789400000789, message: { mid: "mid-3", is_echo: true, attachments: [{ type: "story_mention" }] } },
      ],
    },
    { id: "ig-99", time: 1789400001, messaging: [{ sender: { id: "client-3" }, recipient: { id: "ig-99" }, timestamp: 1789400001, message: { mid: "mid-4", attachments: [{ type: "story_mention" }] } }] },
    { id: "ig-42", time: 1789400002, changes: [{ field: "mentions", value: { media_id: "media-1" } }] },
  ],
};
const stories = extraireMentionsStory(payloadStory);
check("deux mentions en story (un simple message, un echo et une mention en commentaire ignores)", stories.length === 2, JSON.stringify(stories));
check("compte, expediteur et identifiant du message", stories[0].igCompte === "ig-42" && stories[0].expediteur === "client-1" && stories[0].mid === "mid-1");
check("horodatage en millisecondes converti", stories[0].recuA === new Date(1789400000123).toISOString());
check("horodatage en secondes converti aussi", stories[1].recuA === new Date(1789400001 * 1000).toISOString());
check("payload d'un autre objet ignore", extraireMentionsStory({ object: "page", entry: [] }).length === 0);
check("payload vide ignore", extraireMentionsStory(null).length === 0);
check("payload sans entry ignore", extraireMentionsStory({ object: "instagram" }).length === 0);

console.log("\nSignature Meta (X-Hub-Signature-256)");
const { createHmac } = await import("node:crypto");
const corps = JSON.stringify(payloadStory);
const bonne = "sha256=" + createHmac("sha256", "app-secret-test").update(corps).digest("hex");
check("signature valide reconnue", signatureValide(corps, bonne, "app-secret-test") === true);
check("corps modifie -> refusee", signatureValide(corps + " ", bonne, "app-secret-test") === false);
check("mauvais secret -> refusee", signatureValide(corps, bonne, "autre-secret") === false);
check("en-tete malforme -> refusee", signatureValide(corps, "sha256=zz", "app-secret-test") === false);
check("rien pour trancher -> null", signatureValide(corps, undefined, "app-secret-test") === null && signatureValide("", bonne, "x") === null);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
