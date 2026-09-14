// Tests du tableau de bord admin (lib/admin/pilotage.js).
// Enjeu : Julien lit ces chiffres pour decider. Un « aujourd'hui » decale
// d'une heure, un mois de janvier qui cherche le mois « 0 », ou un avis
// compte comme une demande de support, ne se voient pas sur l'ecran.

import {
  jourLocal,
  decalerJour,
  resumePeriodes,
  serieParJour,
  appareilsActifs,
  actifsParJour,
  repartitionMotifs,
  estAvis,
  syntheseAvis,
  filsSupport,
  statutClub,
  resumeClubs,
  joursEntre,
  forfaitContenu,
  libelleContenu,
  echeanceAutoValidation,
  libelleEcheance,
  seuilAutoValidation,
} from "../lib/admin/pilotage.js";

let passed = 0, failed = 0;
function check(nom, ok, detail) {
  if (ok) { passed += 1; console.log(`  OK   ${nom}`); }
  else { failed += 1; console.log(`  FAIL ${nom}${detail !== undefined ? " -> " + detail : ""}`); }
}

// Samedi 13 septembre 2026, 23 h 30 a Bruxelles (21 h 30 UTC).
const MAINTENANT = new Date("2026-09-13T21:30:00Z");

console.log("\nJours de Bruxelles");
check("minuit et demi local = le jour local, pas la veille UTC", jourLocal("2026-09-13T22:30:00Z") === "2026-09-14", jourLocal("2026-09-13T22:30:00Z"));
check("heure d'hiver aussi", jourLocal("2026-01-10T23:30:00Z") === "2026-01-11");
check("date invalide -> null", jourLocal("pas une date") === null);
check("decaler au travers d'un mois", decalerJour("2026-03-01", -1) === "2026-02-28");
check("decaler au travers d'une annee", decalerJour("2026-01-01", -1) === "2025-12-31");

console.log("\nPeriodes");
const inscriptions = [
  "2026-09-13T08:00:00Z", // aujourd'hui
  "2026-09-13T22:10:00Z", // demain a Bruxelles -> ni aujourd'hui ni 7 jours
  "2026-09-07T10:00:00Z", // il y a 6 jours -> dans les 7 jours
  "2026-09-06T10:00:00Z", // il y a 7 jours -> hors des 7 jours, dans le mois
  "2026-08-31T21:59:00Z", // 23 h 59 le 31 aout a Bruxelles -> mois dernier
  "2026-08-31T22:01:00Z", // 0 h 01 le 1er septembre -> ce mois
  "2025-12-20T10:00:00Z",
];
const p = resumePeriodes(inscriptions, MAINTENANT);
check("aujourd'hui", p.aujourdhui === 1, JSON.stringify(p));
check("7 jours, aujourd'hui compris", p.septJours === 2, JSON.stringify(p));
check("ce mois (bord du 1er a Bruxelles)", p.ceMois === 5, JSON.stringify(p));
check("mois dernier", p.moisDernier === 1, JSON.stringify(p));
check("total", p.total === 7);
const janvier = resumePeriodes(["2025-12-15T12:00:00Z"], new Date("2026-01-05T12:00:00Z"));
check("en janvier, le mois dernier est decembre de l'annee d'avant", janvier.moisDernier === 1, JSON.stringify(janvier));

console.log("\nSerie par jour");
const serie = serieParJour(inscriptions, 30, MAINTENANT);
check("30 barres, jours vides compris", serie.length === 30);
check("se termine aujourd'hui", serie[29].jour === "2026-09-13");
check("commence 29 jours plus tot", serie[0].jour === "2026-08-15");
check("compte le bon jour", serie[29].n === 1 && serie.find((s) => s.jour === "2026-09-01").n === 1);

console.log("\nAppareils actifs");
const ouvertures = [
  { appareil: "a", jour: "2026-09-13" },
  { appareil: "a", jour: "2026-09-12" },
  { appareil: "b", jour: "2026-09-08" },
  { appareil: "c", jour: "2026-08-10" },
];
check("aujourd'hui : un appareil", appareilsActifs(ouvertures, 1, MAINTENANT) === 1);
check("7 jours : le meme appareil deux jours ne compte qu'une fois", appareilsActifs(ouvertures, 7, MAINTENANT) === 2);
check("30 jours", appareilsActifs(ouvertures, 30, MAINTENANT) === 2);
const actifs = actifsParJour([...ouvertures, { appareil: "b", jour: "2026-09-13" }], 7, MAINTENANT);
check("actifs par jour : 7 barres", actifs.length === 7 && actifs[6].jour === "2026-09-13");
check("actifs par jour : appareils distincts du jour", actifs[6].n === 2 && actifs[5].n === 1 && actifs[0].n === 0, JSON.stringify(actifs));

console.log("\nRaisons de depart");
const r = repartitionMotifs([{ motif: "plus_utilise" }, { motif: "plus_utilise" }, { motif: "doublon" }, { motif: "<script>" }]);
check("la plus frequente en tete", r[0].code === "plus_utilise" && r[0].n === 2);
check("pourcentage", r[0].part === 50);
check("les raisons a zero restent visibles", r.some((x) => x.code === "pas_de_story" && x.n === 0));
check("un code inconnu est range a part, sans son texte", r.some((x) => x.code === "inconnu" && x.n === 1) && !r.some((x) => x.code === "<script>"));
check("aucun depart : pas de division par zero", repartitionMotifs([]).every((x) => x.part === 0));

