// Tests de la reponse automatique du support (lib/support/reponseAuto.js +
// baseSupport.js). Enjeu : comprendre les messages tels que les clients les
// ecrivent vraiment (fautes, argot, deux questions), dire la verite sur LEUR
// compte, et transmettre a Julien ce qu'on ne sait pas regler.
//
// Les cas « De quoi parle le client » sont la mesure de l'efficacite : chaque
// message qu'un vrai client a mal fait comprendre au robot doit finir ici.

import { doitRepondre, repondre, messageEnregistre, classer, REPONSES_MAX_24H } from "../lib/support/reponseAuto.js";

let passed = 0, failed = 0;
function check(nom, ok, detail) {
  if (ok) { passed += 1; if (!process.env.SILENCE) console.log(`  OK   ${nom}`); }
  else { failed += 1; console.log(`  FAIL ${nom}${detail !== undefined ? " -> " + detail : ""}`); }
}

// Mercredi 16 septembre 2026, 22 h a Bruxelles.
const MAINTENANT = new Date("2026-09-16T20:00:00Z");
const il = (h) => new Date(MAINTENANT.getTime() - h * 3600000).toISOString();

console.log("\nQuand repondre");
check("message client -> oui", doitRepondre([{ auteur: "client", message: "[Points] rien", created_at: il(0) }], MAINTENANT).repondre);
check("avis -> non", doitRepondre([{ auteur: "client", message: "Avis sur l'appli : ★★★★☆ (4/5)", created_at: il(0) }], MAINTENANT).raison === "avis");
check("Julien a repondu il y a 2 h -> non", doitRepondre([{ auteur: "client", message: "merci", created_at: il(0) }, { auteur: "admin", message: "ok", created_at: il(2) }], MAINTENANT).raison === "humain_recent");
check("Julien a repondu il y a 2 jours -> oui", doitRepondre([{ auteur: "client", message: "re", created_at: il(0) }, { auteur: "admin", message: "ok", created_at: il(48) }], MAINTENANT).repondre);
const trop = [{ auteur: "client", message: "?", created_at: il(0) }];
for (let i = 0; i < REPONSES_MAX_24H; i++) trop.push({ auteur: "ia", message: "r", created_at: il(1) });
check("limite par 24 h", doitRepondre(trop, MAINTENANT).raison === "limite_atteinte");

