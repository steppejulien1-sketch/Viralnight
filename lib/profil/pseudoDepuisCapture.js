// Le pseudo Instagram lu sur une capture d'ecran de profil.
//
// L'inscription ne demande plus de taper son pseudo (Julien, 15/09/2026 :
// « inutile de devoir faire deux verifs, on voit le pseudo sur la capture ») :
// l'appli lit la barre du haut de la capture (Tesseract, sur le telephone) et
// preremplit le champ, que la personne corrige si besoin.
//
// Ce fichier ne fait que les calculs : ou couper l'image, et quel mot du texte
// lu est le pseudo. La lecture elle-meme vit dans app-preview.html.

// Sur une capture de telephone (plus haute que large), le pseudo est dans la
// barre sous l'heure : entre 3,5 % et 11,5 % de la hauteur, au centre. Sur
// une image plus trapue (un recadrage), on garde le haut.
export function zonePseudo(largeur, hauteur) {
  if (!largeur || !hauteur) return null;
  const telephone = hauteur / largeur > 1.6;
  return {
    x: Math.round(largeur * 0.12),
    y: telephone ? Math.round(hauteur * 0.035) : 0,
    largeur: Math.round(largeur * 0.76),
    hauteur: Math.round(hauteur * (telephone ? 0.08 : 0.45)),
  };
}

// Des mots que la barre du haut d'Instagram peut porter et qui ne sont pas un
// pseudo : le fil (« Pour vous »), les compteurs, l'heure.
const PAS_UN_PSEUDO = new Set([
  "pour", "vous", "suivis", "abonnements", "publications", "followers", "suivi", "modifier",
  "partager", "profil", "instagram", "reels", "story", "votre",
]);

// Le texte lu -> le pseudo le plus probable, ou null.
// Le cadenas se lit souvent « 6 » ou « 8 », la fleche « v » ou « ve » : les
// morceaux sans lettre ou trop courts sont ecartes.
export function pseudoDepuisTexteOcr(texte) {
  if (!texte) return null;
  const candidats = [];
  const lignes = String(texte).split(/\n+/);
  lignes.forEach((ligne, rang) => {
    for (const brut of ligne.split(/\s+/)) {
      // Un point colle a la fin vient de la lecture (« wl. »), pas du pseudo.
      const mot = brut.toLowerCase().replace(/^[^a-z0-9_]+|[^a-z0-9._]+$/g, "").replace(/\.+$/, "");
      if (!/^[a-z0-9._]{3,30}$/.test(mot)) continue;
      if (!/[a-z]/.test(mot)) continue;
      if (PAS_UN_PSEUDO.has(mot)) continue;
      if (/^\d{1,2}[:.]\d{2}$/.test(mot)) continue;
      // Un point ou un tiret bas signe un pseudo ; la premiere ligne aussi.
      const score = mot.length + (/[a-z0-9][._][a-z0-9]/.test(mot) ? 20 : 0) + (rang === 0 ? 5 : 0) - rang * 3;
      candidats.push({ mot, score });
    }
  });
  if (!candidats.length) return null;
  candidats.sort((a, b) => b.score - a.score);
  return candidats[0].mot;
}

// Est-ce une capture de PROFIL Instagram ? (Julien, 15/09/2026 : « qu'on doive
// envoyer d'office une capture d'ecran d'Insta et pas une autre ».) Un profil
// porte ses compteurs et ses boutons ; il en faut au moins deux familles dans
// le texte lu -- une seule peut apparaitre par hasard sur une autre image.
const MARQUES_PROFIL = [
  /publications?\b|\bposts?\b/,
  /followers|abonn[ée]s/,
  /suivi\(?e?\)?s?|following|abonnements/,
  /modifier|partager le profil|edit profile|share profile/,
];

export function estProfilInstagram(texte) {
  const bas = String(texte || "").toLowerCase();
  return MARQUES_PROFIL.filter((marque) => marque.test(bas)).length >= 2;
}
