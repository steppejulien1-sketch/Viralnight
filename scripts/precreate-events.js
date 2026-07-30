// Pre-cree les soirees a venir selon les jours d'ouverture de chaque establishment,
// puis recalcule les metriques des soirees passees.
//
// Les triggers SQL creent deja une soiree au premier scan/publication de la nuit.
// Ce script sert a ce que le gerant VOIE les prochaines dates dans son dashboard
// avant meme que la soiree commence, et a rattraper les nuits sans activite.
//
// Usage:
//   node scripts/precreate-events.js            -> tous les establishments, 14 jours
//   node scripts/precreate-events.js 30         -> tous les establishments, 30 jours
//   node scripts/precreate-events.js 14 <estId> -> un seul establishment
//
// A planifier une fois par jour (cron Vercel, GitHub Action, ou pg_cron cote Supabase
// en appelant directement select public.precreate_upcoming_events(14);).

import { readFileSync } from "node:fs";
import { getSupabaseAdmin } from "../lib/db/supabaseAdmin.js";
import { DEFAULT_SCHEDULE, listUpcomingNights, buildEventName } from "../lib/scheduling/nightDate.js";

loadEnvLocal();

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
    // .env.local absent : variables supposees deja presentes (CI, Vercel).
  }
}

function scheduleFromRow(row) {
  if (!row) return { ...DEFAULT_SCHEDULE };
  return {
    openingWeekdays: row.opening_weekdays || DEFAULT_SCHEDULE.openingWeekdays,
    closesAt: row.closes_at || DEFAULT_SCHEDULE.closesAt,
    timezone: row.timezone || DEFAULT_SCHEDULE.timezone,
    autoCreateEvents: row.auto_create_events ?? true,
    eventNameTemplate: row.event_name_template || DEFAULT_SCHEDULE.eventNameTemplate,
    defaultDjName: row.default_dj_name || null,
  };
}

async function precreateForEstablishment(supabase, establishmentId, scheduleRow, daysAhead) {
  const schedule = scheduleFromRow(scheduleRow);

  if (!schedule.autoCreateEvents) {
    console.log(`[precreate] ${establishmentId} : creation automatique desactivee, ignore.`);
    return 0;
  }

  const nights = listUpcomingNights(schedule.openingWeekdays, daysAhead);
  if (!nights.length) {
    console.log(`[precreate] ${establishmentId} : aucune nuit d'ouverture dans les ${daysAhead} prochains jours.`);
    return 0;
  }

  // upsert avec ignoreDuplicates : les soirees deja creees (manuellement ou par trigger)
  // ne sont jamais ecrasees, on ne veut pas perdre un DJ deja renseigne.
  const rows = nights.map((eventDate) => ({
    establishment_id: establishmentId,
    name: buildEventName(schedule.eventNameTemplate, eventDate),
    event_date: eventDate,
    dj_name: schedule.defaultDjName,
  }));

  const { data, error } = await supabase
    .from("events")
    .upsert(rows, { onConflict: "establishment_id,event_date", ignoreDuplicates: true })
    .select("id");

  if (error) throw error;

  const created = data?.length || 0;
  console.log(`[precreate] ${establishmentId} : ${created} soiree(s) creee(s) sur ${nights.length} nuit(s) d'ouverture.`);
  return created;
}

async function main() {
  const daysAhead = Number(process.argv[2]) || 14;
  const targetEstablishmentId = process.argv[3];

  const supabase = getSupabaseAdmin();

  const establishmentsQuery = supabase.from("establishments").select("id, name");
  const { data: establishments, error: estError } = targetEstablishmentId
    ? await establishmentsQuery.eq("id", targetEstablishmentId)
    : await establishmentsQuery;
  if (estError) throw estError;

  if (!establishments?.length) {
    console.log("[precreate] aucun establishment trouve.");
    return;
  }

  const { data: schedules, error: schedError } = await supabase.from("establishment_schedule").select("*");
  if (schedError) throw schedError;

  const scheduleByEstablishment = new Map((schedules || []).map((s) => [s.establishment_id, s]));

  let total = 0;
  for (const establishment of establishments) {
    total += await precreateForEstablishment(
      supabase,
      establishment.id,
      scheduleByEstablishment.get(establishment.id),
      daysAhead,
    );
  }

  console.log(`\n[precreate] termine : ${total} soiree(s) creee(s) au total.`);
}

main().catch((error) => {
  console.error("[precreate-events] echec", error);
  process.exit(1);
});