console.log("\nDe quoi parle le client");
const CAS = [
  // points
  ["[Points] j'ai pas reçu mes points", "points_pas_recus"],
  ["jai pa eu mes pts", "points_pas_recus"],
  ["g toujours rien recu", "points_pas_recus"],
  ["c quand que je recois mes points ???", "points_pas_recus"],
  ["mes points sont pas arrivés", "points_pas_recus"],
  ["j'ai posté hier et j'ai rien eu", "story_etat|points_pas_recus"],
  ["combien j'ai de points", "solde"],
  ["il me manque combien pour un cocktail", "solde"],
  ["mes points ont disparu", "points_baisse"],
  ["on m'a enlevé des points", "points_baisse"],
  ["comment on gagne des points", "gagner_points"],
  ["une story ça rapporte combien", "gagner_points"],
  ["est-ce que mes points expirent", "expiration"],
  ["mes points marchent dans tous les bars ?", "points_club"],
  // story
  ["ma story a été validée ?", "story_etat"],
  ["[Autre] ma story insta a été refusée pourquoi", "story_refusee"],
  ["pk ma stroy est refusé", "story_refusee"],
  ["vous avez vu ma story ?", "story_etat"],
  ["comment je poste une story pour avoir les points", "story_comment"],
  ["je dois tag qui dans ma story", "story_mention"],
  ["c'est quoi le compte insta du club", "story_mention"],
  ["j'ai supprimé ma story trop tot", "story_supprimee"],
  ["je peux faire 2 stories le même soir", "story_plusieurs"],
  ["un reel ça compte ?", "story_format"],
  ["et sur tiktok ça marche", "story_format"],
  ["mon insta est en privé ça marche quand même ?", "compte_prive"],
  ["je me suis trompé de pseudo insta", "pseudo_insta"],
  // scan
  ["le QR code ne scanne pas", "scan"],
  ["comment scanner le qr", "scan"],
  ["ma caméra s'ouvre pas pour scanner", "scan"],
  // recompenses
  ["ou est mon bon", "bons"],
  ["je retrouve plus mon ticket", "bons"],
  ["comment avoir un cocktail gratuit", "echanger"],
  ["comment échanger mes points", "echanger"],
  ["le barman a refusé mon bon", "bon_refuse"],
  ["le videur a pas voulu de mon bon", "bon_refuse"],
  ["mon bon est valable jusqu'à quand", "bon_validite"],
  ["j'ai échangé par erreur je peux annuler", "annuler_echange"],
  ["j'ai pas assez de points pour la bouteille", "pas_assez"],
  ["pourquoi c'est marqué épuisé", "epuise"],
  // cadeaux
  ["le cadeau du jour a disparu", "cadeau_jour"],
  ["comment marche la série de cadeaux", "cadeau_jour"],
  ["j'ai pas eu mon cadeau de bienvenue", "bienvenue"],
  ["les 50 points de bienvenue ?", "bienvenue"],
  // parrainage
  ["comment parrainer un pote", "parrainage"],
  ["ou est mon lien d'invitation", "parrainage"],
  ["mon pote s'est inscrit et j'ai rien eu", "parrainage_rate"],
  // compte
  ["je reçois pas le code pour me connecter", "connexion_code"],
  ["j'arrive pas à me co", "connexion_code"],
  ["le code marche pas", "connexion_code"],
  ["se connecter avec apple", "apple"],
  ["comment changer mon adresse mail", "changer_infos"],
  ["je veux supprimer mon compte", "supprimer"],
  ["comment je me déconnecte", "deconnexion"],
  ["j'ai changé de téléphone je perds mes points ?", "nouveau_telephone"],
  ["j'ai créé un deuxième compte par erreur", "plusieurs_comptes"],
  ["vous vendez mes données ?", "donnees"],
  // appli
  ["comment installer l'appli sur iphone", "installer"],
  ["elle est sur l'app store ?", "installer"],
  ["comment activer les notifs", "notifications"],
  ["c'est payant ?", "gratuit"],
  ["je comprends pas comment ça marche", "fonctionnement"],
  ["la carte me trouve pas", "localisation"],
  ["l'appli existe en anglais ?", "langue"],
  ["[Établissement] le Fuse", "etablissements"],
  ["il y a des bars à Liège ?", "etablissements"],
  ["le club est ouvert ce soir ?", "horaires"],
  ["je suis gérant d'un bar comment je rejoins", "gerant"],
  // social
  ["Bonjour", "salut"],
  ["merci beaucoup !", "merci"],
  ["ok ça marche", "merci"],
  ["je veux parler à un humain", "humain"],
  ["c'est une arnaque votre truc", "colere"],
  ["l'appli plante quand j'ouvre la carte", "bug"],
  // seul le sujet
  ["[Points] ?", "points_pas_recus"],
  // incompris
  ["qsdlkj azeaze", "inconnu"],
  ["tu connais une bonne pizzeria", "inconnu"],
  // Serie 1 : messages ecrits SANS regarder la base (mesure d'efficacite, 16/09/2026).
  ["salut j ai fait une story samedi au mirage et toujours pas de points", "points_pas_recus|story_etat"],
  ["pourquoi j'ai 0 points alors que j'ai scanné", "scan|points_pas_recus"],
  ["comment ça se fait que ma story compte pas", "story_etat|story_refusee"],
  ["je vois pas mes bons", "bons"],
  ["le bar veut pas me donner mon cocktail", "bon_refuse"],
  ["je peux avoir quoi avec 200 points", "solde|echanger|pas_assez"],
  ["g pa recu le mail", "connexion_code"],
  ["impossible de me connecter", "connexion_code"],
  ["comment je fais pour inviter des amis", "parrainage"],
  ["mon ami a utilisé mon lien mais j'ai pas les 100 points", "parrainage_rate"],
  ["à quoi sert le cadeau", "cadeau_jour"],
  ["j'ai raté un jour de cadeau", "cadeau_jour"],
  ["y a moyen d'avoir l'appli sur android", "installer"],
  ["les notifications marchent pas sur mon iphone", "notifications"],
  ["comment je change de pseudo", "pseudo_insta|changer_infos"],
  ["effacer mon compte", "supprimer"],
  ["c'est gratuit l'appli ?", "gratuit"],
  ["dans quelles villes vous êtes", "etablissements"],
  ["vous avez le mirano ?", "etablissements"],
  ["je gère une boîte de nuit", "gerant"],
  ["mon story a pas été accepté", "story_refusee|story_etat"],
  ["faut garder la story combien de temps", "story_supprimee"],
  ["je dois mettre un hashtag ?", "story_mention|story_comment"],
  ["jveux un humain svp", "humain"],
  ["votre appli est nulle ça marche jamais", "bug|colere"],
  ["je peux échanger mes points contre de l'argent", "echanger|inconnu"],
  ["le qr il est où dans le bar", "scan"],
  ["est ce que je peux utiliser mon bon un autre jour", "bon_validite"],
  ["combien de temps pour valider une story", "story_etat|points_pas_recus"],
  ["j'ai plus de points qu'hier c'est normal", "solde|points_baisse"],
  // Serie 2 : messages ecrits SANS regarder la base (mesure d'efficacite, 16/09/2026).
  ["yo mes points de vendredi sont passés où", "points_pas_recus"],
  ["j'ai scan le qr mais ça m'a rien donné", "scan"],
  ["ça fait 3 jours que ma story est en attente", "story_etat"],
  ["story validée mais solde à zéro", "story_etat|points_pas_recus|solde"],
  ["je comprends pas pourquoi on m'a refusé", "story_refusee|bon_refuse"],
  ["comment on utilise un bon au bar", "bons|echanger"],
  ["le code qr du bon marche pas au bar", "bon_refuse"],
  ["j'ai pas reçu de mail avec le code", "connexion_code"],
  ["mon code est invalide", "connexion_code"],
  ["je peux me connecter avec facebook", "connexion_code|inconnu"],
  ["comment je modifie ma photo", "changer_infos"],
  ["je veux plus utiliser noctify supprimez tout", "supprimer"],
  ["c'est quoi le jackpot", "cadeau_jour"],
  ["j'ai perdu ma série de cadeaux", "cadeau_jour"],
  ["cadeau pas dispo", "cadeau_jour"],
  ["les 100 points parrainage c'est quand", "parrainage|parrainage_rate"],
  ["j'ai envoyé mon lien à 3 potes", "parrainage|parrainage_rate"],
  ["l'appli s'ouvre pas", "bug"],
  ["écran blanc au démarrage", "bug"],
  ["pourquoi je dois donner ma position", "localisation"],
  ["y'a pas de version anglaise ?", "langue"],
  ["ouvert le jeudi ?", "horaires"],
  ["c'est où exactement le club", "horaires"],
  ["je travaille dans un bar on peut être partenaire", "gerant"],
  ["est-ce que vous allez ajouter des bars à Namur", "etablissements"],
  ["je peux poster une photo normale sur mon feed", "story_format"],
  ["faut que je tag le club ou juste la localisation", "story_mention"],
  ["ma story a été supprimée par erreur", "story_supprimee"],
  ["2 stories = 200 points ?", "story_plusieurs"],
  ["mon compte instagram a changé de nom", "pseudo_insta"],
  ["je me suis inscrit avec le mauvais mail", "changer_infos|plusieurs_comptes"],
  ["nouveau téléphone comment je récupère mon compte", "nouveau_telephone"],
  ["les récompenses changent selon les bars ?", "points_club|echanger"],
  ["combien coûte un cocktail en points", "solde|echanger"],
  ["j'ai 50 points je peux prendre quoi", "solde|pas_assez|echanger"],
  ["merci pour la réponse", "merci"],
  ["top merci", "merci"],
  ["allo ?? personne répond", "humain"],
  ["c'est du vol", "colere"],
  ["quel temps il fait demain", "inconnu"],
  // Serie 3 : messages ecrits SANS regarder la base (mesure d'efficacite, 16/09/2026).
  ["j'ai bien mentionné le mirage mais rien", "story_etat|points_pas_recus"],
  ["mes 100 points de la story ?", "points_pas_recus|story_etat"],
  ["ça prend combien de temps pour avoir les points", "points_pas_recus|story_etat"],
  ["solde pas à jour", "solde|points_pas_recus"],
  ["comment voir mon historique", "solde"],
  ["le qr est illisible", "scan"],
  ["j'ai scanné deux fois ce soir", "scan"],
  ["j'ai pas de bouton échanger", "echanger|bug"],
  ["il est où le bon que j'ai pris hier", "bons"],
  ["la serveuse a dit que mon bon était faux", "bon_refuse"],
  ["le cadeau d'aujourd'hui je le vois pas", "cadeau_jour"],
  ["pourquoi j'ai que 2 points au cadeau", "cadeau_jour"],
  ["comment inviter quelqu'un", "parrainage"],
  ["mon parrainage marche pas", "parrainage_rate"],
  ["le mail de connexion arrive jamais", "connexion_code"],
  ["jpeux pas me connecter", "connexion_code"],
  ["comment changer mon nom", "changer_infos"],
  ["désinscription", "supprimer"],
  ["j'ai supprimé l'appli je perds tout ?", "nouveau_telephone|supprimer"],
  ["comment on met l'appli sur l'écran", "installer"],
  ["activer notifications", "notifications"],
  ["vous êtes présents où", "etablissements"],
  ["le bar ouvre à quelle heure", "horaires"],
  ["je voudrais proposer mon bar", "gerant"],
  ["faut que la story reste combien de temps", "story_supprimee"],
  ["je peux mentionner 2 clubs", "story_mention|story_plusieurs"],
  ["une vidéo ça marche ou que photo", "story_format|story_comment"],
  ["j'ai un compte pro instagram", "compte_prive|pseudo_insta"],
  ["ya personne ?", "humain"],
  ["nul", "colere|bug|inconnu"],
  // Serie 4 : messages ecrits SANS regarder la base (mesure d'efficacite, 16/09/2026).
  ["hello j'ai été au mirage samedi j'ai fait ma story mais pas de points", "story_etat|points_pas_recus"],
  ["combien vaut le scan", "scan|gagner_points"],
  ["les points arrivent au bout de combien de temps", "points_pas_recus|story_etat"],
  ["j'ai 0 point c'est normal", "solde|points_pas_recus"],
  ["j'arrive pas à scanner le code du bar", "scan"],
  ["ou je vois mes récompenses échangées", "bons"],
  ["mon cocktail a pas été accepté par le barman", "bon_refuse"],
  ["on peut échanger contre une entrée gratuite ?", "echanger"],
  ["le cadeau journalier marche pas", "cadeau_jour"],
  ["je n'ai pas eu les 50 points à l'inscription", "bienvenue"],
  ["je gagne combien si j'invite un ami", "parrainage"],
  ["j'ai invité ma copine elle s'est inscrite j'ai rien", "parrainage_rate"],
  ["j'ai pas reçu le code par mail", "connexion_code"],
  ["comment mettre une photo de profil", "changer_infos"],
  ["comment effacer mon compte", "supprimer"],
  ["où je peux me déconnecter", "deconnexion"],
  ["je peux avoir l'appli sur ordinateur", "installer|inconnu"],
  ["je reçois aucune notification", "notifications"],
  ["c'est gratos ?", "gratuit|inconnu"],
  ["ça sert à quoi noctify", "fonctionnement"],
  ["pourquoi l'appli veut ma localisation", "localisation"],
  ["c'est dispo à Anvers ?", "etablissements"],
  ["il ferme à quelle heure le mirage", "horaires"],
  ["je suis le patron d'un resto", "gerant"],
  ["ma story était en privé amis proches", "compte_prive|story_etat|inconnu"],
  ["j'ai effacé ma story trop vite", "story_supprimee"],
  ["un post instagram ça compte", "story_format"],
  ["merci c'est réglé", "merci"],
  ["j'attends une réponse depuis 2 jours", "humain"],
  ["c'est quoi ce délire vous m'avez volé mes points", "colere|points_baisse"],
];
let justes = 0;
for (const [m, attendu] of CAS) {
  const vu = repondre(m, {}, MAINTENANT).intention;
  const ok = attendu.split("|").some((a) => vu.split("+").includes(a));
  if (ok) justes += 1;
  const top = classer(m.replace(/^\[[^\]]*\]\s*/, "")).slice(0, 2).map((x) => `${x.entree.id}:${x.score.toFixed(2)}`).join(" ");
  check(`« ${m} » -> ${attendu}`, ok, `${vu}   [${top}]`);
}
console.log(`  => ${justes}/${CAS.length} messages compris`);

