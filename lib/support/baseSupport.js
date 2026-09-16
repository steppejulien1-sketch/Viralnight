// LA BASE DE CONNAISSANCES DU SUPPORT (appli clubbeur).
//
// Chaque entree : des exemples de questions telles qu'un client les ecrit
// (fautes, argot et abreviations compris -- le moteur les normalise), des
// mots forts, et une reponse. La reponse est une FONCTION du compte du client
// quand ses donnees changent la reponse (« ta story du 15 sept. au Mirage est
// en attente »), un texte fixe sinon.
//
// ⚠️ NE RIEN ECRIRE QUE L'APPLI NE FAIT PAS. Chaque regle ici est verifiee
// dans le code ou la base (bareme, delais, ecrans). Si une regle change, la
// reponse change ici. Ce qu'on ne sait pas : transmettre, jamais deviner.
//
// Le moteur (reponseAuto.js) choisit l'entree ; pour en ajouter une, ajouter
// un objet et quelques exemples -- puis un cas dans scripts/test-reponse-auto.mjs.

import { DELAI_AUTO_VALIDATION_MS } from "../admin/pilotage.js";

export const TRANSMIS = "Je transmets à l'équipe, on te répond ici très vite.";

export function date(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { timeZone: "Europe/Brussels", day: "numeric", month: "short" });
}
export function heure(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const [h, m] = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).split(":");
  return `${Number(h)} h${m === "00" ? "" : " " + m}`;
}
export function jourLocal(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}
const nb = (n) => Number(n || 0).toLocaleString("fr-FR");
export const pts = (n) => `${nb(n)} point${Math.abs(Number(n)) > 1 ? "s" : ""}`;
const au = (club) => (club ? ` au ${club}` : "");
const r = (texte, transmettre = false) => ({ texte, transmettre });
const solde = (c) => `Ton solde est de ${pts(c.profil?.points_balance)}.`;

/* ---- Reponses qui lisent le compte ---- */

function etatStory(c, maintenant) {
  const s = (c.stories || [])[0];
  if (!s) {
    return r(`Je ne vois aucune story reçue sur ton compte${c.profil?.handle ? ` (@${c.profil.handle})` : ""}. Pour qu'elle compte, mentionne l'établissement dans ta story Instagram avec le compte indiqué dans l'onglet Story, depuis le compte Instagram enregistré dans ton profil, et laisse-la en ligne jusqu'à la vérification. ${TRANSMIS}`, true);
  }
  const quand = `du ${date(s.mentioned_at)}${au(s.club)}`;
  if (s.review_status === "validee") {
    return r(`Ta story ${quand} a été validée : +${pts(s.awarded_points)}. ${solde(c)}`);
  }
  if (s.review_status === "refusee") {
    return r(`Ta story ${quand} a été refusée. Une story n'est validée que si elle mentionne l'établissement et qu'elle est encore en ligne au moment de la vérification. ${TRANSMIS}`, true);
  }
  const echeance = new Date(new Date(s.mentioned_at).getTime() + DELAI_AUTO_VALIDATION_MS);
  if (echeance.getTime() - new Date(maintenant).getTime() > -12 * 3600 * 1000) {
    return r(`Ta story ${quand} est en cours de vérification. Les points arrivent environ 24 h après, vers ${heure(echeance)} le ${date(echeance)}, si elle est encore en ligne.`);
  }
  return r(`Ta story ${quand} aurait dû être vérifiée depuis un moment. ${TRANSMIS}`, true);
}

function pointsPasRecus(c, maintenant) {
  const s = (c.stories || [])[0];
  if (s && !s.review_status) return etatStory(c, maintenant);
  const bloques = (c.gains || []).filter((g) => g.released === false);
  if (bloques.length) {
    const g = bloques[0];
    return r(`Tes ${pts(g.amount)}${au(g.club)} sont bien arrivés, ils se débloquent le ${date(g.unlocks_at)} à ${heure(g.unlocks_at)}. ${solde(c)}`);
  }
  const g = (c.gains || [])[0];
  const dernier = g ? ` Ton dernier gain : +${pts(g.amount)} le ${date(g.created_at)}${au(g.club)}.` : "";
  return r(`${solde(c)}${dernier} Une story rapporte 100 points environ 24 h après, un scan du QR 15 points tout de suite. S'il te manque des points après ce délai, précise où et quand. ${TRANSMIS}`, true);
}

