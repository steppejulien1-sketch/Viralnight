/* L'adresse d'un etablissement -> sa position sur la carte (25/09/2026).

   Sans position, un lieu ne peut pas avoir d'epingle dans l'appli des
   clubbeurs. Le gerant tape son adresse a l'etape « Ton etablissement » ; ce
   fichier la convertit en latitude/longitude avec Nominatim (OpenStreetMap),
   gratuit et sans cle, deja utilise pour les coordonnees ecrites a la main
   dans l'appli.

   Les regles d'usage de Nominatim demandent un User-Agent qui identifie
   l'appli et au plus une requete par seconde : on ne geocode qu'une fois par
   etablissement (tant que lat/lng sont vides), jamais a chaque ouverture. */

const PAYS = "be,fr,nl,lu";

export function requeteAdresse(adresse, ville) {
  const morceaux = [adresse, ville].map((m) => String(m || "").trim()).filter(Boolean);
  // Une ville deja presente dans l'adresse ne se repete pas.
  if (morceaux.length === 2 && morceaux[0].toLowerCase().includes(morceaux[1].toLowerCase())) morceaux.pop();
  return morceaux.join(", ");
}

export async function geocoder(adresse, ville) {
  const q = requeteAdresse(adresse, ville);
  if (!q) return null;
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=" + PAYS +
    "&q=" + encodeURIComponent(q);
  try {
    const reponse = await fetch(url, {
      headers: { "User-Agent": "Noctify/1.0 (noctify.support@gmail.com)", "Accept-Language": "fr" },
      signal: AbortSignal.timeout(6000),
    });
    if (!reponse.ok) return null;
    const liste = await reponse.json();
    const premier = Array.isArray(liste) ? liste[0] : null;
    const lat = Number(premier?.lat);
    const lng = Number(premier?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (erreur) {
    console.warn("[geocoder]", erreur?.message || erreur);
    return null;
  }
}
