// Resolution de la "nuit" a laquelle appartient un instant, selon les horaires du jour.
//
// Miroir exact de la fonction SQL public.resolve_event_night(). Les deux doivent rester
// synchronisees : le SQL sert aux triggers (insertion), le JS sert au script de
// pre-creation, a l'import Google et a l'affichage cote dashboard.
//
// Principe : une soiree peut traverser minuit. Pour un instant donne, on teste les deux
// nuits candidates (la veille puis le jour meme) et on retient celle dont la plage
// d'ouverture contient l'instant. Une publication a 02h le samedi tombe dans la plage
// "vendredi 22h -> samedi 06h" : elle appartient donc a la soiree du vendredi.

export const DEFAULT_TIMEZONE = "Europe/Brussels";
export const DEFAULT_EVENT_NAME_TEMPLATE = "Soiree du {date}";

const WEEKDAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Semaine affichee du lundi au dimanche, valeurs en convention Postgres dow (0=dimanche).
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Horaires par defaut : vendredi et samedi, 22h -> 06h. */
export function defaultOpeningHours() {
  return WEEKDAY_DISPLAY_ORDER.map((weekday) => ({
    weekday,
    isOpen: weekday === 5 || weekday === 6,
    opensAt: "22:00",
    closesAt: "06:00",
  }));
}

const MINUTES_PER_DAY = 1440;

function parseTimeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = String(time).split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Composantes date/heure "murales" dans un fuseau donne.
 * On passe par Intl plutot qu'un decalage fixe pour gerer l'heure d'ete.
 */
function getWallClockParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24, // Intl peut rendre "24" pour minuit
    minute: Number(parts.minute),
  };
}

/** Index de jour depuis l'epoch, pour faire de l'arithmetique de dates sans fuseau. */
function toDayIndex(year, month, day) {
  return Date.UTC(year, month - 1, day) / 86400000;
}

function dayIndexToIso(dayIndex) {
  const date = new Date(dayIndex * 86400000);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekdayOfDayIndex(dayIndex) {
  return new Date(dayIndex * 86400000).getUTCDay();
}

function normalizeHours(openingHours) {
  const byWeekday = new Map();
  for (const entry of openingHours || []) {
    byWeekday.set(Number(entry.weekday), {
      weekday: Number(entry.weekday),
      isOpen: Boolean(entry.isOpen),
      opensAt: entry.opensAt,
      closesAt: entry.closesAt,
    });
  }
  return byWeekday;
}

/**
 * Retourne la date de soiree (YYYY-MM-DD) a laquelle appartient un instant,
 * ou null si l'instant tombe en dehors de toute plage d'ouverture.
 *
 * @param {Date|string|number} timestamp
 * @param {Array<{weekday:number,isOpen:boolean,opensAt:string,closesAt:string}>} openingHours
 * @param {string} timezone
 * @returns {string|null}
 */
export function resolveEventNight(timestamp, openingHours, timezone = DEFAULT_TIMEZONE) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const wall = getWallClockParts(date, timezone);
  const byWeekday = normalizeHours(openingHours);

  const localDayIndex = toDayIndex(wall.year, wall.month, wall.day);
  const localAbsoluteMinutes = localDayIndex * MINUTES_PER_DAY + wall.hour * 60 + wall.minute;

  // La veille est testee en premier : une soiree qui traverse minuit prime sur
  // une eventuelle ouverture matinale du jour meme.
  for (const offset of [-1, 0]) {
    const candidateDayIndex = localDayIndex + offset;
    const hours = byWeekday.get(weekdayOfDayIndex(candidateDayIndex));

    if (!hours?.isOpen) continue;

    const opensMinutes = parseTimeToMinutes(hours.opensAt);
    const closesMinutes = parseTimeToMinutes(hours.closesAt);
    if (opensMinutes === null || closesMinutes === null) continue;

    const start = candidateDayIndex * MINUTES_PER_DAY + opensMinutes;
    // Fermeture <= ouverture : la plage se termine le lendemain.
    const end =
      closesMinutes <= opensMinutes
        ? (candidateDayIndex + 1) * MINUTES_PER_DAY + closesMinutes
        : candidateDayIndex * MINUTES_PER_DAY + closesMinutes;

    if (localAbsoluteMinutes >= start && localAbsoluteMinutes < end) {
      return dayIndexToIso(candidateDayIndex);
    }
  }

  return null;
}

/**
 * Liste les dates de soiree a venir sur une fenetre glissante.
 * @returns {string[]} dates YYYY-MM-DD
 */
export function listUpcomingNights(openingHours, daysAhead = 14, from = new Date()) {
  const byWeekday = normalizeHours(openingHours);
  const startIndex = toDayIndex(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate());
  const nights = [];

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const dayIndex = startIndex + offset;
    if (byWeekday.get(weekdayOfDayIndex(dayIndex))?.isOpen) nights.push(dayIndexToIso(dayIndex));
  }

  return nights;
}

export function buildEventName(template, isoDate) {
  const [year, month, day] = isoDate.split("-");
  return String(template || DEFAULT_EVENT_NAME_TEMPLATE).replace("{date}", `${day}/${month}/${year}`);
}

export function weekdayLabel(weekday) {
  return WEEKDAY_LABELS[weekday] ?? String(weekday);
}

/** Resume lisible d'un horaire, ex: "22:00 → 06:00". */
export function formatHoursRange(hours) {
  if (!hours?.isOpen) return "Ferme";
  return `${String(hours.opensAt).slice(0, 5)} → ${String(hours.closesAt).slice(0, 5)}`;
}

export { WEEKDAY_LABELS };
