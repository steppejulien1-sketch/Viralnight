// Tests de la resolution de nuit avec horaires par jour.
// Cette logique doit rester identique a la fonction SQL public.resolve_event_night() :
// toute divergence casserait le rattachement des publications a leur soiree.

import {
  resolveEventNight,
  listUpcomingNights,
  buildEventName,
  defaultOpeningHours,
} from "../lib/scheduling/nightDate.js";

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

const TZ = "Europe/Brussels";

function hours(overrides) {
  const base = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    isOpen: false,
    opensAt: null,
    closesAt: null,
  }));
  for (const [weekday, value] of Object.entries(overrides)) {
    base[Number(weekday)] = { weekday: Number(weekday), isOpen: true, ...value };
  }
  return base;
}

// Club classique : vendredi et samedi, 22h -> 06h.
const CLUB = hours({
  5: { opensAt: "22:00", closesAt: "06:00" },
  6: { opensAt: "22:00", closesAt: "06:00" },
});

console.log("\nresolveEventNight — club vendredi/samedi 22h-06h");

// Vendredi 31 juillet 2026, 23:00 Bruxelles (= 21:00 UTC en ete).
check("23h vendredi -> nuit du vendredi", resolveEventNight("2026-07-31T21:00:00Z", CLUB, TZ), "2026-07-31");

// Samedi 1er aout 02:00 Bruxelles -> encore la soiree du vendredi.
check("02h samedi -> nuit du vendredi", resolveEventNight("2026-08-01T00:00:00Z", CLUB, TZ), "2026-07-31");

// Samedi 05:59 -> encore vendredi.
check("05h59 samedi -> nuit du vendredi", resolveEventNight("2026-08-01T03:59:00Z", CLUB, TZ), "2026-07-31");

// Samedi 06:00 -> hors plage (le club rouvre a 22h).
check("06h00 samedi -> hors ouverture", resolveEventNight("2026-08-01T04:00:00Z", CLUB, TZ), null);

// Samedi 23:00 -> soiree du samedi.
check("23h samedi -> nuit du samedi", resolveEventNight("2026-08-01T21:00:00Z", CLUB, TZ), "2026-08-01");

// Mercredi 23:00 -> club ferme, aucune soiree.
check("23h mercredi -> ferme", resolveEventNight("2026-07-29T21:00:00Z", CLUB, TZ), null);

// Vendredi 18:00 -> avant l'ouverture.
check("18h vendredi -> avant ouverture", resolveEventNight("2026-07-31T16:00:00Z", CLUB, TZ), null);

console.log("\nresolveEventNight — horaires differents selon le jour");

// Le cas que le modele par jour debloque : vendredi soir 22h-06h,
// dimanche apres-midi 15h-23h. Sans horaire par jour, impossible a distinguer.
const MIXTE = hours({
  5: { opensAt: "22:00", closesAt: "06:00" },
  0: { opensAt: "15:00", closesAt: "23:00" },
});

// Dimanche 2 aout 17:00 Bruxelles -> soiree du dimanche (pas de passage de minuit).
check("dimanche 17h -> nuit du dimanche", resolveEventNight("2026-08-02T15:00:00Z", MIXTE, TZ), "2026-08-02");

// Dimanche 22:59 -> encore dans la plage du dimanche.
check("dimanche 22h59 -> nuit du dimanche", resolveEventNight("2026-08-02T20:59:00Z", MIXTE, TZ), "2026-08-02");

// Dimanche 23:30 -> apres la fermeture du dimanche, aucune soiree.
check("dimanche 23h30 -> hors ouverture", resolveEventNight("2026-08-02T21:30:00Z", MIXTE, TZ), null);

// Samedi 02:00 -> appartient a la soiree du vendredi qui traverse minuit.
check("samedi 02h -> nuit du vendredi", resolveEventNight("2026-08-01T00:00:00Z", MIXTE, TZ), "2026-07-31");

console.log("\nresolveEventNight — fuseaux et heure d'ete");

// Meme instant, club a Montreal : 23:30 UTC = 19:30 le 31/07 a Montreal -> hors plage 22h-06h.
check("Montreal 19h30 -> avant ouverture", resolveEventNight("2026-07-31T23:30:00Z", CLUB, "America/Montreal"), null);

// 03:30 UTC le 01/08 = 23:30 le 31/07 a Montreal -> soiree du vendredi.
check("Montreal 23h30 -> nuit du vendredi", resolveEventNight("2026-08-01T03:30:00Z", CLUB, "America/Montreal"), "2026-07-31");

// Nuit du passage a l'heure d'hiver : samedi 24/10 -> dimanche 25/10 2026.
check("nuit du changement d'heure", resolveEventNight("2026-10-25T02:30:00Z", CLUB, TZ), "2026-10-24");

console.log("\nresolveEventNight — ouverture 24h et cas limites");

// Club ouvert du jeudi 23h au vendredi 23h (fermeture > 24h apres ouverture impossible :
// closes_at 23:00 > opens_at 22:00 signifie une plage dans la meme journee).
const SOIREE_COURTE = hours({ 4: { opensAt: "20:00", closesAt: "23:00" } });
check("jeudi 21h dans plage courte", resolveEventNight("2026-07-30T19:00:00Z", SOIREE_COURTE, TZ), "2026-07-30");
check("jeudi 23h30 apres fermeture", resolveEventNight("2026-07-30T21:30:00Z", SOIREE_COURTE, TZ), null);

// Aucun jour ouvert.
check("aucun jour ouvert", resolveEventNight("2026-07-31T21:00:00Z", hours({}), TZ), null);

console.log("\nlistUpcomingNights");

// Depuis mercredi 29/07 sur 7 jours : vendredi 31/07 et samedi 01/08.
check("prochaines nuits sur 7 jours", listUpcomingNights(CLUB, 7, new Date("2026-07-29T12:00:00Z")), [
  "2026-07-31",
  "2026-08-01",
]);

console.log("\ndefaultOpeningHours");
const defaults = defaultOpeningHours();
check("vendredi ouvert par defaut", defaults.find((h) => h.weekday === 5).isOpen, true);
check("lundi ferme par defaut", defaults.find((h) => h.weekday === 1).isOpen, false);

console.log("\nbuildEventName");
check("template par defaut", buildEventName("Soiree du {date}", "2026-07-31"), "Soiree du 31/07/2026");
check("template personnalise", buildEventName("{date} — Club Night", "2026-08-01"), "01/08/2026 — Club Night");

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
