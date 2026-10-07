// Les 4 ecrans de la decouverte de l'appli gerants (07/10/2026).
//   VN_CAPTURES=dossier VN_TAILLE=390x844 node outils/decouverte_gerant.cjs
const fs = require("fs");
const puppeteer = require("puppeteer-core");
const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = process.env.VN_CAPTURES || `${__dirname}/pages-decouverte`;
const [L, H] = (process.env.VN_TAILLE || "390x844").split("x").map(Number);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(DOSSIER, { recursive: true });
(async () => {
  const nav = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--hide-scrollbars"] });
  const page = await nav.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.setViewport({ width: L, height: H, deviceScaleFactor: 2, isMobile: L < 600, hasTouch: L < 600 });
  await page.goto(`${SITE}/club-app.html?decouverte=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
  await pause(2500);
  await page.screenshot({ path: `${DOSSIER}/1.png` });
  for (const n of [2, 3, 4]) {
    await page.click("#nki-suite"); await pause(n === 2 ? 1200 : 900);
    if (n === 3) { await page.$eval("#nki-range", (r) => { r.value = 120; r.dispatchEvent(new Event("input")); }); await pause(300); }
    await page.screenshot({ path: `${DOSSIER}/${n}.png` });
  }
  console.log("visible:", await page.$eval("#nki", (e) => !e.hidden && getComputedStyle(e).display), "erreurs:", JSON.stringify(erreurs));
  await nav.close();
})();
