// LE MOTEUR DE LA REPONSE AUTOMATIQUE DU SUPPORT -- SANS IA PAYANTE.
//
// Julien, 16/09/2026 : « ne pas mettre ChatGPT sur le coup et ne pas payer »,
// puis « qu'il soit vraiment efficace, qu'il puisse repondre a beaucoup de
// trucs ». Pas de modele de langage : une recherche dans la base de
// connaissances (baseSupport.js), faite pour la facon dont les gens ecrivent
// vraiment dans un chat :
//   - abreviations et argot (« jai pa eu mes pts », « g pas recu », « co ») ;
//   - fautes de frappe (« stroy », « recompence ») : une lettre d'ecart ;
//   - deux questions dans le meme message : deux reponses ;
//   - les relances courtes (« et c'est quand ? ») : on reprend le sujet d'avant.
// Chaque reponse lit le compte du client quand c'est utile. Ce qu'on ne
// reconnait pas avec assez de certitude est TRANSMIS a Julien, jamais devine.
//
// Pur et teste (scripts/test-reponse-auto.mjs) : aucune dependance au reseau.

import { ENTREES, TRANSMIS, QUESTIONS_PREDEFINIES } from "./baseSupport.js";

export const ETIQUETTE_TRANSMIS = "[Transmis]";
export const REPONSES_MAX_24H = 8;
export const SILENCE_APRES_HUMAIN_MS = 12 * 60 * 60 * 1000;
// En dessous, on ne sait pas : on transmet. Regle avec les cas du test.
export const SEUIL = 0.35;

/**
 * Faut-il repondre automatiquement au dernier message ?
 * @param {Array<{auteur:string, message?:string, created_at:string}>} messages - du plus recent au plus ancien
 */
export function doitRepondre(messages, maintenant = new Date()) {
  const liste = messages || [];
  const dernier = liste[0];
  if (!dernier || dernier.auteur !== "client") return { repondre: false, raison: "pas_de_message_client" };
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

/* ================= Le langage ================= */

export function normaliser(texte) {
  return String(texte || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9@]+/g, " ")
    .trim();
}

/** Le sujet choisi dans l'appli (« [Points] ... ») et le texte libre. */
export function decouper(message) {
  const m = /^\[([^\]]{1,30})\]\s*/.exec(String(message || ""));
  return m ? { sujet: m[1], texte: String(message).slice(m[0].length) } : { sujet: null, texte: String(message || "") };
}

// L'ecrit de chat, ramene au mot entier. Cle et valeur deja normalisees.
const ABREVIATIONS = {
  jai: "ai", g: "ai", chui: "suis", jsuis: "suis", jsp: "sais", cest: "est", ces: "est", sa: "ca",
  pk: "pourquoi", pq: "pourquoi", pourkoi: "pourquoi", koi: "quoi", qd: "quand", kan: "quand", cmt: "comment", comen: "comment",
  pr: "pour", ds: "dans", bcp: "beaucoup", tjr: "toujours", tjrs: "toujours", tt: "tout", mm: "meme", ya: "y", nn: "non",
  pts: "points", pt: "points", insta: "instagram", ig: "instagram", appli: "app", application: "app", co: "connecter",
  notif: "notification", notifs: "notification", mdp: "code", dispo: "disponible", recu: "recevoir", recus: "recevoir",
  recois: "recevoir", recoit: "recevoir", eu: "recevoir", touche: "recevoir", pote: "ami", potes: "ami", copain: "ami", copine: "ami",
  pa: "pas", stories: "story", storys: "story", storie: "story", scanne: "scan", scanner: "scan", scannee: "scan", scane: "scan",
  qrcode: "qr", tickets: "bon", ticket: "bon", coupon: "bon", voucher: "bon", bons: "bon", boite: "club", discotheque: "club",
  soiree: "soir", ce: "", svp: "", stp: "", merci: "", bonjour: "", salut: "", slt: "", bjr: "", hello: "", coucou: "",
};

