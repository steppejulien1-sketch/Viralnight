// Recalcule event_metrics pour toutes les soirees passees d'un establishment (ou tous
// les establishments si aucun id fourni). A executer apres chaque soiree (cron/manuel) :
// le dashboard Viral Intelligence lit ce cache plutot que de recalculer a chaque affichage.
//
// Usage: node scripts/recompute-event-metrics.js [establishmentId]

import { readFileSync } from "node:fs";
import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";
import { computeViralScore } from "../lib/analytics/viralScore.js";

loadEnvLocal();

// Ce script tourne en Node pur (pas de build Vite) : il faut donc charger .env.local
// manuellement plutot que de compter sur import.meta.env.
function loadEnvLocal() {
  try {
    const content = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([\w.-]+)\s*=\s*(.*)?$/);
      if (!match) continue;
      const [, key, value = ""] = match;
      if (!(key in process.env)) process.env[key] = value.trim();
    }
  } catch {
    // .env.local absent : on suppose que les variables sont deja dans l'environnement (ex: CI, Vercel).
  }
}

async function recomputeForEstablishment(supabase, establishmentId) {
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("event_date", { ascending: true });
  if (eventsError) throw eventsError;
  if (!events?.length) return;

  const eventIds = events.map((e) => e.id);

  const [{ data: submissions, error: subError }, { data: redemptions, error: redError }, { data: scans, error: scanError }] =
    await Promise.all([
      supabase.from("submissions").select("*").in("event_id", eventIds),
      supabase.from("reward_redemptions").select("*").in("event_id", eventIds),
      supabase.from("qr_scans").select("*").in("event_id", eventIds),
    ]);
  if (subError) throw subError;
  if (redError) throw redError;
  if (scanError) throw scanError;

  const historicalMetrics = [];

  for (const event of events) {
    const eventSubmissions = submissions.filter((s) => s.event_id === event.id);
    const eventRedemptions = redemptions.filter((r) => r.event_id === event.id);
    const eventScans = scans.filter((s) => s.event_id === event.id);

    const rawMetrics = {
      total_reach: eventSubmissions.reduce((sum, s) => sum + (s.views_count || 0), 0),
      stories_count: eventSubmissions.filter((s) => s.content_type === "story").length,
      reels_count: eventSubmissions.filter((s) => s.content_type === "reel").length,
      tiktoks_count: eventSubmissions.filter((s) => s.platform === "tiktok").length,
      points_distributed: eventSubmissions.reduce((sum, s) => sum + (s.points_awarded || 0), 0),
      rewards_claimed_count: eventRedemptions.length,
      scans_count: eventScans.length,
    };

    const previousMetrics = historicalMetrics.at(-1) || null;
    const recentMetrics = historicalMetrics.slice(-4);
    const avgReach = recentMetrics.length
      ? recentMetrics.reduce((s, m) => s + m.total_reach, 0) / recentMetrics.length
      : rawMetrics.total_reach;
    const growthPercent = previousMetrics && previousMetrics.total_reach > 0
      ? ((rawMetrics.total_reach - previousMetrics.total_reach) / previousMetrics.total_reach) * 100
      : 0;

    const bestSubmissionRatio = bestRatio(historicalMetrics, events, (m) => m.stories_count + m.reels_count + m.tiktoks_count);
    const bestClaimRatio = historicalMetrics.reduce(
      (best, m) => Math.max(best, m.scans_count > 0 ? m.rewards_claimed_count / m.scans_count : 0),
      0,
    );

    const { score, breakdown } = computeViralScore({
      currentMetrics: rawMetrics,
      avgReach,
      participantsCount: event.participants_count,
      bestSubmissionRatio: bestSubmissionRatio || 1,
      bestClaimRatio: bestClaimRatio || 1,
      growthPercent,
    });

    const { error: upsertError } = await supabase.from("event_metrics").upsert({
      event_id: event.id,
      ...rawMetrics,
      viral_score: score,
      score_breakdown: breakdown,
      computed_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;

    historicalMetrics.push(rawMetrics);
    console.log(`[recompute] ${event.name} (${event.event_date}) -> score ${score}`);
  }
}

function bestRatio(historicalMetrics, events, numeratorFn) {
  let best = 0;
  historicalMetrics.forEach((metrics, index) => {
    const participants = events[index]?.participants_count;
    if (!participants) return;
    const ratio = numeratorFn(metrics) / participants;
    if (ratio > best) best = ratio;
  });
  return best;
}

async function main() {
  const supabase = getSupabaseAdmin();
  const targetEstablishmentId = process.argv[2];

  const establishmentIds = targetEstablishmentId
    ? [targetEstablishmentId]
    : (await supabase.from("establishments").select("id")).data?.map((e) => e.id) || [];

  for (const establishmentId of establishmentIds) {
    await recomputeForEstablishment(supabase, establishmentId);
  }
}

main().catch((error) => {
  console.error("[recompute-event-metrics] echec", error);
  process.exit(1);
});
