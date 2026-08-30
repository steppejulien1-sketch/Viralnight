// Tests de la verification differee des stories : que fait-on des points
// d'une story qui a peut-etre ete supprimee. Aucun appel reseau.

const { deciderSortStory, echeancePoints, SORTS, DELAI_POINTS_HEURES } = await import(
  "../lib/points/verificationStory.js"
);

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

const MAINTENANT = Date.parse("2026-08-31T18:00:00Z");
const ECHUE = "2026-08-31T17:00:00Z";     // il y a une heure
const A_VENIR = "2026-08-31T23:00:00Z";   // dans cinq heures

console.log("\nAvant l'echeance, on ne touche a rien");
for (const etat of ["present", "absent", "indetermine"]) {
  const d = deciderSortStory({ etatMedia: etat, unlocksAt: A_VENIR, maintenant: MAINTENANT });
  check(`${etat} -> attendre`, d.sort === SORTS.ATTENDRE, JSON.stringify(d));
}

console.log("\nA l'echeance");
const supprimee = deciderSortStory({ etatMedia: "absent", unlocksAt: ECHUE, maintenant: MAINTENANT });
check("story supprimee -> annuler", supprimee.sort === SORTS.ANNULER, JSON.stringify(supprimee));
check("motif explicite", supprimee.raison === "story_supprimee");

const vivante = deciderSortStory({ etatMedia: "present", unlocksAt: ECHUE, maintenant: MAINTENANT });
check("story en ligne -> garder", vivante.sort === SORTS.GARDER);

console.log("\nLe benefice du doute va au clubbeur");
const doute = deciderSortStory({ etatMedia: "indetermine", unlocksAt: ECHUE, maintenant: MAINTENANT });
check("verification impossible -> garder", doute.sort === SORTS.GARDER, JSON.stringify(doute));
check("et le motif le dit", doute.raison === "verification_impossible");
check("jamais d'annulation sur un doute", doute.sort !== SORTS.ANNULER);

console.log("\nUne seule chose annule des points");
const sorts = ["present", "absent", "indetermine"].map((e) =>
  deciderSortStory({ etatMedia: e, unlocksAt: ECHUE, maintenant: MAINTENANT }).sort);
check("exactement un cas sur trois annule", sorts.filter((s) => s === SORTS.ANNULER).length === 1,
  JSON.stringify(sorts));

console.log("\nEcheance calculee");
check("delai par defaut a 20 h", DELAI_POINTS_HEURES === 20, String(DELAI_POINTS_HEURES));
const e = echeancePoints("2026-08-31T02:00:00Z");
check("02h00 + 20 h = 22h00", e && e.toISOString() === "2026-08-31T22:00:00.000Z", e && e.toISOString());
check("delai personnalise", echeancePoints("2026-08-31T02:00:00Z", 6).toISOString() === "2026-08-31T08:00:00.000Z");
check("date illisible -> null", echeancePoints("pas-une-date") === null);

console.log("\nEcheance absente : on ne bloque pas indefiniment");
const sansEcheance = deciderSortStory({ etatMedia: "absent", unlocksAt: null, maintenant: MAINTENANT });
check("unlocksAt null -> la decision se prend quand meme", sansEcheance.sort === SORTS.ANNULER,
  JSON.stringify(sansEcheance));

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
