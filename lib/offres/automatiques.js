// Les e-mails automatiques des commerces, facon Joyn (04/10/2026).
//
// Le gerant regle une fois quels e-mails partent (et le coupon de chacun) ;
// ils partent ensuite seuls, envoyes par le cron de 18 h. Quatre types :
//   anniversaire : le jour J, une fois par an ;
//   bienvenue    : le lendemain du premier passage, une seule fois ;
//   absents      : pas revenu depuis N jours (30 par defaut), une fois par absence ;
//   hebdo        : ou il en est de ses points (voir rappels.js), une fois par semaine.
//
// Pur : pas de reseau, pas de base. Decide QUI recoit QUOI et ecrit le
// contenu. L'envoi vit dans envoyerRappels.js.
//
// Garde-fous : un seul e-mail par client et par jour, tous lieux confondus ;
// un client qui a dit non (consentements_offres.accepte = false) ne recoit
// plus rien de ce lieu ; le coupon n'est que du texte ecrit par le gerant.

import { createHash } from "node:crypto";
import { messageRappel, JOURS_ENTRE_RAPPELS } from "./rappels.js";

export const TYPES = ["anniversaire", "bienvenue", "absents", "hebdo"];
const JOUR = 864e5;

export const REGLAGES_DEFAUT = {
  anniversaire: { actif: true, coupon: "" },
  bienvenue: { actif: true, coupon: "" },
  absents: { actif: true, coupon: "", jours: 30 },
  hebdo: { actif: true },
};

/** Les reglages du gerant, completes et bornes (ce qui vient du navigateur n'est pas fiable). */
export function lireReglages(brut) {
  const r = brut && typeof brut === "object" ? brut : {};
  const coupon = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const actif = (v, d) => (typeof v === "boolean" ? v : d);
  const jours = Math.round(Number(r.absents?.jours));
  return {
    anniversaire: { actif: actif(r.anniversaire?.actif, true), coupon: coupon(r.anniversaire?.coupon) },
    bienvenue: { actif: actif(r.bienvenue?.actif, true), coupon: coupon(r.bienvenue?.coupon) },
    absents: { actif: actif(r.absents?.actif, true), coupon: coupon(r.absents?.coupon), jours: Number.isFinite(jours) ? Math.min(120, Math.max(14, jours)) : 30 },
    hebdo: { actif: actif(r.hebdo?.actif, true) },
  };
}