function prochaineRecompense(c) {
  const soldeActuel = Number(c.profil?.points_balance || 0);
  const liste = (c.recompenses || []).slice().sort((a, b) => a.cost_points - b.cost_points);
  if (!liste.length) return "";
  const dispo = liste.filter((x) => x.cost_points <= soldeActuel);
  const suivante = liste.find((x) => x.cost_points > soldeActuel);
  const a = dispo.length ? ` Tu peux déjà prendre « ${dispo[dispo.length - 1].title} » (${pts(dispo[dispo.length - 1].cost_points)}).` : "";
  const b = suivante ? ` Il te manque ${pts(suivante.cost_points - soldeActuel)} pour « ${suivante.title} ».` : "";
  return a + b;
}

function bonsDuClient(c) {
  const libres = (c.bons || []).filter((b) => !b.used);
  if (!libres.length) return r(`Tu n'as aucun bon en attente. Pour en obtenir un, ouvre Récompenses, choisis une récompense et touche Échanger. ${solde(c)}${prochaineRecompense(c)}`);
  const b = libres[0];
  const autres = libres.length > 1 ? ` (et ${libres.length - 1} autre${libres.length > 2 ? "s" : ""})` : "";
  return r(`Ton bon « ${b.titre || "récompense"} » du ${date(b.redeemed_at)}${autres} n'a pas encore servi : il est dans Récompenses, rubrique Mes bons. Montre son QR code au bar ou à l'entrée, le soir même.`);
}

function scanDuClient(c, maintenant) {
  const scans = (c.gains || []).filter((g) => g.source === "scan");
  const ceSoir = scans.find((g) => jourLocal(g.created_at) === jourLocal(maintenant));
  if (ceSoir) return r(`Ton scan de ce soir${au(ceSoir.club)} t'a bien rapporté ${pts(ceSoir.amount)}. Le QR ne compte qu'une fois par soirée par établissement.`);
  const base = "Scanne le QR affiché dans l'établissement avec l'appareil photo de ton téléphone, ou depuis l'onglet Story (Scanner le QR sur place) : 15 points tout de suite, une fois par soirée. Si la caméra ne s'ouvre pas, autorise l'accès à l'appareil photo pour ton navigateur dans les réglages du téléphone.";
  if (scans[0]) return r(`Ton dernier scan date du ${date(scans[0].created_at)}${au(scans[0].club)}. ${base}`);
  return r(base);
}

function cadeauDuJour(c, maintenant) {
  const jourCadeau = jourLocal(new Date(new Date(maintenant).getTime() - 10 * 3600 * 1000));
  const pris = (c.cadeaux || []).find((g) => g.gift_date === jourCadeau);
  if (pris) return r(`Tu as déjà pris ton cadeau aujourd'hui (+${pts(pris.amount)}, jour ${pris.jour} sur 7). Le prochain arrive demain à 10 h, et il vaut un peu plus si tu ne sautes pas de jour.`);
  const base = "Le cadeau du jour est en haut de Récompenses, à partir de 10 h. Il monte sur 7 jours d'affilée (2, 3, 4, 5, 6, 8 puis 20 points) et repart au début si tu sautes un jour. Rarement, un jackpot de 40 points.";
  if (!(c.gains || []).length) return r(`${base} Il faut d'abord avoir gagné des points dans un établissement, par exemple en scannant son QR.`);
  return r(base);
}

function bienvenue(c) {
  if (c.bienvenue) return r(`Ton cadeau de bienvenue a bien été versé : +${pts(c.bienvenue.amount)} le ${date(c.bienvenue.created_at)}. ${solde(c)}`);
  return r("Ton cadeau de bienvenue de 50 points n'a pas encore été pris. Ferme puis rouvre l'appli : la page du cadeau s'ouvre, touche Récupérer mon cadeau. S'il n'apparaît pas, écris-le ici et on le regarde.");
}

function parrainage(c) {
  const n = c.parrainages || 0;
  const deja = n ? ` Tu as déjà ${n} ami${n > 1 ? "s" : ""} inscrit${n > 1 ? "s" : ""} grâce à toi.` : "";
  return r(`Tu gagnes 100 points quand un ami s'inscrit avec ton lien (Profil, Inviter des amis). Il doit ouvrir ton lien AVANT de créer son compte : un compte déjà créé ne peut plus être parrainé.${deja}`);
}

function parrainageRate(c) {
  const n = c.parrainages || 0;
  return r(`${n ? `Tu as ${n} parrainage${n > 1 ? "s" : ""} validé${n > 1 ? "s" : ""}. ` : "Je ne vois aucun parrainage validé sur ton compte. "}Pour compter, ton ami doit ouvrir TON lien (Profil, Inviter des amis) avant de créer son compte, et son compte doit être tout neuf. S'il a suivi ces étapes, donne-nous son pseudo. ${TRANSMIS}`, true);
}

