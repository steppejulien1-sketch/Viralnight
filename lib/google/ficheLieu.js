// La fiche Google d'un etablissement, lue en une fois (Places API New).
//
// Julien, 17/09/2026 : « ils ont juste besoin de copier-coller leur fiche
// Google, sur la fiche il y a toutes les infos ». Le parcours de l'appli des
// gerants ne demande plus que ce lien : nom, adresse, ville, position, type,
// telephone et horaires en sortent.

import { expandGoogleUrl, parseGoogleUrl, periodsToOpeningHours } from "./openingHours.js";

const RECHERCHE_URL = "https://places.googleapis.com/v1/places:searchText";
const DELAI_MS = 8000;
const CHAMPS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
  "places.location", "places.primaryType", "places.types", "places.nationalPhoneNumber",
  "places.internationalPhoneNumber", "places.regularOpeningHours", "places.photos",
].join(",");

// Le type Noctify (colonne establishments.category) d'apres les types Google.
export function typeDepuisGoogle(primaire, types) {
  const tous = [primaire, ...(types || [])].filter(Boolean);
  if (tous.some((t) => t === "night_club")) return "club";
  if (primaire && /restaurant/.test(primaire)) return "restaurant";
  if (tous.some((t) => /^(bar|pub|wine_bar|cocktail_bar|sports_bar|beer_garden|lounge_bar)$/.test(t))) return "bar";
  if (tous.some((t) => /restaurant/.test(t))) return "restaurant";
  return "bar";
}

// Les coordonnees ecrites dans une URL Google Maps (« @lat,lng » ou « !3dlat!4dlng »).
export function coordonneesDansUrl(url) {
  const precis = String(url).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (precis) return { lat: Number(precis[1]), lng: Number(precis[2]) };
  const vue = String(url).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (vue) return { lat: Number(vue[1]), lng: Number(vue[2]) };
  return null;
}

function composant(composants, type) {
  const c = (composants || []).find((x) => (x.types || []).includes(type));
  return c ? c.longText || c.shortText || "" : "";
}

// Ce que l'appli garde d'un lieu Places.
export function ficheDepuisLieu(lieu) {
  const composants = lieu.addressComponents || [];
  const rue = [composant(composants, "route"), composant(composants, "street_number")].filter(Boolean).join(" ");
  const periodes = lieu.regularOpeningHours?.periods;
  return {
    placeId: lieu.id || null,
    nom: lieu.displayName?.text || "",
    adresse: lieu.formattedAddress || rue || "",
    ville: composant(composants, "locality") || composant(composants, "postal_town") || composant(composants, "administrative_area_level_2") || "",
    lat: typeof lieu.location?.latitude === "number" ? lieu.location.latitude : null,
    lng: typeof lieu.location?.longitude === "number" ? lieu.location.longitude : null,
    type: typeDepuisGoogle(lieu.primaryType, lieu.types),
    telephone: lieu.nationalPhoneNumber || lieu.internationalPhoneNumber || "",
    horaires: periodes?.length ? periodsToOpeningHours(periodes) : null,
    nbPhotos: (lieu.photos || []).length,
  };
}

async function avecDelai(url, options) {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    return await fetch(url, { ...options, signal: controle.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

export async function lireFicheGoogle(url, cle) {
  if (!cle) throw new Error("GOOGLE_PLACES_API_KEY absente");
  const complete = await expandGoogleUrl(url);
  const { placeId, query } = parseGoogleUrl(complete);
  const textQuery = placeId ? `place_id:${placeId}` : query;
  if (!textQuery) return null;

  const corps = { textQuery, maxResultCount: 1, languageCode: "fr" };
  const position = coordonneesDansUrl(complete);
  if (position) corps.locationBias = { circle: { center: { latitude: position.lat, longitude: position.lng }, radius: 400 } };

  const reponse = await avecDelai(RECHERCHE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": cle, "X-Goog-FieldMask": CHAMPS },
    body: JSON.stringify(corps),
  });
  if (!reponse.ok) throw new Error(`Google Places a repondu ${reponse.status}: ${(await reponse.text()).slice(0, 200)}`);
  const lieu = (await reponse.json()).places?.[0];
  return lieu ? ficheDepuisLieu(lieu) : null;
}
