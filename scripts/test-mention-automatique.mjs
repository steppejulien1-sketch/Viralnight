// Tests du pont entre les deux bases : la decision de crediter (ou non) des
// points a partir d'une mention Instagram. Aucun appel reseau -- c'est tout
// l'interet d'avoir sorti cette logique de api/instagram.js.

const { deciderCreditMention, normaliserHandle, RAISONS, FORFAIT_STORY_DEFAUT } = await import(
  "../lib/points/mentionAutomatique.js"
);

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

const MENTION = { mediaId: "media-1", igUserId: "ig-42" };
const COMPLET = {
  mention: MENTION,
  etablissementId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  clubId: "ff1abccb-adeb-496a-a8db-16706a9d467b",
  clubbeurId: "9a1b2c3d-0000-4000-8000-000000000001",
};

console.log("\nCas nominal");
const ok = deciderCreditMention(COMPLET);
check("credite", ok.crediter === true, JSON.stringify(ok));
check("forfait par defaut", ok.points === FORFAIT_STORY_DEFAUT, String(ok.points));
check("pas de raison de refus", ok.raison === null);
check("porte le media", ok.mediaId === "media-1");

console.log("\nChaque maillon manquant a son propre motif");
check("mention vide", deciderCreditMention({ ...COMPLET, mention: null }).raison === RAISONS.MENTION_INCOMPLETE);
check("mention sans media", deciderCreditMention({ ...COMPLET, mention: { igUserId: "ig-42" } }).raison === RAISONS.MENTION_INCOMPLETE);
check("etablissement inconnu", deciderCreditMention({ ...COMPLET, etablissementId: null }).raison === RAISONS.ETABLISSEMENT_INCONNU);
check("club non relie", deciderCreditMention({ ...COMPLET, clubId: null }).raison === RAISONS.CLUB_NON_RELIE);
check("auteur inconnu", deciderCreditMention({ ...COMPLET, clubbeurId: null }).raison === RAISONS.AUTEUR_INCONNU);
check("deja credite", deciderCreditMention({ ...COMPLET, dejaCredite: true }).raison === RAISONS.DEJA_CREDITE);

console.log("\nUn refus ne credite jamais");
for (const variante of [
  { ...COMPLET, etablissementId: null },
  { ...COMPLET, clubId: null },
  { ...COMPLET, clubbeurId: null },
  { ...COMPLET, dejaCredite: true },
]) {
  const d = deciderCreditMention(variante);
  if (d.crediter !== false || d.points !== 0) { failed++; console.log("  FAIL refus qui credite: " + JSON.stringify(d)); }
}
check("tous les refus sont a 0 point", true);

console.log("\nFenetre de fraicheur");
const MAINTENANT = Date.parse("2026-08-30T23:00:00Z");
const recente = deciderCreditMention({
  ...COMPLET,
  mention: { ...MENTION, publieeA: "2026-08-30T21:00:00Z" },
  maintenant: MAINTENANT,
});
check("2 h : creditee", recente.crediter === true);

const vieille = deciderCreditMention({
  ...COMPLET,
  mention: { ...MENTION, publieeA: "2026-08-27T21:00:00Z" },
  maintenant: MAINTENANT,
});
check("3 jours : refusee", vieille.raison === RAISONS.TROP_ANCIENNE, JSON.stringify(vieille));

const limite = deciderCreditMention({
  ...COMPLET,
  mention: { ...MENTION, publieeA: "2026-08-29T23:00:00Z" },
  maintenant: MAINTENANT,
});
check("pile 24 h : encore creditee", limite.crediter === true);

// Une date absente ne doit pas priver le clubbeur : Meta ne la fournit pas
// systematiquement, et il n'y est pour rien.
check("date absente : creditee quand meme", deciderCreditMention(COMPLET).crediter === true);
check("date illisible : creditee quand meme",
  deciderCreditMention({ ...COMPLET, mention: { ...MENTION, publieeA: "pas-une-date" } }).crediter === true);

console.log("\nForfait configurable");
check("forfait a 80", deciderCreditMention({ ...COMPLET, forfaitStory: 80 }).points === 80);
check("forfait a 0 accepte", deciderCreditMention({ ...COMPLET, forfaitStory: 0 }).points === 0);
check("forfait negatif ramene a 0", deciderCreditMention({ ...COMPLET, forfaitStory: -10 }).points === 0);
check("forfait decimal arrondi", deciderCreditMention({ ...COMPLET, forfaitStory: 49.6 }).points === 50);

console.log("\nNormalisation du pseudo");
check("casse ignoree", normaliserHandle("Julien.Stpt") === "julien.stpt");
check("arobase retiree", normaliserHandle("@ilija_jvn") === "ilija_jvn");
check("espaces retires", normaliserHandle("  julien.stpt  ") === "julien.stpt");
check("vide -> null", normaliserHandle("   ") === null);
check("non-chaine -> null", normaliserHandle(undefined) === null);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