const MOTS_VIDES = new Set((
  "le la les l un une des de du d j je tu il elle on nous vous ils elles mon ma mes ton ta tes son sa ses notre votre leur leurs " +
  "et ou a au aux en y est ai as avons avez ont etre suis es sommes etes sont ete avoir cet cette ces qui que qu quoi dont " +
  "pour par sur dans avec sans ne n pas plus tres bien aussi mais donc car si se s me m te t lui c ca cela ceci moi toi " +
  "fait faire fais peux peut pouvez veux veut voudrais alors deja encore toujours juste vraiment rien " +
  "quel quelle quels quelles il y"
).split(" "));

/** « recompenses » et « recompense », « refusee » et « refuse » : meme radical.
    Volontairement prudent : « donner » et « donnees » doivent rester deux mots. */
function radical(mot) {
  let m = mot;
  if (m.length > 4 && /(s|x)$/.test(m)) m = m.slice(0, -1);
  if (m.length > 5 && /ee$/.test(m)) m = m.slice(0, -1);
  // « gratuite » -> « gratuit », mais « valide » et « donne » restent entiers.
  if (m.length > 6 && /[^e]e$/.test(m)) m = m.slice(0, -1);
  return m.slice(0, 8);
}

/* Les EXPRESSIONS avant les mots : une negation ou une tournure change le
   sens de mots qui, seuls, parleraient d'autre chose. Appliquees au texte
   normalise, dans l'ordre. */
const EXPRESSIONS = [
  [/\b(pas|jamais) (ete |etait )?(acceptee?|validee?|pris en compte|comptee?)\b|\bcompte pas\b|\bcompte plus\b|\brejetee?\b|\brefusee?s?\b|\b(veut|voulu|veulent|voulait) pas\b|\ba pas voulu\b|\bont pas voulu\b/g, " refus "],
  [/\bboite de nuit\b|\bboite\b|\bdiscotheque\b|\bdisco\b/g, " club "],
  [/\b(je )?(gere|gerer|dirige|possede|tiens)\b/g, " gerant "],
  [/\bapp ?store\b|\bplay ?store\b|\bandroid\b/g, " installer telephone "],
  [/\biphone\b|\bsamsung\b|\bportable\b/g, " telephone "],
  [/\bhashtag\b|#/g, " mention "],
  [/\bun autre jour\b|\bplus tard\b|\bla semaine prochaine\b|\b(bon|utiliser) demain\b/g, " valable "],
  [/\bplus de points qu\b|\bpoints en plus\b/g, " solde "],
  [/\bavec \d+ points\b|\bpour \d+ points\b/g, " combien solde "],
  [/\b(ca|elle|il|votre appli|l appli) (est )?(nulle?|pourrie?|ne marche jamais|marche jamais)\b/g, " bug "],
  [/\bsert a quoi\b|\ba quoi sert\b|\bc est quoi\b/g, " quoi "],
  [/\bvous avez (le|la|les)\b|\bil y a (le|la)\b/g, " etablissement "],
  [/\butilise mon lien\b|\bavec mon lien\b|\bpar mon lien\b/g, " ami inscrit lien "],
];

/** Les radicaux porteurs de sens d'un texte. */
export function jetons(texte) {
  const sortie = [];
  let t = " " + normaliser(texte) + " ";
  for (const [re, remplacement] of EXPRESSIONS) t = t.replace(re, remplacement);
  for (const brut of t.trim().split(/\s+/)) {
    if (!brut) continue;
    const mot = Object.prototype.hasOwnProperty.call(ABREVIATIONS, brut) ? ABREVIATIONS[brut] : brut;
    if (!mot || MOTS_VIDES.has(mot)) continue;
    sortie.push(radical(mot));
  }
  return sortie;
}

function distanceAuPlusUn(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, ecarts = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++ecarts > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      // Deux lettres inversees (« stroy ») comptent pour une seule faute.
      if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; continue; }
      i++; j++;
    }
  }
  return ecarts + (a.length - i) + (b.length - j) <= 1;
}

