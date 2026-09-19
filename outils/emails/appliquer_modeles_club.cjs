// Pose l'e-mail de connexion de l'appli des GERANTS dans la base B2B
// (mrukkexghpcqtwvwwcbe) : code a 6 chiffres, en francais, signe Noctify.
//
//   node outils/emails/appliquer_modeles_club.cjs            (applique)
//   node outils/emails/appliquer_modeles_club.cjs --lire     (montre l'etat, ne change rien)
//
// Jumeau de appliquer_modeles.cjs, qui fait la meme chose sur la base des
// clubbeurs. Meme modele HTML : connexion.html porte le code ET un lien de
// secours, donc il convient aux deux applis et aux deux portes du site
// (connexion.html / inscription.html continuent de marcher par le lien).
//
// Julien, 19/09/2026 : « je peux pas créer de compte ». La base B2B etait
// restee sur les modeles par defaut de Supabase : lien seul, sans code, et
// mailer_otp_length a 8. club-app.html demande maintenant un code a six
// chiffres, comme l'appli clubbeur -- sans ce script l'e-mail n'en montre
// aucun.
//
// ⚠️ LA LONGUEUR DU CODE EST AUSSI DANS club-app.html (LONGUEUR_CODE).
// Les deux bougent ensemble, sinon plus aucun code ne passe.

const fs = require("fs");
const path = require("path");

const REF = "mrukkexghpcqtwvwwcbe";
const LONGUEUR_CODE = 6;
const html = fs.readFileSync(path.join(__dirname, "connexion.html"), "utf8");
const lireSeulement = process.argv.includes("--lire");

// Le jeton d'API Management vit dans .env.local, jamais dans le depot.
function env(nom, chemin) {
  for (const l of fs.readFileSync(chemin, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    if (l.trim().startsWith(nom + "=")) return l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
  }
  return null;
}
const SBP = env("SUPABASE_ACCESS_TOKEN", path.join(__dirname, "..", "..", ".env.local"));
if (!SBP) throw new Error("SUPABASE_ACCESS_TOKEN absent de .env.local");

async function api(methode, corps) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method: methode,
    headers: { Authorization: `Bearer ${SBP}`, "Content-Type": "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) {}
  return [r.status, json, texte];
}

function resume(c) {
  return {
    mailer_otp_length: c.mailer_otp_length,
    mailer_subjects_magic_link: c.mailer_subjects_magic_link,
    mailer_subjects_confirmation: c.mailer_subjects_confirmation,
    code_dans_magic_link: /\{\{\s*\.Token\s*\}\}/.test(c.mailer_templates_magic_link_content || ""),
    code_dans_confirmation: /\{\{\s*\.Token\s*\}\}/.test(c.mailer_templates_confirmation_content || ""),
    smtp_sender_name: c.smtp_sender_name,
  };
}

(async () => {
  const [st0, avant] = await api("GET");
  if (st0 !== 200) throw new Error("lecture impossible : HTTP " + st0);
  console.log("avant :", resume(avant));
  if (lireSeulement) return;

  // Deux modeles, parce que Supabase n'envoie pas le meme selon le compte :
  // « Magic Link » pour un compte qui existe, « Confirm signup » pour un
  // nouveau. signInWithOtp passe par l'un ou l'autre -- un gerant qui
  // s'inscrit recoit TOUJOURS le second.
  const [st1, , t1] = await api("PATCH", {
    mailer_otp_length: LONGUEUR_CODE,
    mailer_subjects_magic_link: "{{ .Token }} est ton code Noctify",
    mailer_subjects_confirmation: "{{ .Token }} est ton code Noctify",
    mailer_templates_magic_link_content: html,
    mailer_templates_confirmation_content: html,
  });
  if (st1 >= 300) throw new Error("modeles refuses : HTTP " + st1 + " " + t1.slice(0, 300));

  // L'expediteur a part : si l'API le refuse, les modeles restent poses.
  const [st2, , t2] = await api("PATCH", { smtp_sender_name: "Noctify" });
  if (st2 >= 300) console.log("expediteur non change : HTTP " + st2 + " " + t2.slice(0, 200));

  const [, apres] = await api("GET");
  console.log("apres :", resume(apres));
})().catch((e) => {
  console.error("ECHEC:", e.message);
  process.exit(1);
});
