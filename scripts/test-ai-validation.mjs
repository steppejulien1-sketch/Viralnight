// Tests de la validation anti-hallucination.
// Invariant teste : le LLM reformule mais n'introduit jamais un chiffre absent de la source.

import { validateAiResponse } from "../lib/ai/responseSchema.js";

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}\n       attendu valid=${expected}, obtenu valid=${actual}`);
  }
}

const recommendations = [
  {
    id: "reward-reach-gap-20",
    category: "reward",
    message: "Entree gratuite genere 37% de reach supplementaire par rapport a Shot offert.",
    estimatedGain: 37,
    priority: "high",
  },
  {
    id: "timing-bonus-hour",
    category: "timing",
    message: "Lancer le bonus x2 vers 22h maximiserait la reactivite avant le pic de scans.",
    estimatedGain: 18,
    priority: "high",
  },
];

function response(recommendationTexts) {
  return { headline: "Bonne soiree", summary: "Resume neutre sans chiffre.", recommendationTexts };
}

console.log("\nvalidateAiResponse — reformulations legitimes");

check(
  "reformulation avec les memes chiffres",
  validateAiResponse(
    response([{ id: "reward-reach-gap-20", text: "L'entree gratuite surperforme le shot de 37%." }]),
    recommendations,
  ).valid,
  true,
);

check(
  "reformulation sans aucun chiffre",
  validateAiResponse(
    response([{ id: "reward-reach-gap-20", text: "L'entree gratuite est nettement plus performante." }]),
    recommendations,
  ).valid,
  true,
);

check(
  "heure reprise de la source",
  validateAiResponse(
    response([{ id: "timing-bonus-hour", text: "Declenchez le bonus a 22h pour maximiser l'impact." }]),
    recommendations,
  ).valid,
  true,
);

console.log("\nvalidateAiResponse — hallucinations bloquees");

check(
  "chiffre invente (87% absent de la source)",
  validateAiResponse(
    response([{ id: "reward-reach-gap-20", text: "L'entree gratuite genere 87% de reach en plus." }]),
    recommendations,
  ).valid,
  false,
);

check(
  "heure inventee (2h absent de la source)",
  validateAiResponse(
    response([{ id: "timing-bonus-hour", text: "Lancez le bonus a 2h du matin." }]),
    recommendations,
  ).valid,
  false,
);

check(
  "recommandation inventee de toutes pieces",
  validateAiResponse(
    response([{ id: "regle-qui-nexiste-pas", text: "Changez de DJ." }]),
    recommendations,
  ).valid,
  false,
);

console.log("\nvalidateAiResponse — reponses malformees");

check("reponse nulle", validateAiResponse(null, recommendations).valid, false);
check("headline manquant", validateAiResponse({ summary: "x", recommendationTexts: [] }, recommendations).valid, false);
check(
  "texte vide",
  validateAiResponse(response([{ id: "timing-bonus-hour", text: "   " }]), recommendations).valid,
  false,
);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
