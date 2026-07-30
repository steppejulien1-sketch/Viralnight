// Tests du moteur de questions-reponses.
// Invariant : chaque chiffre de la reponse vient de l'analyse, et chaque reponse
// pertinente est accompagnee d'au moins un bloc de visualisation.

import { buildDemoDataset, buildMetricsMap } from "../demo-data.js";
import { runFullAnalysis } from "../lib/analytics/index.js";
import { generateRecommendations } from "../lib/rules/index.js";
import { answerQuestion, SUGGESTED_QUESTIONS } from "../lib/qa/answerQuestion.js";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

const dataset = buildDemoDataset();
const metricsByEventId = buildMetricsMap(dataset);
const event = dataset.events.at(-1);

const analysis = runFullAnalysis({
  eventId: event.id,
  events: [...dataset.events].reverse(),
  rewards: dataset.rewards,
  redemptions: dataset.redemptions.filter((r) => r.event_id === event.id),
  submissions: dataset.submissions.filter((s) => s.event_id === event.id),
  qrScans: dataset.qrScans.filter((s) => s.event_id === event.id),
  metricsByEventId,
  recentSubmissions: dataset.submissions.filter((s) => s.event_id !== event.id),
});

const context = { analysis, recommendations: generateRecommendations(analysis) };
const ask = (question) => answerQuestion(question, context);

console.log("\nDetection d'intention (formulations variees)");

const cases = [
  ["Quel DJ marche le mieux ?", "dj"],
  ["c'est qui le meilleur dj", "dj"],
  ["Quelle récompense les gens préfèrent ?", "reward"],
  ["les recompenses les plus prises", "reward"],
  ["À quelle heure ils postent leurs stories ?", "timing"],
  ["quand est ce qu'ils publient", "timing"],
  ["Qu'est-ce que je peux améliorer ?", "improve"],
  ["Pourquoi cette note ?", "score"],
  ["Est-ce que ça progresse ?", "trend"],
  ["combien de scans qr", "scans"],
  ["combien de vues", "reach"],
  ["mes clients fidèles", "customer"],
  ["tiktok ou instagram", "content"],
];

for (const [question, expectedIntent] of cases) {
  const result = ask(question);
  check(
    `"${question}" -> ${expectedIntent}`,
    result.intents.includes(expectedIntent),
    `intentions obtenues: ${JSON.stringify(result.intents)}`,
  );
}

console.log("\nLes reponses contiennent des chiffres et un graphique");

for (const question of SUGGESTED_QUESTIONS) {
  const result = ask(question);
  check(`"${question}" est traitee`, result.grounded);
  check(`"${question}" contient un chiffre`, /\d/.test(result.text), result.text.slice(0, 80));
  check(`"${question}" fournit un bloc visuel`, (result.blocks || []).length > 0);
}

console.log("\nCoherence des chiffres avec l'analyse");

const djAnswer = ask("quel dj");
check(
  "le meilleur DJ cite est celui de l'analyse",
  djAnswer.text.includes(analysis.djAnalytics.best.djName),
  djAnswer.text.slice(0, 100),
);

const rewardAnswer = ask("quelle recompense");
check(
  "la recompense preferee citee est celle de l'analyse",
  rewardAnswer.text.includes(analysis.rewardAnalytics.mostPreferred.title),
);

const scoreAnswer = ask("pourquoi cette note");
check(
  "la note citee correspond au viralScore",
  scoreAnswer.text.includes(String(Math.round(analysis.viralScore))),
);

const timingAnswer = ask("a quelle heure ils postent");
const peakLabel = `${String(analysis.timing.publicationPeakHour).padStart(2, "0")}h`;
check("le pic horaire cite correspond a l'analyse", timingAnswer.text.includes(peakLabel));

console.log("\nBlocs : structure exploitable par l'interface");

const hoursBlock = timingAnswer.blocks.find((block) => block.type === "hours");
check("le bloc horaire expose les deux series", Boolean(hoursBlock) && hoursBlock.items.every((i) => "publications" in i && "scans" in i));

const barsBlock = djAnswer.blocks.find((block) => block.type === "bars");
check("le bloc barres a un element mis en avant", Boolean(barsBlock) && barsBlock.items.some((i) => i.highlight));

const improveBlock = ask("que puis je ameliorer").blocks.find((block) => block.type === "ranked");
check("le bloc actions est trie par gain decroissant", Boolean(improveBlock) &&
  improveBlock.items.every((item, i, arr) => i === 0 || arr[i - 1].gain >= item.gain));

console.log("\nQuestions hors sujet et vides");

const offTopic = ask("quelle est la capitale du Japon");
check("question hors sujet : pas de reponse inventee", !offTopic.grounded);
check("question hors sujet : explique ce qu'il sait faire", offTopic.text.includes("DJs"));

const empty = ask("   ");
check("question vide : invite a poser une question", !empty.grounded && empty.blocks.length === 0);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
