// Tests des fonctions pures de l'import Google (aucun appel reseau).

import {
  parseGoogleUrl,
  periodsToOpeningHours,
  parseDisplayTime,
  scrapeOpeningHoursFromHtml,
} from "../lib/google/openingHours.js";

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

console.log("\nparseGoogleUrl");

check(
  "URL /maps/place classique",
  parseGoogleUrl("https://www.google.com/maps/place/Mirage+Club+Brussels/@50.83,4.35,17z"),
  { placeId: null, query: "Mirage Club Brussels" },
);

check(
  "URL avec place_id",
  parseGoogleUrl("https://www.google.com/maps/search/?api=1&place_id=ChIJN1t_tDeuEmsRUsoyG83frY4"),
  { placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", query: null },
);

check(
  "place_id dans le parametre q",
  parseGoogleUrl("https://www.google.com/maps?q=place_id:ChIJabc123"),
  { placeId: "ChIJabc123", query: null },
);

check(
  "URL avec accents encodes",
  parseGoogleUrl("https://www.google.com/maps/place/Caf%C3%A9+Central/@50.8,4.3,17z"),
  { placeId: null, query: "Café Central" },
);

check("URL invalide", parseGoogleUrl("pas une url"), { placeId: null, query: null });

console.log("\nperiodsToOpeningHours — convention Google = convention Postgres (0=dimanche)");

// Club ouvert vendredi 22h -> samedi 06h, et samedi 22h -> dimanche 06h.
const periods = [
  { open: { day: 5, hour: 22, minute: 0 }, close: { day: 6, hour: 6, minute: 0 } },
  { open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 6, minute: 0 } },
];
const converted = periodsToOpeningHours(periods);

check("vendredi ouvert 22:00-06:00", converted.find((h) => h.weekday === 5), {
  weekday: 5,
  isOpen: true,
  opensAt: "22:00",
  closesAt: "06:00",
});
check("samedi ouvert 22:00-06:00", converted.find((h) => h.weekday === 6), {
  weekday: 6,
  isOpen: true,
  opensAt: "22:00",
  closesAt: "06:00",
});
check("lundi ferme", converted.find((h) => h.weekday === 1), {
  weekday: 1,
  isOpen: false,
  opensAt: null,
  closesAt: null,
});
check("les 7 jours sont presents", converted.length, 7);

console.log("\nperiodsToOpeningHours — plusieurs plages le meme jour");

// Service de midi + soiree le vendredi : on doit retenir la soiree.
const doublePeriods = [
  { open: { day: 5, hour: 12, minute: 0 }, close: { day: 5, hour: 15, minute: 0 } },
  { open: { day: 5, hour: 22, minute: 30 }, close: { day: 6, hour: 6, minute: 0 } },
];
check("la plage du soir est retenue", periodsToOpeningHours(doublePeriods).find((h) => h.weekday === 5), {
  weekday: 5,
  isOpen: true,
  opensAt: "22:30",
  closesAt: "06:00",
});

console.log("\nperiodsToOpeningHours — ouverture 24h (pas de fermeture)");
check("ouvert en continu", periodsToOpeningHours([{ open: { day: 6, hour: 0, minute: 0 } }]).find((h) => h.weekday === 6), {
  weekday: 6,
  isOpen: true,
  opensAt: "00:00",
  closesAt: "00:00",
});

console.log("\nparseDisplayTime");
check("format 12h PM", parseDisplayTime("10 PM"), "22:00");
check("format 12h AM", parseDisplayTime("6 AM"), "06:00");
check("format 12h avec minutes", parseDisplayTime("10:30 PM"), "22:30");
check("minuit en 12h", parseDisplayTime("12 AM"), "00:00");
check("midi en 12h", parseDisplayTime("12 PM"), "12:00");
check("format 24h", parseDisplayTime("22:00"), "22:00");
check("format francais avec h", parseDisplayTime("22h30"), "22:30");
check("texte non horaire", parseDisplayTime("bientot"), null);

console.log("\nscrapeOpeningHoursFromHtml");

const html = `garbage ["Vendredi",["22:00–06:00"]] more ["Samedi",["22:00–06:00"]] ["Lundi",["Fermé"]]`;
const scraped = scrapeOpeningHoursFromHtml(html);
check("vendredi extrait", scraped.find((h) => h.weekday === 5), {
  weekday: 5,
  isOpen: true,
  opensAt: "22:00",
  closesAt: "06:00",
});
check("lundi ferme extrait", scraped.find((h) => h.weekday === 1), {
  weekday: 1,
  isOpen: false,
  opensAt: null,
  closesAt: null,
});

const htmlEn = `["Friday",["10 PM–6 AM"]] ["Saturday",["Open 24 hours"]]`;
const scrapedEn = scrapeOpeningHoursFromHtml(htmlEn);
check("format anglais 12h", scrapedEn.find((h) => h.weekday === 5), {
  weekday: 5,
  isOpen: true,
  opensAt: "22:00",
  closesAt: "06:00",
});
check("ouvert 24h en anglais", scrapedEn.find((h) => h.weekday === 6), {
  weekday: 6,
  isOpen: true,
  opensAt: "00:00",
  closesAt: "00:00",
});

check("HTML sans horaires", scrapeOpeningHoursFromHtml("<html>rien</html>"), null);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
