// Tests de la reponse automatique du support (lib/ai/supportIa.js).
// Enjeu : l'IA ne doit parler que quand il faut (pas sur un avis, pas quand
// Julien a repris la main, pas sans fin), dire la verite sur le compte, et
// ne jamais faire echouer l'envoi quand OpenAI n'a plus de credit.

import {
  doitRepondre,
  contexteCompte,
  historiquePourModele,
  lireReponse,
  messageEnregistre,
  genererReponse,
  REPONSES_MAX_24H,
  CONSIGNES,
} from "../lib/ai/supportIa.js";

let passed = 0, failed = 0;
function check(nom, ok, detail) {
  if (ok) { passed += 1; console.log(`  OK   ${nom}`); }
  else { failed += 1; console.log(`  FAIL ${nom}${detail !== undefined ? " -> " + detail : ""}`); }
}

const MAINTENANT = new Date("2026-09-16T20:00:00Z");
const il = (min) => new Date(MAINTENANT.getTime() - min * 60000).toISOString();

console.log("\nQuand repondre");
check("un message client frais -> oui", doitRepondre([{ auteur: "client", message: "[Points] rien recu", created_at: il(0) }], MAINTENANT).repondre);
check("dernier message de l'IA -> non", !doitRepondre([{ auteur: "ia", message: "x", created_at: il(0) }], MAINTENANT).repondre);
check("un avis sur l'appli -> non", doitRepondre([{ auteur: "client", message: "Avis sur l'appli : ★★★★☆ (4/5)", created_at: il(0) }], MAINTENANT).raison === "avis");
check("un commentaire d'avis -> non", !doitRepondre([{ auteur: "client", message: "Commentaire sur l'appli (2/5) : bof", created_at: il(0) }], MAINTENANT).repondre);
check("Julien a repondu il y a 2 h -> l'IA se tait", doitRepondre([
  { auteur: "client", message: "merci", created_at: il(0) },
  { auteur: "admin", message: "c'est regle", created_at: il(120) },
], MAINTENANT).raison === "humain_recent");
check("Julien a repondu il y a 2 jours -> l'IA reprend", doitRepondre([
  { auteur: "client", message: "encore un souci", created_at: il(0) },
  { auteur: "admin", message: "ok", created_at: il(2 * 24 * 60) },
], MAINTENANT).repondre);
const rafaleIa = [{ auteur: "client", message: "?", created_at: il(0) }];
for (let i = 0; i < REPONSES_MAX_24H; i++) rafaleIa.push({ auteur: "ia", message: "r", created_at: il(10 + i) });
check("limite de reponses sur 24 h", doitRepondre(rafaleIa, MAINTENANT).raison === "limite_atteinte");

console.log("\nContexte du compte");
const ctx = contexteCompte({
  profil: { handle: "julien.stpt", points_balance: 165, lifetime_points: 465, created_at: "2026-09-10T10:00:00Z" },
  stories: [{ mentioned_at: "2026-09-15T23:10:00Z", review_status: null, awarded_points: 0, club: "Mirage" }, { mentioned_at: "2026-09-12T23:10:00Z", review_status: "refusee", club: "Mirage" }],
  gains: [{ created_at: "2026-09-16T19:00:00Z", amount: 15, source: "scan", club: "Mirage", released: true }],
  bons: [{ redeemed_at: "2026-09-16T19:30:00Z", titre: "Cocktail offert", used: false }],
});
check("pseudo et solde", ctx.includes("@julien.stpt") && ctx.includes("165 points"));
check("story sans decision = en attente", ctx.includes("en attente de vérification"), ctx);
check("story refusee", ctx.includes("refusée"));
check("scan lisible", ctx.includes("+15 (scan du QR, Mirage)"));
check("bon pas encore utilise", ctx.includes("Cocktail offert, pas encore utilisé"));
check("aucun e-mail dans le contexte", !/@viralnight|gmail/.test(ctx));
check("compte vide sans planter", contexteCompte({}).includes("Aucune story"));
check("les consignes interdisent de promettre", /Ne le promets jamais/.test(CONSIGNES));

console.log("\nHistorique");
const h = historiquePourModele([
  { auteur: "ia", message: "[Transmis] je transmets", created_at: il(1) },
  { auteur: "client", message: "[Points] rien recu", created_at: il(2) },
]);
check("ordre chronologique", h[0].role === "user" && h[1].role === "assistant");
check("etiquette Transmis retiree pour le modele", h[1].content === "je transmets");

console.log("\nLecture de la reponse");
check("JSON propre", lireReponse('{"reponse":"Tes points arrivent 24 h apres.","transmettre":false}')?.texte === "Tes points arrivent 24 h apres.");
check("JSON entoure de texte", lireReponse('Voici : {"reponse":"ok","transmettre":true} fin')?.transmettre === true);
check("reponse vide -> null", lireReponse('{"reponse":"  "}') === null);
check("pas du JSON -> null", lireReponse("bonjour") === null);
check("transmis -> etiquette", messageEnregistre({ texte: "Je transmets.", transmettre: true }) === "[Transmis] Je transmets.");
check("pas transmis -> texte seul", messageEnregistre({ texte: "Voila.", transmettre: false }) === "Voila.");

console.log("\nAppel du modele (simule)");
process.env.OPENAI_API_KEY = "sk-test";
const quota = await genererReponse({ historique: [], contexte: "", fetchImpl: async () => ({ ok: false, status: 429, text: async () => '{"error":{"type":"insufficient_quota"}}' }) });
check("credit epuise -> erreur nommee, pas d'exception", quota.erreur === "credit_openai_epuise", JSON.stringify(quota));
const bon = await genererReponse({ historique: [], contexte: "", fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"reponse":"Ta story est en attente.","transmettre":false}' } }] }) }) });
check("reponse du modele lue", bon.texte === "Ta story est en attente.", JSON.stringify(bon));
const panne = await genererReponse({ historique: [], contexte: "", fetchImpl: async () => { throw new Error("reseau"); } });
check("panne reseau -> erreur, pas d'exception", panne.erreur === "reseau");
delete process.env.OPENAI_API_KEY;
check("sans cle -> cle_absente", (await genererReponse({ historique: [], contexte: "" })).erreur === "cle_absente");

console.log(`\n${passed} OK, ${failed} en echec`);
if (failed) process.exit(1);
