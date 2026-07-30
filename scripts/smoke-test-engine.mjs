import { runFullAnalysis } from "../lib/analytics/index.js";
import { generateRecommendations } from "../lib/rules/index.js";

const events = [
  { id: "e1", establishment_id: "est1", name: "Soiree Halloween", event_date: "2026-07-25", dj_name: "DJ Martin", participants_count: 320 },
  { id: "e0", establishment_id: "est1", name: "Soiree precedente", event_date: "2026-07-18", dj_name: "DJ Alex", participants_count: 280 },
];

const rewards = [
  { id: "r1", title: "Entree gratuite", points_required: 240 },
  { id: "r2", title: "Shot offert", points_required: 70 },
];

const submissions = [
  { customer_id: "c1", event_id: "e1", platform: "tiktok", content_type: "reel", views_count: 12000, points_awarded: 100, submitted_at: "2026-07-26T00:15:00Z" },
  { customer_id: "c2", event_id: "e1", platform: "instagram", content_type: "story", views_count: 3000, points_awarded: 40, submitted_at: "2026-07-26T00:30:00Z" },
  { customer_id: "c3", event_id: "e1", platform: "instagram", content_type: "story", views_count: 1500, points_awarded: 30, submitted_at: "2026-07-25T23:10:00Z" },
];

const redemptions = [
  { reward_id: "r1", customer_id: "c1", event_id: "e1", redeemed_at: "2026-07-26T00:00:00Z" },
  { reward_id: "r2", customer_id: "c2", event_id: "e1", redeemed_at: "2026-07-26T00:45:00Z" },
];

const qrScans = [
  { customer_id: "c1", event_id: "e1", scanned_at: "2026-07-26T00:10:00Z" },
  { customer_id: "c2", event_id: "e1", scanned_at: "2026-07-26T00:40:00Z" },
  { customer_id: "c4", event_id: "e1", scanned_at: "2026-07-26T00:41:00Z" },
];

const metricsByEventId = new Map([
  ["e0", { total_reach: 8000, stories_count: 2, reels_count: 1, tiktoks_count: 1, points_distributed: 60, rewards_claimed_count: 1, scans_count: 4 }],
]);

const analysis = runFullAnalysis({
  eventId: "e1",
  events,
  rewards,
  redemptions,
  submissions,
  qrScans,
  metricsByEventId,
  recentSubmissions: [],
});

console.log("Viral Score:", analysis.viralScore, analysis.scoreBreakdown);
console.log("Best reward:", analysis.rewardAnalytics.rankedByReach.best?.title);
console.log("Best DJ:", analysis.djAnalytics.best);
console.log("Timing:", analysis.timing.publicationPeakHour, analysis.timing.scanPeakHour, analysis.timing.recommendedBonusHour);

const recommendations = generateRecommendations(analysis);
console.log(`\n${recommendations.length} recommandation(s):`);
for (const rec of recommendations) {
  console.log(`- [${rec.priority}] (+${rec.estimatedGain}%) ${rec.message}`);
}

if (!analysis.viralScore && analysis.viralScore !== 0) throw new Error("viralScore manquant");
if (typeof recommendations.length !== "number") throw new Error("recommendations invalides");
console.log("\nSmoke test OK.");
