// L'envoi reel des e-mails automatiques des commerces (voir automatiques.js
// pour QUI recoit QUOI, et rappels.js pour le point hebdomadaire).
// Appele une fois par jour par le cron de api/instagram.js : greffe la, pas
// dans un nouveau fichier api/ (plan Hobby : 12 fonctions au plus, deja atteint).

import { construireEmail, jetonDesabonnement } from "./email.js";
import { choisirEmail, contenuEmail, lireReglages } from "./automatiques.js";

// Garde-fou : un cron de Vercel Hobby a peu de temps, et Resend a ses quotas.
const MAX_PAR_PASSAGE = 400;
const JOUR = 864e5;

/**
 * @param {object} o
 * @param {import("@supabase/supabase-js").SupabaseClient} o.clubbeur - client service_role de la base clubbeur
 * @returns {Promise<{ envoyes: number, candidats: number, parType?: Record<string, number>, erreur?: string }>}
 */
export async function envoyerEmailsAuto({ clubbeur, apiKey, from, secret, site, nomLieu = (n) => n, maintenant = Date.now() }) {
  if (!apiKey || !from || !secret) return { envoyes: 0, candidats: 0, erreur: "envoi d'e-mails non configure" };

  /* Accord donne a la creation du compte (CGU) : on ecrit aux clients VENUS
     dans le lieu, sauf a ceux qui ont dit non pour ce lieu. */
  const depuis = new Date(maintenant - 400 * JOUR).toISOString();
  const [visites, choix, journal] = await Promise.all([
    clubbeur.from("point_grants").select("user_id, club_id, created_at").gte("created_at", depuis).order("created_at", { ascending: false }).limit(50000),
    clubbeur.from("consentements_offres").select("user_id, club_id, accepte").eq("accepte", false).limit(50000),
    clubbeur.from("emails_log").select("user_id, club_id, type, envoye_le").gte("envoye_le", depuis).limit(50000),
  ]);
  for (const r of [visites, choix, journal]) if (r.error) return { envoyes: 0, candidats: 0, erreur: r.error.message };

  const cle = (u, c) => `${u}|${c}`;
  const refus = new Set((choix.data || []).map((x) => cle(x.user_id, x.club_id)));

  // Premiere et derniere visite par (client, lieu).
  const paires = new Map();
  for (const v of visites.data || []) {
    if (!v.club_id || refus.has(cle(v.user_id, v.club_id))) continue;
    const t = Date.parse(v.created_at);
    const p = paires.get(cle(v.user_id, v.club_id)) || { user_id: v.user_id, club_id: v.club_id, premiere: t, derniere: t };
    p.premiere = Math.min(p.premiere, t);
    p.derniere = Math.max(p.derniere, t);
    paires.set(cle(v.user_id, v.club_id), p);
  }
  // Ce qui est deja parti : par (client, lieu, type), et le dernier e-mail du client tous lieux confondus.
  const envoi = new Map();
  const dernierDuClient = new Map();
  for (const e of journal.data || []) {
    const t = Date.parse(e.envoye_le);
    const k = cle(e.user_id, e.club_id);
    const m = envoi.get(k) || {};
    m[e.type] = Math.max(m[e.type] || 0, t);
    envoi.set(k, m);
    dernierDuClient.set(e.user_id, Math.max(dernierDuClient.get(e.user_id) || 0, t));
  }
  if (!paires.size) return { envoyes: 0, candidats: 0 };

  const idsClients = [...new Set([...paires.values()].map((p) => p.user_id))];
  const idsLieux = [...new Set([...paires.values()].map((p) => p.club_id))];
  const [clients, lieux, recos] = await Promise.all([
    clubbeur.from("users").select("id, email, points_balance, date_naissance").in("id", idsClients),
    clubbeur.from("clubs").select("id, name, ig_handle, visible, emails_auto").in("id", idsLieux),
    clubbeur.from("rewards").select("club_id, title, cost_points, stock_limit, stock_remaining").in("club_id", idsLieux).eq("active", true),
  ]);
  for (const r of [clients, lieux, recos]) if (r.error) return { envoyes: 0, candidats: 0, erreur: r.error.message };

  const client = new Map((clients.data || []).map((u) => [u.id, u]));
  const lieu = new Map((lieux.data || []).map((l) => [l.id, l]));
  const recosDe = new Map();
  for (const r of recos.data || []) {
    if (r.stock_limit !== null && r.stock_limit !== undefined && Number(r.stock_remaining) <= 0) continue;
    if (!recosDe.has(r.club_id)) recosDe.set(r.club_id, []);
    recosDe.get(r.club_id).push({ titre: r.title, cout: r.cost_points });
  }

  // Un seul e-mail par client et par jour : on parcourt ses lieux, le plus recent d'abord.
  const parClient = new Map();
  for (const p of [...paires.values()].sort((a, b) => b.derniere - a.derniere)) {
    if (!parClient.has(p.user_id)) parClient.set(p.user_id, []);
    parClient.get(p.user_id).push(p);
  }

  const messages = [];
  const lignes = [];
  const parType = {};
  for (const [userId, sesLieux] of parClient) {
    if (messages.length >= MAX_PAR_PASSAGE) break;
    const u = client.get(userId);
    if (!u?.email || !/.+@.+\..+/.test(u.email)) continue;
    if (maintenant - (dernierDuClient.get(userId) || 0) < 20 * 3600e3) continue;
    for (const p of sesLieux) {
      const l = lieu.get(p.club_id);
      if (!l || l.visible === false) continue;
      const reglages = lireReglages(l.emails_auto);
      const type = choisirEmail({
        maintenant, reglages, premiereVisite: p.premiere, derniereVisite: p.derniere,
        dateNaissance: u.date_naissance, dernierEnvoi: envoi.get(cle(userId, l.id)) || {},
      });
      if (!type) continue;
      const nom = nomLieu(l.name);
      const contenu = contenuEmail(type, {
        lieu: nom, prenom: "", solde: u.points_balance, recompenses: recosDe.get(l.id), ig: l.ig_handle,
        reglages, userId, clubId: l.id, maintenant,
      });
      if (!contenu) continue;
      const lien = `${site}/api/credit-clubbeur?action=desabonner&t=${encodeURIComponent(jetonDesabonnement(userId, l.id, secret))}`;
      const e = construireEmail({ lieu: nom, sujet: contenu.sujet, message: contenu.message, coupon: contenu.coupon, lienAppli: `${site}/app-preview.html?app=1`, lienDesabonnement: lien });
      messages.push({
        from, to: [u.email], subject: e.sujet, html: e.html, text: e.texte,
        headers: { "List-Unsubscribe": `<${lien}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      lignes.push({ user_id: userId, club_id: l.id, type });
      break;
    }
  }

  let envoyes = 0;
  let erreur;
  for (let i = 0; i < messages.length; i += 100) {
    const lot = messages.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(lot),
      });
      if (!r.ok) { erreur = `Resend ${r.status} : ${(await r.text()).slice(0, 200)}`; continue; }
      envoyes += lot.length;
      // Journal seulement pour ce qui est vraiment parti : un lot refuse sera retente demain.
      const partis = lignes.slice(i, i + 100);
      partis.forEach((x) => { parType[x.type] = (parType[x.type] || 0) + 1; });
      await clubbeur.from("emails_log").insert(partis.map((x) => ({ ...x, envoye_le: new Date(maintenant).toISOString() })));
    } catch (e) {
      erreur = `Resend injoignable : ${String(e?.message || e).slice(0, 200)}`;
    }
  }
  return { envoyes, candidats: messages.length, parType, ...(erreur ? { erreur } : {}) };
}
