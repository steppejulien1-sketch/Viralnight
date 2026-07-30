// Tests du calcul de points.
// Enjeu : le staff valide une publication et credite un client. Un calcul faux
// donne des points en trop (cout reel pour le club) ou en moins (client mecontent).

import { computePoints, describePoints, VIRAL_THRESHOLD_VIEWS } from "../lib/points/computePoints.js";

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

const rules = { videoViewsPerThousand: 25, storyViewsPerThousand: 80, viralBonus: 90 };
const pts = (views, contentType) => computePoints({ views, contentType, rules }).points;

console.log("\nFormule de base");
check("1000 vues video = 25 pts", pts(1000, "video") === 25, `obtenu ${pts(1000, "video")}`);
check("1000 vues story = 80 pts", pts(1000, "story") === 80, `obtenu ${pts(1000, "story")}`);
check("500 vues video = 13 pts (arrondi)", pts(500, "video") === 13, `obtenu ${pts(500, "video")}`);
check("4000 vues reel = 100 pts", pts(4000, "reel") === 100, `obtenu ${pts(4000, "reel")}`);
check("reel suit le taux video", pts(2000, "reel") === pts(2000, "video"));
check("post suit le taux video", pts(2000, "post") === pts(2000, "video"));
check("la story est mieux payee a audience egale", pts(3000, "story") > pts(3000, "video"));

console.log("\nPrime virale (seuil " + VIRAL_THRESHOLD_VIEWS + " vues)");
check("juste sous le seuil : pas de prime", pts(9999, "video") === 250, `obtenu ${pts(9999, "video")}`);
check("au seuil exact : prime versee", pts(10000, "video") === 250 + 90, `obtenu ${pts(10000, "video")}`);
check("bien au-dessus : prime versee une seule fois", pts(50000, "video") === 1250 + 90, `obtenu ${pts(50000, "video")}`);
check("la prime n'est pas proportionnelle", computePoints({ views: 100000, contentType: "video", rules }).detail.bonus === 90);

console.log("\nCas limites");
check("0 vue = 0 pt", pts(0, "video") === 0);
check("vues negatives ramenees a 0", pts(-500, "video") === 0);
check("valeur non numerique = 0 pt", pts("abc", "video") === 0);
check("valeur vide = 0 pt", pts(null, "video") === 0);
check("decimales arrondies", pts(1500.7, "video") === 38, `obtenu ${pts(1500.7, "video")}`);
check("bareme absent = 0 pt", computePoints({ views: 5000, contentType: "video", rules: {} }).points === 0);
check("bareme null ne plante pas", computePoints({ views: 5000, contentType: "video", rules: null }).points === 0);
check("prime absente du bareme", computePoints({ views: 50000, contentType: "video", rules: { videoViewsPerThousand: 25 } }).points === 1250);

console.log("\nExplication affichee au staff");
const d = describePoints({ views: 12000, contentType: "video", rules });
check("contient le calcul", d.includes("300"), d);
check("mentionne la prime", d.includes("90"), d);
check("annonce le total", d.includes("390"), d);
check("bareme non configure signale", describePoints({ views: 1000, contentType: "video", rules: {} }).includes("non configure"));

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