/** Le jour (AAAA-MM-JJ) a Bruxelles : un anniversaire tombe a minuit chez le client, pas en UTC. */
export function jourBruxelles(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export function estSonAnniversaire(dateNaissance, maintenant) {
  if (!dateNaissance || !/^\d{4}-\d{2}-\d{2}/.test(dateNaissance)) return false;
  return dateNaissance.slice(5, 10) === jourBruxelles(maintenant).slice(5, 10);
}

/** Un code lisible, le meme pour un client, un lieu et un e-mail donnes. */
export function codeCoupon(prefixe, userId, clubId, type, jour) {
  const lettres = String(prefixe || "NOC").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
  const h = createHash("sha256").update(`${userId}.${clubId}.${type}.${jour}`).digest("hex").toUpperCase();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let fin = "";
  for (let i = 0; i < 4; i++) fin += alphabet[parseInt(h.slice(i * 2, i * 2 + 2), 16) % alphabet.length];
  return `${lettres}-${fin}`;
}

/**
 * Quel e-mail envoyer a ce client pour ce lieu, ou null.
 * @param {object} c
 * @param {number} c.maintenant
 * @param {object} c.reglages        - lireReglages(clubs.emails_auto)
 * @param {number} c.premiereVisite  - ms
 * @param {number} c.derniereVisite  - ms
 * @param {string|null} c.dateNaissance
 * @param {Record<string, number>} c.dernierEnvoi - type -> ms du dernier e-mail de ce type (ce lieu)
 * @returns {string|null}
 */
export function choisirEmail({ maintenant, reglages, premiereVisite, derniereVisite, dateNaissance, dernierEnvoi = {} }) {
  const r = reglages;
  const deja = (type) => dernierEnvoi[type] || 0;

  if (r.anniversaire.actif && estSonAnniversaire(dateNaissance, maintenant) && maintenant - deja("anniversaire") > 300 * JOUR) {
    return "anniversaire";
  }
  if (r.bienvenue.actif && premiereVisite && !deja("bienvenue")) {
    const depuis = maintenant - premiereVisite;
    if (depuis >= 20 * 3600e3 && depuis <= 7 * JOUR) return "bienvenue";
  }
  if (r.absents.actif && derniereVisite && maintenant - derniereVisite >= r.absents.jours * JOUR && deja("absents") < derniereVisite) {
    return "absents";
  }
  if (r.hebdo.actif && maintenant - deja("hebdo") >= JOURS_ENTRE_RAPPELS * JOUR) {
    // Pas de point hebdomadaire juste apres un autre e-mail de ce lieu.
    const autre = Math.max(deja("anniversaire"), deja("bienvenue"), deja("absents"), deja("offre"));
    if (maintenant - autre >= 3 * JOUR) return "hebdo";
  }
  return null;
}

/**
 * Le contenu de l'e-mail choisi.
 * @returns {{ sujet: string, message: string, coupon: {texte: string, code: string} | null } | null}
 */
export function contenuEmail(type, { lieu, prenom, solde, recompenses, ig, reglages, userId, clubId, maintenant }) {
  const r = reglages;
  const bonjour = prenom ? `Salut ${prenom},` : "Salut,";
  const coupon = (texte) => (texte ? { texte, code: codeCoupon(lieu, userId, clubId, type, jourBruxelles(maintenant)) } : null);
  const points = Math.max(0, Math.round(Number(solde) || 0));
  // Le cadeau s'ecrit au milieu d'une phrase : « Pour ton retour : une boisson offerte ».
  const dans = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  const proche = messageRappel({ solde: points, recompenses, ig });

  if (type === "anniversaire") {
    return {
      sujet: "Joyeux anniversaire",
      message: `${bonjour}\n\nToute l'équipe de ${lieu} te souhaite un joyeux anniversaire.` + (r.anniversaire.coupon ? `\n\nPour l'occasion : ${dans(r.anniversaire.coupon)}. Montre le code ci-dessous sur place, il est valable 7 jours.` : `\n\nPasse nous voir pour fêter ça.`),
      coupon: coupon(r.anniversaire.coupon),
    };
  }
  if (type === "bienvenue") {
    return {
      sujet: `Merci de ta visite`,
      message: `${bonjour}\n\nMerci d'être passé chez ${lieu}. Tu as ${points} points sur Noctify.` + (proche ? `\n\n${proche.message.replace(/^Tu as [\d\s]+ points\. ?/, "")}` : "") + (r.bienvenue.coupon ? `\n\nPour ta prochaine visite : ${dans(r.bienvenue.coupon)}. Montre le code ci-dessous, il est valable 7 jours.` : ""),
      coupon: coupon(r.bienvenue.coupon),
    };
  }
  if (type === "absents") {
    return {
      sujet: r.absents.coupon ? `${r.absents.coupon}, pour ton retour` : "Ça fait un moment",
      message: `${bonjour}\n\nOn ne t'a pas vu chez ${lieu} depuis un moment. Tu as toujours ${points} points qui t'attendent.` + (r.absents.coupon ? `\n\nPour ton retour : ${dans(r.absents.coupon)}. Montre le code ci-dessous sur place, il est valable 7 jours.` : ""),
      coupon: coupon(r.absents.coupon),
    };
  }
  if (type === "hebdo") {
    if (!proche) return null;
    return { sujet: proche.sujet, message: `${bonjour}\n\n${proche.message}`, coupon: null };
  }
  return null;
}
