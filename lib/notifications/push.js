// Contenu et regles des notifications push.
//
// Volontairement SANS reseau ni DOM : ce fichier decide quoi ecrire et
// quand jeter un abonnement, rien d'autre. L'envoi lui-meme vit dans
// api/credit-clubbeur.js, et la reception dans public/sw.js.
//
// C'est ce decoupage qui rend la partie interessante testable : on peut
// verifier le texte d'une notification et le tri des abonnements morts
// sans jamais toucher a un serveur de push.

/** Longueur au-dela de laquelle Android tronque le corps avec "...". */
const CORPS_MAX = 120;

function nombreLisible(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function couper(texte, max = CORPS_MAX) {
  const propre = String(texte || "").trim().replace(/\s+/g, " ");
  if (propre.length <= max) return propre;
  // On coupe au dernier espace pour ne pas casser un mot en deux.
  const tronque = propre.slice(0, max - 1);
  const espace = tronque.lastIndexOf(" ");
  return (espace > max * 0.6 ? tronque.slice(0, espace) : tronque) + "…";
}

/**
 * Construit le contenu d'une notification a partir d'un evenement metier.
 *
 * Retourne null quand il n'y a rien a annoncer : l'appelant ne doit alors
 * envoyer aucune notification. Mieux vaut ne rien dire que reveiller
 * quelqu'un a 3h du matin pour "0 point".
 *
 * @param {object} evenement
 * @param {string} evenement.type - "story_validee" | "story_refusee"
 * @param {number} [evenement.points]
 * @param {string} [evenement.club]
 * @returns {{titre: string, corps: string, url: string, tag: string} | null}
 */
export function construireMessage(evenement) {
  const type = String(evenement?.type || "");
  const club = String(evenement?.club || "").trim();
  const points = nombreLisible(evenement?.points);

  if (type === "story_validee") {
    // Zero point valide, ce n'est pas une bonne nouvelle a annoncer : ca
    // ouvre l'appli sur une deception. On se tait.
    if (!points || points <= 0) return null;
    const ou = club ? ` chez ${club}` : "";
    return {
      titre: "Ta story est validée",
      corps: couper(`+${points} point${points > 1 ? "s" : ""}${ou}.`),
      url: "/app-preview.html#boutique",
      // Meme tag = la nouvelle notification REMPLACE la precedente au lieu
      // de s'empiler. Trois stories validees d'affilee ne doivent pas
      // donner trois lignes dans le centre de notifications.
      tag: "points",
    };
  }

  if (type === "story_refusee") {
    return {
      titre: "Ta story n'a pas été retenue",
      corps: couper(
        club
          ? `${club} n'a pas pu valider ta publication. Ouvre l'appli pour voir pourquoi.`
          : "Ouvre l'appli pour voir pourquoi."
      ),
      url: "/app-preview.html#profil",
      tag: "moderation",
    };
  }

  return null;
}

/**
 * Un service de push repond 404 ou 410 quand l'abonnement n'existe plus
 * (appli desinstallee, navigateur reinitialise, permission retiree).
 *
 * Ces lignes doivent etre supprimees, sinon la table grossit
 * indefiniment et chaque envoi paie le cout d'appeler des endpoints
 * morts. Tout autre code -- y compris 429 et les 5xx -- est temporaire :
 * on garde la ligne.
 *
 * @param {number} statut
 * @returns {boolean}
 */
export function abonnementExpire(statut) {
  return statut === 404 || statut === 410;
}

/**
 * Traduit une ligne de la table push_subscriptions vers la forme
 * attendue par la librairie web-push.
 *
 * Retourne null si la ligne est incomplete : une cle manquante ferait
 * lever web-push en pleine boucle d'envoi, et un seul abonnement abime
 * empecherait tous les suivants de partir.
 */
export function versAbonnementWebPush(ligne) {
  const endpoint = ligne?.endpoint;
  const p256dh = ligne?.p256dh;
  const auth = ligne?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}
