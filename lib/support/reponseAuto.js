// La reponse automatique du support de l'appli clubbeur -- SANS IA PAYANTE.
//
// Julien, 16/09/2026 : « comment faire pour ne pas mettre ChatGPT sur le coup
// et ne pas payer ». Pas de modele de langage : on reconnait DE QUOI parle le
// client (le sujet choisi + les mots de son message), on lit SON compte, et on
// repond avec des phrases ecrites a l'avance, remplies avec ses vraies donnees
// (« ta story du 15 sept. au Mirage est en cours de verification »).
//
// Avantages sur une IA : gratuit, instantane, et impossible d'inventer un
// delai ou un montant. Limite assumee : ce qu'on ne reconnait pas, on le
// TRANSMET a Julien au lieu de deviner.
//
// Pur et teste (scripts/test-reponse-auto.mjs) : aucune dependance au reseau.
// La lecture du compte est faite par api/credit-clubbeur.js.

import { DELAI_AUTO_VALIDATION_MS } from "../admin/pilotage.js";

export const ETIQUETTE_TRANSMIS = "[Transmis]";
// Au plus tant de reponses automatiques par personne sur 24 h.
export const REPONSES_MAX_24H = 8;
// Julien a repondu lui-meme recemment : la conversation est a lui.
export const SILENCE_APRES_HUMAIN_MS = 12 * 60 * 60 * 1000;

/**
 * Faut-il repondre automatiquement au dernier message ?
 * @param {Array<{auteur:string, message?:string, created_at:string}>} messages - du plus recent au plus ancien
 */