/* ================= L'index de la base ================= */

const INDEX = (() => {
  const vocabulaire = new Set();
  const entrees = ENTREES.map((e) => {
    const exemples = e.exemples.map((x) => new Set(jetons(x)));
    const mots = new Set((e.mots || []).flatMap((x) => jetons(x)));
    exemples.forEach((s) => s.forEach((t) => vocabulaire.add(t)));
    mots.forEach((t) => vocabulaire.add(t));
    return { ...e, exemplesJetons: exemples, motsJetons: mots };
  });
  // Un mot present dans peu d'entrees pese plus lourd (« parrain » plus que « point »).
  const df = new Map();
  for (const e of entrees) {
    const tous = new Set([...e.motsJetons, ...e.exemplesJetons.flatMap((s) => [...s])]);
    tous.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  }
  const poids = (t) => Math.log(1 + entrees.length / (df.get(t) || entrees.length));
  return { entrees, vocabulaire: [...vocabulaire], poids };
})();

/** Ramene un mot tape au mot connu le plus proche (une faute au plus).
    Seulement pour les mots assez longs, et jamais sur la premiere lettre :
    sinon « bonne » devenait « donne » et une pizzeria parlait de donnees. */
function corriger(t) {
  if (t.length < 5 || INDEX.vocabulaire.includes(t)) return t;
  return INDEX.vocabulaire.find((v) => v.length >= 5 && v[0] === t[0] && distanceAuPlusUn(t, v)) || t;
}

/**
 * Les entrees classees pour un texte.
 * @returns {Array<{entree: object, score: number}>}
 */
export function classer(texte, sujet = null) {
  const brut = " " + normaliser(texte) + " ";
  const toks = [...new Set(jetons(texte).map(corriger))];
  if (!toks.length) return [];
  const { poids } = INDEX;
  const normeMessage = Math.sqrt(toks.reduce((s, t) => s + poids(t) ** 2, 0)) || 1;
  const resultats = INDEX.entrees.map((e) => {
    let meilleur = 0;
    for (const ex of e.exemplesJetons) {
      let commun = 0, normeEx = 0;
      ex.forEach((t) => { normeEx += poids(t) ** 2; });
      for (const t of toks) if (ex.has(t)) commun += poids(t) ** 2;
      const s = commun / (normeMessage * (Math.sqrt(normeEx) || 1));
      if (s > meilleur) meilleur = s;
    }
    const forts = toks.filter((t) => e.motsJetons.has(t)).length;
    let score = meilleur + Math.min(0.24, forts * 0.12);
    // Une tournure qui designe le sujet a elle seule (baseSupport : signal).
    const signal = !!(e.signal && e.signal.test(brut));
    if (signal) score += 0.55;
    // Ni mot fort ni signal : une ressemblance de surface (« quel TEMPS il
    // fait » contre « combien de TEMPS garder la story ») ne suffit pas.
    if (!forts && !signal && meilleur < 0.75) score *= 0.5;
    if (sujet && e.sujet === sujet) score += 0.08;
    return { entree: e, score };
  });
  return resultats.sort((a, b) => b.score - a.score);
}

/* ================= Les phrases a part ================= */