console.log("\nDeux questions, relances");
let rep = repondre("comment je scanne le qr ? et aussi c'est quoi le cadeau du jour", {}, MAINTENANT);
check("deux questions -> deux reponses", rep.intention.includes("scan") && rep.intention.includes("cadeau_jour"), rep.intention);
rep = repondre("et c'est quand ?", {}, MAINTENANT, ["[Points] j'ai pas reçu mes points"]);
check("relance -> sujet d'avant", rep.intention === "points_pas_recus", rep.intention);

console.log("\nReponses avec le compte");
const compte = {
  profil: { handle: "julien.stpt", points_balance: 165 },
  stories: [{ mentioned_at: il(5), review_status: null, club: "Mirage" }],
  gains: [{ created_at: il(1), amount: 15, source: "scan", club: "Mirage", released: true }],
  bons: [{ redeemed_at: il(2), titre: "Cocktail offert", used: false }],
  cadeaux: [],
  parrainages: 2,
  recompenses: [{ title: "Cocktail offert", cost_points: 130 }, { title: "Coupe-file", cost_points: 600 }],
  clubs: [{ name: "Mirage", city: "Bruxelles", ig_handle: "mirage.brussels" }],
  bienvenue: { amount: 50, created_at: il(100) },
};
rep = repondre("[Points] toujours rien", compte, MAINTENANT);
check("story en attente : le dit, avec l'heure, sans transmettre", /en cours de vérification/.test(rep.texte) && /Mirage/.test(rep.texte) && !rep.transmettre, rep.texte);
rep = repondre("ma story est validée ?", { ...compte, stories: [{ mentioned_at: il(60), review_status: null, club: "Mirage" }] }, MAINTENANT);
check("story en attente depuis 60 h -> transmise", rep.transmettre && /aurait dû/.test(rep.texte), rep.texte);
rep = repondre("pourquoi ma story est refusée", { ...compte, stories: [{ mentioned_at: il(30), review_status: "refusee", club: "Mirage" }] }, MAINTENANT);
check("story refusee -> explique et transmet", rep.transmettre && /refusée/.test(rep.texte));
rep = repondre("ma story est validée ?", { ...compte, stories: [{ mentioned_at: il(30), review_status: "validee", awarded_points: 100, club: "Mirage" }] }, MAINTENANT);
check("story validee -> montant et solde", /\+100 points/.test(rep.texte) && /165 points/.test(rep.texte) && !rep.transmettre, rep.texte);
rep = repondre("le qr code ne scanne pas", compte, MAINTENANT);
check("scan de ce soir retrouve", /ce soir au Mirage/.test(rep.texte), rep.texte);
rep = repondre("où est mon bon ?", compte, MAINTENANT);
check("bon pas utilise -> Mes bons", /Cocktail offert/.test(rep.texte) && /Mes bons/.test(rep.texte) && !rep.transmettre, rep.texte);
rep = repondre("combien j'ai de points", compte, MAINTENANT);
check("solde + prochaine recompense", /165 points/.test(rep.texte) && /Il te manque 435 points pour « Coupe-file »/.test(rep.texte), rep.texte);
rep = repondre("je dois tag qui", compte, MAINTENANT);
check("mention : le vrai compte du club", /@mirage\.brussels/.test(rep.texte), rep.texte);
rep = repondre("comment parrainer un pote", compte, MAINTENANT);
check("parrainage : compte ses amis", /2 amis inscrits/.test(rep.texte), rep.texte);
rep = repondre("le cadeau du jour ?", { ...compte, cadeaux: [{ gift_date: "2026-09-16", amount: 3, jour: 2 }] }, MAINTENANT);
check("cadeau deja pris aujourd'hui", /déjà pris/.test(rep.texte) && /jour 2 sur 7/.test(rep.texte), rep.texte);
rep = repondre("j'ai pas eu mon cadeau de bienvenue", compte, MAINTENANT);
check("bienvenue deja versee", /bien été versé/.test(rep.texte), rep.texte);
rep = repondre("tu connais une bonne pizzeria", compte, MAINTENANT);
check("rien de reconnu -> transmis", rep.transmettre);
check("compte vide sans planter", typeof repondre("[Points] ?", {}, MAINTENANT).texte === "string");
check("aucune reponse ne contient d'e-mail ou d'id", CAS.every(([m]) => !/@viralnight|[0-9a-f]{8}-[0-9a-f]{4}/.test(repondre(m, compte, MAINTENANT).texte)));

console.log("\nEnregistrement");
check("transmis -> etiquette", messageEnregistre({ texte: "Je transmets.", transmettre: true }) === "[Transmis] Je transmets.");
check("sinon texte seul", messageEnregistre({ texte: "Voila.", transmettre: false }) === "Voila.");

console.log(`\n${passed} OK, ${failed} en echec`);
if (failed) process.exit(1);
