// CAPTURES DE REFERENCE DE L'APPLI CLUBBEUR (boutique, page d'un bar, story),
// pour dessiner l'apercu du parcours gerant a l'identique.
//
//   VN_CAPTURES=dossier node outils/captures_ref_clubbeur.cjs
//
// Compte jetable supprime a la fin.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = process.env.VN_CAPTURES || "outils/pages-ref-clubbeur";
fs.mkdirSync(DOSSIER, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

(async () => {
  let compte = null, navigateur = null;
  try {
    compte = await V.compteJetable("ref", `${SITE}/app-preview.html`);
    V.sql(`insert into public.users (id, handle, email, profile_proof_path) values ('${compte.uid}', 'ref_${compte.uid.slice(0, 6)}', '${compte.email}', 'e2e/aucune')
           on conflict (id) do update set handle = excluded.handle, profile_proof_path = excluded.profile_proof_path;
           insert into public.welcome_bonuses (user_id, amount) values ('${compte.uid}', 50) on conflict do nothing;`);
    navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--hide-scrollbars"] });
    const page = await navigateur.newPage();
    await page.setUserAgent(IPHONE);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((id) => {
      try {
        localStorage.setItem("vn_stat_installe", "1");
        localStorage.setItem("vn_parcours_fini", id);
        localStorage.setItem("vn_notif_report", String(Date.now() + 864e5));
      } catch (e) {}
    }, compte.uid);
    await page.goto(compte.lien, { waitUntil: "networkidle2" });
    await pause(2500);
    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(5000);
    const clic = (s) => page.evaluate((x) => { const e = document.querySelector(x); if (e) e.click(); return !!e; }, s);
    await clic("#tab-boutique");
    await pause(2500);
    await page.screenshot({ path: `${DOSSIER}/1-boutique.png` });
    await clic(".bar-couverture");
    await pause(2500);
    await page.screenshot({ path: `${DOSSIER}/2-bar.png` });
    await page.evaluate(() => { const d = document.getElementById("vb-defile"); if (d) d.scrollTop = 420; });
    await pause(1200);
    await page.screenshot({ path: `${DOSSIER}/3-bar-recompenses.png` });
    await page.evaluate(() => { const d = document.getElementById("vb-defile"); if (d) d.scrollTop = 99999; });
    await pause(800);
    await page.screenshot({ path: `${DOSSIER}/4-bar-bas.png` });
    console.log("ok", DOSSIER);
  } catch (e) {
    console.log("plantage", e.message);
  } finally {
    if (navigateur) await navigateur.close();
    if (compte) await V.supprimerCompte(compte.uid).catch(() => {});
  }
})();