console.log("\nAvis");
const messages = [
  { user_id: "u1", auteur: "client", message: "Avis sur l'appli : ★★★★☆ (4/5)", created_at: "2026-09-10T10:00:00Z" },
  { user_id: "u1", auteur: "client", message: "Commentaire sur l'appli (4/5) : Très pratique", created_at: "2026-09-10T10:01:00Z" },
  { user_id: "u2", auteur: "client", message: "Avis sur l'appli : ★★☆☆☆ (2/5)", created_at: "2026-09-11T10:00:00Z" },
  { user_id: "u2", auteur: "client", message: "[Points] Je n'ai pas eu mes points", created_at: "2026-09-12T10:00:00Z" },
  { user_id: "u1", auteur: "client", message: "Bonjour", created_at: "2026-09-09T10:00:00Z" },
  { user_id: "u1", auteur: "admin", message: "Bonjour, que puis-je faire ?", created_at: "2026-09-09T11:00:00Z" },
];
const a = syntheseAvis(messages);
check("deux notes", a.nombre === 2);
check("moyenne a une decimale", a.moyenne === 3, a.moyenne);
check("repartition des etoiles", a.etoiles[4] === 1 && a.etoiles[2] === 1);
check("le commentaire et sa note", a.commentaires.length === 1 && a.commentaires[0].texte === "Très pratique" && a.commentaires[0].note === 4);
check("aucun avis : moyenne nulle, pas NaN", syntheseAvis([]).moyenne === null);
check("un message ordinaire n'est pas un avis", !estAvis("[Points] Je n'ai pas eu mes points"));
check("un client qui imite le format sans etoiles n'est pas une note", !estAvis("Avis sur l'appli : nul (1/5)"));

console.log("\nSupport");
const fils = filsSupport(messages, { u1: { pseudo: "camille_4" }, u2: { pseudo: "tom" } });
check("un fil par clubbeur, avis exclus", fils.length === 2 && fils.every((f) => f.messages.every((m) => !estAvis(m.message))));
check("le fil sans reponse passe en tete", fils[0].user_id === "u2" && fils[0].aRepondre === true);
check("le fil ou l'admin a repondu en dernier n'attend rien", fils[1].aRepondre === false);
check("le sujet est lu dans le prefixe [..]", fils[0].sujet === "Points", fils[0].sujet);
check("le pseudo suit", fils[0].pseudo === "tom");
check("messages dans l'ordre chronologique", fils[1].messages[0].message === "Bonjour");

console.log("\nClubs");
check("actif = payant", statutClub("actif").code === "payant");
check("statut vide ou inconnu = essai", statutClub(null).code === "essai" && statutClub("bidon").code === "essai");
const rc = resumeClubs([{ subscription_status: "actif" }, { subscription_status: "essai" }, { subscription_status: "suspendu" }, {}]);
check("resume des clubs", rc.total === 4 && rc.payant === 1 && rc.essai === 2 && rc.suspendu === 1, JSON.stringify(rc));

console.log("\nForfait d'un contenu (miroir de story_points)");
check("story = 100", forfaitContenu("story") === 100);
check("reel = 60", forfaitContenu("Reel") === 60);
check("tiktok sans vues verifiees = 60", forfaitContenu("tiktok", null) === 60);
check("tiktok : 7 points par tranche de 100 vues", forfaitContenu("tiktok", 1250) === 60 + 12 * 7);
check("tiktok : bonus plafonne a 2000", forfaitContenu("tiktok", 10_000_000) === 2060);
check("type inconnu -> null (la base refuse aussi)", forfaitContenu("youtube") === null);
check("libelles", libelleContenu("story") === "Story Instagram" && libelleContenu("tiktok") === "TikTok");

console.log("\nValidation automatique a 24 h");
const envoye = "2026-09-13T20:00:00Z";
check("echeance = envoi + 24 h", echeanceAutoValidation(envoye) === "2026-09-14T20:00:00.000Z");
check("il reste 22 h 30 -> « dans 22 h » (arrondi vers le bas)", libelleEcheance(envoye, MAINTENANT) === "Validation automatique dans 22 h", libelleEcheance(envoye, MAINTENANT));
check("moins d'une heure -> en minutes", libelleEcheance("2026-09-12T21:50:00Z", MAINTENANT) === "Validation automatique dans 20 min", libelleEcheance("2026-09-12T21:50:00Z", MAINTENANT));
check("echeance depassee -> dans l'heure (la tache passe chaque heure)", libelleEcheance("2026-09-11T10:00:00Z", MAINTENANT) === "Validation automatique dans l'heure");
check("date invalide -> null", libelleEcheance("pas une date", MAINTENANT) === null && echeanceAutoValidation(undefined) === null);
check("seuil de la tache = maintenant - 24 h", seuilAutoValidation(MAINTENANT) === "2026-09-12T21:30:00.000Z");

console.log("\nAnciennete");
check("jours entiers", joursEntre("2026-09-01T10:00:00Z", MAINTENANT) === 12);
check("jamais negatif", joursEntre("2026-09-20T10:00:00Z", MAINTENANT) === 0);
check("date absente -> null", joursEntre(undefined, MAINTENANT) === null);

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed) process.exit(1);
