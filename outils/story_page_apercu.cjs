// L'ONGLET STORY (animation du telephone) ET LA PAGE « AMI INSCRIT », EN CAPTURES.
//
//   VN_URL=http://127.0.0.1:4173 node outils/story_page_apercu.cjs
//
// Sortie : outils/pages-story-page/*.png. Rien n'est lu ni verse.
const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");
const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = `${__dirname}/pages-story-page`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  const navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  try {
    const page = await navigateur.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1500);
    await page.evaluate(() => document.getElementById("vue-accueil").classList.add("masque"));
    await page.evaluate(() => document.getElementById("tab-story").click());
    let t = 0;
    for (const [ms, nom] of [[2900, "1-partagee"], [3600, "2-gain"], [5200, "3-fin"]]) {
      await pause(ms - t); t = ms;
      await page.screenshot({ path: `${DOSSIER}/${nom}.png` });
    }
    await page.evaluate(() => window.noctifyAmiInscrit(100, "nina.b", 1));
    await pause(2600);
    await page.screenshot({ path: `${DOSSIER}/4-ami-inscrit.png` });
    console.log(JSON.stringify({ erreurs, titre: await page.$eval("#vv-titre", (e) => e.textContent) }));
  } finally {
    await navigateur.close();
  }
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
