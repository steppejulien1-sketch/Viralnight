// LA PAGE « STORY VALIDEE » DE L'APPLI CLUBBEUR, EN CAPTURES.
//
//   node outils/story_validee_apercu.cjs
//   VN_URL=http://127.0.0.1:4173 node outils/story_validee_apercu.cjs
//
// Sortie : outils/pages-story-validee/*.png, a plusieurs instants (entree,
// comptage, fin, apres « Continuer »). Rien n'est lu ni verse :
// window.noctifyStoryValidee pose la page directement.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = `${__dirname}/pages-story-validee`;
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
    await page.evaluate(() => window.noctifyStoryValidee(120, "Mirano", 1));
    const instants = [[350, "1-entree"], [1000, "2-comptage"], [2400, "3-fini"]];
    let ecoule = 0;
    for (const [t, nom] of instants) {
      await pause(t - ecoule);
      ecoule = t;
      await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
      console.log("  " + nom);
    }
    const chiffre = await page.$eval("#vv-gain", (e) => e.textContent);
    const sous = await page.$eval("#vv-sous", (e) => e.textContent);
    await page.evaluate(() => window.noctifyStoryValidee(215, "Mirano", 2));
    await pause(2400);
    await page.screenshot({ path: `${DOSSIER}/4-deux-stories.png` });
    await page.click("#vv-btn");
    await pause(700);
    await page.screenshot({ path: `${DOSSIER}/5-apres-continuer.png` });
    const cachee = await page.$eval("#vue-validee", (e) => e.hidden);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(JSON.stringify({ erreurs, debord, chiffre, sous, cachee }));
  } finally {
    await navigateur.close();
  }
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
