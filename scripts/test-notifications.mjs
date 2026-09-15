// Tests des notifications push.
// Enjeu : une notification part sur le telephone de quelqu'un, parfois en
// pleine nuit. Un texte vide, un "+0 point" ou un abonnement mort garde
// indefiniment en base sont des defauts qu'on ne voit qu'en production.

import {
  construireMessage,
  abonnementExpire,
  versAbonnementWebPush,
  MOTIFS_DEPART,
  libelleMotifDepart,
} from "../lib/notifications/push.js";

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("\nStory validee");
const valide = construireMessage({ type: "story_validee", points: 150, club: "Le Bataclan" });
check("un message est produit", valide !== null);
check("le titre annonce la validation", valide.titre.includes("validée"), valide.titre);
check("les points sont dans le corps", valide.corps.includes("150"), valide.corps);
check("le club est nomme", valide.corps.includes("Le Bataclan"), valide.corps);
check("ouvre la boutique", valide.url.includes("#boutique"), valide.url);
check("tag groupant", valide.tag === "points");

console.log("\nAccord singulier/pluriel");
check("1 point au singulier",
  construireMessage({ type: "story_validee", points: 1 }).corps.includes("+1 point."),
  construireMessage({ type: "story_validee", points: 1 }).corps);
check("2 points au pluriel",
  construireMessage({ type: "story_validee", points: 2 }).corps.includes("+2 points"));

console.log("\nOn se tait plutot que d'annoncer une deception");
check("0 point -> aucune notification", construireMessage({ type: "story_validee", points: 0 }) === null);
check("points absents -> aucune notification", construireMessage({ type: "story_validee" }) === null);
check("points negatifs -> aucune notification", construireMessage({ type: "story_validee", points: -5 }) === null);
check("points illisibles -> aucune notification",
  construireMessage({ type: "story_validee", points: "beaucoup" }) === null);
check("type inconnu -> aucune notification", construireMessage({ type: "anniversaire" }) === null);

console.log("\nParrainage");
const parrain = construireMessage({ type: "parrainage", points: 100, pseudo: "@nina.b" });
check("parrainage : titre", parrain && parrain.titre === "Ton ami s'est inscrit", parrain && parrain.titre);
check("parrainage : pseudo et points", parrain && parrain.corps.includes("@nina.b") && parrain.corps.includes("+100 points"), parrain && parrain.corps);
check("parrainage sans pseudo : Un ami", construireMessage({ type: "parrainage", points: 100 }).corps.startsWith("Un ami"));
check("parrainage a 0 point -> rien", construireMessage({ type: "parrainage", points: 0 }) === null);
check("evenement vide -> aucune notification", construireMessage({}) === null);
check("evenement absent -> aucune notification", construireMessage(undefined) === null);

console.log("\nClub absent : le message reste correct");
const sansClub = construireMessage({ type: "story_validee", points: 40 });
check("pas de 'chez undefined'", !sansClub.corps.includes("undefined"), sansClub.corps);
check("pas de 'chez ' orphelin", !/chez\s*\./.test(sansClub.corps), sansClub.corps);

console.log("\nStory refusee");
const refus = construireMessage({ type: "story_refusee", club: "Le Rex" });
check("un message est produit", refus !== null);
check("le club est nomme", refus.corps.includes("Le Rex"));
check("n'ouvre pas la boutique", !refus.url.includes("#boutique"), refus.url);
check("tag distinct des points", refus.tag !== "points");
const refusSansClub = construireMessage({ type: "story_refusee" });
check("sans club : pas de 'undefined'", !refusSansClub.corps.includes("undefined"), refusSansClub.corps);

console.log("\nLongueur du corps");
const longClub = "Le Club Au Nom Interminable Qui Ne Finit Jamais De S'Appeler Comme Ca Vraiment Tres Long";
const tronque = construireMessage({ type: "story_refusee", club: longClub });
check("corps borne a 120 caracteres", tronque.corps.length <= 120, `${tronque.corps.length}`);
check("termine par une ellipse quand tronque", tronque.corps.endsWith("…"), tronque.corps);
// La vraie propriete : le texte s'arrete sur une frontiere de mot. On le
// verifie en confrontant le resultat a la source -- le caractere qui suit
// dans l'original doit etre un espace. Un simple "pas de mot court avant
// l'ellipse" ne marche pas : "ta" est un mot entier parfaitement valide.
const sourceLongue =
  `${longClub} n'a pas pu valider ta publication. Ouvre l'appli pour voir pourquoi.`;
