// Tests de l'attribution du reach aux recompenses.
// Invariant : le reach d'un client est REPARTI entre les recompenses qu'il a reclamees,
// jamais duplique. Sinon les recompenses les plus reclamees paraissent toujours
// les plus performantes, quel que soit leur effet reel.

import { analyzeRewards } from "../lib/analytics/rewardAnalytics.js";

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}\n       attendu: ${JSON.stringify(expected)}\n       obtenu : ${JSON.stringify(actual)}`);
  }
}

const rewards = [
  { id: "r1", title: "Shot offert", points_required: 70 },
  { id: "r2", title: "Entree gratuite", points_required: 240 },
];

console.log("\nanalyzeRewards — pas de double comptage");

// Un seul client, 10 000 vues, qui a reclame LES DEUX recompenses.
// Son reach doit etre reparti 5000/5000, et non compte 10 000 deux fois.
const shared = analyzeRewards({
  rewards,
  redemptions: [
    { reward_id: "r1", customer_id: "c1" },
    { reward_id: "r2", customer_id: "c1" },
  ],
  submissions: [{ customer_id: "c1", views_count: 10000 }],
});

check("reach reparti sur r1", shared.perReward.find((r) => r.rewardId === "r1").totalReach, 5000);
check("reach reparti sur r2", shared.perReward.find((r) => r.rewardId === "r2").totalReach, 5000);
check(
  "somme des reach = reach reel du client",
  shared.perReward.reduce((sum, r) => sum + r.totalReach, 0),
  10000,
);

console.log("\nanalyzeRewards — client fidele a une seule recompense");

// Client qui n'a reclame qu'une recompense : tout son reach lui revient.
const exclusive = analyzeRewards({
  rewards,
  redemptions: [{ reward_id: "r1", customer_id: "c1" }],
  submissions: [{ customer_id: "c1", views_count: 8000 }],
});

check("reach entier sur r1", exclusive.perReward.find((r) => r.rewardId === "r1").totalReach, 8000);
check("aucun reach sur r2", exclusive.perReward.find((r) => r.rewardId === "r2").totalReach, 0);

console.log("\nanalyzeRewards — une recompense populaire ne gagne pas mecaniquement");

// r1 est reclamee par 3 clients peu viraux (1000 vues chacun),
// r2 par 1 client tres viral (9000 vues). r2 doit avoir le meilleur reach moyen.
const popularity = analyzeRewards({
  rewards,
  redemptions: [
    { reward_id: "r1", customer_id: "a" },
    { reward_id: "r1", customer_id: "b" },
    { reward_id: "r1", customer_id: "c" },
    { reward_id: "r2", customer_id: "d" },
  ],
  submissions: [
    { customer_id: "a", views_count: 1000 },
    { customer_id: "b", views_count: 1000 },
    { customer_id: "c", views_count: 1000 },
    { customer_id: "d", views_count: 9000 },
  ],
});

check("r1 reach moyen = 1000", popularity.perReward.find((r) => r.rewardId === "r1").avgReach, 1000);
check("r2 reach moyen = 9000", popularity.perReward.find((r) => r.rewardId === "r2").avgReach, 9000);

console.log("\nanalyzeRewards — refus de conclure sur un echantillon trop faible");

// Avec 3 et 1 reclamations, l'ecart de reach n'est pas significatif : le moteur ne doit
// designer aucune "meilleure" recompense plutot que d'affirmer du bruit.
check("aucun classement de reach sur petits echantillons", popularity.rankedByReach.best, null);
check("les donnees restent affichables", popularity.perReward.length, 2);
check(
  "les recompenses sont marquees insuffisantes",
  popularity.perReward.map((r) => r.hasEnoughData),
  [false, false],
);

// Au-dela du seuil (10 reclamations), la comparaison redevient possible.
const significant = analyzeRewards({
  rewards,
  redemptions: [
    ...Array.from({ length: 12 }, (_, i) => ({ reward_id: "r1", customer_id: `a${i}` })),
    ...Array.from({ length: 12 }, (_, i) => ({ reward_id: "r2", customer_id: `b${i}` })),
  ],
  submissions: [
    ...Array.from({ length: 12 }, (_, i) => ({ customer_id: `a${i}`, views_count: 1000 })),
    ...Array.from({ length: 12 }, (_, i) => ({ customer_id: `b${i}`, views_count: 5000 })),
  ],
});

check("classement possible au-dela du seuil", significant.rankedByReach.best.rewardId, "r2");
check("les deux recompenses sont comparables", significant.perReward.map((r) => r.hasEnoughData), [true, true]);

console.log("\nanalyzeRewards — preference = ce que les clients choisissent");

// r1 est choisie deux fois plus souvent que r2 : c'est elle la preferee,
// independamment du reach genere.
const preference = analyzeRewards({
  rewards,
  redemptions: [
    ...Array.from({ length: 20 }, (_, i) => ({ reward_id: "r1", customer_id: `a${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ reward_id: "r2", customer_id: `b${i}` })),
  ],
  submissions: [],
});

check("r1 est la preferee", preference.mostPreferred.rewardId, "r1");
check("r1 represente 67% des reclamations", Math.round(preference.mostPreferred.claimShare * 100), 67);
check("r2 est la moins choisie", preference.leastPreferred.rewardId, "r2");

console.log("\nanalyzeRewards — cas vides");

const empty = analyzeRewards({ rewards, redemptions: [], submissions: [] });
check("aucune reclamation", empty.perReward.map((r) => r.totalReach), [0, 0]);
check("cout/visibilite indefini", empty.perReward.map((r) => r.costPerThousandReach), [null, null]);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
