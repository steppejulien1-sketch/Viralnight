// L'ecran « Capture ton profil » tel qu'on le voit sur ORDINATEUR (07/10/2026).
//   VN_URL=https://viralnight-koif.vercel.app VN_CAPTURES=dossier VN_TAILLE=1440x900 node outils/capture_parcours_ordi.cjs
// Compte jetable cree puis supprime.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");
const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = process.env.VN_CAPTURES || `${__dirname}/pages-ordi`;
const [L, H] = (process.env.VN_TAILLE || "1440x900").split("x").map(Number);
const MOBILE = L < 600;
const BON = path.resolve(__dirname, "../public/story-exemples/exemple-profil-sombre.webp");
const MAUVAIS = path.resolve(__dirname, "../public/ambiance/bienvenue.webp");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(DOSSIER, { recursive: true });
(async () => {
  let compte = null, nav = null;
  try {
    nav = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--hide-scrollbars"] });
    const page = await nav.newPage();
    await page.setViewport({ width: L, height: H, deviceScaleFactor: 1, isMobile: MOBILE, hasTouch: MOBILE });
    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1500);
    await page.screenshot({ path: `${DOSSIER}/1-accueil.png` });
    compte = await V.compteJetable("ordi", `${SITE}/app-preview.html`);
    const [, lien] = await V.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email: compte.email });
    const code = lien.email_otp || lien.properties.email_otp;
    await page.evaluate((a) => window.noctifyParcours("code", a), compte.email);
    await page.waitForSelector('.ob-etape.actif[data-etape="code"]', { timeout: 15000 });
    await pause(700);
    await page.type("#ob-code", code);
    await page.waitForSelector('.ob-etape.actif[data-etape="capture"]', { timeout: 20000 });
    await pause(3000);
    await page.screenshot({ path: `${DOSSIER}/2-capture.png` });
    const champ = await page.$("#ob-capture");
    await champ.uploadFile(MAUVAIS);
    await pause(9000);
    await page.screenshot({ path: `${DOSSIER}/3-mauvaise.png` });
    await champ.uploadFile(BON);
    await pause(12000);
    await page.screenshot({ path: `${DOSSIER}/4-bonne.png` });
  } catch (e) {
    console.error("ERREUR", e.message);
  } finally {
    if (nav) await nav.close();
    if (compte) await V.supprimerCompte(compte.uid);
  }
})();
