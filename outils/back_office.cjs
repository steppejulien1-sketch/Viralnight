// LE BACK-OFFICE (admin.html), SECTION PAR SECTION.
//
// C'est devenu l'ecran le plus important du produit : depuis la bascule
// du 2026-08-15, TOUT credit de points passe par lui. Il n'avait jamais
// ete inspecte.
//
// ⚠️ COMMENT ON OUVRE UNE SESSION SANS MOT DE PASSE.
// Le compte admin est identifie par son email, on ne peut donc pas
// passer par un compte jetable. Plutot que de manipuler le mot de passe
// de Julien, on demande un lien magique a l'API admin et on le suit SANS
// redirection : Supabase repond 302, et les jetons sont dans le
// fragment de l'en-tete Location. Rien n'est modifie, aucun mail n'est
// envoye, aucun secret n'est lu.
//
// Lancer d'abord : npm run build && npx vite preview --port 5173

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("./lib_b2b.cjs");

const ADMIN = "viralnight001@gmail.com";
const SITE = process.env.VN_URL || "http://127.0.0.1:5173";
const DOSSIER = `${__dirname}/pages-admin`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function sessionAdmin() {
  const [st, lien] = await V.admin("/auth/v1/admin/generate_link", "POST", {
    type: "magiclink",
    email: ADMIN,
    options: { redirectTo: SITE + "/admin.html" },
  });
  if (st >= 400) throw new Error("lien admin : " + JSON.stringify(lien));

  // ⚠️ `action_link` est A LA RACINE de la reponse, pas sous
  // `properties` (c'est la forme de l'API admin de ce projet).
  const r = await fetch(lien.action_link, { redirect: "manual" });
  const loc = r.headers.get("location") || "";
  const frag = loc.split("#")[1] || "";
  const p = new URLSearchParams(frag);
  const access = p.get("access_token");
  if (!access) throw new Error("pas de jeton dans la redirection : " + loc.slice(0, 200));

  return {
    access_token: access,
    refresh_token: p.get("refresh_token"),
    expires_at: Math.floor(Date.now() / 1000) + Number(p.get("expires_in") || 3600),
    expires_in: Number(p.get("expires_in") || 3600),
    token_type: "bearer",
    user: { email: ADMIN },
  };
}

const mesures = (p) => p.evaluate(() => {
  const d = document.documentElement;
  const dedans = (e) => e.offsetParent !== null;
  const tous = [...document.querySelectorAll("*")].slice(0, 4000);
  return {
    deborde: d.scrollWidth > d.clientWidth + 1,
    petits: tous.filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2 && dedans(e))
      .map((e) => ({ px: parseFloat(getComputedStyle(e).fontSize), t: e.textContent.trim().slice(0, 28) }))
      .filter((x) => x.px < 12).slice(0, 6),
  };
});

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const session = await sessionAdmin();
  console.log("session admin obtenue (sans mot de passe)");

  const nav = await puppeteer.launch({
    executablePath: V.CHROME, headless: "new", protocolTimeout: 180000,
    defaultViewport: { width: 1400, height: 950 },
  });

  try {
    const page = await nav.newPage();
    const erreurs = [];
    page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text().slice(0, 140)); });
    page.on("response", (r) => { if (r.status() >= 400) erreurs.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`); });

    await page.evaluateOnNewDocument((cle, valeur) => localStorage.setItem(cle, valeur),
      `sb-${V.REF}-auth-token`, JSON.stringify(session));

    await page.goto(`${SITE}/admin.html`, { waitUntil: "networkidle2", timeout: 60000 });
    await pause(5000);
    await page.screenshot({ path: `${DOSSIER}/1-admin.png`, fullPage: true });

    const vu = await page.evaluate(() => ({
      url: location.pathname,
      statut: document.querySelector("[data-auth-status], .admin-status")?.textContent?.trim() || null,
      texte: document.body.innerText.replace(/\n{2,}/g, "\n").split("\n").slice(0, 34),
      boutons: [...document.querySelectorAll("button,a[href]")].filter((e) => e.offsetParent !== null)
        .map((e) => (e.textContent || "").trim().slice(0, 30)).filter(Boolean).slice(0, 24),
    }));
    const m = await mesures(page);

    console.log("\nURL     :", vu.url);
    console.log("Statut  :", vu.statut);
    console.log("Ecran   :", vu.texte.join(" | "));
    console.log("Actions :", vu.boutons.join(" · "));
    if (m.deborde) console.log("⚠ DEBORDEMENT HORIZONTAL");
    if (m.petits.length) console.log("⚠ TEXTE < 12px :", m.petits.map((x) => `${x.px}px « ${x.t} »`).join(" · "));
    console.log(erreurs.length ? "\n⚠ ERREURS :\n  " + erreurs.join("\n  ") : "\naucune erreur");
  } finally {
    await nav.close();
  }
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
