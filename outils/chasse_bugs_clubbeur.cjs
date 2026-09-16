// CHASSE AUX BUGS DE L'APPLI CLUBBEUR, AVEC UN COMPTE JETABLE (prod par defaut).
//
//   node outils/chasse_bugs_clubbeur.cjs
//
// Ouvre chaque onglet, chaque ligne du profil et des reglages, et releve ce
// qu'une capture ne montre pas : erreurs JavaScript, erreurs console,
// requetes en echec (>= 400) et ecrans qui ne s'ouvrent pas. Le compte est
// supprime a la fin, quoi qu'il arrive.

const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const CAPTURES = process.env.VN_CAPTURES || "";
const fs = require("fs");
if (CAPTURES) fs.mkdirSync(CAPTURES, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

(async () => {
  const bilan = { etapes: [], erreursJs: [], console: [], requetes: [] };
  let compte = null, navigateur = null;
  let etape = "demarrage";
  try {
    compte = await V.compteJetable("chasse", `${SITE}/app-preview.html`);
    const handle = "chasse_" + compte.uid.slice(0, 6);
    V.sql(`insert into public.users (id, handle, email, profile_proof_path) values ('${compte.uid}', '${handle}', '${compte.email}', 'e2e/aucune')
           on conflict (id) do update set handle = excluded.handle, profile_proof_path = excluded.profile_proof_path;`);
    // VN_CADEAU=1 : un compte « installe » -- bienvenue deja prise, un scan au
    // Mirage et 450 points -- pour voir le cadeau du jour et une boutique
    // echangeable sur les captures.
    if (process.env.VN_CADEAU) {
      V.sql(`insert into public.welcome_bonuses (user_id, amount) values ('${compte.uid}', 50) on conflict do nothing;
             insert into public.point_grants (user_id, club_id, amount, unlocks_at, released, source)
               select '${compte.uid}', id, 450, now(), false, 'scan' from public.clubs where slug = 'mirage-brussels';
             select public.release_due_points('${compte.uid}');`);
    }

    navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--hide-scrollbars"] });
    const contexte = navigateur.defaultBrowserContext();
    const page = await navigateur.newPage();
    await page.setUserAgent(IPHONE);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((id) => {
      try {
        localStorage.setItem("vn_stat_installe", "1");
        localStorage.setItem("vn_parcours_fini", id);
        localStorage.setItem("vn_notif_report", String(Date.now() + 864e5));
      } catch (e) {}
    }, compte.uid);
    page.on("pageerror", (e) => bilan.erreursJs.push(`[${etape}] ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") bilan.console.push(`[${etape}] ${m.text().slice(0, 200)}`); });
    page.on("response", (r) => {
      const u = r.url();
      if (r.status() >= 400 && !/google-analytics|googletagmanager|favicon/.test(u)) bilan.requetes.push(`[${etape}] ${r.status()} ${r.request().method()} ${u.slice(0, 160)}`);
    });
    page.on("requestfailed", (r) => { if (!/google|analytics/.test(r.url())) bilan.requetes.push(`[${etape}] ECHEC ${r.url().slice(0, 160)} ${r.failure()?.errorText}`); });

    etape = "connexion";
    await page.goto(compte.lien, { waitUntil: "networkidle2" });
    await pause(2500);
    // En local, la session posee sur le domaine de prod est recopiee.
    if (!SITE.includes("vercel.app")) {
      const cles = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("sb-")).map((k) => [k, localStorage.getItem(k)])));
      await page.goto(`${SITE}/app-preview.html?app=1`, { waitUntil: "domcontentloaded" });
      await page.evaluate((c) => Object.entries(c).forEach(([k, v]) => localStorage.setItem(k, v)), cles);
    }
    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(5000);

    const visible = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "absent";
      const st = getComputedStyle(el);
      return !el.hidden && st.display !== "none" && st.visibility !== "hidden" && el.getClientRects().length > 0;
    }, sel);
    const cliquer = async (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
    const fermerTout = () => page.evaluate(() => {
      document.querySelectorAll(".vue-plein, [id^='vue-']").forEach((v) => { if (v.id !== "vue-accueil" && v.id !== "vue-profil") v.hidden = true; });
      document.querySelector(".sheet-close, #sup-fermer")?.click();
    });

    // Ce qu'une capture ne dit pas : un element plus large que l'ecran,
    // une image cassee, un texte coupe au milieu d'un mot.
    const mesurer = () => page.evaluate(() => {
      const W = window.innerWidth;
      const deborde = [...document.querySelectorAll("body *")].filter((e) => {
        if (e.closest("svg, .maplibregl-map, [hidden], #splash, .vue-accueil.masque") || !e.getClientRects().length) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > W + 2 && getComputedStyle(e).position !== "fixed";
      }).slice(0, 4).map((e) => (e.id ? "#" + e.id : e.className && String(e.className).slice(0, 40)) + " " + Math.round(e.getBoundingClientRect().right));
      const images = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getClientRects().length && i.src).map((i) => i.src.slice(-60));
      return { deborde, images };
    });
    async function essai(nom, sel, attendu) {
      etape = nom;
      const ok = await cliquer(sel);
      await pause(2200);
      const vu = attendu ? await visible(attendu) : null;
      const m = await mesurer();
      bilan.etapes.push({ nom, clic: ok, ecran: vu, ...(m.deborde.length ? { deborde: m.deborde } : {}), ...(m.images.length ? { imagesCassees: m.images } : {}) });
      if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/${String(bilan.etapes.length).padStart(2, "0")}-${nom.replace(/\s+/g, "-")}.png` });
    }

    await essai("onglet boutique", "#tab-boutique");
    // Le bon d'une recompense echangee (seulement avec VN_CADEAU : il faut des points).
    if (process.env.VN_CADEAU && CAPTURES) {
      etape = "echange";
      await page.evaluate(() => {
        const s = [...document.querySelectorAll(".bar-section")].find((x) => /mira/i.test(x.querySelector(".drop-titre")?.textContent || ""));
        const c = s && [...s.querySelectorAll(".carte-reco")].find((e) => /cocktail/i.test(e.textContent));
        c?.click();
      });
      await pause(1500);
      await page.screenshot({ path: `${CAPTURES}/01b-fiche-recompense.png` });
      await page.evaluate(() => document.getElementById("sh-cta")?.click());
      await pause(3500);
      await page.screenshot({ path: `${CAPTURES}/01c-bon.png` });
      await page.evaluate(() => window.noctifyFermerFeuille && window.noctifyFermerFeuille());
      await pause(800);
    }
    await essai("onglet story", "#tab-story");
    // Le bas de la page Story (la mention a copier), cache sous les onglets.
    if (CAPTURES) {
      await page.evaluate(() => document.querySelector(".st-carte")?.scrollIntoView({ block: "center" }));
      await pause(800);
      await page.screenshot({ path: `${CAPTURES}/02b-story-mention.png` });
    }
    await essai("onglet carte", "#tab-carte");
    await essai("onglet profil", "#tab-profil");
    for (const [nom, sel] of [["fidelite", "#pf-fidelite"], ["gagner", "#pf-gagner"], ["inviter", "#pf-inviter"], ["aide", "#pf-aide"], ["avis", "#pf-avis"], ["a propos", "#pf-apropos"], ["devenir club", "#pf-devenir-club"], ["reglages", "#pf-reglages"]]) {
      await essai(nom, sel);
      const ouvert = await page.evaluate(() => [...document.querySelectorAll("[id^='vue-']")].filter((v) => !v.hidden && v.getClientRects().length && v.id !== "vue-accueil").map((v) => v.id));
      bilan.etapes[bilan.etapes.length - 1].vues = ouvert;
      if (nom !== "reglages") { await page.evaluate(() => window.noctifyFermerFeuille && window.noctifyFermerFeuille()); await fermerTout(); await cliquer("#tab-profil"); await pause(800); }
    }
    etape = "reglages suppression";
    await cliquer("#rg-supprimer-compte");
    await pause(1500);
    if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/13-suppression.png` });
    bilan.etapes.push({ nom: "feuille suppression", garder: await visible("#sup-garder"), supprimer: await visible("#sup-supprimer") });
    await cliquer("#sup-fermer");
    await pause(800);

    etape = "inviter partage";
    bilan.etapes.push({ nom: "lien invitation", lien: await page.evaluate(() => document.getElementById("va-lien")?.textContent) });
  } catch (e) {
    bilan.plantage = `[${etape}] ${e.message}`;
  } finally {
    if (navigateur) await navigateur.close();
    if (compte) await V.supprimerCompte(compte.uid);
    console.log(JSON.stringify(bilan, null, 1));
  }
})();