function mentionner(c) {
  const clubs = (c.clubs || []).filter((x) => x.ig_handle);
  const liste = clubs.slice(0, 3).map((x) => `@${x.ig_handle} pour ${x.name}`).join(", ");
  return r(`Mentionne le compte Instagram de l'établissement dans ta story : il est affiché, prêt à copier, dans l'onglet Story${liste ? ` (${liste})` : ""}. Poste depuis le compte Instagram enregistré dans ton profil${c.profil?.handle ? ` (@${c.profil.handle})` : ""}.`);
}

function etablissements(c) {
  const clubs = (c.clubs || []).map((x) => `${x.name}${x.city ? ` (${x.city})` : ""}`);
  const liste = clubs.length ? ` Aujourd'hui : ${clubs.join(", ")}.` : "";
  return r(`Seuls les établissements partenaires sont dans l'appli, sur la Carte et dans Récompenses.${liste} Il en arrive d'autres : donne-nous le nom de celui que tu voudrais voir, on le contacte.`);
}

function monSolde(c) {
  const g = (c.gains || [])[0];
  const dernier = g ? ` Dernier gain : +${pts(g.amount)} le ${date(g.created_at)}${au(g.club)}.` : "";
  return r(`${solde(c)}${dernier}${prochaineRecompense(c)} Le détail est dans Profil, Mes points.`);
}

function pointsBaisse(c) {
  const b = (c.bons || [])[0];
  if (b) return r(`Ton solde a baissé quand tu as échangé « ${b.titre || "une récompense"} » le ${date(b.redeemed_at)} : les points partent au moment de l'échange. ${solde(c)} Tout est dans Profil, Mes points.`);
  return r(`Je ne vois aucun échange qui explique une baisse. ${solde(c)} ${TRANSMIS}`, true);
}

function monPseudo(c) {
  const p = c.profil?.handle ? `Le compte Instagram enregistré est @${c.profil.handle}.` : "Aucun compte Instagram n'est enregistré.";
  return r(`${p} C'est lui qui doit poster la story, sinon on ne peut pas la relier à toi. Tu le changes dans Profil, Données personnelles, Compte Instagram.`);
}

/* ---- La base ---- */

