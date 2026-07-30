// Fiabilite d'un client, calculee sur son historique.
//
// Sur Instagram et TikTok, aucune API ne donne le nombre de vues : quelqu'un doit
// verifier a la main. Mais tout verifier avec la meme rigueur est absurde — un habitue
// qui annonce toujours le bon chiffre n'a pas besoin du meme controle qu'un inconnu.
//
// On compare donc, sur ses contenus deja valides, ce qu'il avait annonce (declared_views)
// a ce que le staff a constate (views_count). Un client regulierement exact devient
// "fiable" : le staff valide sa declaration en un clic. Un client qui exagere est signale.

/** Ecart tolere entre chiffre annonce et chiffre constate. */
const TOLERANCE = 0.15;

/** Nombre de contenus verifies avant de pouvoir juger. */
const MINIMUM_HISTORIQUE = 3;

/**
 * @param {Array<{declared_views: number|null, views_count: number, status: string}>} contenus
 *   historique du client, tous etablissements confondus
 * @returns {{niveau: "fiable"|"a_surveiller"|"inconnu", exactitude: number|null,
 *            verifies: number, tendance: "exact"|"exagere"|"sous-estime"|null, libelle: string}}
 */
export function evaluerFiabilite(contenus) {
  // Seuls les contenus valides ET declares permettent de comparer.
  // Le test sur null/undefined est explicite : Number(null) vaut 0, qui passerait
  // isFinite et ferait passer une absence de declaration pour une declaration a zero.
  const comparables = (contenus || []).filter((c) => {
    if (c.status !== "validated") return false;
    if (c.declared_views === null || c.declared_views === undefined) return false;
    return Number.isFinite(Number(c.declared_views)) && Number(c.views_count) > 0;
  });

  if (comparables.length < MINIMUM_HISTORIQUE) {
    return {
      niveau: "inconnu",
      exactitude: null,
      verifies: comparables.length,
      tendance: null,
      libelle:
        comparables.length === 0
          ? "Premier contenu : a verifier."
          : `${comparables.length} contenu(s) verifie(s) : pas encore assez pour juger.`,
    };
  }

  // Ecart relatif signe : positif = le client a annonce plus que la realite.
  const ecarts = comparables.map((c) => (Number(c.declared_views) - Number(c.views_count)) / Number(c.views_count));
  const ecartMoyen = ecarts.reduce((s, e) => s + e, 0) / ecarts.length;
  const dansLaTolerance = ecarts.filter((e) => Math.abs(e) <= TOLERANCE).length;
  const exactitude = Math.round((dansLaTolerance / ecarts.length) * 100);

  const tendance = Math.abs(ecartMoyen) <= TOLERANCE ? "exact" : ecartMoyen > 0 ? "exagere" : "sous-estime";

  // Fiable = exact la plupart du temps ET sans biais systematique a la hausse.
  // Les deux conditions comptent : quelqu'un qui exagere legerement mais toujours
  // finirait par couter cher au club.
  const niveau = exactitude >= 80 && tendance !== "exagere" ? "fiable" : "a_surveiller";

  const libelles = {
    exact: `${exactitude}% de declarations exactes sur ${ecarts.length} contenus.`,
    exagere: `Annonce en moyenne ${Math.round(ecartMoyen * 100)}% de vues en trop.`,
    "sous-estime": `Annonce en moyenne ${Math.round(Math.abs(ecartMoyen) * 100)}% de vues en moins.`,
  };

  return { niveau, exactitude, verifies: ecarts.length, tendance, libelle: libelles[tendance] };
}

/**
 * Le staff peut-il valider la declaration du client sans la recompter ?
 * Reserve aux clients fiables : c'est la seule facon de reduire le travail
 * sans ouvrir la porte aux abus.
 */
export function validationRapidePossible(fiabilite) {
  return fiabilite.niveau === "fiable";
}