const prefixe = tronque.corps.slice(0, -1);
check("coupe sur une frontiere de mot",
  sourceLongue.startsWith(prefixe) && sourceLongue[prefixe.length] === " ",
  `prefixe="${prefixe}" suivant=${JSON.stringify(sourceLongue[prefixe.length])}`);

console.log("\nAbonnements expires");
check("404 -> a supprimer", abonnementExpire(404));
check("410 -> a supprimer", abonnementExpire(410));
check("201 -> on garde", !abonnementExpire(201));
check("429 (trop de requetes) -> on garde", !abonnementExpire(429));
check("500 -> on garde", !abonnementExpire(500));
check("503 -> on garde", !abonnementExpire(503));

console.log("\nCadeau du jour disponible");
const cadeau = construireMessage({ type: "cadeau_dispo" });
check("un message est produit", cadeau !== null);
check("le titre annonce le cadeau", cadeau.titre.toLowerCase().includes("cadeau"), cadeau.titre);
check("ouvre la boutique", cadeau.url.includes("#boutique"), cadeau.url);
check("meme tag que les points (ne s'empile pas)", cadeau.tag === "points");
// Le montant depend de la marche du jour et d'un tirage a 1 % : l'ecrire
// dans la notification obligerait a le calculer par personne avant
// l'envoi, et "+2 points" ne fait ouvrir personne.
check("ne promet aucun montant", !/\d/.test(cadeau.corps), cadeau.corps);
check("ne depend d'aucun club", construireMessage({ type: "cadeau_dispo", club: "" }) !== null);

console.log("\nSupport");
const support = construireMessage({ type: "support_nouveau", pseudo: "@camille_4", extrait: "Je n'ai pas eu mes points au Mirano hier soir" });
check("un message pour l'admin", support !== null);
check("dit qui ecrit, sans double @", support.corps.startsWith("@camille_4 : "), support.corps);
check("donne le debut du message", support.corps.includes("mes points"), support.corps);
check("tag support", support.tag === "support");
const longMessage = construireMessage({ type: "support_nouveau", pseudo: "x", extrait: "a ".repeat(200) });
check("un long message est coupe", longMessage.corps.length <= 120, String(longMessage.corps.length));
check("sans pseudo ni texte : un corps quand meme", construireMessage({ type: "support_nouveau" }).corps.length > 0);
const reponse = construireMessage({ type: "support_reponse" });
check("une reponse pour le clubbeur", reponse !== null && reponse.titre.toLowerCase().includes("support"), reponse && reponse.titre);
check("la reponse ne recopie rien du contenu", !/:/.test(reponse.corps), reponse.corps);

console.log("\nCompte supprime");
const depart = construireMessage({ type: "compte_supprime", pseudo: "@camille_4", motif: "plus_utilise" });
check("un message pour l'admin", depart !== null && depart.titre.toLowerCase().includes("supprim"), depart && depart.titre);
check("dit qui et pourquoi", depart.corps === "@camille_4 : Ne l'utilise plus", depart.corps);
check("tag a part (ne remplace pas une alerte support)", depart.tag === "depart");
check("un code inconnu reste lisible", libelleMotifDepart("<b>n'importe quoi</b>") === "Raison non indiquée");
check("pas de piege sur les proprietes heritees", libelleMotifDepart("toString") === "Raison non indiquée");
check("sans pseudo ni motif : un corps quand meme", construireMessage({ type: "compte_supprime" }).corps.length > 0);
check("cinq raisons, dont autre", Object.keys(MOTIFS_DEPART).length === 5 && "autre" in MOTIFS_DEPART);

console.log("\nType inconnu");
check("rien pour un type non prevu", construireMessage({ type: "bidon" }) === null);

console.log("\nConversion vers web-push");
const ligne = { endpoint: "https://fcm.googleapis.com/x", p256dh: "cle-p", auth: "cle-a", autre: "ignore" };
const converti = versAbonnementWebPush(ligne);
check("endpoint conserve", converti.endpoint === "https://fcm.googleapis.com/x");
check("cles imbriquees", converti.keys.p256dh === "cle-p" && converti.keys.auth === "cle-a");
check("colonnes en trop ecartees", converti.autre === undefined);
check("sans p256dh -> null", versAbonnementWebPush({ endpoint: "x", auth: "a" }) === null);
check("sans auth -> null", versAbonnementWebPush({ endpoint: "x", p256dh: "p" }) === null);
check("sans endpoint -> null", versAbonnementWebPush({ p256dh: "p", auth: "a" }) === null);
check("ligne vide -> null", versAbonnementWebPush({}) === null);
check("ligne absente -> null", versAbonnementWebPush(null) === null);

console.log(`\n${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
