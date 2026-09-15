// LA PAGE « CADEAU RECUPERE » DE L'INSCRIPTION, EN CAPTURES.
//
//   node outils/cadeau_bienvenue_apercu.cjs
//   VN_URL=http://127.0.0.1:5173 node outils/cadeau_bienvenue_apercu.cjs
//
// Sortie : outils/pages-cadeau-bienvenue/*.png, a plusieurs instants du
// deroule (le titre part, le chiffre monte et compte, fin). Rien n'est verse :
// window.noctifyCadeau pose la page sans appeler welcome_bonus.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = `${__dirname}/pages-cadeau-bienvenue`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  const navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  try {
    const page = await navigateur.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("vn_stat_jour", new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
        localStorage.setItem("vn_stat_installe", "1");
      } catch (e) {}
    });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1200);
    await page.evaluate(() => window.noctifyParcours("bienvenue"));
    await pause(2600);
    await page.screenshot({ path: `${DOSSIER}/0-bienvenue.png` });
    await page.evaluate(() => window.noctifyCadeau(50));
    const instants = [[500, "1-premieres-pieces"], [900, "2-pluie"], [1300, "3-rafale"], [2600, "4-fini"]];
    let ecoule = 0;
    for (const [t, nom] of instants) {
      await pause(t - ecoule);
      ecoule = t;
      await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
      console.log("  " + nom);
    }
    const debord = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(JSON.stringify({ erreurs, debord, chiffre: await page.$eval("#ob-bv-gain", (e) => e.textContent) }));
  } finally {
    await navigateur.close();
  }
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
