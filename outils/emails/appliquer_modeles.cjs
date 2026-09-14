// Pose l'e-mail de connexion de l'appli clubbeur dans la base clubbeur
// (gcopwgmqjiufemapamek) : code a 6 chiffres, en francais, signe Noctify.
//
//   node outils/emails/appliquer_modeles.cjs            (applique)
//   node outils/emails/appliquer_modeles.cjs --lire     (montre l'etat, ne change rien)
//
// Julien, 15/09/2026 : « mets un code dans le mail et mets un code a six
// chiffres ». Jusque-la : modeles par defaut de Supabase, en anglais, lien
// seul, expediteur « ViralNight », code a 8 chiffres jamais montre.
//
// ⚠️ LA LONGUEUR DU CODE EST AUSSI DANS app-preview.html (LONGUEUR_CODE).
// Les deux bougent ensemble, sinon plus aucun code ne passe.
//
// Deux modeles, parce que Supabase n'envoie pas le meme selon le compte :
// « Magic Link » pour un compte qui existe, « Confirm signup » pour un
// nouveau. signInWithOtp passe par l'un ou l'autre.

const fs = require("fs");
const path = require("path");
const V = require("../../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const LONGUEUR_CODE = 6;
const html = fs.readFileSync(path.join(__dirname, "connexion.html"), "utf8");
const lireSeulement = process.argv.includes("--lire");

async function api(methode, corps) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${V.REF}/config/auth`, {
    method: methode,
    headers: { Authorization: `Bearer ${V.SBP}`, "Content-Type": "application/json" },
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