export function doitRepondre(messages, maintenant = new Date()) {
  const liste = messages || [];
  const dernier = liste[0];
  if (!dernier || dernier.auteur !== "client") return { repondre: false, raison: "pas_de_message_client" };
  // Les avis sur l'appli passent par la meme table : pas une question.
  if (/^(Avis|Commentaire) sur l'appli/.test(String(dernier.message || ""))) return { repondre: false, raison: "avis" };
  const t = new Date(maintenant).getTime();
  const humain = liste.find((m) => m.auteur === "admin");
  if (humain && t - new Date(humain.created_at).getTime() < SILENCE_APRES_HUMAIN_MS) {
    return { repondre: false, raison: "humain_recent" };
  }
  const recentes = liste.filter((m) => m.auteur === "ia" && t - new Date(m.created_at).getTime() < 24 * 3600 * 1000);
  if (recentes.length >= REPONSES_MAX_24H) return { repondre: false, raison: "limite_atteinte" };
  return { repondre: true };
}

/** Minuscules, sans accents : « Reçu » et « recu » se valent. */
export function normaliser(texte) {
  return String(texte || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Le sujet choisi dans l'appli (« [Points] ... ») et le texte libre. */
export function decouper(message) {
  const m = /^\[([^\]]{1,30})\]\s*/.exec(String(message || ""));
  return m ? { sujet: m[1], texte: String(message).slice(m[0].length) } : { sujet: null, texte: String(message || "") };
}

// Du plus fort au plus faible : le premier qui correspond l'emporte sur le
// sujet choisi, parce que le client ecrit parfois « Autre » pour un bug.
const INTENTIONS = [
  ["colere", /\b(arnaque|escroc|honte|scandale|rembours|avocat|plainte|voleur|nul a chier|merde|putain)\b/],
  ["bug", /\b(bug|beug|bugue|plante|crash|ecran (blanc|noir)|bloque|freeze|message d'erreur)\b/],
  ["salut", /^\s*(bonjour|bonsoir|salut|hello|coucou|hey|yo|slt|bjr)[\s!.,]*$/],
  ["merci", /^\s*(merci( beaucoup| bien)?|ok|oki|d'?accord|super|parfait|top|cool|ca marche|nickel|genial)[\s!.]*$/],
  ["suppression", /\b(supprim|efface|desinscri|fermer mon compte)/],
  ["notifications", /\bnotif/],
  ["connexion", /\b(connexion|connecter|connecte pas|(?<!qr )code|mot de passe|mdp|mail (pas|jamais) (recu|arrive)|pas recu (le|de) (code|mail))/],
  ["parrainage", /\b(parrain|filleul|invit|lien d'ami|ami s'est inscrit|mon ami)/],
  ["cadeau", /\b(cadeau|serie|jackpot|bienvenue)/],
  ["recompense", /\b(bons?\b|recompense|cocktail|shot|pinte|vestiaire|echang|barman|videur|au bar|a l'entree)/],
  ["scan", /\b(scan|qr)/],
  ["story", /\b(story|stories|storie|insta\w*|mention\w*|tag\w*|validee?s?|refusee?s?)\b/],
  ["points", /\b(point|pts|solde|credit|recu)/],
  ["etablissement", /\b(etablissement|trouve pas|introuvable|pas dans l'appli|ajouter (un|le|mon) (bar|club)|mon bar|mon club|partenaire)\b/],
  ["compte", /\b(pseudo|nom|e-?mail|adresse|photo de profil|compte)\b/],
  // En dernier : « ça marche pas » sans rien d'autre de reconnaissable.
  ["bug", /\b(marche pas|fonctionne pas|erreur)\b/],
];

const SUJET_VERS_INTENTION = {
  "Points": "points",
  "Story": "story",
  "Récompense": "recompense",
  "Établissement": "etablissement",
  "Compte": "compte",
};

export function intention(message) {
  const { sujet, texte } = decouper(message);
  const t = normaliser(texte);
  for (const [nom, re] of INTENTIONS) {
    if (re.test(t)) return nom;
  }
  return SUJET_VERS_INTENTION[sujet] || "inconnu";
}

function date(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { timeZone: "Europe/Brussels", day: "numeric", month: "short" });
}
function heure(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // « 17 h », « 17 h 30 » : comme on le dit.
  const [h, m] = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).split(":");
  return `${Number(h)} h${m === "00" ? "" : " " + m}`;
}
function jourLocal(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}
const nb = (n) => Number(n || 0).toLocaleString("fr-FR");
const pts = (n) => `${nb(n)} point${Math.abs(Number(n)) > 1 ? "s" : ""}`;
const au = (club) => (club ? ` au ${club}` : "");

const TRANSMIS = "Je transmets à l'équipe, on te répond ici très vite.";

function r(texte, transmettre = false) {
  return { texte, transmettre };
}

/* ---- Une reponse par intention ---- */

function repStory(c, maintenant) {
  const s = (c.stories || [])[0];
  if (!s) {
    return r("Je ne vois aucune story reçue sur ton compte. Pour qu'elle compte, mentionne l'établissement dans ta story Instagram avec le compte indiqué dans l'onglet Story, et laisse-la en ligne jusqu'à la vérification. Si tu l'as bien fait, précise où et quand si ce n'est pas déjà dit. " + TRANSMIS, true);
  }
  const quand = `du ${date(s.mentioned_at)}${au(s.club)}`;
  if (s.review_status === "validee") {
    return r(`Ta story ${quand} a été validée : +${pts(s.awarded_points)}. Ton solde est de ${pts(c.profil?.points_balance)}.`);
  }
  if (s.review_status === "refusee") {
    return r(`Ta story ${quand} a été refusée. Une story n'est validée que si elle mentionne l'établissement et qu'elle est encore en ligne au moment de la vérification. ${TRANSMIS}`, true);
  }
  const echeance = new Date(new Date(s.mentioned_at).getTime() + DELAI_AUTO_VALIDATION_MS);
  const reste = echeance.getTime() - new Date(maintenant).getTime();
  if (reste > -12 * 3600 * 1000) {
    return r(`Ta story ${quand} est en cours de vérification. Les points arrivent environ 24 h après, vers ${heure(echeance)} le ${date(echeance)}, si elle est encore en ligne.`);
  }
  return r(`Ta story ${quand} aurait dû être vérifiée depuis un moment. ${TRANSMIS}`, true);
}

function repPoints(c, maintenant) {
  const s = (c.stories || [])[0];
  if (s && !s.review_status) return repStory(c, maintenant);
  const bloques = (c.gains || []).filter((g) => g.released === false);
  if (bloques.length) {
    const g = bloques[0];
    return r(`Tes ${pts(g.amount)}${au(g.club)} sont bien là, mais ils se débloquent le ${date(g.unlocks_at)} à ${heure(g.unlocks_at)}. Ton solde disponible est de ${pts(c.profil?.points_balance)}.`);
  }
  const g = (c.gains || [])[0];
  const dernier = g ? ` Ton dernier gain : +${pts(g.amount)} le ${date(g.created_at)}${au(g.club)}.` : "";
  return r(`Ton solde est de ${pts(c.profil?.points_balance)}.${dernier} Une story rapporte 100 points environ 24 h après, un scan du QR 15 points tout de suite. S'il te manque des points après ce délai, précise où et quand. ${TRANSMIS}`, true);
}

function repScan(c, maintenant) {
  const scans = (c.gains || []).filter((g) => g.source === "scan");
  const aujourdhui = jourLocal(maintenant);
  const ceSoir = scans.find((g) => jourLocal(g.created_at) === aujourdhui);
  if (ceSoir) {
    return r(`Ton scan de ce soir${au(ceSoir.club)} t'a bien rapporté ${pts(ceSoir.amount)}. Le QR ne compte qu'une fois par soirée par établissement.`);
  }
  if (scans[0]) {
    return r(`Ton dernier scan date du ${date(scans[0].created_at)}${au(scans[0].club)} (+${pts(scans[0].amount)}). Scanne le QR affiché sur place depuis l'onglet Story : 15 points, une fois par soirée. S'il ne passe pas, dis-le-nous ici. ${TRANSMIS}`, true);
  }
  return r("Je ne vois aucun scan sur ton compte. Scanne le QR affiché dans l'établissement depuis l'onglet Story, ou avec l'appareil photo de ton téléphone : 15 points, une fois par soirée. S'il ne passe pas, dis-nous où tu étais. " + TRANSMIS, true);
}

function repRecompense(c, texte) {
  if (/\b(refus|pas accepte|pas voulu|voulu pas|marche pas|ne passe pas|deja utilise|expire)/.test(texte)) {
    return r(`Désolé pour ça. Dis-nous dans quel établissement et à quelle heure. ${TRANSMIS}`, true);
  }
  const libres = (c.bons || []).filter((b) => !b.used);
  if (libres.length) {
    const b = libres[0];
    return r(`Ton bon « ${b.titre || "récompense"} » du ${date(b.redeemed_at)} n'a pas encore servi : il est dans Récompenses, rubrique Mes bons. Montre son QR code au bar ou à l'entrée, le soir même.`);
  }
  return r(`Pour obtenir une récompense, ouvre Récompenses, choisis-la et touche Échanger : un bon avec un QR code s'affiche, à montrer au bar ou à l'entrée le soir même. Ton solde est de ${pts(c.profil?.points_balance)}.`);
}

function repCadeau(c, maintenant) {
  const aujourdhui = jourLocal(new Date(new Date(maintenant).getTime() - 10 * 3600 * 1000));
  const pris = (c.cadeaux || []).find((g) => g.gift_date === aujourdhui);
  const base = "Le cadeau du jour est dans Récompenses à partir de 10 h. Il monte sur 7 jours (2, 3, 4, 5, 6, 8 puis 20 points) et repart au début si tu sautes un jour.";
  if (pris) return r(`Tu as déjà pris ton cadeau aujourd'hui (+${pts(pris.amount)}, jour ${pris.jour} sur 7). Le prochain arrive demain à 10 h.`);
  if (!(c.gains || []).length) return r(`${base} Il faut d'abord avoir gagné des points dans un établissement, par exemple en scannant son QR.`);
  return r(base);
}

function repParrainage(c) {
  const n = c.parrainages || 0;
  const deja = n ? ` Tu as déjà ${n} ami${n > 1 ? "s" : ""} inscrit${n > 1 ? "s" : ""} grâce à toi.` : "";
  return r(`Tu gagnes 100 points quand un ami s'inscrit avec ton lien (Profil, Inviter des amis). Il doit ouvrir ton lien avant de créer son compte : un compte déjà créé ne peut plus être parrainé.${deja}`);
}

const REPONSES_FIXES = {
  notifications: r("Sur iPhone, ajoute d'abord Noctify à ton écran d'accueil (Partager, puis Sur l'écran d'accueil), ouvre l'appli depuis cette icône, puis active les notifications en haut du Profil. Sur Android, active-les directement dans le Profil."),
  suppression: r("Tu peux supprimer ton compte dans Profil, Données personnelles, tout en bas. C'est définitif : tes points et tes bons sont perdus."),
  compte: r("Ton nom, ton pseudo Instagram, ton e-mail et ta photo se changent dans Profil, Données personnelles. Si ça ne passe pas, décris-nous ce qui bloque."),
  connexion: r("Tu te connectes avec le code à 6 chiffres reçu par e-mail : regarde aussi dans les spams, et attends une minute avant d'en redemander un. Tu peux aussi utiliser Continuer avec Google. Si rien n'arrive, dis-le-nous ici. " + TRANSMIS, true),
  salut: r("Salut ! Dis-nous ce qui se passe en quelques mots, on regarde ça tout de suite."),
  etablissement: r(`Seuls les établissements partenaires apparaissent dans l'appli. Donne-nous le nom et la ville de celui que tu cherches, on le contacte. ${TRANSMIS}`, true),
  merci: r("Avec plaisir, bonne soirée !"),
  bug: r(`Merci de nous le signaler. Dis-nous sur quel écran et ce que tu faisais juste avant. ${TRANSMIS}`, true),
  colere: r(`Je comprends, on regarde ça sérieusement. ${TRANSMIS}`, true),
  inconnu: r(TRANSMIS, true),
};

/**
 * La reponse a un message, a partir du compte du client.
 * @param {string} message - le dernier message du client (avec son sujet eventuel)
 * @param {object} compte - { profil, stories, gains, bons, cadeaux, parrainages }
 * @returns {{texte: string, transmettre: boolean, intention: string}}
 */
export function repondre(message, compte = {}, maintenant = new Date()) {
  const quoi = intention(message);
  const texte = normaliser(decouper(message).texte);
  let rep;
  if (quoi === "story") rep = repStory(compte, maintenant);
  else if (quoi === "points") rep = repPoints(compte, maintenant);
  else if (quoi === "scan") rep = repScan(compte, maintenant);
  else if (quoi === "recompense") rep = repRecompense(compte, texte);
  else if (quoi === "cadeau") rep = repCadeau(compte, maintenant);
  else if (quoi === "parrainage") rep = repParrainage(compte);
  else rep = REPONSES_FIXES[quoi] || REPONSES_FIXES.inconnu;
  return { ...rep, intention: quoi };
}

/** Le message tel qu'il est enregistre (etiquette si transmis). */
export function messageEnregistre({ texte, transmettre }) {
  return transmettre ? `${ETIQUETTE_TRANSMIS} ${texte}` : texte;
}
