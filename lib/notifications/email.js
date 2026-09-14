// L'envoi des e-mails Noctify a Julien, et leur copie dans le tableau de bord.
//
// Avant le 14/09/2026, trois routes appelaient Resend chacune de leur cote
// (demande de demo, message au support, compte supprime), et ce qui partait
// n'etait visible que dans la boite mail. Julien veut les voir dans
// pilotage.html : chaque envoi passe donc ici, et laisse une ligne dans
// journal_emails (base des gerants, migration 202609140002).
//
// ⚠️ LE JOURNAL NE BLOQUE JAMAIS L'ENVOI, ET L'INVERSE. Un e-mail qui ne part
// pas (Resend absent, quota, panne) est quand meme journalise, avec la raison :
// c'est le cas qu'on a le plus besoin de voir. Et une base injoignable ne doit
// pas empecher un e-mail de partir.
//
// Comme envoyer.js, ce fichier fait du reseau : il n'est pas teste en Node.

import { getSupabaseAdmin } from "../db/supabaseAdmin.js";

/**
 * @param {object} e
 * @param {string} e.type   - "support" | "compte_supprime" | "demo"
 * @param {string} e.sujet
 * @param {string} e.html
 * @param {string} e.texte  - version texte, c'est elle qu'affiche le tableau de bord
 * @returns {Promise<boolean>} true si Resend a accepte l'e-mail
 */
export async function envoyerEmail({ type, sujet, html, texte }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFICATION_EMAIL;
  const from = process.env.NOTIFICATION_FROM || "Noctify <onboarding@resend.dev>";

  let envoye = false;
  let erreur = null;

  if (!apiKey || !to) {
    erreur = "Envoi d'e-mails non configuré sur le serveur (RESEND_API_KEY ou NOTIFICATION_EMAIL absent)";
  } else {
    try {
      const reponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: sujet, html, text: texte }),
      });
      envoye = reponse.ok;
      if (!reponse.ok) erreur = `Resend a refusé (${reponse.status}) : ${(await reponse.text()).slice(0, 300)}`;
    } catch (e) {
      erreur = `Resend injoignable : ${String(e?.message || e).slice(0, 300)}`;
    }
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("journal_emails")
      .insert({ type, sujet: String(sujet).slice(0, 300), destinataire: to || null, texte: String(texte || "").slice(0, 10000), envoye, erreur });
    if (error) console.error("[email] journal non ecrit", error.message);
  } catch (e) {
    console.error("[email] journal non ecrit", e.message);
  }

  return envoye;
}
