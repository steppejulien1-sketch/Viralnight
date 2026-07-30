// Import des horaires d'ouverture depuis une fiche Google.
//
// Deux strategies, dans cet ordre :
//   1. Google Places API (New) si GOOGLE_PLACES_API_KEY est configure -> fiable, structure.
//   2. Lecture de la page Google Maps publique -> depannage sans cle, mais fragile
//      (Google change son HTML sans preavis). Le resultat indique toujours sa source
//      pour que l'interface puisse prevenir le gerant.
//
// Google et Postgres utilisent la meme convention de jour (0=dimanche ... 6=samedi),
// ce qui evite toute conversion.

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FETCH_TIMEOUT_MS = 8000;

const DAY_NAMES = {
  0: ["sunday", "dimanche", "dim"],
  1: ["monday", "lundi", "lun"],
  2: ["tuesday", "mardi", "mar"],
  3: ["wednesday", "mercredi", "mer"],
  4: ["thursday", "jeudi", "jeu"],
  5: ["friday", "vendredi", "ven"],
  6: ["saturday", "samedi", "sam"],
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function toTimeString(hour, minute = 0) {
  return `${pad(hour % 24)}:${pad(minute)}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Les liens partages (maps.app.goo.gl) sont des redirections : il faut les suivre
 * pour recuperer l'URL complete contenant le nom et les coordonnees du lieu.
 */
export async function expandGoogleUrl(url) {
  try {
    const response = await fetchWithTimeout(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 ViralNightSchedule/1.0" },
    });
    return response.url || url;
  } catch {
    return url;
  }
}

/**
 * Extrait de quoi identifier le lieu a partir d'une URL Google Maps.
 * @returns {{placeId: string|null, query: string|null}}
 */
export function parseGoogleUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { placeId: null, query: null };
  }

  const params = parsed.searchParams;
  const placeId = params.get("place_id") || params.get("placeid");
  if (placeId) return { placeId, query: null };

  // Format habituel : /maps/place/Nom+Du+Lieu/@lat,lng,...
  const placeMatch = parsed.pathname.match(/\/place\/([^/@]+)/);
  if (placeMatch) {
    const name = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim();
    if (name) return { placeId: null, query: name };
  }

  const queryParam = params.get("q") || params.get("query");
  if (queryParam) {
    const idMatch = queryParam.match(/place_id:([\w-]+)/);
    if (idMatch) return { placeId: idMatch[1], query: null };
    return { placeId: null, query: queryParam };
  }

  return { placeId: null, query: null };
}

/**
 * Convertit les periodes Google Places en horaires par jour ViralNight.
 *
 * Un club peut avoir plusieurs plages le meme jour (service de midi + soiree).
 * On retient la plage qui commence le plus tard : c'est la soiree, seule pertinente
 * pour ViralNight.
 */
export function periodsToOpeningHours(periods) {
  const byWeekday = new Map();

  for (const period of periods || []) {
    const open = period?.open;
    if (!open || typeof open.day !== "number") continue;

    const opensAt = toTimeString(open.hour || 0, open.minute || 0);
    // Absence de fermeture = ouvert en continu.
    const closesAt = period.close
      ? toTimeString(period.close.hour || 0, period.close.minute || 0)
      : opensAt;

    const existing = byWeekday.get(open.day);
    if (!existing || opensAt > existing.opensAt) {
      byWeekday.set(open.day, { weekday: open.day, isOpen: true, opensAt, closesAt });
    }
  }

  return [0, 1, 2, 3, 4, 5, 6].map(
    (weekday) => byWeekday.get(weekday) || { weekday, isOpen: false, opensAt: null, closesAt: null },
  );
}

/** Recupere les horaires via l'API Places officielle. */
async function fetchFromPlacesApi(apiKey, { placeId, query }) {
  const fieldMask = "places.id,places.displayName,places.formattedAddress,places.regularOpeningHours";
  const textQuery = placeId ? `place_id:${placeId}` : query;
  if (!textQuery) return null;

  const response = await fetchWithTimeout(PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 1 }),
  });

  if (!response.ok) {
    throw new Error(`Google Places a repondu ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const place = data.places?.[0];
  if (!place) return null;

  const periods = place.regularOpeningHours?.periods;
  if (!periods?.length) {
    return {
      source: "places-api",
      placeId: place.id || null,
      placeName: place.displayName?.text || null,
      address: place.formattedAddress || null,
      openingHours: null,
    };
  }

  return {
    source: "places-api",
    placeId: place.id || null,
    placeName: place.displayName?.text || null,
    address: place.formattedAddress || null,
    openingHours: periodsToOpeningHours(periods),
  };
}

/** Convertit "10 PM", "22:00", "10:30 PM" en "HH:MM". */
export function parseDisplayTime(raw) {
  const text = String(raw).trim().toLowerCase().replace(/ | /g, " ");

  const meridiem = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (meridiem) {
    let hour = Number(meridiem[1]) % 12;
    if (meridiem[3] === "pm") hour += 12;
    return toTimeString(hour, Number(meridiem[2] || 0));
  }

  const iso = text.match(/^(\d{1,2})[:h](\d{2})?$/);
  if (iso) return toTimeString(Number(iso[1]), Number(iso[2] || 0));

  return null;
}

/**
 * Lecture de secours depuis le HTML de Google Maps.
 * Google encode les horaires sous forme ["Vendredi",["22:00–06:00"]] dans un blob JSON.
 * Fragile par nature : on ne l'utilise que sans cle API.
 */
export function scrapeOpeningHoursFromHtml(html) {
  const byWeekday = new Map();

  // On cherche chaque nom de jour suivi d'une plage horaire dans un rayon proche.
  for (const [weekdayKey, names] of Object.entries(DAY_NAMES)) {
    const weekday = Number(weekdayKey);

    for (const name of names) {
      const pattern = new RegExp(
        `"${name}[^"]*"\\s*,\\s*\\[\\s*"([^"]{3,40})"`,
        "i",
      );
      const match = html.match(pattern);
      if (!match) continue;

      const rangeText = match[1];

      if (/closed|ferm/i.test(rangeText)) {
        byWeekday.set(weekday, { weekday, isOpen: false, opensAt: null, closesAt: null });
        break;
      }

      if (/24\s*h|24 hours/i.test(rangeText)) {
        byWeekday.set(weekday, { weekday, isOpen: true, opensAt: "00:00", closesAt: "00:00" });
        break;
      }

      // Separateurs possibles : tiret demi-cadratin, tiret simple, "to", "a".
      const parts = rangeText.split(/[–—-]|\bto\b|\ba\b/i).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;

      const opensAt = parseDisplayTime(parts[0]);
      const closesAt = parseDisplayTime(parts[1]);
      if (!opensAt || !closesAt) continue;

      byWeekday.set(weekday, { weekday, isOpen: true, opensAt, closesAt });
      break;
    }
  }

  if (!byWeekday.size) return null;

  return [0, 1, 2, 3, 4, 5, 6].map(
    (weekday) => byWeekday.get(weekday) || { weekday, isOpen: false, opensAt: null, closesAt: null },
  );
}

async function fetchFromMapsPage(url) {
  const response = await fetchWithTimeout(url, {
    redirect: "follow",
    headers: {
      // Google sert un HTML plus complet avec un User-Agent de navigateur classique.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) return null;

  const html = (await response.text()).slice(0, 1500000);
  const openingHours = scrapeOpeningHoursFromHtml(html);
  const nameMatch = html.match(/<meta content="([^"]+)" itemprop="name"/) || html.match(/<title>([^<]+)<\/title>/);

  return {
    source: "maps-scrape",
    placeId: null,
    placeName: nameMatch ? nameMatch[1].replace(/ - Google Maps$/, "").trim() : null,
    address: null,
    openingHours,
  };
}

/**
 * Point d'entree : recupere les horaires d'ouverture a partir d'une URL Google.
 * @param {string} url
 * @param {string} [apiKey] - GOOGLE_PLACES_API_KEY
 */
export async function importOpeningHoursFromGoogle(url, apiKey) {
  const expandedUrl = await expandGoogleUrl(url);
  const identifiers = parseGoogleUrl(expandedUrl);

  if (apiKey) {
    const result = await fetchFromPlacesApi(apiKey, identifiers);
    if (result?.openingHours) return result;
    // L'API a repondu mais sans horaires : inutile de tenter le scraping.
    if (result) return result;
  }

  return fetchFromMapsPage(expandedUrl);
}
