// Pose les deux variables du pont retour sur le projet Vercel du B2B.
//
// ⚠️ Aucun secret n'est ecrit dans ce fichier : le jeton Vercel est lu
// dans C:\Users\stepp\token-vercel.txt, le secret du pont est lu dans
// les secrets Supabase du projet PWA. Rien n'est affiche en clair.
//
// PIEGES DE L'API VERCEL, deja payes (voir memoire) :
//  - `forceNew` va en PARAMETRE D'URL, pas dans le corps du POST ;
//  - pour redeployer, il faut reprendre le `gitSource` du dernier
//    deploiement de production et le remettre dans le corps.

const fs = require("fs");

const PROJET = "prj_Q603DdOhiicfqtc1lWRnknT1K4FO"; // viralnight-koif
const TEAM = "team_iSigYpkRP2kyMqt9Ph2iZyyu";
const PWA_FUNCTIONS_URL = "https://gcopwgmqjiufemapamek.supabase.co/functions/v1";

const jeton = fs.readFileSync("C:/Users/stepp/token-vercel.txt", "utf8").trim();
if (!jeton.startsWith("vcp_") && !jeton.startsWith("vercel_")) {
  console.error("jeton Vercel introuvable ou invalide dans token-vercel.txt");
  process.exit(1);
}

// ⚠️ PIEGE PAYE : l'API Management de Supabase renvoie le **SHA-256**
// du secret, jamais sa valeur. Sans ce controle, on pose un hachage de
// 64 caracteres hexadecimaux sur Vercel, le pont repond 403 pour
// toujours, et rien ne le signale — on annonce que c'est fait.
//
// On retourne donc le probleme : le secret en clair est passe en
// argument, et le hachage sert a VERIFIER qu'il correspond bien a celui
// que Supabase detient. Supabase ne nous donne jamais la valeur, mais
// il nous permet de confirmer la notre.
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const SECRET = process.argv[2];
if (!SECRET) {
  console.error("usage : node outils/poser_vars_vercel.cjs <secret-du-pont>");
  process.exit(1);
}

const SBP = fs.readFileSync(`${__dirname}/../.env.local`, "utf8")
  .split(/\r?\n/).find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))
  .split("=").slice(1).join("=").trim();

const secrets = JSON.parse(execFileSync("curl", [
  "-s", "https://api.supabase.com/v1/projects/gcopwgmqjiufemapamek/secrets",
  "-H", `Authorization: Bearer ${SBP}`,
], { encoding: "utf8" }));
const empreinte = secrets.find((s) => s.name === "B2B_BRIDGE_SECRET")?.value;
if (!empreinte) {
  console.error("B2B_BRIDGE_SECRET absent des secrets Supabase de la PWA");
  process.exit(1);
}
if (crypto.createHash("sha256").update(SECRET).digest("hex") !== empreinte) {
  console.error("Le secret fourni ne correspond PAS a celui pose cote Supabase.");
  console.error("Ne rien poser : le pont repondrait 403.");
  process.exit(1);
}
console.log("secret verifie contre l'empreinte Supabase : il correspond");
const pont = { value: SECRET };

const api = async (chemin, options = {}) => {
  const sep = chemin.includes("?") ? "&" : "?";
  const r = await fetch(`https://api.vercel.com${chemin}${sep}teamId=${TEAM}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
};

(async () => {
  const [stListe, existantes] = await api(`/v9/projects/${PROJET}/env`);
  if (stListe >= 400) throw new Error("lecture des variables : " + JSON.stringify(existantes));
  console.log("variables deja presentes :", (existantes.envs || []).map((e) => e.key).join(", ") || "aucune");

  for (const [key, value] of [["PWA_FUNCTIONS_URL", PWA_FUNCTIONS_URL], ["PWA_BRIDGE_SECRET", pont.value]]) {
    // On remplace si elle existe deja, pour rester rejouable.
    const deja = (existantes.envs || []).find((e) => e.key === key);
    if (deja) {
      const [st, out] = await api(`/v9/projects/${PROJET}/env/${deja.id}`, {
        method: "PATCH",
        body: JSON.stringify({ value, target: ["production", "preview", "development"] }),
      });
      console.log(`${key} : mise a jour (${st})`, st >= 400 ? JSON.stringify(out) : "");
    } else {
      const [st, out] = await api(`/v10/projects/${PROJET}/env`, {
        method: "POST",
        body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview", "development"] }),
      });
      console.log(`${key} : creee (${st})`, st >= 400 ? JSON.stringify(out) : "");
    }
  }

  const [, apres] = await api(`/v9/projects/${PROJET}/env`);
  const noms = (apres.envs || []).map((e) => e.key);
  console.log("\nverification :",
    ["PWA_FUNCTIONS_URL", "PWA_BRIDGE_SECRET"].map((k) => `${k}=${noms.includes(k) ? "OK" : "ABSENT"}`).join("  "));
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
