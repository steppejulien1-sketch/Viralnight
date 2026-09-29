// Les offres par e-mail des commerces (offre Pro, 30/09/2026).
//
// Pur : pas de reseau, pas de base. Decide QUI recoit, verifie ce que le
// gerant a ecrit, fabrique l'e-mail et le lien de desabonnement. L'envoi
// reel vit dans api/credit-clubbeur.js (?action=offres-email).
//
// ⚠️ UNIQUEMENT LES CLIENTS QUI ONT DIT OUI, pour CE lieu
// (consentements_offres, migration clubbeur 0060). Chaque e-mail porte un
// lien de desabonnement qui marche en un clic, sans se connecter : c'est une
// obligation legale, pas une politesse.

import { createHmac, timingSafeEqual } from "node:crypto";

export const LIMITES = { sujet: 120, message: 2000 };
export const JOURS_ABSENCE = 30;
// Un envoi par lieu et par jour : au-dela, c'est du harcelement, et les
// messageries classent tout le domaine en indesirable.
export const DELAI_ENTRE_ENVOIS_MS = 24 * 60 * 60 * 1000;

const nettoyer = (v) => String(v ?? "").replace(/\r\n?/g, "\n").trim();

/** Verifie ce que le gerant a ecrit. Rend { sujet, message, cible } ou { erreur }. */
export function lireOffre(corps) {
  const sujet = nettoyer(corps?.sujet).replace(/\s+/g, " ");
  const message = nettoyer(corps?.message);
  const cible = corps?.cible === "absents" ? "absents" : "tous";
  if (!sujet) return { erreur: "Écris un objet pour ton e-mail." };
  if (!message) return { erreur: "Écris le message de ton offre." };
  if (sujet.length > LIMITES.sujet) return { erreur: `L'objet dépasse ${LIMITES.sujet} caractères.` };
  if (message.length > LIMITES.message) return { erreur: `Le message dépasse ${LIMITES.message} caractères.` };
  return { sujet, message, cible };
}

/**
 * Qui recoit l'offre.
 * @param {string[]} consentis   - clients qui ont accepte les offres de ce lieu
 * @param {Map<string,string>} derniereVisite - client -> date ISO de sa derniere venue
 * @param {"tous"|"absents"} cible
 * @param {number} maintenant
 */
export function choisirDestinataires(consentis, derniereVisite, cible, maintenant = Date.now()) {
  const uniques = [...new Set(consentis || [])];
  if (cible !== "absents") return uniques;
  const seuil = maintenant - JOURS_ABSENCE * 864e5;
  // Jamais venu, ou pas revenu depuis 30 jours.
  return uniques.filter((id) => {
    const le = derniereVisite?.get(id);
    return !le || Date.parse(le) < seuil;
  });
}

/** Encore trop tot pour renvoyer ? Rend le nombre d'heures a attendre, ou 0. */
export function heuresAvantProchainEnvoi(dernierEnvoiIso, maintenant = Date.now()) {
  if (!dernierEnvoiIso) return 0;
  const reste = Date.parse(dernierEnvoiIso) + DELAI_ENTRE_ENVOIS_MS - maintenant;
  return reste > 0 ? Math.ceil(reste / 3600e3) : 0;
}

/* ---------- Le lien de desabonnement : signe, sans session ---------- */

const b64 = (s) => Buffer.from(s).toString("base64url");

export function jetonDesabonnement(userId, clubId, secret) {
  const charge = b64(`${userId}.${clubId}`);
  const sig = createHmac("sha256", secret).update(charge).digest("base64url");
  return `${charge}.${sig}`;
}

/** Rend { userId, clubId } si le jeton est authentique, sinon null. */
export function lireJetonDesabonnement(jeton, secret) {
  if (typeof jeton !== "string" || !jeton.includes(".") || !secret) return null;
  const [charge, sig] = jeton.split(".");
  const attendu = createHmac("sha256", secret).update(charge).digest("base64url");
  const a = Buffer.from(sig || "");
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, clubId] = Buffer.from(charge, "base64url").toString().split(".");
  const uuid = /^[0-9a-f-]{36}$/i;
  return uuid.test(userId || "") && uuid.test(clubId || "") ? { userId, clubId } : null;
}

/* ---------- L'e-mail ---------- */

const echapper = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * @returns {{ sujet: string, html: string, texte: string }}
 */
export function construireEmail({ lieu, sujet, message, lienDesabonnement }) {
  const paragraphes = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#141414">${echapper(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f5f3;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f3;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;padding:28px">
<tr><td>
<p style="margin:0 0 6px;font-size:13px;color:#6b6b68">${echapper(lieu)}</p>
<h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;color:#141414">${echapper(sujet)}</h1>
${paragraphes}
<p style="margin:22px 0 0;font-size:13px;color:#6b6b68">Envoyé par ${echapper(lieu)} avec Noctify, parce que tu as accepté de recevoir ses offres.</p>
<p style="margin:6px 0 0;font-size:13px"><a href="${echapper(lienDesabonnement)}" style="color:#6b6b68">Ne plus recevoir les offres de ${echapper(lieu)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
  const texte = `${lieu}\n\n${sujet}\n\n${message}\n\n—\nEnvoyé par ${lieu} avec Noctify, parce que tu as accepté de recevoir ses offres.\nNe plus recevoir ses offres : ${lienDesabonnement}\n`;
  return { sujet: `${lieu} : ${sujet}`, html, texte };
}