export const ENTREES = [
  // POINTS
  { id: "points_pas_recus", signal: /\b(points?|pts)\b.*\b(passes? ou|disparu depuis|pas (arrives?|credites?|recus?|eu)|toujours pas|jamais recu)\b|\bcombien de temps\b.*\bpoints?\b|\bprend combien de temps\b|\bdelai\b|\b(arrive|arrivent|recoit|recois|avoir|touche)\w*\b.*\bcombien de temps\b|\bau bout de combien\b/, sujet: "Points", mots: ["recu", "manque"], exemples: [
    "je n ai pas recu mes points", "j ai rien recu", "toujours pas mes points", "ou sont mes points", "mes points ne sont pas arrives",
    "pas eu mes points", "points pas credites", "j attends mes points", "quand est ce que j ai mes points", "j ai poste et j ai rien eu",
  ], repondre: pointsPasRecus },
  { id: "solde", signal: /\b(combien (j ai|ai je)|mon solde|solde|historique|prendre quoi|avoir quoi|peux (prendre|avoir) quoi|combien coute|coute combien)\b|\b(0|zero) points?\b/, sujet: "Points", mots: ["solde", "solde", "combien"], exemples: [
    "comment voir mon historique", "ou voir mes points gagnes",
    "je peux avoir quoi avec mes points", "j ai plus de points qu hier", "qu est ce que je peux prendre avec mes points",
    "combien j ai de points", "mon solde", "voir mes points", "il me manque combien", "combien de points pour un cocktail", "historique de mes points",
  ], repondre: monSolde },
  { id: "points_baisse", sujet: "Points", mots: ["baisse", "disparu", "perdu", "enleve"], exemples: [
    "mes points ont disparu", "j ai perdu des points", "mon solde a baisse", "on m a enleve des points", "points retires",
  ], repondre: pointsBaisse },
  { id: "gagner_points", mots: ["gagner", "comment"], exemples: [
    "comment gagner des points", "comment on gagne des points", "gagner plus de points", "comment avoir plus de points", "comment ca marche les points", "combien rapporte une story", "ca rapporte combien",
  ], repondre: () => r("Une story qui mentionne l'établissement : 100 points. Le QR code sur place : 15 points. Le cadeau du jour : de 2 à 20 points. Un ami qui s'inscrit avec ton lien : 100 points. Tout est détaillé dans Profil, Gagner des points.") },
  { id: "expiration", mots: ["expire", "expiration", "perime"], exemples: [
    "est ce que les points expirent", "mes points ont une date limite", "combien de temps je garde mes points",
  ], repondre: () => r("Tes points n'ont pas de date d'expiration : ils restent sur ton compte tant que tu ne le supprimes pas.") },
  { id: "points_club", signal: /\b(selon les (bars|clubs|etablissements)|dans tous les|partout|chaque (bar|club))\b/, exemples: [
    "mes points marchent dans tous les bars", "les points sont valables partout", "je peux utiliser mes points dans un autre club",
  ], repondre: () => r("Tes points forment un seul solde. Chaque établissement a ses propres récompenses dans Récompenses : tu les échanges là où tu es.") },

  // STORY
  { id: "story_etat", signal: /\b(mentionne|poste|publie|partage|tague|tagge)\b.*\b(rien|pas de points|toujours pas|mais|et alors)\b|\bstory\b.*\b(en attente|validee?|verifiee?|pris en compte|vue)\b|\b(combien de temps|delai)\b.*\b(valid|verif)\w*/, sujet: "Story", mots: ["story", "validee", "attente"], exemples: [
    "j ai bien mentionne le club mais rien", "j ai tague le bar et toujours pas de points", "j ai mis le club en story mais rien",
    "ma story est validee", "ma story n a pas ete validee", "ou en est ma story", "story en attente", "ma story a ete prise en compte",
    "j ai poste une story hier", "vous avez vu ma story", "story pas validee",
  ], repondre: etatStory },
  { id: "story_refusee", sujet: "Story", mots: ["refus", "refusee", "refus", "rejetee"], exemples: [
    "ma story n a pas ete acceptee", "ma story compte pas", "pourquoi ma story compte pas",
    "pourquoi ma story est refusee", "story refusee", "ma story a ete rejetee", "on m a refuse ma story",
  ], repondre: etatStory },
  { id: "story_comment", signal: /\bcomment\b.*\b(poster|poste|faire|publier|mettre|partager)\b.*\bstory\b|\b(etapes|marche a suivre)\b.*\bstory\b/, mots: ["poster", "publier", "comment"], exemples: [
    "comment poster une story pour avoir des points", "comment je fais ma story", "c est quoi les etapes pour la story",
    "comment poster une story", "comment ca marche la story", "comment faire une story pour avoir des points", "je dois faire quoi pour la story",
  ], repondre: () => r("Sur place, prends ta photo ou ta vidéo, ajoute l'autocollant Mention avec le compte de l'établissement (affiché dans l'onglet Story, prêt à copier), puis partage-la en story. Garde-la en ligne : elle est vérifiée et tes 100 points arrivent environ 24 h après.") },
  { id: "story_mention", signal: /\b(qui|quel compte)\b.*\b(tag|mentionn|identifi)\w*|\b(tag|taguer|tagger|mentionner|identifier)\w* qui\b|\b(dois|faut|faudrait)\b.*\b(tag|mentionner|identifier)\w*|\bhashtag\b|\barobase\b|\bmentionner (\d+|deux|plusieurs)\b/, mots: ["mention", "mentionner", "tag", "identifier", "arobase"], exemples: [
    "je dois mettre un hashtag", "il faut mentionner le club",
    "quel compte je dois mentionner", "je tag qui", "c est quoi le compte insta du club", "je dois identifier qui dans ma story",
  ], repondre: mentionner },
  { id: "story_supprimee", signal: /\bstory\b.*\b(supprimee?|effacee?|archivee?|disparu)\b|\bgarder (la|ma) story\b|\b(reste|rester|garder|laisser)\b.*\b(combien|longtemps)\b|\bcombien de temps\b.*\b(garder|laisser|en ligne|rester|reste)\b|\b(supprime|efface|archive|enleve|retire)\w*\b.*\bstory\b/, mots: ["supprime", "effacee", "archivee"], exemples: [
    "j ai supprime ma story", "ma story a disparu avant 24h", "je peux supprimer ma story", "combien de temps garder la story",
  ], repondre: () => r("Garde ta story en ligne jusqu'à la vérification (elle dure 24 h sur Instagram, laisse-la jusqu'au bout). Une story supprimée avant ne peut pas être validée.") },
  { id: "story_plusieurs", signal: /\b(\d+|deux|trois|plusieurs) stor(y|ies)\b/, mots: ["plusieurs", "deux", "chaque"], exemples: [
    "je peux poster plusieurs stories", "deux stories le meme soir", "une story par soir", "combien de stories par soiree",
  ], repondre: () => r("Une story compte par soirée et par établissement. Tu peux en poster d'autres, mais une seule rapporte des points ce soir-là.") },
  { id: "story_format", signal: /\b(reel|reels|tiktok|feed|post normal|photo normale|publication normale|carrousel|video|videos)\b|\bposts?\b/, mots: ["reel", "tiktok", "post", "publication"], exemples: [
    "une video ca marche", "je peux faire une video", "photo ou video",
    "est ce qu un reel compte", "je peux poster sur tiktok", "un post normal ca marche", "une publication au lieu d une story",
  ], repondre: () => r("Pour l'instant, seules les stories Instagram rapportent des points. Un reel, un post ou un TikTok ne sont pas comptés.") },
  { id: "compte_prive", mots: ["prive", "public"], exemples: [
    "mon compte instagram est prive", "ca marche si mon insta est prive", "faut il un compte public",
  ], repondre: () => r("Oui : quand tu mentionnes l'établissement, Instagram lui envoie ta story même si ton compte est privé. Vérifie juste que la mention est bien le bon compte.") },
  { id: "pseudo_insta", mots: ["pseudo", "instagram", "compte"], exemples: [
    "je me suis trompe de pseudo instagram", "changer mon compte insta", "mon pseudo insta est faux", "j ai change de compte instagram", "quel compte instagram est relie",
  ], repondre: monPseudo },

  // SCAN
  { id: "scan", signal: /^(?!.*\bbons?\b).*\b(qr|scan)\w*\b/, mots: ["qr", "scan", "scanner", "camera"], exemples: [
    "pourquoi j ai 0 points alors que j ai scanne", "j ai scanne mais pas de points",
    "comment scanner le qr code", "le qr code ne marche pas", "le scan ne marche pas", "ma camera ne s ouvre pas", "j ai scanne et rien",
    "ou est le qr code", "points du qr", "scanner a l entree",
  ], repondre: scanDuClient },

  // RECOMPENSES
  { id: "bons", signal: /\b(utilise[rz]? (un|mon|le) bon|mes bons|ou (est|sont) mon bon|voir mes bons|trouve (plus|pas) mon bon)\b/, sujet: "Récompense", mots: ["bon", "ticket", "coupon"], exemples: [
    "ou est mon bon", "je retrouve plus mon bon", "ou sont mes recompenses", "j ai echange mais je vois rien", "mon ticket a disparu", "comment utiliser mon bon",
  ], repondre: bonsDuClient },
  { id: "echanger", sujet: "Récompense", mots: ["echanger", "gratuit", "offert"], exemples: [
    "comment avoir un cocktail gratuit", "comment echanger mes points", "comment prendre une recompense", "je veux une boisson offerte", "comment on a les recompenses",
  ], repondre: (c) => r(`Ouvre Récompenses, choisis une récompense et touche Échanger : un bon avec un QR code s'affiche, à montrer au bar ou à l'entrée le soir même. ${solde(c)}${prochaineRecompense(c)}`) },
  { id: "bon_refuse", signal: /\b(bon|recompense|cocktail|coupon|ticket)\b.*\b(refus|marche pas|passe pas|accepte pas|voulu|faux|invalide|pas valable|deja utilise)|\b(barman|serveur|serveuse|videur|bar|staff)\b.*\b(refus|veut pas|voulu pas|a pas voulu|faux|invalide)\b/, sujet: "Récompense", mots: ["refus", "donner", "refuse", "barman", "videur", "accepte"], exemples: [
    "le bar veut pas me donner ma recompense", "ils refusent mon bon", "le serveur refuse mon cocktail",
    "le barman a refuse mon bon", "le videur n a pas accepte", "mon bon ne marche pas au bar", "ils ont pas voulu de mon bon", "le bar dit que mon bon est deja utilise",
  ], repondre: () => r(`Désolé pour ça. Dis-nous dans quel établissement et à quelle heure, ton bon n'est pas perdu. ${TRANSMIS}`, true) },
  { id: "bon_validite", signal: /\b(valable|validite|un autre jour|plus tard|garder mon bon|bon (expire|demain)|utiliser (mon bon )?demain)\b/, mots: ["valable", "validite", "longtemps"], exemples: [
    "je peux utiliser mon bon un autre jour", "garder mon bon pour plus tard",
    "mon bon est valable combien de temps", "je peux utiliser mon bon demain", "le bon expire quand",
  ], repondre: () => r("Un bon se montre au bar ou à l'entrée le soir même. Tant qu'il n'a pas servi, il reste dans Récompenses, rubrique Mes bons.") },
  { id: "annuler_echange", mots: ["annuler", "rembourser", "erreur"], exemples: [
    "j ai echange par erreur", "annuler un echange", "rembourser mes points", "je me suis trompe de recompense",
  ], repondre: () => r(`Un échange ne s'annule pas depuis l'appli. Dis-nous quelle récompense et quand, on regarde. ${TRANSMIS}`, true) },
  { id: "pas_assez", mots: ["assez", "manque", "cher"], exemples: [
    "j ai pas assez de points", "la recompense est trop chere", "il me manque des points pour la recompense",
  ], repondre: (c) => r(`${solde(c)}${prochaineRecompense(c) || " Chaque récompense affiche son prix dans Récompenses."} Pour aller plus vite : une story rapporte 100 points, le QR 15, le cadeau du jour jusqu'à 20.`) },
  { id: "epuise", mots: ["epuise", "stock", "rupture"], exemples: [
    "la recompense est epuisee", "plus de stock", "pourquoi c est marque epuise",
  ], repondre: () => r("Certaines récompenses ont un stock limité fixé par l'établissement. Quand il est épuisé, elle revient quand le club la recharge.") },

  // CADEAUX
  { id: "cadeau_jour", signal: /^(?!.*bienvenue).*\bcadeau\b|\b(jackpot|ma serie)\b/, mots: ["cadeau", "jour", "serie", "jackpot", "quotidien"], exemples: [
    "a quoi sert le cadeau", "c est quoi le cadeau", "j ai rate un jour de cadeau",
    "c est quoi le cadeau du jour", "le cadeau du jour a disparu", "je vois pas le cadeau", "comment marche la serie", "jackpot", "cadeau quotidien",
  ], repondre: cadeauDuJour },
  { id: "bienvenue", signal: /\bbienvenue\b/, mots: ["bienvenue", "inscription"], exemples: [
    "j ai pas eu mon cadeau de bienvenue", "les 50 points de bienvenue", "cadeau d inscription", "bonus de bienvenue",
  ], repondre: bienvenue },

  // PARRAINAGE
  { id: "parrainage", signal: /\bcombien\b.*\b(invit|parrain)\w*|\b(invit|parrain)\w*\b.*\bcombien\b|\bcomment (parrainer|inviter)\b|\blien d invitation\b|\bmon lien\b/, mots: ["parrainage", "parrainer", "inviter", "lien"], exemples: [
    "comment parrainer un ami", "comment inviter mes potes", "c est quoi le parrainage", "ou est mon lien d invitation", "combien rapporte un parrainage",
  ], repondre: parrainage },
  { id: "parrainage_rate", signal: /\b(parrain|lien|invite)\w*\b.*\b(rien (eu|recu)|pas (eu|recu)|toujours pas|marche pas|fonctionne pas)\b|\b(ami|pote)s? .*inscrit.*\b(rien|pas)\b|\bparrainage (marche|fonctionne) pas\b/, mots: ["lien", "ami", "inscrit", "filleul"], exemples: [
    "mon ami a utilise mon lien mais j ai pas les points", "j ai pas eu les 100 points du parrainage",
    "mon ami s est inscrit mais j ai rien eu", "mon pote a cree son compte et j ai pas les points", "parrainage pas pris en compte", "j ai invite quelqu un et rien",
  ], repondre: parrainageRate },

  // COMPTE ET CONNEXION
  { id: "connexion_code", signal: /\b(code (invalide|expire|faux|incorrect)|pas recu (le|de) (code|mail)|recois pas (le|de) (code|mail)|reçu de mail|arrive pas a (me )?(co|connecter))\b/, sujet: "Compte", mots: ["code", "connecter", "connexion", "mail"], exemples: [
    "je recois pas le code", "le code ne marche pas", "j arrive pas a me connecter", "code invalide", "code expire", "pas recu le mail de connexion",
  ], repondre: () => r("Le code à 6 chiffres arrive par e-mail en moins d'une minute : regarde dans les spams et les promotions, vérifie l'adresse tapée, et utilise toujours le DERNIER code reçu (il expire vite). Attends une minute avant d'en redemander un. Tu peux aussi utiliser Continuer avec Google.") },
  { id: "apple", mots: ["apple"], exemples: [
    "se connecter avec apple", "le bouton apple ne marche pas", "connexion apple",
  ], repondre: () => r("La connexion avec Apple arrive bientôt. En attendant, utilise ton e-mail (un code te sera envoyé) ou Continuer avec Google.") },
  { id: "changer_infos", signal: /\b(mauvais (mail|e mail|email|nom)|mauvaise adresse|changer (de |mon |d )?(mail|email|adresse|nom|photo)|modifier (mon|ma) (mail|email|adresse|nom|photo))\b/, sujet: "Compte", mots: ["changer", "modifier", "nom", "email", "photo"], exemples: [
    "changer mon nom", "modifier mon email", "changer ma photo de profil", "modifier mes informations", "changer d adresse mail",
  ], repondre: () => r("Ton nom, ton pseudo Instagram, ton e-mail et ta photo se changent dans Profil, Données personnelles. Pour l'e-mail, un lien de confirmation part sur la nouvelle adresse.") },
  { id: "supprimer", signal: /\b(supprim|effac(er|ez) (tout|mon compte|mes donnees)|desinscri|fermer mon compte)/, mots: ["supprimer", "suppression", "desinscrire"], exemples: [
    "supprimer mon compte", "je veux me desinscrire", "effacer mes donnees", "comment fermer mon compte",
  ], repondre: () => r("Profil, Données personnelles, tout en bas : Supprimer mon compte. C'est définitif, tes points et tes bons sont perdus.") },
  { id: "deconnexion", mots: ["deconnecter", "deconnexion"], exemples: [
    "comment me deconnecter", "se deconnecter", "changer de compte",
  ], repondre: () => r("Profil, Données personnelles, puis Se déconnecter. Tu te reconnectes avec la même adresse e-mail : tes points t'attendent.") },
  { id: "nouveau_telephone", signal: /\b(supprime|desinstalle|efface|reinstalle|reinstaller|perdu|vole|change|nouveau)\w* (l |mon |de )?(app|appli|application|telephone|portable|tel)\b/, mots: ["telephone", "portable", "perdu", "vole"], exemples: [
    "j ai change de telephone", "nouveau portable je perds mes points", "j ai perdu mon telephone", "reinstaller l appli",
  ], repondre: () => r("Tes points sont liés à ton compte, pas au téléphone. Sur le nouveau, ouvre Noctify et connecte-toi avec la même adresse e-mail (ou le même Google) : tout est là.") },
  { id: "plusieurs_comptes", mots: ["plusieurs", "deuxieme", "second"], exemples: [
    "je peux avoir deux comptes", "j ai cree un deuxieme compte", "fusionner mes comptes",
  ], repondre: () => r(`Un seul compte par personne : le cadeau de bienvenue ne se prend qu'une fois. Si tu as créé deux comptes par erreur, dis-nous lequel garder. ${TRANSMIS}`, true) },
  { id: "donnees", mots: ["donnees", "rgpd", "vendre", "confidentialite"], exemples: [
    "vous faites quoi de mes donnees", "mes donnees sont vendues", "confidentialite", "rgpd",
  ], repondre: () => r("On garde tes données pour te créditer tes points et reconnaître tes stories. Elles ne sont ni vendues ni cédées. La politique de confidentialité se lit dans Profil, Données personnelles, et tu peux tout supprimer au même endroit.") },

  // L'APPLI
  { id: "installer", signal: /\b(installer|telecharger|app ?store|play ?store|ecran d accueil)\b|\b(ordinateur|ordi|pc|mac|tablette|ipad)\b/, mots: ["installer", "telephone", "installer", "telecharger", "ecran", "accueil"], exemples: [
    "l appli existe sur android", "il y a une appli iphone", "je la trouve pas sur le play store",
    "comment installer l appli", "telecharger l application", "elle est sur l app store", "ajouter sur l ecran d accueil", "c est une vraie appli",
  ], repondre: () => r("Sur iPhone : ouvre Noctify dans Safari, touche Partager puis Sur l'écran d'accueil. Sur Android : menu du navigateur puis Installer l'application. L'icône Noctify apparaît comme une appli.") },
  { id: "notifications", signal: /\bnotif/, mots: ["notification", "notif", "alerte"], exemples: [
    "comment activer les notifications", "je recois pas de notifs", "les notifications marchent pas sur mon iphone", "les notifications marchent pas", "desactiver les notifications",
  ], repondre: () => r("Sur iPhone, ajoute d'abord Noctify à ton écran d'accueil (Partager, puis Sur l'écran d'accueil), ouvre-la depuis cette icône, puis active les notifications en haut du Profil. Sur Android, active-les directement dans le Profil. Tu es prévenu quand tes points de story arrivent.") },
  { id: "gratuit", mots: ["payant", "gratuit", "prix", "abonnement"], exemples: [
    "c est payant", "l appli est gratuite", "c est gratuit l appli", "je dois payer quelque chose", "faut payer", "il y a un abonnement",
  ], repondre: () => r("Noctify est gratuite pour toi : pas d'abonnement, pas d'achat. Ce sont les établissements partenaires qui offrent les récompenses.") },
  { id: "fonctionnement", mots: ["marche", "principe", "fonctionne", "noctify"], exemples: [
    "comment ca marche", "c est quoi noctify", "je comprends pas le principe", "a quoi sert l appli",
  ], repondre: () => r("Tu sors dans un établissement partenaire, tu scannes son QR (15 points) et tu le mentionnes dans ta story Instagram (100 points). Tes points s'échangent ensuite dans Récompenses contre des boissons, des entrées ou des avantages, à montrer au bar.") },
  { id: "localisation", signal: /\b(position|localisation|gps|geolocalisation)\b/, mots: ["carte", "localisation", "position", "gps"], exemples: [
    "la carte ne me trouve pas", "activer la localisation", "la carte marche pas", "pourquoi elle demande ma position",
  ], repondre: () => r("La position sert seulement à trier les établissements du plus proche au plus loin sur la Carte. Si elle ne marche pas, autorise la localisation pour ton navigateur dans les réglages du téléphone. L'appli marche aussi sans.") },
  { id: "langue", mots: ["anglais", "langue", "english", "neerlandais"], exemples: [
    "l appli existe en anglais", "changer la langue", "english please",
  ], repondre: () => r("Pour l'instant, Noctify n'existe qu'en français.") },
  { id: "etablissements", signal: /\b(ajouter des (bars|clubs)|autres (bars|clubs|villes)|quelles? villes?|presents? ou|vous etes ou|ou (etes vous|vous trouver)|dispo ou|disponible ou|a (namur|liege|paris|anvers|gand|charleroi|mons|lille|lyon|bruges|louvain))\b/, sujet: "Établissement", mots: ["etablissement", "bar", "club", "etablissement", "ville", "partenaire"], exemples: [
    "vous etes presents ou", "c est disponible ou",
    "vous avez le mirano", "dans quelles villes vous etes", "il y a quels clubs",
    "quels bars sont partenaires", "je trouve pas mon club", "il y a des bars a liege", "ajoutez le fuse", "c est dispo dans quelle ville", "pourquoi mon bar est pas dans l appli",
  ], repondre: etablissements },
  { id: "horaires", signal: /\b(ouvert|ouvre (a|quand|le|ce|ce soir|demain)|quelle heure|horaires?|ferme (a|quand|le)|adresse|c est ou|ou se trouve|ou est le club|ou est le bar)\b/, mots: ["horaire", "ouvert", "ferme", "adresse", "heure"], exemples: [
    "le club est ouvert ce soir", "c est quoi les horaires", "adresse du club", "a quelle heure ca ouvre",
  ], repondre: () => r("Les horaires, l'adresse et les infos de chaque établissement sont sur sa fiche : ouvre la Carte et touche l'établissement.") },
  { id: "gerant", signal: /\b(gerant|patron|proprio|proprietaire|je travaille dans|mon etablissement|devenir partenaire|etre partenaire|(proposer|inscrire|ajouter|mettre) mon (bar|club|etablissement|resto|restaurant))\b/, mots: ["gerant", "club", "bar", "gerant", "proprietaire", "partenariat", "patron"], exemples: [
    "je gere un bar", "je gere une boite de nuit", "je possede un club",
    "je suis gerant d un bar", "je veux mettre mon etablissement", "devenir partenaire", "j ai un club comment rejoindre",
  ], repondre: () => r("Avec plaisir ! Dans Profil, touche « Vous gérez un établissement ? » et laisse tes coordonnées : on te recontacte pour installer Noctify dans ton établissement.") },
];

