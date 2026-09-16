// Tests de la reponse automatique du support (lib/support/reponseAuto.js).
// Enjeu : reconnaitre de quoi parle le client, lui dire la verite sur SON
// compte, et transmettre a Julien tout ce qu'on ne sait pas regler -- sans
// jamais parler quand il ne faut pas.

import {
  doitRepondre,
  intention,
  repondre,
  messageEnregistre,
  REPONSES_MAX_24H,
} from "../lib/support/reponseAuto.js";

let passed = 0, failed = 0;
function check(nom, ok, detail) {
  if (ok) { passed += 1; console.log(`  OK   ${nom}`); }
  else { failed += 1; console.log(`  FAIL ${nom}${detail !== undefined ? " -> " + detail : ""}`); }
}

// Mercredi 16 septembre 2026, 22 h a Bruxelles.
const MAINTENANT = new Date("2026-09-16T20:00:00Z");
const il = (h) => new Date(MAINTENANT.getTime() - h * 3600000).toISOString();

console.log("\nQuand repondre");
check("message client -> oui", doitRepondre([{ auteur: "client", message: "[Points] rien", created_at: il(0) }], MAINTENANT).repondre);
check("avis -> non", doitRepondre([{ auteur: "client", message: "Avis sur l'appli : ★★★★☆ (4/5)", created_at: il(0) }], MAINTENANT).raison === "avis");
check("Julien a repondu il y a 2 h -> non", doitRepondre([{ auteur: "client", message: "merci", created_at: il(0) }, { auteur: "admin", message: "ok", created_at: il(2) }], MAINTENANT).raison === "humain_recent");
check("Julien a repondu il y a 2 jours -> oui", doitRepondre([{ auteur: "client", message: "re", created_at: il(0) }, { auteur: "admin", message: "ok", created_at: il(48) }], MAINTENANT).repondre);
const trop = [{ auteur: "client", message: "?", created_at: il(0) }];
for (let i = 0; i < REPONSES_MAX_24H; i++) trop.push({ auteur: "ia", message: "r", created_at: il(1) });
check("limite par 24 h", doitRepondre(trop, MAINTENANT).raison === "limite_atteinte");

console.log("\nDe quoi parle le client");
const cas = [
  ["[Points] j'ai pas reçu mes points", "points"],
  ["[Autre] ma story insta a été refusée pourquoi", "story"],
  ["Bonjour, j'ai posté sur Instagram hier", "story"],
  ["le barman a refusé mon bon", "recompense"],
  ["Bonjour", "salut"],
  ["je veux un truc bizarre", "inconnu"],
  ["le QR code ne scanne pas", "scan"],
  ["je reçois pas le code pour me connecter", "connexion"],
  ["merci beaucoup !", "merci"],
  ["l'appli plante quand j'ouvre la carte", "bug"],
  ["comment activer les notifs", "notifications"],
  ["je veux supprimer mon compte", "suppression"],
  ["mon ami s'est inscrit mais j'ai rien", "parrainage"],
  ["le cadeau du jour a disparu", "cadeau"],
  ["[Établissement] le Fuse", "etablissement"],
  ["c'est une arnaque votre truc", "colere"],
  ["[Compte] changer mon pseudo", "compte"],
  ["ça marche pas", "bug"],
];
for (const [m, attendu] of cas) {
  const vu = intention(m);
  check(`« ${m} » -> ${attendu}`, vu === attendu, vu);
}

console.log("\nReponses avec le compte");
const compte = {
  profil: { handle: "julien.stpt", points_balance: 165 },
  stories: [{ mentioned_at: il(5), review_status: null, club: "Mirage" }],
  gains: [{ created_at: il(1), amount: 15, source: "scan", club: "Mirage", released: true }],
  bons: [{ redeemed_at: il(2), titre: "Cocktail offert", used: false }],
  cadeaux: [],
  parrainages: 2,
};
let rep = repondre("[Points] toujours rien", compte, MAINTENANT);
check("story en attente : le dit, avec l'heure, sans transmettre", /en cours de vérification/.test(rep.texte) && /Mirage/.test(rep.texte) && !rep.transmettre, rep.texte);
rep = repondre("ma story", { ...compte, stories: [{ mentioned_at: il(60), review_status: null, club: "Mirage" }] }, MAINTENANT);
check("story en attente depuis 60 h -> transmise", rep.transmettre && /aurait dû/.test(rep.texte), rep.texte);
rep = repondre("ma story", { ...compte, stories: [{ mentioned_at: il(30), review_status: "refusee", club: "Mirage" }] }, MAINTENANT);
check("story refusee -> explique et transmet", rep.transmettre && /refusée/.test(rep.texte));
rep = repondre("ma story", { ...compte, stories: [{ mentioned_at: il(30), review_status: "validee", awarded_points: 100, club: "Mirage" }] }, MAINTENANT);
check("story validee -> montant et solde", /\+100 points/.test(rep.texte) && /165 points/.test(rep.texte) && !rep.transmettre, rep.texte);
rep = repondre("ma story", { ...compte, stories: [] }, MAINTENANT);
check("aucune story -> explique et transmet", rep.transmettre && /aucune story/.test(rep.texte));
rep = repondre("le qr ne marche pas", compte, MAINTENANT);
check("scan de ce soir retrouve", /ce soir au Mirage/.test(rep.texte) && /15 points/.test(rep.texte), rep.texte);
rep = repondre("où est mon bon ?", compte, MAINTENANT);
check("bon pas utilise -> Mes bons", /Cocktail offert/.test(rep.texte) && /Mes bons/.test(rep.texte) && !rep.transmettre, rep.texte);
rep = repondre("le videur a refusé mon bon", compte, MAINTENANT);
check("bon refuse -> transmis", rep.transmettre);
rep = repondre("parrainage", compte, MAINTENANT);
check("parrainage : compte ses amis", /2 amis inscrits/.test(rep.texte), rep.texte);
rep = repondre("cadeau du jour ?", { ...compte, cadeaux: [{ gift_date: "2026-09-16", amount: 3, jour: 2 }] }, MAINTENANT);
check("cadeau deja pris aujourd'hui", /déjà pris/.test(rep.texte) && /jour 2 sur 7/.test(rep.texte), rep.texte);
rep = repondre("je voudrais parler a quelqu un", compte, MAINTENANT);
check("rien de reconnu -> transmis", rep.transmettre);
rep = repondre("merci", compte, MAINTENANT);
check("merci -> pas transmis", !rep.transmettre);
check("compte vide sans planter", typeof repondre("[Points] ?", {}, MAINTENANT).texte === "string");
check("aucun e-mail ni id dans les reponses", !/@|[0-9a-f]{8}-/.test(repondre("[Points] ?", compte, MAINTENANT).texte));

console.log("\nEnregistrement");
check("transmis -> etiquette", messageEnregistre({ texte: "Je transmets.", transmettre: true }) === "[Transmis] Je transmets.");
check("sinon texte seul", messageEnregistre({ texte: "Voila.", transmettre: false }) === "Voila.");

console.log(`\n${passed} OK, ${failed} en echec`);
if (failed) process.exit(1);