const SOCIAL = [
  ["humain", /\b(attends?|attend) (une |ma |votre )?reponse\b|\b(toujours )?pas de reponse\b|\bpersonne ne m a repondu\b|\ballo\b|\by ?a personne\b|\bil y a personne\b|\bquelqu un (est la|repond)\b|\bpersonne (ne )?(repond|me repond)\b|\bvous etes la\b|\by a quelqu un\b|\b(parler|discuter|joindre|contacter)\b.*\b(humain|personne|quelqu un|conseiller|vrai|equipe|responsable)\b|\b(un humain|une vraie personne|pas un robot|t es un robot|es tu un robot)\b/,
    () => ({ texte: `Bien sûr. ${TRANSMIS}`, transmettre: true })],
  ["colere", /\b(arnaque|escroc|honte|scandale|avocat|plainte|voleur|nul a chier|merde|putain|fdp|connard|degoute|m avez vole|me volez|vous volez|nous volez|du vol|voleurs?|on se fout de)\b/,
    () => ({ texte: `Je comprends, et on prend ça au sérieux. ${TRANSMIS}`, transmettre: true })],
  ["bug", /\b(bug|beug|bugue|plante|crash|crashe|ecran (blanc|noir)|freeze|fige|message d erreur|page blanche|marche jamais|marche plus du tout|s ouvre pas|ouvre plus|charge pas|charge plus|reste bloquee?)\b|\b(appli|app|application|site)\b.*\b(nulle?|pourrie?|ne marche pas)\b/,
    () => ({ texte: `Merci de nous le signaler. Dis-nous sur quel écran et ce que tu faisais juste avant, une capture d'écran aide beaucoup. En attendant, ferme complètement l'appli et rouvre-la. ${TRANSMIS}`, transmettre: true })],
  ["salut", /^\s*(bonjour|bonsoir|salut|hello|coucou|hey|yo|slt|bjr|cc|wesh)( a (tous|vous))?\s*$/,
    () => ({ texte: "Salut ! Dis-nous ce qui se passe en quelques mots, on regarde ça tout de suite.", transmettre: false })],
  ["merci", /^\s*(merci )?(c est |probleme )?(regle|resolu|bon c est regle)\s*$|^\s*((top|super|ok|parfait|nickel|cool|genial|ah) )?merci( c est (regle|bon|resolu))?\s*$|^\s*((top|super|ok|parfait|nickel|cool|genial|ah) )?merci( beaucoup| bien| bcp| infiniment| pour (la|ta|votre) (reponse|aide))?( (top|super))?\s*$|^\s*(ok( merci)?|oki|d accord|dac|super|parfait|top|cool|ca marche|nickel|genial|ok ca marche|c est bon|trop bien|au top)\s*$/,
    () => ({ texte: "Avec plaisir, bonne soirée !", transmettre: false })],
  ["au_revoir", /^\s*(au revoir|bye|a plus|a\+|bonne (soiree|nuit|journee))\s*$/,
    () => ({ texte: "Bonne soirée !", transmettre: false })],
];

function social(texte) {
  const t = normaliser(texte);
  for (const [nom, re, fn] of SOCIAL) if (re.test(t)) return { nom, ...fn() };
  return null;
}

/** Decoupe un message en questions (« ... ? et aussi ... »). */
function questions(texte) {
  return String(texte)
    .split(/[?!.\n;]+|\bet aussi\b|\baussi\b|, et\b|\bpar contre\b|\bautre chose\b/i)
    .map((x) => x.trim())
    .filter((x) => jetons(x).length >= 1);
}

const RELANCE = /^\s*(et|mais|du coup|donc|ok mais|oui mais|ah)\b|\b(quand|combien|pourquoi|comment|toujours|encore|et apres|c est long)\b/;

const PRINCIPALE_DU_SUJET = {
  "Points": "points_pas_recus",
  "Story": "story_etat",
  "Récompense": "bons",
  "Établissement": "etablissements",
  "Compte": "changer_infos",
};

/**
 * La reponse a un message, a partir du compte du client.
 * @param {string} message - le dernier message du client (avec son sujet eventuel)
 * @param {object} compte - voir api/credit-clubbeur.js (repondreAutomatiquement)
 * @param {Date} [maintenant]
 * @param {string[]} [precedents] - les messages client d'avant, du plus recent au plus ancien
 * @returns {{texte: string, transmettre: boolean, intention: string}}
 */
