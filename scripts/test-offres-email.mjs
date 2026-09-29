// Les offres par e-mail des commerces (lib/offres/email.js).
import {
  lireOffre,
  choisirDestinataires,
  heuresAvantProchainEnvoi,
  jetonDesabonnement,
  lireJetonDesabonnement,
  construireEmail,
  LIMITES,
} from "../lib/offres/email.js";

let passed = 0;
let failed = 0;
const check = (label, cond) => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}`); }
};

console.log("\nCe que le gerant ecrit");
check("offre valide", lireOffre({ sujet: " -20 % ce mardi ", message: "Venez !", cible: "absents" }).sujet === "-20 % ce mardi");
check("cible inconnue -> tous", lireOffre({ sujet: "a", message: "b", cible: "n'importe" }).cible === "tous");
check("objet vide refuse", "erreur" in lireOffre({ sujet: "  ", message: "b" }));
check("message vide refuse", "erreur" in lireOffre({ sujet: "a", message: "" }));
check("objet trop long refuse", "erreur" in lireOffre({ sujet: "x".repeat(LIMITES.sujet + 1), message: "b" }));
check("message trop long refuse", "erreur" in lireOffre({ sujet: "a", message: "x".repeat(LIMITES.message + 1) }));

console.log("\nQui recoit");
const maintenant = Date.parse("2026-09-30T12:00:00Z");
const visites = new Map([
  ["recent", "2026-09-25T20:00:00Z"],
  ["ancien", "2026-07-01T20:00:00Z"],
]);
const consentis = ["recent", "ancien", "jamais", "recent"];
check("tous : chaque client une seule fois", choisirDestinataires(consentis, visites, "tous", maintenant).length === 3);
const absents = choisirDestinataires(consentis, visites, "absents", maintenant);
check("absents : pas le client venu il y a 5 jours", !absents.includes("recent"));
check("absents : le client pas revenu depuis 3 mois", absents.includes("ancien"));
check("absents : le client jamais venu", absents.includes("jamais"));
check("aucun consentement -> personne", choisirDestinataires([], visites, "tous", maintenant).length === 0);

console.log("\nUn envoi par jour");
check("jamais envoye -> 0", heuresAvantProchainEnvoi(null, maintenant) === 0);
check("envoye il y a 2 h -> 22 h a attendre", heuresAvantProchainEnvoi("2026-09-30T10:00:00Z", maintenant) === 22);
check("envoye hier -> 0", heuresAvantProchainEnvoi("2026-09-29T11:00:00Z", maintenant) === 0);

console.log("\nLien de desabonnement");
const U = "11111111-2222-3333-4444-555555555555";
const C = "66666666-7777-8888-9999-000000000000";
const jeton = jetonDesabonnement(U, C, "secret");
const lu = lireJetonDesabonnement(jeton, "secret");
check("jeton relu", lu && lu.userId === U && lu.clubId === C);
check("mauvais secret refuse", lireJetonDesabonnement(jeton, "autre") === null);
check("jeton trafique refuse", lireJetonDesabonnement("x" + jeton, "secret") === null);
check("jeton vide refuse", lireJetonDesabonnement("", "secret") === null);
check("sans secret refuse", lireJetonDesabonnement(jeton, "") === null);

console.log("\nL'e-mail");
const e = construireEmail({ lieu: "Café <b>", sujet: "-20 %", message: "Ligne 1\nLigne 2\n\nParagraphe", lienDesabonnement: "https://x/?t=1" });
check("le nom du lieu dans l'objet", e.sujet.startsWith("Café <b> :"));
check("HTML echappe (pas d'injection)", e.html.includes("Café &lt;b&gt;") && !e.html.includes("Café <b>"));
check("lien de desabonnement dans le HTML", e.html.includes("https://x/?t=1"));
check("lien de desabonnement dans le texte", e.texte.includes("https://x/?t=1"));
check("paragraphes separes", (e.html.match(/<p style="margin:0 0 14px/g) || []).length === 2);

console.log(`\n${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
