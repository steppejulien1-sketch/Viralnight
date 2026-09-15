// LA PAGE « STORY VALIDEE », DE BOUT EN BOUT, AVEC UN COMPTE JETABLE.
//
//   node outils/story_validee_e2e.cjs
//   VN_URL=http://127.0.0.1:4173 node outils/story_validee_e2e.cjs
//
// 1. compte jetable, capture de profil deja posee (pas d'etape capture) ;
// 2. deux stories validees en base (100 + 15 points, au Mirage) ;
// 3. connexion par le code : la page doit monter seule avec +115 ;
// 4. « Continuer », rechargement : elle ne revient PAS ;
// 5. une troisieme story validee pendant que l'appli est ouverte : elle
//    monte au retour au premier plan (visibilitychange).
// Le compte est supprime a la fin, quoi qu'il arrive.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("../../06-pwa-clubbeurs/outils/lib_vn.cjs");

const SITE = process.env.VN_URL || "https://viralnight-koif.vercel.app";
const DOSSIER = `${__dirname}/pages-story-validee-e2e`;
const MIRAGE = "ff1abccb-adeb-496a-a8db-16706a9d467b";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  const bilan = {};
  let compte = null;
  const navigateur = await puppeteer.launch({ executablePath: V.CHROME, headless: "new", args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  try {
    compte = await V.compteJetable("validee", `${SITE}/app-preview.html`);
    const uid = compte.uid;
    const handle = "e2e_" + uid.slice(0, 8);
    V.sql(`insert into public.users (id, handle, profile_proof_path) values ('${uid}', '${handle}', 'e2e/${uid}.png')
           on conflict (id) do update set profile_proof_path = excluded.profile_proof_path;
           insert into public.story_events (user_id, club_id, base_points, awarded_points, verified, kind, review_status, reviewed_at)
           values ('${uid}', '${MIRAGE}', 100, 100, true, 'story', 'validee', now() - interval '2 hours'),
                  ('${uid}', '${MIRAGE}', 15, 15, true, 'story', 'validee', now() - interval '1 hour'),
                  ('${uid}', '${MIRAGE}', 100, 0, false, 'story', 'refusee', now());`);

    const page = await navigateur.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((id) => {
      try {
        localStorage.setItem("vn_stat_jour", new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
        localStorage.setItem("vn_stat_installe", "1");
        localStorage.setItem("vn_parcours_fini", id); // cadeau deja traite : pas de page bienvenue
      } catch (e) {}
    }, uid);
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => { if (/story validee/.test(m.text())) erreurs.push(m.text()); });

    await page.goto(`${SITE}/app-preview.html?app=1&cb=${Date.now()}`, { waitUntil: "networkidle2" });
    await pause(1200);
    const [st, lien] = await V.admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email: compte.email });
    const code = lien && (lien.email_otp || (lien.properties && lien.properties.email_otp));
    if (st >= 400 || !code) throw new Error("pas de code");
    await page.evaluate((a) => window.noctifyParcours("code", a), compte.email);
    await page.waitForSelector("#ob-code", { visible: true });
    await pause(600);
    await page.type("#ob-code", code);

    // La page doit monter seule
    bilan.montee = await page.waitForFunction(() => !document.querySelector("#vue-validee").hidden, { timeout: 20000 }).then(() => true, () => false);
    await pause(2400);
    await page.screenshot({ path: `${DOSSIER}/1-a-l-ouverture.png` });
    bilan.titre = await page.$eval("#vv-titre", (e) => e.textContent);
    bilan.chiffre = await page.$eval("#vv-gain", (e) => e.textContent);
    bilan.sous = await page.$eval("#vv-sous", (e) => e.textContent);
    await page.click("#vv-btn");
    await pause(800);
    await page.screenshot({ path: `${DOSSIER}/2-apres-continuer.png` });

    // Rechargement : plus rien
    await page.reload({ waitUntil: "networkidle2" });
    await pause(5000);
    bilan.revientApresRechargement = await page.$eval("#vue-validee", (e) => !e.hidden);

    // Une nouvelle story validee, l'appli ouverte : au retour au premier plan
    V.sql(`insert into public.story_events (user_id, club_id, base_points, awarded_points, verified, kind, review_status, reviewed_at)
           values ('${uid}', '${MIRAGE}', 100, 100, true, 'story', 'validee', now());`);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    bilan.monteAuRetour = await page.waitForFunction(() => !document.querySelector("#vue-validee").hidden, { timeout: 10000 }).then(() => true, () => false);
    await pause(2400);
    bilan.chiffreRetour = await page.$eval("#vv-gain", (e) => e.textContent);
    await page.screenshot({ path: `${DOSSIER}/3-au-retour.png` });
    bilan.erreurs = erreurs;
    console.log(JSON.stringify(bilan, null, 2));
  } finally {
    await navigateur.close();
    if (compte) await V.supprimerCompte(compte.uid).catch(() => {});
  }
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