export function repondre(message, compte = {}, maintenant = new Date(), precedents = []) {
  const { sujet, texte } = decouper(message);
  const nbJetons = jetons(texte).length;

  // 0. Une question de l'ecran Aide & Support, touchee telle quelle : sa reponse prevue.
  const predefinie = QUESTIONS_PREDEFINIES[normaliser(texte)];
  if (predefinie) {
    if (predefinie.texte) {
      return { texte: predefinie.texte, transmettre: !!predefinie.transmettre, intention: "question:" + normaliser(texte) };
    }
    const entree = INDEX.entrees.find((x) => x.id === predefinie.entree);
    const rep = entree.repondre(compte, maintenant);
    const avecAjout = predefinie.ajout ? rep.texte + " " + predefinie.ajout : rep.texte;
    return { texte: avecAjout, transmettre: !!rep.transmettre, intention: entree.id };
  }

  // 1. Politesse, colere, bug, demande d'humain : a part.
  const s = social(texte);
  // « ma camera s'ouvre pas pour scanner » : un bug apparent, mais un sujet
  // precis que la base sait traiter. Le sujet l'emporte.
  const [meilleurSujet] = s && s.nom === "bug" ? classer(texte, sujet) : [];
  const bugGenerique = !(meilleurSujet && meilleurSujet.score >= 0.9);
  if (s && (s.nom !== "bug" || bugGenerique) && (s.transmettre || nbJetons <= 3)) {
    return { texte: s.texte, transmettre: s.transmettre, intention: s.nom };
  }

  // 2. Une ou deux questions reconnues dans le message.
  const trouvees = [];
  const morceaux = questions(texte);
  for (const q of morceaux.length > 1 ? morceaux : [texte]) {
    const [premier] = classer(q, sujet);
    if (premier && premier.score >= SEUIL && !trouvees.some((x) => x.entree.id === premier.entree.id)) trouvees.push(premier);
  }
  if (!trouvees.length && morceaux.length > 1) {
    const [premier] = classer(texte, sujet);
    if (premier && premier.score >= SEUIL) trouvees.push(premier);
  }

  // 3. Une relance courte (« et c'est quand ? ») : le sujet du message d'avant.
  if (!trouvees.length && nbJetons <= 6 && RELANCE.test(normaliser(texte))) {
    const avant = (precedents || []).find(Boolean);
    if (avant) {
      const d = decouper(avant);
      const [premier] = classer(d.texte, d.sujet || sujet);
      if (premier && premier.score >= SEUIL) trouvees.push(premier);
    }
  }

  // 4. Le sujet choisi sans texte exploitable : l'entree principale du sujet.
  if (!trouvees.length && sujet && nbJetons <= 2) {
    const e = INDEX.entrees.find((x) => x.id === PRINCIPALE_DU_SUJET[sujet]);
    if (e) trouvees.push({ entree: e, score: SEUIL });
  }

  if (!trouvees.length) {
    return { texte: `Je n'ai pas bien compris ta demande. ${TRANSMIS}`, transmettre: true, intention: "inconnu" };
  }

  const reponses = trouvees.slice(0, 2).map((x) => ({ ...x.entree.repondre(compte, maintenant), id: x.entree.id }));
  const textes = reponses.map((x) => x.texte);
  // Deux reponses qui transmettent : la phrase une seule fois, a la fin.
  if (textes.length === 2 && textes.every((t) => t.endsWith(TRANSMIS))) textes[0] = textes[0].slice(0, -TRANSMIS.length).trim();
  return {
    texte: textes.join(" "),
    transmettre: reponses.some((x) => x.transmettre),
    intention: reponses.map((x) => x.id).join("+"),
  };
}

/** Le message tel qu'il est enregistre (etiquette si transmis). */
export function messageEnregistre({ texte, transmettre }) {
  return transmettre ? `${ETIQUETTE_TRANSMIS} ${texte}` : texte;
}