/* LES QUESTIONS DE L'ECRAN AIDE & SUPPORT (SUJETS_SUPPORT dans
   app-preview.html). Toucher l'une d'elles l'envoie telle quelle ; elle a SA
   reponse, sans passer par la reconnaissance du texte (Julien, 16/09/2026 :
   « pour chaque question, une reponse predefinie, et si c'est autre chose,
   dire que l'equipe va te contacter »). La cle est le texte de la question,
   normalise (minuscules, sans accents ni apostrophes). */
export const QUESTIONS_PREDEFINIES = {
  "je n ai pas recu mes points": { entree: "points_pas_recus" },
  "ma story n a pas ete validee": { entree: "story_etat" },
  "un probleme avec une recompense": {
    entree: "bons",
    ajout: "Si le bar ou l'entrée a refusé ton bon, dis-nous où et à quelle heure : on s'en occupe.",
  },
  "je ne trouve pas un etablissement": { entree: "etablissements" },
  "mon compte ou ma connexion": {
    texte: "Ton nom, ton pseudo Instagram, ton e-mail et ta photo se changent dans Profil, Données personnelles. Pour te connecter, utilise le code à 6 chiffres reçu par e-mail (regarde aussi dans les spams) ou Continuer avec Google. Si ça bloque encore, décris-nous ce qui se passe.",
  },
  "autre chose": {
    texte: "Écris-nous en quelques mots ce qui se passe : l'équipe te contacte ici très vite.",
    transmettre: true,
  },
};
