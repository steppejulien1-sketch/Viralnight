// AUDIT DESIGN DE L'APPLI CLUBBEUR : une capture par ecran, avec un compte.
//   VN_URL=http://127.0.0.1:5199 VN_CAPTURES=dossier node outils/audit_design_clubbeur.cjs
// Compte jetable cree puis supprime (finally).
const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");
const SITE = process.env.VN_URL || V.PROD;
const DOSSIER = process.env.VN_CAPTURES || `${__dirname}/pages-audit`;
fs.mkdirSync(DOSSIER, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let compte = null, nav = null;
  const erreurs = [];
  try {
    compte = await V.compteJetable("audit", V.PROD + "/app-preview.html");
    V.sql(`insert into public.users (id, handle, email, profile_proof_path) values ('${compte.uid}', 'camille.drd', '${compte.email}', 'apercu/aucune') on conflict (id) do nothing;`);
    await V.admin(`/auth/v1/admin/users/${compte.uid}`, "PUT", { user_metadata: { full_name: "Camille Durand" } });
    // Le lien magique, suivi sans redirection : on recupere les jetons.
    const r = await fetch(compte.lien, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    const hash = loc.slice(loc.indexOf("#"));
    nav = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
    const page = await nav.newPage();
    page.on("pageerror", (e) => erreurs.push(String(e.message).slice(0, 200)));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${SITE}/app-preview.html?app=1${hash}`, { waitUntil: "networkidle2" });
    await pause(5000);
    await page.evaluate(() => document.querySelector("#vue-accueil")?.classList.add("masque"));
    await page.evaluate(() => document.querySelector(".mj-oui")?.click());
    await pause(2000);
    await page.evaluate(() => document.querySelector(".ob-bv-btn")?.click());
    await pause(5000);
    await page.evaluate(() => document.querySelector(".ob-bv-btn")?.click());
    await pause(4000);
    const snap = async (nom) => { await pause(1500); await page.screenshot({ path: `${DOSSIER}/${nom}.png` }); console.log(nom); };
    const clic = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);

    await page.evaluate(() => document.querySelector("#notif-invite-non")?.click());
    await snap("01-ouverture");
    await clic("#tab-carte"); await pause(3000); await snap("02-carte");
    // Fiche d'un lieu de demo
    { const ms = await page.$$(".maplibregl-marker"); if (ms[1]) await ms[1].click(); else console.log("pas de marqueur"); }
    await snap("03-fiche");
    console.log("carte avis Google :", await page.evaluate(() => { const b = document.querySelector(".club-avis2"); if (b) b.scrollIntoView({ block: "center" }); return b ? b.textContent.trim() : "ABSENTE"; }));
    await snap("03b-fiche-bas");
    await page.evaluate(() => { const sh = document.querySelector(".sheet.up, .sheet.fiche-club"); if (sh) sh.scrollTop = sh.scrollHeight; });
    await snap("03c-fiche-tout-en-bas");
    await page.evaluate(() => window.noctifyFermerFeuille?.());
    await clic("#tab-story"); await pause(2500); await snap("07-story");
    await page.evaluate(() => { const v = document.querySelector("#vue-story"); if (v) v.scrollTop = v.scrollHeight; });
    await snap("07b-story-bas");
    await clic("#tab-profil"); await pause(2500); await snap("08-profil");
    await page.evaluate(() => { const v = document.querySelector("#vue-profil"); if (v) v.scrollTop = v.scrollHeight; });
    await snap("08b-profil-bas");
    await page.evaluate(() => { const v = document.querySelector("#vue-profil"); if (v) v.scrollTop = 0; });
    await page.evaluate(() => document.querySelector(".pf-item")?.click()); await snap("09-historique");
    await page.evaluate(() => window.noctifyFermerFeuille?.()); await page.evaluate(() => document.querySelector(".pg-fermer:not([hidden]), .va-close")?.click());
    await page.evaluate(() => document.querySelector(".pf-gain")?.click()); await snap("10-gagner");
    await page.evaluate(() => document.querySelectorAll(".pg-fermer, .va-close").forEach((b) => b.offsetParent && b.click()));
    await clic("#tab-boutique"); await pause(2500); await snap("04-boutique");
    await page.evaluate(() => { const v = document.querySelector("#vue-boutique"); if (v) v.scrollTop = 700; });
    await snap("04b-boutique-bas");
    await page.evaluate(() => { const v = document.querySelector("#vue-boutique"); if (v) v.scrollTop = 0; });
    { const h = await page.evaluateHandle(() => [...document.querySelectorAll("#vue-boutique *")].find((e) => e.children.length === 0 && e.textContent.trim() === "Velours")); const el = h.asElement(); if (el) await el.click(); else console.log("pas de Velours"); }
    await snap("05-boutique-lieu");
    console.log(await page.evaluate(() => [...new Set([...document.querySelectorAll("button, [role=button]")].filter((e) => e.offsetParent).map((e) => e.className))].slice(0, 40).join(" | ")));
    { const h = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((e) => e.offsetParent && /points/.test(e.textContent) && e.getBoundingClientRect().top > 300)); const el = h.asElement(); if (el) await el.click(); }
    await snap("06-recompense");
    await page.evaluate(() => window.noctifyFermerFeuille?.());
  } catch (e) {
    console.error("ERREUR", e.message);
  } finally {
    if (nav) await nav.close();
    if (compte) await V.supprimerCompte(compte.uid);
    console.log("erreurs JS:", JSON.stringify(erreurs));
  }
})();
