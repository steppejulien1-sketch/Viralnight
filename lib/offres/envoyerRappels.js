// L'envoi reel des e-mails automatiques (voir rappels.js pour le contenu).
// Appele une fois par jour par le cron de api/instagram.js : greffe la, pas
// dans un nouveau fichier api/ (plan Hobby : 12 fonctions au plus, deja atteint).

import { construireEmail, jetonDesabonnement } from "./email.js";
import { messageRappel, peutRelancer } from "./rappels.js";

// Garde-fou : un cron de Vercel Hobby a peu de temps, et Resend a ses quotas.
const MAX_PAR_PASSAGE = 400;

/**
 * @param {object} o
 * @param {import("@supabase/supabase-js").SupabaseClient} o.clubbeur - client service_role de la base clubbeur
 * @returns {Promise<{ envoyes: number, candidats: number, erreur?: string }>}
 */
export async function envoyerRappelsAuto({ clubbeur, apiKey, from, secret, site, nomLieu = (n) => n, maintenant = Date.now() }) {
  if (!apiKey || !from || !secret) return { envoyes: 0, candidats: 0, erreur: "envoi d'e-mails non configure" };

  /* 03/10/2026 : plus de case a cocher. L'accord est donne a la creation du
     compte (CGU) ; on ecrit aux clients VENUS dans le lieu (un QR scanne,
     point_grants) dans les 120 derniers jours, sauf a ceux qui ont dit non. */
  const depuis = new Date(maintenant - 120 * 864e5).toISOString();
  const [visites, choix, envois] = await Promise.all([
    clubbeur.from("point_grants").select("user_id, club_id, created_at").gte("created_at", depuis).order("created_at", { ascending: false }).limit(50000),
    clubbeur.from("consentements_offres").select("user_id, club_id, accepte").limit(50000),
    clubbeur.from("rappels_auto").select("user_id, club_id, envoye_le").limit(50000),
  ]);
  for (const r of [visites, choix, envois]) if (r.error) return { envoyes: 0, candidats: 0, erreur: r.error.message };

  const cle = (u, c) => `${u}|${c}`;
  const refus = new Set((choix.data || []).filter((x) => !x.accepte).map((x) => cle(x.user_id, x.club_id)));
  const dernier = new Map((envois.data || []).map((x) => [cle(x.user_id, x.club_id), x.envoye_le]));
  // Venus (le plus recent d'abord), puis ceux qui avaient coche la case avant.
  const candidats = [
    ...(visites.data || []).filter((v) => v.club_id),
    ...(choix.data || []).filter((x) => x.accepte),
  ];

  // Un seul e-mail par client et par passage, meme s'il frequente plusieurs lieux.
  const parClient = new Map();
  for (const c of candidats) {
    const k = cle(c.user_id, c.club_id);
    if (refus.has(k) || parClient.has(c.user_id)) continue;
    if (!peutRelancer(dernier.get(k), maintenant)) continue;
    parClient.set(c.user_id, { user_id: c.user_id, club_id: c.club_id });
  }
  const paires = [...parClient.values()].slice(0, MAX_PAR_PASSAGE);
  if (!paires.length) return { envoyes: 0, candidats: 0 };

  const idsClients = paires.map((p) => p.user_id);
  const idsLieux = [...new Set(paires.map((p) => p.club_id))];
  const [clients, lieux, recos] = await Promise.all([
    clubbeur.from("users").select("id, email, points_balance").in("id", idsClients),
    clubbeur.from("clubs").select("id, name, ig_handle, visible").in("id", idsLieux),
    clubbeur.from("rewards").select("club_id, title, cost_points, stock_limit, stock_remaining").in("club_id", idsLieux).eq("active", true),
  ]);
  for (const r of [clients, lieux, recos]) if (r.error) return { envoyes: 0, candidats: paires.length, erreur: r.error.message };

  const client = new Map((clients.data || []).map((u) => [u.id, u]));
  const lieu = new Map((lieux.data || []).map((l) => [l.id, l]));
  const recosDe = new Map();
  for (const r of recos.data || []) {
    // Une recompense epuisee ne fait pas venir : on ne la propose pas.
    if (r.stock_limit !== null && r.stock_limit !== undefined && Number(r.stock_remaining) <= 0) continue;
    if (!recosDe.has(r.club_id)) recosDe.set(r.club_id, []);
    recosDe.get(r.club_id).push({ titre: r.title, cout: r.cost_points });
  }

  const messages = [];
  const touches = [];
  for (const p of paires) {
    const u = client.get(p.user_id);
    const l = lieu.get(p.club_id);
    if (!u?.email || !/.+@.+\..+/.test(u.email) || !l || l.visible === false) continue;
    const contenu = messageRappel({ solde: u.points_balance, recompenses: recosDe.get(l.id), ig: l.ig_handle });
    if (!contenu) continue;
    const nom = nomLieu(l.name);
    const lien = `${site}/api/credit-clubbeur?action=desabonner&t=${encodeURIComponent(jetonDesabonnement(u.id, l.id, secret))}`;
    const e = construireEmail({ lieu: nom, sujet: contenu.sujet, message: contenu.message, lienDesabonnement: lien });
    messages.push({
      from, to: [u.email], subject: e.sujet, html: e.html, text: e.texte,
      headers: { "List-Unsubscribe": `<${lien}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    touches.push(p);
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
      // La date n'est posee que pour ceux qui sont vraiment partis : un lot
      // refuse sera retente au prochain passage.
      const quand = new Date(maintenant).toISOString();
      await clubbeur.from("rappels_auto").upsert(
        touches.slice(i, i + 100).map((p) => ({ user_id: p.user_id, club_id: p.club_id, envoye_le: quand })),
        { onConflict: "user_id,club_id" },
      );
    } catch (e) {
      erreur = `Resend injoignable : ${String(e?.message || e).slice(0, 200)}`;
    }
  }
  return { envoyes, candidats: messages.length, ...(erreur ? { erreur } : {}) };
}
