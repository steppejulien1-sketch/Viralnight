// Tests de la verification des contenus.
// Enjeu : un client "fiable" voit sa declaration validee sans recomptage.
// Un faux positif ici, c'est un club qui distribue des points sur des chiffres gonfles.

import { evaluerFiabilite, validationRapidePossible } from "../lib/verification/customerTrust.js";
import { analyserLien } from "../lib/verification/linkPreview.js";

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

const c = (declare, reel, status = "validated") => ({ declared_views: declare, views_count: reel, status });

console.log("\nHistorique insuffisant");
check("aucun contenu", evaluerFiabilite([]).niveau === "inconnu");
check("message de premier contenu", evaluerFiabilite([]).libelle.includes("Premier"));
check("2 contenus : trop peu", evaluerFiabilite([c(1000,1000), c(2000,2000)]).niveau === "inconnu");
check("les contenus en attente ne comptent pas",
  evaluerFiabilite([c(1000,1000,"pending"), c(1000,1000,"pending"), c(1000,1000,"pending")]).niveau === "inconnu");
check("les contenus sans declaration ne comptent pas",
  evaluerFiabilite([c(null,1000), c(null,1000), c(null,1000)]).niveau === "inconnu");

console.log("\nClient fiable");
const fiable = evaluerFiabilite([c(1000,1000), c(2000,2050), c(5000,4900)]);
check("declarations exactes -> fiable", fiable.niveau === "fiable", JSON.stringify(fiable));
check("exactitude a 100%", fiable.exactitude === 100);
check("tendance exacte", fiable.tendance === "exact");
check("validation rapide autorisee", validationRapidePossible(fiable));

console.log("\nClient qui exagere");
const exagere = evaluerFiabilite([c(5000,1000), c(4000,1000), c(3000,1000)]);
check("gonfle ses chiffres -> a surveiller", exagere.niveau === "a_surveiller", JSON.stringify(exagere));
check("tendance exageree detectee", exagere.tendance === "exagere");
check("validation rapide refusee", !validationRapidePossible(exagere));
check("le libelle chiffre l'exageration", /\d+% de vues en trop/.test(exagere.libelle), exagere.libelle);

console.log("\nBiais systematique leger : le cas piege");
// Toujours +25% : chaque ecart depasse la tolerance, donc exactitude faible.
const legerBiais = evaluerFiabilite([c(1250,1000), c(2500,2000), c(3750,3000), c(5000,4000)]);
check("exageration constante refusee", legerBiais.niveau === "a_surveiller", JSON.stringify(legerBiais));
check("validation rapide refusee", !validationRapidePossible(legerBiais));

console.log("\nClient modeste (sous-estime)");
const modeste = evaluerFiabilite([c(500,1000), c(900,2000), c(1500,3000)]);
check("sous-estimer n'est pas penalisant", modeste.niveau === "a_surveiller" || modeste.niveau === "fiable");
check("tendance sous-estimee detectee", modeste.tendance === "sous-estime", JSON.stringify(modeste));

console.log("\nCas limites");
check("liste nulle ne plante pas", evaluerFiabilite(null).niveau === "inconnu");
check("vues a zero ignorees", evaluerFiabilite([c(100,0), c(100,0), c(100,0)]).niveau === "inconnu");
check("un contenu rejete ne compte pas",
  evaluerFiabilite([c(1000,1000), c(1000,1000), c(9000,100,"rejected")]).verifies === 2);

console.log("\nReconnaissance des liens");
check("TikTok reconnu", analyserLien("https://www.tiktok.com/@a/video/123")?.plateforme === "tiktok");
check("YouTube classique + id", analyserLien("https://www.youtube.com/watch?v=abc123")?.videoId === "abc123");
check("YouTube Shorts + id", analyserLien("https://www.youtube.com/shorts/xyz789")?.videoId === "xyz789");
check("youtu.be + id", analyserLien("https://youtu.be/def456")?.videoId === "def456");
check("Instagram reconnu", analyserLien("https://instagram.com/p/ABC/")?.plateforme === "instagram");
check("site inconnu rejete", analyserLien("https://exemple.com/x") === null);
check("javascript: rejete", analyserLien("javascript:alert(1)") === null);
check("texte libre rejete", analyserLien("coucou") === null);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
