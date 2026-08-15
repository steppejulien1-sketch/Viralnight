// Briques communes aux verifications du site B2B.
//
// Pendant de `outils/lib_vn.cjs` du depot PWA, adapte a CE projet :
// autre base Supabase (mrukkexghpcqtwvwwcbe), autres tables.
//
// ⚠️ Aucun secret n'est ecrit ici : tout est lu dans le `.env.local`
// deja en place.

const fs = require("fs");
const { execFileSync } = require("child_process");

const REF = "mrukkexghpcqtwvwwcbe";
const BASE = `https://${REF}.supabase.co`;
const PROD = "https://viralnight-koif.vercel.app";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ENV = `${__dirname}/../.env.local`;

function env(nom) {
  for (const l of fs.readFileSync(ENV, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (l.trim().startsWith(nom + "=")) {
      return l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
    }
  }
  return null;
}

const SBP = env("SUPABASE_ACCESS_TOKEN");

// ⚠️ curl et pas fetch : l'API Management repond 403 a certains clients,
// et renvoie parfois une page HTML sous charge. Piege deja paye cote PWA.
function mgmt(chemin, corps, essai = 0) {
  const args = ["-s", `https://api.supabase.com/v1${chemin}`, "-H", `Authorization: Bearer ${SBP}`];
  let f = null;
  if (corps !== undefined) {
    f = `${__dirname}/_mgmt_${Date.now()}.json`;
    fs.writeFileSync(f, JSON.stringify(corps));
    args.push("-X", "POST", "-H", "Content-Type: application/json", "--data-binary", "@" + f);
  }
  const out = execFileSync("curl", args, { encoding: "utf8" });
  if (f) fs.unlinkSync(f);
  if (!out.trim()) return null;
  try {
    return JSON.parse(out);
  } catch {
    if (essai < 3) return mgmt(chemin, corps, essai + 1);
    throw new Error(`API Management : reponse non-JSON (${out.slice(0, 120).replace(/\s+/g, " ")})`);
  }
}

const sql = (q) => mgmt(`/projects/${REF}/database/query`, { query: q });

let SERVICE = null;
function service() {
  if (!SERVICE) SERVICE = mgmt(`/projects/${REF}/api-keys`).find((k) => k.name === "service_role").api_key;
  return SERVICE;
}

async function admin(chemin, method, body) {
  const r = await fetch(`${BASE}${chemin}`, {
    method,
    headers: { apikey: service(), Authorization: `Bearer ${service()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
}

/** Lien magique pour un compte EXISTANT — n'ecrit rien en base. */
async function lienPour(email, redirect = PROD + "/app.html") {
  const [st, l] = await admin("/auth/v1/admin/generate_link", "POST", {
    type: "magiclink",
    email,
    options: { redirectTo: redirect },
  });
  if (st >= 400) throw new Error("lien: " + JSON.stringify(l));
  return l.action_link;
}

module.exports = { REF, BASE, PROD, CHROME, SBP, mgmt, sql, service, admin, lienPour };
