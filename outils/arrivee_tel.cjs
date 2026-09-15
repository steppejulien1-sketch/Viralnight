// L'arrivee du telephone sur l'ecran « Capture ton profil », image par image.
//   VN_URL=http://127.0.0.1:4173 node outils/arrivee_tel.cjs
const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");
const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const D = `${__dirname}/pages-arrivee`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(D, { recursive: true });
  for (const f of fs.readdirSync(D)) fs.rmSync(`${D}/${f}`, { force: true });
  const nav = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  try {
    const page = await nav.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1500);
    await page.evaluate(() => window.noctifyParcours("capture"));
    let t = 0;
    for (const ms of [150, 380, 620, 850, 1150, 1500, 2300, 3200]) {
      await pause(ms - t); t = ms;
      await page.screenshot({ path: `${D}/${String(ms).padStart(4, "0")}.png` });
    }
    const etat = await page.evaluate(() => {
      const v = document.querySelector(".ob-capture-etape .ob-cap-visuel");
      return { animations: v.getAnimations().map((a) => a.animationName || "?"), classe: v.parentElement.className };
    });
    console.log(JSON.stringify(etat));
  } finally { await nav.close(); }
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
