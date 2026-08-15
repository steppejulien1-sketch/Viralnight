// LES PAGES INTERNES, AVEC UNE VRAIE SESSION.
//
// live / qr / setup / scan / viral-intelligence / demo : jamais
// inspectees. Meme methode que partout ailleurs — on mesure ce qu'une
// capture ne montre pas : debordement horizontal (le CLAUDE.md exige
// zero), texte minuscule, requetes en echec, erreurs console.
//
// Session admin obtenue sans mot de passe (voir back_office.cjs).
// Lancer d'abord : npm run build && npx vite preview --port 5173

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("./lib_b2b.cjs");

const ADMIN = "viralnight001@gmail.com";
const SITE = process.env.VN_URL || "http://127.0.0.1:5173";
const LARGEUR = Number(process.env.VN_W || 1400);
const DOSSIER = `${__dirname}/pages-internes${LARGEUR !== 1400 ? "-" + LARGEUR : ""}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ["live.html", "1-live", "Soirée en cours"],
  ["qr.html", "2-qr", "QR code du club"],
  ["setup.html", "3-setup", "Configuration du club"],
  ["viral-intelligence.html", "4-analyse", "Analyse des soirées"],
  ["scan.html", "5-scan", "Parcours QR (client final)"],
];

async function sessionAdmin() {
  const [st, lien] = await V.admin("/auth/v1/admin/generate_link", "POST", {
    type: "magiclink", email: ADMIN, options: { redirectTo: SITE + "/admin.html" },
  });
  if (st >= 400) throw new Error("lien admin : " + JSON.stringify(lien));
  const r = await fetch(lien.action_link, { redirect: "manual" });
  const p = new URLSearchParams((r.headers.get("location") || "").split("#")[1] || "");
  if (!p.get("access_token")) throw new Error("pas de jeton dans la redirection");
  // ⚠️ L'OBJET `user` DOIT PORTER L'ID, pas seulement l'email. Sans lui,
  // les pages qui resolvent l'etablissement par `session.user.id`
  // envoient `id=eq.undefined` et prennent un HTTP 400 — un defaut de la
  // SONDE qu'on prendrait pour un defaut de l'application.
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: { id: lien.id, email: ADMIN, aud: lien.aud, role: lien.role },
  };
}

const mesures = (p) => p.evaluate(() => {
  const d = document.documentElement;
  const dedans = (e) => e.offsetParent !== null;
  const tous = [...document.querySelectorAll("*")].slice(0, 4000);
  return {
    largeur: { scroll: d.scrollWidth, client: d.clientWidth },
    hors: [...new Set(tous.filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1)
      .map((e) => `${e.tagName}.${(e.className || "").toString().split(" ")[0]}`))].slice(0, 5),
    petits: tous.filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2 && dedans(e))
      .map((e) => ({ px: parseFloat(getComputedStyle(e).fontSize), t: e.textContent.trim().slice(0, 26) }))
      .filter((x) => x.px < 12).slice(0, 5),
    // ⚠️ Un `hidden` qui ne masque pas : le piege trouve sur admin.html.
    fantomes: tous.filter((e) => e.hasAttribute("hidden") && dedans(e))
      .map((e) => `${e.tagName}.${(e.className || "").toString().split(" ")[0]}`).slice(0, 5),
  };
});

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  const session = await sessionAdmin();

  const nav = await puppeteer.launch({
    executablePath: V.CHROME, headless: "new", protocolTimeout: 180000,
    defaultViewport: { width: LARGEUR, height: 950, isMobile: LARGEUR < 600 },
  });

  let soucis = 0;
  try {
    for (const [chemin, nom, titre] of PAGES) {
      const page = await nav.newPage();
      const erreurs = [];
      page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text().slice(0, 120)); });
      page.on("response", (r) => { if (r.status() >= 400) erreurs.push(`HTTP ${r.status()} ${r.url().split("/").pop().slice(0, 60)}`); });

      await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v),
        `sb-${V.REF}-auth-token`, JSON.stringify(session));
      await page.goto(`${SITE}/${chemin}`, { waitUntil: "networkidle2", timeout: 60000 });
      await pause(3500);
      await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: true });

      const m = await mesures(page);
      const txt = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").split("\n").slice(0, 10).join(" | "));
      console.log(`\n### ${titre}  (${chemin})`);
      console.log("  ecran :", txt.slice(0, 240));
      if (m.largeur.scroll > m.largeur.client + 1) { soucis++; console.log(`  ⚠ DEBORDEMENT ${m.largeur.scroll} > ${m.largeur.client} :`, m.hors.join(" ")); }
      if (m.fantomes.length) { soucis++; console.log("  ⚠ `hidden` SANS EFFET :", m.fantomes.join(" ")); }
      if (m.petits.length) console.log("  · texte < 12px :", m.petits.map((x) => `${x.px}px « ${x.t} »`).join(" · "));
      if (erreurs.length) { soucis++; console.log("  ⚠ ERREURS :", [...new Set(erreurs)].slice(0, 4).join(" | ")); }
      await page.close();
    }
  } finally {
    await nav.close();
  }
  console.log(`\n=== ${PAGES.length} pages · ${soucis} page(s) avec un defaut mesurable ===`);
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
