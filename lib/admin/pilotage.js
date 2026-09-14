// Le tableau de bord de Julien : ce qu'on calcule a partir des lignes brutes.
//
// Volontairement SANS reseau : api/update-client-status.js (?action=pilotage)
// lit les deux bases, ce fichier range et compte. C'est ce qui rend les
// chiffres verifiables en Node sans toucher a la production -- un « ce mois-ci »
// qui compte le mois d'avant, ou un jour decale d'une heure, ne se voit pas a
// l'oeil sur un tableau de bord.
//
// ⚠️ LES JOURS SONT CEUX DE BRUXELLES. Une inscription a 0 h 30 heure locale
// est encore la veille en UTC : compter en UTC deplacerait une partie des
// soirees du samedi sur le vendredi.

import { MOTIFS_DEPART } from "../notifications/push.js";

const FUSEAU = "Europe/Paris";

/** "2026-09-13" pour un instant donne, dans le fuseau de Bruxelles. */
export function jourLocal(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA ecrit AAAA-MM-JJ, ce qui se trie et se compare comme du texte.
  return d.toLocaleDateString("en-CA", { timeZone: FUSEAU });
}

/** Le jour AAAA-MM-JJ decale de n jours (calendrier pur, sans fuseau). */
export function decalerJour(jour, n) {
  const [a, m, j] = jour.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/**
 * Aujourd'hui, 7 derniers jours (aujourd'hui compris), ce mois-ci, le mois
 * dernier, et le total.
 * @param {Array<string|Date>} instants
 * @param {Date} [maintenant]
 */
export function resumePeriodes(instants, maintenant = new Date()) {
  const aujourdhui = jourLocal(maintenant);
  const debutSemaine = decalerJour(aujourdhui, -6);
  const mois = aujourdhui.slice(0, 7);
  const [a, m] = mois.split("-").map(Number);
  const moisDernier = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;

  const r = { aujourdhui: 0, septJours: 0, ceMois: 0, moisDernier: 0, total: 0 };
  for (const instant of instants || []) {
    const jour = jourLocal(instant);
    if (!jour) continue;
    r.total += 1;
    if (jour === aujourdhui) r.aujourdhui += 1;
    if (jour >= debutSemaine && jour <= aujourdhui) r.septJours += 1;
    if (jour.slice(0, 7) === mois) r.ceMois += 1;
    if (jour.slice(0, 7) === moisDernier) r.moisDernier += 1;
  }
  return r;
}

/**
 * Une barre par jour sur les n derniers jours, les jours vides compris :
 * un graphique qui saute les jours a zero ment sur le rythme.
 */
export function serieParJour(instants, nbJours = 30, maintenant = new Date()) {
  const fin = jourLocal(maintenant);
  const compte = new Map();
  for (let i = nbJours - 1; i >= 0; i -= 1) compte.set(decalerJour(fin, -i), 0);
  for (const instant of instants || []) {
    const jour = jourLocal(instant);
    if (compte.has(jour)) compte.set(jour, compte.get(jour) + 1);
  }
  return [...compte].map(([jour, n]) => ({ jour, n }));
}

/** Nombre d'appareils DIFFERENTS vus sur une fenetre de jours. */
export function appareilsActifs(ouvertures, nbJours, maintenant = new Date()) {
  const fin = jourLocal(maintenant);
  const debut = decalerJour(fin, -(nbJours - 1));
  const vus = new Set();
  for (const o of ouvertures || []) {
    if (o?.jour >= debut && o.jour <= fin && o.appareil) vus.add(o.appareil);
  }
  return vus.size;
}

/** Appareils differents par jour, sur les n derniers jours (jours vides compris). */
export function actifsParJour(ouvertures, nbJours = 30, maintenant = new Date()) {
  const fin = jourLocal(maintenant);
  const parJour = new Map();
  for (let i = nbJours - 1; i >= 0; i -= 1) parJour.set(decalerJour(fin, -i), new Set());
  for (const o of ouvertures || []) {
    if (parJour.has(o?.jour) && o.appareil) parJour.get(o.jour).add(o.appareil);
  }
  return [...parJour].map(([jour, vus]) => ({ jour, n: vus.size }));
}

/** Les raisons de depart, de la plus frequente a la moins frequente. */
export function repartitionMotifs(departs) {
  const total = (departs || []).length;
  const compte = new Map(Object.keys(MOTIFS_DEPART).map((code) => [code, 0]));
  for (const d of departs || []) {
    const code = compte.has(d?.motif) ? d.motif : "inconnu";
    compte.set(code, (compte.get(code) || 0) + 1);
  }
  return [...compte]
    .filter(([code, n]) => n > 0 || code !== "inconnu")
    .map(([code, n]) => ({
      code,
      libelle: MOTIFS_DEPART[code] || "Raison non indiquée",
      n,
      part: total ? Math.round((n / total) * 100) : 0,
    }))
    .sort((x, y) => y.n - x.n);
}

const RE_NOTE = /^Avis sur l'appli : [★☆]+ \(([1-5])\/5\)$/;
const RE_COMMENTAIRE = /^Commentaire sur l'appli \(([1-5])\/5\) : ([\s\S]*)$/;

/** Ce message est-il un avis (note ou commentaire) plutot qu'une demande ? */
export function estAvis(message) {
  const texte = String(message || "");
  return RE_NOTE.test(texte) || RE_COMMENTAIRE.test(texte);
}

/**
 * Les avis laisses dans l'appli : moyenne, repartition des etoiles, et les
 * derniers commentaires. Ils vivent dans support_messages (voir app-preview,
 * ouvrirAvisAppli).
 */
export function syntheseAvis(messages) {
  const etoiles = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const commentaires = [];
  let somme = 0;
  let nombre = 0;
  for (const m of messages || []) {
    if (m?.auteur && m.auteur !== "client") continue;
    const texte = String(m?.message || "");
    const note = texte.match(RE_NOTE);
    if (note) {
      const n = Number(note[1]);
      etoiles[n] += 1;
      somme += n;
      nombre += 1;
      continue;
    }
    const c = texte.match(RE_COMMENTAIRE);
    if (c) commentaires.push({ note: Number(c[1]), texte: c[2].trim(), date: m.created_at, user_id: m.user_id });
  }
  commentaires.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  return {
    nombre,
    moyenne: nombre ? Math.round((somme / nombre) * 10) / 10 : null,
    etoiles,
    commentaires,
  };
}

/**
 * Les conversations du support, une par clubbeur, la plus recente en haut.
 * « A repondre » : le dernier message qui n'est pas un avis vient du client.
 * @param {Array<{user_id:string, message:string, auteur:string, created_at:string}>} messages
 * @param {Record<string, {pseudo?:string, email?:string}>} profils
 */
export function filsSupport(messages, profils = {}) {
  const parUser = new Map();
  const tries = [...(messages || [])].sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
  for (const m of tries) {
    if (!m?.user_id || estAvis(m.message)) continue;
    if (!parUser.has(m.user_id)) parUser.set(m.user_id, []);
    parUser.get(m.user_id).push({ auteur: m.auteur === "admin" ? "admin" : "client", message: String(m.message || ""), date: m.created_at });
  }
  const fils = [...parUser].map(([userId, lignes]) => {
    const dernier = lignes[lignes.length - 1];
    const sujet = (lignes.find((l) => l.auteur === "client")?.message.match(/^\[([^\]]{1,40})\]/) || [])[1] || null;
    return {
      user_id: userId,
      pseudo: profils[userId]?.pseudo || null,
      email: profils[userId]?.email || null,
      sujet,
      aRepondre: dernier.auteur === "client",
      dernier: dernier.date,
      messages: lignes,
    };
  });
  // Ceux qui attendent une reponse d'abord, puis du plus recent au plus ancien.
  return fils.sort((x, y) => (x.aRepondre === y.aRepondre ? String(y.dernier).localeCompare(String(x.dernier)) : x.aRepondre ? -1 : 1));
}

/**
 * Ce que Julien appelle « payer » : establishments.subscription_status. Il n'y
 * a pas de paiement branche (pas de Stripe) : c'est le statut pose a la main
 * dans l'admin qui fait foi.
 */
export function statutClub(statut) {
  if (statut === "actif") return { code: "payant", libelle: "Payant" };
  if (statut === "suspendu") return { code: "suspendu", libelle: "Suspendu" };
  return { code: "essai", libelle: "Essai gratuit" };
}

export function resumeClubs(clubs) {
  const r = { total: 0, payant: 0, essai: 0, suspendu: 0 };
  for (const c of clubs || []) {
    r.total += 1;
    r[statutClub(c?.subscription_status).code] += 1;
  }
  return r;
}

/** Nombre de jours entiers entre deux instants (anciennete d'un compte). */
export function joursEntre(debut, fin = new Date()) {
  const a = new Date(debut).getTime();
  const b = new Date(fin).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86400000));
}
