// Les photos d'un lieu, tirees de sa fiche Google (Places API New).
//
// Julien, 15/09/2026 : « mets pas mon logo partout alors que c'est un club,
// c'est stupide ». Aucun club n'a encore depose ses photos ; la fiche Google
// en a, et l'API Places les fournit pour etre affichees, avec le nom de leur
// auteur. On ne les copie pas : le serveur les relaie a la demande, et le CDN
// les garde en cache.
//
// ⚠️ LISTE BLANCHE. La route est publique (une balise <img> n'envoie pas de
// jeton) : sans liste, n'importe qui ferait payer des appels Places sur la
// cle du projet en passant d'autres identifiants.

export const LIEUX_AUTORISES = new Set([
  "ChIJpwov02LDw0cRA9JgUbYb7jc", // Mirano Brussels
]);

const DELAI_MS = 8000;

async function avecDelai(url, options = {}) {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    return await fetch(url, { ...options, signal: controle.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

// La liste des photos de la fiche : { nom, auteurs: [{ nom, lien }] }.
export async function listerPhotos(placeId, cle) {
  const reponse = await avecDelai(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": cle, "X-Goog-FieldMask": "photos" },
  });
  if (!reponse.ok) throw new Error(`Places ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`);
  const donnees = await reponse.json();
  return (donnees.photos || []).map((p) => ({
    nom: p.name,
    auteurs: (p.authorAttributions || []).map((a) => ({ nom: a.displayName || "", lien: a.uri || "" })),
  }));
}

// L'image elle-meme (octets + type), a une largeur raisonnable pour un telephone.
export async function lirePhoto(nomPhoto, cle, largeur = 900) {
  const url = `https://places.googleapis.com/v1/${nomPhoto}/media?maxWidthPx=${largeur}&key=${encodeURIComponent(cle)}`;
  const reponse = await avecDelai(url, { redirect: "follow" });
  if (!reponse.ok) throw new Error(`Photo ${reponse.status}`);
  return {
    type: reponse.headers.get("content-type") || "image/jpeg",
    octets: Buffer.from(await reponse.arrayBuffer()),
  };
}
